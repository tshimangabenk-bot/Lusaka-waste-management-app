"""
Drivers API — list and manage users with the 'collector' role.
Drivers are just User rows with role='collector'.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from werkzeug.security import generate_password_hash

from app import db
from app.models import User
from app.schemas import UserSchema

drivers_bp = Blueprint("drivers", __name__)
driver_schema  = UserSchema()
drivers_schema = UserSchema(many=True)


def _admin_required():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403
    return None


@drivers_bp.route("", methods=["GET"])
@jwt_required()
def list_drivers():
    """Return all active collectors/drivers."""
    drivers = (
        User.query
        .filter_by(role="collector", is_active=True)
        .order_by(User.first_name)
        .all()
    )
    return jsonify(drivers_schema.dump(drivers)), 200


@drivers_bp.route("/<string:driver_id>", methods=["GET"])
@jwt_required()
def get_driver(driver_id):
    driver = User.query.filter_by(id=driver_id, role="collector").first_or_404()
    return jsonify(driver_schema.dump(driver)), 200


@drivers_bp.route("", methods=["POST"])
@jwt_required()
def create_driver():
    """Create a new collector/driver account."""
    err = _admin_required()
    if err:
        return err

    data = request.get_json() or {}
    required = ("email", "password", "first_name", "last_name")
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"{field} is required"}), 400

    if User.query.filter_by(email=data["email"]).first():
        return jsonify({"error": "Email already registered"}), 409

    driver = User(
        email=data["email"],
        phone=data.get("phone"),
        password_hash=generate_password_hash(data["password"]),
        first_name=data["first_name"],
        last_name=data["last_name"],
        role="collector",
        compound=data.get("compound"),
        is_verified=True,
    )
    db.session.add(driver)
    db.session.commit()
    return jsonify(driver_schema.dump(driver)), 201


@drivers_bp.route("/<string:driver_id>", methods=["PUT"])
@jwt_required()
def update_driver(driver_id):
    err = _admin_required()
    if err:
        return err

    driver = User.query.filter_by(id=driver_id, role="collector").first_or_404()
    data   = request.get_json() or {}

    for field in ("first_name", "last_name", "phone", "compound", "is_active"):
        if field in data:
            setattr(driver, field, data[field])

    if data.get("password"):
        driver.password_hash = generate_password_hash(data["password"])

    db.session.commit()
    return jsonify(driver_schema.dump(driver)), 200


@drivers_bp.route("/<string:driver_id>", methods=["DELETE"])
@jwt_required()
def deactivate_driver(driver_id):
    """Soft-delete: deactivate rather than permanently remove."""
    err = _admin_required()
    if err:
        return err

    driver = User.query.filter_by(id=driver_id, role="collector").first_or_404()
    driver.is_active = False
    db.session.commit()
    return jsonify({"message": "Driver deactivated"}), 200
