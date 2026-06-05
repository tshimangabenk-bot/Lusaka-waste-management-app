"""
config.py — Application Configuration.

Loads settings from environment variables (via python-dotenv) and provides
three configuration classes:

  DevelopmentConfig — DEBUG=True, MariaDB via XAMPP (default)
  ProductionConfig  — DEBUG=False, MariaDB (via DATABASE_URL)
  TestingConfig     — in-memory SQLite, TESTING=True

The active config is selected by the FLASK_ENV environment variable
(default: 'development').  Pass a config name to create_app() to override.

Environment variables (set in .env for local dev, or in cloud dashboard):
  SECRET_KEY               — Flask session secret (CHANGE IN PRODUCTION)
  DATABASE_URL             — MariaDB connection string (e.g. mysql+pymysql://root:@localhost/smart_waste_lusaka)
  JWT_SECRET_KEY           — signing key for JWT tokens  (CHANGE IN PRODUCTION)
  JWT_ACCESS_TOKEN_EXPIRES — access token lifetime in seconds (default: 3600 = 1h)
  JWT_REFRESH_TOKEN_EXPIRES— refresh token lifetime in seconds (default: 2592000 = 30d)
  MQTT_BROKER_HOST         — hostname of the MQTT broker (default: localhost)
  MQTT_BROKER_PORT         — MQTT port (default: 1883; use 8883 for TLS)
  MQTT_TOPIC_SENSOR        — MQTT topic pattern (default: smart_waste/sensors/#)
  GOOGLE_MAPS_API_KEY      — used by the frontend for geocoding (optional)
  FIREBASE_CREDENTIALS_PATH— local path to service account JSON (dev only)
  FIREBASE_STORAGE_BUCKET  — Firebase Storage bucket name (e.g. myapp.appspot.com)

XAMPP / MariaDB setup:
  1. Start XAMPP and ensure Apache + MySQL (MariaDB) are running.
  2. Open phpMyAdmin (http://localhost/phpmyadmin) and create a database
     named  smart_waste_lusaka  with utf8mb4_unicode_ci collation.
  3. Copy .env.example to .env — the default DATABASE_URL already points
     to XAMPP's root user with no password (adjust if you set one).
  4. Run:  flask db upgrade   to apply all migrations.
"""
import os
from datetime import timedelta
from dotenv import load_dotenv

# Load .env file if present (no-op in production where vars are set directly)
load_dotenv()


class Config:
    """
    Base configuration shared by all environments.

    All sensitive defaults (SECRET_KEY, JWT_SECRET_KEY) are clearly labelled
    as development-only.  Production deployments MUST override them via
    environment variables.
    """

    # Flask session and CSRF secret — override in production!
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-me")

    # ── Database ────────────────────────────────────────────────────────
    # Default points to XAMPP's MariaDB with no password (root user, no pass).
    # Adjust user/password/host/port/dbname to match your XAMPP setup.
    # Format: mysql+pymysql://<user>:<password>@<host>:<port>/<dbname>
    _db_url = os.getenv(
        "DATABASE_URL",
        "mysql+pymysql://root:@localhost:3306/smart_waste_lusaka"
    )

    SQLALCHEMY_DATABASE_URI        = _db_url
    SQLALCHEMY_TRACK_MODIFICATIONS = False   # disable FSADeprecationWarning

    # MariaDB uses a connection pool.  pool_pre_ping tests connections before
    # use, which prevents "MySQL server has gone away" errors on idle connections.
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_size": 10,
        "pool_recycle": 280,   # recycle connections before MariaDB's wait_timeout (default 300s)
    }

    # ── JWT ─────────────────────────────────────────────────────────────
    # Override both keys in production — the defaults are insecure!
    JWT_SECRET_KEY             = os.getenv("JWT_SECRET_KEY", "jwt-dev-secret")
    JWT_ACCESS_TOKEN_EXPIRES   = timedelta(
        seconds=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES", 3600))   # default: 1 hour
    )
    JWT_REFRESH_TOKEN_EXPIRES  = timedelta(
        seconds=int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES", 2592000))  # default: 30 days
    )

    # ── MQTT ────────────────────────────────────────────────────────────
    MQTT_BROKER_HOST   = os.getenv("MQTT_BROKER_HOST", "localhost")
    MQTT_BROKER_PORT   = int(os.getenv("MQTT_BROKER_PORT", 1883))
    # '#' is an MQTT multi-level wildcard — matches all sub-topics
    MQTT_TOPIC_SENSOR  = os.getenv("MQTT_TOPIC_SENSOR", "smart_waste/sensors/#")

    # ── External APIs ───────────────────────────────────────────────────
    GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")   # used by frontend for geocoding

    # ── Firebase ────────────────────────────────────────────────────────
    # For production: set FIREBASE_CREDENTIALS_JSON (inline JSON) instead of a file path
    FIREBASE_CREDENTIALS_PATH = os.getenv("FIREBASE_CREDENTIALS_PATH", "")
    FIREBASE_STORAGE_BUCKET   = os.getenv("FIREBASE_STORAGE_BUCKET", "")


class DevelopmentConfig(Config):
    """Development environment — enables Flask debug mode and the interactive reloader."""
    DEBUG = True


class ProductionConfig(Config):
    """
    Production environment — debug disabled, errors must be caught and logged.

    Ensure these env vars are set in your production environment:
      SECRET_KEY, JWT_SECRET_KEY, DATABASE_URL (mysql+pymysql://...), FIREBASE_CREDENTIALS_JSON
    """
    DEBUG = False


class TestingConfig(Config):
    """
    Test environment — uses an in-memory SQLite database.

    The DB is created fresh for each test run and discarded afterwards.
    No .db file is written to disk.
    """
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"


# Maps config names (used as FLASK_ENV values) to their Config classes.
# create_app() looks up the active class from this dict.
config_by_name = {
    "development": DevelopmentConfig,
    "production":  ProductionConfig,
    "testing":     TestingConfig,
}
