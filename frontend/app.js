const API_BASE = "http://127.0.0.1:5000";

const state = {
  startups: [],
  users: [],
  sortByScore: false,
  highRiskOnly: false,
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
  kpiTotal: document.getElementById("kpiTotal"),
  kpiAvg: document.getElementById("kpiAvg"),
  kpiDist: document.getElementById("kpiDist"),
  topIndustriesList: document.getElementById("topIndustriesList"),
  recentActivityList: document.getElementById("recentActivityList"),
  usersSkeleton: document.getElementById("usersSkeleton"),
  usersList: document.getElementById("usersList"),
  changePasswordForm: document.getElementById("changePasswordForm"),
  changePasswordSubmitBtn: document.getElementById("changePasswordSubmitBtn"),
  viewModal: document.getElementById("viewModal"),
  viewModalClose: document.getElementById("viewModalClose"),
  viewModalBody: document.getElementById("viewModalBody"),
  registerPassword: document.getElementById("registerPassword"),
  passwordStrengthLabel: document.getElementById("passwordStrengthLabel"),
  passwordChecklist: document.getElementById("passwordChecklist"),
  generatePasswordBtn: document.getElementById("generatePasswordBtn"),
};

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
  if (!el.toastRoot) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  el.toastRoot.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 3200);
}

function setButtonLoading(button, isLoading) {
  if (!button) return;
  button.disabled = isLoading;
  button.classList.toggle("loading", isLoading);
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

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (res.status === 401) {
      logout(false);
      addToast("error", "Session expired. Please login again.");
      return null;
    }
    if (!res.ok) {
      addToast("error", data.error || data.msg || `Request failed (${res.status})`);
      return null;
    }
    return data;
  } catch {
    addToast("error", "Network error");
    return null;
  }
}

function toggleAuth(mode) {
  const loginMode = mode === "login";
  el.loginForm.classList.toggle("hidden", !loginMode);
  el.registerForm.classList.toggle("hidden", loginMode);
  el.showLoginBtn.classList.toggle("active", loginMode);
  el.showRegisterBtn.classList.toggle("active", !loginMode);
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

  if (tabName === "kpi") loadKpi();
  if (tabName === "users") loadUsers();
}

function clearNode(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

function isWeakPassword(password) {
  const weak = new Set(["password", "12345678", "qwerty123", "admin123", "11111111"]);
  return weak.has(String(password || "").toLowerCase());
}

function evaluatePassword(password) {
  const value = String(password || "");
  return {
    length: value.length >= 8,
    upper: /[A-Z]/.test(value),
    lower: /[a-z]/.test(value),
    number: /\d/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value),
    notWeak: !isWeakPassword(value),
  };
}

function updatePasswordStrengthUI(password) {
  if (!el.passwordChecklist || !el.passwordStrengthLabel) return;
  const checks = evaluatePassword(password);
  const passed = Object.values(checks).filter(Boolean).length;
  const items = el.passwordChecklist.querySelectorAll("li");
  items.forEach((item) => {
    const key = item.getAttribute("data-check");
    const ok = checks[key];
    item.style.color = ok ? "#27ae60" : "#95a5a6";
  });

  let label = "Strength: Weak";
  if (passed >= 6) label = "Strength: Strong";
  else if (passed >= 4) label = "Strength: Medium";
  el.passwordStrengthLabel.textContent = label;
}

function generateStrongPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let out = "";
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function renderIndustryFilterOptions() {
  const current = el.industryFilter.value;
  const industries = [...new Set(state.startups.map((s) => s.industry).filter(Boolean))].sort();
  clearNode(el.industryFilter);
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All Industries";
  el.industryFilter.appendChild(all);
  for (const ind of industries) {
    const option = document.createElement("option");
    option.value = ind;
    option.textContent = ind;
    el.industryFilter.appendChild(option);
  }
  el.industryFilter.value = current;
}

function filteredStartups() {
  let rows = [...state.startups];
  const selectedIndustry = el.industryFilter.value;
  if (selectedIndustry) rows = rows.filter((s) => s.industry === selectedIndustry);
  if (state.highRiskOnly) rows = rows.filter((s) => Array.isArray(s.risk_flags) && s.risk_flags.length > 0);
  if (state.sortByScore) rows.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
  return rows;
}

function formatInvestment(value) {
  if (value == null || value === "") return "—";
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString("en-US");
}

function openStartupModal(startup) {
  if (!startup) return;
  clearNode(el.viewModalBody);
  const fields = [
    ["Name", startup.name || ""],
    ["Industry", startup.industry || ""],
    ["Stage", startup.stage || ""],
    ["Team Size", startup.team_size ?? ""],
    ["Investment Needed", formatInvestment(startup.investment_needed)],
  ];
  for (const [label, value] of fields) {
    const p = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(String(value)));
    el.viewModalBody.appendChild(p);
  }

  // Scores section with badges
  const scoresDiv = document.createElement("div");
  scoresDiv.style.margin = "0.75rem 0";
  const scoresLabel = document.createElement("strong");
  scoresLabel.textContent = "Scores: ";
  scoresDiv.appendChild(scoresLabel);

  const badgesContainer = document.createElement("span");
  badgesContainer.className = "score-badges";
  badgesContainer.style.display = "inline-flex";
  badgesContainer.style.gap = "6px";
  badgesContainer.style.marginLeft = "4px";

  const scores = [
    { label: "Total", value: startup.total_score ?? 0, cls: "total" },
    { label: "Rule", value: startup.rule_score ?? 0, cls: "rule" },
    { label: "AI", value: startup.ai_score ?? 0, cls: "ai" },
  ];
  for (const s of scores) {
    const badge = document.createElement("span");
    badge.className = `score-badge ${s.cls}`;
    badge.textContent = `${s.label} ${s.value}`;
    badgesContainer.appendChild(badge);
  }
  scoresDiv.appendChild(badgesContainer);
  el.viewModalBody.appendChild(scoresDiv);

  // Risk flags section
  const riskDiv = document.createElement("div");
  riskDiv.style.margin = "0.75rem 0";
  const riskLabel = document.createElement("strong");
  riskLabel.textContent = "Risk Flags: ";
  riskDiv.appendChild(riskLabel);

  const riskFlags = Array.isArray(startup.risk_flags) ? startup.risk_flags : [];
  if (riskFlags.length > 0) {
    const tagsContainer = document.createElement("span");
    tagsContainer.className = "risk-tags";
    tagsContainer.style.display = "inline-flex";
    tagsContainer.style.marginLeft = "4px";
    for (const flag of riskFlags) {
      const tag = document.createElement("span");
      tag.className = "risk-tag";
      tag.textContent = flag;
      tagsContainer.appendChild(tag);
    }
    riskDiv.appendChild(tagsContainer);
  } else {
    const noneSpan = document.createElement("span");
    noneSpan.className = "risk-tag none";
    noneSpan.textContent = "None";
    noneSpan.style.marginLeft = "4px";
    riskDiv.appendChild(noneSpan);
  }
  el.viewModalBody.appendChild(riskDiv);

  // Idea section
  const ideaP = document.createElement("p");
  const ideaStrong = document.createElement("strong");
  ideaStrong.textContent = "Idea: ";
  ideaP.appendChild(ideaStrong);
  ideaP.appendChild(document.createTextNode(startup.idea || ""));
  el.viewModalBody.appendChild(ideaP);

  el.viewModal.classList.remove("hidden");
}

function closeStartupModal() {
  el.viewModal.classList.add("hidden");
}

async function handleDeleteStartup(startupId) {
  const user = getUser();
  if (!user) return;
  const ok = window.confirm("Are you sure you want to delete this startup?");
  if (!ok) return;
  const path = user.role === "admin" ? `/admin/startups/${startupId}` : `/startups/${startupId}`;
  const result = await api(path, { method: "DELETE" });
  if (result) {
    addToast("success", user.role === "admin" ? "Startup deleted by admin" : "Startup deleted");
    await loadStartups();
  }
}

async function handleScoreStartup(startupId, button) {
  setButtonLoading(button, true);
  const result = await api(`/startups/${startupId}/score`, { method: "POST" });
  setButtonLoading(button, false);
  if (result) {
    addToast("success", `Startup scored: total ${result.total_score}`);
    await loadStartups();
  }
}

function renderStartups() {
  clearNode(el.startupsTbody);
  const rows = filteredStartups();
  const user = getUser();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "No startups found";
    td.style.textAlign = "center";
    tr.appendChild(td);
    el.startupsTbody.appendChild(tr);
    return;
  }

  for (const startup of rows) {
    const tr = document.createElement("tr");

    // Name
    const tdName = document.createElement("td");
    tdName.textContent = startup.name || "";
    tr.appendChild(tdName);

    // Industry
    const tdIndustry = document.createElement("td");
    tdIndustry.textContent = startup.industry || "";
    tr.appendChild(tdIndustry);

    // Team Size (centered)
    const tdTeam = document.createElement("td");
    tdTeam.className = "text-center";
    tdTeam.textContent = String(startup.team_size ?? "");
    tr.appendChild(tdTeam);

    // Investment Needed (right-aligned)
    const tdInvestment = document.createElement("td");
    tdInvestment.className = "text-right";
    tdInvestment.textContent = formatInvestment(startup.investment_needed);
    tr.appendChild(tdInvestment);

    // Scores as color-coded badges
    const tdScores = document.createElement("td");
    const badgesDiv = document.createElement("div");
    badgesDiv.className = "score-badges";

    const totalBadge = document.createElement("span");
    totalBadge.className = "score-badge total";
    totalBadge.textContent = `Total ${startup.total_score || 0}`;
    badgesDiv.appendChild(totalBadge);

    const ruleBadge = document.createElement("span");
    ruleBadge.className = "score-badge rule";
    ruleBadge.textContent = `Rule ${startup.rule_score || 0}`;
    badgesDiv.appendChild(ruleBadge);

    const aiBadge = document.createElement("span");
    aiBadge.className = "score-badge ai";
    aiBadge.textContent = `AI ${startup.ai_score || 0}`;
    badgesDiv.appendChild(aiBadge);

    tdScores.appendChild(badgesDiv);
    tr.appendChild(tdScores);

    // Risk Flags as tag pills
    const tdRisk = document.createElement("td");
    const riskFlags = Array.isArray(startup.risk_flags) ? startup.risk_flags : [];
    if (riskFlags.length > 0) {
      const tagsDiv = document.createElement("div");
      tagsDiv.className = "risk-tags";
      for (const flag of riskFlags) {
        const tag = document.createElement("span");
        tag.className = "risk-tag";
        tag.textContent = flag;
        tagsDiv.appendChild(tag);
      }
      tdRisk.appendChild(tagsDiv);
    } else {
      const noneTag = document.createElement("span");
      noneTag.className = "risk-tag none";
      noneTag.textContent = "—";
      tdRisk.appendChild(noneTag);
    }
    tr.appendChild(tdRisk);

    // Stage (centered)
    const tdStage = document.createElement("td");
    tdStage.className = "text-center";
    tdStage.textContent = startup.stage || "";
    tr.appendChild(tdStage);

    // Actions
    const tdActions = document.createElement("td");
    tdActions.className = "table-actions";

    const viewBtn = document.createElement("button");
    viewBtn.className = "btn btn-sm btn-secondary";
    viewBtn.type = "button";
    viewBtn.textContent = "View";
    viewBtn.addEventListener("click", () => openStartupModal(startup));
    tdActions.appendChild(viewBtn);

    if (user && (user.role === "admin" || (user.role === "startup" && startup.user_id === user.id))) {
      const scoreBtn = document.createElement("button");
      scoreBtn.className = "btn btn-sm btn-primary";
      scoreBtn.type = "button";
      scoreBtn.textContent = "Score";
      scoreBtn.addEventListener("click", () => handleScoreStartup(startup.id, scoreBtn));
      tdActions.appendChild(scoreBtn);
    }

    if (user && (user.role === "admin" || (user.role === "startup" && startup.user_id === user.id))) {
      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-sm btn-danger";
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => handleDeleteStartup(startup.id));
      tdActions.appendChild(delBtn);
    }

    tr.appendChild(tdActions);
    el.startupsTbody.appendChild(tr);
  }
}

async function loadStartups() {
  el.startupSkeleton.classList.remove("hidden");
  const data = await api("/startups");
  el.startupSkeleton.classList.add("hidden");
  if (!data) return;
  state.startups = Array.isArray(data) ? data : [];
  renderIndustryFilterOptions();
  renderStartups();
}

function renderKpi(data) {
  el.kpiTotal.textContent = String(data.total_startups || 0);
  el.kpiAvg.textContent = String(data.avg_total_score || 0);
  const d = data.score_distribution || {};
  el.kpiDist.textContent = `0-39: ${d["0_39"] || 0} | 40-59: ${d["40_59"] || 0} | 60-79: ${d["60_79"] || 0} | 80-100: ${d["80_100"] || 0}`;

  clearNode(el.topIndustriesList);
  for (const item of data.top_industries || []) {
    const li = document.createElement("li");
    li.textContent = `${item.industry}: ${item.count}`;
    el.topIndustriesList.appendChild(li);
  }

  clearNode(el.recentActivityList);
  for (const item of data.recent_activity || []) {
    const li = document.createElement("li");
    li.textContent = `${item.created_at || "-"} | user:${item.user_id ?? "-"} | ${item.action || ""}`;
    el.recentActivityList.appendChild(li);
  }
}

async function loadKpi() {
  const data = await api("/admin/kpi");
  if (data) renderKpi(data);
}

function renderUsers() {
  clearNode(el.usersList);
  if (!state.users.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No users found";
    el.usersList.appendChild(p);
    return;
  }

  const current = getUser();
  for (const u of state.users) {
    const item = document.createElement("div");
    item.className = "card";

    const p1 = document.createElement("p");
    p1.textContent = `#${u.id} ${u.email}`;
    item.appendChild(p1);

    const p2 = document.createElement("p");
    p2.className = "muted";
    p2.textContent = `role: ${u.role} | startups: ${u.startups_count || 0} | created: ${u.created_at || "-"}`;
    item.appendChild(p2);

    if (current && current.id !== u.id) {
      const del = document.createElement("button");
      del.className = "btn btn-sm btn-danger";
      del.type = "button";
      del.textContent = "Delete user";
      del.addEventListener("click", async () => {
        const ok = window.confirm("Delete this user and their startups?");
        if (!ok) return;
        const res = await api(`/admin/users/${u.id}`, { method: "DELETE" });
        if (res) {
          addToast("success", "User deleted");
          await loadUsers();
        }
      });
      item.appendChild(del);
    }

    el.usersList.appendChild(item);
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

async function handleChangePassword(event) {
  event.preventDefault();
  const current_password = document.getElementById("currentPassword").value;
  const new_password = document.getElementById("newPassword").value;
  const confirm_password = document.getElementById("confirmPassword").value;
  if (!current_password || !new_password || !confirm_password) {
    addToast("error", "All password fields are required");
    return;
  }
  if (new_password.length < 8) {
    addToast("error", "New password must be at least 8 characters");
    return;
  }
  setButtonLoading(el.changePasswordSubmitBtn, true);
  const res = await api("/admin/change-password", {
    method: "POST",
    body: { current_password, new_password, confirm_password },
  });
  setButtonLoading(el.changePasswordSubmitBtn, false);
  if (res) {
    addToast("success", "Password updated");
    el.changePasswordForm.reset();
  }
}

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
  el.createStartupCard.classList.toggle("hidden", user.role !== "startup" && !isAdmin);

  showTab("startups");
  loadStartups();
}

el.showLoginBtn.addEventListener("click", () => toggleAuth("login"));
el.showRegisterBtn.addEventListener("click", () => toggleAuth("register"));

el.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setButtonLoading(el.loginSubmitBtn, true);
  const res = await api("/login", {
    method: "POST",
    auth: false,
    body: {
      email: document.getElementById("loginEmail").value.trim(),
      password: document.getElementById("loginPassword").value,
    },
  });
  setButtonLoading(el.loginSubmitBtn, false);
  if (!res) return;
  localStorage.setItem("token", res.access_token);
  localStorage.setItem("user", JSON.stringify(res.user));
  addToast("success", "Login successful");
  renderApp();
});

el.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.getElementById("registerPassword").value;
  if (isWeakPassword(password)) {
    addToast("error", "Please choose a stronger password");
    return;
  }
  setButtonLoading(el.registerSubmitBtn, true);
  const res = await api("/register", {
    method: "POST",
    auth: false,
    body: {
      name: document.getElementById("registerName").value.trim(),
      email: document.getElementById("registerEmail").value.trim(),
      password,
      role: document.getElementById("registerRole").value,
    },
  });
  setButtonLoading(el.registerSubmitBtn, false);
  if (!res) return;
  el.registerForm.reset();
  addToast("success", "Registration successful. Please login.");
  toggleAuth("login");
  updatePasswordStrengthUI("");
});

el.logoutBtn.addEventListener("click", () => logout(true));

el.refreshBtn.addEventListener("click", () => {
  if (state.currentTab === "startups") loadStartups();
  if (state.currentTab === "kpi") loadKpi();
  if (state.currentTab === "users") loadUsers();
});

el.startupsTabBtn.addEventListener("click", () => showTab("startups"));
el.kpiTabBtn.addEventListener("click", () => showTab("kpi"));
el.usersTabBtn.addEventListener("click", () => showTab("users"));
el.securityTabBtn.addEventListener("click", () => showTab("security"));

el.industryFilter.addEventListener("change", renderStartups);

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

el.createStartupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setButtonLoading(el.createStartupSubmitBtn, true);
  const res = await api("/startups", {
    method: "POST",
    body: {
      name: document.getElementById("startupName").value.trim(),
      idea: document.getElementById("startupIdea").value.trim(),
      industry: document.getElementById("startupIndustry").value.trim(),
      team_size: Number(document.getElementById("startupTeamSize").value),
      investment_needed: Number(document.getElementById("startupInvestment").value),
      stage: document.getElementById("startupStage").value,
    },
  });
  setButtonLoading(el.createStartupSubmitBtn, false);
  if (!res) return;
  addToast("success", "Startup created");
  el.createStartupForm.reset();
  loadStartups();
});

if (el.viewModalClose) el.viewModalClose.addEventListener("click", closeStartupModal);
if (el.viewModal) {
  el.viewModal.addEventListener("click", (event) => {
    if (event.target === el.viewModal) closeStartupModal();
  });
}

if (el.changePasswordForm) el.changePasswordForm.addEventListener("submit", handleChangePassword);
if (el.registerPassword) {
  el.registerPassword.addEventListener("input", (e) => updatePasswordStrengthUI(e.target.value));
  updatePasswordStrengthUI("");
}
if (el.generatePasswordBtn) {
  el.generatePasswordBtn.addEventListener("click", () => {
    const pwd = generateStrongPassword();
    el.registerPassword.value = pwd;
    updatePasswordStrengthUI(pwd);
    addToast("info", "Generated strong password");
  });
}

renderApp();