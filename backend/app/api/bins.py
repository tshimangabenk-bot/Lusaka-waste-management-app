"""
Smart Bins API — CRUD + proximity search (Haversine, no PostGIS required).
"""
import math
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt

from app import db
from app.models import SmartBin, Zone
from app.schemas import SmartBinSchema, SmartBinCreateSchema

bins_bp = Blueprint("bins", __name__)
bin_schema  = SmartBinSchema()
bins_schema = SmartBinSchema(many=True)
bin_create_schema = SmartBinCreateSchema()


def _haversine_m(lat1, lon1, lat2, lon2) -> float:
    """Return distance in metres between two GPS points."""
    R    = 6_371_000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a    = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


@bins_bp.route("", methods=["GET"])
@jwt_required()
def list_bins():
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
def get_bin(bin_id):
    return jsonify(bin_schema.dump(SmartBin.query.get_or_404(bin_id))), 200


@bins_bp.route("", methods=["POST"])
@jwt_required()
def create_bin():
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
        capacity_liters=data.get("capacity_liters", 240),
        bin_type=data.get("bin_type", "general"),
    )
    db.session.add(new_bin)
    db.session.commit()
    return jsonify(bin_schema.dump(new_bin)), 201


@bins_bp.route("/<string:bin_id>", methods=["PUT"])
@jwt_required()
def update_bin(bin_id):
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403

    smart_bin = SmartBin.query.get_or_404(bin_id)
    data      = request.get_json()

    for field in ("label", "address", "bin_type", "capacity_liters", "zone_id", "status",
                  "latitude", "longitude", "fill_percentage"):
        if field in data:
            setattr(smart_bin, field, data[field])

    db.session.commit()
    return jsonify(bin_schema.dump(smart_bin)), 200


@bins_bp.route("/<string:bin_id>", methods=["DELETE"])
@jwt_required()
def delete_bin(bin_id):
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
    """Find bins within `radius` metres of (lat, lng) using Haversine."""
    lat    = request.args.get("lat",    type=float)
    lng    = request.args.get("lng",    type=float)
    radius = request.args.get("radius", 1000, type=int)

    if lat is None or lng is None:
        return jsonify({"error": "lat and lng are required"}), 400

    all_bins = SmartBin.query.all()
    nearby   = [
        bin_schema.dump(b) for b in all_bins
        if _haversine_m(lat, lng, b.latitude, b.longitude) <= radius
    ]
    return jsonify(nearby), 200
