"""
Entry point — run the Flask development server.
Usage:  python run.py
"""
import os
from app import create_app

app = create_app()

if __name__ == "__main__":
    # Optionally start MQTT listener in development
    if os.getenv("MQTT_ENABLED", "false").lower() == "true":
        from app.mqtt_listener import start_mqtt
        start_mqtt(app)

    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", 5000)),
        debug=True,
    )
