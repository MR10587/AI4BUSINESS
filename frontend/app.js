// ========== Configuration ==========
const API_BASE = "http://127.0.0.1:5000";

// ========== Global State ==========
const appState = {
    user: null,
    token: null,
    startups: []
};

// ========== Modal Functions ==========
function showLoginModal() {
    document.getElementById('loginModal').classList.add('active');
    document.getElementById('signupModal').classList.remove('active');
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.remove('active');
}

function showSignupModal() {
    document.getElementById('signupModal').classList.add('active');
    document.getElementById('loginModal').classList.remove('active');
}

function closeSignupModal() {
    document.getElementById('signupModal').classList.remove('active');
}

function switchToLogin(event) {
    event?.preventDefault();
    closeSignupModal();
    showLoginModal();
}

function switchToSignup(event) {
    event?.preventDefault();
    closeLoginModal();
    showSignupModal();
}

// Close modal on outside click
window.addEventListener('click', function(event) {
    const loginModal = document.getElementById('loginModal');
    const signupModal = document.getElementById('signupModal');
    
    if (event.target === loginModal) {
        closeLoginModal();
    }
    if (event.target === signupModal) {
        closeSignupModal();
    }
});

// ========== API Functions ==========
async function apiCall(endpoint, options = {}) {
    const {
        method = 'GET',
        body = null,
        requiresAuth = true
    } = options;

    const headers = {
        'Content-Type': 'application/json'
    };

    if (requiresAuth && appState.token) {
        headers['Authorization'] = `Bearer ${appState.token}`;
    }

    const config = {
        method,
        headers
    };

    if (body) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, config);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `API Error: ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
}

// ========== Authentication Functions ==========
async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const messageEl = document.getElementById('loginMessage');

    messageEl.textContent = '⏳ Logging in...';
    messageEl.className = 'message-box info';

    try {
        const response = await apiCall('/api/login', {
            method: 'POST',
            body: { email, password },
            requiresAuth: false
        });

        appState.user = response.user;
        appState.token = response.access_token;

        localStorage.setItem('user_token', appState.token);
        localStorage.setItem('user_data', JSON.stringify(appState.user));

        messageEl.textContent = `✓ Welcome ${appState.user.name}!`;
        messageEl.className = 'message-box success';

        setTimeout(() => {
            closeLoginModal();
            showDashboardPage();
        }, 500);
    } catch (error) {
        messageEl.textContent = `❌ ${error.message}`;
        messageEl.className = 'message-box error';
    }
}

async function handleSignup(event) {
    event.preventDefault();

    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const role = document.querySelector('input[name="role"]:checked').value;
    const messageEl = document.getElementById('signupMessage');

    // Validation
    if (password !== confirmPassword) {
        messageEl.textContent = '❌ Passwords do not match!';
        messageEl.className = 'message-box error';
        return;
    }

    if (password.length < 6) {
        messageEl.textContent = '❌ Password must be at least 6 characters!';
        messageEl.className = 'message-box error';
        return;
    }

    messageEl.textContent = '⏳ Creating account...';
    messageEl.className = 'message-box info';

    try {
        await apiCall('/api/register', {
            method: 'POST',
            body: { name, email, password, role },
            requiresAuth: false
        });

        // Auto login after registration
        const loginResponse = await apiCall('/api/login', {
            method: 'POST',
            body: { email, password },
            requiresAuth: false
        });

        appState.user = loginResponse.user;
        appState.token = loginResponse.access_token;

        localStorage.setItem('user_token', appState.token);
        localStorage.setItem('user_data', JSON.stringify(appState.user));

        messageEl.textContent = `✓ Account created! Welcome ${name}!`;
        messageEl.className = 'message-box success';

        setTimeout(() => {
            closeSignupModal();
            showDashboardPage();
        }, 500);
    } catch (error) {
        messageEl.textContent = `❌ ${error.message}`;
        messageEl.className = 'message-box error';
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        appState.user = null;
        appState.token = null;
        localStorage.removeItem('user_token');
        localStorage.removeItem('user_data');
        
        document.getElementById('dashboard').style.display = 'none';
        document.querySelector('.navbar').style.display = 'block';
        document.querySelector('.hero').style.display = 'flex';
        document.querySelector('.features').style.display = 'block';
        document.querySelector('.cta').style.display = 'block';
        document.querySelector('.contact').style.display = 'block';
        
        showLoginModal();
    }
}

// ========== Dashboard Functions ==========
function showDashboardPage() {
    document.getElementById('dashboard').style.display = 'grid';
    document.querySelector('.navbar').style.display = 'none';
    document.querySelector('.hero').style.display = 'none';
    document.querySelector('.features').style.display = 'none';
    document.querySelector('.cta').style.display = 'none';
    document.querySelector('.contact').style.display = 'none';

    updateUserInfo();
    loadDashboardData();
}

function updateUserInfo() {
    if (appState.user) {
        const userInfoEl = document.getElementById('userInfo');
        userInfoEl.innerHTML = `
            <div class="user-details">
                <p><strong>${appState.user.name}</strong></p>
                <p class="user-role">${appState.user.role.toUpperCase()}</p>
            </div>
        `;

        document.getElementById('settingsEmail').value = appState.user.email;
        document.getElementById('settingsName').value = appState.user.name;
        document.getElementById('settingsRole').value = appState.user.role;
    }
}

async function loadDashboardData() {
    try {
        // Get current user info
        const userInfo = await apiCall('/api/me');
        appState.user = userInfo;

        // Get startups
        const startupsData = await apiCall('/api/startups');
        appState.startups = startupsData || [];

        // Update dashboard
        document.getElementById('startupsCount').textContent = appState.startups.length;

        if (appState.user.role === 'investor') {
            renderInvestorDashboard(appState.startups);
        } else if (appState.user.role === 'startup') {
            renderStartupDashboard(appState.startups);
        }

        drawAnalyticsChart();
    } catch (error) {
        console.error('Dashboard load error:', error);
        alert('Error loading dashboard: ' + error.message);
    }
}

function renderInvestorDashboard(startups) {
    const content = document.getElementById('startupsContent');
    
    if (startups.length === 0) {
        content.innerHTML = '<p class="empty-state">📭 No startups available yet.</p>';
        return;
    }

    const sorted = [...startups].sort((a, b) => (b.total_score || 0) - (a.total_score || 0));

    let html = `<div class="startups-table-wrapper">
        <table class="startups-table">
            <thead>
                <tr>
                    <th>Idea</th>
                    <th>Industry</th>
                    <th>Team Size</th>
                    <th>Total Score</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>`;

    sorted.forEach(startup => {
        const idea = startup.idea.substring(0, 50) + (startup.idea.length > 50 ? '...' : '');
        html += `
            <tr>
                <td>${idea}</td>
                <td><span class="badge-industry">${startup.industry}</span></td>
                <td>${startup.team_size}</td>
                <td><strong class="score-badge">${startup.total_score || 0}</strong></td>
                <td><span class="badge badge-stage">${startup.stage}</span></td>
            </tr>`;
    });

    html += `</tbody></table></div>`;
    content.innerHTML = html;
}

function renderStartupDashboard(startups) {
    const content = document.getElementById('startupsContent');
    
    let html = `<div class="startup-actions">
        <button class="btn-primary" onclick="alert('Feature coming soon!')">+ Create New Startup</button>
    </div>`;

    if (startups.length === 0) {
        html += '<p class="empty-state">🚀 You haven\'t created any startups yet.</p>';
    } else {
        html += `<div class="startups-table-wrapper">
            <table class="startups-table">
                <thead>
                    <tr>
                        <th>Idea</th>
                        <th>Industry</th>
                        <th>Score</th>
                        <th>Rule Score</th>
                        <th>AI Score</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>`;

        startups.forEach(startup => {
            const idea = startup.idea.substring(0, 40) + (startup.idea.length > 40 ? '...' : '');
            html += `
                <tr>
                    <td>${idea}</td>
                    <td><span class="badge-industry">${startup.industry}</span></td>
                    <td><strong class="score-badge">${startup.total_score || 0}</strong></td>
                    <td>${startup.rule_score || 0}</td>
                    <td>${startup.ai_score || 0}</td>
                    <td><button class="btn-small" onclick="scoreStartup(${startup.id})">Score</button></td>
                </tr>`;
        });

        html += `</tbody></table></div>`;
    }

    content.innerHTML = html;
}

async function scoreStartup(startupId) {
    try {
        const response = await apiCall(`/api/startups/${startupId}/score`, {
            method: 'POST',
            body: {}
        });
        alert(`✓ Score updated!\nTotal: ${response.total_score}\nRule Score: ${response.rule_score}\nAI Score: ${response.ai_score}`);
        loadDashboardData();
    } catch (error) {
        alert(`❌ Scoring failed: ${error.message}`);
    }
}

// ========== Dashboard Navigation ==========
function showDashboardSection(sectionName) {
    event?.preventDefault();

    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    document.querySelectorAll('.menu-link').forEach(link => {
        link.classList.remove('active');
    });

    const section = document.getElementById(sectionName);
    if (section) {
        section.classList.add('active');
    }

    if (event && event.target) {
        event.target.classList.add('active');
    }

    if (sectionName === 'analytics') {
        setTimeout(() => drawAnalyticsChart(), 100);
    }
}

// ========== Analytics Chart ==========
function drawAnalyticsChart() {
    const canvas = document.getElementById('analyticsChart');
    if (!canvas || canvas.parentElement.offsetParent === null) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = 800;
    const height = canvas.height = 300;

    ctx.fillStyle = '#F5E6E8';
    ctx.fillRect(0, 0, width, height);

    const data = [40, 60, 45, 80, 70, 90, 75, 95];
    const barWidth = width / data.length / 1.5;
    const spacing = width / data.length;

    ctx.fillStyle = '#c42424';
    data.forEach((value, index) => {
        const barHeight = (value / 100) * (height - 40);
        ctx.fillRect(index * spacing + spacing / 4, height - 40 - barHeight, barWidth, barHeight);
    });

    ctx.fillStyle = '#666666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
    labels.forEach((label, index) => {
        ctx.fillText(label, index * spacing + spacing / 2, height - 10);
    });
}

// ========== Contact Form ==========
function handleContactSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const inputs = form.querySelectorAll('input, textarea');
    const name = inputs[0].value;
    const email = inputs[1].value;
    const subject = inputs[2].value;
    const message = inputs[3].value;

    console.log('📨 Contact:', { name, email, subject, message });
    alert('✓ Message sent successfully!');
    form.reset();
}

// ========== Settings ==========
function saveSettings() {
    const name = document.getElementById('settingsName').value;
    localStorage.setItem('user_name', name);
    alert('✓ Settings saved!');
}

// ========== Page Load ==========
window.addEventListener('load', function() {
    const savedToken = localStorage.getItem('user_token');
    const savedUser = localStorage.getItem('user_data');

    if (savedToken && savedUser) {
        appState.token = savedToken;
        appState.user = JSON.parse(savedUser);
        showDashboardPage();
    }
});

// Close modals on ESC key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeLoginModal();
        closeSignupModal();
    }
});

console.log('✓ AI4BUSINESS Frontend Initialized');