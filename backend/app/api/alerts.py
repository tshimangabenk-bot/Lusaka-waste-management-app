"""
Alerts API — list, read, and resolve system alerts (admin).
"""
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt

from app import db
from app.models import Alert
from app.schemas import AlertSchema

alerts_bp = Blueprint("alerts", __name__)
alert_schema  = AlertSchema()
alerts_schema = AlertSchema(many=True)


def _admin_required():
    if get_jwt().get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403
    return None


@alerts_bp.route("", methods=["GET"])
@jwt_required()
def list_alerts():
    err = _admin_required()
    if err:
        return err

    severity = request.args.get("severity")
    resolved = request.args.get("resolved")
    query    = Alert.query

    if severity:
        query = query.filter_by(severity=severity)
    if resolved is not None:
        query = query.filter_by(resolved=(resolved.lower() == "true"))

    alerts = query.order_by(Alert.created_at.desc()).limit(200).all()
    return jsonify(alerts_schema.dump(alerts)), 200


@alerts_bp.route("/<string:alert_id>/resolve", methods=["PATCH"])
@jwt_required()
def resolve_alert(alert_id):
    err = _admin_required()
    if err:
        return err

    alert = Alert.query.get_or_404(alert_id)
    alert.resolved    = True
    alert.is_read     = True
    alert.resolved_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(alert_schema.dump(alert)), 200


@alerts_bp.route("/<string:alert_id>/read", methods=["PATCH"])
@jwt_required()
def mark_read(alert_id):
    err = _admin_required()
    if err:
        return err

    alert = Alert.query.get_or_404(alert_id)
    alert.is_read = True
    db.session.commit()
    return jsonify({"message": "Alert marked as read"}), 200


@alerts_bp.route("/mark-all-read", methods=["PATCH"])
@jwt_required()
def mark_all_read():
    err = _admin_required()
    if err:
        return err

    Alert.query.filter_by(is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"message": "All alerts marked as read"}), 200
