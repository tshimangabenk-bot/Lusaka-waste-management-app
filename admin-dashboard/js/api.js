/* ============================================================================
   SMART WASTE ADMIN — API layer
   Handles JWT auth, token refresh, and all backend data loading.
   All functions populate the global arrays (BINS, REPORTS, etc.) that the
   render functions already use — keeping render logic untouched.
   ============================================================================ */

// ── Token helpers ─────────────────────────────────────────────────────────────
function getToken()  { return localStorage.getItem('swm_token'); }
function getRToken() { return localStorage.getItem('swm_refresh_token'); }

function saveTokens(access, refresh) {
    localStorage.setItem('swm_token', access);
    if (refresh) localStorage.setItem('swm_refresh_token', refresh);
}

function clearTokens() {
    ['swm_token', 'swm_refresh_token', 'swm_user'].forEach(k => localStorage.removeItem(k));
}


// ── Core fetch wrapper (auto-refreshes expired tokens) ────────────────────────
async function apiFetch(path, opts = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {}),
    };

    let res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

    if (res.status === 401) {
        const rt = getRToken();
        if (rt) {
            const rRes = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${rt}`, 'Content-Type': 'application/json' },
            });
            if (rRes.ok) {
                const rData = await rRes.json();
                saveTokens(rData.access_token, null);
                res = await fetch(`${API_BASE}${path}`, {
                    ...opts,
                    headers: { ...headers, Authorization: `Bearer ${rData.access_token}` },
                });
            }
        }
        if (res.status === 401) {
            clearTokens();
            checkAuth();
            throw new Error('Session expired — please log in again.');
        }
    }

    return res;
}


// ── Authentication ────────────────────────────────────────────────────────────
async function apiDoLogin(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    return data;
}


// ── Data loaders (return normalised arrays matching render-function shapes) ────

async function loadBins() {
    const res  = await apiFetch('/bins');
    const data = await res.json();
    return data.map(b => ({ ...b, zone_name: b.zone?.name || '—' }));
}

async function loadReports() {
    const res  = await apiFetch('/reports');
    const data = await res.json();
    return data.map(r => ({
        ...r,
        reporter_name: r.reporter
            ? `${r.reporter.first_name} ${r.reporter.last_name}`
            : 'Unknown',
        zone_name: ZONES.find(z => z.id === r.zone_id)?.name || '—',
    }));
}

async function loadRoutes() {
    const res  = await apiFetch('/routes');
    const data = await res.json();
    return data.map(r => ({
        ...r,
        zone_name:   ZONES.find(z => z.id === r.zone_id)?.name || '—',
        vehicle_reg: VEHICLES.find(v => v.id === r.vehicle_id)?.registration_no || '—',
        driver_name: (() => {
            const d = USERS.find(u => u.id === r.driver_id);
            return d ? `${d.first_name} ${d.last_name}` : '—';
        })(),
        stops_count: Array.isArray(r.stops) ? r.stops.length : 0,
    }));
}

async function loadVehicles() {
    const res  = await apiFetch('/vehicles');
    const data = await res.json();
    return data.map(v => ({
        ...v,
        assigned_driver_name: DRIVERS.find(d => d.id === v.assigned_driver)?.name || '—',
    }));
}

async function loadZones() {
    const res  = await apiFetch('/zones');
    const data = await res.json();
    return data.map(z => ({
        ...z,
        avg_fill_pct: (() => {
            const zBins = BINS.filter(b => b.zone_id === z.id);
            if (!zBins.length) return 0;
            return Math.round(zBins.reduce((s, b) => s + (b.fill_percentage || 0), 0) / zBins.length);
        })(),
        report_count: REPORTS.filter(r => r.zone_id === z.id).length,
    }));
}

async function loadUsers() {
    const res  = await apiFetch('/users');
    return res.json();
}

async function loadAlerts() {
    const res  = await apiFetch('/alerts?resolved=false');
    return res.json();
}

async function loadDrivers() {
    const res  = await apiFetch('/drivers');
    const data = await res.json();
    return data.map(d => ({ ...d, name: `${d.first_name} ${d.last_name}` }));
}

async function loadRewardCatalog() {
    const res  = await apiFetch('/rewards/catalog');
    return res.json();
}

async function loadAnalytics() {
    const res  = await apiFetch('/dashboard/analytics');
    return res.json();
}


// ── Load everything (called once on login + on manual refresh) ────────────────
async function loadAllData() {
    try {
        // Bins first — needed by zones normaliser
        BINS     = await loadBins();
        REPORTS  = await loadReports();
        USERS    = await loadUsers();
        DRIVERS  = await loadDrivers();  // before VEHICLES so name resolution works
        VEHICLES = await loadVehicles();
        // Zones depend on BINS + REPORTS being populated
        ZONES    = await loadZones();
        // Routes depend on ZONES + VEHICLES + USERS
        ROUTES   = await loadRoutes();
        ALERTS         = await loadAlerts();
        REWARD_CATALOG = await loadRewardCatalog();
        ANALYTICS      = await loadAnalytics();
        return true;
    } catch (err) {
        console.error('loadAllData error:', err);
        return false;
    }
}

// Per-page refresh — only reload the data relevant to the current page
async function refreshPageData(page) {
    try {
        switch (page) {
            case 'dashboard':
                BINS    = await loadBins();
                ALERTS  = await loadAlerts();
                REPORTS = await loadReports();
                break;
            case 'map':
            case 'bins':
                BINS = await loadBins();
                break;
            case 'reports':
                REPORTS = await loadReports();
                break;
            case 'routes':
                ROUTES = await loadRoutes();
                break;
            case 'vehicles':
                DRIVERS  = await loadDrivers();
                VEHICLES = await loadVehicles();
                break;
            case 'alerts':
                ALERTS = await loadAlerts();
                break;
            case 'zones':
                BINS    = await loadBins();
                REPORTS = await loadReports();
                ZONES   = await loadZones();
                break;
            case 'users':
                USERS = await loadUsers();
                break;
            case 'rewards':
                REWARD_CATALOG = await loadRewardCatalog();
                USERS = await loadUsers();
                break;
            case 'analytics':
                ANALYTICS = await loadAnalytics();
                ZONES     = await loadZones();
                break;
            default:
                break;
        }
    } catch (err) {
        console.error('refreshPageData error:', err);
    }
}


// ── CRUD API calls ────────────────────────────────────────────────────────────

// Bins
async function apiCreateBin(payload) {
    const res = await apiFetch('/bins', { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to create bin');
    return res.json();
}

async function apiUpdateBin(id, payload) {
    const res = await apiFetch(`/bins/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update bin');
    return res.json();
}

// Routes
async function apiCreateRoute(payload) {
    const res = await apiFetch('/routes', { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to create route');
    return res.json();
}

async function apiStartRoute(id) {
    const res = await apiFetch(`/routes/${id}/start`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to start route');
    return res.json();
}

async function apiCompleteRoute(id) {
    const res = await apiFetch(`/routes/${id}/complete`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to complete route');
    return res.json();
}

// Vehicles
async function apiCreateVehicle(payload) {
    const res = await apiFetch('/vehicles', { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to create vehicle');
    return res.json();
}

async function apiUpdateVehicle(id, payload) {
    const res = await apiFetch(`/vehicles/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update vehicle');
    return res.json();
}

// Reports
async function apiUpdateReportStatus(id, status) {
    const res = await apiFetch(`/reports/${id}/status`, {
        method: 'PATCH',
        body:   JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update report');
    return res.json();
}

// Alerts
async function apiResolveAlert(id) {
    const res = await apiFetch(`/alerts/${id}/resolve`, { method: 'PATCH' });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to resolve alert');
    return res.json();
}

async function apiMarkAllAlertsRead() {
    await apiFetch('/alerts/mark-all-read', { method: 'PATCH' });
}

// Zones
async function apiUpdateZone(id, payload) {
    const res = await apiFetch(`/zones/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update zone');
    return res.json();
}

async function apiCreateZone(payload) {
    const res = await apiFetch('/zones', { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to create zone');
    return res.json();
}

// Users
async function apiUpdateUser(id, payload) {
    const res = await apiFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update user');
    return res.json();
}
