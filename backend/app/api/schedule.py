"""
Collection Schedule & Custom Pickup Requests API.

Residents view their zone's regular collection calendar and submit
requests for extra (non-schedule) pickups.

Endpoints
---------
GET  /api/schedule/zone           – zone schedule + 14-day upcoming list
GET  /api/schedule/requests       – my custom pickup requests
POST /api/schedule/requests       – submit a new pickup request
PATCH /api/schedule/requests/<id>/cancel  – cancel a pending request

Admin-only
PATCH /api/schedule/requests/<id>/status  – confirm / complete / reject
"""
from datetime import date, timedelta

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from app import db
from app.models import PickupSchedule, PickupRequest, User, Zone

schedule_bp = Blueprint("schedule", __name__)

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
TIME_LABELS = {
    "morning":   "7 am – 12 pm",
    "afternoon": "12 pm – 5 pm",
    "evening":   "5 pm – 8 pm",
}


def _user_zone(user_id):
    user = User.query.get(user_id)
    if not user or not user.compound:
        return None
    return Zone.query.filter_by(name=user.compound).first()


# ── Zone schedule ──────────────────────────────────────────────────────────────

@schedule_bp.route("/zone", methods=["GET"])
@jwt_required()
def zone_schedule():
    """Return the collection schedule for the current user's zone plus the
    next 14 days of upcoming collection dates."""
    user_id = get_jwt_identity()
    zone_id = request.args.get("zone_id", type=int)

    if zone_id:
        zone = Zone.query.get_or_404(zone_id)
    else:
        zone = _user_zone(user_id)
        if not zone:
            return jsonify({"error": "No zone linked to your account. Contact LCC."}), 404

    schedules = PickupSchedule.query.filter_by(zone_id=zone.id, is_active=True).all()

    # Build the next-14-day upcoming list
    today    = date.today()
    upcoming = []
    for offset in range(15):
        d   = today + timedelta(days=offset)
        dow = d.weekday()   # 0=Mon
        for s in schedules:
            if s.day_of_week == dow:
                upcoming.append({
                    "date":       d.isoformat(),
                    "day_name":   DAY_NAMES[dow],
                    "time_slot":  s.time_slot,
                    "time_label": TIME_LABELS.get(s.time_slot, s.time_slot),
                    "frequency":  s.frequency,
                    "days_away":  offset,
                })

    return jsonify({
        "zone_id":   zone.id,
        "zone_name": zone.name,
        "schedules": [
            {
                "id":          s.id,
                "day_of_week": s.day_of_week,
                "day_name":    DAY_NAMES[s.day_of_week],
                "time_slot":   s.time_slot,
                "time_label":  TIME_LABELS.get(s.time_slot, s.time_slot),
                "frequency":   s.frequency,
            }
            for s in schedules
        ],
        "upcoming": upcoming,
    }), 200


# ── Pickup requests ────────────────────────────────────────────────────────────

@schedule_bp.route("/requests", methods=["GET"])
@jwt_required()
def my_requests():
    """Return all pickup requests submitted by the current user."""
    user_id = get_jwt_identity()
    reqs = (
        PickupRequest.query
        .filter_by(user_id=user_id)
        .order_by(PickupRequest.requested_date.desc())
        .all()
    )
    return jsonify([_fmt(r) for r in reqs]), 200


@schedule_bp.route("/requests", methods=["POST"])
@jwt_required()
def create_request():
    """Submit a custom pickup request for a future date."""
    user_id = get_jwt_identity()
    data    = request.get_json() or {}

    raw_date = data.get("requested_date")
    if not raw_date:
        return jsonify({"error": "requested_date is required (YYYY-MM-DD)"}), 400

    try:
        req_date = date.fromisoformat(raw_date)
    except ValueError:
        return jsonify({"error": "Invalid date — use YYYY-MM-DD"}), 400

    if req_date < date.today():
        return jsonify({"error": "Cannot request a pickup in the past"}), 400

    zone_id = data.get("zone_id")
    if not zone_id:
        zone = _user_zone(user_id)
        zone_id = zone.id if zone else None

    req = PickupRequest(
        user_id=user_id,
        zone_id=zone_id,
        requested_date=req_date,
        time_preference=data.get("time_preference", "morning"),
        description=data.get("description", ""),
    )
    db.session.add(req)
    db.session.commit()
    return jsonify(_fmt(req)), 201


@schedule_bp.route("/requests/<string:req_id>/cancel", methods=["PATCH"])
@jwt_required()
def cancel_request(req_id):
    """Cancel a pending or confirmed pickup request."""
    user_id = get_jwt_identity()
    req = PickupRequest.query.filter_by(id=req_id, user_id=user_id).first_or_404()

    if req.status in ("completed", "cancelled"):
        return jsonify({"error": f"Cannot cancel a {req.status} request"}), 409

    req.status = "cancelled"
    db.session.commit()
    return jsonify(_fmt(req)), 200


# ── Admin endpoints ────────────────────────────────────────────────────────────

@schedule_bp.route("/requests/all", methods=["GET"])
@jwt_required()
def all_requests():
    """Admin: list all pickup requests across all users."""
    if get_jwt().get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403

    status = request.args.get("status")
    query  = PickupRequest.query
    if status:
        query = query.filter_by(status=status)

    reqs = query.order_by(PickupRequest.requested_date.asc()).all()
    return jsonify([_fmt(r) for r in reqs]), 200


@schedule_bp.route("/requests/<string:req_id>/status", methods=["PATCH"])
@jwt_required()
def update_request_status(req_id):
    """Admin: confirm, complete, or reject a pickup request."""
    if get_jwt().get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403

    req  = PickupRequest.query.get_or_404(req_id)
    data = request.get_json() or {}

    if data.get("status"):
        req.status = data["status"]
    if data.get("notes"):
        req.notes = data["notes"]
    if data.get("confirmed_date"):
        try:
            req.confirmed_date = date.fromisoformat(data["confirmed_date"])
        except ValueError:
            pass

    db.session.commit()
    return jsonify(_fmt(req)), 200


# ── Helper ─────────────────────────────────────────────────────────────────────

def _fmt(r: PickupRequest) -> dict:
    return {
        "id":              r.id,
        "requested_date":  r.requested_date.isoformat() if r.requested_date else None,
        "time_preference": r.time_preference,
        "time_label":      TIME_LABELS.get(r.time_preference, r.time_preference),
        "description":     r.description,
        "status":          r.status,
        "confirmed_date":  r.confirmed_date.isoformat() if r.confirmed_date else None,
        "notes":           r.notes,
        "created_at":      r.created_at.isoformat() if r.created_at else None,
    }
