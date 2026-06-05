"""
api/bins.py — Smart Bins API Blueprint.

Provides CRUD operations for SmartBin records plus a proximity search endpoint
that finds bins within a radius of a GPS coordinate.

All mutating endpoints (POST, PUT, DELETE) require admin role.
Read endpoints (GET) are open to any authenticated user.

Endpoints
---------
GET  /api/bins                  — list all bins (filterable by zone_id, status)
GET  /api/bins/<id>             — get a single bin by UUID
POST /api/bins                  — create a new bin (admin only)
PUT  /api/bins/<id>             — update bin fields (admin only)
DELETE /api/bins/<id>           — delete a bin (admin only)
GET  /api/bins/nearby           — bins within a radius of a GPS point

Spatial note
------------
PostGIS is NOT used.  Proximity search is implemented with pure Python
Haversine math (see _haversine_m).  This is acceptable for Lusaka's scale
(~400 bins city-wide) but would need DB-side indexing for larger deployments.
"""
import math
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt

from app import db
from app.models import SmartBin, Zone
from app.schemas import SmartBinSchema, SmartBinCreateSchema

bins_bp = Blueprint("bins", __name__)

# Schema instances — reused to avoid per-request construction overhead
bin_schema        = SmartBinSchema()
bins_schema       = SmartBinSchema(many=True)
bin_create_schema = SmartBinCreateSchema()


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance in metres between two GPS points.

    Uses the Haversine formula which is accurate to ~0.5% for distances
    up to a few hundred kilometres — sufficient for city-scale bin lookups.

    Parameters
    ----------
    lat1, lon1 : float  — reference point (e.g. the user's location)
    lat2, lon2 : float  — target point (e.g. a bin's GPS pin)

    Returns
    -------
    float — distance in metres
    """
    R    = 6_371_000          # Earth's mean radius in metres
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    # Haversine formula: a = sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlon/2)
    a    = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


@bins_bp.route("", methods=["GET"])
@jwt_required()
def list_bins():
    """
    List all smart bins, optionally filtered by zone_id or status.

    Query params:
        zone_id (int)  — filter to bins in a specific zone
        status  (str)  — filter by fill status: empty|low|medium|high|full|overflow

    Returns all matching bins ordered alphabetically by label.
    """
    query   = SmartBin.query
    zone_id = request.args.get("zone_id", type=int)
    status  = request.args.get("status")

    if zone_id:
        query = query.filter_by(zone_id=zone_id)
    if status:
        query = query.filter_by(status=status)

    return jsonify(bins_schema.dump(query.order_by(SmartBin.label).all())), 200


@bins_bp.route("/<string:bin_id>", methods=["GET"])
@jwt_required()
def get_bin(bin_id: str):
    """Return a single bin by UUID. Returns 404 if not found."""
    return jsonify(bin_schema.dump(SmartBin.query.get_or_404(bin_id))), 200


@bins_bp.route("", methods=["POST"])
@jwt_required()
def create_bin():
    """
    Create a new smart bin (admin only).

    Required body fields: label, latitude, longitude
    Optional: zone_id, address, capacity_liters, bin_type

    Returns the created bin with HTTP 201.
    """
    # Only admin users can add bins to the system
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403

    data    = bin_create_schema.load(request.get_json())
    new_bin = SmartBin(
        label=data["label"],
        zone_id=data.get("zone_id"),
        latitude=data["latitude"],
        longitude=data["longitude"],
        address=data.get("address"),
        capacity_liters=data.get("capacity_liters", 240),  # standard wheelie bin default
        bin_type=data.get("bin_type", "general"),
    )
    db.session.add(new_bin)
    db.session.commit()
    return jsonify(bin_schema.dump(new_bin)), 201


@bins_bp.route("/<string:bin_id>", methods=["PUT"])
@jwt_required()
def update_bin(bin_id: str):
    """
    Update one or more fields of an existing bin (admin only).

    Accepts any subset of the updatable fields; only provided keys are changed.
    Updatable fields: label, address, bin_type, capacity_liters, zone_id,
                      status, latitude, longitude, fill_percentage
    """
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403

    smart_bin = SmartBin.query.get_or_404(bin_id)
    data      = request.get_json()

    # Dynamically apply only the fields present in the request body
    for field in ("label", "address", "bin_type", "capacity_liters", "zone_id", "status",
                  "latitude", "longitude", "fill_percentage"):
        if field in data:
            setattr(smart_bin, field, data[field])

    db.session.commit()
    return jsonify(bin_schema.dump(smart_bin)), 200


@bins_bp.route("/<string:bin_id>", methods=["DELETE"])
@jwt_required()
def delete_bin(bin_id: str):
    """
    Delete a bin and cascade to its sensors, readings, and alerts (admin only).

    Cascades are defined in the model's ForeignKey ondelete settings.
    """
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403

    smart_bin = SmartBin.query.get_or_404(bin_id)
    db.session.delete(smart_bin)
    db.session.commit()
    return jsonify({"message": "Bin deleted"}), 200


@bins_bp.route("/nearby", methods=["GET"])
@jwt_required()
def nearby_bins():
    """
    Find bins within `radius` metres of a GPS coordinate using Haversine math.

    All bins are loaded into Python and filtered in-memory.
    This is acceptable for small fleets but consider DB-side spatial indexing
    (e.g. a bounding-box pre-filter) if the bin count grows beyond ~1 000.

    Query params:
        lat    (float, required) — latitude of the search centre
        lng    (float, required) — longitude of the search centre
        radius (int, default=1000) — search radius in metres

    Returns an array of bin objects within the radius (may be empty).
    """
    lat    = request.args.get("lat",    type=float)
    lng    = request.args.get("lng",    type=float)
    radius = request.args.get("radius", 1000, type=int)   # default 1 km

    if lat is None or lng is None:
        return jsonify({"error": "lat and lng are required"}), 400

    # Load all bins and filter by Haversine distance
    # TODO: add a bounding-box pre-filter to reduce memory usage at scale:
    #   lat_delta ≈ radius_m / 111_320
    #   lon_delta ≈ radius_m / (111_320 * cos(lat))
    all_bins = SmartBin.query.all()
    nearby   = [
        bin_schema.dump(b) for b in all_bins
        if _haversine_m(lat, lng, b.latitude, b.longitude) <= radius
    ]
    return jsonify(nearby), 200
