"""
Smart Bins API — CRUD + spatial queries.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from geoalchemy2.shape import from_shape, to_shape
from geoalchemy2.functions import ST_DWithin, ST_GeogFromWKB
from shapely.geometry import Point

from app import db
from app.models import SmartBin, Zone
from app.schemas import SmartBinSchema, SmartBinCreateSchema

bins_bp = Blueprint("bins", __name__)
bin_schema = SmartBinSchema()
bins_schema = SmartBinSchema(many=True)
bin_create_schema = SmartBinCreateSchema()


def _enrich(bin_obj: SmartBin) -> dict:
    """Add latitude/longitude from PostGIS geometry to the dump."""
    data = bin_schema.dump(bin_obj)
    if bin_obj.location:
        point = to_shape(bin_obj.location)
        data["latitude"] = point.y
        data["longitude"] = point.x
    return data


@bins_bp.route("", methods=["GET"])
@jwt_required()
def list_bins():
    """List all bins, optionally filter by zone_id or status."""
    query = SmartBin.query

    zone_id = request.args.get("zone_id", type=int)
    status  = request.args.get("status")

    if zone_id:
        query = query.filter_by(zone_id=zone_id)
    if status:
        query = query.filter_by(status=status)

    bins = query.order_by(SmartBin.label).all()
    return jsonify([_enrich(b) for b in bins]), 200


@bins_bp.route("/<string:bin_id>", methods=["GET"])
@jwt_required()
def get_bin(bin_id):
    """Get a single bin by ID."""
    smart_bin = SmartBin.query.get_or_404(bin_id)
    return jsonify(_enrich(smart_bin)), 200


@bins_bp.route("", methods=["POST"])
@jwt_required()
def create_bin():
    """Create a new smart bin (admin only)."""
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403

    data = bin_create_schema.load(request.get_json())

    new_bin = SmartBin(
        label=data["label"],
        zone_id=data.get("zone_id"),
        location=from_shape(Point(data["longitude"], data["latitude"]), srid=4326),
        address=data.get("address"),
        capacity_liters=data.get("capacity_liters", 240),
        bin_type=data.get("bin_type", "general"),
    )
    db.session.add(new_bin)
    db.session.commit()

    return jsonify(_enrich(new_bin)), 201


@bins_bp.route("/<string:bin_id>", methods=["PUT"])
@jwt_required()
def update_bin(bin_id):
    """Update bin details (admin only)."""
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403

    smart_bin = SmartBin.query.get_or_404(bin_id)
    data = request.get_json()

    for field in ("label", "address", "bin_type", "capacity_liters", "zone_id", "status"):
        if field in data:
            setattr(smart_bin, field, data[field])

    if "latitude" in data and "longitude" in data:
        smart_bin.location = from_shape(Point(data["longitude"], data["latitude"]), srid=4326)

    db.session.commit()
    return jsonify(_enrich(smart_bin)), 200


@bins_bp.route("/<string:bin_id>", methods=["DELETE"])
@jwt_required()
def delete_bin(bin_id):
    """Delete a bin (admin only)."""
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
    """Find bins within a radius (metres) of a GPS point.
    Query params: lat, lng, radius (default 1000 m)
    """
    lat    = request.args.get("lat", type=float)
    lng    = request.args.get("lng", type=float)
    radius = request.args.get("radius", 1000, type=int)

    if lat is None or lng is None:
        return jsonify({"error": "lat and lng are required"}), 400

    point = from_shape(Point(lng, lat), srid=4326)
    bins = SmartBin.query.filter(
        ST_DWithin(
            ST_GeogFromWKB(SmartBin.location),
            ST_GeogFromWKB(point),
            radius,
        )
    ).all()

    return jsonify([_enrich(b) for b in bins]), 200
