// Modal Functions
function showLoginModal() {
    document.getElementById('loginModal').classList.add('active');
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.remove('active');
}

function showSignupModal() {
    document.getElementById('signupModal').classList.add('active');
}

function closeSignupModal() {
    document.getElementById('signupModal').classList.remove('active');
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

// Authentication
function handleLogin(event) {
    event.preventDefault();
    localStorage.setItem('isAuthenticated', 'true');
    closeLoginModal();
    showDashboard();
}

function handleSignup(event) {
    event.preventDefault();
    localStorage.setItem('isAuthenticated', 'true');
    closeSignupModal();
    showDashboard();
}

function handleLogout() {
    localStorage.removeItem('isAuthenticated');
    document.getElementById('dashboard').style.display = 'none';
    document.querySelector('.navbar').style.display = 'block';
    document.querySelector('.hero').style.display = 'flex';
    document.querySelector('.features').style.display = 'block';
    document.querySelector('.cta').style.display = 'block';
}

function showDashboard() {
    document.getElementById('dashboard').style.display = 'grid';
    document.querySelector('.navbar').style.display = 'none';
    document.querySelector('.hero').style.display = 'none';
    document.querySelector('.features').style.display = 'none';
    document.querySelector('.cta').style.display = 'none';
}

function showDashboardSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active from menu
    document.querySelectorAll('.menu-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(sectionName).classList.add('active');
    event.target.classList.add('active');
}

// Check authentication on load
window.addEventListener('load', function() {
    if (localStorage.getItem('isAuthenticated') === 'true') {
        showDashboard();
    }
});

// Simple analytics chart
function drawAnalyticsChart() {
    const canvas = document.getElementById('analyticsChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width = 800;
    const height = canvas.height = 300;
    
    ctx.fillStyle = '#F5E6E8';
    ctx.fillRect(0, 0, width, height);
    
    const data = [40, 60, 45, 80, 70, 90, 75, 95];
    const barWidth = width / data.length / 1.5;
    const spacing = width / data.length;
    
    ctx.fillStyle = '#E91E63';
    data.forEach((value, index) => {
        const barHeight = (value / 100) * (height - 40);
        ctx.fillRect(index * spacing + spacing / 4, height - 40 - barHeight, barWidth, barHeight);
    });
}

// Draw chart when dashboard is shown
const checkChart = setInterval(() => {
    const canvas = document.getElementById('analyticsChart');
    if (canvas && canvas.parentElement.offsetParent !== null) {
        drawAnalyticsChart();
        clearInterval(checkChart);
    }
}, 100);