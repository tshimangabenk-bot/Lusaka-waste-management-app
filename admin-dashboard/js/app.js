/* ============================================================================
   SMART WASTE MANAGEMENT — ADMIN DASHBOARD APPLICATION
   ============================================================================ */

// ── State ─────────────────────────────────────────────────────────────────────
let currentPage = "dashboard";
let map = null;
let mapMarkers = [];
let charts = {};
let autoRefreshTimer = null;
let searchTimeout = null;

const PAGINATION = {
    bins:    { page: 1, perPage: 15 },
    reports: { page: 1, perPage: 15 },
    routes:  { page: 1, perPage: 15 },
    users:   { page: 1, perPage: 15 },
};

// Auth is handled by api.js (JWT against Flask backend)

// ── Helpers ───────────────────────────────────────────────────────────────────
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function refreshIcons() {
    document.querySelectorAll('[class*="lucide-"]').forEach(el => {
        const cls = [...el.classList].find(c => c.startsWith('lucide-'));
        if (cls && !el.getAttribute('data-lucide'))
            el.setAttribute('data-lucide', cls.replace('lucide-', ''));
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-ZM", { year: "numeric", month: "short", day: "numeric" });
}

function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function fillColor(pct) {
    if (pct >= 85) return "red";
    if (pct >= 65) return "orange";
    if (pct >= 40) return "yellow";
    return "green";
}

function fillBarHTML(pct) {
    return `
        <div class="fill-bar-container">
            <div class="fill-bar">
                <div class="fill-bar-inner ${fillColor(pct)}" style="width:${pct}%"></div>
            </div>
            <span class="fill-bar-label">${pct}%</span>
        </div>`;
}

function categoryLabel(cat) {
    return (cat || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}


// ── Authentication ────────────────────────────────────────────────────────────
function checkAuth() {
    if (getToken()) {
        $("#loginOverlay").style.display = "none";
    } else {
        $("#loginOverlay").style.display = "flex";
    }
}

async function handleLogin() {
    const email    = $("#loginUsername").value.trim();
    const password = $("#loginPassword").value;
    const errorEl  = $("#loginError");
    const btn      = $("#loginBtn");

    if (!email || !password) {
        errorEl.textContent = "Enter your email and password.";
        errorEl.style.display = "block";
        return;
    }

    btn.disabled = true;
    btn.textContent = "Signing in…";

    try {
        const data = await apiDoLogin(email, password);

        if (!["admin", "supervisor"].includes(data.user?.role)) {
            throw new Error("Access denied — admin account required.");
        }

        saveTokens(data.access_token, data.refresh_token);
        localStorage.setItem("swm_user", JSON.stringify(data.user));

        // Update sidebar name/email
        const u = data.user;
        const nameEl = $("#sidebarUserName");
        const emailEl = $("#sidebarUserEmail");
        if (nameEl)  nameEl.textContent  = `${u.first_name} ${u.last_name}`;
        if (emailEl) emailEl.textContent = u.email;

        $("#loginOverlay").style.display = "none";
        errorEl.style.display = "none";

        await loadAllData();
        renderDashboard();
        refreshIcons();
        showToast(`Welcome back, ${u.first_name}!`);
        registerFcmToken();

    } catch (err) {
        errorEl.textContent = err.message || "Login failed.";
        errorEl.style.display = "block";
    } finally {
        btn.disabled = false;
        btn.textContent = "Sign In";
    }
}

async function registerFcmToken() {
    if (!('Notification' in window) || !getToken()) return;
    if (Notification.permission === 'denied') return;
    if (typeof firebase === 'undefined' || !firebase.apps?.length) return;
    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        let swReg;
        if ('serviceWorker' in navigator) {
            swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        }

        const messaging = firebase.messaging();
        const fcmToken = await messaging.getToken({
            vapidKey: window.FIREBASE_VAPID_KEY || '',
            serviceWorkerRegistration: swReg,
        });

        if (fcmToken) {
            await apiFetch('/users/me/fcm-token', {
                method: 'PUT',
                body: JSON.stringify({ fcm_token: fcmToken }),
            });
        }

        messaging.onMessage(payload => {
            const title = payload.notification?.title || 'SmartWaste Alert';
            const body  = payload.notification?.body  || '';
            showToast(`${title}: ${body}`, 'error');
        });
    } catch {
        // FCM not configured or permission denied — degrade silently
    }
}

function handleLogout() {
    clearTokens();
    closeUserMenu();
    $("#loginOverlay").style.display = "flex";
    $("#loginUsername").value = "";
    $("#loginPassword").value = "";
    showToast("Logged out successfully", "success");
}

$("#loginBtn").addEventListener("click", handleLogin);
$("#loginPassword").addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); });
$("#loginUsername").addEventListener("keydown", e => { if (e.key === "Enter") $("#loginPassword").focus(); });

$("#togglePasswordBtn").addEventListener("click", () => {
    const input = $("#loginPassword");
    const icon  = $("#togglePasswordIcon");
    const show  = input.type === "password";
    input.type  = show ? "text" : "password";
    icon.className = show ? "lucide-eye-off" : "lucide-eye";
    refreshIcons();
});


// ── Toast Notifications ───────────────────────────────────────────────────────
function showToast(message, type = "success") {
    const container = $("#toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icons = { success: "lucide-check-circle", error: "lucide-x-circle", warning: "lucide-alert-triangle" };
    toast.innerHTML = `
        <i class="${icons[type] || icons.success}" style="font-size:1.1rem;"></i>
        <span>${message}</span>
        <span class="toast-dismiss" onclick="this.parentElement.remove()"><i class="lucide-x"></i></span>`;
    container.appendChild(toast);
    refreshIcons();
    setTimeout(() => toast.remove(), 4000);
}


// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(title, bodyHTML, onConfirm, confirmText = "Confirm") {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = bodyHTML;
    $("#modalConfirmBtn").textContent = confirmText;
    $("#modalConfirmBtn").onclick = () => { onConfirm(); closeModal(); };
    $("#modalOverlay").classList.add("active");
    refreshIcons();
}

function closeModal() {
    $("#modalOverlay").classList.remove("active");
}

$("#modalClose").addEventListener("click", closeModal);
$("#modalCancelBtn").addEventListener("click", closeModal);
$("#modalOverlay").addEventListener("click", e => { if (e.target === $("#modalOverlay")) closeModal(); });


// ── Navigation ────────────────────────────────────────────────────────────────
const PAGE_TITLES = {
    dashboard: ["Dashboard", "Real-time overview of Lusaka's waste management"],
    map: ["Live Map", "GPS positions of all smart bins across Lusaka"],
    bins: ["Smart Bins", "Monitor and manage all IoT-connected waste bins"],
    routes: ["Collection Routes", "Plan and track waste collection routes"],
    vehicles: ["Fleet Management", "Manage collection vehicles and drivers"],
    reports: ["Citizen Reports", "Review community waste reports and assignments"],
    rewards: ["Incentive Program", "Manage the recycling reward system"],
    analytics: ["Analytics", "Predictive insights and waste generation trends"],
    alerts: ["System Alerts", "Monitor real-time alerts from smart bins"],
    zones: ["Zone Management", "View and manage Lusaka compound zones"],
    users: ["User Management", "Manage registered users and roles"],
    settings: ["Settings", "System configuration and health monitoring"],
};

function navigateTo(page) {
    currentPage = page;
    $$(".nav-item").forEach(item => item.classList.remove("active"));
    const navEl = $(`#nav-${page}`) || $(`.nav-item[data-page="${page}"]`);
    if (navEl) navEl.classList.add("active");

    const [title, subtitle] = PAGE_TITLES[page] || [page, ""];
    $("#pageTitle").textContent = title;
    $("#pageSubtitle").textContent = subtitle;

    $$(".page-section").forEach(s => s.classList.remove("active"));
    const pageEl = $(`#page-${page}`);
    if (pageEl) pageEl.classList.add("active");

    renderPage(page);
    refreshIcons();
}

$$(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
        const page = item.dataset.page;
        if (page) navigateTo(page);
    });
});


// ── Sidebar Toggle ────────────────────────────────────────────────────────────
$("#sidebarToggle").addEventListener("click", () => {
    const sidebar = $("#sidebar");
    const main = $("#mainContent");
    sidebar.classList.toggle("collapsed");
    main.classList.toggle("sidebar-collapsed");
    refreshIcons();
});


// ── Clock ─────────────────────────────────────────────────────────────────────
function updateClock() {
    const now = new Date();
    $("#headerTime").textContent = now.toLocaleTimeString("en-ZM", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    $("#headerDate").textContent = now.toLocaleDateString("en-ZM", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
setInterval(updateClock, 1000);
updateClock();


// ── Refresh Button ────────────────────────────────────────────────────────────
$("#headerRefreshBtn").addEventListener("click", () => {
    renderPage(currentPage);
    refreshIcons();
    showToast("Data refreshed successfully");
});


// ── Global Search ─────────────────────────────────────────────────────────────
$("#globalSearch").addEventListener("input", e => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    const resultsEl = $("#searchResults");

    if (!query || query.length < 2) {
        resultsEl.classList.remove("open");
        return;
    }

    searchTimeout = setTimeout(() => {
        const q = query.toLowerCase();

        const binResults = BINS.filter(b =>
            b.label.toLowerCase().includes(q) ||
            b.zone_name.toLowerCase().includes(q) ||
            b.bin_type.toLowerCase().includes(q)
        ).slice(0, 5);

        const reportResults = REPORTS.filter(r =>
            r.id.toLowerCase().includes(q) ||
            r.reporter_name.toLowerCase().includes(q) ||
            r.description.toLowerCase().includes(q)
        ).slice(0, 5);

        const userResults = USERS.filter(u =>
            `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q)
        ).slice(0, 5);

        if (!binResults.length && !reportResults.length && !userResults.length) {
            resultsEl.innerHTML = `<div class="search-no-results">No results for "${query}"</div>`;
            resultsEl.classList.add("open");
            return;
        }

        let html = "";

        if (binResults.length) {
            html += `<div class="search-result-group">
                <div class="search-result-group-label">Smart Bins</div>
                ${binResults.map(b => `
                    <div class="search-result-item" onclick="navigateTo('bins');closeSearch();">
                        <i class="lucide-trash-2" style="color:var(--accent-primary);flex-shrink:0;"></i>
                        <div>
                            <div>${b.label}</div>
                            <div class="meta">${b.zone_name} · ${b.fill_percentage}% full</div>
                        </div>
                    </div>`).join("")}
            </div>`;
        }

        if (reportResults.length) {
            html += `<div class="search-result-group">
                <div class="search-result-group-label">Citizen Reports</div>
                ${reportResults.map(r => `
                    <div class="search-result-item" onclick="navigateTo('reports');closeSearch();">
                        <i class="lucide-file-text" style="color:var(--warning);flex-shrink:0;"></i>
                        <div>
                            <div>${r.id} · ${r.reporter_name}</div>
                            <div class="meta">${r.zone_name}</div>
                        </div>
                    </div>`).join("")}
            </div>`;
        }

        if (userResults.length) {
            html += `<div class="search-result-group">
                <div class="search-result-group-label">Users</div>
                ${userResults.map(u => `
                    <div class="search-result-item" onclick="navigateTo('users');closeSearch();">
                        <i class="lucide-user" style="color:var(--info);flex-shrink:0;"></i>
                        <div>
                            <div>${u.first_name} ${u.last_name}</div>
                            <div class="meta">${u.email} · ${u.role}</div>
                        </div>
                    </div>`).join("")}
            </div>`;
        }

        resultsEl.innerHTML = html;
        resultsEl.classList.add("open");
        refreshIcons();
    }, 200);
});

function closeSearch() {
    $("#globalSearch").value = "";
    $("#searchResults").classList.remove("open");
}


// ── Notification Dropdown ─────────────────────────────────────────────────────
function toggleNotifDropdown() {
    const dropdown = $("#notifDropdown");
    dropdown.classList.toggle("open");
    if (dropdown.classList.contains("open")) renderNotifDropdown();
}

function renderNotifDropdown() {
    const unread = ALERTS.filter(a => !a.is_read && !a.resolved).slice(0, 10);
    const body = $("#notifDropdownBody");

    body.innerHTML = unread.length === 0
        ? `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.82rem;">All caught up! No new alerts.</div>`
        : unread.map(a => `
            <div class="notif-item unread" onclick="markAlertReadFromNotif('${a.id}')">
                <div class="alert-icon ${a.severity}" style="width:28px;height:28px;font-size:0.75rem;flex-shrink:0;">
                    <i class="lucide-${a.severity === 'critical' ? 'alert-triangle' : a.severity === 'warning' ? 'alert-circle' : 'info'}"></i>
                </div>
                <div class="notif-item-text">
                    <div>${a.message}</div>
                    <div class="notif-item-time">${timeAgo(a.created_at)}</div>
                </div>
            </div>`).join("");

    refreshIcons();
}

function markAlertReadFromNotif(alertId) {
    const alert = ALERTS.find(a => a.id === alertId);
    if (alert) {
        alert.is_read = true;
        renderNotifDropdown();
        updateNotifBadge();
    }
}

function updateNotifBadge() {
    const count = ALERTS.filter(a => !a.is_read && !a.resolved).length;
    const badge = $("#headerNotifBadge");
    if (badge) badge.textContent = count;
}

$("#headerNotifBtn").addEventListener("click", e => {
    e.stopPropagation();
    toggleNotifDropdown();
});

$("#markAllNotifReadBtn").addEventListener("click", e => {
    e.stopPropagation();
    ALERTS.forEach(a => { a.is_read = true; });
    updateNotifBadge();
    renderNotifDropdown();
    showToast("All notifications marked as read");
});

$("#notifViewAllBtn").addEventListener("click", () => {
    navigateTo("alerts");
    $("#notifDropdown").classList.remove("open");
});


// ── User Menu Dropdown ────────────────────────────────────────────────────────
function toggleUserMenu() {
    const dropdown = $("#userMenuDropdown");
    dropdown.classList.toggle("open");
    const chevron = $("#userMenuChevron");
    if (chevron) {
        chevron.className = dropdown.classList.contains("open") ? "lucide-chevron-down" : "lucide-chevron-up";
        refreshIcons();
    }
}

function closeUserMenu() {
    const dropdown = $("#userMenuDropdown");
    if (dropdown) dropdown.classList.remove("open");
    const chevron = $("#userMenuChevron");
    if (chevron) { chevron.className = "lucide-chevron-up"; refreshIcons(); }
}

$("#sidebarUser").addEventListener("click", e => { e.stopPropagation(); toggleUserMenu(); });
$("#menuSettingsBtn").addEventListener("click", () => { navigateTo("settings"); closeUserMenu(); });
$("#menuLogoutBtn").addEventListener("click", handleLogout);


// ── Close dropdowns on outside click ─────────────────────────────────────────
document.addEventListener("click", e => {
    const searchWrapper = $(".search-wrapper");
    if (searchWrapper && !searchWrapper.contains(e.target))
        $("#searchResults").classList.remove("open");

    const notifWrapper = $(".notif-wrapper");
    if (notifWrapper && !notifWrapper.contains(e.target))
        $("#notifDropdown").classList.remove("open");

    const userMenuWrapper = $("#userMenuWrapper");
    if (userMenuWrapper && !userMenuWrapper.contains(e.target))
        closeUserMenu();
});


// ── Pagination ────────────────────────────────────────────────────────────────
function paginate(arr, key) {
    const state = PAGINATION[key];
    const total = arr.length;
    const totalPages = Math.max(1, Math.ceil(total / state.perPage));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.perPage;
    return {
        items: arr.slice(start, start + state.perPage),
        total,
        totalPages,
        start: total === 0 ? 0 : start + 1,
        end: Math.min(start + state.perPage, total),
    };
}

function paginationHTML(key, total, filtered) {
    if (filtered === 0) return "";
    const state = PAGINATION[key];
    const totalPages = Math.ceil(filtered / state.perPage);
    if (totalPages <= 1) return "";
    const startItem = (state.page - 1) * state.perPage + 1;
    const endItem = Math.min(state.page * state.perPage, filtered);

    let pages = "";
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || Math.abs(i - state.page) <= 1) {
            pages += `<button class="page-btn ${i === state.page ? "active" : ""}" onclick="goToPage('${key}',${i})">${i}</button>`;
        } else if (Math.abs(i - state.page) === 2) {
            pages += `<span style="padding:0 2px;color:var(--text-muted);font-size:0.8rem;">…</span>`;
        }
    }

    const suffix = filtered < total ? ` (filtered from ${total})` : "";
    return `
        <div class="pagination">
            <span>Showing ${startItem}–${endItem} of ${filtered}${suffix}</span>
            <div class="pagination-controls">
                <button class="page-btn" onclick="goToPage('${key}',${state.page - 1})" ${state.page <= 1 ? "disabled" : ""}><i class="lucide-chevron-left"></i></button>
                ${pages}
                <button class="page-btn" onclick="goToPage('${key}',${state.page + 1})" ${state.page >= totalPages ? "disabled" : ""}><i class="lucide-chevron-right"></i></button>
            </div>
        </div>`;
}

function goToPage(key, page) {
    PAGINATION[key].page = page;
    switch (key) {
        case "bins":    updateBinsTable();    break;
        case "reports": updateReportsTable(); break;
        case "routes":  updateRoutesTable();  break;
        case "users":   updateUsersTable();   break;
    }
    refreshIcons();
}


// ── CSV Export ────────────────────────────────────────────────────────────────
function exportCSV(data, headers, filename) {
    const rows = [headers, ...data];
    const csv = rows.map(r => r.map(v => `"${(v ?? "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${data.length} records to ${filename}`);
}

function exportBins() {
    const zoneFilter = $("#binsFilterZone").value;
    const statusFilter = $("#binsFilterStatus").value;
    let data = BINS;
    if (zoneFilter) data = data.filter(b => b.zone_id == zoneFilter);
    if (statusFilter) data = data.filter(b => b.status === statusFilter);
    exportCSV(
        data.map(b => [b.label, b.zone_name, b.bin_type, b.fill_percentage, b.status, b.capacity_liters, formatDate(b.last_emptied_at)]),
        ["Label", "Zone", "Type", "Fill %", "Status", "Capacity (L)", "Last Emptied"],
        "smart-bins.csv"
    );
}

function exportReports() {
    const statusFilter = $("#reportsFilterStatus").value;
    const catFilter = $("#reportsFilterCategory").value;
    let data = REPORTS;
    if (statusFilter) data = data.filter(r => r.status === statusFilter);
    if (catFilter) data = data.filter(r => r.category === catFilter);
    exportCSV(
        data.map(r => [r.id, r.reporter_name, r.category, r.zone_name, r.description, r.status, formatDate(r.created_at)]),
        ["ID", "Reporter", "Category", "Zone", "Description", "Status", "Submitted"],
        "citizen-reports.csv"
    );
}

function exportRoutes() {
    exportCSV(
        ROUTES.map(r => [r.name, r.zone_name, r.vehicle_reg, r.driver_name, r.scheduled_date, r.stops_count, r.status]),
        ["Route Name", "Zone", "Vehicle", "Driver", "Scheduled", "Stops", "Status"],
        "collection-routes.csv"
    );
}

function exportUsers() {
    const roleFilter = $("#usersFilterRole").value;
    let data = USERS;
    if (roleFilter) data = data.filter(u => u.role === roleFilter);
    exportCSV(
        data.map(u => [`${u.first_name} ${u.last_name}`, u.email, u.phone, u.role, u.compound, formatDate(u.created_at), u.is_active ? "Active" : "Inactive"]),
        ["Name", "Email", "Phone", "Role", "Compound", "Joined", "Status"],
        "users.csv"
    );
}

$("#exportBinsBtn").addEventListener("click", exportBins);
$("#exportReportsBtn").addEventListener("click", exportReports);
$("#exportRoutesBtn").addEventListener("click", exportRoutes);
$("#exportUsersBtn").addEventListener("click", exportUsers);


// ══════════════════════════════════════════════════════════════════════════════
// PAGE RENDERERS
// ══════════════════════════════════════════════════════════════════════════════

async function renderPage(page) {
    if (!getToken()) return;
    await refreshPageData(page);
    switch (page) {
        case "dashboard": renderDashboard(); break;
        case "map":       renderMap();       break;
        case "bins":      renderBins();      break;
        case "routes":    renderRoutes();    break;
        case "vehicles":  renderVehicles();  break;
        case "reports":   renderReports();   break;
        case "rewards":   renderRewards();   break;
        case "analytics": renderAnalytics(); break;
        case "alerts":    renderAlerts();    break;
        case "zones":     renderZones();     break;
        case "users":     renderUsers();     break;
        case "settings":  renderSettings();  break;
    }
}


// ── DASHBOARD ────────────────────────────────────────────────────────────────
function renderDashboard() {
    const totalBins = BINS.length;
    const fullBins = BINS.filter(b => b.fill_percentage >= 85).length;
    const pendingReports = REPORTS.filter(r => r.status === "pending").length;
    const activeRoutes = ROUTES.filter(r => r.status === "in_progress").length;
    const unresolvedAlerts = ALERTS.filter(a => !a.resolved).length;
    const totalUsers = USERS.length;

    $("#statsGrid").innerHTML = `
        <div class="stat-card">
            <div class="stat-card-header">
                <span class="label">Total Smart Bins</span>
                <div class="icon green"><i class="lucide-trash-2"></i></div>
            </div>
            <div class="value">${totalBins}</div>
            <span class="trend up"><i class="lucide-trending-up"></i> 8 new this month</span>
        </div>
        <div class="stat-card">
            <div class="stat-card-header">
                <span class="label">Bins ≥ 85% Full</span>
                <div class="icon red"><i class="lucide-alert-triangle"></i></div>
            </div>
            <div class="value" style="color:var(--danger)">${fullBins}</div>
            <span class="trend down"><i class="lucide-trending-down"></i> ${Math.round(fullBins / totalBins * 100)}% of fleet</span>
        </div>
        <div class="stat-card">
            <div class="stat-card-header">
                <span class="label">Pending Reports</span>
                <div class="icon orange"><i class="lucide-message-square-warning"></i></div>
            </div>
            <div class="value" style="color:var(--warning)">${pendingReports}</div>
            <span class="trend down"><i class="lucide-clock"></i> Awaiting review</span>
        </div>
        <div class="stat-card">
            <div class="stat-card-header">
                <span class="label">Active Routes</span>
                <div class="icon blue"><i class="lucide-route"></i></div>
            </div>
            <div class="value">${activeRoutes}</div>
            <span class="trend up"><i class="lucide-truck"></i> Trucks on road</span>
        </div>
        <div class="stat-card">
            <div class="stat-card-header">
                <span class="label">Unresolved Alerts</span>
                <div class="icon red"><i class="lucide-bell-ring"></i></div>
            </div>
            <div class="value" style="color:var(--danger)">${unresolvedAlerts}</div>
            <span class="trend down"><i class="lucide-alert-circle"></i> Require attention</span>
        </div>
        <div class="stat-card">
            <div class="stat-card-header">
                <span class="label">Registered Users</span>
                <div class="icon green"><i class="lucide-users"></i></div>
            </div>
            <div class="value">${totalUsers}</div>
            <span class="trend up"><i class="lucide-trending-up"></i> 12 this week</span>
        </div>`;

    renderCollectionTrendsChart(7);
    renderFillDistributionChart();

    const recentAlerts = ALERTS.filter(a => !a.resolved).slice(0, 6);
    $("#dashboardAlerts").innerHTML = recentAlerts.length === 0
        ? `<div class="empty-state"><i class="lucide-check-circle"></i><h4>All Clear</h4><p>No unresolved alerts</p></div>`
        : recentAlerts.map(a => `
            <div class="alert-item">
                <div class="alert-icon ${a.severity}">
                    <i class="lucide-${a.severity === 'critical' ? 'alert-triangle' : a.severity === 'warning' ? 'alert-circle' : 'info'}"></i>
                </div>
                <div class="alert-content">
                    <div class="message">${a.message}</div>
                    <div class="meta">
                        <span>${categoryLabel(a.alert_type)}</span>
                        <span>${timeAgo(a.created_at)}</span>
                    </div>
                </div>
            </div>`).join("");

    renderZonePerformanceChart();

    $$(".tab-bar .tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            $$(".tab-bar .tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const days = btn.dataset.range === "7d" ? 7 : btn.dataset.range === "30d" ? 30 : 90;
            renderCollectionTrendsChart(days);
        });
    });
}

function renderCollectionTrendsChart(days) {
    const data = generateTrendData(days);
    if (charts.collectionTrends) charts.collectionTrends.destroy();
    charts.collectionTrends = new Chart($("#collectionTrendsChart"), {
        type: "line",
        data: {
            labels: data.labels,
            datasets: [
                { label: "Collected (tonnes)", data: data.collected, borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.1)", fill: true, tension: 0.4, borderWidth: 2, pointRadius: days <= 7 ? 4 : 0, pointHoverRadius: 6 },
                { label: "Generated (tonnes)", data: data.generated, borderColor: "#6366f1", backgroundColor: "rgba(99,102,241,0.1)", fill: true, tension: 0.4, borderWidth: 2, pointRadius: days <= 7 ? 4 : 0, pointHoverRadius: 6 },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: "#94a3b8", font: { family: "Inter" } } } },
            scales: {
                x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#64748b", font: { size: 10 } } },
                y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#64748b", font: { size: 10 } } },
            },
        },
    });
}

function renderFillDistributionChart() {
    const counts = { empty: 0, low: 0, medium: 0, high: 0, full: 0, overflow: 0 };
    BINS.forEach(b => { if (counts[b.status] !== undefined) counts[b.status]++; });
    if (charts.fillDistribution) charts.fillDistribution.destroy();
    charts.fillDistribution = new Chart($("#fillDistributionChart"), {
        type: "doughnut",
        data: {
            labels: ["Empty", "Low", "Medium", "High", "Full", "Overflow"],
            datasets: [{ data: [counts.empty, counts.low, counts.medium, counts.high, counts.full, counts.overflow], backgroundColor: ["#10b981", "#34d399", "#3b82f6", "#f59e0b", "#ef4444", "#dc2626"], borderColor: "#111827", borderWidth: 3, hoverOffset: 8 }],
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: "65%",
            plugins: { legend: { position: "bottom", labels: { color: "#94a3b8", padding: 16, font: { family: "Inter", size: 11 } } } },
        },
    });
}

function renderZonePerformanceChart() {
    if (charts.zonePerformance) charts.zonePerformance.destroy();
    charts.zonePerformance = new Chart($("#zonePerformanceChart"), {
        type: "bar",
        data: {
            labels: ZONES.map(z => z.name),
            datasets: [{ label: "Avg Fill %", data: ZONES.map(z => z.avg_fill_pct), backgroundColor: ZONES.map(z => z.avg_fill_pct >= 75 ? "rgba(239,68,68,0.7)" : z.avg_fill_pct >= 50 ? "rgba(245,158,11,0.7)" : "rgba(16,185,129,0.7)"), borderRadius: 6, borderSkipped: false }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: "#64748b", font: { size: 10 }, maxRotation: 45 } },
                y: { max: 100, grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#64748b", font: { size: 10 }, callback: v => v + "%" } },
            },
        },
    });
}


// ── LIVE MAP ──────────────────────────────────────────────────────────────────
function renderMap() {
    if (!map) {
        map = L.map("mapContainer").setView([-15.415, 28.30], 13);
        if (navigator.onLine) {
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "&copy; OpenStreetMap contributors",
            }).addTo(map);
        } else {
            L.marker([-15.415, 28.30]).addTo(map).bindPopup("Map unavailable offline");
        }
        setTimeout(() => map.invalidateSize(), 300);
    } else {
        setTimeout(() => map.invalidateSize(), 300);
    }

    const zoneSelect = $("#mapFilterZone");
    if (zoneSelect.options.length <= 1) {
        ZONES.forEach(z => {
            const opt = document.createElement("option");
            opt.value = z.id;
            opt.textContent = z.name;
            zoneSelect.appendChild(opt);
        });
    }

    updateMapMarkers();
    $("#mapFilterZone").onchange = updateMapMarkers;
    $("#mapFilterStatus").onchange = updateMapMarkers;
}

function updateMapMarkers() {
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];

    const zoneFilter = $("#mapFilterZone").value;
    const statusFilter = $("#mapFilterStatus").value;
    let filtered = BINS;
    if (zoneFilter) filtered = filtered.filter(b => b.zone_id == zoneFilter);
    if (statusFilter) filtered = filtered.filter(b => b.status === statusFilter);

    filtered.forEach(bin => {
        const color = bin.fill_percentage >= 85 ? "#ef4444" : bin.fill_percentage >= 65 ? "#f59e0b" : bin.fill_percentage >= 40 ? "#3b82f6" : "#10b981";
        const icon = L.divIcon({
            className: "",
            html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid rgba(255,255,255,0.8);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);">${bin.fill_percentage}%</div>`,
            iconSize: [28, 28], iconAnchor: [14, 14],
        });
        const marker = L.marker([bin.latitude, bin.longitude], { icon }).addTo(map);
        marker.bindPopup(`
            <div style="font-family:Inter,sans-serif;min-width:180px;">
                <strong style="font-size:13px;">${bin.label}</strong><br>
                <span style="color:#666;font-size:11px;">${bin.zone_name} • ${bin.bin_type}</span>
                <hr style="border:none;border-top:1px solid #eee;margin:6px 0;">
                <div style="font-size:12px;">
                    <b>Fill:</b> ${bin.fill_percentage}% (${bin.status})<br>
                    <b>Capacity:</b> ${bin.capacity_liters}L<br>
                    <b>Last emptied:</b> ${formatDate(bin.last_emptied_at)}
                </div>
            </div>`);
        mapMarkers.push(marker);
    });
}


// ── SMART BINS ────────────────────────────────────────────────────────────────
function renderBins() {
    const total = BINS.length;
    const full = BINS.filter(b => b.fill_percentage >= 85).length;
    const avgFill = Math.round(BINS.reduce((s, b) => s + b.fill_percentage, 0) / total);
    const overflow = BINS.filter(b => b.status === "overflow").length;

    $("#binsStatsGrid").innerHTML = `
        <div class="stat-card"><div class="stat-card-header"><span class="label">Total Bins</span><div class="icon green"><i class="lucide-trash-2"></i></div></div><div class="value">${total}</div></div>
        <div class="stat-card"><div class="stat-card-header"><span class="label">Bins ≥ 85%</span><div class="icon red"><i class="lucide-alert-triangle"></i></div></div><div class="value" style="color:var(--danger)">${full}</div></div>
        <div class="stat-card"><div class="stat-card-header"><span class="label">Average Fill</span><div class="icon blue"><i class="lucide-bar-chart-3"></i></div></div><div class="value">${avgFill}%</div></div>
        <div class="stat-card"><div class="stat-card-header"><span class="label">Overflowing</span><div class="icon red"><i class="lucide-alert-triangle"></i></div></div><div class="value" style="color:var(--danger)">${overflow}</div></div>`;

    const zoneSelect = $("#binsFilterZone");
    if (zoneSelect.options.length <= 1) {
        ZONES.forEach(z => {
            const opt = document.createElement("option");
            opt.value = z.id;
            opt.textContent = z.name;
            zoneSelect.appendChild(opt);
        });
    }

    PAGINATION.bins.page = 1;
    updateBinsTable();

    $("#binsFilterZone").onchange = () => { PAGINATION.bins.page = 1; updateBinsTable(); };
    $("#binsFilterStatus").onchange = () => { PAGINATION.bins.page = 1; updateBinsTable(); };

    $("#addBinBtn").onclick = () => {
        openModal("Add Smart Bin", `
            <div class="form-row">
                <div class="form-group"><label>Label</label><input class="form-control" id="newBinLabel" placeholder="BIN-MTD-001"></div>
                <div class="form-group"><label>Zone</label>
                    <select class="form-control" id="newBinZone">
                        ${ZONES.map(z => `<option value="${z.id}" data-name="${z.name}">${z.name}</option>`).join("")}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Type</label>
                    <select class="form-control" id="newBinType">
                        <option value="general">General</option>
                        <option value="recyclable">Recyclable</option>
                        <option value="organic">Organic</option>
                        <option value="hazardous">Hazardous</option>
                    </select>
                </div>
                <div class="form-group"><label>Capacity (litres)</label><input type="number" class="form-control" id="newBinCapacity" value="240"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Latitude</label><input type="number" step="0.0001" class="form-control" id="newBinLat" placeholder="-15.42"></div>
                <div class="form-group"><label>Longitude</label><input type="number" step="0.0001" class="form-control" id="newBinLng" placeholder="28.30"></div>
            </div>
        `, async () => {
            const label = $("#newBinLabel").value || `BIN-NEW-${String(BINS.length + 1).padStart(3, "0")}`;
            try {
                await apiCreateBin({
                    label,
                    zone_id:         parseInt($("#newBinZone").value),
                    bin_type:        $("#newBinType").value,
                    capacity_liters: parseInt($("#newBinCapacity").value) || 240,
                    latitude:        parseFloat($("#newBinLat").value)    || -15.415,
                    longitude:       parseFloat($("#newBinLng").value)    || 28.30,
                });
                BINS = await loadBins();
                showToast(`Bin "${label}" created successfully`);
            } catch (err) { showToast(err.message, "error"); }
            PAGINATION.bins.page = 1;
            updateBinsTable();
            refreshIcons();
        }, "Create Bin");
    };
}

function updateBinsTable() {
    const zoneFilter = $("#binsFilterZone").value;
    const statusFilter = $("#binsFilterStatus").value;
    let filtered = [...BINS];
    if (zoneFilter) filtered = filtered.filter(b => b.zone_id == zoneFilter);
    if (statusFilter) filtered = filtered.filter(b => b.status === statusFilter);
    filtered.sort((a, b) => b.fill_percentage - a.fill_percentage);

    const { items, total, start, end } = paginate(filtered, "bins");

    $("#binsTableBody").innerHTML = items.map(b => `
        <tr>
            <td><strong>${b.label}</strong></td>
            <td>${b.zone_name}</td>
            <td>${categoryLabel(b.bin_type)}</td>
            <td>${fillBarHTML(b.fill_percentage)}</td>
            <td><span class="status-badge ${b.status}">${categoryLabel(b.status)}</span></td>
            <td>${formatDate(b.last_emptied_at)}</td>
            <td>
                <div class="action-group">
                    <button class="btn btn-secondary btn-icon btn-sm" title="View on Map" onclick="viewBinOnMap('${b.id}')"><i class="lucide-map-pin"></i></button>
                    <button class="btn btn-secondary btn-icon btn-sm" title="Edit" onclick="editBin('${b.id}')"><i class="lucide-pencil"></i></button>
                </div>
            </td>
        </tr>`).join("");

    $("#binsPagination").innerHTML = paginationHTML("bins", BINS.length, filtered.length);
    refreshIcons();
}

function viewBinOnMap(binId) {
    const bin = BINS.find(b => b.id === binId);
    if (!bin) return;
    navigateTo("map");
    setTimeout(() => { map.setView([bin.latitude, bin.longitude], 16); }, 400);
}

function editBin(binId) {
    const bin = BINS.find(b => b.id === binId);
    if (!bin) return;
    openModal("Edit Smart Bin", `
        <div class="form-row">
            <div class="form-group"><label>Label</label><input class="form-control" id="editBinLabel" value="${bin.label}"></div>
            <div class="form-group"><label>Zone</label>
                <select class="form-control" id="editBinZone">
                    ${ZONES.map(z => `<option value="${z.id}" ${bin.zone_id === z.id ? "selected" : ""}>${z.name}</option>`).join("")}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Type</label>
                <select class="form-control" id="editBinType">
                    <option value="general" ${bin.bin_type === "general" ? "selected" : ""}>General</option>
                    <option value="recyclable" ${bin.bin_type === "recyclable" ? "selected" : ""}>Recyclable</option>
                    <option value="organic" ${bin.bin_type === "organic" ? "selected" : ""}>Organic</option>
                    <option value="hazardous" ${bin.bin_type === "hazardous" ? "selected" : ""}>Hazardous</option>
                </select>
            </div>
            <div class="form-group"><label>Capacity (L)</label><input type="number" class="form-control" id="editBinCapacity" value="${bin.capacity_liters}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Latitude</label><input type="number" step="0.0001" class="form-control" id="editBinLat" value="${bin.latitude.toFixed(4)}"></div>
            <div class="form-group"><label>Longitude</label><input type="number" step="0.0001" class="form-control" id="editBinLng" value="${bin.longitude.toFixed(4)}"></div>
        </div>
    `, async () => {
        try {
            await apiUpdateBin(bin.id, {
                label:           $("#editBinLabel").value    || bin.label,
                zone_id:         parseInt($("#editBinZone").value),
                bin_type:        $("#editBinType").value,
                capacity_liters: parseInt($("#editBinCapacity").value)    || bin.capacity_liters,
                latitude:        parseFloat($("#editBinLat").value)       || bin.latitude,
                longitude:       parseFloat($("#editBinLng").value)       || bin.longitude,
            });
            BINS = await loadBins();
            showToast(`Bin updated`);
        } catch (err) { showToast(err.message, "error"); }
        updateBinsTable();
        refreshIcons();
    }, "Save Changes");
}


// ── COLLECTION ROUTES ─────────────────────────────────────────────────────────
function renderRoutes() {
    const planned = ROUTES.filter(r => r.status === "planned").length;
    const inProgress = ROUTES.filter(r => r.status === "in_progress").length;
    const completed = ROUTES.filter(r => r.status === "completed").length;

    $("#routesStatsGrid").innerHTML = `
        <div class="stat-card"><div class="stat-card-header"><span class="label">Total Routes</span><div class="icon blue"><i class="lucide-route"></i></div></div><div class="value">${ROUTES.length}</div></div>
        <div class="stat-card"><div class="stat-card-header"><span class="label">Planned</span><div class="icon blue"><i class="lucide-calendar"></i></div></div><div class="value">${planned}</div></div>
        <div class="stat-card"><div class="stat-card-header"><span class="label">In Progress</span><div class="icon orange"><i class="lucide-truck"></i></div></div><div class="value" style="color:var(--warning)">${inProgress}</div></div>
        <div class="stat-card"><div class="stat-card-header"><span class="label">Completed</span><div class="icon green"><i class="lucide-check-circle"></i></div></div><div class="value" style="color:var(--success)">${completed}</div></div>`;

    PAGINATION.routes.page = 1;
    updateRoutesTable();

    $("#routeFilterDate").onchange = () => { PAGINATION.routes.page = 1; updateRoutesTable(); };

    $("#addRouteBtn").onclick = () => {
        openModal("Plan Collection Route", `
            <div class="form-row">
                <div class="form-group"><label>Route Name</label><input class="form-control" id="newRouteName" placeholder="e.g. Kanyama Morning Run"></div>
                <div class="form-group"><label>Zone</label>
                    <select class="form-control" id="newRouteZone">
                        ${ZONES.map(z => `<option value="${z.id}">${z.name}</option>`).join("")}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Vehicle</label>
                    <select class="form-control" id="newRouteVehicle">
                        ${VEHICLES.filter(v => v.status === "available").map(v => `<option value="${v.id}">${v.registration_no} (${categoryLabel(v.vehicle_type)})</option>`).join("")}
                    </select>
                </div>
                <div class="form-group"><label>Driver</label>
                    <select class="form-control" id="newRouteDriver">
                        ${DRIVERS.map(d => `<option value="${d.id}">${d.name}</option>`).join("")}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Scheduled Date</label><input type="date" class="form-control" id="newRouteDate" value="${new Date().toISOString().split("T")[0]}"></div>
                <div class="form-group"><label>Number of Stops</label><input type="number" class="form-control" id="newRouteStops" value="8" min="1"></div>
            </div>
        `, async () => {
            const name = $("#newRouteName").value || `${ZONES.find(z=>z.id==$("#newRouteZone").value)?.name||""} Route`;
            try {
                await apiCreateRoute({
                    name,
                    zone_id:        parseInt($("#newRouteZone").value),
                    vehicle_id:     $("#newRouteVehicle").value,
                    driver_id:      $("#newRouteDriver").value,
                    scheduled_date: $("#newRouteDate").value,
                });
                ROUTES = await loadRoutes();
                showToast(`Route "${name}" planned successfully`);
            } catch (err) { showToast(err.message, "error"); }
            PAGINATION.routes.page = 1;
            updateRoutesTable();
            refreshIcons();
        }, "Plan Route");
    };
}

function updateRoutesTable() {
    const dateFilter = $("#routeFilterDate").value;
    let filtered = [...ROUTES];
    if (dateFilter) filtered = filtered.filter(r => r.scheduled_date === dateFilter);
    filtered.sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date));

    const { items } = paginate(filtered, "routes");

    $("#routesTableBody").innerHTML = items.map(r => `
        <tr>
            <td><strong>${r.name}</strong></td>
            <td>${r.zone_name}</td>
            <td>${r.vehicle_reg}</td>
            <td>${r.driver_name}</td>
            <td>${formatDate(r.scheduled_date)}</td>
            <td>${r.stops_count}</td>
            <td><span class="status-badge ${r.status}">${categoryLabel(r.status)}</span></td>
            <td>
                <div class="action-group">
                    ${r.status === "planned" ? `<button class="btn btn-primary btn-sm" onclick="startRoute('${r.id}')"><i class="lucide-play"></i> Start</button>` : ""}
                    ${r.status === "in_progress" ? `<button class="btn btn-primary btn-sm" onclick="completeRoute('${r.id}')"><i class="lucide-check"></i> Complete</button>` : ""}
                    <button class="btn btn-secondary btn-icon btn-sm" title="Details" onclick="viewRouteDetails('${r.id}')"><i class="lucide-eye"></i></button>
                </div>
            </td>
        </tr>`).join("");

    $("#routesPagination").innerHTML = paginationHTML("routes", ROUTES.length, filtered.length);
    refreshIcons();
}

async function startRoute(routeId) {
    try {
        await apiStartRoute(routeId);
        ROUTES = await loadRoutes();
        showToast("Route started");
    } catch (err) { showToast(err.message, "error"); }
    updateRoutesTable(); refreshIcons();
}

async function completeRoute(routeId) {
    try {
        await apiCompleteRoute(routeId);
        ROUTES = await loadRoutes();
        showToast("Route completed", "success");
    } catch (err) { showToast(err.message, "error"); }
    updateRoutesTable(); refreshIcons();
}

function viewRouteDetails(routeId) {
    const r = ROUTES.find(r => r.id === routeId);
    if (!r) return;
    openModal("Route Details", `
        <div style="display:grid;gap:4px;">
            <div class="zone-stat-row"><span class="label">Route Name</span><strong>${r.name}</strong></div>
            <div class="zone-stat-row"><span class="label">Zone</span><span>${r.zone_name}</span></div>
            <div class="zone-stat-row"><span class="label">Vehicle</span><span>${r.vehicle_reg}</span></div>
            <div class="zone-stat-row"><span class="label">Driver</span><span>${r.driver_name}</span></div>
            <div class="zone-stat-row"><span class="label">Scheduled</span><span>${formatDate(r.scheduled_date)}</span></div>
            <div class="zone-stat-row"><span class="label">Stops</span><span>${r.stops_count}</span></div>
            <div class="zone-stat-row"><span class="label">Status</span><span class="status-badge ${r.status}">${categoryLabel(r.status)}</span></div>
        </div>
    `, () => {}, "Close");
}


// ── FLEET / VEHICLES ──────────────────────────────────────────────────────────
function renderVehicles() {
    const statusMap = { available: "online", on_route: "in-progress", maintenance: "pending", decommissioned: "rejected" };

    $("#vehiclesTableBody").innerHTML = VEHICLES.map(v => `
        <tr>
            <td><strong>${v.registration_no}</strong></td>
            <td>${categoryLabel(v.vehicle_type)}</td>
            <td>${v.capacity_tons}</td>
            <td><span class="status-badge ${statusMap[v.status] || v.status}">${categoryLabel(v.status)}</span></td>
            <td>${v.assigned_driver_name || "—"}</td>
            <td>
                <div class="action-group">
                    <button class="btn btn-secondary btn-icon btn-sm" title="Edit" onclick="editVehicle('${v.id}')"><i class="lucide-pencil"></i></button>
                </div>
            </td>
        </tr>`).join("");

    $("#addVehicleBtn").onclick = () => {
        openModal("Add Vehicle", `
            <div class="form-row">
                <div class="form-group"><label>Registration No.</label><input class="form-control" id="newVehReg" placeholder="e.g. ALU 1234"></div>
                <div class="form-group"><label>Type</label>
                    <select class="form-control" id="newVehType">
                        <option value="compactor">Compactor</option>
                        <option value="tipper">Tipper</option>
                        <option value="skip_loader">Skip Loader</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Capacity (tons)</label><input type="number" class="form-control" id="newVehCapacity" value="8.0" step="0.5"></div>
                <div class="form-group"><label>Status</label>
                    <select class="form-control" id="newVehStatus">
                        <option value="available">Available</option>
                        <option value="maintenance">Maintenance</option>
                    </select>
                </div>
            </div>
            <div class="form-group"><label>Assigned Driver (optional)</label>
                <select class="form-control" id="newVehDriver">
                    <option value="">— Unassigned —</option>
                    ${DRIVERS.map(d => `<option value="${d.id}">${d.name}</option>`).join("")}
                </select>
            </div>
        `, async () => {
            try {
                await apiCreateVehicle({
                    registration_no: $("#newVehReg").value || "ALU 0000",
                    vehicle_type: $("#newVehType").value,
                    capacity_tons: parseFloat($("#newVehCapacity").value) || 8.0,
                    status: $("#newVehStatus").value,
                    assigned_driver: $("#newVehDriver").value || null,
                });
                VEHICLES = await loadVehicles();
                showToast("Vehicle added");
                renderVehicles();
                refreshIcons();
            } catch (err) { showToast(err.message, "error"); }
        }, "Add Vehicle");
    };
}

function editVehicle(vehicleId) {
    const v = VEHICLES.find(v => v.id === vehicleId);
    if (!v) return;
    openModal("Edit Vehicle", `
        <div class="form-row">
            <div class="form-group"><label>Registration No.</label><input class="form-control" id="editVehReg" value="${v.registration_no}"></div>
            <div class="form-group"><label>Type</label>
                <select class="form-control" id="editVehType">
                    <option value="compactor" ${v.vehicle_type === "compactor" ? "selected" : ""}>Compactor</option>
                    <option value="tipper" ${v.vehicle_type === "tipper" ? "selected" : ""}>Tipper</option>
                    <option value="skip_loader" ${v.vehicle_type === "skip_loader" ? "selected" : ""}>Skip Loader</option>
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Capacity (tons)</label><input type="number" class="form-control" id="editVehCapacity" value="${v.capacity_tons}" step="0.5"></div>
            <div class="form-group"><label>Status</label>
                <select class="form-control" id="editVehStatus">
                    <option value="available" ${v.status === "available" ? "selected" : ""}>Available</option>
                    <option value="on_route" ${v.status === "on_route" ? "selected" : ""}>On Route</option>
                    <option value="maintenance" ${v.status === "maintenance" ? "selected" : ""}>Maintenance</option>
                    <option value="decommissioned" ${v.status === "decommissioned" ? "selected" : ""}>Decommissioned</option>
                </select>
            </div>
        </div>
        <div class="form-group"><label>Assigned Driver</label>
            <select class="form-control" id="editVehDriver">
                <option value="">— Unassigned —</option>
                ${DRIVERS.map(d => `<option value="${d.id}" ${v.assigned_driver === d.id ? "selected" : ""}>${d.name}</option>`).join("")}
            </select>
        </div>
    `, async () => {
        try {
            await apiUpdateVehicle(v.id, {
                registration_no: $("#editVehReg").value || v.registration_no,
                vehicle_type: $("#editVehType").value,
                capacity_tons: parseFloat($("#editVehCapacity").value) || v.capacity_tons,
                status: $("#editVehStatus").value,
                assigned_driver: $("#editVehDriver").value || null,
            });
            VEHICLES = await loadVehicles();
            showToast("Vehicle updated");
            renderVehicles();
            refreshIcons();
        } catch (err) { showToast(err.message, "error"); }
    }, "Save Changes");
}


// ── CITIZEN REPORTS ───────────────────────────────────────────────────────────
function renderReports() {
    const pending = REPORTS.filter(r => r.status === "pending").length;
    const inProgress = REPORTS.filter(r => r.status === "in_progress").length;
    const resolved = REPORTS.filter(r => r.status === "resolved").length;

    $("#reportsStatsGrid").innerHTML = `
        <div class="stat-card"><div class="stat-card-header"><span class="label">Total Reports</span><div class="icon blue"><i class="lucide-file-text"></i></div></div><div class="value">${REPORTS.length}</div></div>
        <div class="stat-card"><div class="stat-card-header"><span class="label">Pending</span><div class="icon orange"><i class="lucide-clock"></i></div></div><div class="value" style="color:var(--warning)">${pending}</div></div>
        <div class="stat-card"><div class="stat-card-header"><span class="label">In Progress</span><div class="icon blue"><i class="lucide-loader"></i></div></div><div class="value">${inProgress}</div></div>
        <div class="stat-card"><div class="stat-card-header"><span class="label">Resolved</span><div class="icon green"><i class="lucide-check-circle"></i></div></div><div class="value" style="color:var(--success)">${resolved}</div></div>`;

    PAGINATION.reports.page = 1;
    updateReportsTable();

    $("#reportsFilterStatus").onchange = () => { PAGINATION.reports.page = 1; updateReportsTable(); };
    $("#reportsFilterCategory").onchange = () => { PAGINATION.reports.page = 1; updateReportsTable(); };
}

function updateReportsTable() {
    const statusFilter = $("#reportsFilterStatus").value;
    const catFilter = $("#reportsFilterCategory").value;
    let filtered = [...REPORTS];
    if (statusFilter) filtered = filtered.filter(r => r.status === statusFilter);
    if (catFilter) filtered = filtered.filter(r => r.category === catFilter);
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const { items } = paginate(filtered, "reports");

    $("#reportsTableBody").innerHTML = items.map(r => `
        <tr>
            <td><strong>${r.id}</strong></td>
            <td>${r.reporter_name}</td>
            <td>${categoryLabel(r.category)}</td>
            <td>${r.zone_name}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.description}">${r.description}</td>
            <td><span class="status-badge ${r.status}">${categoryLabel(r.status)}</span></td>
            <td>${formatDate(r.created_at)}</td>
            <td>
                <div class="action-group">
                    ${r.status === "pending" ? `
                        <button class="btn btn-primary btn-sm" onclick="updateReportStatus('${r.id}','acknowledged')"><i class="lucide-check"></i> Ack</button>
                        <button class="btn btn-danger btn-sm" onclick="updateReportStatus('${r.id}','rejected')"><i class="lucide-x"></i></button>
                    ` : ""}
                    ${r.status === "acknowledged" ? `<button class="btn btn-primary btn-sm" onclick="updateReportStatus('${r.id}','in_progress')"><i class="lucide-play"></i> Assign</button>` : ""}
                    ${r.status === "in_progress" ? `<button class="btn btn-primary btn-sm" onclick="updateReportStatus('${r.id}','resolved')"><i class="lucide-check-circle"></i> Resolve</button>` : ""}
                    <button class="btn btn-secondary btn-icon btn-sm" title="View on Map" onclick="viewReportOnMap('${r.id}')"><i class="lucide-map-pin"></i></button>
                </div>
            </td>
        </tr>`).join("");

    $("#reportsPagination").innerHTML = paginationHTML("reports", REPORTS.length, filtered.length);
    refreshIcons();
}

async function updateReportStatus(reportId, newStatus) {
    try {
        await apiUpdateReportStatus(reportId, newStatus);
        REPORTS = await loadReports();
        showToast(`Report → ${categoryLabel(newStatus)}`, "success");
    } catch (err) { showToast(err.message, "error"); }
    PAGINATION.reports.page = 1;
    updateReportsTable();
    refreshIcons();
}

function viewReportOnMap(reportId) {
    const report = REPORTS.find(r => r.id === reportId);
    if (!report) return;
    navigateTo("map");
    setTimeout(() => {
        if (map) {
            map.setView([report.latitude, report.longitude], 16);
            const marker = L.marker([report.latitude, report.longitude]).addTo(map);
            marker.bindPopup(`
                <div style="font-family:Inter,sans-serif;min-width:180px;">
                    <strong>${report.id}</strong><br>
                    <span style="color:#666;font-size:11px;">${report.reporter_name} · ${report.zone_name}</span>
                    <hr style="border:none;border-top:1px solid #eee;margin:6px 0;">
                    <div style="font-size:12px;">${report.description}</div>
                </div>`).openPopup();
            mapMarkers.push(marker);
        }
    }, 400);
}


// ── REWARDS ───────────────────────────────────────────────────────────────────
function renderRewards() {
    const totalPointsCirc = TOP_EARNERS.reduce((s, e) => s + e.points, 0);
    const totalRedemptions = Math.floor(totalPointsCirc * 0.35);

    $("#rewardsStatsGrid").innerHTML = `
        <div class="stat-card"><div class="stat-card-header"><span class="label">Catalog Items</span><div class="icon green"><i class="lucide-gift"></i></div></div><div class="value">${REWARD_CATALOG.filter(r => r.is_active).length}</div></div>
        <div class="stat-card"><div class="stat-card-header"><span class="label">Points in Circulation</span><div class="icon blue"><i class="lucide-star"></i></div></div><div class="value">${totalPointsCirc.toLocaleString()}</div></div>
        <div class="stat-card"><div class="stat-card-header"><span class="label">Points Redeemed</span><div class="icon orange"><i class="lucide-arrow-right-left"></i></div></div><div class="value">${totalRedemptions.toLocaleString()}</div></div>
        <div class="stat-card"><div class="stat-card-header"><span class="label">Active Participants</span><div class="icon green"><i class="lucide-users"></i></div></div><div class="value">${USERS.filter(u => u.role === "resident").length}</div></div>`;

    $("#rewardCatalogBody").innerHTML = REWARD_CATALOG.map(r => `
        <tr>
            <td>
                <strong>${r.title}</strong>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">${r.description}</div>
            </td>
            <td><strong>${r.points_cost}</strong> pts</td>
            <td>${r.stock !== null ? r.stock : "∞"}</td>
            <td><span class="status-badge ${r.is_active ? "online" : "offline"}">${r.is_active ? "Active" : "Inactive"}</span></td>
            <td><button class="btn btn-secondary btn-icon btn-sm" title="Edit"><i class="lucide-pencil"></i></button></td>
        </tr>`).join("");

    $("#topEarnersBody").innerHTML = TOP_EARNERS.map(e => `
        <tr>
            <td><strong style="color:${e.rank <= 3 ? "var(--warning)" : "var(--text-primary)"}">#${e.rank}</strong></td>
            <td>${e.name}</td>
            <td><strong>${e.points.toLocaleString()}</strong></td>
            <td>${e.compound}</td>
        </tr>`).join("");
}


// ── ANALYTICS ─────────────────────────────────────────────────────────────────
function renderAnalytics() {
    const trend = ANALYTICS?.trend || { labels: [], actual: [], predicted: [] };

    if (charts.forecast) charts.forecast.destroy();
    charts.forecast = new Chart($("#forecastChart"), {
        type: "line",
        data: {
            labels: trend.labels,
            datasets: [
                { label: "Actual Activity (reports)", data: trend.actual, borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.1)", fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, spanGaps: false },
                { label: "Projected", data: trend.predicted, borderColor: "#f59e0b", borderDash: [6, 4], backgroundColor: "rgba(245,158,11,0.1)", fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, spanGaps: false },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: "#94a3b8", font: { family: "Inter" } } }, tooltip: { mode: "index", intersect: false } },
            scales: {
                x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#64748b", font: { size: 10 }, maxTicksLimit: 14 } },
                y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#64748b", font: { size: 10 } } },
            },
        },
    });

    if (charts.zoneComparison) charts.zoneComparison.destroy();
    charts.zoneComparison = new Chart($("#zoneComparisonChart"), {
        type: "radar",
        data: {
            labels: ZONES.map(z => z.name),
            datasets: [
                { label: "Avg Fill %", data: ZONES.map(z => z.avg_fill_pct), borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.15)", borderWidth: 2, pointBackgroundColor: "#10b981" },
                { label: "Reports (scaled)", data: ZONES.map(z => z.report_count * 3), borderColor: "#6366f1", backgroundColor: "rgba(99,102,241,0.15)", borderWidth: 2, pointBackgroundColor: "#6366f1" },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: "#94a3b8", font: { family: "Inter" } } } },
            scales: { r: { angleLines: { color: "rgba(255,255,255,0.06)" }, grid: { color: "rgba(255,255,255,0.06)" }, pointLabels: { color: "#94a3b8", font: { size: 10 } }, ticks: { display: false } } },
        },
    });

    const models = ANALYTICS?.ml_models?.length ? ANALYTICS.ml_models : ML_MODELS;
    $("#mlModelsBody").innerHTML = models.map(m => `
        <tr>
            <td><strong>${m.model_name}</strong></td>
            <td><span style="font-family:var(--font-mono)">${m.version}</span></td>
            <td><strong style="color:${m.accuracy >= 0.9 ? "var(--success)" : "var(--warning)"}">${(m.accuracy * 100).toFixed(2)}%</strong></td>
            <td>${formatDate(m.trained_at)}</td>
            <td><span class="status-badge ${m.is_active ? "online" : "offline"}">${m.is_active ? "Active" : "Archived"}</span></td>
        </tr>`).join("");
}


// ── ALERTS ────────────────────────────────────────────────────────────────────
function renderAlerts() {
    updateAlertsList();
    $("#alertsFilterSeverity").onchange = updateAlertsList;
    $("#markAllReadBtn").onclick = async () => {
        try {
            await apiMarkAllAlertsRead();
            ALERTS = await loadAlerts();
            showToast("All alerts marked as read");
        } catch (err) { showToast(err.message, "error"); }
        updateAlertsList();
        updateNotifBadge();
    };
}

function updateAlertsList() {
    const severityFilter = $("#alertsFilterSeverity").value;
    let filtered = ALERTS.filter(a => !a.resolved);
    if (severityFilter) filtered = filtered.filter(a => a.severity === severityFilter);

    if (filtered.length === 0) {
        $("#alertsListContainer").innerHTML = `<div class="empty-state"><i class="lucide-check-circle"></i><h4>All Clear</h4><p>No alerts matching your filter</p></div>`;
        return;
    }

    $("#alertsListContainer").innerHTML = filtered.map(a => `
        <div class="alert-item" style="opacity:${a.is_read ? "0.6" : "1"};">
            <div class="alert-icon ${a.severity}">
                <i class="lucide-${a.severity === "critical" ? "alert-triangle" : a.severity === "warning" ? "alert-circle" : "info"}"></i>
            </div>
            <div class="alert-content">
                <div class="message">${a.message}</div>
                <div class="meta">
                    <span class="status-badge ${a.severity}" style="font-size:0.65rem;padding:2px 6px;">${a.severity.toUpperCase()}</span>
                    <span>${categoryLabel(a.alert_type)}</span>
                    <span>${timeAgo(a.created_at)}</span>
                </div>
            </div>
            <div class="action-group">
                <button class="btn btn-secondary btn-sm" onclick="resolveAlert('${a.id}')"><i class="lucide-check"></i> Resolve</button>
            </div>
        </div>`).join("");

    refreshIcons();
}

async function resolveAlert(alertId) {
    try {
        await apiResolveAlert(alertId);
        ALERTS = await loadAlerts();
        showToast("Alert resolved");
    } catch (err) { showToast(err.message, "error"); }
    updateAlertsList();
    updateNotifBadge();
}


// ── ZONES ─────────────────────────────────────────────────────────────────────
function renderZones() {
    $("#zonesGrid").innerHTML = ZONES.map(z => {
        const binsFull = BINS.filter(b => b.zone_id === z.id && b.fill_percentage >= 85).length;
        const binsTotal = BINS.filter(b => b.zone_id === z.id).length;
        const zoneReports = REPORTS.filter(r => r.zone_id === z.id).length;

        return `
        <div class="zone-card">
            <div class="zone-card-header">
                <h4>${z.name}</h4>
                <div style="display:flex;align-items:center;gap:6px;">
                    <span class="pop"><i class="lucide-users" style="font-size:0.65rem;"></i> ${z.population_est?.toLocaleString()}</span>
                    <button class="btn btn-secondary btn-icon btn-sm" title="Edit Zone" onclick="editZone(${z.id})"><i class="lucide-pencil"></i></button>
                </div>
            </div>
            <div class="zone-stat-row"><span class="label">Smart Bins</span><span class="val">${binsTotal}</span></div>
            <div class="zone-stat-row"><span class="label">Bins at ≥ 85%</span><span class="val" style="color:${binsFull > 0 ? "var(--danger)" : "var(--success)"}">${binsFull}</span></div>
            <div class="zone-stat-row"><span class="label">Avg Fill Level</span><span class="val">${z.avg_fill_pct}%</span></div>
            <div class="zone-stat-row"><span class="label">Active Reports</span><span class="val">${zoneReports}</span></div>
            <div style="margin-top:12px;">${fillBarHTML(Math.round(z.avg_fill_pct))}</div>
            <div style="margin-top:12px;display:flex;gap:6px;">
                <button class="btn btn-secondary btn-sm" onclick="viewZoneBins(${z.id})"><i class="lucide-trash-2"></i> View Bins</button>
                <button class="btn btn-secondary btn-sm" onclick="navigateTo('map')"><i class="lucide-map-pin"></i> Map</button>
            </div>
        </div>`;
    }).join("");

    refreshIcons();

    $("#addZoneBtn").onclick = () => {
        openModal("Add Zone", `
            <div class="form-group"><label>Zone Name</label><input class="form-control" id="newZoneName" placeholder="e.g. Chelston"></div>
            <div class="form-group"><label>Population Estimate</label><input type="number" class="form-control" id="newZonePop" placeholder="e.g. 35000"></div>
            <div class="form-group"><label>Description (optional)</label><input class="form-control" id="newZoneDesc" placeholder="Brief description"></div>
        `, async () => {
            const name = $("#newZoneName").value.trim();
            if (!name) { showToast("Zone name is required", "error"); return; }
            try {
                await apiCreateZone({
                    name,
                    population_est: parseInt($("#newZonePop").value) || null,
                    description:    $("#newZoneDesc").value.trim() || null,
                });
                BINS    = await loadBins();
                REPORTS = await loadReports();
                ZONES   = await loadZones();
                showToast(`Zone "${name}" created`);
                renderZones();
                refreshIcons();
            } catch (err) { showToast(err.message, "error"); }
        }, "Create Zone");
    };
}

function editZone(zoneId) {
    const z = ZONES.find(z => z.id === zoneId);
    if (!z) return;
    openModal("Edit Zone", `
        <div class="form-group"><label>Zone Name</label><input class="form-control" id="editZoneName" value="${z.name}"></div>
        <div class="form-group"><label>Population Estimate</label><input type="number" class="form-control" id="editZonePop" value="${z.population_est}"></div>
    `, async () => {
        try {
            await apiUpdateZone(z.id, {
                name: $("#editZoneName").value || z.name,
                population_est: parseInt($("#editZonePop").value) || z.population_est,
            });
            BINS = await loadBins();
            REPORTS = await loadReports();
            ZONES = await loadZones();
            showToast("Zone updated");
            renderZones();
            refreshIcons();
        } catch (err) { showToast(err.message, "error"); }
    }, "Save Zone");
}

function viewZoneBins(zoneId) {
    PAGINATION.bins.page = 1;
    navigateTo("bins");
    setTimeout(() => {
        $("#binsFilterZone").value = zoneId;
        updateBinsTable();
        refreshIcons();
    }, 100);
}


// ── USERS ─────────────────────────────────────────────────────────────────────
function renderUsers() {
    PAGINATION.users.page = 1;
    updateUsersTable();
    $("#usersFilterRole").onchange = () => { PAGINATION.users.page = 1; updateUsersTable(); };
}

function updateUsersTable() {
    const roleFilter = $("#usersFilterRole").value;
    let filtered = [...USERS];
    if (roleFilter) filtered = filtered.filter(u => u.role === roleFilter);
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const { items } = paginate(filtered, "users");

    $("#usersTableBody").innerHTML = items.map(u => `
        <tr>
            <td><strong>${u.first_name} ${u.last_name}</strong></td>
            <td>${u.email}</td>
            <td>${u.phone}</td>
            <td><span class="status-badge ${u.role === "admin" ? "full" : u.role === "collector" ? "medium" : "low"}">${categoryLabel(u.role)}</span></td>
            <td>${u.compound}</td>
            <td>${formatDate(u.created_at)}</td>
            <td><span class="status-badge ${u.is_active ? "online" : "offline"}">${u.is_active ? "Active" : "Inactive"}</span></td>
            <td>
                <div class="action-group">
                    <button class="btn btn-secondary btn-icon btn-sm" title="Edit" onclick="editUser('${u.id}')"><i class="lucide-pencil"></i></button>
                    <button class="btn ${u.is_active ? "btn-danger" : "btn-secondary"} btn-icon btn-sm" title="${u.is_active ? "Deactivate" : "Activate"}" onclick="toggleUserActive('${u.id}')"><i class="lucide-${u.is_active ? "user-x" : "user-check"}"></i></button>
                </div>
            </td>
        </tr>`).join("");

    $("#usersPagination").innerHTML = paginationHTML("users", USERS.length, filtered.length);
    refreshIcons();
}

function editUser(userId) {
    const u = USERS.find(u => u.id === userId);
    if (!u) return;
    openModal("Edit User", `
        <div class="form-row">
            <div class="form-group"><label>First Name</label><input class="form-control" id="editUserFirst" value="${u.first_name}"></div>
            <div class="form-group"><label>Last Name</label><input class="form-control" id="editUserLast" value="${u.last_name}"></div>
        </div>
        <div class="form-group"><label>Email</label><input class="form-control" id="editUserEmail" value="${u.email}"></div>
        <div class="form-group"><label>Phone</label><input class="form-control" id="editUserPhone" value="${u.phone}"></div>
        <div class="form-row">
            <div class="form-group"><label>Role</label>
                <select class="form-control" id="editUserRole">
                    <option value="resident" ${u.role === "resident" ? "selected" : ""}>Resident</option>
                    <option value="collector" ${u.role === "collector" ? "selected" : ""}>Collector</option>
                    <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
                </select>
            </div>
            <div class="form-group"><label>Compound</label>
                <select class="form-control" id="editUserCompound">
                    ${ZONES.map(z => `<option value="${z.name}" ${u.compound === z.name ? "selected" : ""}>${z.name}</option>`).join("")}
                </select>
            </div>
        </div>
    `, async () => {
        try {
            await apiUpdateUser(u.id, {
                first_name: $("#editUserFirst").value || u.first_name,
                last_name:  $("#editUserLast").value  || u.last_name,
                email:      $("#editUserEmail").value || u.email,
                phone:      $("#editUserPhone").value || u.phone,
                role:       $("#editUserRole").value,
                compound:   $("#editUserCompound").value,
            });
            USERS = await loadUsers();
            showToast("User updated");
            updateUsersTable();
            refreshIcons();
        } catch (err) { showToast(err.message, "error"); }
    }, "Save Changes");
}

async function toggleUserActive(userId) {
    const u = USERS.find(u => u.id === userId);
    if (!u) return;
    try {
        await apiUpdateUser(u.id, { is_active: !u.is_active });
        USERS = await loadUsers();
        const updated = USERS.find(x => x.id === userId);
        showToast(`${updated?.first_name} ${updated?.last_name} ${updated?.is_active ? "activated" : "deactivated"}`, updated?.is_active ? "success" : "warning");
    } catch (err) { showToast(err.message, "error"); }
    updateUsersTable();
    refreshIcons();
}


// ── SETTINGS ──────────────────────────────────────────────────────────────────
function renderSettings() {
    const saved = localStorage.getItem("swm_settings");
    if (saved) {
        try {
            const s = JSON.parse(saved);
            if (s.alertThreshold)    $("#settingsAlertThreshold").value    = s.alertThreshold;
            if (s.overflowThreshold) $("#settingsOverflowThreshold").value = s.overflowThreshold;
            if (s.pointsPerReport)   $("#settingsPointsPerReport").value   = s.pointsPerReport;
            if (s.refreshInterval)   $("#settingsRefreshInterval").value   = s.refreshInterval;
        } catch (_) {}
    }
    const lastSync = $("#lastSyncTime");
    if (lastSync) lastSync.textContent = new Date().toLocaleTimeString("en-ZM", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function saveSettings() {
    const settings = {
        alertThreshold:    $("#settingsAlertThreshold").value,
        overflowThreshold: $("#settingsOverflowThreshold").value,
        pointsPerReport:   $("#settingsPointsPerReport").value,
        refreshInterval:   $("#settingsRefreshInterval").value,
    };
    localStorage.setItem("swm_settings", JSON.stringify(settings));
    showToast("Settings saved successfully");
    resetAutoRefresh();
}

function resetAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    const interval = parseInt($("#settingsRefreshInterval").value) || 30;
    autoRefreshTimer = setInterval(() => {
        if (!getToken()) return;
        renderPage(currentPage);
        refreshIcons();
        const lastSync = $("#lastSyncTime");
        if (lastSync) lastSync.textContent = new Date().toLocaleTimeString("en-ZM", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }, interval * 1000);
}

$("#saveSettingsBtn").addEventListener("click", saveSettings);


// ── Initial Render ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
    checkAuth();
    renderSettings();
    resetAutoRefresh();
    refreshIcons();

    if (getToken()) {
        await loadAllData();
        registerFcmToken();
    }

    renderDashboard();
    updateNotifBadge();
});
