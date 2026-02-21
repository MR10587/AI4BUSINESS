// ========== Configuration ==========
const API_BASE = "http://127.0.0.1:5000";

// ========== Global State ==========
const state = {
    user: null,
    token: null,
    startups: [],
    sortByScore: false,
    highRiskOnly: false,
    currentStartupDetail: null
};

// ========== DOM Cache ==========
const el = {
    // Auth
    authView: document.getElementById('authView'),
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    registerName: document.getElementById('registerName'),
    registerEmail: document.getElementById('registerEmail'),
    registerPassword: document.getElementById('registerPassword'),
    registerPasswordConfirm: document.getElementById('registerPasswordConfirm'),
    loginMessage: document.getElementById('loginMessage'),
    registerMessage: document.getElementById('registerMessage'),
    loginSubmitBtn: document.getElementById('loginSubmitBtn'),
    registerSubmitBtn: document.getElementById('registerSubmitBtn'),

    // App
    appView: document.getElementById('appView'),
    navbarUser: document.getElementById('navbarUser'),
    userEmail: document.getElementById('userEmail'),
    userRole: document.getElementById('userRole'),

    // Tabs
    startupsTab: document.getElementById('startupsTab'),
    kpiTab: document.getElementById('kpiTab'),
    kpiTabBtn: document.getElementById('kpiTabBtn'),

    // Startups
    startupsContent: document.getElementById('startupsContent'),
    startupsLoading: document.getElementById('startupsLoading'),
    industryFilter: document.getElementById('industryFilter'),
    createStartupBtn: document.getElementById('createStartupBtn'),

    // KPI
    kpiTotal: document.getElementById('kpiTotal'),
    kpiAvg: document.getElementById('kpiAvg'),
    kpiDistribution: document.getElementById('kpiDistribution'),
    topIndustriesList: document.getElementById('topIndustriesList'),
    recentActivityList: document.getElementById('recentActivityList'),

    // Modals
    createStartupModal: document.getElementById('createStartupModal'),
    startupDetailModal: document.getElementById('startupDetailModal'),
    createStartupSubmitBtn: document.getElementById('createStartupSubmitBtn'),

    // Toast
    toastContainer: document.getElementById('toastContainer')
};

// ========== Initialize ========== 
window.addEventListener('load', () => {
    console.log('🚀 AI4BUSINESS Frontend Initialized');
    restoreSession();
});

// Close modals on ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeCreateStartupModal();
        closeDetailModal();
    }
});

// ========== Storage & Session ==========
function getToken() {
    return localStorage.getItem('token') || '';
}

function getUser() {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
}

function setToken(token) {
    if (token) {
        localStorage.setItem('token', token);
    } else {
        localStorage.removeItem('token');
    }
}

function setUser(user) {
    if (user) {
        localStorage.setItem('user', JSON.stringify(user));
    } else {
        localStorage.removeItem('user');
    }
}

function restoreSession() {
    const token = getToken();
    const user = getUser();
    if (token && user) {
        state.token = token;
        state.user = user;
        showAppView();
    }
}

// ========== API Calls ==========
async function apiCall(endpoint, options = {}) {
    const {
        method = 'GET',
        body = null,
        auth = true
    } = options;

    const headers = { 'Content-Type': 'application/json' };
    if (auth && state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    try {
        console.log(`🔗 ${method} /api${endpoint}`, body);
        const res = await fetch(`${API_BASE}/api${endpoint}`, config);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            const msg = data.error || `Error ${res.status}`;
            addToast('error', msg);
            if (res.status === 401) logout();
            return null;
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        addToast('error', 'Network error');
        return null;
    }
}

// ========== Auth UI ==========
function switchToLogin() {
    el.loginForm.classList.add('active');
    el.registerForm.classList.remove('active');
}

function switchToRegister() {
    el.loginForm.classList.remove('active');
    el.registerForm.classList.add('active');
}

async function handleLogin(event) {
    event.preventDefault();
    const email = el.loginEmail.value.trim();
    const password = el.loginPassword.value;

    clearMessage(el.loginMessage);
    if (!email || !password) {
        showMessage(el.loginMessage, 'Please fill in all fields', 'error');
        return;
    }

    setLoading(el.loginSubmitBtn, true);
    const res = await apiCall('/login', {
        method: 'POST',
        body: { email, password },
        auth: false
    });
    setLoading(el.loginSubmitBtn, false);

    if (!res?.access_token) return;

    setToken(res.access_token);
    setUser(res.user);
    state.token = res.access_token;
    state.user = res.user;

    showMessage(el.loginMessage, `✓ Welcome ${res.user.name}!`, 'success');
    setTimeout(() => {
        el.loginEmail.value = '';
        el.loginPassword.value = '';
        showAppView();
    }, 500);
}

async function handleRegister(event) {
    event.preventDefault();
    const name = el.registerName.value.trim();
    const email = el.registerEmail.value.trim();
    const password = el.registerPassword.value;
    const passwordConfirm = el.registerPasswordConfirm.value;
    const role = document.querySelector('input[name="role"]:checked').value;

    clearMessage(el.registerMessage);

    if (!name || !email || !password) {
        showMessage(el.registerMessage, 'Please fill in all fields', 'error');
        return;
    }

    if (password !== passwordConfirm) {
        showMessage(el.registerMessage, 'Passwords do not match', 'error');
        return;
    }

    if (password.length < 6) {
        showMessage(el.registerMessage, 'Password must be at least 6 characters', 'error');
        return;
    }

    setLoading(el.registerSubmitBtn, true);
    const registerRes = await apiCall('/register', {
        method: 'POST',
        body: { name, email, password, role },
        auth: false
    });
    setLoading(el.registerSubmitBtn, false);

    if (!registerRes) return;

    // Auto-login
    const loginRes = await apiCall('/login', {
        method: 'POST',
        body: { email, password },
        auth: false
    });

    if (!loginRes?.access_token) {
        showMessage(el.registerMessage, 'Registration successful but login failed', 'error');
        return;
    }

    setToken(loginRes.access_token);
    setUser(loginRes.user);
    state.token = loginRes.access_token;
    state.user = loginRes.user;

    showMessage(el.registerMessage, `✓ Welcome ${loginRes.user.name}!`, 'success');
    setTimeout(() => {
        el.registerName.value = '';
        el.registerEmail.value = '';
        el.registerPassword.value = '';
        el.registerPasswordConfirm.value = '';
        showAppView();
    }, 500);
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        state.user = null;
        state.token = null;
        setToken(null);
        setUser(null);
        switchToLogin();
        el.authView.style.display = 'flex';
        el.appView.style.display = 'none';
        addToast('info', 'Logged out');
    }
}

// ========== App View ==========
function showAppView() {
    el.authView.style.display = 'none';
    el.appView.style.display = 'flex';
    updateUserInfo();
    loadStartups();
    
    // Check if admin
    if (state.user.role === 'admin') {
        el.kpiTabBtn.style.display = 'block';
        loadKPI();
    } else {
        el.kpiTabBtn.style.display = 'none';
    }

    // Show create button for startups
    if (state.user.role === 'startup') {
        el.createStartupBtn.style.display = 'block';
    } else {
        el.createStartupBtn.style.display = 'none';
    }
}

function updateUserInfo() {
    el.userEmail.textContent = state.user.email;
    const roleText = state.user.role === 'startup' ? '🚀 Startup' : 
                     state.user.role === 'investor' ? '💰 Investor' : '🔧 Admin';
    el.userRole.textContent = roleText;
    el.navbarUser.style.display = 'flex';
}

// ========== Tabs ==========
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Update tab content
    el.startupsTab.classList.toggle('active', tabName === 'startups');
    el.kpiTab.classList.toggle('active', tabName === 'kpi');

    if (tabName === 'kpi') {
        loadKPI();
    }
}

// ========== Startups ==========
async function loadStartups() {
    el.startupsLoading.style.display = 'block';
    const res = await apiCall('/startups');
    el.startupsLoading.style.display = 'none';

    if (!res) return;

    state.startups = Array.isArray(res) ? res : [];
    renderStartups();
}

function renderStartups() {
    const filtered = getFilteredStartups();
    
    // Desktop: Table
    let html = `
        <table class="startups-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Industry</th>
                    <th>Team</th>
                    <th>Investment</th>
                    <th>Stage</th>
                    <th>Score</th>
                    <th>Risk</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
    `;

    if (filtered.length === 0) {
        html += `<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">📭</div><p>No startups found</p></div></td></tr>`;
    } else {
        filtered.forEach(s => {
            const riskCount = (Array.isArray(s.risk_flags) ? s.risk_flags.length : 0);
            html += `
                <tr onclick="showStartupDetail(${s.id})">
                    <td>#${s.id}</td>
                    <td><strong>${escapeHtml(s.name || 'Unnamed')}</strong></td>
                    <td><span class="badge-industry">${escapeHtml(s.industry || 'N/A')}</span></td>
                    <td>${s.team_size || 0}</td>
                    <td>$${(s.investment_needed || 0).toLocaleString()}</td>
                    <td><span class="badge-stage">${escapeHtml(s.stage || 'idea')}</span></td>
                    <td><span class="startup-score">${s.total_score || 0}</span></td>
                    <td>${riskCount > 0 ? `<span class="badge-risk">⚠️ ${riskCount}</span>` : '-'}</td>
                    <td class="startup-action" onclick="event.stopPropagation();">
                        ${canScore(s) ? `<button class="btn btn-primary" style="padding: 4px 12px;" onclick="scoreStartupButton(${s.id}, event)">Score</button>` : '-'}
                    </td>
                </tr>
            `;
        });
    }

    html += `</tbody></table>`;

    // Mobile: Cards
    let cardsHtml = '';
    filtered.forEach(s => {
        const riskCount = (Array.isArray(s.risk_flags) ? s.risk_flags.length : 0);
        cardsHtml += `
            <div class="startup-card" onclick="showStartupDetail(${s.id})">
                <div class="startup-card-title">${escapeHtml(s.name || 'Unnamed')}</div>
                <div class="startup-card-meta">
                    <span>${escapeHtml(s.industry || 'N/A')}</span> • 
                    <span>${escapeHtml(s.stage || 'idea')}</span> • 
                    <span>Team: ${s.team_size || 0}</span>
                </div>
                <div class="startup-card-row">
                    <span>Score</span>
                    <span class="startup-score">${s.total_score || 0}</span>
                </div>
                ${riskCount > 0 ? `<div class="startup-card-row"><span>Risk Flags</span><span>⚠️ ${riskCount}</span></div>` : ''}
                ${canScore(s) ? `<button class="btn btn-primary" style="width: 100%; margin-top: 12px;" onclick="event.stopPropagation(); scoreStartupButton(${s.id}, event);">Score with AI</button>` : ''}
            </div>
        `;
    });

    el.startupsContent.innerHTML = html + cardsHtml;
}

function getFilteredStartups() {
    let filtered = [...state.startups];

    // Filter by industry
    const searchTerm = el.industryFilter.value.toLowerCase().trim();
    if (searchTerm) {
        filtered = filtered.filter(s => 
            (s.industry || '').toLowerCase().includes(searchTerm)
        );
    }

    // Filter by risk
    if (state.highRiskOnly) {
        filtered = filtered.filter(s => 
            Array.isArray(s.risk_flags) && s.risk_flags.length > 0
        );
    }

    // Sort by score
    if (state.sortByScore) {
        filtered.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
    }

    return filtered;
}

function canScore(startup) {
    if (!state.user) return false;
    if (state.user.role === 'admin') return true;
    if (state.user.role === 'startup') return startup.user_id === state.user.id;
    return false;
}

function toggleSort() {
    state.sortByScore = !state.sortByScore;
    document.getElementById('sortText').textContent = state.sortByScore ? 
        '⬆️ Sort by Score (Desc)' : '⬇️ Sort by Score';
    renderStartups();
}

function toggleRiskFilter() {
    state.highRiskOnly = !state.highRiskOnly;
    document.getElementById('riskText').textContent = state.highRiskOnly ? 
        '✓ High Risk Only' : '⚠️ High Risk Only';
    renderStartups();
}

async function scoreStartupButton(id, event) {
    event.preventDefault();
    event.stopPropagation();
    if (!confirm('Score this startup with AI?')) return;

    const btn = event.target.closest('.btn');
    setLoading(btn, true);

    const res = await apiCall(`/startups/${id}/score`, {
        method: 'POST',
        body: {},
        auth: true
    });

    setLoading(btn, false);
    if (!res) return;

    addToast('success', `✓ Scored! Total: ${res.total_score}`);
    loadStartups();
}

function showStartupDetail(id) {
    const startup = state.startups.find(s => s.id === id);
    if (!startup) return;

    state.currentStartupDetail = startup;

    // Populate modal
    document.getElementById('detailTitle').textContent = `${escapeHtml(startup.name || 'Unnamed')} (#${startup.id})`;
    document.getElementById('detailIndustry').textContent = escapeHtml(startup.industry || 'N/A');
    document.getElementById('detailStage').textContent = escapeHtml(startup.stage || 'idea');
    document.getElementById('detailTeamSize').textContent = startup.team_size || 'N/A';
    document.getElementById('detailInvestment').textContent = `$${(startup.investment_needed || 0).toLocaleString()}`;
    document.getElementById('detailIdea').textContent = escapeHtml(startup.idea || 'N/A');
    document.getElementById('detailTotalScore').textContent = startup.total_score || 0;
    document.getElementById('detailRuleScore').textContent = startup.rule_score || 0;
    document.getElementById('detailAIScore').textContent = startup.ai_score || 0;

    // Risk flags
    const riskSection = document.getElementById('detailRiskSection');
    if (Array.isArray(startup.risk_flags) && startup.risk_flags.length > 0) {
        riskSection.style.display = 'block';
        let riskHtml = '';
        startup.risk_flags.forEach(flag => {
            riskHtml += `<span class="badge badge-risk">${escapeHtml(flag)}</span>`;
        });
        document.getElementById('detailRiskFlags').innerHTML = riskHtml;
    } else {
        riskSection.style.display = 'none';
    }

    // AI explanation
    const expSection = document.getElementById('detailExplanationSection');
    if (startup.ai_explanation) {
        expSection.style.display = 'block';
        document.getElementById('detailExplanation').textContent = escapeHtml(startup.ai_explanation);
    } else {
        expSection.style.display = 'none';
    }

    // Show/hide score button
    const scoreBtn = document.getElementById('scoreButton');
    scoreBtn.style.display = canScore(startup) ? 'inline-flex' : 'none';

    el.startupDetailModal.style.display = 'flex';
}

function closeDetailModal() {
    el.startupDetailModal.style.display = 'none';
}

async function scoreStartupFromModal() {
    if (!state.currentStartupDetail) return;
    if (!confirm('Score this startup with AI?')) return;

    const btn = document.getElementById('scoreButton');
    setLoading(btn, true);

    const res = await apiCall(`/startups/${state.currentStartupDetail.id}/score`, {
        method: 'POST',
        body: {},
        auth: true
    });

    setLoading(btn, false);
    if (!res) return;

    addToast('success', `✓ Scored! Total: ${res.total_score}`);
    loadStartups();
    closeDetailModal();
}

// ========== Create Startup ==========
function showCreateStartupModal() {
    el.createStartupModal.style.display = 'flex';
}

function closeCreateStartupModal() {
    el.createStartupModal.style.display = 'none';
    document.getElementById('startupName').value = '';
    document.getElementById('startupIdea').value = '';
    document.getElementById('startupIndustry').value = '';
    document.getElementById('startupTeamSize').value = '';
    document.getElementById('startupInvestment').value = '';
    document.getElementById('startupStage').value = 'idea';
}

async function handleCreateStartup(event) {
    event.preventDefault();

    const name = document.getElementById('startupName').value.trim();
    const idea = document.getElementById('startupIdea').value.trim();
    const industry = document.getElementById('startupIndustry').value.trim();
    const teamSize = parseInt(document.getElementById('startupTeamSize').value);
    const investment = parseFloat(document.getElementById('startupInvestment').value);
    const stage = document.getElementById('startupStage').value;

    if (!name || !idea || !industry || !teamSize || !investment) {
        addToast('error', 'Please fill in all fields');
        return;
    }

    setLoading(el.createStartupSubmitBtn, true);

    const res = await apiCall('/startups', {
        method: 'POST',
        body: {
            name, idea, industry,
            team_size: teamSize,
            investment_needed: investment,
            stage
        },
        auth: true
    });

    setLoading(el.createStartupSubmitBtn, false);
    if (!res) return;

    addToast('success', `✓ Startup "${name}" created!`);
    closeCreateStartupModal();
    loadStartups();
}

// ========== KPI Dashboard ==========
async function loadKPI() {
    const res = await apiCall('/admin/kpi');
    if (!res) return;

    el.kpiTotal.textContent = res.total_startups || 0;
    el.kpiAvg.textContent = (res.avg_total_score || 0).toFixed(2);

    // Distribution
    let distHtml = '';
    const buckets = [
        { label: '0-39', key: '0_39' },
        { label: '40-59', key: '40_59' },
        { label: '60-79', key: '60_79' },
        { label: '80-100', key: '80_100' }
    ];
    buckets.forEach(b => {
        const count = res.score_distribution?.[b.key] || 0;
        distHtml += `
            <div class="distribution-item">
                <div class="distribution-label">${b.label}</div>
                <div class="distribution-count">${count}</div>
            </div>
        `;
    });
    el.kpiDistribution.innerHTML = distHtml;

    // Top industries
    let indHtml = '';
    if (res.top_industries?.length > 0) {
        res.top_industries.forEach(ind => {
            indHtml += `
                <div class="industry-item">
                    <span class="industry-name">${escapeHtml(ind.industry)}</span>
                    <span class="industry-count">${ind.count}</span>
                </div>
            `;
        });
    } else {
        indHtml = '<p style="text-align: center; color: var(--text-secondary);">No data</p>';
    }
    el.topIndustriesList.innerHTML = indHtml;

    // Recent activity
    let actHtml = '';
    if (res.recent_activity?.length > 0) {
        res.recent_activity.forEach(act => {
            const time = act.created_at ? new Date(act.created_at).toLocaleString() : 'N/A';
            actHtml += `
                <div class="activity-item">
                    <div class="activity-time">${time}</div>
                    <div class="activity-action">${escapeHtml(act.action)}</div>
                </div>
            `;
        });
    } else {
        actHtml = '<p style="text-align: center; color: var(--text-secondary);">No activity</p>';
    }
    el.recentActivityList.innerHTML = actHtml;
}

// ========== Utilities ==========
function addToast(type, message) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    el.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3500);
}

function setLoading(btn, isLoading) {
    if (!btn) return;
    btn.disabled = isLoading;
    const text = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.btn-spinner');
    if (text) text.style.display = isLoading ? 'none' : 'inline';
    if (spinner) spinner.style.display = isLoading ? 'inline-block' : 'none';
}

function showMessage(el, msg, type) {
    clearMessage(el);
    el.textContent = msg;
    el.className = `auth-message ${type}`;
}

function clearMessage(el) {
    el.textContent = '';
    el.className = 'auth-message';
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Listen to filter changes
document.addEventListener('input', (e) => {
    if (e.target === el.industryFilter) {
        renderStartups();
    }
});

console.log('✓ app.js loaded');