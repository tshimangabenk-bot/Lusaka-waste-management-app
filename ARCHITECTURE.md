# Smart Waste Management System — Architecture
## Lusaka City Council · Technical Documentation

---

## 1. System Overview

The Smart Waste Management System is a full-stack web application built for Lusaka City Council to monitor smart bins, manage waste collection routes, process citizen reports, and reward residents for environmental participation.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                  │
│                                                                      │
│   ┌─────────────────────────┐   ┌─────────────────────────────┐     │
│   │    Admin Dashboard      │   │     Resident Portal          │     │
│   │  admin-dashboard/       │   │   user-dashboard/            │     │
│   │  HTML + CSS + JS        │   │   HTML + CSS + JS            │     │
│   │  12 pages               │   │   5 pages + auth forms       │     │
│   └────────────┬────────────┘   └──────────────┬──────────────┘     │
└────────────────┼────────────────────────────────┼────────────────────┘
                 │  JWT Bearer Token               │  JWT Bearer Token
                 ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        API LAYER                                     │
│                                                                      │
│              Flask REST API  (backend/)                              │
│              Gunicorn WSGI · Python 3.12                             │
│                                                                      │
│   /api/auth    /api/bins    /api/reports    /api/routes              │
│   /api/users   /api/zones   /api/vehicles  /api/drivers             │
│   /api/alerts  /api/rewards /api/sensors   /api/uploads             │
│   /api/dashboard                                                     │
└───────────┬──────────────────────────────────────┬──────────────────┘
            │                                      │
            ▼                                      ▼
┌───────────────────────┐            ┌─────────────────────────────┐
│    DATABASE LAYER     │            │     FIREBASE LAYER          │
│                       │            │                             │
│  SQLite (dev)         │            │  Auth — ID token verify     │
│  PostgreSQL (prod)    │            │  Storage — image uploads    │
│  Flask-SQLAlchemy     │            │  FCM — push notifications   │
│  Flask-Migrate        │            │                             │
└───────────────────────┘            └─────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend framework | Flask 3.1 | REST API, routing, middleware |
| ORM | SQLAlchemy 2.0 + Flask-SQLAlchemy | Database models and queries |
| Migrations | Flask-Migrate (Alembic) | Schema versioning |
| Authentication | Flask-JWT-Extended | Access + refresh token management |
| Serialization | Marshmallow | Request validation, JSON output |
| WSGI Server | Gunicorn | Production HTTP server |
| CORS | Flask-CORS | Cross-origin request handling |
| Database (dev) | SQLite | Local development |
| Database (prod) | PostgreSQL | Production deployment |
| Cloud services | Firebase Admin SDK | Auth, Storage, FCM |
| Frontend maps | Leaflet.js | Interactive bin + route maps |
| Frontend charts | Chart.js | Analytics and trends |
| Frontend icons | Lucide | SVG icon system |
| Push notifications | Firebase Cloud Messaging | Browser push alerts |
| Deployment | Render / Railway | Cloud hosting |

---

## 3. Backend Architecture

### 3.1 Application Factory

```
backend/
├── app/
│   ├── __init__.py          ← create_app() factory, extensions, CORS, blueprints
│   ├── models.py            ← All SQLAlchemy ORM models
│   ├── schemas.py           ← Marshmallow validation/serialisation schemas
│   ├── firebase.py          ← Firebase Admin SDK wrapper
│   └── api/
│       ├── auth.py          ← /api/auth
│       ├── bins.py          ← /api/bins
│       ├── reports.py       ← /api/reports
│       ├── routes.py        ← /api/routes
│       ├── users.py         ← /api/users
│       ├── zones.py         ← /api/zones
│       ├── vehicles.py      ← /api/vehicles
│       ├── drivers.py       ← /api/drivers
│       ├── alerts.py        ← /api/alerts
│       ├── rewards.py       ← /api/rewards
│       ├── sensors.py       ← /api/sensors
│       ├── uploads.py       ← /api/uploads
│       └── dashboard.py     ← /api/dashboard
├── config.py                ← Dev/Prod/Test configuration
├── seed.py                  ← Initial data seeding
├── gunicorn.conf.py         ← Production WSGI config
└── requirements.txt
```

### 3.2 Database Models

#### User Management
```
User
├── id             UUID (PK)
├── email          VARCHAR unique
├── phone          VARCHAR unique
├── password_hash  VARCHAR
├── first_name     VARCHAR
├── last_name      VARCHAR
├── role           ENUM (resident | collector | supervisor | admin)
├── profile_image  TEXT (Firebase Storage URL)
├── compound       VARCHAR (Lusaka ward/compound)
├── latitude       FLOAT
├── longitude      FLOAT
├── fcm_token      TEXT (Firebase push notification token)
├── is_active      BOOLEAN
├── is_verified    BOOLEAN
└── timestamps
```

#### Smart Bins & Sensors
```
SmartBin                    Sensor
├── id UUID                 ├── id UUID
├── label VARCHAR           ├── bin_id → SmartBin
├── zone_id → Zone          ├── sensor_type VARCHAR
├── latitude FLOAT          ├── hardware_id VARCHAR unique
├── longitude FLOAT         ├── firmware_ver VARCHAR
├── address TEXT            ├── battery_level FLOAT
├── capacity_liters FLOAT   ├── status ENUM
├── bin_type VARCHAR        ├── last_ping_at TIMESTAMP
├── status ENUM             └── timestamps
├── fill_percentage FLOAT
├── last_emptied_at TIMESTAMP    SensorReading
└── timestamps              ├── id BIGINT (PK)
                            ├── sensor_id → Sensor
                            ├── bin_id → SmartBin
                            ├── fill_percentage FLOAT
                            ├── distance_cm FLOAT
                            ├── temperature_c FLOAT
                            ├── weight_kg FLOAT
                            ├── battery_level FLOAT
                            └── recorded_at TIMESTAMP
```

#### Reports & Alerts
```
Report                      Alert
├── id UUID                 ├── id UUID
├── reporter_id → User      ├── bin_id → SmartBin
├── category ENUM           ├── alert_type ENUM
├── description TEXT        ├── severity ENUM
├── latitude FLOAT          ├── message TEXT
├── longitude FLOAT         ├── is_read BOOLEAN
├── zone_id → Zone          ├── resolved BOOLEAN
├── status ENUM             ├── resolved_at TIMESTAMP
├── assigned_to → User      └── created_at TIMESTAMP
├── resolved_at TIMESTAMP
├── resolution_note TEXT    UserNotification
└── timestamps              ├── id UUID
                            ├── user_id → User
ReportImage                 ├── title VARCHAR
├── id UUID                 ├── body TEXT
├── report_id → Report      ├── is_read BOOLEAN
├── image_url TEXT          ├── link TEXT
└── uploaded_at TIMESTAMP   └── created_at TIMESTAMP
```

#### Fleet & Routes
```
Vehicle                     CollectionRoute
├── id UUID                 ├── id UUID
├── registration_no VARCHAR ├── name VARCHAR
├── vehicle_type VARCHAR    ├── zone_id → Zone
├── capacity_tons FLOAT     ├── vehicle_id → Vehicle
├── status ENUM             ├── driver_id → User
├── assigned_driver → User  ├── status ENUM
└── timestamps              ├── scheduled_date DATE
                            ├── start_time TIMESTAMP
                            ├── end_time TIMESTAMP
                            ├── total_distance_km FLOAT
                            └── timestamps

                            RouteStop
                            ├── id INTEGER (PK)
                            ├── route_id → Route
                            ├── bin_id → SmartBin
                            ├── stop_order INTEGER
                            ├── visited BOOLEAN
                            ├── visited_at TIMESTAMP
                            └── fill_at_visit FLOAT
```

#### Rewards & Analytics
```
RewardCatalog               UserReward          RewardTransaction
├── id INTEGER              ├── id UUID         ├── id UUID
├── title VARCHAR           ├── user_id → User  ├── user_id → User
├── description TEXT        ├── total_points    ├── action ENUM
├── points_cost INTEGER     ├── lifetime_points └── points INTEGER
├── stock INTEGER           └── updated_at
├── image_url TEXT
└── is_active BOOLEAN       WasteGenerationLog  MLModel
                            ├── zone_id → Zone  ├── model_name VARCHAR
                            ├── log_date DATE   ├── version VARCHAR
                            ├── total_volume_l  ├── accuracy FLOAT
                            ├── total_weight_kg ├── model_path TEXT
                            ├── bins_emptied    ├── trained_at TIMESTAMP
                            ├── avg_fill_pct    └── is_active BOOLEAN
                            └── weather data
```

### 3.3 API Endpoints

#### Authentication `/api/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Register new user, returns JWT pair |
| POST | `/login` | — | Email/password login, returns JWT pair |
| POST | `/refresh` | Refresh token | Issue new access token |
| GET | `/me` | Access token | Get current user profile |
| POST | `/firebase-login` | — | Exchange Firebase ID token for JWT |

#### Smart Bins `/api/bins`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | User | List bins (filter by zone, status) |
| GET | `/<id>` | User | Get single bin |
| POST | `/` | Admin | Create bin |
| PUT | `/<id>` | Admin | Update bin |
| DELETE | `/<id>` | Admin | Delete bin |
| GET | `/nearby` | User | Haversine proximity search (lat, lng, radius) |

#### Reports `/api/reports`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | User | List reports (admin=all, resident=own) |
| GET | `/<id>` | User | Get single report |
| POST | `/` | User | Submit report (auto-awards 10 points) |
| PATCH | `/<id>/status` | Admin/Collector | Update report status |
| POST | `/<id>/images` | User | Attach image via Firebase Storage |

#### Routes `/api/routes`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | User | List routes |
| POST | `/` | Admin | Create route with ordered stops |
| POST | `/<id>/start` | Admin/Driver | Mark in_progress |
| POST | `/<id>/complete` | Admin/Driver | Mark completed |
| POST | `/<id>/stops/<stop_id>/visit` | Collector | Mark stop visited |

#### Dashboard `/api/dashboard` (Admin only)
| Method | Path | Description |
|---|---|---|
| GET | `/stats` | Total bins, full bins, reports, users, active routes |
| GET | `/zones/summary` | Per-zone bin count, avg fill, report count |
| GET | `/alerts/recent` | Last 50 unresolved alerts |
| GET | `/analytics` | 30-day waste trend + 14-day forecast + ML models |

#### Other Endpoints
| Blueprint | Prefix | Key endpoints |
|---|---|---|
| Users | `/api/users` | GET /me/dashboard, GET /me/notifications, PUT /me/fcm-token |
| Vehicles | `/api/vehicles` | Full CRUD (admin) |
| Zones | `/api/zones` | Full CRUD (admin) |
| Drivers | `/api/drivers` | Full CRUD (admin) |
| Alerts | `/api/alerts` | List, resolve, mark-read (admin) |
| Rewards | `/api/rewards` | Balance, catalog, history, redeem |
| Sensors | `/api/sensors` | POST /reading (IoT), GET /readings/:bin_id |
| Uploads | `/api/uploads` | POST /report-image (Firebase Storage) |

### 3.4 Authentication Flow

```
1. User submits email + password
        │
        ▼
2. POST /api/auth/login
        │
        ▼
3. Backend: check_password_hash() + query User table
        │
        ├── FAIL → 401 {"error": "Invalid email or password"}
        │
        └── PASS ──►
                │
                ▼
4. create_access_token(identity=user.id, role=user.role)
   create_refresh_token(identity=user.id)
        │
        ▼
5. Return { access_token, refresh_token, user }
        │
        ▼
6. Frontend saves to localStorage:
   swm_token = access_token
   swm_refresh_token = refresh_token
   swm_user = JSON.stringify(user)
        │
        ▼
7. All API calls: Authorization: Bearer <access_token>
        │
        ▼
8. On 401 → auto-refresh:
   POST /api/auth/refresh (Bearer <refresh_token>)
        │
        ├── OK → save new access_token → retry original request
        └── FAIL → clearTokens() → show login screen
```

### 3.5 Role-Based Access Control

| Role | Permissions |
|---|---|
| **resident** | Submit reports, view own reports, browse rewards, find nearby bins, receive notifications |
| **collector** | All resident permissions + update report status, mark route stops visited |
| **supervisor** | All collector permissions + create/manage routes |
| **admin** | Full access — all endpoints including user management, analytics, alerts, CRUD on all entities |

### 3.6 Firebase Integration

```
PRODUCTION (Railway/Render)
  FIREBASE_CREDENTIALS_JSON env var (full JSON string)
        │
LOCAL DEVELOPMENT
  FIREBASE_CREDENTIALS_PATH=backend/firebase-credentials.json
        │
        ▼
firebase_admin.initialize_app(credentials.Certificate(...))
        │
        ├── Auth:    verify_id_token(id_token) ──► Google Sign-In flow
        ├── Storage: upload_file(bytes, path) ──► Firebase Storage bucket
        └── FCM:     send_push(token, title, body) ──► Browser push
                     send_multicast(tokens, ...) ──► Multi-device push
```

---

## 4. Admin Dashboard Architecture

### 4.1 File Structure
```
admin-dashboard/
├── index.html                ← Single HTML file, all 12 pages inline
├── favicon.ico
├── css/
│   └── styles.css            ← Dark theme, emerald palette
├── js/
│   ├── config.js             ← API_BASE URL (auto-detects dev vs prod)
│   ├── firebase-config.js    ← Firebase web SDK config + VAPID key
│   ├── api.js                ← All API calls + token management
│   ├── data.js               ← Global state arrays + mock data fallback
│   └── app.js                ← All render functions + UI logic
├── firebase-messaging-sw.js  ← Service worker for background FCM push
└── vendor/
    ├── lucide.js
    ├── chart.js
    ├── leaflet.js
    └── leaflet.css
```

### 4.2 Pages & Render Functions

| Page | Nav ID | Render Function | Data Used |
|---|---|---|---|
| Dashboard | `dashboard` | `renderDashboard()` | BINS, REPORTS, ALERTS, ANALYTICS |
| Live Map | `map` | `renderMap()` | BINS, ZONES |
| Smart Bins | `bins` | `renderBins()` | BINS, ZONES |
| Collection Routes | `routes` | `renderRoutes()` | ROUTES, ZONES, VEHICLES, DRIVERS |
| Fleet Vehicles | `vehicles` | `renderVehicles()` | VEHICLES, DRIVERS |
| Citizen Reports | `reports` | `renderReports()` | REPORTS, ZONES |
| Incentives | `rewards` | `renderRewards()` | REWARD_CATALOG, USERS |
| Analytics | `analytics` | `renderAnalytics()` | ANALYTICS, ZONES |
| Alerts | `alerts` | `renderAlerts()` | ALERTS |
| Zones | `zones` | `renderZones()` | ZONES, BINS, REPORTS |
| Users | `users` | `renderUsers()` | USERS |
| Settings | `settings` | `renderSettings()` | — |

### 4.3 State Management

```javascript
// Global state (let — reassignable from API responses)
let BINS          = []   // SmartBin records
let REPORTS       = []   // Report records
let USERS         = []   // User records
let DRIVERS       = []   // Users with role=collector
let VEHICLES      = []   // Vehicle records
let ZONES         = []   // Zone records
let ROUTES        = []   // CollectionRoute records
let ALERTS        = []   // Alert records
let REWARD_CATALOG = []  // RewardCatalog items
let ANALYTICS     = { trend: {...}, ml_models: [] }

// UI state
let currentPage       = 'dashboard'
let autoRefreshTimer  = null
let PAGINATION        = {}
```

### 4.4 Data Loading Strategy

```
DOMContentLoaded
    │
    ├── checkAuth() ──► show/hide login overlay
    ├── renderSettings()
    ├── resetAutoRefresh() ──► setInterval(30s) → renderPage()
    └── if (getToken())
            │
            ▼
        loadAllData()
            │
            ├── loadBins()
            ├── loadReports()
            ├── loadUsers()
            ├── loadDrivers()       ← before VEHICLES (name resolution)
            ├── loadVehicles()      ← enriched with driver names
            ├── loadZones()
            ├── loadRoutes()        ← enriched with zone/vehicle/driver
            ├── loadAlerts()
            ├── loadRewardCatalog()
            └── loadAnalytics()
                    │
                    ▼
                renderDashboard()
```

### 4.5 Charts

| Chart | Location | Type | Data Source |
|---|---|---|---|
| Collection Trends | Dashboard | Line | `ANALYTICS.trend` (30-day actual + 14-day forecast) |
| Fill Distribution | Dashboard | Doughnut | `BINS` fill_percentage buckets |
| Zone Performance | Dashboard | Bar | `ZONES` avg_fill_pct |
| Waste Activity | Analytics page | Line | `ANALYTICS.trend` |
| ML Model Registry | Analytics page | Table | `ANALYTICS.ml_models` |

### 4.6 Admin Dashboard — Feature Checklist

- [x] JWT login with role check (admin only)
- [x] Auto token refresh on 401
- [x] Auto-refresh data every 30 seconds
- [x] 12 fully rendered pages
- [x] Leaflet map with bin markers coloured by fill level
- [x] Chart.js trend line + doughnut + bar charts
- [x] Add/Edit/Delete bins, vehicles, zones, routes
- [x] Start and complete collection routes
- [x] Mark route stops as visited
- [x] Update report status (pending → in_progress → resolved)
- [x] Resolve and mark alerts as read
- [x] User management (edit role, activate/deactivate)
- [x] Pagination on bins, reports, users tables
- [x] Search across bins (label), reports (description), users (name/email)
- [x] Firebase FCM push notifications (background + foreground)
- [x] Settings panel with refresh interval control

---

## 5. User Dashboard (Resident Portal) Architecture

### 5.1 File Structure
```
user-dashboard/
├── index.html                ← Main dashboard (authenticated)
├── login.html                ← Login form
├── register.html             ← 3-step registration
├── process_login.html        ← Post-login loading screen
├── favicon.ico
├── images/
│   └── hero.jpeg             ← Hero background image
├── css/
│   ├── styles.css            ← Dark theme dashboard styles
│   └── auth.css              ← Login/register page styles
├── js/
│   ├── config.js             ← API_BASE URL
│   ├── firebase-config.js    ← Firebase web SDK config + VAPID key
│   └── api.js                ← All API calls + demo fallback
│   └── app.js                ← All render functions + UI logic
├── firebase-messaging-sw.js  ← Background push notifications
└── vendor/dashboard/vendor/
    ├── lucide.js
    ├── chart.js
    ├── leaflet.js
    └── leaflet.css
```

### 5.2 Pages & Render Functions

| Page | Nav ID | Key Functions | API Calls |
|---|---|---|---|
| Overview | `overview` | `renderOverview()`, `loadDashboard()` | GET /users/me/dashboard |
| My Reports | `reports` | `loadReports(filter)` | GET /reports, POST /reports |
| Rewards | `rewards` | `loadRewards()`, `handleRedeem()` | GET /rewards/balance, /catalog, /history, POST /redeem |
| Nearby Bins | `bins` | `loadNearbyBins()`, `renderBinsList()` | GET /bins/nearby |
| Notifications | `notifications` | `loadNotifications()` | GET /users/me/notifications, PATCH /mark-all-read |

### 5.3 Authentication Pages

#### login.html
- Email + password form
- Show/hide password toggle
- "Remember me" checkbox
- Role-based redirect: admin → `/admin-dashboard/`, resident → `process_login.html`
- Error message display

#### register.html (3-step form)
```
Step 1 — Personal Info
  First name, Last name, Email, Phone number

Step 2 — Location
  Compound selector (Lusaka wards dropdown)
  GPS location detection (navigator.geolocation)
  Manual lat/lng fallback

Step 3 — Security
  Password (with strength indicator)
  Confirm password
  Terms and conditions checkbox
```

#### process_login.html
- Multi-step animated loading screen after login
- Steps: Verifying token → Loading profile → Fetching data → Preparing dashboard
- Auto-redirects to `index.html` on completion
- Shows welcome message for first-time users

### 5.4 Demo Mode Fallback

```javascript
let _backendAvailable = true

async function apiFetch(path, options, retry = true) {
    try {
        const res = await fetch(API_BASE + path, options)
        if (!res.ok && res.status === 0) {
            _backendAvailable = false   // network error
            return getDemoData(path)    // serve local demo data
        }
        return res
    } catch {
        _backendAvailable = false
        return getDemoData(path)
    }
}
```

When the Flask backend is unreachable, the dashboard automatically serves realistic demo data so the UI remains functional for demonstration.

### 5.5 Report Submission Flow

```
Resident clicks "Report issue"
        │
        ▼
Modal opens — form fields:
  category (dropdown)
  description (textarea)
  latitude / longitude (auto-filled via geolocation)
  image upload (optional)
        │
        ▼
Submit:
  1. If image → POST /api/uploads/report-image → Firebase Storage → image_url
  2. POST /api/reports { category, description, lat, lng, image_url }
        │
        ▼
Backend:
  Creates Report row
  Awards 10 reward points → UserReward
  Creates RewardTransaction log
  Sends FCM push to admin devices
        │
        ▼
Frontend:
  Shows toast "Report submitted — 10 points earned"
  Reloads reports list
```

### 5.6 User Dashboard — Feature Checklist

- [x] JWT login with auto token refresh
- [x] 3-step registration with GPS location
- [x] Animated process_login loading screen
- [x] Overview with hero image, stats, recent reports
- [x] Report submission with geolocation + image upload
- [x] Report filtering (all / pending / in_progress / resolved)
- [x] Rewards catalog with point costs and redeem button
- [x] Transaction history (points earned/spent)
- [x] Nearby bins on Leaflet map (1km radius)
- [x] Distance display per bin
- [x] In-app notification list with mark-all-read
- [x] Firebase FCM push notifications (browser)
- [x] Responsive mobile layout
- [x] Demo mode fallback when backend unavailable

---

## 6. Data Flows

### 6.1 IoT Sensor → Bin Status Update
```
Ultrasonic sensor on bin
    │ MQTT / HTTP
    ▼
POST /api/sensors/reading
  { hardware_id, fill_percentage, distance_cm, temperature_c, battery_level }
    │
    ▼
Backend resolves hardware_id → Sensor → SmartBin
    │
    ├── Updates SmartBin.fill_percentage
    ├── Updates SmartBin.status (empty/low/medium/high/full/overflow)
    ├── Creates SensorReading time-series record
    └── If fill >= 85% → Creates Alert (bin_full, severity=warning)
                       → FCM push to all admin devices
```

### 6.2 Collection Route Lifecycle
```
Admin creates route
  POST /api/routes { name, zone_id, vehicle_id, driver_id, scheduled_date, stops[] }
        │
        ▼
Route status = "planned"
        │
        ▼
Driver starts route
  POST /api/routes/<id>/start
  Route status = "in_progress"
        │
        ▼
Driver visits each bin stop
  POST /api/routes/<id>/stops/<stop_id>/visit { fill_at_visit }
  RouteStop.visited = True
  SmartBin.fill_percentage = 0
  SmartBin.status = "empty"
  SmartBin.last_emptied_at = now()
        │
        ▼
All stops visited → Admin completes
  POST /api/routes/<id>/complete
  Route status = "completed"
  Route.end_time = now()
```

### 6.3 Push Notification Flow (FCM)
```
Event occurs (report submitted / bin full / alert)
        │
        ▼
Backend: firebase.send_push(user.fcm_token, title, body)
        │
        ▼
Firebase FCM servers
        │
        ├── App in foreground → onMessage() → showToast()
        └── App in background → firebase-messaging-sw.js
                              → self.registration.showNotification()
                              → Browser native notification
```

---

## 7. Deployment Architecture

```
GitHub Repository
tshimangabenk-bot/Lusaka-waste-management-app
        │
        │ Push to main
        ▼
Render.com (Web Service)
  Build: pip install -r backend/requirements.txt
  Start: cd backend && gunicorn -c gunicorn.conf.py "app:create_app()"
  Python: 3.12
        │
        ├── Environment Variables:
        │   FLASK_ENV=production
        │   DATABASE_URL=postgresql://... (auto from Render DB)
        │   SECRET_KEY=<generated>
        │   JWT_SECRET_KEY=<generated>
        │   FIREBASE_CREDENTIALS_JSON=<full JSON>
        │   FIREBASE_STORAGE_BUCKET=smart-waste-management-s-6225c.firebasestorage.app
        │
        └── Render PostgreSQL (free tier)
              DATABASE_URL auto-injected

Frontend (Static)
  Served directly from file system
  admin-dashboard/ → open index.html via Live Server
  user-dashboard/  → open index.html via Live Server
  (or deploy to Firebase Hosting / Netlify / Vercel)
```

### 7.1 Environment Configuration

| Variable | Dev value | Prod value |
|---|---|---|
| `FLASK_ENV` | `development` | `production` |
| `DATABASE_URL` | `sqlite:///smart_waste.db` | `postgresql://...` (Render) |
| `SECRET_KEY` | `dev-secret` | Random 32-char string |
| `JWT_SECRET_KEY` | `jwt-dev-secret` | Random 32-char string |
| `FIREBASE_CREDENTIALS_PATH` | `firebase-credentials.json` | — |
| `FIREBASE_CREDENTIALS_JSON` | — | Full JSON string |
| `FIREBASE_STORAGE_BUCKET` | project.appspot.com | project.firebasestorage.app |

---

## 8. Security Architecture

| Concern | Implementation |
|---|---|
| Authentication | JWT access tokens (1hr) + refresh tokens (30 days) |
| Role enforcement | `@admin_required` decorator on every admin endpoint |
| CORS | Restricted to `/api/*` with explicit allowed headers |
| CORS preflight | `@app.before_request` returns 200 for OPTIONS |
| Password storage | Werkzeug `generate_password_hash` (scrypt) |
| Firebase tokens | `firebase_admin.auth.verify_id_token()` |
| File uploads | MIME type check + Firebase Storage rules |
| Secrets | `.env` and `firebase-credentials.json` in `.gitignore` |
| Input validation | Marshmallow schema validation → 422 on bad input |
| Token refresh | Auto-retry on 401, clear session if refresh also fails |

---

## 9. API Response Conventions

```
Success:          { data } with HTTP 200/201
Validation error: { "error": "Validation failed", "details": {...} } 422
Auth error:       { "error": "Invalid email or password" } 401
Forbidden:        { "error": "Admin access required" } 403
Not found:        { "error": "Not found" } 404
Server error:     { "error": "..." } 500
```

---

## 10. Key Firebase Project Details

| Setting | Value |
|---|---|
| Project ID | `smart-waste-management-s-6225c` |
| Auth Domain | `smart-waste-management-s-6225c.firebaseapp.com` |
| Realtime DB | `smart-waste-management-s-6225c-default-rtdb.firebaseio.com` |
| Storage Bucket | `smart-waste-management-s-6225c.firebasestorage.app` |
| Sender ID | `202624977732` |
| Measurement ID | `G-JLTNRGFJ1P` |
| VAPID Key | Configured in both firebase-config.js files |
