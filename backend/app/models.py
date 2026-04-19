"""
SQLAlchemy ORM models — mirrors the PostgreSQL schema.
"""
from datetime import datetime, timezone
from geoalchemy2 import Geometry
from app import db


# ── Helpers ────────────────────────────────────────────────────────────
def utcnow():
    return datetime.now(timezone.utc)


# ======================================================================
# USERS & AUTH
# ======================================================================
class User(db.Model):
    __tablename__ = "users"

    id            = db.Column(db.String(36), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    email         = db.Column(db.String(255), unique=True, nullable=False)
    phone         = db.Column(db.String(20), unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    first_name    = db.Column(db.String(100), nullable=False)
    last_name     = db.Column(db.String(100), nullable=False)
    role          = db.Column(db.String(20), nullable=False, default="resident")
    profile_image = db.Column(db.Text)
    compound      = db.Column(db.String(150))
    location      = db.Column(Geometry("POINT", srid=4326))
    is_active     = db.Column(db.Boolean, default=True)
    is_verified   = db.Column(db.Boolean, default=False)
    created_at    = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at    = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    reports       = db.relationship("Report", backref="reporter", lazy="dynamic",
                                     foreign_keys="Report.reporter_id")
    rewards       = db.relationship("UserReward", backref="user", uselist=False)
    notifications = db.relationship("UserNotification", backref="user", lazy="dynamic")

    def __repr__(self):
        return f"<User {self.email}>"


class RefreshToken(db.Model):
    __tablename__ = "refresh_tokens"

    id          = db.Column(db.String(36), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    user_id     = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash  = db.Column(db.String(512), nullable=False)
    device_info = db.Column(db.String(255))
    expires_at  = db.Column(db.DateTime(timezone=True), nullable=False)
    revoked     = db.Column(db.Boolean, default=False)
    created_at  = db.Column(db.DateTime(timezone=True), default=utcnow)


# ======================================================================
# ZONES
# ======================================================================
class Zone(db.Model):
    __tablename__ = "zones"

    id             = db.Column(db.Integer, primary_key=True)
    name           = db.Column(db.String(150), unique=True, nullable=False)
    boundary       = db.Column(Geometry("POLYGON", srid=4326))
    population_est = db.Column(db.Integer)
    description    = db.Column(db.Text)
    created_at     = db.Column(db.DateTime(timezone=True), default=utcnow)

    bins           = db.relationship("SmartBin", backref="zone", lazy="dynamic")
    reports        = db.relationship("Report", backref="zone", lazy="dynamic")


# ======================================================================
# SMART BINS & SENSORS
# ======================================================================
class SmartBin(db.Model):
    __tablename__ = "smart_bins"

    id              = db.Column(db.String(36), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    label           = db.Column(db.String(100), nullable=False)
    zone_id         = db.Column(db.Integer, db.ForeignKey("zones.id", ondelete="SET NULL"))
    location        = db.Column(Geometry("POINT", srid=4326), nullable=False)
    address         = db.Column(db.Text)
    capacity_liters = db.Column(db.Numeric(8, 2), default=240)
    bin_type        = db.Column(db.String(50), default="general")
    status          = db.Column(db.String(20), default="empty")
    fill_percentage = db.Column(db.Numeric(5, 2), default=0)
    last_emptied_at = db.Column(db.DateTime(timezone=True))
    installed_at    = db.Column(db.DateTime(timezone=True), default=utcnow)
    created_at      = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at      = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    sensors         = db.relationship("Sensor", backref="bin", lazy="dynamic")
    alerts          = db.relationship("Alert", backref="bin", lazy="dynamic")

    def __repr__(self):
        return f"<SmartBin {self.label} [{self.status}]>"


class Sensor(db.Model):
    __tablename__ = "sensors"

    id           = db.Column(db.String(36), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    bin_id       = db.Column(db.String(36), db.ForeignKey("smart_bins.id", ondelete="CASCADE"), nullable=False)
    sensor_type  = db.Column(db.String(50), default="ultrasonic")
    hardware_id  = db.Column(db.String(100), unique=True, nullable=False)
    firmware_ver = db.Column(db.String(20))
    battery_level = db.Column(db.Numeric(5, 2))
    status       = db.Column(db.String(20), default="online")
    last_ping_at = db.Column(db.DateTime(timezone=True))
    installed_at = db.Column(db.DateTime(timezone=True), default=utcnow)
    created_at   = db.Column(db.DateTime(timezone=True), default=utcnow)

    readings     = db.relationship("SensorReading", backref="sensor", lazy="dynamic")


class SensorReading(db.Model):
    __tablename__ = "sensor_readings"

    id              = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    sensor_id       = db.Column(db.String(36), db.ForeignKey("sensors.id", ondelete="CASCADE"), nullable=False)
    bin_id          = db.Column(db.String(36), db.ForeignKey("smart_bins.id", ondelete="CASCADE"), nullable=False)
    fill_percentage = db.Column(db.Numeric(5, 2), nullable=False)
    distance_cm     = db.Column(db.Numeric(8, 2))
    temperature_c   = db.Column(db.Numeric(5, 2))
    weight_kg       = db.Column(db.Numeric(8, 2))
    battery_level   = db.Column(db.Numeric(5, 2))
    recorded_at     = db.Column(db.DateTime(timezone=True), default=utcnow)


# ======================================================================
# CITIZEN REPORTS
# ======================================================================
class Report(db.Model):
    __tablename__ = "reports"

    id              = db.Column(db.String(36), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    reporter_id     = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    category        = db.Column(db.String(30), nullable=False)
    description     = db.Column(db.Text, nullable=False)
    location        = db.Column(Geometry("POINT", srid=4326), nullable=False)
    address         = db.Column(db.Text)
    zone_id         = db.Column(db.Integer, db.ForeignKey("zones.id", ondelete="SET NULL"))
    status          = db.Column(db.String(20), default="pending")
    assigned_to     = db.Column(db.String(36), db.ForeignKey("users.id"))
    resolved_at     = db.Column(db.DateTime(timezone=True))
    resolution_note = db.Column(db.Text)
    created_at      = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at      = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    images          = db.relationship("ReportImage", backref="report", lazy="dynamic")


class ReportImage(db.Model):
    __tablename__ = "report_images"

    id          = db.Column(db.String(36), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    report_id   = db.Column(db.String(36), db.ForeignKey("reports.id", ondelete="CASCADE"), nullable=False)
    image_url   = db.Column(db.Text, nullable=False)
    caption     = db.Column(db.String(255))
    uploaded_at = db.Column(db.DateTime(timezone=True), default=utcnow)


# ======================================================================
# VEHICLES & FLEET
# ======================================================================
class Vehicle(db.Model):
    __tablename__ = "vehicles"

    id               = db.Column(db.String(36), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    registration_no  = db.Column(db.String(20), unique=True, nullable=False)
    vehicle_type     = db.Column(db.String(50), default="compactor")
    capacity_tons    = db.Column(db.Numeric(6, 2), nullable=False)
    status           = db.Column(db.String(20), default="available")
    current_location = db.Column(Geometry("POINT", srid=4326))
    assigned_driver  = db.Column(db.String(36), db.ForeignKey("users.id"))
    created_at       = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at       = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ======================================================================
# COLLECTION ROUTES
# ======================================================================
class CollectionRoute(db.Model):
    __tablename__ = "collection_routes"

    id                = db.Column(db.String(36), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    name              = db.Column(db.String(150), nullable=False)
    zone_id           = db.Column(db.Integer, db.ForeignKey("zones.id"))
    vehicle_id        = db.Column(db.String(36), db.ForeignKey("vehicles.id"))
    driver_id         = db.Column(db.String(36), db.ForeignKey("users.id"))
    status            = db.Column(db.String(20), default="planned")
    scheduled_date    = db.Column(db.Date, nullable=False)
    start_time        = db.Column(db.DateTime(timezone=True))
    end_time          = db.Column(db.DateTime(timezone=True))
    total_distance_km = db.Column(db.Numeric(8, 2))
    route_geometry    = db.Column(Geometry("LINESTRING", srid=4326))
    notes             = db.Column(db.Text)
    created_at        = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at        = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    stops             = db.relationship("RouteStop", backref="route", lazy="dynamic",
                                         order_by="RouteStop.stop_order")


class RouteStop(db.Model):
    __tablename__ = "route_stops"

    id           = db.Column(db.Integer, primary_key=True, autoincrement=True)
    route_id     = db.Column(db.String(36), db.ForeignKey("collection_routes.id", ondelete="CASCADE"), nullable=False)
    bin_id       = db.Column(db.String(36), db.ForeignKey("smart_bins.id"), nullable=False)
    stop_order   = db.Column(db.Integer, nullable=False)
    visited      = db.Column(db.Boolean, default=False)
    visited_at   = db.Column(db.DateTime(timezone=True))
    fill_at_visit = db.Column(db.Numeric(5, 2))


# ======================================================================
# REWARD / INCENTIVE SYSTEM
# ======================================================================
class RewardCatalog(db.Model):
    __tablename__ = "reward_catalog"

    id          = db.Column(db.Integer, primary_key=True)
    title       = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    points_cost = db.Column(db.Integer, nullable=False)
    stock       = db.Column(db.Integer)
    image_url   = db.Column(db.Text)
    is_active   = db.Column(db.Boolean, default=True)
    created_at  = db.Column(db.DateTime(timezone=True), default=utcnow)


class UserReward(db.Model):
    __tablename__ = "user_rewards"

    id              = db.Column(db.String(36), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    user_id         = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    total_points    = db.Column(db.Integer, default=0)
    lifetime_points = db.Column(db.Integer, default=0)
    updated_at      = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class RewardTransaction(db.Model):
    __tablename__ = "reward_transactions"

    id           = db.Column(db.String(36), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    user_id      = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action       = db.Column(db.String(30), nullable=False)
    points       = db.Column(db.Integer, nullable=False)
    reference_id = db.Column(db.String(36))
    description  = db.Column(db.Text)
    created_at   = db.Column(db.DateTime(timezone=True), default=utcnow)


# ======================================================================
# ALERTS & NOTIFICATIONS
# ======================================================================
class Alert(db.Model):
    __tablename__ = "alerts"

    id          = db.Column(db.String(36), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    bin_id      = db.Column(db.String(36), db.ForeignKey("smart_bins.id", ondelete="CASCADE"))
    alert_type  = db.Column(db.String(30), nullable=False)
    severity    = db.Column(db.String(15), default="info")
    message     = db.Column(db.Text, nullable=False)
    is_read     = db.Column(db.Boolean, default=False)
    resolved    = db.Column(db.Boolean, default=False)
    resolved_at = db.Column(db.DateTime(timezone=True))
    created_at  = db.Column(db.DateTime(timezone=True), default=utcnow)


class UserNotification(db.Model):
    __tablename__ = "user_notifications"

    id         = db.Column(db.String(36), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    user_id    = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title      = db.Column(db.String(255), nullable=False)
    body       = db.Column(db.Text, nullable=False)
    is_read    = db.Column(db.Boolean, default=False)
    link       = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)


# ======================================================================
# ANALYTICS
# ======================================================================
class WasteGenerationLog(db.Model):
    __tablename__ = "waste_generation_logs"

    id              = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    zone_id         = db.Column(db.Integer, db.ForeignKey("zones.id"), nullable=False)
    log_date        = db.Column(db.Date, nullable=False)
    total_volume_l  = db.Column(db.Numeric(12, 2))
    total_weight_kg = db.Column(db.Numeric(12, 2))
    bins_emptied    = db.Column(db.Integer)
    avg_fill_pct    = db.Column(db.Numeric(5, 2))
    weather_temp_c  = db.Column(db.Numeric(5, 2))
    weather_rain_mm = db.Column(db.Numeric(6, 2))

    __table_args__ = (db.UniqueConstraint("zone_id", "log_date"),)


class MLModel(db.Model):
    __tablename__ = "ml_models"

    id          = db.Column(db.Integer, primary_key=True)
    model_name  = db.Column(db.String(150), nullable=False)
    version     = db.Column(db.String(20), nullable=False)
    description = db.Column(db.Text)
    accuracy    = db.Column(db.Numeric(5, 4))
    model_path  = db.Column(db.Text, nullable=False)
    trained_at  = db.Column(db.DateTime(timezone=True), default=utcnow)
    is_active   = db.Column(db.Boolean, default=False)
    created_at  = db.Column(db.DateTime(timezone=True), default=utcnow)


# ======================================================================
# AUDIT LOG
# ======================================================================
class AuditLog(db.Model):
    __tablename__ = "audit_log"

    id          = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    user_id     = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"))
    action      = db.Column(db.String(100), nullable=False)
    entity_type = db.Column(db.String(50))
    entity_id   = db.Column(db.String(36))
    details     = db.Column(db.JSON)
    ip_address  = db.Column(db.String(45))
    created_at  = db.Column(db.DateTime(timezone=True), default=utcnow)
