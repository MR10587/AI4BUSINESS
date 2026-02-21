const API_BASE = "http://127.0.0.1:5000";

const state = {
  startups: [],
  users: [],
  sortByScore: false,
  highRiskOnly: false,
  startupsLoading: false,
  currentTab: "startups",
};

const el = {
  toastRoot: document.getElementById("toastRoot"),
  userMeta: document.getElementById("userMeta"),
  logoutBtn: document.getElementById("logoutBtn"),
  authView: document.getElementById("authView"),
  appView: document.getElementById("appView"),
  showLoginBtn: document.getElementById("showLoginBtn"),
  showRegisterBtn: document.getElementById("showRegisterBtn"),
  loginForm: document.getElementById("loginForm"),
  registerForm: document.getElementById("registerForm"),
  loginSubmitBtn: document.getElementById("loginSubmitBtn"),
  registerSubmitBtn: document.getElementById("registerSubmitBtn"),
  startupsTabBtn: document.getElementById("startupsTabBtn"),
  kpiTabBtn: document.getElementById("kpiTabBtn"),
  usersTabBtn: document.getElementById("usersTabBtn"),
  securityTabBtn: document.getElementById("securityTabBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  startupsPanel: document.getElementById("startupsPanel"),
  kpiPanel: document.getElementById("kpiPanel"),
  usersPanel: document.getElementById("usersPanel"),
  securityPanel: document.getElementById("securityPanel"),
  createStartupCard: document.getElementById("createStartupCard"),
  createStartupForm: document.getElementById("createStartupForm"),
  createStartupSubmitBtn: document.getElementById("createStartupSubmitBtn"),
  industryFilter: document.getElementById("industryFilter"),
  sortScoreBtn: document.getElementById("sortScoreBtn"),
  riskFilterBtn: document.getElementById("riskFilterBtn"),
  startupSkeleton: document.getElementById("startupSkeleton"),
  startupsTbody: document.getElementById("startupsTbody"),
  startupCards: document.getElementById("startupCards"),
  startupDetailCard: document.getElementById("startupDetailCard"),
  detailTitle: document.getElementById("detailTitle"),
  detailMeta: document.getElementById("detailMeta"),
  detailIdea: document.getElementById("detailIdea"),
  detailCloseBtn: document.getElementById("detailCloseBtn"),
  kpiTotal: document.getElementById("kpiTotal"),
  kpiAvg: document.getElementById("kpiAvg"),
  kpiDist: document.getElementById("kpiDist"),
  topIndustriesList: document.getElementById("topIndustriesList"),
  recentActivityList: document.getElementById("recentActivityList"),
  usersSkeleton: document.getElementById("usersSkeleton"),
  usersTbody: document.getElementById("usersTbody"),
  changePasswordForm: document.getElementById("changePasswordForm"),
  changePasswordSubmitBtn: document.getElementById("changePasswordSubmitBtn"),
};

// ===== Utilities =====

function getToken() {
  return localStorage.getItem("token") || "";
}

function getUser() {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function addToast(type, message) {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  el.toastRoot.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 3500);
}

function setButtonLoading(button, isLoading) {
  if (!button) return;
  button.disabled = isLoading;
  button.classList.toggle("loading", isLoading);
}

function setStartupsLoading(isLoading) {
  state.startupsLoading = isLoading;
  el.startupSkeleton.classList.toggle("hidden", !isLoading);
}

function logout(showToast = true) {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  state.startups = [];
  state.users = [];
  renderApp();
  if (showToast) addToast("info", "Logged out");
}

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json();

    if (res.status === 401) {
      logout(false);
      addToast("error", "Session expired. Please login again.");
      return null;
    }

    if (res.status === 403) {
      addToast("error", "Forbidden: You don't have permission for this action.");
      return null;
    }

    if (!res.ok) {
      addToast("error", data.error || "An error occurred");
      return null;
    }

    return data;
  } catch (err) {
    addToast("error", `Network error: ${err.message}`);
    return null;
  }
}

function showTab(tabName) {
  state.currentTab = tabName;
  
  el.startupsPanel.classList.toggle("active", tabName === "startups");
  el.kpiPanel.classList.toggle("active", tabName === "kpi");
  el.usersPanel.classList.toggle("active", tabName === "users");
  el.securityPanel.classList.toggle("active", tabName === "security");

  el.startupsTabBtn.classList.toggle("active", tabName === "startups");
  el.kpiTabBtn.classList.toggle("active", tabName === "kpi");
  el.usersTabBtn.classList.toggle("active", tabName === "users");
  el.securityTabBtn.classList.toggle("active", tabName === "security");

  if (tabName === "kpi") {
    loadKpi();
  } else if (tabName === "users") {
    loadUsers();
  }
}

function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function toggleAuth(form) {
  const isLogin = form === "login";
  el.loginForm.classList.toggle("hidden", !isLogin);
  el.registerForm.classList.toggle("hidden", isLogin);
  el.showLoginBtn.classList.toggle("active", isLogin);
  el.showRegisterBtn.classList.toggle("active", !isLogin);
}

// ===== Startups Management =====

function renderStartups() {
  clearNode(el.startupsTbody);

  if (state.startupsLoading) {
    return;
  }

  if (!state.startups.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" style="text-align: center; padding: 2rem;">No startups found</td>`;
    el.startupsTbody.appendChild(tr);
    return;
  }

  let filtered = [...state.startups];

  const industry = el.industryFilter.value;
  if (industry) {
    filtered = filtered.filter(s => s.industry === industry);
  }

  if (state.highRiskOnly) {
    filtered = filtered.filter(s => s.risk_flags && s.risk_flags.length > 0);
  }

  if (state.sortByScore) {
    filtered.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
  }

  const user = getUser();
  const isAdmin = user && user.role === "admin";

  for (const startup of filtered) {
    const tr = document.createElement("tr");
    const ownerName = startup.user_id === user.id ? "(You)" : "";

    let actionsHtml = `<button class="btn btn-sm btn-secondary" data-id="${startup.id}" onclick="viewStartupDetail(${startup.id})">View</button>`;
    
    if (user.role === "startup" && startup.user_id === user.id) {
      actionsHtml += ` <button class="btn btn-sm btn-danger" data-id="${startup.id}" onclick="deleteStartup(${startup.id})">Delete</button>`;
    } else if (isAdmin) {
      actionsHtml += ` <button class="btn btn-sm btn-danger" data-id="${startup.id}" onclick="adminDeleteStartup(${startup.id})">Delete</button>`;
    }

    tr.innerHTML = `
      <td>${escapeHtml(startup.name)}</td>
      <td>${escapeHtml(startup.industry)}</td>
      <td>${startup.team_size}</td>
      <td>${startup.total_score || 0}</td>
      <td>${startup.stage}</td>
      <td>
        <div class="table-actions">
          ${actionsHtml}
        </div>
      </td>
    `;
    el.startupsTbody.appendChild(tr);
  }

  // Update industry filter options
  const industries = [...new Set(state.startups.map(s => s.industry))].sort();
  const currentValue = el.industryFilter.value;
  clearNode(el.industryFilter);
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = "All Industries";
  el.industryFilter.appendChild(opt);
  for (const ind of industries) {
    const option = document.createElement("option");
    option.value = ind;
    option.textContent = ind;
    el.industryFilter.appendChild(option);
  }
  el.industryFilter.value = currentValue;
}

function viewStartupDetail(id) {
  const startup = state.startups.find(s => s.id === id);
  if (!startup) return;

  el.detailTitle.textContent = startup.name;
  el.detailMeta.textContent = `Industry: ${startup.industry} | Team: ${startup.team_size} | Score: ${startup.total_score || 0}`;
  el.detailIdea.textContent = startup.idea;

  el.startupDetailCard.classList.remove("hidden");
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function loadStartups() {
  setStartupsLoading(true);
  renderStartups();
  const data = await api("/startups");
  setStartupsLoading(false);
  if (!data) return;
  state.startups = Array.isArray(data) ? data : [];
  renderStartups();
}

async function deleteStartup(id) {
  if (!confirm(`Are you sure you want to delete this startup?`)) return;

  const result = await api(`/startups/${id}`, { method: "DELETE" });
  if (result) {
    addToast("success", "Startup deleted");
    loadStartups();
  }
}

async function adminDeleteStartup(id) {
  if (!confirm(`Are you sure you want to delete this startup? This action cannot be undone.`)) return;

  const result = await api(`/admin/startups/${id}`, { method: "DELETE" });
  if (result) {
    addToast("success", "Startup deleted");
    loadStartups();
  }
}

// ===== KPI Management =====

function renderKpi(data) {
  el.kpiTotal.textContent = data.total_startups || 0;
  el.kpiAvg.textContent = (data.avg_total_score || 0).toFixed(2);

  const d = data.score_distribution || {};
  el.kpiDist.textContent = `0-39: ${d["0_39"] ?? 0} | 40-59: ${d["40_59"] ?? 0} | 60-79: ${d["60_79"] ?? 0} | 80-100: ${d["80_100"] ?? 0}`;

  clearNode(el.topIndustriesList);
  const top = Array.isArray(data.top_industries) ? data.top_industries : [];
  if (!top.length) {
    const li = document.createElement("li");
    li.textContent = "No data";
    el.topIndustriesList.appendChild(li);
  } else {
    for (const item of top) {
      const li = document.createElement("li");
      li.textContent = `${item.industry}: ${item.count}`;
      el.topIndustriesList.appendChild(li);
    }
  }

  clearNode(el.recentActivityList);
  const recent = Array.isArray(data.recent_activity) ? data.recent_activity : [];
  if (!recent.length) {
    const li = document.createElement("li");
    li.textContent = "No recent activity";
    el.recentActivityList.appendChild(li);
  } else {
    for (const item of recent) {
      const li = document.createElement("li");
      li.textContent = `${item.created_at || "-"} | user:${item.user_id ?? "-"} | ${item.action || ""}`;
      el.recentActivityList.appendChild(li);
    }
  }
}

async function loadKpi() {
  const data = await api("/admin/kpi");
  if (!data) return;
  renderKpi(data);
}

// ===== Users Management (Admin) =====

function renderUsers() {
  clearNode(el.usersTbody);

  if (!state.users.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" style="text-align: center; padding: 2rem;">No users found</td>`;
    el.usersTbody.appendChild(tr);
    return;
  }

  const currentUser = getUser();

  for (const user of state.users) {
    const tr = document.createElement("tr");
    const canDelete = user.id !== currentUser.id;
    const deleteBtn = canDelete 
      ? `<button class="btn btn-sm btn-danger" onclick="adminDeleteUser(${user.id})">Delete</button>`
      : `<span class="muted">(self)</span>`;

    tr.innerHTML = `
      <td>${user.id}</td>
      <td>${escapeHtml(user.email)}</td>
      <td>${user.role}</td>
      <td>${user.startups_count || 0}</td>
      <td>${new Date(user.created_at).toLocaleDateString()}</td>
      <td>${deleteBtn}</td>
    `;
    el.usersTbody.appendChild(tr);
  }
}

async function loadUsers() {
  el.usersSkeleton.classList.remove("hidden");
  const data = await api("/admin/users");
  el.usersSkeleton.classList.add("hidden");
  if (!data) return;
  state.users = Array.isArray(data) ? data : [];
  renderUsers();
}

async function adminDeleteUser(id) {
  if (!confirm(`Are you sure you want to delete this user and all their associated startups?`)) return;

  const result = await api(`/admin/users/${id}`, { method: "DELETE" });
  if (result) {
    addToast("success", "User deleted");
    loadUsers();
  }
}

// ===== Security (Admin) =====

async function handleChangePassword(event) {
  event.preventDefault();

  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    addToast("error", "All fields are required");
    return;
  }

  if (newPassword.length < 8) {
    addToast("error", "New password must be at least 8 characters");
    return;
  }

  if (newPassword !== confirmPassword) {
    addToast("error", "Passwords do not match");
    return;
  }

  setButtonLoading(el.changePasswordSubmitBtn, true);

  const result = await api("/admin/change-password", {
    method: "POST",
    body: {
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    },
  });

  setButtonLoading(el.changePasswordSubmitBtn, false);

  if (result) {
    addToast("success", "Password updated successfully");
    el.changePasswordForm.reset();
  }
}

// ===== Auth Handlers =====

function renderApp() {
  const user = getUser();
  const loggedIn = Boolean(getToken() && user);

  el.authView.classList.toggle("hidden", loggedIn);
  el.appView.classList.toggle("hidden", !loggedIn);
  el.logoutBtn.classList.toggle("hidden", !loggedIn);
  el.userMeta.classList.toggle("hidden", !loggedIn);

  if (!loggedIn) {
    toggleAuth("login");
    return;
  }

  el.userMeta.textContent = `${user.email} (${user.role})`;
  const isAdmin = user.role === "admin";
  el.kpiTabBtn.classList.toggle("hidden", !isAdmin);
  el.usersTabBtn.classList.toggle("hidden", !isAdmin);
  el.securityTabBtn.classList.toggle("hidden", !isAdmin);
  el.createStartupCard.classList.toggle("hidden", user.role !== "startup");

  showTab("startups");
  loadStartups();
}

el.showLoginBtn.addEventListener("click", () => toggleAuth("login"));
el.showRegisterBtn.addEventListener("click", () => toggleAuth("register"));

el.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setButtonLoading(el.loginSubmitBtn, true);
  const data = await api("/login", {
    method: "POST",
    auth: false,
    body: {
      email: document.getElementById("loginEmail").value.trim(),
      password: document.getElementById("loginPassword").value,
    },
  });
  setButtonLoading(el.loginSubmitBtn, false);
  if (!data) return;

  localStorage.setItem("token", data.access_token);
  localStorage.setItem("user", JSON.stringify(data.user));
  addToast("success", "Login successful");
  renderApp();
});

el.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setButtonLoading(el.registerSubmitBtn, true);
  const data = await api("/register", {
    method: "POST",
    auth: false,
    body: {
      name: document.getElementById("registerName").value.trim(),
      email: document.getElementById("registerEmail").value.trim(),
      password: document.getElementById("registerPassword").value,
      role: document.getElementById("registerRole").value,
    },
  });
  setButtonLoading(el.registerSubmitBtn, false);
  if (!data) return;

  addToast("success", "Registration successful. Please log in.");
  el.registerForm.reset();
  toggleAuth("login");
  document.getElementById("loginEmail").focus();
});

el.logoutBtn.addEventListener("click", () => logout());

el.refreshBtn.addEventListener("click", () => {
  if (state.currentTab === "startups") {
    loadStartups();
  } else if (state.currentTab === "kpi") {
    loadKpi();
  } else if (state.currentTab === "users") {
    loadUsers();
  }
});

el.startupsTabBtn.addEventListener("click", () => showTab("startups"));
el.kpiTabBtn.addEventListener("click", () => showTab("kpi"));
el.usersTabBtn.addEventListener("click", () => showTab("users"));
el.securityTabBtn.addEventListener("click", () => showTab("security"));

el.sortScoreBtn.addEventListener("click", () => {
  state.sortByScore = !state.sortByScore;
  el.sortScoreBtn.classList.toggle("active", state.sortByScore);
  renderStartups();
});

el.riskFilterBtn.addEventListener("click", () => {
  state.highRiskOnly = !state.highRiskOnly;
  el.riskFilterBtn.classList.toggle("active", state.highRiskOnly);
  renderStartups();
});

el.industryFilter.addEventListener("change", () => {
  renderStartups();
});

el.detailCloseBtn.addEventListener("click", () => {
  el.startupDetailCard.classList.add("hidden");
});

el.createStartupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setButtonLoading(el.createStartupSubmitBtn, true);

  const data = await api("/startups", {
    method: "POST",
    body: {
      name: document.getElementById("startupName").value.trim(),
      idea: document.getElementById("startupIdea").value.trim(),
      industry: document.getElementById("startupIndustry").value.trim(),
      team_size: parseInt(document.getElementById("startupTeamSize").value),
      investment_needed: parseFloat(document.getElementById("startupInvestment").value),
      stage: document.getElementById("startupStage").value,
    },
  });

  setButtonLoading(el.createStartupSubmitBtn, false);

  if (data) {
    addToast("success", "Startup created successfully");
    el.createStartupForm.reset();
    loadStartups();
  }
});

el.changePasswordForm.addEventListener("submit", handleChangePassword);

// Initialize
renderApp();