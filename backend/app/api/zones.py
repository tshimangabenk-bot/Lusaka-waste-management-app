"""
Zones API — CRUD for collection zones.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt

from app import db
from app.models import Zone
from app.schemas import ZoneSchema

zones_bp = Blueprint("zones", __name__)
zone_schema  = ZoneSchema()
zones_schema = ZoneSchema(many=True)


def _admin_required():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403
    return None


@zones_bp.route("", methods=["GET"])
@jwt_required()
def list_zones():
    return jsonify(zones_schema.dump(Zone.query.order_by(Zone.name).all())), 200


@zones_bp.route("/<int:zone_id>", methods=["GET"])
@jwt_required()
def get_zone(zone_id):
    zone = Zone.query.get_or_404(zone_id)
    data = zone_schema.dump(zone)
    data["bin_count"]    = zone.bins.count()
    data["report_count"] = zone.reports.count()
    return jsonify(data), 200


@zones_bp.route("", methods=["POST"])
@jwt_required()
def create_zone():
    err = _admin_required()
    if err:
        return err

    data = request.get_json() or {}
    if not data.get("name"):
        return jsonify({"error": "name is required"}), 400

    if Zone.query.filter_by(name=data["name"]).first():
        return jsonify({"error": "Zone name already exists"}), 409

    z = Zone(
        name=data["name"],
        population_est=data.get("population_est"),
        description=data.get("description"),
    )
    db.session.add(z)
    db.session.commit()
    return jsonify(zone_schema.dump(z)), 201


@zones_bp.route("/<int:zone_id>", methods=["PUT"])
@jwt_required()
def update_zone(zone_id):
    err = _admin_required()
    if err:
        return err

    zone = Zone.query.get_or_404(zone_id)
    data = request.get_json() or {}

    for field in ("name", "population_est", "description"):
        if field in data:
            setattr(zone, field, data[field])

    db.session.commit()
    return jsonify(zone_schema.dump(zone)), 200


@zones_bp.route("/<int:zone_id>", methods=["DELETE"])
@jwt_required()
def delete_zone(zone_id):
    err = _admin_required()
    if err:
        return err

    zone = Zone.query.get_or_404(zone_id)
    db.session.delete(zone)
    db.session.commit()
    return jsonify({"message": "Zone deleted"}), 200
