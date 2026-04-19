"""
Marshmallow serialization / validation schemas.
"""
from app import ma
from app.models import (
    User, Zone, SmartBin, Sensor, SensorReading,
    Report, ReportImage, Vehicle, CollectionRoute, RouteStop,
    RewardCatalog, UserReward, RewardTransaction,
    Alert, UserNotification, WasteGenerationLog,
)


# ── Users ──────────────────────────────────────────────────────────────
class UserSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = User
        load_instance = True
        exclude = ("password_hash",)


class UserCreateSchema(ma.Schema):
    email      = ma.String(required=True)
    phone      = ma.String()
    password   = ma.String(required=True, load_only=True)
    first_name = ma.String(required=True)
    last_name  = ma.String(required=True)
    role       = ma.String(load_default="resident")
    compound   = ma.String()
    latitude   = ma.Float()
    longitude  = ma.Float()


class LoginSchema(ma.Schema):
    email    = ma.String(required=True)
    password = ma.String(required=True)


# ── Zones ──────────────────────────────────────────────────────────────
class ZoneSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = Zone
        load_instance = True
        exclude = ("boundary",)


# ── Smart Bins ─────────────────────────────────────────────────────────
class SmartBinSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = SmartBin
        load_instance = True
        exclude = ("location",)

    latitude  = ma.Float(dump_only=True)
    longitude = ma.Float(dump_only=True)
    zone      = ma.Nested(ZoneSchema, dump_only=True)


class SmartBinCreateSchema(ma.Schema):
    label           = ma.String(required=True)
    zone_id         = ma.Integer()
    latitude        = ma.Float(required=True)
    longitude       = ma.Float(required=True)
    address         = ma.String()
    capacity_liters = ma.Float(load_default=240)
    bin_type        = ma.String(load_default="general")


# ── Sensors ────────────────────────────────────────────────────────────
class SensorSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = Sensor
        load_instance = True


class SensorReadingSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = SensorReading
        load_instance = True


# ── Reports ────────────────────────────────────────────────────────────
class ReportImageSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = ReportImage
        load_instance = True


class ReportSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = Report
        load_instance = True
        exclude = ("location",)

    latitude  = ma.Float(dump_only=True)
    longitude = ma.Float(dump_only=True)
    images    = ma.Nested(ReportImageSchema, many=True, dump_only=True)
    reporter  = ma.Nested(UserSchema, dump_only=True)


class ReportCreateSchema(ma.Schema):
    category    = ma.String(required=True)
    description = ma.String(required=True)
    latitude    = ma.Float(required=True)
    longitude   = ma.Float(required=True)
    address     = ma.String()
    zone_id     = ma.Integer()


# ── Vehicles ───────────────────────────────────────────────────────────
class VehicleSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = Vehicle
        load_instance = True
        exclude = ("current_location",)


# ── Routes ─────────────────────────────────────────────────────────────
class RouteStopSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = RouteStop
        load_instance = True

    bin = ma.Nested(SmartBinSchema, dump_only=True)


class CollectionRouteSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = CollectionRoute
        load_instance = True
        exclude = ("route_geometry",)

    stops = ma.Nested(RouteStopSchema, many=True, dump_only=True)


# ── Rewards ────────────────────────────────────────────────────────────
class RewardCatalogSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = RewardCatalog
        load_instance = True


class UserRewardSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = UserReward
        load_instance = True


class RewardTransactionSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = RewardTransaction
        load_instance = True


# ── Alerts & Notifications ────────────────────────────────────────────
class AlertSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = Alert
        load_instance = True

    bin = ma.Nested(SmartBinSchema, dump_only=True)


class UserNotificationSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = UserNotification
        load_instance = True


# ── Analytics ──────────────────────────────────────────────────────────
class WasteGenerationLogSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = WasteGenerationLog
        load_instance = True
