"""
Real-time driver location tracking.

Collectors PUT their GPS position from a mobile device or driver app.
Residents GET all on-duty drivers so the map can show live truck locations.

Endpoints
---------
GET  /api/tracking/drivers         – active driver locations (residents)
PUT  /api/tracking/location        – update own GPS position (collectors)
POST /api/tracking/location/off-duty – mark driver as off duty
"""
from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from app import db
from app.models import DriverLocation, User

tracking_bp = Blueprint("tracking", __name__)

# Driver positions older than this are considered stale and hidden on the map
STALE_MINUTES = 10


@tracking_bp.route("/drivers", methods=["GET"])
@jwt_required()
def active_drivers():
    """Return all on-duty drivers whose location was updated in the last
    STALE_MINUTES minutes.  Open to any authenticated user."""
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
        if not drv or not drv.is_active:
            continue
        result.append({
            "driver_id":  drv.id,
            "name":       f"{drv.first_name} {drv.last_name}",
            "latitude":   loc.latitude,
            "longitude":  loc.longitude,
            "heading":    loc.heading or 0,
            "speed_kmh":  loc.speed_kmh or 0,
            "route_name": loc.route_name or "On duty",
            "updated_at": loc.updated_at.isoformat() if loc.updated_at else None,
        })

    return jsonify(result), 200


@tracking_bp.route("/location", methods=["PUT"])
@jwt_required()
def update_location():
    """Driver updates their current GPS position.
    Called periodically by the driver's device (every 10–30 s).

    Body: { latitude, longitude, heading?, speed_kmh?, route_name?, is_on_duty? }
    """
    claims = get_jwt()
    if claims.get("role") not in ("collector", "admin"):
        return jsonify({"error": "Only collectors can update location"}), 403

    driver_id = get_jwt_identity()
    data      = request.get_json() or {}

    lat = data.get("latitude")
    lng = data.get("longitude")
    if lat is None or lng is None:
        return jsonify({"error": "latitude and longitude are required"}), 400

    loc = DriverLocation.query.filter_by(driver_id=driver_id).first()
    if not loc:
        loc = DriverLocation(driver_id=driver_id)
        db.session.add(loc)

    loc.latitude   = float(lat)
    loc.longitude  = float(lng)
    loc.heading    = float(data.get("heading",   loc.heading   or 0))
    loc.speed_kmh  = float(data.get("speed_kmh", loc.speed_kmh or 0))
    loc.is_on_duty = data.get("is_on_duty", True)
    loc.route_name = data.get("route_name", loc.route_name)
    loc.updated_at = datetime.now(timezone.utc)

    db.session.commit()
    return jsonify({"message": "Location updated", "driver_id": driver_id}), 200


@tracking_bp.route("/location/off-duty", methods=["POST"])
@jwt_required()
def go_off_duty():
    """Mark the current driver as off duty (end of shift)."""
    claims = get_jwt()
    if claims.get("role") not in ("collector", "admin"):
        return jsonify({"error": "Forbidden"}), 403

    driver_id = get_jwt_identity()
    loc = DriverLocation.query.filter_by(driver_id=driver_id).first()
    if loc:
        loc.is_on_duty = False
        loc.updated_at = datetime.now(timezone.utc)
        db.session.commit()

    return jsonify({"message": "Marked off duty"}), 200
