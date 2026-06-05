"""
models.py — SQLAlchemy ORM models for the Lusaka Smart Waste Management System.

All geometry uses plain latitude/longitude Float columns (SQLite-compatible).
PostGIS is NOT required; spatial queries use Python-side Haversine math instead.

Model groups:
  1. Users & Auth      — User accounts, roles, refresh tokens
  2. Zones             — City collection zones (e.g., Kalingalinga, Mtendere)
  3. Smart Bins        — Physical IoT bins, sensors, and sensor readings
  4. Citizen Reports   — Resident-submitted waste complaints with optional photos
  5. Vehicles & Fleet  — Collection trucks
  6. Collection Routes — Planned/active collection runs with ordered bin stops
  7. Rewards           — Point-based incentive system for residents
  8. Alerts            — System alerts triggered by sensor thresholds
  9. Analytics         — Daily waste generation logs and ML model registry
 10. Pickup Schedules  — Default zone schedules + resident custom pickup requests
 11. Driver Locations  — Live GPS positions for on-duty collectors
"""
import uuid
from datetime import datetime, timezone
from app import db


def gen_uuid():
    """Generate a new UUID4 string (used as primary key default across most models)."""
    return str(uuid.uuid4())


def utcnow():
    """Return the current UTC timestamp (timezone-aware).
    Preferred over datetime.utcnow() which returns a naive datetime."""
    return datetime.now(timezone.utc)


# ======================================================================
# USERS & AUTH
# ======================================================================

class User(db.Model):
    """
    Core user account for all roles: resident, collector, and admin.

    Roles
    -----
    - resident  : Lusaka citizens who report waste and receive notifications.
    - collector : Truck drivers / field workers who update their GPS and mark
                  route stops as visited.
    - admin     : Lusaka City Council (LCC) staff with full dashboard access.

    Location
    --------
    latitude / longitude store the resident's home GPS pin used to auto-detect
    the nearest SmartBin and to derive zone membership.

    compound
    --------
    Free-text neighbourhood name that is matched against Zone.name to link the
    user to a collection zone (used by the schedule API).
    """
    __tablename__ = "users"

    id            = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    email         = db.Column(db.String(255), unique=True, nullable=False)
    phone         = db.Column(db.String(20), unique=True)
    password_hash = db.Column(db.String(255), nullable=False)   # bcrypt hash — never store plaintext
    first_name    = db.Column(db.String(100), nullable=False)
    last_name     = db.Column(db.String(100), nullable=False)
    role          = db.Column(db.String(20), nullable=False, default="resident")
    profile_image = db.Column(db.Text)                          # URL to image in Firebase Storage
    compound      = db.Column(db.String(150))                   # neighbourhood / estate name
    latitude      = db.Column(db.Float)                         # home GPS latitude
    longitude     = db.Column(db.Float)                         # home GPS longitude
    is_active     = db.Column(db.Boolean, default=True)         # False = soft-deleted / banned
    is_verified   = db.Column(db.Boolean, default=False)        # True after email verification
    fcm_token     = db.Column(db.String(512))                   # Firebase Cloud Messaging device token for push notifications
    created_at    = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at    = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # One user can file many reports (as reporter), and can also be assigned reports (as staff)
    reports       = db.relationship("Report", backref="reporter", lazy="dynamic",
                                     foreign_keys="Report.reporter_id")
    # One-to-one: every resident gets a UserReward record at registration
    rewards       = db.relationship("UserReward", backref="user", uselist=False)
    # Push / in-app notification history
    notifications = db.relationship("UserNotification", backref="user", lazy="dynamic")

    def __repr__(self):
        return f"<User {self.email}>"


class RefreshToken(db.Model):
    """
    Persisted refresh token record for secure JWT rotation.

    On each /auth/refresh call the old token should be revoked (revoked=True)
    and a new row inserted.  This allows full revocation of all sessions
    for a user (e.g. on password change) by setting revoked=True for all rows.

    token_hash stores a hashed version of the actual token — never the raw JWT.
    """
    __tablename__ = "refresh_tokens"

    id          = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id     = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash  = db.Column(db.String(512), nullable=False)    # hashed JWT — raw token is never stored
    device_info = db.Column(db.String(255))                    # optional user-agent / device label
    expires_at  = db.Column(db.DateTime(timezone=True), nullable=False)
    revoked     = db.Column(db.Boolean, default=False)         # True = token has been rotated or invalidated
    created_at  = db.Column(db.DateTime(timezone=True), default=utcnow)


# ======================================================================
# ZONES
# ======================================================================

class Zone(db.Model):
    """
    A geographic collection zone in Lusaka (e.g. Kalingalinga, Mtendere, Kanyama).

    Zones are administrative boundaries used to:
      - Group SmartBins and Reports for dashboard analytics
      - Link residents to their weekly collection schedule
      - Assign CollectionRoutes to trucks

    Zones do NOT store polygon geometry — boundaries are managed separately
    (e.g. in GeoJSON overlays on the Leaflet map).
    """
    __tablename__ = "zones"

    id             = db.Column(db.Integer, primary_key=True)
    name           = db.Column(db.String(150), unique=True, nullable=False)
    population_est = db.Column(db.Integer)                     # estimated residential population for analytics
    description    = db.Column(db.Text)
    created_at     = db.Column(db.DateTime(timezone=True), default=utcnow)

    bins           = db.relationship("SmartBin", backref="zone", lazy="dynamic")
    reports        = db.relationship("Report", backref="zone", lazy="dynamic")


# ======================================================================
# SMART BINS & SENSORS
# ======================================================================

class SmartBin(db.Model):
    """
    A physical IoT-enabled waste bin deployed in the city.

    Fill level
    ----------
    fill_percentage is the primary operational metric (0–100).  It is:
      - Set by the MQTT listener when an ultrasonic sensor reading arrives.
      - Mapped to a human-readable status via FILL_THRESHOLDS in mqtt_listener.py.

    status values: empty | low | medium | high | full | overflow

    capacity_liters is used by the MQTT listener to convert raw distance_cm
    readings into a percentage:
        fill% = ((bin_height_cm - distance_cm) / bin_height_cm) × 100
    where  bin_height_cm ≈ capacity_liters × 0.5  (empirical constant).

    bin_type examples: general | recycling | hazardous | organic
    """
    __tablename__ = "smart_bins"

    id              = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    label           = db.Column(db.String(100), nullable=False)          # human-readable name shown on map
    zone_id         = db.Column(db.Integer, db.ForeignKey("zones.id", ondelete="SET NULL"))
    latitude        = db.Column(db.Float, nullable=False, default=0.0)
    longitude       = db.Column(db.Float, nullable=False, default=0.0)
    address         = db.Column(db.Text)                                 # street address or landmark
    capacity_liters = db.Column(db.Float, default=240)                   # typical wheelie bin = 240 L
    bin_type        = db.Column(db.String(50), default="general")
    status          = db.Column(db.String(20), default="empty")          # derived from fill_percentage
    fill_percentage = db.Column(db.Float, default=0)                     # 0–100, updated on each sensor reading
    last_emptied_at = db.Column(db.DateTime(timezone=True))              # set when a collector marks the stop visited
    installed_at    = db.Column(db.DateTime(timezone=True), default=utcnow)
    created_at      = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at      = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    sensors         = db.relationship("Sensor", backref="bin", lazy="dynamic")
    alerts          = db.relationship("Alert", backref="bin", lazy="dynamic")

    def __repr__(self):
        return f"<SmartBin {self.label} [{self.status}]>"


class Sensor(db.Model):
    """
    An IoT sensor device attached to a SmartBin.

    hardware_id is the unique identifier flashed onto the physical sensor board.
    It is the key used by the MQTT listener to route incoming payloads to the
    correct bin.

    sensor_type examples: ultrasonic | weight | optical | combined

    battery_level is updated each time the sensor sends a reading.
    When battery_level < 15 the dashboard should flag the sensor for maintenance.
    """
    __tablename__ = "sensors"

    id            = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    bin_id        = db.Column(db.String(36), db.ForeignKey("smart_bins.id", ondelete="CASCADE"), nullable=False)
    sensor_type   = db.Column(db.String(50), default="ultrasonic")
    hardware_id   = db.Column(db.String(100), unique=True, nullable=False)   # must match the ID in MQTT payloads
    firmware_ver  = db.Column(db.String(20))                                  # e.g. "1.2.4"
    battery_level = db.Column(db.Float)                                       # percentage 0–100
    status        = db.Column(db.String(20), default="online")                # online | offline | maintenance
    last_ping_at  = db.Column(db.DateTime(timezone=True))                     # timestamp of most recent MQTT message
    installed_at  = db.Column(db.DateTime(timezone=True), default=utcnow)
    created_at    = db.Column(db.DateTime(timezone=True), default=utcnow)

    readings      = db.relationship("SensorReading", backref="sensor", lazy="dynamic")


class SensorReading(db.Model):
    """
    An immutable time-series record of a single sensor measurement.

    One row is inserted per MQTT message.  Do NOT update existing rows —
    the table is an append-only log used for historical analytics and ML training.

    fill_percentage is already computed (0–100) at insert time by the listener.
    distance_cm is the raw ultrasonic reading preserved for debugging / recalibration.
    temperature_c and weight_kg are optional fields from multi-sensor payloads.
    """
    __tablename__ = "sensor_readings"

    id              = db.Column(db.Integer, primary_key=True, autoincrement=True)
    sensor_id       = db.Column(db.String(36), db.ForeignKey("sensors.id", ondelete="CASCADE"), nullable=False)
    bin_id          = db.Column(db.String(36), db.ForeignKey("smart_bins.id", ondelete="CASCADE"), nullable=False)
    fill_percentage = db.Column(db.Float, nullable=False)   # 0–100 — derived from distance_cm
    distance_cm     = db.Column(db.Float)                   # raw ultrasonic distance reading
    temperature_c   = db.Column(db.Float)                   # ambient temperature (optional)
    weight_kg       = db.Column(db.Float)                   # bin weight if load-cell equipped (optional)
    battery_level   = db.Column(db.Float)                   # sensor battery % at time of reading
    recorded_at     = db.Column(db.DateTime(timezone=True), default=utcnow)


# ======================================================================
# CITIZEN REPORTS
# ======================================================================

class Report(db.Model):
    """
    A waste-related complaint or observation submitted by a resident.

    Lifecycle: pending → in_progress → resolved  (or rejected)

    category examples: illegal_dumping | overflowing_bin | missed_collection
                       damaged_bin | littering | other

    The report can optionally be assigned to a staff user (assigned_to)
    who is then responsible for investigating and resolving it.

    Points are awarded to the reporter via the rewards system when the
    status transitions to 'resolved'.
    """
    __tablename__ = "reports"

    id              = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    reporter_id     = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    category        = db.Column(db.String(30), nullable=False)   # type of waste issue
    description     = db.Column(db.Text, nullable=False)
    latitude        = db.Column(db.Float)                         # GPS location of the reported issue
    longitude       = db.Column(db.Float)
    address         = db.Column(db.Text)                          # human-readable address
    zone_id         = db.Column(db.Integer, db.ForeignKey("zones.id", ondelete="SET NULL"))
    status          = db.Column(db.String(20), default="pending")   # pending | in_progress | resolved | rejected
    assigned_to     = db.Column(db.String(36), db.ForeignKey("users.id"))   # LCC staff member handling the report
    resolved_at     = db.Column(db.DateTime(timezone=True))          # timestamp when marked resolved
    resolution_note = db.Column(db.Text)                             # admin's resolution summary
    created_at      = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at      = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    images          = db.relationship("ReportImage", backref="report", lazy="dynamic")


class ReportImage(db.Model):
    """
    A photo attached to a citizen Report.

    Multiple images can be attached per report.
    image_url points to a file in Firebase Storage (uploaded via /api/uploads).
    """
    __tablename__ = "report_images"

    id          = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    report_id   = db.Column(db.String(36), db.ForeignKey("reports.id", ondelete="CASCADE"), nullable=False)
    image_url   = db.Column(db.Text, nullable=False)    # public URL from Firebase Storage
    caption     = db.Column(db.String(255))
    uploaded_at = db.Column(db.DateTime(timezone=True), default=utcnow)


# ======================================================================
# VEHICLES & FLEET
# ======================================================================

class Vehicle(db.Model):
    """
    A waste collection vehicle (truck) in the LCC fleet.

    status values: available | in_use | maintenance | decommissioned

    vehicle_type examples: compactor | tipper | open_truck | mini_truck

    assigned_driver is the default driver — routes may override this.
    """
    __tablename__ = "vehicles"

    id              = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    registration_no = db.Column(db.String(20), unique=True, nullable=False)   # e.g. "BAG 1234 ZM"
    vehicle_type    = db.Column(db.String(50), default="compactor")
    capacity_tons   = db.Column(db.Float, nullable=False)                     # payload capacity
    status          = db.Column(db.String(20), default="available")
    assigned_driver = db.Column(db.String(36), db.ForeignKey("users.id"))     # default driver (nullable)
    created_at      = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at      = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ======================================================================
# COLLECTION ROUTES
# ======================================================================

class CollectionRoute(db.Model):
    """
    A planned or active waste collection run for a specific day.

    A route links a Vehicle + Driver to an ordered list of RouteStop bins.
    The route progresses through statuses:
        planned → in_progress → completed  (or cancelled)

    total_distance_km is calculated at route-creation time using Haversine
    distances between consecutive stops.

    start_time / end_time track actual (not scheduled) operation times
    and are used to compute fleet efficiency metrics on the dashboard.
    """
    __tablename__ = "collection_routes"

    id                = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    name              = db.Column(db.String(150), nullable=False)
    zone_id           = db.Column(db.Integer, db.ForeignKey("zones.id"))
    vehicle_id        = db.Column(db.String(36), db.ForeignKey("vehicles.id"))
    driver_id         = db.Column(db.String(36), db.ForeignKey("users.id"))
    status            = db.Column(db.String(20), default="planned")           # planned | in_progress | completed | cancelled
    scheduled_date    = db.Column(db.Date, nullable=False)
    start_time        = db.Column(db.DateTime(timezone=True))                 # actual start (set when driver begins)
    end_time          = db.Column(db.DateTime(timezone=True))                 # actual end (set when route completes)
    total_distance_km = db.Column(db.Float)                                   # sum of Haversine distances between stops
    notes             = db.Column(db.Text)
    created_at        = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at        = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # stops are ordered by stop_order (ascending) — see RouteStop.stop_order
    stops             = db.relationship("RouteStop", backref="route", lazy="dynamic",
                                         order_by="RouteStop.stop_order")


class RouteStop(db.Model):
    """
    A single bin visit within a CollectionRoute.

    stop_order defines the sequence drivers follow (1, 2, 3 …).
    visited is flipped to True when the driver marks the bin as emptied.
    fill_at_visit records the bin's fill_percentage at the moment of collection
    (for analytics — how full was it when the truck arrived?).
    """
    __tablename__ = "route_stops"

    id            = db.Column(db.Integer, primary_key=True, autoincrement=True)
    route_id      = db.Column(db.String(36), db.ForeignKey("collection_routes.id", ondelete="CASCADE"), nullable=False)
    bin_id        = db.Column(db.String(36), db.ForeignKey("smart_bins.id"), nullable=False)
    stop_order    = db.Column(db.Integer, nullable=False)      # 1-based sequence index
    visited       = db.Column(db.Boolean, default=False)       # True once the bin has been emptied
    visited_at    = db.Column(db.DateTime(timezone=True))      # timestamp of collection
    fill_at_visit = db.Column(db.Float)                        # fill_percentage snapshot at collection time


# ======================================================================
# REWARD / INCENTIVE SYSTEM
# ======================================================================

class RewardCatalog(db.Model):
    """
    An item residents can redeem using accumulated points.

    Examples: Airtel/MTN airtime, ZESCO electricity vouchers, branded merchandise.

    stock = None means unlimited supply.
    stock = 0 means sold out (redemption should be blocked).
    is_active = False hides the item from the resident catalog without deleting it.
    """
    __tablename__ = "reward_catalog"

    id          = db.Column(db.Integer, primary_key=True)
    title       = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    points_cost = db.Column(db.Integer, nullable=False)   # points required to redeem
    stock       = db.Column(db.Integer)                   # None = unlimited; 0 = sold out
    image_url   = db.Column(db.Text)                      # product image for the catalog UI
    is_active   = db.Column(db.Boolean, default=True)
    created_at  = db.Column(db.DateTime(timezone=True), default=utcnow)


class UserReward(db.Model):
    """
    Running point balance for a single resident.

    One row per user (unique=True on user_id).
    Created automatically at user registration (see auth.register).

    total_points    — current spendable balance (decremented on redemption)
    lifetime_points — all-time earned points (never decremented; used for leaderboards)
    """
    __tablename__ = "user_rewards"

    id              = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id         = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    total_points    = db.Column(db.Integer, default=0)        # current redeemable balance
    lifetime_points = db.Column(db.Integer, default=0)        # cumulative all-time points (leaderboard metric)
    updated_at      = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class RewardTransaction(db.Model):
    """
    Immutable audit trail of every point earn or spend event.

    action examples: report_submitted | report_resolved | redemption | bonus | adjustment

    reference_id is the UUID of the related entity (e.g. a Report.id when
    points are awarded for a resolved report).

    Points are positive for earnings, negative for redemptions.
    """
    __tablename__ = "reward_transactions"

    id           = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id      = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action       = db.Column(db.String(30), nullable=False)   # what triggered this transaction
    points       = db.Column(db.Integer, nullable=False)      # positive = earned, negative = spent
    reference_id = db.Column(db.String(36))                   # UUID of related Report / RewardCatalog item
    description  = db.Column(db.Text)                         # human-readable description shown in transaction history
    created_at   = db.Column(db.DateTime(timezone=True), default=utcnow)


# ======================================================================
# ALERTS & NOTIFICATIONS
# ======================================================================

class Alert(db.Model):
    """
    A system-generated alert for the admin dashboard.

    Alerts are created automatically by the MQTT listener when a bin
    exceeds fill thresholds (≥85% → warning, ≥95% → critical).
    They can also be created by the sensors API for offline sensors.

    alert_type examples: bin_full | bin_overflow | sensor_offline | battery_low

    severity: info | warning | critical

    is_read   — marks the alert as seen by an admin (UI badge count)
    resolved  — marks the underlying issue as fixed; hides it from active list
    """
    __tablename__ = "alerts"

    id          = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    bin_id      = db.Column(db.String(36), db.ForeignKey("smart_bins.id", ondelete="CASCADE"))
    alert_type  = db.Column(db.String(30), nullable=False)
    severity    = db.Column(db.String(15), default="info")    # info | warning | critical
    message     = db.Column(db.Text, nullable=False)
    is_read     = db.Column(db.Boolean, default=False)        # True = an admin has seen this alert
    resolved    = db.Column(db.Boolean, default=False)        # True = issue has been addressed
    resolved_at = db.Column(db.DateTime(timezone=True))
    created_at  = db.Column(db.DateTime(timezone=True), default=utcnow)


class UserNotification(db.Model):
    """
    An in-app / push notification sent to a specific resident.

    These are created by backend logic (e.g. when a Report is resolved,
    or when a pickup is confirmed) and delivered via Firebase Cloud Messaging.

    link is an optional deep-link URL (e.g. "/reports/<id>") for the mobile app.
    is_read is updated when the user opens the notification.
    """
    __tablename__ = "user_notifications"

    id         = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id    = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title      = db.Column(db.String(255), nullable=False)
    body       = db.Column(db.Text, nullable=False)
    is_read    = db.Column(db.Boolean, default=False)
    link       = db.Column(db.Text)                           # optional deep-link path
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)


# ======================================================================
# ANALYTICS
# ======================================================================

class WasteGenerationLog(db.Model):
    """
    Aggregated daily waste statistics per zone.

    These rows are written by a nightly batch job (not yet implemented)
    that summarises SensorReading data.  They feed the admin analytics charts.

    avg_fill_pct — mean fill level of all bins in the zone on that day
    bins_emptied — how many bins were collected (RouteStop.visited == True)
    """
    __tablename__ = "waste_generation_logs"

    id              = db.Column(db.Integer, primary_key=True, autoincrement=True)
    zone_id         = db.Column(db.Integer, db.ForeignKey("zones.id"), nullable=False)
    log_date        = db.Column(db.Date, nullable=False)
    total_volume_l  = db.Column(db.Float)    # estimated total litres collected
    total_weight_kg = db.Column(db.Float)    # estimated total weight if sensors report weight
    bins_emptied    = db.Column(db.Integer)  # count of bins serviced that day
    avg_fill_pct    = db.Column(db.Float)    # zone-wide average fill percentage


class MLModel(db.Model):
    """
    Registry of ML models used for waste generation forecasting.

    Only one model should have is_active=True at any time — the analytics
    endpoint uses it to serve predictions.

    model_path points to a serialised model file (e.g. a scikit-learn pickle
    or a TensorFlow SavedModel directory) accessible from the backend server.

    accuracy is the model's validation metric (e.g. R² or MAE) recorded at training time.
    """
    __tablename__ = "ml_models"

    id          = db.Column(db.Integer, primary_key=True)
    model_name  = db.Column(db.String(150), nullable=False)
    version     = db.Column(db.String(20), nullable=False)   # semver string e.g. "1.0.0"
    description = db.Column(db.Text)
    accuracy    = db.Column(db.Float)                         # validation accuracy / R² score
    model_path  = db.Column(db.Text, nullable=False)          # filesystem or storage path to serialised model
    trained_at  = db.Column(db.DateTime(timezone=True), default=utcnow)
    is_active   = db.Column(db.Boolean, default=False)        # only one model should be active at a time
    created_at  = db.Column(db.DateTime(timezone=True), default=utcnow)


# ======================================================================
# AUDIT LOG
# ======================================================================

class AuditLog(db.Model):
    """
    Append-only record of significant admin / system actions.

    Used for accountability (who changed what) and security auditing.

    entity_type / entity_id identify the object that was modified
    (e.g. entity_type="SmartBin", entity_id="<uuid>").

    details stores a JSON diff or context object for the action.
    ip_address is the originating request IP (IPv4 or IPv6, up to 45 chars).
    """
    __tablename__ = "audit_log"

    id          = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id     = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"))
    action      = db.Column(db.String(100), nullable=False)    # e.g. "bin.create", "report.resolve"
    entity_type = db.Column(db.String(50))
    entity_id   = db.Column(db.String(36))
    details     = db.Column(db.JSON)                            # before/after values or contextual data
    ip_address  = db.Column(db.String(45))                     # supports IPv6 (max 39 chars) + IPv4-mapped
    created_at  = db.Column(db.DateTime(timezone=True), default=utcnow)


# ======================================================================
# PICKUP SCHEDULES & CUSTOM PICKUP REQUESTS
# ======================================================================

class PickupSchedule(db.Model):
    """
    Zone-level default garbage collection schedule (which day(s) trucks come).

    day_of_week follows Python's weekday() convention: 0=Monday … 6=Sunday.

    time_slot values: morning | afternoon | evening
    frequency values: weekly | biweekly

    Multiple rows per zone are allowed (e.g. Zone 3 collects on both
    Monday morning and Thursday afternoon).
    """
    __tablename__ = "pickup_schedules"

    id          = db.Column(db.Integer, primary_key=True)
    zone_id     = db.Column(db.Integer, db.ForeignKey("zones.id", ondelete="CASCADE"), nullable=False)
    day_of_week = db.Column(db.Integer, nullable=False)         # 0=Mon … 6=Sun (Python weekday)
    time_slot   = db.Column(db.String(20), default="morning")   # morning | afternoon | evening
    frequency   = db.Column(db.String(20), default="weekly")    # weekly | biweekly
    is_active   = db.Column(db.Boolean, default=True)
    created_at  = db.Column(db.DateTime(timezone=True), default=utcnow)

    zone        = db.relationship("Zone", backref=db.backref("schedules", lazy="dynamic"))


class PickupRequest(db.Model):
    """
    A resident's request for a custom (non-schedule) waste collection.

    Use case: bulky item disposal, post-event cleanup, special medical waste.

    Lifecycle: pending → confirmed → completed
               pending → cancelled (by resident or admin)

    time_preference: morning | afternoon | evening (resident's preferred window)
    confirmed_date may differ from requested_date if admin reschedules.
    """
    __tablename__ = "pickup_requests"

    id              = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id         = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    zone_id         = db.Column(db.Integer, db.ForeignKey("zones.id"))
    requested_date  = db.Column(db.Date, nullable=False)                        # resident's preferred date
    time_preference = db.Column(db.String(20), default="morning")               # preferred time window
    description     = db.Column(db.Text)                                        # what needs collecting
    # Status flow: pending → confirmed → completed  |  pending → cancelled
    status          = db.Column(db.String(20), default="pending")
    confirmed_date  = db.Column(db.Date)                                        # actual confirmed date (may differ from requested)
    notes           = db.Column(db.Text)                                        # admin notes or rejection reason
    created_at      = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at      = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = db.relationship("User", backref=db.backref("pickup_requests", lazy="dynamic"))


# ======================================================================
# REAL-TIME DRIVER LOCATIONS
# ======================================================================

class DriverLocation(db.Model):
    """
    Live GPS position for an on-duty waste collector / driver.

    One row per driver (unique=True on driver_id).  Each PUT to
    /api/tracking/location upserts this row rather than inserting a new one —
    we only need the latest position, not history.

    Default coordinates (-15.4167, 28.2833) are the centre of Lusaka city
    and are used as the initial position before the driver sends their first ping.

    heading  — compass bearing in degrees (0 = North, 90 = East, …)
    speed_kmh — current speed (useful for animating the truck icon on the map)
    route_name — display label shown in the resident's live-map view

    Stale detection: the tracking API filters out rows where updated_at is
    older than STALE_MINUTES (default 10) so the map only shows active trucks.
    """
    __tablename__ = "driver_locations"

    id         = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    driver_id  = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"),
                           nullable=False, unique=True)         # one row per driver — upserted on each GPS ping
    latitude   = db.Column(db.Float, nullable=False, default=-15.4167)   # default = Lusaka city centre
    longitude  = db.Column(db.Float, nullable=False, default=28.2833)
    heading    = db.Column(db.Float, default=0)       # compass bearing 0–360 (for truck icon rotation on map)
    speed_kmh  = db.Column(db.Float, default=0)       # current speed (used to animate marker)
    is_on_duty = db.Column(db.Boolean, default=False) # False hides the driver from the resident map
    route_name = db.Column(db.String(150))            # display label e.g. "Zone 3 — Morning Run"
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    driver = db.relationship("User", backref=db.backref("location", uselist=False))
