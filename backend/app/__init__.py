"""
Application factory — creates and configures the Flask app.
"""
import os
from flask import Flask, request, make_response
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_marshmallow import Marshmallow

from config import config_by_name

# ── Shared extensions (importable from anywhere) ───────────────────────
db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
ma = Marshmallow()

# ── Firebase module (importable from anywhere as  from app import firebase) ──
from app import firebase  # noqa: E402  (module-level import before create_app)


def create_app(config_name: str | None = None) -> Flask:
    """Application factory."""
    if config_name is None:
        config_name = os.getenv("FLASK_ENV", "development")

    app = Flask(__name__)
    app.config.from_object(config_by_name[config_name])

    # ── Initialise extensions ───────────────────────────────────────────
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    ma.init_app(app)
    CORS(
        app,
        resources={r"/api/*": {"origins": "*"}},
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        max_age=600,
    )

    @app.before_request
    def handle_options():
        if request.method == "OPTIONS":
            res = make_response()
            res.headers["Access-Control-Allow-Origin"]  = "*"
            res.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            res.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            res.headers["Access-Control-Max-Age"]       = "600"
            return res

    # ── Initialise Firebase (gracefully skipped if not configured) ──────
    firebase.init_firebase(app)

    # ── Register blueprints ─────────────────────────────────────────────
    from app.api.auth      import auth_bp
    from app.api.bins      import bins_bp
    from app.api.reports   import reports_bp
    from app.api.routes    import routes_bp
    from app.api.rewards   import rewards_bp
    from app.api.dashboard import dashboard_bp
    from app.api.sensors   import sensors_bp
    from app.api.users     import users_bp
    from app.api.uploads   import uploads_bp
    from app.api.vehicles  import vehicles_bp
    from app.api.zones     import zones_bp
    from app.api.drivers   import drivers_bp
    from app.api.alerts    import alerts_bp
    from app.api.schedule  import schedule_bp
    from app.api.tracking  import tracking_bp

    app.register_blueprint(auth_bp,      url_prefix="/api/auth")
    app.register_blueprint(bins_bp,      url_prefix="/api/bins")
    app.register_blueprint(reports_bp,   url_prefix="/api/reports")
    app.register_blueprint(routes_bp,    url_prefix="/api/routes")
    app.register_blueprint(rewards_bp,   url_prefix="/api/rewards")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(sensors_bp,   url_prefix="/api/sensors")
    app.register_blueprint(users_bp,     url_prefix="/api/users")
    app.register_blueprint(uploads_bp,   url_prefix="/api/uploads")
    app.register_blueprint(vehicles_bp,  url_prefix="/api/vehicles")
    app.register_blueprint(zones_bp,     url_prefix="/api/zones")
    app.register_blueprint(drivers_bp,   url_prefix="/api/drivers")
    app.register_blueprint(alerts_bp,    url_prefix="/api/alerts")
    app.register_blueprint(schedule_bp,  url_prefix="/api/schedule")
    app.register_blueprint(tracking_bp,  url_prefix="/api/tracking")

    # ── Root health‐check ───────────────────────────────────────────────
    @app.route("/")
    def health():
        return {
            "status": "ok",
            "service": "Smart Waste Management API — Lusaka",
            "firebase": firebase.is_enabled(),
        }

    return app
