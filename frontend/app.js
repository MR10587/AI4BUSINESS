const API_BASE = "http://127.0.0.1:5000";

const state = {
  startups: [],
  sortByScore: false,
  highRiskOnly: false,
  startupsLoading: false,
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
  refreshBtn: document.getElementById("refreshBtn"),
  startupsPanel: document.getElementById("startupsPanel"),
  kpiPanel: document.getElementById("kpiPanel"),
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
  kpiTotal: document.getElementById("kpiTotal"),
  kpiAvg: document.getElementById("kpiAvg"),
  kpiDist: document.getElementById("kpiDist"),
  topIndustriesList: document.getElementById("topIndustriesList"),
  recentActivityList: document.getElementById("recentActivityList"),
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

    if (!res.ok) {
      const msg = data.error || data.msg || `Request failed (${res.status})`;
      addToast("error", msg);
      if (res.status === 401) logout(false);
      return null;
    }

    return data;
  } catch {
    addToast("error", "Network error");
    return null;
  }
}

function toggleAuth(mode) {
  const isLogin = mode === "login";
  el.loginForm.classList.toggle("hidden", !isLogin);
  el.registerForm.classList.toggle("hidden", isLogin);
  el.showLoginBtn.classList.toggle("active", isLogin);
  el.showRegisterBtn.classList.toggle("active", !isLogin);
}

function showTab(tab) {
  const kpi = tab === "kpi";
  el.startupsPanel.classList.toggle("hidden", kpi);
  el.kpiPanel.classList.toggle("hidden", !kpi);
  el.startupsTabBtn.classList.toggle("active", !kpi);
  el.kpiTabBtn.classList.toggle("active", kpi);
}

function startupCanScore(startup, user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "startup") {
    if (typeof startup.user_id === "number") return startup.user_id === user.id;
    return true;
  }
  return false;
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function scoreClass(score) {
  const n = Number(score || 0);
  if (n >= 80) return "badge-success";
  if (n >= 50) return "badge-mid";
  return "badge-low";
}

function createBadge(cls, text) {
  const span = document.createElement("span");
  span.className = `badge ${cls}`;
  span.textContent = text;
  return span;
}

function filteredStartups() {
  const filterText = el.industryFilter.value.trim().toLowerCase();
  let rows = [...state.startups];

  if (filterText) {
    rows = rows.filter((s) => String(s.industry || "").toLowerCase().includes(filterText));
  }

  if (state.highRiskOnly) {
    rows = rows.filter((s) => Array.isArray(s.risk_flags) && s.risk_flags.length > 0);
  }

  if (state.sortByScore) {
    rows.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
  }

  return rows;
}

function renderScoreArea(startup) {
  const wrap = document.createElement("div");
  wrap.appendChild(createBadge(`badge-total ${scoreClass(startup.total_score)}`, `Total ${startup.total_score ?? 0}`));
  wrap.appendChild(createBadge("badge-rule", `Rule ${startup.rule_score ?? 0}`));
  wrap.appendChild(createBadge("badge-ai", `AI ${startup.ai_score ?? 0}`));
  return wrap;
}

function renderRiskArea(startup) {
  const wrap = document.createElement("div");
  const flags = Array.isArray(startup.risk_flags) ? startup.risk_flags : [];
  if (!flags.length) {
    wrap.appendChild(createBadge("badge-low", "No flags"));
    return wrap;
  }
  for (const f of flags) {
    wrap.appendChild(createBadge("badge-risk", String(f)));
  }
  return wrap;
}

function showStartupDetail(startup) {
  if (!startup) return;
  el.startupDetailCard.classList.remove("hidden");
  el.detailTitle.textContent = `${startup.name || "Unnamed Startup"} (#${startup.id})`;
  el.detailMeta.textContent = `${startup.industry || "-"} | ${startup.stage || "-"} | team ${startup.team_size ?? "-"}`;
  el.detailIdea.textContent = startup.idea || "-";
}

async function handleScoreClick(startupId, button) {
  setButtonLoading(button, true);
  const scored = await api(`/startups/${startupId}/score`, { method: "POST" });
  setButtonLoading(button, false);
  if (!scored) return;

  const breakdown = scored.ai_breakdown || {};
  addToast(
    "success",
    `Scored #${startupId}: AI ${scored.ai_score} (C:${breakdown.clarity ?? "-"}, F:${breakdown.feasibility ?? "-"}, D:${breakdown.differentiation ?? "-"}, M:${breakdown.market_logic ?? "-"})`
  );
  await loadStartups();
}

function renderStartups() {
  clearNode(el.startupsTbody);
  clearNode(el.startupCards);

  if (state.startupsLoading) return;

  const user = getUser();
  const rows = filteredStartups();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 10;
    td.textContent = "No startups found.";
    tr.appendChild(td);
    el.startupsTbody.appendChild(tr);
  }

  for (const startup of rows) {
    const tr = document.createElement("tr");
    const fields = [
      startup.id,
      startup.name,
      startup.industry,
      startup.stage,
      startup.team_size,
      startup.investment_needed,
    ];

    for (const value of fields) {
      const td = document.createElement("td");
      td.textContent = value == null ? "" : String(value);
      tr.appendChild(td);
    }

    const tdScores = document.createElement("td");
    tdScores.appendChild(renderScoreArea(startup));
    tr.appendChild(tdScores);

    const tdRisk = document.createElement("td");
    tdRisk.appendChild(renderRiskArea(startup));
    tr.appendChild(tdRisk);

    const tdCreated = document.createElement("td");
    tdCreated.textContent = startup.created_at || "";
    tr.appendChild(tdCreated);

    const actionTd = document.createElement("td");
    if (startupCanScore(startup, user)) {
      const btn = document.createElement("button");
      btn.className = "btn btn-secondary";
      btn.type = "button";
      btn.textContent = "Score";
      btn.addEventListener("click", () => handleScoreClick(startup.id, btn));
      actionTd.appendChild(btn);
    } else {
      actionTd.textContent = "-";
    }
    tr.appendChild(actionTd);
    tr.classList.add("row-clickable");
    tr.addEventListener("click", (event) => {
      if (event.target.tagName === "BUTTON") return;
      showStartupDetail(startup);
    });
    el.startupsTbody.appendChild(tr);

    const card = document.createElement("article");
    card.className = "startup-card";
    card.addEventListener("click", () => showStartupDetail(startup));

    const title = document.createElement("h4");
    title.textContent = `#${startup.id} ${startup.name || "Unnamed Startup"}`;
    card.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "startup-meta";
    meta.textContent = `${startup.industry || "-"} | ${startup.stage || "-"} | team ${startup.team_size ?? "-"} | created ${startup.created_at || "-"}`;
    card.appendChild(meta);

    const row1 = document.createElement("div");
    row1.className = "startup-row";
    row1.textContent = `Investment: ${startup.investment_needed ?? 0}`;
    card.appendChild(row1);

    card.appendChild(renderScoreArea(startup));
    card.appendChild(renderRiskArea(startup));

    if (startupCanScore(startup, user)) {
      const scoreBtn = document.createElement("button");
      scoreBtn.className = "btn btn-primary";
      scoreBtn.type = "button";
      scoreBtn.style.marginTop = "12px";
      scoreBtn.textContent = "Score";
      scoreBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        handleScoreClick(startup.id, scoreBtn);
      });
      card.appendChild(scoreBtn);
    }

    el.startupCards.appendChild(card);
  }
}

function renderKpi(data) {
  el.kpiTotal.textContent = String(data.total_startups ?? 0);
  el.kpiAvg.textContent = String(data.avg_total_score ?? 0);
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

async function loadStartups() {
  setStartupsLoading(true);
  renderStartups();
  const data = await api("/startups");
  setStartupsLoading(false);
  if (!data) return;
  state.startups = Array.isArray(data) ? data : [];
  renderStartups();
}

async function loadKpi() {
  const data = await api("/admin/kpi");
  if (!data) return;
  renderKpi(data);
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

  el.registerForm.reset();
  toggleAuth("login");
  addToast("success", "Registration successful. Please login.");
});

el.logoutBtn.addEventListener("click", () => logout(true));

el.startupsTabBtn.addEventListener("click", () => {
  showTab("startups");
});

el.kpiTabBtn.addEventListener("click", async () => {
  showTab("kpi");
  await loadKpi();
});

el.refreshBtn.addEventListener("click", async () => {
  setButtonLoading(el.refreshBtn, true);
  await loadStartups();
  if (!el.kpiPanel.classList.contains("hidden")) await loadKpi();
  setButtonLoading(el.refreshBtn, false);
  addToast("info", "Data refreshed");
});

el.createStartupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setButtonLoading(el.createStartupSubmitBtn, true);
  const data = await api("/startups", {
    method: "POST",
    body: {
      name: document.getElementById("startupName").value.trim(),
      idea: document.getElementById("idea").value.trim(),
      industry: document.getElementById("industry").value.trim(),
      team_size: Number(document.getElementById("teamSize").value),
      investment_needed: Number(document.getElementById("investmentNeeded").value),
      stage: document.getElementById("stage").value,
    },
  });
  setButtonLoading(el.createStartupSubmitBtn, false);
  if (!data) return;

  el.createStartupForm.reset();
  addToast("success", "Startup created");
  await loadStartups();
});

el.industryFilter.addEventListener("input", renderStartups);

el.sortScoreBtn.addEventListener("click", () => {
  state.sortByScore = !state.sortByScore;
  el.sortScoreBtn.textContent = `Sort total score: ${state.sortByScore ? "ON" : "OFF"}`;
  renderStartups();
});

el.riskFilterBtn.addEventListener("click", () => {
  state.highRiskOnly = !state.highRiskOnly;
  el.riskFilterBtn.textContent = `High risk only: ${state.highRiskOnly ? "ON" : "OFF"}`;
  renderStartups();
});

renderApp();
