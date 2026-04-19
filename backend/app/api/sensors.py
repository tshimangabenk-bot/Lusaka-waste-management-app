"""
Sensor Data API — receive IoT readings, update bin fill levels, trigger alerts.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from datetime import datetime, timezone

from app import db
from app.models import Sensor, SensorReading, SmartBin, Alert
from app.schemas import SensorReadingSchema

sensors_bp = Blueprint("sensors", __name__)
reading_schema = SensorReadingSchema()

# Fill-level thresholds for status mapping
FILL_THRESHOLDS = [
    (95, "overflow"),
    (85, "full"),
    (65, "high"),
    (40, "medium"),
    (15, "low"),
    (0,  "empty"),
]


def _fill_to_status(fill_pct: float) -> str:
    for threshold, status in FILL_THRESHOLDS:
        if fill_pct >= threshold:
            return status
    return "empty"


@sensors_bp.route("/reading", methods=["POST"])
def ingest_reading():
    """Receive a sensor reading (typically from MQTT bridge or direct HTTP).

    Expected JSON:
    {
        "hardware_id": "AA:BB:CC:DD:EE:FF",
        "distance_cm": 12.5,
        "temperature_c": 28.3,
        "weight_kg": null,
        "battery_level": 87.5
    }
    """
    data = request.get_json()
    hardware_id = data.get("hardware_id")

    sensor = Sensor.query.filter_by(hardware_id=hardware_id).first()
    if not sensor:
        return jsonify({"error": f"Unknown sensor: {hardware_id}"}), 404

    smart_bin = SmartBin.query.get(sensor.bin_id)
    if not smart_bin:
        return jsonify({"error": "Sensor is not linked to a bin"}), 404

    # Calculate fill percentage from ultrasonic distance
    bin_height_cm = float(smart_bin.capacity_liters) * 0.5  # rough heuristic
    distance_cm = data.get("distance_cm", 0)
    fill_pct = max(0, min(100, ((bin_height_cm - distance_cm) / bin_height_cm) * 100))

    # Persist the reading
    reading = SensorReading(
        sensor_id=sensor.id,
        bin_id=smart_bin.id,
        fill_percentage=round(fill_pct, 2),
        distance_cm=distance_cm,
        temperature_c=data.get("temperature_c"),
        weight_kg=data.get("weight_kg"),
        battery_level=data.get("battery_level"),
    )
    db.session.add(reading)

    # Update the bin's live status
    smart_bin.fill_percentage = round(fill_pct, 2)
    smart_bin.status = _fill_to_status(fill_pct)

    # Update sensor metadata
    sensor.last_ping_at = datetime.now(timezone.utc)
    sensor.battery_level = data.get("battery_level")
    sensor.status = "online"

    # Trigger alert if bin is full or overflowing
    if fill_pct >= 85:
        severity = "critical" if fill_pct >= 95 else "warning"
        alert_type = "bin_overflow" if fill_pct >= 95 else "bin_full"
        db.session.add(Alert(
            bin_id=smart_bin.id,
            alert_type=alert_type,
            severity=severity,
            message=f"Bin '{smart_bin.label}' is at {round(fill_pct, 1)}% capacity.",
        ))

    db.session.commit()

    return jsonify({
        "message": "Reading ingested",
        "bin_id": smart_bin.id,
        "fill_percentage": round(fill_pct, 2),
        "status": smart_bin.status,
    }), 201


@sensors_bp.route("/readings/<string:bin_id>", methods=["GET"])
@jwt_required()
def get_readings(bin_id):
    """Return recent sensor readings for a bin (last 100 by default)."""
    limit = request.args.get("limit", 100, type=int)
    readings = SensorReading.query.filter_by(bin_id=bin_id)\
        .order_by(SensorReading.recorded_at.desc()).limit(limit).all()
    return jsonify([{
        "id": r.id,
        "fill_percentage": float(r.fill_percentage),
        "distance_cm": float(r.distance_cm) if r.distance_cm else None,
        "temperature_c": float(r.temperature_c) if r.temperature_c else None,
        "battery_level": float(r.battery_level) if r.battery_level else None,
        "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
    } for r in readings]), 200
