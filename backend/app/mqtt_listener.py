"""
MQTT Listener — subscribes to smart-bin sensor topics and persists readings.

Run standalone:  python -m app.mqtt_listener
Or import and call start_mqtt(app) from within the Flask app.
"""
import json
import logging
from paho.mqtt import client as mqtt_client

from app import db
from app.models import Sensor, SensorReading, SmartBin, Alert

logger = logging.getLogger("mqtt")
logger.setLevel(logging.INFO)

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


def _on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        topic = userdata["topic"]
        client.subscribe(topic)
        logger.info(f"Connected to MQTT broker — subscribed to '{topic}'")
    else:
        logger.error(f"MQTT connection failed with code {rc}")


def _on_message(client, userdata, msg):
    """Process incoming MQTT sensor payload."""
    app = userdata["app"]

    try:
        payload = json.loads(msg.payload.decode())
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        logger.warning(f"Bad payload on {msg.topic}: {e}")
        return

    hardware_id = payload.get("hardware_id")
    if not hardware_id:
        logger.warning("Payload missing 'hardware_id'")
        return

    with app.app_context():
        sensor = Sensor.query.filter_by(hardware_id=hardware_id).first()
        if not sensor:
            logger.warning(f"Unknown sensor: {hardware_id}")
            return

        smart_bin = SmartBin.query.get(sensor.bin_id)
        if not smart_bin:
            return

        bin_height_cm = float(smart_bin.capacity_liters) * 0.5
        distance_cm = payload.get("distance_cm", 0)
        fill_pct = max(0, min(100, ((bin_height_cm - distance_cm) / bin_height_cm) * 100))

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

        smart_bin.fill_percentage = round(fill_pct, 2)
        smart_bin.status = _fill_to_status(fill_pct)
        sensor.battery_level = payload.get("battery_level")
        sensor.status = "online"

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
        logger.info(f"Sensor {hardware_id} → bin {smart_bin.label}: {round(fill_pct, 1)}%")


def start_mqtt(app):
    """Start the MQTT client in a background thread."""
    broker = app.config["MQTT_BROKER_HOST"]
    port   = app.config["MQTT_BROKER_PORT"]
    topic  = app.config["MQTT_TOPIC_SENSOR"]

    client = mqtt_client.Client(
        mqtt_client.CallbackAPIVersion.VERSION2,
        client_id="smart_waste_backend",
        userdata={"app": app, "topic": topic},
    )
    client.on_connect = _on_connect
    client.on_message = _on_message

    try:
        client.connect(broker, port)
        client.loop_start()
        logger.info(f"MQTT listener started → {broker}:{port}")
    except Exception as e:
        logger.error(f"Could not connect to MQTT broker: {e}")
