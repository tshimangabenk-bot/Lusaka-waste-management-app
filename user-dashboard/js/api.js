/* ============================================================================
   SMARTWASTE RESIDENT PORTAL — API layer
   Wraps all backend calls with JWT auth handling
   ============================================================================ */

// API_BASE is defined in js/config.js — edit that file to change the server URL.

// Automatically set to false after the first connection failure so
// subsequent calls skip the network and go straight to demo fallbacks.
let _backendAvailable = true;
let _backendCheckPending = false;

function getToken()  { return localStorage.getItem('sw_access_token'); }
function getRToken() { return localStorage.getItem('sw_refresh_token'); }

function saveTokens(access, refresh) {
    localStorage.setItem('sw_access_token',  access);
    if (refresh) localStorage.setItem('sw_refresh_token', refresh);
}

function clearSession() {
    localStorage.removeItem('sw_access_token');
    localStorage.removeItem('sw_refresh_token');
}

async function tryRefresh() {
    const rt = getRToken();
    if (!rt) return false;
    try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${rt}` }
        });
        if (!res.ok) return false;
        const data = await res.json();
        saveTokens(data.access_token);
        return true;
    } catch { return false; }
}

async function apiFetch(path, options = {}, retry = true) {
    // Skip network if we already know the backend is unreachable
    if (!_backendAvailable) {
        throw new Error('Backend unavailable — using demo data');
    }

    const token = getToken();
    let res;
    try {
        res = await fetch(API_BASE + path, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                ...(options.headers || {}),
            },
        });
    } catch (networkErr) {
        // Connection refused / offline — disable further attempts this session
        if (_backendAvailable) {
            console.info('SmartWaste: backend unreachable at', API_BASE, '— switching to demo mode.');
        }
        _backendAvailable = false;
        throw new Error('Backend unavailable — using demo data');
    }

    if (res.status === 401 && retry) {
        const ok = await tryRefresh();
        if (ok) return apiFetch(path, options, false);
        clearSession();
        window.location.href = 'login.html';
        return;
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
    }

    // Successful response — backend is reachable
    _backendAvailable = true;
    return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function apiLogin(email, password) {
    const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });
    saveTokens(data.access_token, data.refresh_token);
    return data.user;
}

function apiLogout() { clearSession(); window.location.href = 'login.html'; }

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function apiGetDashboard()     { return apiFetch('/users/me/dashboard'); }

// ── Reports ───────────────────────────────────────────────────────────────────
async function apiGetReports(status) {
    const qs = status && status !== 'all' ? `?status=${status}` : '';
    return apiFetch('/reports' + qs);
}

async function apiCreateReport(body) {
    return apiFetch('/reports', { method: 'POST', body: JSON.stringify(body) });
}

// ── Rewards ───────────────────────────────────────────────────────────────────
async function apiGetBalance()       { return apiFetch('/rewards/balance'); }
async function apiGetCatalog()       { return apiFetch('/rewards/catalog'); }
async function apiGetHistory()       { return apiFetch('/rewards/history'); }
async function apiRedeem(item_id)    { return apiFetch('/rewards/redeem', { method: 'POST', body: JSON.stringify({ item_id }) }); }

// ── Bins ──────────────────────────────────────────────────────────────────────
async function apiGetNearbyBins(lat, lng, radius = 1000) {
    return apiFetch(`/bins/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
}

// ── Notifications ─────────────────────────────────────────────────────────────
async function apiGetNotifications() { return apiFetch('/users/me/notifications'); }
