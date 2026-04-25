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

    // Guard: if no token, redirect to login
    // (remove this block during development to bypass auth)
    // if (!getToken()) { window.location.href = 'login.html'; return; }

    setupNav();
    setupModals();
    setupMobileMenu();

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
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(`page-${page}`);
    if (target) target.classList.add('active');

    // Update topbar title
    const titles = {
        overview:      'Overview',
        reports:       'My Reports',
        rewards:       'Rewards',
        bins:          'Nearby Bins',
        notifications: 'Notifications',
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

    lucide.createIcons();
}

// ── Mobile menu ───────────────────────────────────────────────────────────────
function setupMobileMenu() {
    const btn     = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    btn.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', e => {
        if (!sidebar.contains(e.target) && !btn.contains(e.target)) {
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
    } catch (err) {
        console.error('Dashboard load failed:', err);
        // Render demo data so the UI is visible without a backend
        dashData = getDemoData();
        renderSidebar();
        renderOverview();
    }
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

    const notifs = dashData?.notifications || [];
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

document.getElementById('mark-all-read-btn').addEventListener('click', () => {
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
