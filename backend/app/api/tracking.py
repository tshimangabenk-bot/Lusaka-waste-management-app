"""
api/tracking.py — Real-Time Driver Location Tracking API Blueprint.

Enables residents to see live truck positions on the map and allows
collectors to broadcast their GPS coordinates while on duty.

Design
------
One DriverLocation row per driver is maintained (upserted on each PUT call).
Only the latest position is stored — this is NOT a movement history table.
Historical track recording can be added separately if needed.

Stale filtering: positions older than STALE_MINUTES are excluded from the
public GET endpoint, so the map only shows trucks that are actively moving.

Endpoints
---------
GET  /api/tracking/drivers          — active driver positions (any authenticated user)
PUT  /api/tracking/location         — update own GPS position (collectors only)
POST /api/tracking/location/off-duty — mark driver as off duty (collectors only)
"""
from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from app import db
from app.models import DriverLocation, User

tracking_bp = Blueprint("tracking", __name__)

# Driver positions older than this many minutes are considered stale and
# excluded from the resident map view.  10 minutes means a driver who stops
# sending pings (e.g. app crashes) disappears from the map quickly.
STALE_MINUTES = 10


@tracking_bp.route("/drivers", methods=["GET"])
@jwt_required()
def active_drivers():
    """
    Return all on-duty drivers whose position was updated within the last STALE_MINUTES.

    Open to any authenticated user (residents, admins, collectors).
    Used by the resident dashboard map to show live truck icons.

    Response fields per driver:
      driver_id, name, latitude, longitude,
      heading    — compass bearing for map icon rotation
      speed_kmh  — for animating movement
      route_name — display label on the map popup
      updated_at — ISO timestamp of last GPS ping
    """
    # Filter to positions updated within the freshness window
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=STALE_MINUTES)

    locs = (
        DriverLocation.query
        .filter_by(is_on_duty=True)
        .filter(DriverLocation.updated_at >= cutoff)
        .all()
    )

    result = []
    for loc in locs:
        drv = loc.driver
        # Skip if the user record was deleted or deactivated
        if not drv or not drv.is_active:
            continue
        result.append({
            "driver_id":  drv.id,
            "name":       f"{drv.first_name} {drv.last_name}",
            "latitude":   loc.latitude,
            "longitude":  loc.longitude,
            "heading":    loc.heading or 0,      # default to North if unknown
            "speed_kmh":  loc.speed_kmh or 0,
            "route_name": loc.route_name or "On duty",
            "updated_at": loc.updated_at.isoformat() if loc.updated_at else None,
        })

    return jsonify(result), 200


@tracking_bp.route("/location", methods=["PUT"])
@jwt_required()
def update_location():
    """
    Collector updates their current GPS position.

    Called periodically by the driver's mobile device (recommended interval: 10–30 s).
    Upserts the DriverLocation row (creates one if it doesn't exist yet).

    Restricted to collector and admin roles.

    Request body:
        latitude    (float, required)
        longitude   (float, required)
        heading     (float, optional) — compass bearing 0–360
        speed_kmh   (float, optional)
        route_name  (str,   optional) — shown on resident map popup
        is_on_duty  (bool,  optional) — set False to go off duty without calling /off-duty

    Returns the driver's ID on success.
    """
    claims = get_jwt()
    # Only collectors and admins can push location updates
    if claims.get("role") not in ("collector", "admin"):
        return jsonify({"error": "Only collectors can update location"}), 403

    driver_id = get_jwt_identity()
    data      = request.get_json() or {}

    lat = data.get("latitude")
    lng = data.get("longitude")
    if lat is None or lng is None:
        return jsonify({"error": "latitude and longitude are required"}), 400

    # Upsert: fetch existing record or create a new one
    loc = DriverLocation.query.filter_by(driver_id=driver_id).first()
    if not loc:
        loc = DriverLocation(driver_id=driver_id)
        db.session.add(loc)

    # Update all provided fields; keep existing values for omitted optional fields
    loc.latitude   = float(lat)
    loc.longitude  = float(lng)
    loc.heading    = float(data.get("heading",   loc.heading   or 0))
    loc.speed_kmh  = float(data.get("speed_kmh", loc.speed_kmh or 0))
    loc.is_on_duty = data.get("is_on_duty", True)       # default to on-duty when pinging
    loc.route_name = data.get("route_name", loc.route_name)
    # Explicitly set updated_at so the freshness check in active_drivers() works correctly
    loc.updated_at = datetime.now(timezone.utc)

    db.session.commit()
    return jsonify({"message": "Location updated", "driver_id": driver_id}), 200


@tracking_bp.route("/location/off-duty", methods=["POST"])
@jwt_required()
def go_off_duty():
    """
    Mark the current driver as off duty at end of shift.

    Sets is_on_duty=False which causes active_drivers() to exclude this driver
    from the resident map immediately, even within the STALE_MINUTES window.

    If the driver has no DriverLocation record (e.g. they never sent a ping),
    the request succeeds silently — no record to update.
    """
    claims = get_jwt()
    if claims.get("role") not in ("collector", "admin"):
        return jsonify({"error": "Forbidden"}), 403

    driver_id = get_jwt_identity()
    loc       = DriverLocation.query.filter_by(driver_id=driver_id).first()
    if loc:
        loc.is_on_duty = False
        loc.updated_at = datetime.now(timezone.utc)   # update timestamp for audit trail
        db.session.commit()

    return jsonify({"message": "Marked off duty"}), 200
