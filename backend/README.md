# Smart Waste Management System — Lusaka
# Backend (Flask + MariaDB via XAMPP)

## Quick Start

### 1. Prerequisites
- Python 3.10+
- XAMPP (Apache + MariaDB running)
- (Optional) MQTT broker (Mosquitto) for IoT sensors

### 2. Database Setup

1. Start XAMPP and make sure **MySQL (MariaDB)** is running.
2. Open **phpMyAdmin** at `http://localhost/phpmyadmin`.
3. Click **New** → enter database name `smart_waste_lusaka`, collation `utf8mb4_unicode_ci` → **Create**.
4. Select the `smart_waste_lusaka` database → **Import** → choose `DB.sql` → **Go**.

Or via the command line (adjust path to match your XAMPP install):

```bash
# Windows (XAMPP default)
"C:\xampp\mysql\bin\mysql.exe" -u root smart_waste_lusaka < DB.sql

# macOS/Linux (XAMPP default)
/opt/lampp/bin/mysql -u root smart_waste_lusaka < DB.sql
```

### 3. Install Dependencies

```bash
# Create a virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install packages
pip install -r requirements.txt
```

### 4. Configure Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env — by default it points to XAMPP root with no password.
# If you set a MariaDB password in XAMPP, update DATABASE_URL:
#   DATABASE_URL=mysql+pymysql://root:YOUR_PASSWORD@localhost:3306/smart_waste_lusaka
```

### 5. Run Migrations (first time only — skip if you imported DB.sql)

```bash
flask db upgrade
```

### 6. Start the Server

```bash
python run.py
```

The API will be available at `http://localhost:5000`.

---

## API Endpoints

| Method | Endpoint                              | Auth     | Description                          |
|--------|---------------------------------------|----------|--------------------------------------|
| POST   | `/api/auth/register`                  | Public   | Register a new user                  |
| POST   | `/api/auth/login`                     | Public   | Login & get JWT tokens               |
| POST   | `/api/auth/refresh`                   | Refresh  | Refresh access token                 |
| GET    | `/api/auth/me`                        | JWT      | Get current user profile             |
| GET    | `/api/bins`                           | JWT      | List all bins (filter: zone, status) |
| POST   | `/api/bins`                           | Admin    | Create a smart bin                   |
| GET    | `/api/bins/<id>`                      | JWT      | Get bin details                      |
| PUT    | `/api/bins/<id>`                      | Admin    | Update a bin                         |
| DELETE | `/api/bins/<id>`                      | Admin    | Delete a bin                         |
| GET    | `/api/bins/nearby?lat=&lng=&radius=`  | JWT      | Find bins near GPS point             |
| GET    | `/api/reports`                        | JWT      | List reports                         |
| POST   | `/api/reports`                        | JWT      | Submit a citizen report              |
| PATCH  | `/api/reports/<id>/status`            | Admin    | Update report status                 |
| POST   | `/api/reports/<id>/images`            | JWT      | Attach image to report               |
| GET    | `/api/routes`                         | JWT      | List collection routes               |
| POST   | `/api/routes`                         | Admin    | Create a collection route            |
| POST   | `/api/routes/<id>/start`              | JWT      | Start a route                        |
| POST   | `/api/routes/<id>/complete`           | JWT      | Complete a route                     |
| GET    | `/api/rewards/balance`                | JWT      | Get reward points balance            |
| GET    | `/api/rewards/catalog`                | JWT      | Browse reward catalog                |
| POST   | `/api/rewards/redeem`                 | JWT      | Redeem points for rewards            |
| GET    | `/api/dashboard/stats`                | Admin    | System-wide statistics               |
| GET    | `/api/dashboard/zones/summary`        | Admin    | Per-zone breakdown                   |
| GET    | `/api/dashboard/alerts/recent`        | Admin    | Recent unresolved alerts             |
| POST   | `/api/sensors/reading`                | Public*  | Ingest IoT sensor reading            |
| GET    | `/api/sensors/readings/<bin_id>`      | JWT      | View sensor history for a bin        |

\* Sensor ingestion endpoint is open for IoT devices; secure via API key in production.

---

## Project Structure

```
backend/
├── run.py                  # Entry point
├── config.py               # Environment-based configuration
├── requirements.txt        # Python dependencies
├── .env.example            # Environment variable template
├── DB.sql                  # MariaDB schema (import via phpMyAdmin or CLI)
└── app/
    ├── __init__.py         # Application factory
    ├── models.py           # SQLAlchemy ORM models
    ├── schemas.py          # Marshmallow serialization schemas
    ├── mqtt_listener.py    # MQTT subscriber for IoT sensors
    └── api/
        ├── __init__.py
        ├── auth.py         # Registration, login, JWT
        ├── bins.py         # Smart bin CRUD + spatial queries
        ├── reports.py      # Citizen reports
        ├── routes.py       # Collection route management
        ├── rewards.py      # Incentive / points system
        ├── dashboard.py    # Admin dashboard analytics
        └── sensors.py      # IoT data ingestion
```
