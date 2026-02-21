const API_BASE = "http://127.0.0.1:5000";

const state = {
  startups: [],
  sortByScore: false,
};

const el = {
  messages: document.getElementById("messages"),
  loading: document.getElementById("loading"),
  authSection: document.getElementById("authSection"),
  dashboardSection: document.getElementById("dashboardSection"),
  showLoginBtn: document.getElementById("showLoginBtn"),
  showRegisterBtn: document.getElementById("showRegisterBtn"),
  loginForm: document.getElementById("loginForm"),
  registerForm: document.getElementById("registerForm"),
  currentUser: document.getElementById("currentUser"),
  startupsTabBtn: document.getElementById("startupsTabBtn"),
  kpiTabBtn: document.getElementById("kpiTabBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  startupsSection: document.getElementById("startupsSection"),
  kpiSection: document.getElementById("kpiSection"),
  createStartupForm: document.getElementById("createStartupForm"),
  industryFilter: document.getElementById("industryFilter"),
  sortScoreBtn: document.getElementById("sortScoreBtn"),
  startupsTbody: document.getElementById("startupsTbody"),
  kpiContent: document.getElementById("kpiContent"),
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

function setMessage(text, kind = "error") {
  el.messages.textContent = text || "";
  el.messages.className = `messages ${text ? kind : ""}`.trim();
}

function setLoading(isLoading) {
  el.loading.classList.toggle("hidden", !isLoading);
}

function logout(showMsg = true) {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  state.startups = [];
  renderApp();
  if (showMsg) setMessage("Logged out", "success");
}

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;

  setLoading(true);
  try {
    const res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      const msg = data && (data.error || data.msg) ? (data.error || data.msg) : `Request failed (${res.status})`;
      setMessage(msg, "error");
      if (res.status === 401) logout(false);
      return null;
    }

    return data;
  } catch {
    setMessage("Network error", "error");
    return null;
  } finally {
    setLoading(false);
  }
}

function toggleAuth(mode) {
  const loginMode = mode === "login";
  el.loginForm.classList.toggle("hidden", !loginMode);
  el.registerForm.classList.toggle("hidden", loginMode);
  el.showLoginBtn.classList.toggle("active", loginMode);
  el.showRegisterBtn.classList.toggle("active", !loginMode);
}

function showTab(tab) {
  const isKpi = tab === "kpi";
  el.startupsSection.classList.toggle("hidden", isKpi);
  el.kpiSection.classList.toggle("hidden", !isKpi);
  el.startupsTabBtn.classList.toggle("active", !isKpi);
  el.kpiTabBtn.classList.toggle("active", isKpi);
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

function textCell(row, value) {
  const td = document.createElement("td");
  td.textContent = value == null ? "" : String(value);
  row.appendChild(td);
  return td;
}

function renderStartups() {
  const user = getUser();
  clearNode(el.startupsTbody);

  let rows = [...state.startups];
  const filterText = el.industryFilter.value.trim().toLowerCase();
  if (filterText) {
    rows = rows.filter((s) => String(s.industry || "").toLowerCase().includes(filterText));
  }

  if (state.sortByScore) {
    rows.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
  }

  for (const startup of rows) {
    const tr = document.createElement("tr");
    textCell(tr, startup.id);
    textCell(tr, startup.industry);
    textCell(tr, startup.stage);
    textCell(tr, startup.team_size);
    textCell(tr, startup.investment_needed);
    textCell(tr, startup.total_score);
    textCell(tr, startup.rule_score);
    textCell(tr, startup.ai_score);
    textCell(tr, Array.isArray(startup.risk_flags) ? startup.risk_flags.join(", ") : "");
    textCell(tr, startup.created_at);

    const actionTd = document.createElement("td");
    if (startupCanScore(startup, user)) {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.type = "button";
      btn.textContent = "Score";
      btn.addEventListener("click", async () => {
        const scored = await api(`/startups/${startup.id}/score`, { method: "POST" });
        if (scored) {
          setMessage(`Startup ${startup.id} scored`, "success");
          await loadStartups();
        }
      });
      actionTd.appendChild(btn);
    }
    tr.appendChild(actionTd);

    el.startupsTbody.appendChild(tr);
  }
}

function renderKpi(kpi) {
  clearNode(el.kpiContent);
  if (!kpi) return;

  const stats = document.createElement("div");
  stats.className = "small";
  stats.textContent = `total_startups: ${kpi.total_startups} | avg_total_score: ${kpi.avg_total_score}`;
  el.kpiContent.appendChild(stats);

  const topTitle = document.createElement("h3");
  topTitle.textContent = "Top industries";
  el.kpiContent.appendChild(topTitle);
  const topList = document.createElement("ul");
  topList.className = "list";
  for (const item of kpi.top_industries || []) {
    const li = document.createElement("li");
    li.textContent = `${item.industry}: ${item.count}`;
    topList.appendChild(li);
  }
  el.kpiContent.appendChild(topList);

  const distTitle = document.createElement("h3");
  distTitle.textContent = "Score distribution";
  el.kpiContent.appendChild(distTitle);
  const dist = document.createElement("div");
  const d = kpi.score_distribution || {};
  dist.textContent = `0_39=${d["0_39"] || 0}, 40_59=${d["40_59"] || 0}, 60_79=${d["60_79"] || 0}, 80_100=${d["80_100"] || 0}`;
  el.kpiContent.appendChild(dist);

  const activityTitle = document.createElement("h3");
  activityTitle.textContent = "Recent activity";
  el.kpiContent.appendChild(activityTitle);
  const activity = document.createElement("ul");
  activity.className = "list";
  for (const row of kpi.recent_activity || []) {
    const li = document.createElement("li");
    li.textContent = `${row.created_at} | user:${row.user_id} | ${row.action}`;
    activity.appendChild(li);
  }
  el.kpiContent.appendChild(activity);
}

async function loadStartups() {
  const data = await api("/startups");
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

  el.authSection.classList.toggle("hidden", loggedIn);
  el.dashboardSection.classList.toggle("hidden", !loggedIn);

  if (!loggedIn) {
    toggleAuth("login");
    showTab("startups");
    return;
  }

  el.currentUser.textContent = `${user.email} (${user.role})`;
  el.createStartupForm.classList.toggle("hidden", user.role !== "startup");
  el.kpiTabBtn.classList.toggle("hidden", user.role !== "admin");

  showTab("startups");
  loadStartups();
}

el.showLoginBtn.addEventListener("click", () => toggleAuth("login"));
el.showRegisterBtn.addEventListener("click", () => toggleAuth("register"));

el.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMessage("");
  const data = await api("/login", {
    method: "POST",
    auth: false,
    body: {
      email: document.getElementById("loginEmail").value.trim(),
      password: document.getElementById("loginPassword").value,
    },
  });
  if (!data) return;

  localStorage.setItem("token", data.access_token);
  localStorage.setItem("user", JSON.stringify(data.user));
  setMessage("Login successful", "success");
  renderApp();
});

el.registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMessage("");
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
  if (!data) return;

  setMessage("Registration successful. Please login.", "success");
  el.registerForm.reset();
  toggleAuth("login");
});

el.logoutBtn.addEventListener("click", () => logout(true));

el.refreshBtn.addEventListener("click", async () => {
  setMessage("");
  await loadStartups();
  if (!el.kpiSection.classList.contains("hidden")) await loadKpi();
});

el.startupsTabBtn.addEventListener("click", () => showTab("startups"));
el.kpiTabBtn.addEventListener("click", async () => {
  showTab("kpi");
  await loadKpi();
});

el.createStartupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = await api("/startups", {
    method: "POST",
    body: {
      idea: document.getElementById("idea").value.trim(),
      industry: document.getElementById("industry").value.trim(),
      team_size: Number(document.getElementById("teamSize").value),
      investment_needed: Number(document.getElementById("investmentNeeded").value),
      market_impact: Number(document.getElementById("marketImpact").value),
      stage: document.getElementById("stage").value,
    },
  });
  if (!data) return;

  setMessage("Startup created", "success");
  el.createStartupForm.reset();
  await loadStartups();
});

el.industryFilter.addEventListener("input", renderStartups);

el.sortScoreBtn.addEventListener("click", () => {
  state.sortByScore = !state.sortByScore;
  el.sortScoreBtn.textContent = `Sort total_score: ${state.sortByScore ? "ON" : "OFF"}`;
  renderStartups();
});

renderApp();
