"""
mqtt_listener.py — MQTT Listener for IoT Smart Bin Sensors.

Subscribes to the MQTT broker topic (default: smart_waste/sensors/#) and
processes incoming sensor payloads from deployed bin sensors.

On each message:
  1. Payload JSON is parsed and the hardware_id is extracted.
  2. The Sensor record is looked up by hardware_id.
  3. Raw distance_cm is converted to fill_percentage (0–100).
  4. A SensorReading row is inserted (append-only log).
  5. The parent SmartBin fill_percentage and status are updated.
  6. If fill_percentage ≥ 85 an Alert is raised for the admin dashboard.

Usage
-----
  Standalone process:   python -m app.mqtt_listener
  Embedded in Flask:    call start_mqtt(app) from run.py

Expected MQTT payload (JSON):
  {
    "hardware_id":   "BIN_SENSOR_001",
    "distance_cm":   45.2,       — ultrasonic reading (smaller = fuller)
    "temperature_c": 28.5,       — optional ambient temperature
    "weight_kg":     12.4,       — optional (load-cell sensors only)
    "battery_level": 87.0        — sensor battery percentage
  }

MQTT topic format:  smart_waste/sensors/<hardware_id>
The '#' wildcard in MQTT_TOPIC_SENSOR captures all sensor sub-topics.
"""
import json
import logging
from paho.mqtt import client as mqtt_client

from app import db
from app.models import Sensor, SensorReading, SmartBin, Alert

logger = logging.getLogger("mqtt")
logger.setLevel(logging.INFO)

# Fill percentage thresholds mapped to human-readable bin status labels.
# Evaluated top-to-bottom — the first threshold the reading meets is used.
FILL_THRESHOLDS = [
    (95, "overflow"),   # ≥ 95% — urgent: bin likely spilling
    (85, "full"),       # ≥ 85% — needs collection soon
    (65, "high"),       # ≥ 65% — approaching capacity
    (40, "medium"),     # ≥ 40% — normal use
    (15, "low"),        # ≥ 15% — mostly empty
    (0,  "empty"),      # < 15% — effectively empty
]


def _fill_to_status(fill_pct: float) -> str:
    """
    Map a fill percentage (0–100) to the nearest status label.

    The FILL_THRESHOLDS list is evaluated from highest to lowest threshold,
    returning the label of the first threshold that fill_pct meets or exceeds.
    """
    for threshold, status in FILL_THRESHOLDS:
        if fill_pct >= threshold:
            return status
    return "empty"  # fallback (should never be reached due to the 0-threshold entry)


def _on_connect(client, userdata, flags, rc, properties=None):
    """
    Callback fired when the MQTT client connects to the broker.

    rc=0 means successful connection.  On success we subscribe to the
    sensor topic so incoming messages are forwarded to _on_message.
    """
    if rc == 0:
        topic = userdata["topic"]
        client.subscribe(topic)
        logger.info(f"Connected to MQTT broker — subscribed to '{topic}'")
    else:
        logger.error(f"MQTT connection failed with code {rc}")


def _on_message(client, userdata, msg):
    """
    Callback fired for every incoming MQTT message on the subscribed topic.

    All database operations run inside an application context (app.app_context())
    because this callback executes in the MQTT background thread which has no
    Flask context by default.

    Steps:
      1. Decode and parse the JSON payload.
      2. Look up the sensor by hardware_id.
      3. Compute fill percentage from raw distance_cm.
      4. Insert a SensorReading row (time-series log).
      5. Update the SmartBin's current fill level and status.
      6. Raise an Alert if the bin is ≥ 85% full.
    """
    app = userdata["app"]

    # Decode the raw MQTT payload bytes to a Python dict
    try:
        payload = json.loads(msg.payload.decode())
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        logger.warning(f"Bad payload on {msg.topic}: {e}")
        return

    hardware_id = payload.get("hardware_id")
    if not hardware_id:
        # Each payload must identify which sensor sent it
        logger.warning("Payload missing 'hardware_id'")
        return

    # All DB operations need a Flask app context (this runs in a background thread)
    with app.app_context():
        # Look up the physical sensor record by its hardware ID
        sensor = Sensor.query.filter_by(hardware_id=hardware_id).first()
        if not sensor:
            logger.warning(f"Unknown sensor: {hardware_id}")
            return

        smart_bin = SmartBin.query.get(sensor.bin_id)
        if not smart_bin:
            return  # Bin may have been deleted — silently skip

        # ── Convert distance_cm to fill percentage ──────────────────────
        # Approximation: bin height (cm) ≈ capacity_liters × 0.5
        # (a 240L wheelie bin is ~120 cm tall)
        # fill% = (height - distance) / height × 100
        # distance_cm is measured from the sensor at the top of the bin to the waste surface:
        #   small distance = bin nearly full; large distance = bin nearly empty
        bin_height_cm = float(smart_bin.capacity_liters) * 0.5
        distance_cm   = payload.get("distance_cm", 0)
        fill_pct      = max(0, min(100, ((bin_height_cm - distance_cm) / bin_height_cm) * 100))

        # ── Append an immutable time-series reading ─────────────────────
        reading = SensorReading(
            sensor_id=sensor.id,
            bin_id=smart_bin.id,
            fill_percentage=round(fill_pct, 2),
            distance_cm=distance_cm,
            temperature_c=payload.get("temperature_c"),
            weight_kg=payload.get("weight_kg"),
            battery_level=payload.get("battery_level"),
        )
        db.session.add(reading)

        # ── Update the bin's live fill level and status ─────────────────
        smart_bin.fill_percentage = round(fill_pct, 2)
        smart_bin.status          = _fill_to_status(fill_pct)

        # Update sensor health metrics
        sensor.battery_level = payload.get("battery_level")
        sensor.status        = "online"   # mark as online since we just received a message

        # ── Raise an alert if the bin is critically full ────────────────
        # Two severity levels: warning (≥85%) and critical (≥95%)
        if fill_pct >= 85:
            severity   = "critical" if fill_pct >= 95 else "warning"
            alert_type = "bin_overflow" if fill_pct >= 95 else "bin_full"
            db.session.add(Alert(
                bin_id=smart_bin.id,
                alert_type=alert_type,
                severity=severity,
                message=f"Bin '{smart_bin.label}' is at {round(fill_pct, 1)}% capacity.",
            ))
            # Note: duplicate alerts (bin stays full between readings) are not deduplicated here.
            # Consider adding a query to check for an existing unresolved alert before inserting.

        db.session.commit()
        logger.info(f"Sensor {hardware_id} → bin {smart_bin.label}: {round(fill_pct, 1)}%")


def start_mqtt(app):
    """
    Start the MQTT listener in a non-blocking background thread.

    Called once from run.py after the Flask app is created.
    The listener runs concurrently with Flask using paho-mqtt's loop_start()
    which spawns a dedicated network thread.

    Connection failures are logged but do not crash the Flask app —
    the API remains functional even without live sensor data.
    """
    broker = app.config["MQTT_BROKER_HOST"]
    port   = app.config["MQTT_BROKER_PORT"]
    topic  = app.config["MQTT_TOPIC_SENSOR"]

    # Use MQTT v2 callback API; pass app and topic as userdata for thread-safe access
    client = mqtt_client.Client(
        mqtt_client.CallbackAPIVersion.VERSION2,
        client_id="smart_waste_backend",
        userdata={"app": app, "topic": topic},
    )
    client.on_connect = _on_connect
    client.on_message = _on_message

    try:
        client.connect(broker, port)
        # loop_start() runs the network loop in a background daemon thread;
        # the main Flask thread is unblocked and can serve HTTP requests normally
        client.loop_start()
        logger.info(f"MQTT listener started → {broker}:{port}")
    except Exception as e:
        # Log but don't raise — the app can run without MQTT (e.g. in dev without a broker)
        logger.error(f"Could not connect to MQTT broker: {e}")
