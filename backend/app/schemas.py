"""
schemas.py — Marshmallow serialisation and validation schemas.

Each schema serves one of two purposes:
  1. SQLAlchemyAutoSchema  — serialises ORM model instances to JSON dicts
                             (used in response bodies).
  2. Plain Schema          — validates and deserialises raw request body dicts
                             (used in POST/PUT endpoints before writing to the DB).

Naming convention:
  <Model>Schema       — auto-schema for serialising model instances
  <Model>CreateSchema — plain schema for validating creation payloads

Security note:
  UserSchema explicitly excludes 'password_hash' so it is never leaked
  in any API response — even if the schema is used in a context where
  the full model is available.
"""
from app import ma
from app.models import (
    User, Zone, SmartBin, Sensor, SensorReading,
    Report, ReportImage, Vehicle, CollectionRoute, RouteStop,
    RewardCatalog, UserReward, RewardTransaction,
    Alert, UserNotification, WasteGenerationLog,
    PickupSchedule, PickupRequest, DriverLocation,
)


# ── Users ──────────────────────────────────────────────────────────────────────

class UserSchema(ma.SQLAlchemyAutoSchema):
    """
    Serialises User model instances for API responses.
    password_hash is excluded — NEVER expose password hashes in responses.
    """
    class Meta:
        model         = User
        load_instance = True
        exclude       = ("password_hash",)   # security: never serialise the hash


class UserCreateSchema(ma.Schema):
    """
    Validates the request body for POST /api/auth/register.
    email, password, first_name, last_name are required.
    All other fields are optional with sensible defaults.
    """
    email      = ma.String(required=True)
    phone      = ma.String()
    password   = ma.String(required=True, load_only=True)   # never returned in responses
    first_name = ma.String(required=True)
    last_name  = ma.String(required=True)
    role       = ma.String(load_default="resident")         # default role
    compound   = ma.String()                                # neighbourhood name
    latitude   = ma.Float()
    longitude  = ma.Float()


class LoginSchema(ma.Schema):
    """Validates the request body for POST /api/auth/login."""
    email    = ma.String(required=True)
    password = ma.String(required=True)


# ── Zones ──────────────────────────────────────────────────────────────────────

class ZoneSchema(ma.SQLAlchemyAutoSchema):
    """Serialises Zone model instances (used as a nested schema in SmartBinSchema)."""
    class Meta:
        model         = Zone
        load_instance = True


# ── Smart Bins ─────────────────────────────────────────────────────────────────

class SmartBinSchema(ma.SQLAlchemyAutoSchema):
    """
    Serialises SmartBin instances with their associated zone nested inline.
    The zone field is dump_only — it is populated from the DB relationship,
    not accepted in request bodies.
    """
    class Meta:
        model         = SmartBin
        load_instance = True

    # Nest the full zone object so the frontend can display zone info without a second request
    zone = ma.Nested(ZoneSchema, dump_only=True)


class SmartBinCreateSchema(ma.Schema):
    """Validates the request body for POST /api/bins."""
    label           = ma.String(required=True)
    zone_id         = ma.Integer()
    latitude        = ma.Float(required=True)
    longitude       = ma.Float(required=True)
    address         = ma.String()
    capacity_liters = ma.Float(load_default=240)      # standard wheelie bin default
    bin_type        = ma.String(load_default="general")


# ── Sensors ────────────────────────────────────────────────────────────────────

class SensorSchema(ma.SQLAlchemyAutoSchema):
    """Serialises Sensor instances (includes battery_level, status, last_ping_at)."""
    class Meta:
        model         = Sensor
        load_instance = True


class SensorReadingSchema(ma.SQLAlchemyAutoSchema):
    """
    Serialises a single time-series SensorReading record.
    Used by the /api/sensors/<id>/readings endpoint for historical charts.
    """
    class Meta:
        model         = SensorReading
        load_instance = True


# ── Reports ────────────────────────────────────────────────────────────────────

class ReportImageSchema(ma.SQLAlchemyAutoSchema):
    """Serialises a ReportImage record (nested inside ReportSchema)."""
    class Meta:
        model         = ReportImage
        load_instance = True


class ReportSchema(ma.SQLAlchemyAutoSchema):
    """
    Serialises Report instances with nested images and reporter profile.
    Both nested fields are dump_only — they come from DB relationships,
    not from request bodies.
    """
    class Meta:
        model         = Report
        load_instance = True

    images   = ma.Nested(ReportImageSchema, many=True, dump_only=True)   # attached photos
    reporter = ma.Nested(UserSchema, dump_only=True)                      # who filed the report


class ReportCreateSchema(ma.Schema):
    """
    Validates the request body for POST /api/reports.
    latitude and longitude are required for map pin placement.
    """
    category    = ma.String(required=True)    # e.g. illegal_dumping, overflowing_bin
    description = ma.String(required=True)
    latitude    = ma.Float(required=True)
    longitude   = ma.Float(required=True)
    address     = ma.String()
    zone_id     = ma.Integer()


# ── Vehicles ───────────────────────────────────────────────────────────────────

class VehicleSchema(ma.SQLAlchemyAutoSchema):
    """Serialises Vehicle (truck) instances for fleet management endpoints."""
    class Meta:
        model         = Vehicle
        load_instance = True


# ── Routes ─────────────────────────────────────────────────────────────────────

class RouteStopSchema(ma.SQLAlchemyAutoSchema):
    """
    Serialises a single RouteStop including its nested SmartBin.
    The bin field provides coordinates and status for the route map view.
    """
    class Meta:
        model         = RouteStop
        load_instance = True

    bin = ma.Nested(SmartBinSchema, dump_only=True)   # bin details for the stop


class CollectionRouteSchema(ma.SQLAlchemyAutoSchema):
    """
    Serialises a CollectionRoute with all its stops (ordered by stop_order).
    The stops field is dump_only — stops are created/updated via separate endpoints.
    """
    class Meta:
        model         = CollectionRoute
        load_instance = True

    stops = ma.Nested(RouteStopSchema, many=True, dump_only=True)


# ── Rewards ────────────────────────────────────────────────────────────────────

class RewardCatalogSchema(ma.SQLAlchemyAutoSchema):
    """Serialises a RewardCatalog item (shown in the resident rewards shop)."""
    class Meta:
        model         = RewardCatalog
        load_instance = True


class UserRewardSchema(ma.SQLAlchemyAutoSchema):
    """Serialises a UserReward record (resident's current point balance)."""
    class Meta:
        model         = UserReward
        load_instance = True


class RewardTransactionSchema(ma.SQLAlchemyAutoSchema):
    """Serialises a RewardTransaction (shown in the resident's points history)."""
    class Meta:
        model         = RewardTransaction
        load_instance = True


# ── Alerts & Notifications ─────────────────────────────────────────────────────

class AlertSchema(ma.SQLAlchemyAutoSchema):
    """
    Serialises an Alert with its nested SmartBin for the admin alert panel.
    The bin field lets the frontend show the bin label and location without
    an additional request.
    """
    class Meta:
        model         = Alert
        load_instance = True

    bin = ma.Nested(SmartBinSchema, dump_only=True)   # bin that triggered the alert


class UserNotificationSchema(ma.SQLAlchemyAutoSchema):
    """Serialises a UserNotification for the resident notification bell."""
    class Meta:
        model         = UserNotification
        load_instance = True


# ── Analytics ──────────────────────────────────────────────────────────────────

class WasteGenerationLogSchema(ma.SQLAlchemyAutoSchema):
    """Serialises a daily WasteGenerationLog aggregate for charts."""
    class Meta:
        model         = WasteGenerationLog
        load_instance = True


# ── Pickup Schedules & Requests ────────────────────────────────────────────────

class PickupScheduleSchema(ma.SQLAlchemyAutoSchema):
    """Serialises a PickupSchedule (zone collection calendar entry)."""
    class Meta:
        model         = PickupSchedule
        load_instance = True


class PickupRequestSchema(ma.SQLAlchemyAutoSchema):
    """
    Serialises a PickupRequest (resident's custom pickup).
    The user relationship is excluded to avoid recursion and for brevity —
    the requesting user is already known from the JWT identity.
    """
    class Meta:
        model         = PickupRequest
        load_instance = True
        exclude       = ("user",)   # avoid recursion and unnecessary data in responses


# ── Driver Locations ───────────────────────────────────────────────────────────

class DriverLocationSchema(ma.SQLAlchemyAutoSchema):
    """
    Serialises a DriverLocation with a partial driver profile nested inline.
    Only id, first_name, last_name, and role are included in the nested driver
    object — the full User schema would include unnecessary fields.
    """
    class Meta:
        model         = DriverLocation
        load_instance = True

    # Restrict nested user fields to avoid leaking driver contact/location data
    driver = ma.Nested(UserSchema, dump_only=True, only=("id", "first_name", "last_name", "role"))
