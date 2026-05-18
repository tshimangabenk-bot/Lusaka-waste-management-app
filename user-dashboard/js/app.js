/* ============================================================================
   SMARTWASTE RESIDENT PORTAL — App controller
   Navigation, rendering, interactions
   ============================================================================ */

// ── State ─────────────────────────────────────────────────────────────────────
let dashData      = null;
let currentPage   = 'overview';
let binsMap       = null;
let binsMapInited = false;
let activeFilter  = 'all';

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();

    setupNav();
    setupModals();
    setupSidebarToggle();

    await loadDashboard();
});

// ── Navigation ────────────────────────────────────────────────────────────────
function setupNav() {
    document.querySelectorAll('[data-page]').forEach(el => {
        el.addEventListener('click', () => navigateTo(el.dataset.page));
    });
}

function navigateTo(page) {
    if (page === currentPage) return;

    // Update nav items
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });

    // Update pages
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(`page-${page}`);
    if (target) target.classList.add('active');

    // Update header title
    const titles = {
        overview:      'Overview',
        reports:       'My Reports',
        rewards:       'Rewards',
        bins:          'Nearby Bins',
        notifications: 'Notifications',
        schedule:      'Pickup Schedule',
        tracking:      'Live Truck Tracking',
    };
    document.getElementById('topbar-title').textContent = titles[page] || page;

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');

    currentPage = page;

    // Lazy load page data
    if (page === 'reports')       loadReports(activeFilter);
    if (page === 'rewards')       loadRewards();
    if (page === 'bins')          initBinsPage();
    if (page === 'notifications') loadNotifications();
    if (page === 'schedule')      loadSchedulePage();
    if (page === 'tracking')      loadTrackingPage();

    lucide.createIcons();
}

// ── Sidebar toggle ────────────────────────────────────────────────────────────
function setupSidebarToggle() {
    const btn     = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const main    = document.getElementById('mainContent');

    btn.addEventListener('click', () => {
        // On mobile (<768px) — slide in/out
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('open');
        } else {
            // On desktop — collapse/expand
            sidebar.classList.toggle('collapsed');
            main.classList.toggle('sidebar-collapsed');
        }
        lucide.createIcons();
    });

    // Close mobile sidebar when clicking outside
    document.addEventListener('click', e => {
        if (window.innerWidth <= 768 &&
            !sidebar.contains(e.target) &&
            !btn.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });
}

// ── Dashboard load ────────────────────────────────────────────────────────────
async function loadDashboard() {
    try {
        dashData = await apiGetDashboard();
        renderSidebar();
        renderOverview();
        registerFcmToken();
    } catch {
        // Backend is offline — silently fall back to demo data
        dashData = getDemoData();
        renderSidebar();
        renderOverview();
        showDemoBanner();
    }
}

async function registerFcmToken() {
    if (!('Notification' in window) || !getToken()) return;
    if (Notification.permission === 'denied') return;
    if (typeof firebase === 'undefined' || !firebase.apps?.length) return;

    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Register the service worker for background messages
        let swReg;
        if ('serviceWorker' in navigator) {
            swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        }

        const messaging = firebase.messaging();
        const fcmToken  = await messaging.getToken({
            vapidKey:        window.FIREBASE_VAPID_KEY || '',
            serviceWorkerRegistration: swReg,
        });

        if (fcmToken) {
            await apiFetch('/users/me/fcm-token', {
                method: 'PUT',
                body: JSON.stringify({ fcm_token: fcmToken }),
            });
        }

        // Handle foreground messages (app is open)
        messaging.onMessage(payload => {
            const { title, body } = payload.notification || {};
            showToast(`${title}: ${body}`, 'success');
        });
    } catch { /* FCM not configured or user denied — skip silently */ }
}

function showDemoBanner() {
    const banner = document.createElement('div');
    banner.id = 'demo-banner';
    banner.innerHTML = `
        <i data-lucide="wifi-off"></i>
        <span>Demo mode — backend offline. Showing sample data.</span>
        <button onclick="this.parentElement.remove()" title="Dismiss" style="margin-left:auto;background:none;border:none;cursor:pointer;color:inherit;font-size:1rem;">✕</button>
    `;
    banner.style.cssText = `
        position:fixed;top:0;left:0;right:0;z-index:9999;
        display:flex;align-items:center;gap:10px;
        padding:10px 20px;
        background:rgba(245,158,11,0.15);
        border-bottom:1px solid rgba(245,158,11,0.35);
        color:#f59e0b;font-size:0.82rem;font-weight:600;
        font-family:inherit;
    `;
    document.body.prepend(banner);
    lucide.createIcons();
}

function getDemoData() {
    return {
        user: { first_name: 'Chanda', last_name: 'Mwale', email: 'chanda@example.com', compound: 'Kabulonga', is_verified: true },
        rewards: { total_points: 340, lifetime_points: 780 },
        report_stats: { total: 8, pending: 2, resolved: 5 },
        recent_reports: [
            { id: '1', category: 'overflowing_bin', description: 'Bin near Manda Hill overflowing for 3 days.', status: 'resolved', created_at: new Date(Date.now()-86400000*2).toISOString(), address: 'Manda Hill Rd' },
            { id: '2', category: 'illegal_dumping',  description: 'Large pile of debris dumped near drainage channel.', status: 'in_progress', created_at: new Date(Date.now()-86400000*5).toISOString(), address: 'Northmead' },
            { id: '3', category: 'missed_collection',description: 'Collection truck missed our street this week.', status: 'pending', created_at: new Date(Date.now()-86400000).toISOString(), address: 'Ibex Hill' },
        ],
        recent_transactions: [
            { id: 't1', description: 'Points earned for submitting report: overflowing_bin', points: 10, created_at: new Date(Date.now()-86400000*2).toISOString() },
            { id: 't2', description: 'Points earned for submitting report: illegal_dumping',  points: 10, created_at: new Date(Date.now()-86400000*5).toISOString() },
            { id: 't3', description: 'Redeemed: Lusaka Bus Pass',                             points: -80, created_at: new Date(Date.now()-86400000*10).toISOString() },
            { id: 't4', description: 'Points earned for submitting report: missed_collection', points: 10, created_at: new Date(Date.now()-86400000).toISOString() },
        ],
        notifications: [
            { id: 'n1', title: 'Report resolved', body: 'Your report at Manda Hill has been resolved. Thank you!', is_read: false, created_at: new Date(Date.now()-3600000).toISOString() },
            { id: 'n2', title: 'Collection schedule update', body: 'Collection in Kabulonga will occur on Thursday this week due to public holiday.', is_read: true, created_at: new Date(Date.now()-86400000).toISOString() },
        ],
    };
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar() {
    const u = dashData.user;
    const initials = `${u.first_name[0]}${u.last_name[0]}`.toUpperCase();

    document.getElementById('sidebar-avatar').textContent      = initials;
    document.getElementById('sidebar-user-name').textContent   = `${u.first_name} ${u.last_name}`;
    document.getElementById('sidebar-user-compound').textContent = u.compound || 'Lusaka';
    document.getElementById('points-value').textContent        = dashData.rewards.total_points.toLocaleString();

    if (u.is_verified) {
        document.getElementById('verified-dot').style.display = 'flex';
    }

    // Notification badge
    const unread = dashData.notifications.filter(n => !n.is_read).length;
    const badge  = document.getElementById('badge-notifs');
    if (unread > 0) { badge.textContent = unread; badge.style.display = 'inline-flex'; }

    const pendingCount = dashData.report_stats.pending;
    const rBadge = document.getElementById('badge-reports');
    if (pendingCount > 0) { rBadge.textContent = pendingCount; rBadge.style.display = 'inline-flex'; }

    lucide.createIcons();
}

// ── Overview page ─────────────────────────────────────────────────────────────
function renderOverview() {
    const u  = dashData.user;
    const r  = dashData.rewards;
    const rs = dashData.report_stats;

    // Hero
    document.getElementById('hero-greeting').textContent = greeting();
    document.getElementById('hero-name').textContent     = u.first_name;
    document.getElementById('hero-points').textContent   = r.total_points.toLocaleString();

    // Stats
    document.getElementById('stat-total').textContent    = rs.total;
    document.getElementById('stat-pending').textContent  = rs.pending;
    document.getElementById('stat-resolved').textContent = rs.resolved;
    document.getElementById('stat-lifetime').textContent = r.lifetime_points.toLocaleString();

    // Recent reports
    const rEl = document.getElementById('overview-reports');
    if (!dashData.recent_reports.length) {
        rEl.innerHTML = '<p style="color:var(--text-muted);font-size:.83rem">No reports yet. Submit your first!</p>';
    } else {
        rEl.innerHTML = dashData.recent_reports.map(r => `
            <div class="report-item">
                <div class="report-category-dot" style="background:${statusColor(r.status)}"></div>
                <div class="report-item-body">
                    <div class="report-item-cat">${formatCategory(r.category)}</div>
                    <div class="report-item-desc">${escHtml(r.description)}</div>
                </div>
                <div class="report-item-meta">
                    <span class="badge badge-${r.status}">${r.status.replace('_', ' ')}</span>
                    <span class="report-date">${timeAgo(r.created_at)}</span>
                </div>
            </div>
        `).join('');
    }

    // Transactions
    const tEl = document.getElementById('overview-transactions');
    if (!dashData.recent_transactions.length) {
        tEl.innerHTML = '<p style="color:var(--text-muted);font-size:.83rem">No activity yet.</p>';
    } else {
        tEl.innerHTML = dashData.recent_transactions.map(t => `
            <div class="transaction-item">
                <span class="tx-desc">${escHtml(t.description)}</span>
                <span class="tx-date">${timeAgo(t.created_at)}</span>
                <span class="tx-points ${t.points > 0 ? 'earned' : 'spent'}">${t.points > 0 ? '+' : ''}${t.points}</span>
            </div>
        `).join('');
    }

    lucide.createIcons();
}

// ── Reports page ──────────────────────────────────────────────────────────────
async function loadReports(filter = 'all') {
    const grid = document.getElementById('reports-grid');
    grid.innerHTML = `<div class="loading-state"><i class="lucide-loader-2"></i><span>Loading reports…</span></div>`;
    lucide.createIcons();

    try {
        // Use cached data if available to reduce API calls
        const reports = dashData?.recent_reports && filter === 'all'
            ? dashData.recent_reports
            : await apiGetReports(filter);

        if (!reports.length) {
            grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="lucide-clipboard-list"></i><p>No ${filter !== 'all' ? filter.replace('_',' ') : ''} reports found.</p></div>`;
        } else {
            grid.innerHTML = reports
                .filter(r => filter === 'all' || r.status === filter)
                .map(r => `
                    <div class="report-card status-${r.status}">
                        <div class="report-card-header">
                            <span class="report-card-cat">${formatCategory(r.category)}</span>
                            <span class="badge badge-${r.status}">${r.status.replace('_', ' ')}</span>
                        </div>
                        <p class="report-card-desc">${escHtml(r.description)}</p>
                        <div class="report-card-footer">
                            <div class="report-card-addr">
                                <i class="lucide-map-pin" style="font-size:.75rem;flex-shrink:0"></i>
                                ${escHtml(r.address || 'Location not specified')}
                            </div>
                            <span>${formatDate(r.created_at)}</span>
                        </div>
                    </div>
                `).join('');
        }
    } catch (err) {
        grid.innerHTML = `<div class="error-state" style="grid-column:1/-1"><i class="lucide-alert-circle"></i><span>Failed to load reports: ${err.message}</span></div>`;
    }
    lucide.createIcons();
}

// Filter tabs
document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter;
        loadReports(activeFilter);
    });
});

// ── Rewards page ──────────────────────────────────────────────────────────────
async function loadRewards() {
    // Balance
    try {
        const bal = await apiGetBalance();
        document.getElementById('balance-points').textContent   = bal.total_points?.toLocaleString() ?? dashData.rewards.total_points;
        document.getElementById('balance-lifetime').textContent = `${(bal.lifetime_points ?? dashData.rewards.lifetime_points).toLocaleString()} pts`;
    } catch {
        document.getElementById('balance-points').textContent   = dashData.rewards.total_points.toLocaleString();
        document.getElementById('balance-lifetime').textContent = `${dashData.rewards.lifetime_points.toLocaleString()} pts`;
    }

    // Catalog
    const catalogEl = document.getElementById('catalog-grid');
    try {
        const items = await apiGetCatalog();
        renderCatalog(items, catalogEl);
    } catch {
        // Demo catalog
        renderCatalog([
            { id: 1, title: 'Lusaka Bus Pass (1 week)', description: 'A one-week unlimited ride pass on Lusaka city buses.', points_cost: 80,  stock: 12, image_url: null },
            { id: 2, title: 'Reusable Bag Set',         description: 'Set of 3 durable, eco-friendly shopping bags.', points_cost: 40,  stock: 30, image_url: null },
            { id: 3, title: 'LCC Recycling Bin',         description: 'A personal 20L colour-coded recycling bin.', points_cost: 120, stock: 5,  image_url: null },
            { id: 4, title: 'Community Garden Voucher',  description: 'One session at the Lusaka Community Garden.',  points_cost: 60,  stock: null, image_url: null },
        ], catalogEl);
    }

    // History
    const histEl = document.getElementById('rewards-history');
    try {
        const txns = await apiGetHistory();
        renderTransactionHistory(txns, histEl);
    } catch {
        renderTransactionHistory(dashData.recent_transactions, histEl);
    }

    lucide.createIcons();
}

function renderCatalog(items, el) {
    const pts = dashData?.rewards?.total_points ?? 0;
    const icons = ['🎫', '👜', '🗑️', '🌱', '🎁', '🌿', '💡', '🏪'];
    el.innerHTML = items.map((item, i) => {
        const canAfford = pts >= item.points_cost;
        const outOfStock = item.stock === 0;
        return `
            <div class="catalog-card">
                <div class="catalog-img">${icons[i % icons.length]}</div>
                <div class="catalog-title">${escHtml(item.title)}</div>
                <div class="catalog-desc">${escHtml(item.description || '')}</div>
                <div class="catalog-footer">
                    <div>
                        <div class="catalog-cost"><i class="lucide-leaf"></i>${item.points_cost} pts</div>
                        ${item.stock != null ? `<div class="catalog-stock">${item.stock} left</div>` : ''}
                    </div>
                    <button class="redeem-btn" data-id="${item.id}" ${(!canAfford || outOfStock) ? 'disabled' : ''}>
                        ${outOfStock ? 'Out of stock' : (!canAfford ? 'Need more pts' : 'Redeem')}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    el.querySelectorAll('.redeem-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => handleRedeem(parseInt(btn.dataset.id)));
    });
}

function renderTransactionHistory(txns, el) {
    if (!txns.length) {
        el.innerHTML = '<div class="empty-state"><i class="lucide-receipt"></i><p>No transactions yet.</p></div>';
        return;
    }
    el.innerHTML = txns.map(t => `
        <div class="transaction-item">
            <span class="tx-desc">${escHtml(t.description)}</span>
            <span class="tx-date">${timeAgo(t.created_at)}</span>
            <span class="tx-points ${t.points > 0 ? 'earned' : 'spent'}">${t.points > 0 ? '+' : ''}${t.points} pts</span>
        </div>
    `).join('');
}

async function handleRedeem(itemId) {
    try {
        const res = await apiRedeem(itemId);
        showToast(`Redeemed! ${res.remaining_points} pts remaining.`, 'success');
        if (dashData) dashData.rewards.total_points = res.remaining_points;
        document.getElementById('sidebar-points').querySelector('#points-value').textContent = res.remaining_points.toLocaleString();
        loadRewards();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ── Bins page ─────────────────────────────────────────────────────────────────
function initBinsPage() {
    if (!binsMapInited) {
        binsMap = L.map('bins-map').setView([-15.4167, 28.2833], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
        }).addTo(binsMap);
        binsMapInited = true;
    }

    document.getElementById('locate-btn').addEventListener('click', getUserLocation);
}

function getUserLocation() {
    if (!navigator.geolocation) {
        showToast('Geolocation not supported by your browser.', 'error');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        pos => loadNearbyBins(pos.coords.latitude, pos.coords.longitude),
        ()  => showToast('Could not get your location. Please allow access.', 'error')
    );
}

async function loadNearbyBins(lat, lng) {
    binsMap.setView([lat, lng], 15);
    L.marker([lat, lng], {
        icon: L.divIcon({ className: '', html: '<div style="width:14px;height:14px;border-radius:50%;background:#3d7a3a;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>', iconAnchor:[7,7] })
    }).addTo(binsMap).bindPopup('<strong>You are here</strong>');

    try {
        const bins = await apiGetNearbyBins(lat, lng);
        renderBinsList(bins);
        bins.forEach(bin => {
            const fill = parseFloat(bin.fill_percentage) || 0;
            const col  = fill >= 85 ? '#c0392b' : fill >= 65 ? '#ea580c' : fill >= 40 ? '#d97706' : '#3d7a3a';
            const marker = L.circleMarker([bin.latitude, bin.longitude], {
                radius: 9, color: col, fillColor: col, fillOpacity: 0.85, weight: 2
            }).addTo(binsMap);
            marker.bindPopup(`
                <strong>${escHtml(bin.label)}</strong><br>
                Fill: <b>${fill}%</b> · Type: ${bin.bin_type}<br>
                <small>${escHtml(bin.address || '')}</small>
            `);
        });
    } catch {
        // Demo bins around Lusaka centre
        const demoBins = [
            { label: 'Bin KAB-01', latitude: lat+0.003, longitude: lng+0.004, fill_percentage: 72, bin_type: 'general', address: 'Kabulonga Rd' },
            { label: 'Bin MAN-03', latitude: lat-0.002, longitude: lng+0.006, fill_percentage: 15, bin_type: 'recycling', address: 'Near Manda Hill' },
            { label: 'Bin CBD-07', latitude: lat+0.001, longitude: lng-0.003, fill_percentage: 91, bin_type: 'general', address: 'Cairo Rd' },
        ];
        renderBinsList(demoBins);
        demoBins.forEach(bin => {
            const fill = parseFloat(bin.fill_percentage);
            const col  = fill >= 85 ? '#c0392b' : fill >= 65 ? '#ea580c' : fill >= 40 ? '#d97706' : '#3d7a3a';
            L.circleMarker([bin.latitude, bin.longitude], {
                radius: 9, color: col, fillColor: col, fillOpacity: 0.85, weight: 2
            }).addTo(binsMap).bindPopup(`<strong>${bin.label}</strong><br>Fill: <b>${bin.fill_percentage}%</b><br><small>${bin.address}</small>`);
        });
    }
}

function renderBinsList(bins) {
    const el = document.getElementById('bins-list');
    if (!bins.length) {
        el.innerHTML = '<div class="empty-state"><i class="lucide-map-pin-off"></i><p>No bins found within 1 km.</p></div>';
        lucide.createIcons();
        return;
    }
    el.innerHTML = bins.map(bin => {
        const fill = parseFloat(bin.fill_percentage) || 0;
        const cls  = fill >= 85 ? 'red' : fill >= 65 ? 'orange' : fill >= 40 ? 'yellow' : 'green';
        return `
            <div class="bin-item" data-lat="${bin.latitude}" data-lng="${bin.longitude}">
                <div class="bin-fill ${cls}">${Math.round(fill)}%</div>
                <div>
                    <div class="bin-label">${escHtml(bin.label)}</div>
                    <div class="bin-addr">${escHtml(bin.address || bin.bin_type)}</div>
                </div>
            </div>
        `;
    }).join('');
    el.querySelectorAll('.bin-item').forEach(item => {
        item.addEventListener('click', () => {
            binsMap.flyTo([item.dataset.lat, item.dataset.lng], 17, { duration: 1 });
        });
    });
    lucide.createIcons();
}

// ── Notifications page ────────────────────────────────────────────────────────
async function loadNotifications() {
    const el = document.getElementById('notifications-list');
    el.innerHTML = '<div class="loading-state"><i class="lucide-loader-2"></i><span>Loading…</span></div>';
    lucide.createIcons();

    let notifs = [];
    try {
        notifs = await apiGetNotifications();
        // Keep dashData in sync for badge count
        if (dashData) dashData.notifications = notifs;
    } catch {
        notifs = dashData?.notifications || [];
    }

    if (!notifs.length) {
        el.innerHTML = '<div class="empty-state"><i class="lucide-bell-off"></i><p>No notifications yet.</p></div>';
    } else {
        el.innerHTML = notifs.map(n => `
            <div class="notif-item ${n.is_read ? '' : 'unread'}">
                <div class="notif-dot ${n.is_read ? 'read' : ''}"></div>
                <div class="notif-body">
                    <div class="notif-title">${escHtml(n.title)}</div>
                    <div class="notif-text">${escHtml(n.body)}</div>
                    <div class="notif-time">${timeAgo(n.created_at)}</div>
                </div>
            </div>
        `).join('');
    }
    lucide.createIcons();
}

document.getElementById('mark-all-read-btn').addEventListener('click', async () => {
    try {
        await apiFetch('/users/me/notifications/mark-all-read', { method: 'PATCH' });
    } catch { /* best-effort */ }
    if (dashData) dashData.notifications.forEach(n => n.is_read = true);
    document.getElementById('badge-notifs').style.display = 'none';
    loadNotifications();
    showToast('All notifications marked as read.', 'success');
});

// ── Report modal ──────────────────────────────────────────────────────────────
function setupModals() {
    const modal      = document.getElementById('report-modal');
    const openBtns   = [document.getElementById('new-report-btn'), document.getElementById('submit-report-btn')];
    const closeBtns  = [document.getElementById('close-report-modal'), document.getElementById('cancel-report-modal')];

    openBtns.forEach(b => b?.addEventListener('click', () => {
        modal.classList.add('open');
        modal.removeAttribute('aria-hidden');
    }));
    closeBtns.forEach(b => b?.addEventListener('click', () => {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }));
    modal.addEventListener('click', e => {
        if (e.target === modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
    });

    document.getElementById('autofill-location').addEventListener('click', () => {
        if (!navigator.geolocation) { showToast('Geolocation not supported.', 'error'); return; }
        navigator.geolocation.getCurrentPosition(pos => {
            document.getElementById('report-lat').value = pos.coords.latitude.toFixed(6);
            document.getElementById('report-lng').value = pos.coords.longitude.toFixed(6);
            showToast('Location filled in!', 'success');
        }, () => showToast('Could not get location.', 'error'));
    });

    document.getElementById('submit-report-form').addEventListener('click', handleSubmitReport);
}

async function handleSubmitReport() {
    const category    = document.getElementById('report-category').value;
    const description = document.getElementById('report-description').value.trim();
    const address     = document.getElementById('report-address').value.trim();
    const lat         = parseFloat(document.getElementById('report-lat').value);
    const lng         = parseFloat(document.getElementById('report-lng').value);

    if (!category)    { showToast('Please select a category.', 'error'); return; }
    if (!description) { showToast('Please add a description.', 'error'); return; }
    if (isNaN(lat) || isNaN(lng)) { showToast('Please enter a valid location.', 'error'); return; }

    const btn = document.getElementById('submit-report-form');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    try {
        await apiCreateReport({ category, description, address, latitude: lat, longitude: lng });
        showToast('Report submitted! +10 green points earned 🌿', 'success');
        document.getElementById('report-modal').classList.remove('open');

        // Update local state
        if (dashData) {
            dashData.report_stats.total++;
            dashData.report_stats.pending++;
            dashData.rewards.total_points += 10;
            dashData.rewards.lifetime_points += 10;
        }

        // Reset form
        ['report-category','report-description','report-address','report-lat','report-lng']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

        if (currentPage === 'overview') renderOverview();
        if (currentPage === 'reports')  loadReports(activeFilter);

    } catch (err) {
        showToast(err.message || 'Failed to submit report.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="lucide-send"></i> Submit report';
        lucide.createIcons();
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning,';
    if (h < 17) return 'Good afternoon,';
    return 'Good evening,';
}

function timeAgo(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return Math.floor(hrs / 24) + 'd ago';
}

function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-ZM', { year:'numeric', month:'short', day:'numeric' });
}

function formatCategory(cat) {
    return (cat || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function statusColor(status) {
    return { pending: '#c9820a', in_progress: '#2563eb', resolved: '#3d7a3a', rejected: '#c0392b' }[status] || '#9a9e94';
}

function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className   = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Logout ────────────────────────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('Sign out of SmartWaste?')) apiLogout();
});


/* ============================================================================
   PICKUP SCHEDULE PAGE
   ============================================================================ */

const schedState = {
    schedule:   null,   // { zone_id, zone_name, schedules[], upcoming[] }
    requests:   [],     // user's custom pickup requests
    weekOffset: 0,      // 0 = current week, -1 = last week, +1 = next week
};

// ── Boot ──────────────────────────────────────────────────────────────────────
async function loadSchedulePage() {
    try {
        [schedState.schedule, schedState.requests] = await Promise.all([
            apiGetZoneSchedule(),
            apiGetMyRequests(),
        ]);
    } catch {
        // Demo data when backend is offline
        schedState.schedule = getDemoSchedule();
        schedState.requests  = getDemoRequests();
    }
    schedState.weekOffset = 0;
    renderScheduleZoneCard();
    renderWeekCalendar();
    renderUpcomingList();
    renderMyRequestsList();
}

// ── Zone banner ───────────────────────────────────────────────────────────────
function renderScheduleZoneCard() {
    const s = schedState.schedule;
    if (!s) return;

    document.getElementById('sched-zone-name').textContent = s.zone_name || '—';

    const dayNames = s.schedules.map(sc => sc.day_name);
    document.getElementById('sched-zone-days').textContent =
        dayNames.length
            ? `Collects every: ${dayNames.join(', ')}`
            : 'No regular collection schedule set for your zone.';

    const next = (s.upcoming || []).find(u => u.days_away >= 0);
    const nextEl = document.getElementById('sched-next-text');
    if (next) {
        nextEl.textContent = next.days_away === 0
            ? `Today — ${next.time_label}`
            : next.days_away === 1
                ? `Tomorrow — ${next.time_label}`
                : `${next.day_name} (in ${next.days_away}d) — ${next.time_label}`;
    } else {
        nextEl.textContent = 'No upcoming collection';
    }
}

// ── Weekly calendar ───────────────────────────────────────────────────────────
function renderWeekCalendar() {
    const s    = schedState.schedule || {};
    const reqs = schedState.requests || [];

    // Build sets for fast lookup
    const collectionDays = new Set((s.schedules || []).map(sc => sc.day_of_week));
    const reqDates = new Set(
        reqs.filter(r => r.status !== 'cancelled').map(r => r.requested_date)
    );

    // Compute the Monday of current week + offset
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay(); // 0=Sun
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + schedState.weekOffset * 7);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    // Update week label
    const fmt = d => d.toLocaleDateString('en-ZM', { day: 'numeric', month: 'short' });
    document.getElementById('cal-week-label').textContent = `${fmt(monday)} – ${fmt(sunday)}`;

    const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const TIME_SHORT = { morning: 'AM', afternoon: 'PM', evening: 'Eve' };
    const s_map = {};
    (s.schedules || []).forEach(sc => { s_map[sc.day_of_week] = sc; });

    let html = '';
    for (let i = 0; i < 7; i++) {
        const d   = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dow = i;          // 0=Mon in our grid
        const iso = d.toISOString().split('T')[0];

        const isToday = d.getTime() === today.getTime();
        const isPast  = d < today;
        const hasColl = collectionDays.has(dow);
        const hasReq  = reqDates.has(iso);
        const isFuture = !isPast && !isToday;

        let classes = 'week-day-cell';
        if (isPast)  classes += ' cal-past';
        if (isToday) classes += ' cal-today';
        if (hasColl) classes += ' cal-collection';
        if (hasReq)  classes += ' cal-has-request';
        if (isFuture) classes += ' clickable';

        const sc = s_map[dow];
        const icons = hasColl
            ? `<div class="wdc-truck">🚛</div><div class="wdc-slot">${sc ? TIME_SHORT[sc.time_slot] || sc.time_slot : ''}</div>`
            : '';
        const reqIcon = hasReq ? `<div class="wdc-req">⭐</div><div class="wdc-req-label">Requested</div>` : '';

        html += `
            <div class="${classes}" ${isFuture ? `onclick="openPickupModalForDate('${iso}')"` : ''}>
                <div class="wdc-name">${DAY_ABBR[i]}</div>
                <div class="wdc-date">${d.getDate()}</div>
                <div class="wdc-icons">${icons}${reqIcon}</div>
            </div>`;
    }
    document.getElementById('week-grid').innerHTML = html;
}

function openPickupModalForDate(iso) {
    document.getElementById('pickup-date').value = iso;
    openPickupModal();
}

// ── Upcoming collections list ─────────────────────────────────────────────────
function renderUpcomingList() {
    const upcoming = (schedState.schedule || {}).upcoming || [];
    const el = document.getElementById('upcoming-list');
    if (!upcoming.length) {
        el.innerHTML = '<div class="empty-state"><i class="lucide-calendar-x"></i><p>No collections scheduled in the next 14 days.</p></div>';
        lucide.createIcons();
        return;
    }
    el.innerHTML = upcoming.slice(0, 7).map(u => {
        const isSoon = u.days_away <= 1;
        let label = u.days_away === 0 ? 'Today'
                  : u.days_away === 1 ? 'Tomorrow'
                  : `In ${u.days_away} days`;
        return `
            <div class="upcoming-item">
                <div class="upcoming-icon ${isSoon ? 'soon' : ''}">🚛</div>
                <div class="upcoming-body">
                    <div class="upcoming-date">${u.day_name}, ${formatDate(u.date)}</div>
                    <div class="upcoming-meta">${u.time_label || u.time_slot} · ${u.frequency}</div>
                </div>
                <span class="upcoming-badge ${isSoon ? 'soon' : ''}">${label}</span>
            </div>`;
    }).join('');
    lucide.createIcons();
}

// ── My requests list ──────────────────────────────────────────────────────────
function renderMyRequestsList() {
    const reqs = schedState.requests || [];
    const badge = document.getElementById('sched-requests-badge');
    badge.textContent = reqs.length ? `${reqs.length} total` : '';

    const el = document.getElementById('my-requests-list');
    if (!reqs.length) {
        el.innerHTML = '<div class="empty-state"><i class="lucide-calendar-plus"></i><p>No custom requests yet.<br>Click "Request pickup" to add one.</p></div>';
        lucide.createIcons();
        return;
    }

    el.innerHTML = reqs.map(r => {
        const canCancel = ['pending', 'confirmed'].includes(r.status);
        return `
            <div class="pickup-req-item">
                <div class="pickup-req-dot ${r.status}"></div>
                <div class="pickup-req-body">
                    <div class="pickup-req-date">${formatDate(r.requested_date)} · ${r.time_label || r.time_preference}</div>
                    <div class="pickup-req-meta">${escHtml(r.description || '—')}${r.notes ? ` · Note: ${escHtml(r.notes)}` : ''}</div>
                </div>
                <span class="pickup-req-status ${r.status}">${r.status}</span>
                ${canCancel ? `<button class="cancel-req-btn" onclick="handleCancelRequest('${r.id}')">Cancel</button>` : ''}
            </div>`;
    }).join('');
    lucide.createIcons();
}

// ── Cancel request ────────────────────────────────────────────────────────────
async function handleCancelRequest(reqId) {
    if (!confirm('Cancel this pickup request?')) return;
    try {
        await apiCancelPickupRequest(reqId);
        schedState.requests = await apiGetMyRequests().catch(() => schedState.requests);
        const r = schedState.requests.find(x => x.id === reqId);
        if (r) r.status = 'cancelled';
        renderMyRequestsList();
        renderWeekCalendar();
        showToast('Request cancelled.', 'success');
    } catch (err) {
        showToast(err.message || 'Failed to cancel.', 'error');
    }
}

// ── Pickup request modal ──────────────────────────────────────────────────────
function openPickupModal() {
    const modal = document.getElementById('pickup-modal');
    // Default date to tomorrow if not already set
    const dateEl = document.getElementById('pickup-date');
    if (!dateEl.value) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateEl.value = tomorrow.toISOString().split('T')[0];
    }
    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    dateEl.min = today;

    modal.classList.add('open');
    modal.removeAttribute('aria-hidden');
}

function closePickupModal() {
    const modal = document.getElementById('pickup-modal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.getElementById('pickup-date').value = '';
    document.getElementById('pickup-description').value = '';
}

document.getElementById('request-pickup-btn').addEventListener('click', openPickupModal);
document.getElementById('close-pickup-modal').addEventListener('click', closePickupModal);
document.getElementById('cancel-pickup-modal').addEventListener('click', closePickupModal);
document.getElementById('pickup-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('pickup-modal')) closePickupModal();
});

document.getElementById('submit-pickup-form').addEventListener('click', async () => {
    const date        = document.getElementById('pickup-date').value;
    const time        = document.getElementById('pickup-time').value;
    const description = document.getElementById('pickup-description').value.trim();
    const btn         = document.getElementById('submit-pickup-form');

    if (!date) { showToast('Please select a date.', 'error'); return; }

    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
        const req = await apiCreatePickupRequest({
            requested_date:  date,
            time_preference: time,
            description,
        }).catch(() => {
            // Demo fallback — simulate created request
            return {
                id:              `demo-${Date.now()}`,
                requested_date:  date,
                time_preference: time,
                time_label:      { morning: '7 am – 12 pm', afternoon: '12 pm – 5 pm', evening: '5 pm – 8 pm' }[time],
                description,
                status:          'pending',
                notes:           null,
                created_at:      new Date().toISOString(),
            };
        });
        schedState.requests = [req, ...schedState.requests];
        renderMyRequestsList();
        renderWeekCalendar();
        closePickupModal();
        showToast('Pickup request submitted! You\'ll be notified when confirmed.', 'success');
    } catch (err) {
        showToast(err.message || 'Failed to submit.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="lucide-send"></i> Submit request';
        lucide.createIcons();
    }
});

// ── Calendar navigation ───────────────────────────────────────────────────────
document.getElementById('cal-prev-week').addEventListener('click', () => {
    schedState.weekOffset--;
    renderWeekCalendar();
});
document.getElementById('cal-next-week').addEventListener('click', () => {
    schedState.weekOffset++;
    renderWeekCalendar();
});

// ── Demo data ─────────────────────────────────────────────────────────────────
function getDemoSchedule() {
    const TIME_LABELS = { morning: '7 am – 12 pm', afternoon: '12 pm – 5 pm', evening: '5 pm – 8 pm' };
    const today  = new Date(); today.setHours(0,0,0,0);
    const upcoming = [];
    for (let offset = 0; offset < 15; offset++) {
        const d   = new Date(today); d.setDate(today.getDate() + offset);
        const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;   // JS Sun=0 → Mon=0
        const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
        // Mon=0, Wed=2, Fri=4
        if ([0, 2, 4].includes(dow)) {
            const slot = dow === 4 ? 'afternoon' : 'morning';
            upcoming.push({
                date:      d.toISOString().split('T')[0],
                day_name:  DAYS[dow],
                time_slot: slot,
                time_label: TIME_LABELS[slot],
                frequency: 'weekly',
                days_away: offset,
            });
        }
    }
    return {
        zone_id:   1,
        zone_name: 'Kabulonga',
        schedules: [
            { id:1, day_of_week:0, day_name:'Monday',    time_slot:'morning',   time_label:'7 am – 12 pm', frequency:'weekly' },
            { id:2, day_of_week:2, day_name:'Wednesday', time_slot:'morning',   time_label:'7 am – 12 pm', frequency:'weekly' },
            { id:3, day_of_week:4, day_name:'Friday',    time_slot:'afternoon', time_label:'12 pm – 5 pm', frequency:'weekly' },
        ],
        upcoming,
    };
}

function getDemoRequests() {
    const d1 = new Date(); d1.setDate(d1.getDate() + 3);
    return [{
        id:              'demo-req-1',
        requested_date:  d1.toISOString().split('T')[0],
        time_preference: 'morning',
        time_label:      '7 am – 12 pm',
        description:     'Extra bags from house clean-up',
        status:          'pending',
        notes:           null,
        created_at:      new Date().toISOString(),
    }];
}


/* ============================================================================
   LIVE TRUCK TRACKING PAGE
   ============================================================================ */

const trackState = {
    map:       null,
    markers:   {},    // driver_id → Leaflet marker
    userMarker: null,
    userLatLng: null,
    timer:     null,
    active:    false,
    drivers:   [],
};

// ── Boot ──────────────────────────────────────────────────────────────────────
function loadTrackingPage() {
    if (!trackState.map) {
        trackState.map = L.map('tracking-map').setView([-15.4167, 28.2833], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors', maxZoom: 19,
        }).addTo(trackState.map);
    } else {
        setTimeout(() => trackState.map.invalidateSize(), 300);
    }

    // Get user location for ETA calculation
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            trackState.userLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            if (!trackState.userMarker) {
                const homeIcon = L.divIcon({
                    className: '',
                    html: '<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div>',
                    iconSize: [16, 16], iconAnchor: [8, 8],
                });
                trackState.userMarker = L.marker(
                    [trackState.userLatLng.lat, trackState.userLatLng.lng],
                    { icon: homeIcon, zIndexOffset: 1000 }
                ).addTo(trackState.map).bindPopup('<strong>Your location</strong>');
            }
            trackState.map.setView([trackState.userLatLng.lat, trackState.userLatLng.lng], 14);
        });
    }

    startTracking();
}

// ── Start / stop ──────────────────────────────────────────────────────────────
function startTracking() {
    trackState.active = true;
    updateTrackingToggleBtn();
    refreshDriverLocations();
    trackState.timer = setInterval(refreshDriverLocations, 10000);
}

function stopTracking() {
    trackState.active = false;
    clearInterval(trackState.timer);
    trackState.timer = null;
    updateTrackingToggleBtn();
    document.getElementById('tracking-status-text').textContent = 'Paused';
    document.querySelector('.live-pulse').classList.add('paused');
}

function updateTrackingToggleBtn() {
    const btn   = document.getElementById('tracking-toggle-btn');
    const label = document.getElementById('tracking-toggle-label');
    const pulse = document.querySelector('.live-pulse');
    if (trackState.active) {
        btn.innerHTML  = '<i class="lucide-pause"></i> <span id="tracking-toggle-label">Pause</span>';
        if (pulse) pulse.classList.remove('paused');
    } else {
        btn.innerHTML  = '<i class="lucide-play"></i> <span id="tracking-toggle-label">Resume</span>';
        if (pulse) pulse.classList.add('paused');
    }
    lucide.createIcons();
}

document.getElementById('tracking-toggle-btn').addEventListener('click', () => {
    trackState.active ? stopTracking() : startTracking();
});

// ── Refresh ───────────────────────────────────────────────────────────────────
async function refreshDriverLocations() {
    try {
        trackState.drivers = await apiGetActiveDrivers();
    } catch {
        // Demo: simulate 3 drivers moving around Lusaka
        trackState.drivers = getDemoDrivers();
    }

    updateDriverMarkers();
    renderDriversList();
    updateTrackingStatus();

    const chip = document.getElementById('tracking-refresh-chip');
    if (chip) chip.querySelector('#tracking-last-refresh').textContent =
        'Updated ' + new Date().toLocaleTimeString('en-ZM', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

// ── Map markers ───────────────────────────────────────────────────────────────
function makeTruckIcon(heading) {
    return L.divIcon({
        className: '',
        html: `<div class="truck-marker-wrap">
            <div class="truck-marker-ring"></div>
            <div class="truck-marker-emoji" style="transform:rotate(${heading || 0}deg)">🚛</div>
        </div>`,
        iconSize:   [42, 42],
        iconAnchor: [21, 21],
    });
}

function updateDriverMarkers() {
    const map       = trackState.map;
    const drivers   = trackState.drivers || [];
    const activeIds = new Set(drivers.map(d => d.driver_id));

    // Remove stale markers
    Object.keys(trackState.markers).forEach(id => {
        if (!activeIds.has(id)) {
            map.removeLayer(trackState.markers[id]);
            delete trackState.markers[id];
        }
    });

    drivers.forEach(d => {
        const dist = trackState.userLatLng
            ? haversineKm(trackState.userLatLng.lat, trackState.userLatLng.lng, d.latitude, d.longitude)
            : null;
        const eta  = dist !== null ? etaText(dist, d.speed_kmh) : '—';

        const popup = `
            <div style="font-family:Inter,sans-serif;min-width:160px;">
                <strong style="font-size:0.9rem">🚛 ${escHtml(d.name)}</strong>
                <div style="color:#94a3b8;font-size:0.75rem;margin:4px 0">${escHtml(d.route_name)}</div>
                <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:6px 0">
                <div style="font-size:0.8rem">
                    ${dist !== null ? `📍 ${dist.toFixed(1)} km away<br>` : ''}
                    ⏱ ETA: <b style="color:#10b981">${eta}</b><br>
                    🏎️ Speed: ${Math.round(d.speed_kmh || 0)} km/h
                </div>
            </div>`;

        if (trackState.markers[d.driver_id]) {
            trackState.markers[d.driver_id]
                .setLatLng([d.latitude, d.longitude])
                .setIcon(makeTruckIcon(d.heading))
                .setPopupContent(popup);
        } else {
            trackState.markers[d.driver_id] = L.marker([d.latitude, d.longitude], {
                icon: makeTruckIcon(d.heading),
            }).addTo(map).bindPopup(popup);
        }
    });
}

// ── Drivers side panel ────────────────────────────────────────────────────────
function renderDriversList() {
    const drivers = trackState.drivers || [];
    const countEl = document.getElementById('drivers-count-label');
    countEl.textContent = `${drivers.length} active truck${drivers.length !== 1 ? 's' : ''}`;

    const listEl = document.getElementById('drivers-list');
    if (!drivers.length) {
        listEl.innerHTML = '<div class="empty-state"><i class="lucide-truck"></i><p>No trucks on duty right now.</p></div>';
        lucide.createIcons();
        return;
    }

    // Sort by distance if we have user location
    const withDist = drivers.map(d => {
        const dist = trackState.userLatLng
            ? haversineKm(trackState.userLatLng.lat, trackState.userLatLng.lng, d.latitude, d.longitude)
            : null;
        return { ...d, dist };
    });
    withDist.sort((a, b) => (a.dist ?? 9999) - (b.dist ?? 9999));

    listEl.innerHTML = withDist.map((d, i) => {
        const dist = d.dist !== null ? d.dist.toFixed(1) + ' km' : '—';
        const eta  = d.dist !== null ? etaText(d.dist, d.speed_kmh) : '—';
        return `
            <div class="driver-card ${i === 0 ? 'nearest' : ''}"
                 onclick="flyToDriver('${d.driver_id}')">
                <div class="driver-card-top">
                    <div class="driver-card-icon">🚛</div>
                    <div>
                        <div class="driver-card-name">${escHtml(d.name)}</div>
                        <div class="driver-card-route">${escHtml(d.route_name)}</div>
                    </div>
                </div>
                <div class="driver-card-stats">
                    <div class="driver-stat">
                        <div class="driver-stat-label">Distance</div>
                        <div class="driver-stat-value">${dist}</div>
                    </div>
                    <div class="driver-stat">
                        <div class="driver-stat-label">ETA</div>
                        <div class="driver-stat-value eta">${eta}</div>
                    </div>
                    <div class="driver-stat">
                        <div class="driver-stat-label">Speed</div>
                        <div class="driver-stat-value">${Math.round(d.speed_kmh || 0)} km/h</div>
                    </div>
                    <div class="driver-stat">
                        <div class="driver-stat-label">Updated</div>
                        <div class="driver-stat-value" style="font-size:.72rem">${timeAgo(d.updated_at)}</div>
                    </div>
                </div>
            </div>`;
    }).join('');
    lucide.createIcons();
}

function flyToDriver(driverId) {
    const d = trackState.drivers.find(x => x.driver_id === driverId);
    if (!d || !trackState.map) return;
    trackState.map.flyTo([d.latitude, d.longitude], 16, { duration: 1.2 });
    trackState.markers[driverId]?.openPopup();
}

function updateTrackingStatus() {
    const count  = trackState.drivers.length;
    const badge  = document.getElementById('tracking-status-badge');
    const textEl = document.getElementById('tracking-status-text');
    textEl.textContent = `${count} truck${count !== 1 ? 's' : ''} active`;
    badge.style.borderColor = count > 0 ? 'var(--accent-primary)' : 'var(--border-color)';
}

// ── Haversine distance ────────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function etaText(distKm, speedKmh) {
    const speed = (speedKmh && speedKmh > 3) ? speedKmh : 25;
    const mins  = Math.round((distKm / speed) * 60);
    if (mins < 1) return 'Arriving';
    if (mins < 60) return `~${mins} min`;
    return `~${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ── Demo drivers (subtle movement each call) ──────────────────────────────────
function getDemoDrivers() {
    const t = Date.now() / 1000;
    return [
        {
            driver_id: 'demo-d1', name: 'James Mulenga',
            latitude:  -15.3920 + Math.sin(t * 0.018) * 0.005,
            longitude:  28.3050 + Math.cos(t * 0.018) * 0.005,
            heading: (t * 7) % 360, speed_kmh: 28,
            route_name: 'Kabulonga Morning Run',
            updated_at: new Date().toISOString(),
        },
        {
            driver_id: 'demo-d2', name: 'Mary Chanda',
            latitude:  -15.4150 + Math.sin(t * 0.013 + 2.1) * 0.006,
            longitude:  28.2680 + Math.cos(t * 0.013 + 2.1) * 0.006,
            heading: (t * 9) % 360, speed_kmh: 22,
            route_name: 'Matero Afternoon Route',
            updated_at: new Date().toISOString(),
        },
        {
            driver_id: 'demo-d3', name: 'Peter Mwale',
            latitude:  -15.3700 + Math.sin(t * 0.021 + 4.2) * 0.004,
            longitude:  28.3500 + Math.cos(t * 0.021 + 4.2) * 0.004,
            heading: (t * 11) % 360, speed_kmh: 35,
            route_name: 'Chelston Route',
            updated_at: new Date().toISOString(),
        },
    ];
}

// ── Stop tracking timer when leaving the page ─────────────────────────────────
const _origNavigateTo = navigateTo;
navigateTo = function(page) {
    if (page !== 'tracking' && trackState.timer) {
        stopTracking();
        clearInterval(trackState.timer);
        trackState.timer  = null;
        trackState.active = false;
    }
    _origNavigateTo(page);
};
