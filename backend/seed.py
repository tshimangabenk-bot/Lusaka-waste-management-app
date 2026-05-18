"""
Seed script — creates all tables and populates sample data for development.
Run once:  python seed.py
Re-run safely: skips if already seeded.
"""
from datetime import datetime, timezone, timedelta, date
from werkzeug.security import generate_password_hash
from app import create_app, db
from app.models import (
    User, UserReward, RewardCatalog, RewardTransaction,
    Report, UserNotification, SmartBin, Zone, Vehicle,
    CollectionRoute, RouteStop, Alert, MLModel,
    PickupSchedule, DriverLocation,
)


def seed():
    app = create_app("development")
    with app.app_context():
        # ── Wipe & recreate if partially seeded (old seed), skip if fully seeded ──
        admin_exists = User.query.filter_by(email="admin@lcc.zm").first()
        if admin_exists and Zone.query.count() >= 5:
            print("Database already fully seeded. Skipping.")
            return

        print("Dropping existing tables and recreating…")
        db.drop_all()
        db.create_all()
        print("Tables created.")

        # ── Zones ──────────────────────────────────────────────────────────
        zones_data = [
            dict(name="Kabulonga",  population_est=45_000, description="Upmarket residential area"),
            dict(name="Northmead",  population_est=38_000, description="Mixed-use suburb, north of CBD"),
            dict(name="Kanyama",    population_est=82_000, description="High-density compound, west Lusaka"),
            dict(name="Matero",     population_est=70_000, description="High-density residential compound"),
            dict(name="Chelston",   population_est=31_000, description="Low-density suburb near Great East Rd"),
        ]
        zones = {}
        for zd in zones_data:
            z = Zone(**zd)
            db.session.add(z)
            db.session.flush()
            zones[zd["name"]] = z

        # ── Admin user ─────────────────────────────────────────────────────
        admin = User(
            email="admin@lcc.zm",
            password_hash=generate_password_hash("admin123"),
            first_name="Isaac",
            last_name="Banda",
            role="admin",
            compound="Kabulonga",
            is_active=True,
            is_verified=True,
        )
        db.session.add(admin)

        # ── Supervisor user ────────────────────────────────────────────────
        supervisor = User(
            email="supervisor@lcc.zm",
            password_hash=generate_password_hash("super123"),
            first_name="Grace",
            last_name="Phiri",
            role="supervisor",
            compound="Northmead",
            is_active=True,
            is_verified=True,
        )
        db.session.add(supervisor)

        # ── Collector (driver) users ───────────────────────────────────────
        driver1 = User(
            email="driver1@lcc.zm",
            password_hash=generate_password_hash("driver123"),
            first_name="James",
            last_name="Mulenga",
            role="collector",
            compound="Kanyama",
            is_active=True,
            is_verified=True,
        )
        driver2 = User(
            email="driver2@lcc.zm",
            password_hash=generate_password_hash("driver123"),
            first_name="Mary",
            last_name="Chanda",
            role="collector",
            compound="Matero",
            is_active=True,
            is_verified=True,
        )
        db.session.add(driver1)
        db.session.add(driver2)

        # ── Resident user ──────────────────────────────────────────────────
        resident = User(
            email="resident@example.com",
            password_hash=generate_password_hash("password123"),
            first_name="Chanda",
            last_name="Mwale",
            role="resident",
            compound="Kabulonga",
            is_active=True,
            is_verified=True,
            latitude=-15.3850,
            longitude=28.3100,
        )
        db.session.add(resident)
        db.session.flush()

        db.session.add(UserReward(user_id=resident.id, total_points=340, lifetime_points=780))

        # ── Reports ────────────────────────────────────────────────────────
        reports_data = [
            dict(category="overflowing_bin",   status="resolved",    address="Manda Hill Rd",
                 description="Bin near Manda Hill overflowing for 3 days.",
                 days_ago=7, latitude=-15.4144, longitude=28.3069, zone="Kabulonga"),
            dict(category="illegal_dumping",   status="in_progress", address="Northmead Avenue",
                 description="Large pile of debris dumped near drainage channel.",
                 days_ago=5, latitude=-15.3950, longitude=28.3200, zone="Northmead"),
            dict(category="missed_collection", status="pending",     address="Ibex Hill",
                 description="Collection truck missed our street this week.",
                 days_ago=1, latitude=-15.3700, longitude=28.3350, zone="Chelston"),
        ]
        for d in reports_data:
            r = Report(
                reporter_id=resident.id,
                category=d["category"],
                description=d["description"],
                status=d["status"],
                address=d["address"],
                latitude=d["latitude"],
                longitude=d["longitude"],
                zone_id=zones[d["zone"]].id,
                created_at=datetime.now(timezone.utc) - timedelta(days=d["days_ago"]),
            )
            db.session.add(r)

        # ── Reward transactions ────────────────────────────────────────────
        txns = [
            dict(action="report_verified", points=10,  days_ago=7,
                 description="Points earned for submitting report: overflowing_bin"),
            dict(action="report_verified", points=10,  days_ago=5,
                 description="Points earned for submitting report: illegal_dumping"),
            dict(action="redemption",      points=-80, days_ago=10,
                 description="Redeemed: Lusaka Bus Pass"),
            dict(action="report_verified", points=10,  days_ago=1,
                 description="Points earned for submitting report: missed_collection"),
        ]
        for t in txns:
            db.session.add(RewardTransaction(
                user_id=resident.id,
                action=t["action"],
                points=t["points"],
                description=t["description"],
                created_at=datetime.now(timezone.utc) - timedelta(days=t["days_ago"]),
            ))

        # ── Reward catalog ─────────────────────────────────────────────────
        catalog = [
            dict(title="Lusaka Bus Pass (1 week)",
                 description="One-week unlimited ride pass on Lusaka city buses.",
                 points_cost=80, stock=12),
            dict(title="Reusable Bag Set",
                 description="Set of 3 durable, eco-friendly shopping bags.",
                 points_cost=40, stock=30),
            dict(title="LCC Recycling Bin",
                 description="Personal 20L colour-coded recycling bin.",
                 points_cost=120, stock=5),
            dict(title="Community Garden Voucher",
                 description="One session at the Lusaka Community Garden.",
                 points_cost=60, stock=None),
        ]
        for c in catalog:
            db.session.add(RewardCatalog(**c, is_active=True))

        # ── Notifications ──────────────────────────────────────────────────
        notifs = [
            dict(title="Report resolved",
                 body="Your report at Manda Hill has been resolved. Thank you!",
                 is_read=False, hours_ago=1),
            dict(title="Collection schedule update",
                 body="Collection in Kabulonga will occur on Thursday due to public holiday.",
                 is_read=True, hours_ago=24),
        ]
        for n in notifs:
            db.session.add(UserNotification(
                user_id=resident.id,
                title=n["title"],
                body=n["body"],
                is_read=n["is_read"],
                created_at=datetime.now(timezone.utc) - timedelta(hours=n["hours_ago"]),
            ))

        # ── Smart bins ─────────────────────────────────────────────────────
        bins_data = [
            dict(label="KAB-01", address="Kabulonga Rd",     fill_percentage=72, status="high",
                 bin_type="general",   latitude=-15.3820, longitude=28.3080, zone="Kabulonga"),
            dict(label="KAB-02", address="Near Manda Hill",  fill_percentage=15, status="low",
                 bin_type="recycling", latitude=-15.4144, longitude=28.3069, zone="Kabulonga"),
            dict(label="CBD-07", address="Cairo Rd",         fill_percentage=91, status="full",
                 bin_type="general",   latitude=-15.4167, longitude=28.2833, zone="Northmead"),
            dict(label="NMD-03", address="Northmead Avenue", fill_percentage=40, status="medium",
                 bin_type="general",   latitude=-15.3950, longitude=28.3200, zone="Northmead"),
            dict(label="KAN-01", address="Kanyama Market",   fill_percentage=88, status="full",
                 bin_type="general",   latitude=-15.4300, longitude=28.2700, zone="Kanyama"),
            dict(label="KAN-02", address="Kanyama Clinic Rd",fill_percentage=55, status="medium",
                 bin_type="general",   latitude=-15.4250, longitude=28.2750, zone="Kanyama"),
            dict(label="MAT-01", address="Matero Junction",  fill_percentage=30, status="low",
                 bin_type="general",   latitude=-15.4100, longitude=28.2650, zone="Matero"),
            dict(label="CHL-01", address="Chelston Ave",     fill_percentage=62, status="medium",
                 bin_type="recycling", latitude=-15.3600, longitude=28.3500, zone="Chelston"),
        ]
        bin_objs = []
        for b in bins_data:
            zone_name = b.pop("zone")
            obj = SmartBin(zone_id=zones[zone_name].id, **b)
            db.session.add(obj)
            bin_objs.append(obj)
        db.session.flush()

        # ── Vehicles ───────────────────────────────────────────────────────
        veh1 = Vehicle(
            registration_no="ALU 1234",
            vehicle_type="compactor",
            capacity_tons=8.0,
            status="available",
            assigned_driver=driver1.id,
        )
        veh2 = Vehicle(
            registration_no="ALU 5678",
            vehicle_type="tipper",
            capacity_tons=6.5,
            status="on_route",
            assigned_driver=driver2.id,
        )
        veh3 = Vehicle(
            registration_no="ALU 9012",
            vehicle_type="skip_loader",
            capacity_tons=5.0,
            status="maintenance",
        )
        db.session.add_all([veh1, veh2, veh3])
        db.session.flush()

        # ── Collection route ───────────────────────────────────────────────
        today = date.today()
        route = CollectionRoute(
            name="Kabulonga Morning Run",
            zone_id=zones["Kabulonga"].id,
            vehicle_id=veh1.id,
            driver_id=driver1.id,
            status="planned",
            scheduled_date=today,
        )
        db.session.add(route)
        db.session.flush()

        kab_bins = [b for b in bin_objs if b.label.startswith("KAB")]
        for i, b in enumerate(kab_bins, start=1):
            db.session.add(RouteStop(route_id=route.id, bin_id=b.id, stop_order=i))

        # ── System alerts ──────────────────────────────────────────────────
        db.session.add(Alert(
            bin_id=bin_objs[4].id,   # KAN-01 is full
            alert_type="bin_full",
            severity="critical",
            message="Bin KAN-01 at Kanyama Market has reached 88% capacity.",
            is_read=False,
            resolved=False,
        ))
        db.session.add(Alert(
            bin_id=bin_objs[0].id,   # KAB-01 high
            alert_type="bin_high",
            severity="warning",
            message="Bin KAB-01 on Kabulonga Rd is at 72% — collection recommended soon.",
            is_read=False,
            resolved=False,
        ))

        # ── ML Models ──────────────────────────────────────────────────────
        ml_models = [
            dict(model_name="Waste Volume Predictor",  version="2.1.0", accuracy=0.9210, is_active=True,
                 model_path="models/waste_volume_v2.1.pkl",
                 trained_at=datetime.now(timezone.utc) - timedelta(days=49)),
            dict(model_name="Waste Volume Predictor",  version="2.0.3", accuracy=0.8940, is_active=False,
                 model_path="models/waste_volume_v2.0.pkl",
                 trained_at=datetime.now(timezone.utc) - timedelta(days=66)),
            dict(model_name="Fill Rate Forecaster",    version="1.3.0", accuracy=0.8760, is_active=True,
                 model_path="models/fill_rate_v1.3.pkl",
                 trained_at=datetime.now(timezone.utc) - timedelta(days=52)),
            dict(model_name="Anomaly Detector",        version="1.0.1", accuracy=0.9450, is_active=True,
                 model_path="models/anomaly_v1.0.pkl",
                 trained_at=datetime.now(timezone.utc) - timedelta(days=56)),
            dict(model_name="Route Demand Classifier", version="0.9.0", accuracy=0.8120, is_active=False,
                 model_path="models/route_demand_v0.9.pkl",
                 trained_at=datetime.now(timezone.utc) - timedelta(days=71)),
        ]
        for m in ml_models:
            db.session.add(MLModel(**m))

        # ── Pickup schedules (zone default collection days) ────────────────
        schedules_data = [
            # Kabulonga: Mon, Wed, Fri — morning
            ("Kabulonga",  0, "morning"),
            ("Kabulonga",  2, "morning"),
            ("Kabulonga",  4, "afternoon"),
            # Northmead: Tue, Thu, Sat — morning
            ("Northmead",  1, "morning"),
            ("Northmead",  3, "morning"),
            ("Northmead",  5, "afternoon"),
            # Kanyama: Mon, Wed, Fri — morning (high density — 3×/week)
            ("Kanyama",    0, "morning"),
            ("Kanyama",    2, "morning"),
            ("Kanyama",    4, "morning"),
            # Matero: Tue, Thu — morning
            ("Matero",     1, "morning"),
            ("Matero",     3, "afternoon"),
            # Chelston: Mon, Thu, Sat — morning
            ("Chelston",   0, "morning"),
            ("Chelston",   3, "morning"),
            ("Chelston",   5, "afternoon"),
        ]
        for zone_name, dow, slot in schedules_data:
            db.session.add(PickupSchedule(
                zone_id=zones[zone_name].id,
                day_of_week=dow,
                time_slot=slot,
                frequency="weekly",
                is_active=True,
            ))

        # ── Driver locations (seeded on duty for demo) ─────────────────────
        db.session.flush()   # ensure driver1 / driver2 have IDs
        db.session.add(DriverLocation(
            driver_id=driver1.id,
            latitude=-15.3920,
            longitude=28.3050,
            heading=45,
            speed_kmh=28,
            is_on_duty=True,
            route_name="Kabulonga Morning Run",
        ))
        db.session.add(DriverLocation(
            driver_id=driver2.id,
            latitude=-15.4150,
            longitude=28.2680,
            heading=200,
            speed_kmh=22,
            is_on_duty=True,
            route_name="Matero Afternoon Route",
        ))

        db.session.commit()
        print("\nDatabase seeded successfully!")
        print()
        print("  Admin dashboard credentials:")
        print("    Email   : admin@lcc.zm")
        print("    Password: admin123")
        print()
        print("  Resident portal credentials:")
        print("    Email   : resident@example.com")
        print("    Password: password123")
        print()
        print("  Other accounts:")
        print("    supervisor@lcc.zm / super123")
        print("    driver1@lcc.zm   / driver123")
        print("    driver2@lcc.zm   / driver123")


if __name__ == "__main__":
    seed()
