"""
app/__init__.py — Application factory for the Lusaka Smart Waste Management API.

Pattern: Flask Application Factory
-----------------------------------
Using create_app() instead of a module-level app object allows:
  - Multiple configurations (development / testing / production) from one codebase.
  - Clean test isolation — each test can spin up its own app instance.
  - Deferred extension initialisation (extensions are bound to a specific app instance).

Extension singletons
--------------------
db, migrate, jwt, ma are created at module level (outside create_app) so that
individual modules (e.g. models.py, api/*.py) can import them without triggering
circular imports.  They are "bound" to the actual Flask app inside create_app()
via .init_app(app).

Firebase
--------
The firebase module is imported at module level so that api modules can do
`from app import firebase` and call firebase.send_push() etc.  Actual SDK
initialisation (firebase.init_firebase) is deferred to create_app() so the
app config is available when we look for credential paths.
"""
import os
from flask import Flask, request, make_response
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_marshmallow import Marshmallow

from config import config_by_name

# ── Shared extension singletons ────────────────────────────────────────────────
# Imported by models.py and all api/*.py modules.
# Do NOT call .init_app() here — that happens inside create_app().
db      = SQLAlchemy()
migrate = Migrate()
jwt     = JWTManager()
ma      = Marshmallow()

# ── Firebase wrapper (importable as `from app import firebase`) ────────────────
# Imported at module level to avoid repeated imports across api modules.
# firebase.init_firebase(app) is called inside create_app() once config is ready.
from app import firebase  # noqa: E402  (intentional module-level import before create_app)


def create_app(config_name: str | None = None) -> Flask:
    """
    Flask application factory.

    Parameters
    ----------
    config_name : str | None
        One of 'development', 'production', or 'testing'.
        Falls back to the FLASK_ENV environment variable, then 'development'.

    Returns
    -------
    Flask
        A fully configured Flask application instance.
    """
    if config_name is None:
        config_name = os.getenv("FLASK_ENV", "development")

    app = Flask(__name__)
    app.config.from_object(config_by_name[config_name])

    # ── Bind extensions to this app instance ──────────────────────────────────
    db.init_app(app)
    migrate.init_app(app, db)   # wires Alembic migrations to the db and app
    jwt.init_app(app)
    ma.init_app(app)

    # ── CORS — allow all origins for the /api/* namespace ─────────────────────
    # In production you should restrict `origins` to your actual frontend domains.
    CORS(
        app,
        resources={r"/api/*": {"origins": "*"}},
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        max_age=600,  # browser can cache the preflight response for 10 minutes
        supports_credentials=False,
        send_wildcard=True,
    )

    @app.before_request
    def handle_options():
        """
        Explicit OPTIONS handler to satisfy CORS preflight requests.

        Flask-CORS handles most cases, but some reverse proxies (nginx, Railway)
        strip or modify CORS headers.  This manual handler guarantees the response.
        """
        if request.method == "OPTIONS":
            res = make_response()
            res.headers["Access-Control-Allow-Origin"]  = "*"
            res.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            res.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            res.headers["Access-Control-Max-Age"]       = "600"
            return res

    @app.after_request
    def after_request(response):
        """Ensure CORS headers are added to all responses."""
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        return response

    # ── Firebase Admin SDK — gracefully skipped if credentials are absent ──────
    # On Render/Railway set FIREBASE_CREDENTIALS_JSON to the full JSON content.
    # Locally set FIREBASE_CREDENTIALS_PATH to the path of your service-account file.
    firebase.init_firebase(app)

    # ── Register API blueprints ────────────────────────────────────────────────
    # Each blueprint lives in its own file under app/api/.
    # All are prefixed with /api/ to separate them from static file serving.
    from app.api.auth      import auth_bp       # registration, login, token refresh
    from app.api.bins      import bins_bp       # smart bin CRUD + proximity search
    from app.api.reports   import reports_bp    # citizen waste reports
    from app.api.routes    import routes_bp     # collection route planning
    from app.api.rewards   import rewards_bp    # resident points & redemptions
    from app.api.dashboard import dashboard_bp  # admin stats & analytics
    from app.api.sensors   import sensors_bp    # sensor readings & health
    from app.api.users     import users_bp      # user profile management
    from app.api.uploads   import uploads_bp    # Firebase Storage image uploads
    from app.api.vehicles  import vehicles_bp   # fleet management
    from app.api.zones     import zones_bp      # zone CRUD
    from app.api.drivers   import drivers_bp    # driver management
    from app.api.alerts    import alerts_bp     # system alert acknowledgement
    from app.api.schedule  import schedule_bp   # pickup schedules & custom requests
    from app.api.tracking  import tracking_bp   # real-time driver GPS

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

    # ── Root health-check — used by Railway / Render uptime probes ────────────
    @app.route("/")
    def health():
        """Simple health check — returns 200 OK with service info."""
        return {
            "status": "ok",
            "service": "Smart Waste Management API — Lusaka",
            "firebase": firebase.is_enabled(),   # tells ops whether FCM / Storage is active
        }

    return app
