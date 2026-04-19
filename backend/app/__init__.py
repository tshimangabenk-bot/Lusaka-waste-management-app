"""
Application factory — creates and configures the Flask app.
"""
import os
from flask import Flask
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
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # ── Register blueprints ─────────────────────────────────────────────
    from app.api.auth      import auth_bp
    from app.api.bins      import bins_bp
    from app.api.reports   import reports_bp
    from app.api.routes    import routes_bp
    from app.api.rewards   import rewards_bp
    from app.api.dashboard import dashboard_bp
    from app.api.sensors   import sensors_bp

    app.register_blueprint(auth_bp,      url_prefix="/api/auth")
    app.register_blueprint(bins_bp,      url_prefix="/api/bins")
    app.register_blueprint(reports_bp,   url_prefix="/api/reports")
    app.register_blueprint(routes_bp,    url_prefix="/api/routes")
    app.register_blueprint(rewards_bp,   url_prefix="/api/rewards")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(sensors_bp,   url_prefix="/api/sensors")

    # ── Root health‐check ───────────────────────────────────────────────
    @app.route("/")
    def health():
        return {"status": "ok", "service": "Smart Waste Management API — Lusaka"}

    return app
