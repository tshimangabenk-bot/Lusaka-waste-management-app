"""
api/dashboard.py — Admin Dashboard API Blueprint.

Provides aggregated statistics and analytics for the Lusaka City Council (LCC)
admin dashboard.  All endpoints are restricted to admin-role users.

Endpoints
---------
GET /api/dashboard/stats          — high-level system KPIs (bins, reports, users)
GET /api/dashboard/zones/summary  — per-zone breakdown of bins, fill, and reports
GET /api/dashboard/alerts/recent  — 50 most recent unresolved alerts
GET /api/dashboard/analytics      — 30-day waste activity trend + 14-day forecast

Analytics note
--------------
The forecast in /analytics is a simple 7-day rolling average with a hash-based
noise term for visual variation.  In production this should be replaced by the
active MLModel from the ml_models table once the forecasting pipeline is built.
"""
from datetime import datetime, timezone, timedelta
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from sqlalchemy import func

from app import db
from app.models import (
    SmartBin, Report, User, Zone, CollectionRoute,
    Alert, WasteGenerationLog, MLModel,
)

dashboard_bp = Blueprint("dashboard", __name__)


def admin_required(fn):
    """
    Decorator that restricts an endpoint to admin-role users.

    Must be applied AFTER @jwt_required() so the JWT is already decoded
    and get_jwt() returns the claims dict.

    Usage:
        @dashboard_bp.route("/stats")
        @jwt_required()
        @admin_required
        def stats(): ...
    """
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
    """
    Return high-level KPIs for the admin dashboard header cards.

    Metrics returned:
      total_bins        — total smart bins in the system
      full_bins         — bins at ≥80% fill (needs collection)
      fill_rate_pct     — percentage of bins that are ≥80% full
      total_reports     — all citizen reports ever submitted
      pending_reports   — reports awaiting action
      total_users       — registered users (all roles)
      active_routes     — collection routes currently in_progress
      unresolved_alerts — alerts that have not been resolved

    All values are computed with COUNT aggregates — no ORM object loading.
    """
    total_bins        = SmartBin.query.count()
    full_bins         = SmartBin.query.filter(SmartBin.fill_percentage >= 80).count()
    total_reports     = Report.query.count()
    pending_reports   = Report.query.filter_by(status="pending").count()
    total_users       = User.query.count()
    active_routes     = CollectionRoute.query.filter_by(status="in_progress").count()
    unresolved_alerts = Alert.query.filter_by(resolved=False).count()

    return jsonify({
        "total_bins":        total_bins,
        "full_bins":         full_bins,
        "fill_rate_pct":     round((full_bins / total_bins * 100), 1) if total_bins else 0,
        "total_reports":     total_reports,
        "pending_reports":   pending_reports,
        "total_users":       total_users,
        "active_routes":     active_routes,
        "unresolved_alerts": unresolved_alerts,
    }), 200


@dashboard_bp.route("/zones/summary", methods=["GET"])
@jwt_required()
@admin_required
def zone_summary():
    """
    Return per-zone statistics for the zone performance table.

    For each zone:
      bin_count    — number of smart bins in the zone
      avg_fill_pct — mean fill level across all bins in the zone
      report_count — total citizen reports filed for this zone

    Queries are executed inside the loop (N+1 pattern).  Acceptable for
    Lusaka's zone count (~10–20 zones) but could be optimised with a single
    GROUP BY query if performance becomes an issue.
    """
    zones  = Zone.query.all()
    result = []

    for zone in zones:
        bin_count = SmartBin.query.filter_by(zone_id=zone.id).count()

        # AVG aggregate returns None if there are no bins — default to 0
        avg_fill = db.session.query(func.avg(SmartBin.fill_percentage))\
            .filter(SmartBin.zone_id == zone.id).scalar() or 0

        report_count = Report.query.filter_by(zone_id=zone.id).count()

        result.append({
            "zone_id":        zone.id,
            "zone_name":      zone.name,
            "population_est": zone.population_est,
            "bin_count":      bin_count,
            "avg_fill_pct":   round(float(avg_fill), 1),
            "report_count":   report_count,
        })

    return jsonify(result), 200


@dashboard_bp.route("/alerts/recent", methods=["GET"])
@jwt_required()
@admin_required
def recent_alerts():
    """
    Return the 50 most recent unresolved system alerts.

    Alerts are created by the MQTT listener when bins exceed fill thresholds.
    The admin dashboard shows these in a notification panel for immediate action.

    Only unresolved (resolved=False) alerts are returned — resolved ones are
    archived and accessible via a separate query if needed.
    """
    alerts = Alert.query.filter_by(resolved=False)\
        .order_by(Alert.created_at.desc()).limit(50).all()

    return jsonify([{
        "id":         a.id,
        "bin_id":     a.bin_id,
        "alert_type": a.alert_type,
        "severity":   a.severity,
        "message":    a.message,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    } for a in alerts]), 200


@dashboard_bp.route("/analytics", methods=["GET"])
@jwt_required()
@admin_required
def analytics():
    """
    Return waste activity trend data and ML model registry for the analytics chart.

    Response structure:
      trend.labels    — date labels for the chart x-axis (DD Mon format)
      trend.actual    — waste volume estimates for the last 30 days (tonnes)
      trend.predicted — forecast values for the next 14 days (None for past dates)
      ml_models       — list of registered forecast models and their accuracy

    Trend methodology (placeholder):
    ---------------------------------
    Actual values are estimated using a base volume (65 t/day) plus a scaled
    count of citizen reports filed that day (as an activity proxy).  A hash-based
    noise term adds visual variation.

    The 14-day forecast uses a 7-day rolling average of the last 7 actual values
    plus the same hash-based noise term.

    TODO: Replace this heuristic with predictions from the active MLModel once the
    ML pipeline (data collection → training → inference) is in place.
    """
    today = datetime.now(timezone.utc).date()

    # ── Daily report counts for the last 30 days (used as waste-activity proxy) ─
    start = datetime.now(timezone.utc) - timedelta(days=30)
    rows  = (
        db.session.query(
            func.date(Report.created_at).label("day"),
            func.count(Report.id).label("cnt"),
        )
        .filter(Report.created_at >= start)
        .group_by(func.date(Report.created_at))
        .all()
    )
    # Build a dict keyed by date string for O(1) lookup in the loop below
    counts_by_day = {str(r.day): r.cnt for r in rows}

    # ── Build 30-day actual series and 14-day forecast ────────────────────────
    labels, actual, predicted = [], [], []
    BASE_VOLUME = 65   # baseline estimated tonnes/day for Lusaka

    # Past 30 days (actual values, predicted=None)
    for i in range(30, -1, -1):
        d = today - timedelta(days=i)
        labels.append(d.strftime("%d %b").lstrip("0"))
        reports_today = counts_by_day.get(str(d), 0)
        # Estimate: base + (reports × 3 tonnes proxy) + hash noise for variation
        actual.append(round(BASE_VOLUME + reports_today * 3 + (hash(str(d)) % 15), 1))
        predicted.append(None)   # no prediction for past dates

    # 14-day forecast using 7-day rolling average (actual values, predicted=actual)
    window = actual[-7:] if len(actual) >= 7 else actual
    avg    = sum(x for x in window if x is not None) / max(len(window), 1)
    for i in range(1, 15):
        d = today + timedelta(days=i)
        labels.append(d.strftime("%d %b").lstrip("0"))
        actual.append(None)   # no actual data for future dates
        predicted.append(round(avg + (hash(str(d)) % 10) - 5, 1))

    # ── ML Models registry ────────────────────────────────────────────────────
    # Show the active model first, then most recently trained
    ml_models = MLModel.query.order_by(MLModel.is_active.desc(), MLModel.trained_at.desc()).all()

    return jsonify({
        "trend": {"labels": labels, "actual": actual, "predicted": predicted},
        "ml_models": [
            {
                "id":         m.id,
                "model_name": m.model_name,
                "version":    m.version,
                "accuracy":   m.accuracy,
                "trained_at": m.trained_at.isoformat() if m.trained_at else None,
                "is_active":  m.is_active,
            }
            for m in ml_models
        ],
    }), 200
