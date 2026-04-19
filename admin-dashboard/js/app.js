/* ============================================================================
   SMART WASTE MANAGEMENT — ADMIN DASHBOARD APPLICATION
   Main controller: navigation, rendering, charts, map, interactions
   ============================================================================ */

// ── State ────────────────────────────────────────────────────────────────────
let currentPage = "dashboard";
let map = null;
let mapMarkers = [];
let charts = {};

// ── Helpers ──────────────────────────────────────────────────────────────────
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

// Refresh Lucide icons (converts class="lucide-*" to data-lucide and renders SVGs)
function refreshIcons() {
    document.querySelectorAll('[class*="lucide-"]').forEach(el => {
        const cls = [...el.classList].find(c => c.startsWith('lucide-'));
        if (cls && !el.getAttribute('data-lucide')) {
            el.setAttribute('data-lucide', cls.replace('lucide-', ''));
        }
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-ZM", { year: "numeric", month: "short", day: "numeric" });
}

function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function fillColor(pct) {
    if (pct >= 85) return "red";
    if (pct >= 65) return "orange";
    if (pct >= 40) return "yellow";
    return "green";
}

function fillBarHTML(pct) {
    const color = fillColor(pct);
    return `
        <div class="fill-bar-container">
            <div class="fill-bar">
                <div class="fill-bar-inner ${color}" style="width:${pct}%"></div>
            </div>
            <span class="fill-bar-label">${pct}%</span>
        </div>`;
}

function categoryLabel(cat) {
    return (cat || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}


// ── Toast Notifications ──────────────────────────────────────────────────────
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


// ── Modal ────────────────────────────────────────────────────────────────────
function openModal(title, bodyHTML, onConfirm, confirmText = "Confirm") {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = bodyHTML;
    $("#modalConfirmBtn").textContent = confirmText;
    $("#modalConfirmBtn").onclick = () => { onConfirm(); closeModal(); };
    $("#modalOverlay").classList.add("active");
}

function closeModal() {
    $("#modalOverlay").classList.remove("active");
}

$("#modalClose").addEventListener("click", closeModal);
$("#modalCancelBtn").addEventListener("click", closeModal);
$("#modalOverlay").addEventListener("click", e => { if (e.target === $("#modalOverlay")) closeModal(); });


// ── Navigation ───────────────────────────────────────────────────────────────
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

    // Update sidebar active
    $$(".nav-item").forEach(item => item.classList.remove("active"));
    const navEl = $(`#nav-${page}`) || $(`.nav-item[data-page="${page}"]`);
    if (navEl) navEl.classList.add("active");

    // Update header
    const [title, subtitle] = PAGE_TITLES[page] || [page, ""];
    $("#pageTitle").textContent = title;
    $("#pageSubtitle").textContent = subtitle;

    // Toggle pages
    $$(".page-section").forEach(s => s.classList.remove("active"));
    const pageEl = $(`#page-${page}`);
    if (pageEl) pageEl.classList.add("active");

    // Render page content
    renderPage(page);
    refreshIcons();
}

$$(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
        const page = item.dataset.page;
        if (page) navigateTo(page);
    });
});


// ── Sidebar Toggle ───────────────────────────────────────────────────────────
$("#sidebarToggle").addEventListener("click", () => {
    const sidebar = $("#sidebar");
    const main = $("#mainContent");
    sidebar.classList.toggle("collapsed");
    main.classList.toggle("sidebar-collapsed");
    const icon = $("#toggleIcon");
    icon.className = sidebar.classList.contains("collapsed") ? "lucide-chevrons-right" : "lucide-chevrons-left";
});


// ── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
    const now = new Date();
    $("#headerTime").textContent = now.toLocaleTimeString("en-ZM", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    $("#headerDate").textContent = now.toLocaleDateString("en-ZM", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
setInterval(updateClock, 1000);
updateClock();


// ── Refresh Button ───────────────────────────────────────────────────────────
$("#headerRefreshBtn").addEventListener("click", () => {
    renderPage(currentPage);
    refreshIcons();
    showToast("Data refreshed successfully");
});


// ══════════════════════════════════════════════════════════════════════════════
// PAGE RENDERERS
// ══════════════════════════════════════════════════════════════════════════════

function renderPage(page) {
    switch (page) {
        case "dashboard": renderDashboard(); break;
        case "map": renderMap(); break;
        case "bins": renderBins(); break;
        case "routes": renderRoutes(); break;
        case "vehicles": renderVehicles(); break;
        case "reports": renderReports(); break;
        case "rewards": renderRewards(); break;
        case "analytics": renderAnalytics(); break;
        case "alerts": renderAlerts(); break;
        case "zones": renderZones(); break;
        case "users": renderUsers(); break;
        case "settings": break;
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
        </div>
    `;

    // Collection Trends Chart
    renderCollectionTrendsChart(7);

    // Fill Distribution Doughnut
    renderFillDistributionChart();

    // Recent Alerts
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

    // Zone Performance Chart
    renderZonePerformanceChart();

    // Tab switcher for trends
    $$(".tab-bar .tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            $$(".tab-bar .tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const range = btn.dataset.range;
            const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
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
                {
                    label: "Collected (tonnes)",
                    data: data.collected,
                    borderColor: "#10b981",
                    backgroundColor: "rgba(16,185,129,0.1)",
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: days <= 7 ? 4 : 0,
                    pointHoverRadius: 6,
                },
                {
                    label: "Generated (tonnes)",
                    data: data.generated,
                    borderColor: "#6366f1",
                    backgroundColor: "rgba(99,102,241,0.1)",
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: days <= 7 ? 4 : 0,
                    pointHoverRadius: 6,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: "#94a3b8", font: { family: "Inter" } } }
            },
            scales: {
                x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#64748b", font: { size: 10 } } },
                y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#64748b", font: { size: 10 } } }
            }
        }
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
            datasets: [{
                data: [counts.empty, counts.low, counts.medium, counts.high, counts.full, counts.overflow],
                backgroundColor: ["#10b981", "#34d399", "#3b82f6", "#f59e0b", "#ef4444", "#dc2626"],
                borderColor: "#111827",
                borderWidth: 3,
                hoverOffset: 8,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "65%",
            plugins: {
                legend: { position: "bottom", labels: { color: "#94a3b8", padding: 16, font: { family: "Inter", size: 11 } } }
            }
        }
    });
}

function renderZonePerformanceChart() {
    if (charts.zonePerformance) charts.zonePerformance.destroy();
    charts.zonePerformance = new Chart($("#zonePerformanceChart"), {
        type: "bar",
        data: {
            labels: ZONES.map(z => z.name),
            datasets: [{
                label: "Avg Fill %",
                data: ZONES.map(z => z.avg_fill_pct),
                backgroundColor: ZONES.map(z => z.avg_fill_pct >= 75 ? "rgba(239,68,68,0.7)" : z.avg_fill_pct >= 50 ? "rgba(245,158,11,0.7)" : "rgba(16,185,129,0.7)"),
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: "#64748b", font: { size: 10 }, maxRotation: 45 } },
                y: { max: 100, grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#64748b", font: { size: 10 }, callback: v => v + "%" } }
            }
        }
    });
}


// ── LIVE MAP ─────────────────────────────────────────────────────────────────
function renderMap() {
    if (!map) {
        map = L.map("mapContainer").setView([-15.415, 28.30], 13);
        if (navigator.onLine) {
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "&copy; OpenStreetMap contributors"
            }).addTo(map);
        } else {
            // Offline: add a placeholder or message
            const offlineLayer = L.layerGroup().addTo(map);
            L.marker([-15.415, 28.30]).addTo(offlineLayer).bindPopup("Map unavailable offline");
        }

        // Invalidate size after page transition
        setTimeout(() => map.invalidateSize(), 300);
    } else {
        setTimeout(() => map.invalidateSize(), 300);
    }

    // Populate zone filter
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

    // Filters
    $("#mapFilterZone").onchange = updateMapMarkers;
    $("#mapFilterStatus").onchange = updateMapMarkers;
}

function updateMapMarkers() {
    // Clear existing
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];

    const zoneFilter = $("#mapFilterZone").value;
    const statusFilter = $("#mapFilterStatus").value;

    let filtered = BINS;
    if (zoneFilter) filtered = filtered.filter(b => b.zone_id == zoneFilter);
    if (statusFilter) filtered = filtered.filter(b => b.status === statusFilter);

    filtered.forEach(bin => {
        const color = bin.fill_percentage >= 85 ? "#ef4444" :
            bin.fill_percentage >= 65 ? "#f59e0b" :
                bin.fill_percentage >= 40 ? "#3b82f6" : "#10b981";

        const icon = L.divIcon({
            className: "",
            html: `<div style="
                width:28px;height:28px;border-radius:50%;
                background:${color};border:3px solid rgba(255,255,255,0.8);
                display:flex;align-items:center;justify-content:center;
                font-size:9px;font-weight:700;color:#fff;
                box-shadow:0 2px 8px rgba(0,0,0,0.4);
            ">${bin.fill_percentage}%</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
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
            </div>
        `);
        mapMarkers.push(marker);
    });
}


// ── SMART BINS ───────────────────────────────────────────────────────────────
function renderBins() {
    // Stats
    const total = BINS.length;
    const full = BINS.filter(b => b.fill_percentage >= 85).length;
    const avgFill = Math.round(BINS.reduce((s, b) => s + b.fill_percentage, 0) / total);
    const overflow = BINS.filter(b => b.status === "overflow").length;

    $("#binsStatsGrid").innerHTML = `
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">Total Bins</span><div class="icon green"><i class="lucide-trash-2"></i></div></div>
            <div class="value">${total}</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">Bins ≥ 85%</span><div class="icon red"><i class="lucide-alert-triangle"></i></div></div>
            <div class="value" style="color:var(--danger)">${full}</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">Average Fill</span><div class="icon blue"><i class="lucide-bar-chart-3"></i></div></div>
            <div class="value">${avgFill}%</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">Overflowing</span><div class="icon red"><i class="lucide-droplets"></i></div></div>
            <div class="value" style="color:var(--danger)">${overflow}</div>
        </div>`;

    // Populate zone filter
    const zoneSelect = $("#binsFilterZone");
    if (zoneSelect.options.length <= 1) {
        ZONES.forEach(z => {
            const opt = document.createElement("option");
            opt.value = z.id;
            opt.textContent = z.name;
            zoneSelect.appendChild(opt);
        });
    }

    updateBinsTable();

    $("#binsFilterZone").onchange = updateBinsTable;
    $("#binsFilterStatus").onchange = updateBinsTable;

    // Add Bin button
    $("#addBinBtn").onclick = () => {
        openModal("Add Smart Bin", `
            <div class="form-row">
                <div class="form-group"><label>Label</label><input class="form-control" id="newBinLabel" placeholder="BIN-MTD-001"></div>
                <div class="form-group"><label>Zone</label>
                    <select class="form-control" id="newBinZone">
                        ${ZONES.map(z => `<option value="${z.id}">${z.name}</option>`).join("")}
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
        `, () => {
            showToast(`Bin "${$("#newBinLabel").value || "New Bin"}" created successfully`);
            renderBins();
        }, "Create Bin");
    };
}

function updateBinsTable() {
    const zoneFilter = $("#binsFilterZone").value;
    const statusFilter = $("#binsFilterStatus").value;

    let filtered = BINS;
    if (zoneFilter) filtered = filtered.filter(b => b.zone_id == zoneFilter);
    if (statusFilter) filtered = filtered.filter(b => b.status === statusFilter);

    // Sort: highest fill first
    filtered.sort((a, b) => b.fill_percentage - a.fill_percentage);

    $("#binsTableBody").innerHTML = filtered.map(b => `
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
                    <button class="btn btn-secondary btn-icon btn-sm" title="Edit" onclick="showToast('Edit bin ${b.label}','warning')"><i class="lucide-pencil"></i></button>
                </div>
            </td>
        </tr>`).join("");
}

function viewBinOnMap(binId) {
    const bin = BINS.find(b => b.id === binId);
    if (!bin) return;
    navigateTo("map");
    setTimeout(() => {
        map.setView([bin.latitude, bin.longitude], 16);
    }, 400);
}


// ── COLLECTION ROUTES ────────────────────────────────────────────────────────
function renderRoutes() {
    const planned = ROUTES.filter(r => r.status === "planned").length;
    const inProgress = ROUTES.filter(r => r.status === "in_progress").length;
    const completed = ROUTES.filter(r => r.status === "completed").length;

    $("#routesStatsGrid").innerHTML = `
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">Total Routes</span><div class="icon blue"><i class="lucide-route"></i></div></div>
            <div class="value">${ROUTES.length}</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">Planned</span><div class="icon blue"><i class="lucide-calendar"></i></div></div>
            <div class="value">${planned}</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">In Progress</span><div class="icon orange"><i class="lucide-truck"></i></div></div>
            <div class="value" style="color:var(--warning)">${inProgress}</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">Completed</span><div class="icon green"><i class="lucide-check-circle"></i></div></div>
            <div class="value" style="color:var(--success)">${completed}</div>
        </div>`;

    let sorted = [...ROUTES].sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date));

    $("#routesTableBody").innerHTML = sorted.map(r => `
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
                    ${r.status === "planned" ? `<button class="btn btn-primary btn-sm" onclick="showToast('Route started','success')"><i class="lucide-play"></i> Start</button>` : ""}
                    ${r.status === "in_progress" ? `<button class="btn btn-primary btn-sm" onclick="showToast('Route completed','success')"><i class="lucide-check"></i> Complete</button>` : ""}
                    <button class="btn btn-secondary btn-icon btn-sm" title="Details"><i class="lucide-eye"></i></button>
                </div>
            </td>
        </tr>`).join("");
}


// ── FLEET / VEHICLES ─────────────────────────────────────────────────────────
function renderVehicles() {
    const statusMap = {
        available: "online",
        on_route: "in-progress",
        maintenance: "pending",
        decommissioned: "rejected",
    };

    $("#vehiclesTableBody").innerHTML = VEHICLES.map(v => `
        <tr>
            <td><strong>${v.registration_no}</strong></td>
            <td>${categoryLabel(v.vehicle_type)}</td>
            <td>${v.capacity_tons}</td>
            <td><span class="status-badge ${statusMap[v.status] || v.status}">${categoryLabel(v.status)}</span></td>
            <td>${v.assigned_driver || "—"}</td>
            <td>
                <div class="action-group">
                    <button class="btn btn-secondary btn-icon btn-sm" title="Edit"><i class="lucide-pencil"></i></button>
                </div>
            </td>
        </tr>`).join("");
}


// ── CITIZEN REPORTS ──────────────────────────────────────────────────────────
function renderReports() {
    const pending = REPORTS.filter(r => r.status === "pending").length;
    const inProgress = REPORTS.filter(r => r.status === "in_progress").length;
    const resolved = REPORTS.filter(r => r.status === "resolved").length;
    const total = REPORTS.length;

    $("#reportsStatsGrid").innerHTML = `
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">Total Reports</span><div class="icon blue"><i class="lucide-file-text"></i></div></div>
            <div class="value">${total}</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">Pending</span><div class="icon orange"><i class="lucide-clock"></i></div></div>
            <div class="value" style="color:var(--warning)">${pending}</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">In Progress</span><div class="icon blue"><i class="lucide-loader"></i></div></div>
            <div class="value">${inProgress}</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">Resolved</span><div class="icon green"><i class="lucide-check-circle"></i></div></div>
            <div class="value" style="color:var(--success)">${resolved}</div>
        </div>`;

    updateReportsTable();

    $("#reportsFilterStatus").onchange = updateReportsTable;
    $("#reportsFilterCategory").onchange = updateReportsTable;
}

function updateReportsTable() {
    const statusFilter = $("#reportsFilterStatus").value;
    const catFilter = $("#reportsFilterCategory").value;

    let filtered = REPORTS;
    if (statusFilter) filtered = filtered.filter(r => r.status === statusFilter);
    if (catFilter) filtered = filtered.filter(r => r.category === catFilter);

    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    $("#reportsTableBody").innerHTML = filtered.map(r => `
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
                    <button class="btn btn-secondary btn-icon btn-sm" title="View on Map"><i class="lucide-map-pin"></i></button>
                </div>
            </td>
        </tr>`).join("");
}

function updateReportStatus(reportId, newStatus) {
    const report = REPORTS.find(r => r.id === reportId);
    if (report) {
        report.status = newStatus;
        showToast(`Report ${reportId} updated to "${categoryLabel(newStatus)}"`, "success");
        renderReports();
        refreshIcons();
    }
}


// ── REWARDS ──────────────────────────────────────────────────────────────────
function renderRewards() {
    const totalPointsCirc = TOP_EARNERS.reduce((s, e) => s + e.points, 0);
    const totalRedemptions = Math.floor(totalPointsCirc * 0.35);

    $("#rewardsStatsGrid").innerHTML = `
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">Catalog Items</span><div class="icon green"><i class="lucide-gift"></i></div></div>
            <div class="value">${REWARD_CATALOG.filter(r => r.is_active).length}</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">Points in Circulation</span><div class="icon blue"><i class="lucide-coins"></i></div></div>
            <div class="value">${totalPointsCirc.toLocaleString()}</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">Points Redeemed</span><div class="icon orange"><i class="lucide-arrow-right-left"></i></div></div>
            <div class="value">${totalRedemptions.toLocaleString()}</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-header"><span class="label">Active Participants</span><div class="icon green"><i class="lucide-users"></i></div></div>
            <div class="value">${USERS.filter(u => u.role === "resident").length}</div>
        </div>`;

    // Catalog table
    $("#rewardCatalogBody").innerHTML = REWARD_CATALOG.map(r => `
        <tr>
            <td>
                <strong>${r.title}</strong>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">${r.description}</div>
            </td>
            <td><strong>${r.points_cost}</strong> pts</td>
            <td>${r.stock !== null ? r.stock : "∞"}</td>
            <td><span class="status-badge ${r.is_active ? 'online' : 'offline'}">${r.is_active ? "Active" : "Inactive"}</span></td>
            <td><button class="btn btn-secondary btn-icon btn-sm" title="Edit"><i class="lucide-pencil"></i></button></td>
        </tr>`).join("");

    // Top earners
    $("#topEarnersBody").innerHTML = TOP_EARNERS.map(e => `
        <tr>
            <td><strong style="color:${e.rank <= 3 ? 'var(--warning)' : 'var(--text-primary)'}">#${e.rank}</strong></td>
            <td>${e.name}</td>
            <td><strong>${e.points.toLocaleString()}</strong></td>
            <td>${e.compound}</td>
        </tr>`).join("");
}


// ── ANALYTICS ────────────────────────────────────────────────────────────────
function renderAnalytics() {
    // Forecast chart
    const forecastData = generateForecastData();
    if (charts.forecast) charts.forecast.destroy();
    charts.forecast = new Chart($("#forecastChart"), {
        type: "line",
        data: {
            labels: forecastData.labels,
            datasets: [
                {
                    label: "Actual Volume (tonnes)",
                    data: forecastData.actual,
                    borderColor: "#10b981",
                    backgroundColor: "rgba(16,185,129,0.1)",
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0,
                    spanGaps: false,
                },
                {
                    label: "ML Predicted (tonnes)",
                    data: forecastData.predicted,
                    borderColor: "#f59e0b",
                    borderDash: [6, 4],
                    backgroundColor: "rgba(245,158,11,0.1)",
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0,
                    spanGaps: false,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: "#94a3b8", font: { family: "Inter" } } },
                tooltip: { mode: "index", intersect: false }
            },
            scales: {
                x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#64748b", font: { size: 10 }, maxTicksLimit: 14 } },
                y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#64748b", font: { size: 10 } } }
            }
        }
    });

    // Zone comparison radar
    if (charts.zoneComparison) charts.zoneComparison.destroy();
    charts.zoneComparison = new Chart($("#zoneComparisonChart"), {
        type: "radar",
        data: {
            labels: ZONES.map(z => z.name),
            datasets: [
                {
                    label: "Avg Fill %",
                    data: ZONES.map(z => z.avg_fill_pct),
                    borderColor: "#10b981",
                    backgroundColor: "rgba(16,185,129,0.15)",
                    borderWidth: 2,
                    pointBackgroundColor: "#10b981",
                },
                {
                    label: "Reports (scaled)",
                    data: ZONES.map(z => z.report_count * 3),
                    borderColor: "#6366f1",
                    backgroundColor: "rgba(99,102,241,0.15)",
                    borderWidth: 2,
                    pointBackgroundColor: "#6366f1",
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: "#94a3b8", font: { family: "Inter" } } } },
            scales: {
                r: {
                    angleLines: { color: "rgba(255,255,255,0.06)" },
                    grid: { color: "rgba(255,255,255,0.06)" },
                    pointLabels: { color: "#94a3b8", font: { size: 10 } },
                    ticks: { display: false }
                }
            }
        }
    });

    // ML models table
    $("#mlModelsBody").innerHTML = ML_MODELS.map(m => `
        <tr>
            <td><strong>${m.model_name}</strong></td>
            <td><span style="font-family:var(--font-mono)">${m.version}</span></td>
            <td><strong style="color:${m.accuracy >= 0.9 ? 'var(--success)' : 'var(--warning)'}">${(m.accuracy * 100).toFixed(2)}%</strong></td>
            <td>${formatDate(m.trained_at)}</td>
            <td><span class="status-badge ${m.is_active ? 'online' : 'offline'}">${m.is_active ? "Active" : "Archived"}</span></td>
        </tr>`).join("");
}


// ── ALERTS ───────────────────────────────────────────────────────────────────
function renderAlerts() {
    updateAlertsList();
    $("#alertsFilterSeverity").onchange = updateAlertsList;
    $("#markAllReadBtn").onclick = () => {
        ALERTS.forEach(a => a.is_read = true);
        showToast("All alerts marked as read");
        updateAlertsList();
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
        <div class="alert-item" style="opacity:${a.is_read ? '0.6' : '1'};">
            <div class="alert-icon ${a.severity}">
                <i class="lucide-${a.severity === 'critical' ? 'alert-triangle' : a.severity === 'warning' ? 'alert-circle' : 'info'}"></i>
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
}

function resolveAlert(alertId) {
    const alert = ALERTS.find(a => a.id === alertId);
    if (alert) {
        alert.resolved = true;
        alert.is_read = true;
        showToast("Alert resolved");
        updateAlertsList();
    }
}


// ── ZONES ────────────────────────────────────────────────────────────────────
function renderZones() {
    $("#zonesGrid").innerHTML = ZONES.map(z => {
        const binsFull = BINS.filter(b => b.zone_id === z.id && b.fill_percentage >= 85).length;
        const binsTotal = BINS.filter(b => b.zone_id === z.id).length;
        const zoneReports = REPORTS.filter(r => r.zone_id === z.id).length;

        return `
        <div class="zone-card">
            <div class="zone-card-header">
                <h4>${z.name}</h4>
                <span class="pop"><i class="lucide-users" style="font-size:0.65rem;"></i> ${z.population_est?.toLocaleString()}</span>
            </div>
            <div class="zone-stat-row">
                <span class="label">Smart Bins</span>
                <span class="val">${binsTotal}</span>
            </div>
            <div class="zone-stat-row">
                <span class="label">Bins at ≥ 85%</span>
                <span class="val" style="color:${binsFull > 0 ? 'var(--danger)' : 'var(--success)'}">${binsFull}</span>
            </div>
            <div class="zone-stat-row">
                <span class="label">Avg Fill Level</span>
                <span class="val">${z.avg_fill_pct}%</span>
            </div>
            <div class="zone-stat-row">
                <span class="label">Active Reports</span>
                <span class="val">${zoneReports}</span>
            </div>
            <div style="margin-top:12px;">
                ${fillBarHTML(Math.round(z.avg_fill_pct))}
            </div>
        </div>`;
    }).join("");
}


// ── USERS ────────────────────────────────────────────────────────────────────
function renderUsers() {
    updateUsersTable();
    $("#usersFilterRole").onchange = updateUsersTable;
}

function updateUsersTable() {
    const roleFilter = $("#usersFilterRole").value;
    let filtered = USERS;
    if (roleFilter) filtered = filtered.filter(u => u.role === roleFilter);

    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    $("#usersTableBody").innerHTML = filtered.map(u => `
        <tr>
            <td><strong>${u.first_name} ${u.last_name}</strong></td>
            <td>${u.email}</td>
            <td>${u.phone}</td>
            <td><span class="status-badge ${u.role === 'admin' ? 'full' : u.role === 'collector' ? 'medium' : 'low'}">${categoryLabel(u.role)}</span></td>
            <td>${u.compound}</td>
            <td>${formatDate(u.created_at)}</td>
            <td><span class="status-badge ${u.is_active ? 'online' : 'offline'}">${u.is_active ? "Active" : "Inactive"}</span></td>
        </tr>`).join("");
}


// ── Settings Save ────────────────────────────────────────────────────────────
if ($("#saveSettingsBtn")) {
    $("#saveSettingsBtn").addEventListener("click", () => {
        showToast("Settings saved successfully");
    });
}


// ── Initial Render ───────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    renderDashboard();
    refreshIcons();

    // Update sidebar badges
    const unresolvedAlerts = ALERTS.filter(a => !a.resolved).length;
    const pendingReports = REPORTS.filter(r => r.status === "pending").length;
    const binsEl = $("#badge-bins");
    if (binsEl) binsEl.textContent = BINS.filter(b => b.fill_percentage >= 85).length;
    const reportsEl = $("#badge-reports");
    if (reportsEl) reportsEl.textContent = pendingReports;
    const alertsEl = $("#badge-alerts");
    if (alertsEl) alertsEl.textContent = unresolvedAlerts;
    const headerBadge = $("#headerNotifBadge");
    if (headerBadge) headerBadge.textContent = unresolvedAlerts;
});
