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
  startupCards: document.getElementById("startupCards"),
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
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  el.toastRoot.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 3500);
}

function setButtonLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.classList.toggle("loading", loading);
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

    if (res.status === 401 && auth) {
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
  while (node.firstChild) node.removeChild(node.firstChild);
}

function evaluatePassword(password) {
  const value = String(password || "");
  return {
    length: value.length >= 8,
    upper: /[A-Z]/.test(value),
    lower: /[a-z]/.test(value),
    number: /\d/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value),
    notWeak: !["password", "12345678", "qwerty123", "admin123", "11111111"].includes(value.toLowerCase()),
  };
}

function updatePasswordStrengthUI(password) {
  const checks = evaluatePassword(password);
  const passed = Object.values(checks).filter(Boolean).length;
  const items = el.passwordChecklist.querySelectorAll("li");
  items.forEach((item) => {
    const key = item.getAttribute("data-check");
    item.style.color = checks[key] ? "#27ae60" : "#95a5a6";
  });
  el.passwordStrengthLabel.textContent = passed >= 6 ? "Strength: Strong" : passed >= 4 ? "Strength: Medium" : "Strength: Weak";
}

function generateStrongPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let out = "";
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function renderIndustryFilterOptions() {
  const current = el.industryFilter.value;
  const options = [...new Set(state.startups.map((s) => s.industry).filter(Boolean))].sort();
  clearNode(el.industryFilter);
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All Industries";
  el.industryFilter.appendChild(all);
  for (const ind of options) {
    const option = document.createElement("option");
    option.value = ind;
    option.textContent = ind;
    el.industryFilter.appendChild(option);
  }
  el.industryFilter.value = current;
}

function filteredStartups() {
  let rows = [...state.startups];
  const industry = el.industryFilter.value;
  if (industry) rows = rows.filter((s) => s.industry === industry);
  if (state.highRiskOnly) rows = rows.filter((s) => Array.isArray(s.risk_flags) && s.risk_flags.length > 0);
  if (state.sortByScore) rows.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
  return rows;
}

function renderStartups() {
  clearNode(el.startupsTbody);
  clearNode(el.startupCards);
  const rows = filteredStartups();
  const user = getUser();
  const isAdmin = user && user.role === "admin";

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 9;
    td.textContent = "No startups found";
    td.style.textAlign = "center";
    tr.appendChild(td);
    el.startupsTbody.appendChild(tr);
    return;
  }

  for (const startup of rows) {
    const tr = document.createElement("tr");
    const cols = [
      startup.name || "",
      startup.industry || "",
      String(startup.team_size ?? ""),
      Number(startup.investment_needed || 0).toLocaleString("en-US"),
      `T:${startup.total_score || 0} R:${startup.rule_score || 0} AI:${startup.ai_score || 0}`,
      (startup.risk_flags || []).join(", ") || "-",
      startup.stage || "",
      [startup.contact_name, startup.contact_email, startup.contact_phone].filter(Boolean).join(" | ") || "-",
    ];
    for (const value of cols) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    }

    const isOwner = Boolean(user && startup.user_id === user.id);
    const canDelete = Boolean(isAdmin || isOwner);
    const canScore = Boolean(user && user.role === "startup" && isOwner);

    const actionTd = document.createElement("td");
    actionTd.className = "text-center";
    const actionWrap = document.createElement("div");
    actionWrap.className = "table-actions";

    const viewBtn = document.createElement("button");
    viewBtn.className = "btn btn-secondary btn-sm";
    viewBtn.type = "button";
    viewBtn.textContent = "View";
    viewBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openStartupModal(startup);
    });
    actionWrap.appendChild(viewBtn);

    if (canScore) {
      const scoreBtn = document.createElement("button");
      scoreBtn.className = "btn btn-primary btn-sm";
      scoreBtn.type = "button";
      scoreBtn.textContent = "Score";
      scoreBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        setButtonLoading(scoreBtn, true);
        const scored = await api(`/startups/${startup.id}/score`, { method: "POST" });
        setButtonLoading(scoreBtn, false);
        if (scored) {
          addToast("success", `Startup #${startup.id} scored`);
          await loadStartups();
        }
      });
      actionWrap.appendChild(scoreBtn);
    }

    if (canDelete) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-danger btn-sm";
      deleteBtn.type = "button";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!window.confirm(`Delete startup #${startup.id}?`)) return;
        setButtonLoading(deleteBtn, true);
        const endpoint = isAdmin ? `/admin/startups/${startup.id}` : `/startups/${startup.id}`;
        const deleted = await api(endpoint, { method: "DELETE" });
        setButtonLoading(deleteBtn, false);
        if (deleted) {
          addToast("success", `Startup #${startup.id} deleted`);
          await loadStartups();
        }
      });
      actionWrap.appendChild(deleteBtn);
    }

    actionTd.appendChild(actionWrap);
    tr.appendChild(actionTd);

    tr.addEventListener("click", () => openStartupModal(startup));
    el.startupsTbody.appendChild(tr);

    const card = document.createElement("div");
    card.className = "card";
    const title = document.createElement("h4");
    title.textContent = startup.name || "Startup";
    card.appendChild(title);
    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = `${startup.industry || "-"} | ${startup.stage || "-"} | Team ${startup.team_size ?? "-"}`;
    card.appendChild(meta);
    const score = document.createElement("p");
    score.textContent = `Total ${startup.total_score || 0} | Rule ${startup.rule_score || 0} | AI ${startup.ai_score || 0}`;
    card.appendChild(score);
    const isOwnerCard = Boolean(user && startup.user_id === user.id);
    const canDeleteCard = Boolean(isAdmin || isOwnerCard);
    const canScoreCard = Boolean(user && user.role === "startup" && isOwnerCard);

    const cardViewBtn = document.createElement("button");
    cardViewBtn.className = "btn btn-secondary btn-sm";
    cardViewBtn.textContent = "View";
    cardViewBtn.type = "button";
    cardViewBtn.addEventListener("click", () => openStartupModal(startup));
    card.appendChild(cardViewBtn);

    if (canScoreCard) {
      const scoreBtn = document.createElement("button");
      scoreBtn.className = "btn btn-primary btn-sm";
      scoreBtn.textContent = "Score";
      scoreBtn.type = "button";
      scoreBtn.addEventListener("click", async () => {
        setButtonLoading(scoreBtn, true);
        const scored = await api(`/startups/${startup.id}/score`, { method: "POST" });
        setButtonLoading(scoreBtn, false);
        if (scored) {
          addToast("success", `Startup #${startup.id} scored`);
          await loadStartups();
        }
      });
      card.appendChild(scoreBtn);
    }

    if (canDeleteCard) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-danger btn-sm";
      deleteBtn.textContent = "Delete";
      deleteBtn.type = "button";
      deleteBtn.addEventListener("click", async () => {
        if (!window.confirm(`Delete startup #${startup.id}?`)) return;
        setButtonLoading(deleteBtn, true);
        const endpoint = isAdmin ? `/admin/startups/${startup.id}` : `/startups/${startup.id}`;
        const deleted = await api(endpoint, { method: "DELETE" });
        setButtonLoading(deleteBtn, false);
        if (deleted) {
          addToast("success", `Startup #${startup.id} deleted`);
          await loadStartups();
        }
      });
      card.appendChild(deleteBtn);
    }

    el.startupCards.appendChild(card);
  }
}

function openStartupModal(startup) {
  clearNode(el.viewModalBody);
  const fields = [
    ["Name", startup.name || ""],
    ["Industry", startup.industry || ""],
    ["Idea", startup.idea || ""],
    ["Team Size", startup.team_size ?? ""],
    ["Investment Needed", startup.investment_needed ?? ""],
    ["Stage", startup.stage || ""],
    ["Contact Name", startup.contact_name || ""],
    ["Contact Email", startup.contact_email || ""],
    ["Contact Phone", startup.contact_phone || ""],
  ];
  for (const [label, value] of fields) {
    const p = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(String(value || "-")));
    el.viewModalBody.appendChild(p);
  }
  el.viewModal.classList.remove("hidden");
}

function closeStartupModal() {
  el.viewModal.classList.add("hidden");
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
  (data.top_industries || []).forEach((i) => {
    const li = document.createElement("li");
    li.textContent = `${i.industry}: ${i.count}`;
    el.topIndustriesList.appendChild(li);
  });
  clearNode(el.recentActivityList);
  (data.recent_activity || []).forEach((a) => {
    const li = document.createElement("li");
    li.textContent = `${a.created_at || "-"} | user:${a.user_id ?? "-"} | ${a.action || ""}`;
    el.recentActivityList.appendChild(li);
  });
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
    const row = document.createElement("div");
    row.className = "card";
    const p = document.createElement("p");
    p.textContent = `#${u.id} ${u.email} | ${u.role} | startups:${u.startups_count || 0}`;
    row.appendChild(p);
    if (current && u.id !== current.id) {
      const btn = document.createElement("button");
      btn.className = "btn btn-sm btn-danger";
      btn.textContent = "Delete";
      btn.type = "button";
      btn.addEventListener("click", async () => {
        if (!window.confirm("Delete this user and their startups?")) return;
        const res = await api(`/admin/users/${u.id}`, { method: "DELETE" });
        if (res) {
          addToast("success", "User deleted");
          await loadUsers();
        }
      });
      row.appendChild(btn);
    }
    el.usersList.appendChild(row);
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

async function handleLoginSubmit(event) {
  event.preventDefault();
  setButtonLoading(el.loginSubmitBtn, true);
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const start = await api("/login", {
    method: "POST",
    auth: false,
    body: { email, password },
  });
  setButtonLoading(el.loginSubmitBtn, false);
  if (!start) return;

  if (start.access_token) {
    localStorage.setItem("token", start.access_token);
    localStorage.setItem("user", JSON.stringify(start.user));
    addToast("success", "Login successful");
    renderApp();
    return;
  }

  addToast("error", "Unexpected login response");
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
  el.createStartupCard.classList.toggle("hidden", user.role !== "startup");
  showTab("startups");
  loadStartups();
}

el.showLoginBtn.addEventListener("click", () => toggleAuth("login"));
el.showRegisterBtn.addEventListener("click", () => toggleAuth("register"));
el.loginForm.addEventListener("submit", handleLoginSubmit);

el.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setButtonLoading(el.registerSubmitBtn, true);
  const res = await api("/register", {
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
  if (!res) return;
  el.registerForm.reset();
  updatePasswordStrengthUI("");
  addToast("success", "Registration successful. Please login.");
  toggleAuth("login");
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
      contact_name: document.getElementById("startupContactName").value.trim(),
      contact_email: document.getElementById("startupContactEmail").value.trim(),
      contact_phone: document.getElementById("startupContactPhone").value.trim(),
    },
  });
  setButtonLoading(el.createStartupSubmitBtn, false);
  if (res) {
    addToast("success", "Startup created");
    el.createStartupForm.reset();
    await loadStartups();
  }
});

el.changePasswordForm.addEventListener("submit", handleChangePassword);
el.registerPassword.addEventListener("input", (e) => updatePasswordStrengthUI(e.target.value));
el.generatePasswordBtn.addEventListener("click", () => {
  const pwd = generateStrongPassword();
  el.registerPassword.value = pwd;
  updatePasswordStrengthUI(pwd);
  addToast("info", "Generated strong password");
});
el.viewModalClose.addEventListener("click", closeStartupModal);
window.addEventListener("click", (event) => {
  if (event.target === el.viewModal) closeStartupModal();
});

renderApp();
