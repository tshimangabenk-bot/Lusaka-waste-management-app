"""
api/schedule.py — Collection Schedule & Custom Pickup Requests API Blueprint.

Provides two distinct features for residents:

  1. Zone Schedule Viewer
     Residents can see which days their garbage is collected (from the
     PickupSchedule table) and get a 14-day rolling preview of upcoming
     collection dates.

  2. Custom Pickup Requests
     Residents can request an extra (off-schedule) collection — e.g. for
     bulky items, post-event waste, or medical waste.  LCC admins review
     and confirm or reject these requests.

Endpoints
---------
GET  /api/schedule/zone                          — zone schedule + 14-day calendar
GET  /api/schedule/requests                      — current user's custom requests
POST /api/schedule/requests                      — submit a new custom request
PATCH /api/schedule/requests/<id>/cancel         — cancel a pending request (resident)
GET  /api/schedule/requests/all                  — all requests (admin only)
PATCH /api/schedule/requests/<id>/status         — update request status (admin only)
"""
from datetime import date, timedelta

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from app import db
from app.models import PickupSchedule, PickupRequest, User, Zone

schedule_bp = Blueprint("schedule", __name__)

# Human-readable day names indexed by Python weekday() (0=Monday)
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Maps time_slot values to display strings shown in the UI
TIME_LABELS = {
    "morning":   "7 am – 12 pm",
    "afternoon": "12 pm – 5 pm",
    "evening":   "5 pm – 8 pm",
}


def _user_zone(user_id: str):
    """
    Resolve a user's collection zone by matching their compound name to a Zone.

    The User.compound field stores the neighbourhood name (e.g. "Kalingalinga").
    This is matched case-sensitively against Zone.name.  Returns None if the
    user has no compound set or no matching zone exists.
    """
    user = User.query.get(user_id)
    if not user or not user.compound:
        return None
    return Zone.query.filter_by(name=user.compound).first()


# ── Zone schedule ──────────────────────────────────────────────────────────────

@schedule_bp.route("/zone", methods=["GET"])
@jwt_required()
def zone_schedule():
    """
    Return the collection schedule for the current user's zone and a
    14-day calendar of upcoming collection dates.

    Query params:
        zone_id (int, optional) — override to fetch a different zone's schedule
                                   (useful for admins browsing any zone)

    If zone_id is not provided, the user's own zone is derived from their
    compound field.

    Response:
        zone_id, zone_name — identity of the zone
        schedules          — list of weekly schedule entries (day + time)
        upcoming           — list of collection dates in the next 14 days
                             with days_away count for "next pickup in X days" UI
    """
    user_id = get_jwt_identity()
    zone_id = request.args.get("zone_id", type=int)

    if zone_id:
        zone = Zone.query.get_or_404(zone_id)
    else:
        zone = _user_zone(user_id)
        if not zone:
            return jsonify({"error": "No zone linked to your account. Contact LCC."}), 404

    # Only active schedules are shown (inactive ones are hidden without being deleted)
    schedules = PickupSchedule.query.filter_by(zone_id=zone.id, is_active=True).all()

    # ── Build the 14-day upcoming calendar ─────────────────────────────────
    today    = date.today()
    upcoming = []
    for offset in range(15):   # today + 14 days ahead
        d   = today + timedelta(days=offset)
        dow = d.weekday()   # 0=Monday, 6=Sunday
        for s in schedules:
            if s.day_of_week == dow:
                upcoming.append({
                    "date":       d.isoformat(),
                    "day_name":   DAY_NAMES[dow],
                    "time_slot":  s.time_slot,
                    "time_label": TIME_LABELS.get(s.time_slot, s.time_slot),
                    "frequency":  s.frequency,
                    "days_away":  offset,   # 0 = today, 1 = tomorrow, etc.
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


# ── Resident: pickup request endpoints ────────────────────────────────────────

@schedule_bp.route("/requests", methods=["GET"])
@jwt_required()
def my_requests():
    """
    Return all custom pickup requests submitted by the current user,
    ordered newest-requested-date first.
    """
    user_id = get_jwt_identity()
    reqs    = (
        PickupRequest.query
        .filter_by(user_id=user_id)
        .order_by(PickupRequest.requested_date.desc())
        .all()
    )
    return jsonify([_fmt(r) for r in reqs]), 200


@schedule_bp.route("/requests", methods=["POST"])
@jwt_required()
def create_request():
    """
    Submit a new custom pickup request.

    Required body fields:
        requested_date (str, YYYY-MM-DD) — desired collection date

    Optional:
        time_preference (str)  — morning | afternoon | evening (default: morning)
        description     (str)  — what needs collecting
        zone_id         (int)  — override zone (falls back to user's compound zone)

    Validation:
        - requested_date must be today or a future date (no past requests)
        - date must be in YYYY-MM-DD format

    Returns the new request object with HTTP 201.
    """
    user_id  = get_jwt_identity()
    data     = request.get_json() or {}

    raw_date = data.get("requested_date")
    if not raw_date:
        return jsonify({"error": "requested_date is required (YYYY-MM-DD)"}), 400

    try:
        req_date = date.fromisoformat(raw_date)
    except ValueError:
        return jsonify({"error": "Invalid date — use YYYY-MM-DD"}), 400

    # Prevent residents from requesting past pickups
    if req_date < date.today():
        return jsonify({"error": "Cannot request a pickup in the past"}), 400

    # Resolve zone: explicit zone_id in body, or fall back to user's compound zone
    zone_id = data.get("zone_id")
    if not zone_id:
        zone    = _user_zone(user_id)
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
def cancel_request(req_id: str):
    """
    Cancel a pending or confirmed pickup request.

    Only the requesting user can cancel their own requests.
    Already-completed or already-cancelled requests cannot be cancelled again.

    Errors:
        404 — request not found or belongs to a different user
        409 — request is already completed or cancelled
    """
    user_id = get_jwt_identity()
    # filter_by(user_id=user_id) ensures users can only cancel their own requests
    req     = PickupRequest.query.filter_by(id=req_id, user_id=user_id).first_or_404()

    if req.status in ("completed", "cancelled"):
        return jsonify({"error": f"Cannot cancel a {req.status} request"}), 409

    req.status = "cancelled"
    db.session.commit()
    return jsonify(_fmt(req)), 200


# ── Admin: manage all pickup requests ─────────────────────────────────────────

@schedule_bp.route("/requests/all", methods=["GET"])
@jwt_required()
def all_requests():
    """
    Admin: list all pickup requests across all residents.

    Query params:
        status (str, optional) — filter by status: pending|confirmed|completed|cancelled

    Returns requests ordered by requested_date ascending (soonest first).
    """
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
def update_request_status(req_id: str):
    """
    Admin: confirm, complete, or reject a custom pickup request.

    Accepts any subset of:
        status         (str)  — new status: confirmed | completed | cancelled
        notes          (str)  — admin note or rejection reason
        confirmed_date (str)  — actual confirmed date (YYYY-MM-DD),
                                may differ from the resident's requested_date

    Returns the updated request object.
    """
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
            pass   # Silently ignore invalid dates — consider returning 400 in future

    db.session.commit()
    return jsonify(_fmt(req)), 200


# ── Helper ─────────────────────────────────────────────────────────────────────

def _fmt(r: PickupRequest) -> dict:
    """
    Serialise a PickupRequest to a response dict.

    Using a manual dict (instead of a Marshmallow schema) here so that
    time_label (the human-readable time window string) can be computed
    inline without adding a computed field to the schema.
    """
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
