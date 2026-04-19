"""
Admin Dashboard API — aggregated statistics for Lusaka City Council.
"""
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from sqlalchemy import func

from app import db
from app.models import (
    SmartBin, Report, User, Zone, CollectionRoute,
    Alert, WasteGenerationLog,
)

dashboard_bp = Blueprint("dashboard", __name__)


def admin_required(fn):
    """Decorator — restrict endpoint to admin role."""
    from functools import wraps

    @wraps(fn)
    def wrapper(*args, **kwargs):
        claims = get_jwt()
        if claims.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403
        return fn(*args, **kwargs)
    return wrapper


@dashboard_bp.route("/stats", methods=["GET"])
@jwt_required()
@admin_required
def system_stats():
    """High‑level system statistics for the admin dashboard."""
    total_bins       = SmartBin.query.count()
    full_bins        = SmartBin.query.filter(SmartBin.fill_percentage >= 80).count()
    total_reports    = Report.query.count()
    pending_reports  = Report.query.filter_by(status="pending").count()
    total_users      = User.query.count()
    active_routes    = CollectionRoute.query.filter_by(status="in_progress").count()
    unresolved_alerts = Alert.query.filter_by(resolved=False).count()

    return jsonify({
        "total_bins": total_bins,
        "full_bins": full_bins,
        "fill_rate_pct": round((full_bins / total_bins * 100), 1) if total_bins else 0,
        "total_reports": total_reports,
        "pending_reports": pending_reports,
        "total_users": total_users,
        "active_routes": active_routes,
        "unresolved_alerts": unresolved_alerts,
    }), 200


@dashboard_bp.route("/zones/summary", methods=["GET"])
@jwt_required()
@admin_required
def zone_summary():
    """Per‑zone statistics: bin count, avg fill, report count."""
    zones = Zone.query.all()
    result = []

    for zone in zones:
        bin_count = SmartBin.query.filter_by(zone_id=zone.id).count()
        avg_fill = db.session.query(func.avg(SmartBin.fill_percentage))\
            .filter(SmartBin.zone_id == zone.id).scalar() or 0

        report_count = Report.query.filter_by(zone_id=zone.id).count()

        result.append({
            "zone_id": zone.id,
            "zone_name": zone.name,
            "population_est": zone.population_est,
            "bin_count": bin_count,
            "avg_fill_pct": round(float(avg_fill), 1),
            "report_count": report_count,
        })

    return jsonify(result), 200


@dashboard_bp.route("/alerts/recent", methods=["GET"])
@jwt_required()
@admin_required
def recent_alerts():
    """Return the 50 most recent unresolved alerts."""
    alerts = Alert.query.filter_by(resolved=False)\
        .order_by(Alert.created_at.desc()).limit(50).all()

    return jsonify([{
        "id": a.id,
        "bin_id": a.bin_id,
        "alert_type": a.alert_type,
        "severity": a.severity,
        "message": a.message,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    } for a in alerts]), 200
