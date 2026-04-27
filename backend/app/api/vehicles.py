"""
Fleet / Vehicles API — CRUD for waste-collection vehicles.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt

from app import db
from app.models import Vehicle
from app.schemas import VehicleSchema

vehicles_bp = Blueprint("vehicles", __name__)
vehicle_schema  = VehicleSchema()
vehicles_schema = VehicleSchema(many=True)


def _admin_required():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403
    return None


@vehicles_bp.route("", methods=["GET"])
@jwt_required()
def list_vehicles():
    status = request.args.get("status")
    query  = Vehicle.query
    if status:
        query = query.filter_by(status=status)
    return jsonify(vehicles_schema.dump(query.order_by(Vehicle.registration_no).all())), 200


@vehicles_bp.route("/<string:vehicle_id>", methods=["GET"])
@jwt_required()
def get_vehicle(vehicle_id):
    return jsonify(vehicle_schema.dump(Vehicle.query.get_or_404(vehicle_id))), 200


@vehicles_bp.route("", methods=["POST"])
@jwt_required()
def create_vehicle():
    err = _admin_required()
    if err:
        return err

    data = request.get_json() or {}
    if not data.get("registration_no") or not data.get("capacity_tons"):
        return jsonify({"error": "registration_no and capacity_tons are required"}), 400

    if Vehicle.query.filter_by(registration_no=data["registration_no"]).first():
        return jsonify({"error": "Registration number already exists"}), 409

    v = Vehicle(
        registration_no=data["registration_no"],
        vehicle_type=data.get("vehicle_type", "compactor"),
        capacity_tons=float(data["capacity_tons"]),
        status=data.get("status", "available"),
        assigned_driver=data.get("assigned_driver"),
    )
    db.session.add(v)
    db.session.commit()
    return jsonify(vehicle_schema.dump(v)), 201


@vehicles_bp.route("/<string:vehicle_id>", methods=["PUT"])
@jwt_required()
def update_vehicle(vehicle_id):
    err = _admin_required()
    if err:
        return err

    v    = Vehicle.query.get_or_404(vehicle_id)
    data = request.get_json() or {}

    for field in ("vehicle_type", "capacity_tons", "status", "assigned_driver", "registration_no"):
        if field in data:
            setattr(v, field, data[field])

    db.session.commit()
    return jsonify(vehicle_schema.dump(v)), 200


@vehicles_bp.route("/<string:vehicle_id>", methods=["DELETE"])
@jwt_required()
def delete_vehicle(vehicle_id):
    err = _admin_required()
    if err:
        return err

    v = Vehicle.query.get_or_404(vehicle_id)
    db.session.delete(v)
    db.session.commit()
    return jsonify({"message": "Vehicle deleted"}), 200
