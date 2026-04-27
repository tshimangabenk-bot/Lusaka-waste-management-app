/* ============================================================================
   MOCK DATA — Simulates Flask API responses for the admin dashboard.
   In production, replace these with fetch() calls to your Flask backend.
   ============================================================================ */

let ZONES = [
    { id: 1, name: "Mtendere",         population_est: 85000,  bin_count: 32, avg_fill_pct: 62.3, report_count: 14 },
    { id: 2, name: "George Compound",  population_est: 120000, bin_count: 45, avg_fill_pct: 78.1, report_count: 23 },
    { id: 3, name: "Kalingalinga",     population_est: 60000,  bin_count: 22, avg_fill_pct: 41.7, report_count: 8 },
    { id: 4, name: "Kanyama",          population_est: 150000, bin_count: 56, avg_fill_pct: 84.5, report_count: 31 },
    { id: 5, name: "Chawama",          population_est: 90000,  bin_count: 28, avg_fill_pct: 55.2, report_count: 12 },
    { id: 6, name: "Mandevu",          population_est: 70000,  bin_count: 20, avg_fill_pct: 38.9, report_count: 6 },
    { id: 7, name: "Garden Compound",  population_est: 45000,  bin_count: 15, avg_fill_pct: 29.4, report_count: 3 },
    { id: 8, name: "Chipata Compound", population_est: 55000,  bin_count: 18, avg_fill_pct: 67.8, report_count: 10 },
];

function getZoneName(id) {
    const z = ZONES.find(z => z.id === id);
    return z ? z.name : "Unknown";
}

// Lusaka GPS bounding box for random placement
const LUSAKA_LAT = { min: -15.47, max: -15.36 };
const LUSAKA_LNG = { min: 28.24,  max: 28.36 };
function randLat() { return LUSAKA_LAT.min + Math.random() * (LUSAKA_LAT.max - LUSAKA_LAT.min); }
function randLng() { return LUSAKA_LNG.min + Math.random() * (LUSAKA_LNG.max - LUSAKA_LNG.min); }

const BIN_TYPES = ["general", "recyclable", "organic", "hazardous"];
const BIN_STATUSES = ["empty", "low", "medium", "high", "full", "overflow"];

function generateBins(count) {
    const bins = [];
    for (let i = 1; i <= count; i++) {
        const fill = Math.round(Math.random() * 100);
        let status;
        if (fill >= 95) status = "overflow";
        else if (fill >= 85) status = "full";
        else if (fill >= 65) status = "high";
        else if (fill >= 40) status = "medium";
        else if (fill >= 15) status = "low";
        else status = "empty";

        const zone = ZONES[Math.floor(Math.random() * ZONES.length)];
        const daysAgo = Math.floor(Math.random() * 7);
        const lastEmptied = new Date(Date.now() - daysAgo * 86400000);

        bins.push({
            id: `bin-${String(i).padStart(3, "0")}`,
            label: `BIN-${zone.name.substring(0, 3).toUpperCase()}-${String(i).padStart(3, "0")}`,
            zone_id: zone.id,
            zone_name: zone.name,
            bin_type: BIN_TYPES[Math.floor(Math.random() * BIN_TYPES.length)],
            fill_percentage: fill,
            status: status,
            capacity_liters: [120, 240, 360, 660][Math.floor(Math.random() * 4)],
            latitude: randLat(),
            longitude: randLng(),
            last_emptied_at: lastEmptied.toISOString(),
            installed_at: new Date(Date.now() - Math.random() * 180 * 86400000).toISOString(),
        });
    }
    return bins;
}

let BINS = generateBins(120);

// Collection routes
const ROUTE_STATUSES = ["planned", "in_progress", "completed", "cancelled"];
let DRIVERS = [
    { id: "d1", name: "Joseph Banda" },
    { id: "d2", name: "Mwila Chisanga" },
    { id: "d3", name: "Brian Tembo" },
    { id: "d4", name: "Grace Phiri" },
    { id: "d5", name: "Kennedy Mulenga" },
];

let VEHICLES = [
    { id: "v1", registration_no: "ALU 1234", vehicle_type: "compactor",   capacity_tons: 8.0,  status: "available",   assigned_driver: "Joseph Banda" },
    { id: "v2", registration_no: "ALU 5678", vehicle_type: "tipper",      capacity_tons: 12.0, status: "on_route",    assigned_driver: "Mwila Chisanga" },
    { id: "v3", registration_no: "ALU 9012", vehicle_type: "compactor",   capacity_tons: 8.0,  status: "maintenance", assigned_driver: null },
    { id: "v4", registration_no: "ALU 3456", vehicle_type: "skip_loader", capacity_tons: 6.0,  status: "available",   assigned_driver: "Grace Phiri" },
    { id: "v5", registration_no: "ALU 7890", vehicle_type: "compactor",   capacity_tons: 10.0, status: "on_route",    assigned_driver: "Kennedy Mulenga" },
    { id: "v6", registration_no: "ALU 2345", vehicle_type: "tipper",      capacity_tons: 14.0, status: "available",   assigned_driver: "Brian Tembo" },
];

function generateRoutes(count) {
    const routes = [];
    for (let i = 1; i <= count; i++) {
        const zone = ZONES[Math.floor(Math.random() * ZONES.length)];
        const driver = DRIVERS[Math.floor(Math.random() * DRIVERS.length)];
        const vehicle = VEHICLES[Math.floor(Math.random() * VEHICLES.length)];
        const daysOffset = Math.floor(Math.random() * 14) - 3;
        const date = new Date(Date.now() + daysOffset * 86400000);
        const stops = Math.floor(Math.random() * 12) + 4;
        const status = daysOffset < -1 ? "completed" : daysOffset < 0 ? "in_progress" : "planned";

        routes.push({
            id: `route-${i}`,
            name: `${zone.name} Route ${i}`,
            zone_id: zone.id,
            zone_name: zone.name,
            vehicle_reg: vehicle.registration_no,
            driver_name: driver.name,
            scheduled_date: date.toISOString().split("T")[0],
            stops_count: stops,
            status: status,
        });
    }
    return routes;
}

let ROUTES = generateRoutes(25);

// Citizen reports
const REPORT_CATEGORIES = ["illegal_dumping", "overflowing_bin", "missed_collection", "hazardous_waste", "other"];
const REPORT_STATUSES = ["pending", "acknowledged", "in_progress", "resolved", "rejected"];
const REPORTER_NAMES = [
    "Bwalya Kapasa", "Chanda Mutale", "Namwila Zulu", "Thandiwe Moyo", "Mubanga Kasonde",
    "Chilufya Besa", "Daliso Ngoma", "Esther Mwamba", "Francis Sakala", "Hellen Tembo",
    "Isaac Phiri", "Janet Sinkala", "Kelvin Lungu", "Loveness Banda", "Moses Chimba",
];

const REPORT_DESCRIPTIONS = [
    "Large pile of household waste dumped near the school fence",
    "Bin outside the market has been overflowing for 3 days",
    "Collection truck did not come this week in our area",
    "Chemical containers dumped in the drainage ditch",
    "Illegal burning of waste behind the community hall",
    "Plastic waste blocking the drainage canal",
    "Medical waste found near the playground",
    "Construction debris dumped on vacant plot",
    "Used tires piled up near residential houses",
    "Electronic waste dumped by the roadside",
];

function generateReports(count) {
    const reports = [];
    for (let i = 1; i <= count; i++) {
        const zone = ZONES[Math.floor(Math.random() * ZONES.length)];
        const daysAgo = Math.floor(Math.random() * 30);
        const created = new Date(Date.now() - daysAgo * 86400000);

        reports.push({
            id: `RPT-${String(i).padStart(4, "0")}`,
            reporter_name: REPORTER_NAMES[Math.floor(Math.random() * REPORTER_NAMES.length)],
            category: REPORT_CATEGORIES[Math.floor(Math.random() * REPORT_CATEGORIES.length)],
            zone_id: zone.id,
            zone_name: zone.name,
            description: REPORT_DESCRIPTIONS[Math.floor(Math.random() * REPORT_DESCRIPTIONS.length)],
            status: REPORT_STATUSES[Math.floor(Math.random() * REPORT_STATUSES.length)],
            latitude: randLat(),
            longitude: randLng(),
            created_at: created.toISOString(),
        });
    }
    return reports;
}

let REPORTS = generateReports(45);

// Alerts
const ALERT_MESSAGES = [
    "Bin '{bin}' has reached {pct}% capacity — immediate collection required",
    "Sensor offline at '{bin}' — no data received in 2 hours",
    "Bin '{bin}' is overflowing — overflow detected",
    "Maintenance due for bin '{bin}' — scheduled inspection overdue",
    "Missed collection detected for '{bin}' — route was not completed",
];

function generateAlerts(count) {
    const alerts = [];
    const types = ["bin_full", "bin_overflow", "sensor_offline", "maintenance_due", "missed_collection"];
    const severities = ["critical", "warning", "info"];

    for (let i = 1; i <= count; i++) {
        const bin = BINS[Math.floor(Math.random() * BINS.length)];
        const type = types[Math.floor(Math.random() * types.length)];
        const severity = type === "bin_overflow" ? "critical" : type === "bin_full" ? "warning" : severities[Math.floor(Math.random() * severities.length)];
        const minutesAgo = Math.floor(Math.random() * 1440);
        const created = new Date(Date.now() - minutesAgo * 60000);

        const msg = ALERT_MESSAGES[Math.floor(Math.random() * ALERT_MESSAGES.length)]
            .replace("{bin}", bin.label)
            .replace("{pct}", bin.fill_percentage);

        alerts.push({
            id: `alert-${i}`,
            bin_id: bin.id,
            bin_label: bin.label,
            alert_type: type,
            severity: severity,
            message: msg,
            is_read: Math.random() > 0.6,
            resolved: Math.random() > 0.7,
            created_at: created.toISOString(),
        });
    }
    return alerts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

let ALERTS = generateAlerts(40);

// Reward catalog
let REWARD_CATALOG = [
    { id: 1, title: "Mobile Airtime ZMW 10",    description: "Redeemable for ZMW 10 airtime on any network", points_cost: 100, stock: 487, is_active: true },
    { id: 2, title: "Shopping Voucher ZMW 25",   description: "Valid at partner supermarkets",                points_cost: 250, stock: 189, is_active: true },
    { id: 3, title: "Tree Seedling",             description: "Collect a free tree seedling from LCC nursery",points_cost: 50,  stock: 943, is_active: true },
    { id: 4, title: "Community Champion Badge",  description: "Digital badge on your profile",                points_cost: 25,  stock: null,is_active: true },
    { id: 5, title: "Waste Bin (Home)",          description: "Free 120L household waste bin from LCC",       points_cost: 500, stock: 78,  is_active: true },
    { id: 6, title: "Water Bill ZMW 50 Credit",  description: "Credit towards Lusaka Water bill",             points_cost: 400, stock: 120, is_active: false },
];

// Top earners (mock)
const TOP_EARNERS = [
    { rank: 1, name: "Thandiwe Moyo",   points: 2450, compound: "Mtendere" },
    { rank: 2, name: "Bwalya Kapasa",   points: 2180, compound: "Kanyama" },
    { rank: 3, name: "Daliso Ngoma",    points: 1920, compound: "George Compound" },
    { rank: 4, name: "Hellen Tembo",    points: 1740, compound: "Chipata Compound" },
    { rank: 5, name: "Moses Chimba",    points: 1650, compound: "Chawama" },
    { rank: 6, name: "Esther Mwamba",   points: 1480, compound: "Kalingalinga" },
    { rank: 7, name: "Kelvin Lungu",    points: 1320, compound: "Mandevu" },
    { rank: 8, name: "Janet Sinkala",   points: 1150, compound: "Garden Compound" },
];

// Users
function generateUsers(count) {
    const users = [];
    const roles = ["resident", "resident", "resident", "resident", "collector", "collector", "admin"];
    const firstNames = ["Bwalya","Chanda","Namwila","Thandiwe","Mubanga","Chilufya","Daliso","Esther","Francis","Grace","Isaac","Janet","Kelvin","Loveness","Moses","Brian","Joseph","Kennedy","Hellen","Mwila"];
    const lastNames = ["Kapasa","Mutale","Zulu","Moyo","Kasonde","Besa","Ngoma","Mwamba","Sakala","Phiri","Sinkala","Lungu","Banda","Chimba","Tembo","Chisanga","Mulenga"];

    for (let i = 1; i <= count; i++) {
        const first = firstNames[Math.floor(Math.random() * firstNames.length)];
        const last = lastNames[Math.floor(Math.random() * lastNames.length)];
        const zone = ZONES[Math.floor(Math.random() * ZONES.length)];
        const role = roles[Math.floor(Math.random() * roles.length)];
        const daysAgo = Math.floor(Math.random() * 365);

        users.push({
            id: `user-${i}`,
            first_name: first,
            last_name: last,
            email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@mail.zm`,
            phone: `+260 9${Math.floor(Math.random() * 90 + 10)} ${Math.floor(Math.random() * 900 + 100)} ${Math.floor(Math.random() * 900 + 100)}`,
            role: role,
            compound: zone.name,
            is_active: Math.random() > 0.1,
            created_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
        });
    }
    return users;
}

let USERS = generateUsers(65);

// Analytics (populated from API; seeded with fallback)
let ANALYTICS = { trend: { labels: [], actual: [], predicted: [] }, ml_models: [] };

// ML Models (fallback until API loads)
let ML_MODELS = [
    { id: 1, model_name: "Waste Volume Predictor",   version: "2.1.0", accuracy: 0.9210, trained_at: "2026-03-08T14:30:00Z", is_active: true },
    { id: 2, model_name: "Waste Volume Predictor",   version: "2.0.3", accuracy: 0.8940, trained_at: "2026-02-20T10:15:00Z", is_active: false },
    { id: 3, model_name: "Fill Rate Forecaster",     version: "1.3.0", accuracy: 0.8760, trained_at: "2026-03-05T09:00:00Z", is_active: true },
    { id: 4, model_name: "Anomaly Detector",         version: "1.0.1", accuracy: 0.9450, trained_at: "2026-03-01T16:45:00Z", is_active: true },
    { id: 5, model_name: "Route Demand Classifier",  version: "0.9.0", accuracy: 0.8120, trained_at: "2026-02-15T11:20:00Z", is_active: false },
];

// Time-series data helpers
function generateTrendData(days) {
    const labels = [];
    const collected = [];
    const generated = [];
    for (let i = days; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        labels.push(d.toLocaleDateString("en-ZM", { month: "short", day: "numeric" }));
        collected.push(Math.floor(Math.random() * 40 + 60));
        generated.push(Math.floor(Math.random() * 30 + 80));
    }
    return { labels, collected, generated };
}

function generateForecastData() {
    const labels = [];
    const actual = [];
    const predicted = [];
    for (let i = 30; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        labels.push(d.toLocaleDateString("en-ZM", { month: "short", day: "numeric" }));
        const base = 75 + Math.sin(i / 5) * 15;
        actual.push(Math.round(base + Math.random() * 10));
        predicted.push(null);
    }
    for (let i = 1; i <= 14; i++) {
        const d = new Date(Date.now() + i * 86400000);
        labels.push(d.toLocaleDateString("en-ZM", { month: "short", day: "numeric" }));
        actual.push(null);
        const base = 75 + Math.sin((30 + i) / 5) * 15;
        predicted.push(Math.round(base + Math.random() * 8));
    }
    return { labels, actual, predicted };
}
