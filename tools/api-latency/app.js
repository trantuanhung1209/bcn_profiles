const DEFAULT_API = "https://profiles.uside.id.vn";

const ENDPOINTS = [
  { id: "root", method: "GET", path: "/", auth: false, label: "Root" },
  { id: "health", method: "GET", path: "/health", auth: false, label: "Health + DB ping" },
  {
    id: "login",
    method: "POST",
    path: "/auth/login",
    auth: false,
    label: "Login",
    bodyFromForm: true,
  },
  { id: "auth-me", method: "GET", path: "/auth/me", auth: true, label: "Auth me" },
  { id: "auth-profile", method: "GET", path: "/auth/profile", auth: true, label: "Auth profile" },
  {
    id: "me-profile",
    method: "GET",
    path: "/users/me/profile",
    auth: true,
    label: "My profile",
  },
  {
    id: "users",
    method: "GET",
    path: "/users?page=1&limit=10",
    auth: true,
    label: "Users list",
  },
  { id: "users-count", method: "GET", path: "/users/count", auth: true, label: "Users count" },
  {
    id: "users-pending",
    method: "GET",
    path: "/users/pending?page=1&limit=10",
    auth: true,
    label: "Pending users",
  },
  {
    id: "timeline",
    method: "GET",
    path: "/timeline-events/my-timeline?page=1&limit=20",
    auth: true,
    label: "My timeline",
  },
  { id: "refresh", method: "POST", path: "/auth/refresh", auth: true, label: "Refresh token" },
  { id: "logout", method: "POST", path: "/auth/logout", auth: true, label: "Logout" },
];

const els = {
  apiBase: document.getElementById("apiBase"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  repeats: document.getElementById("repeats"),
  statusLine: document.getElementById("statusLine"),
  endpointList: document.getElementById("endpointList"),
  resultsBody: document.getElementById("resultsBody"),
  bars: document.getElementById("bars"),
  summaryHint: document.getElementById("summaryHint"),
  btnLogin: document.getElementById("btnLogin"),
  btnRunSelected: document.getElementById("btnRunSelected"),
  btnRunAll: document.getElementById("btnRunAll"),
  btnClear: document.getElementById("btnClear"),
  btnSelectAll: document.getElementById("btnSelectAll"),
  btnSelectAuth: document.getElementById("btnSelectAuth"),
  btnSelectPublic: document.getElementById("btnSelectPublic"),
};

const state = {
  running: false,
  results: [],
};

function defaultApiBase() {
  const host = window.location.hostname;
  if (host === "profiles.uside.id.vn" || host.endsWith(".uside.id.vn")) {
    return window.location.origin;
  }
  return DEFAULT_API;
}

function normalizeBase(url) {
  return String(url || DEFAULT_API).trim().replace(/\/+$/, "");
}

function setStatus(message, kind = "") {
  els.statusLine.textContent = message;
  els.statusLine.className = `status-line ${kind}`.trim();
}

function setBusy(busy) {
  state.running = busy;
  for (const btn of [
    els.btnLogin,
    els.btnRunSelected,
    els.btnRunAll,
    els.btnClear,
    els.btnSelectAll,
    els.btnSelectAuth,
    els.btnSelectPublic,
  ]) {
    btn.disabled = busy;
  }
}

function renderEndpoints() {
  els.endpointList.innerHTML = ENDPOINTS.map(
    (ep) => `
      <li>
        <label>
          <input type="checkbox" data-id="${ep.id}" ${ep.id === "logout" ? "" : "checked"} />
        </label>
        <div>
          <div class="path"><span class="method">${ep.method}</span> ${ep.path}</div>
        </div>
        <span class="tag">${ep.auth ? "auth" : "public"} · ${ep.label}</span>
      </li>
    `,
  ).join("");
}

function selectedEndpoints() {
  const checked = new Set(
    [...els.endpointList.querySelectorAll('input[type="checkbox"]:checked')].map(
      (input) => input.dataset.id,
    ),
  );
  return ENDPOINTS.filter((ep) => checked.has(ep.id));
}

function selectBy(predicate) {
  for (const input of els.endpointList.querySelectorAll('input[type="checkbox"]')) {
    const ep = ENDPOINTS.find((item) => item.id === input.dataset.id);
    input.checked = Boolean(ep && predicate(ep));
  }
}

function formatMs(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value)} ms`;
}

function formatBytes(value) {
  if (value == null) return "—";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function statusClass(status) {
  if (status >= 200 && status < 300) return "ok";
  if (status >= 400 && status < 500) return "warn";
  return "bad";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function measureRequest(endpoint) {
  const base = normalizeBase(els.apiBase.value);
  const url = `${base}${endpoint.path}`;
  const headers = { Accept: "application/json" };
  const init = {
    method: endpoint.method,
    credentials: "include",
    headers,
  };

  if (endpoint.bodyFromForm) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify({
      email: els.email.value.trim(),
      password: els.password.value,
    });
  }

  // Do not append cache-buster query params — ValidationPipe forbidNonWhitelisted
  // rejects unknown keys like `_` on DTO-validated query endpoints.
  const t0 = performance.now();
  let response;
  let errorMessage = "";
  try {
    response = await fetch(url, init);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }
  const tHeaders = performance.now();

  let bodyText = "";
  if (response) {
    bodyText = await response.text();
  }
  const tDone = performance.now();

  let ttfb = null;
  let transferSize = bodyText ? new TextEncoder().encode(bodyText).length : null;

  try {
    const entries = performance.getEntriesByType("resource");
    const match = [...entries]
      .reverse()
      .find(
        (entry) =>
          entry.startTime >= t0 - 1 &&
          (entry.name === url || entry.name.startsWith(`${url}?`) || entry.name.startsWith(url)),
      );
    if (match && match.responseStart > 0) {
      ttfb = match.responseStart - match.requestStart;
      if (match.transferSize > 0) transferSize = match.transferSize;
    }
  } catch {
    // Resource Timing may be unavailable cross-origin without Timing-Allow-Origin.
  }

  if (ttfb == null && response) {
    ttfb = tHeaders - t0;
  }

  let parsedPreview = bodyText.slice(0, 160);
  try {
    const json = JSON.parse(bodyText);
    parsedPreview = json.message || json.data?.message || JSON.stringify(json).slice(0, 160);
  } catch {
    // keep raw preview
  }

  return {
    endpoint,
    ok: Boolean(response && response.ok),
    status: response?.status ?? 0,
    totalMs: tDone - t0,
    ttfbMs: ttfb,
    downloadMs: response ? tDone - tHeaders : null,
    size: transferSize,
    preview: errorMessage || parsedPreview,
    error: errorMessage,
  };
}

async function runEndpoints(endpoints, { ensureLogin = false } = {}) {
  if (state.running) return;
  const repeats = Math.min(20, Math.max(1, Number(els.repeats.value) || 1));

  if (!endpoints.length) {
    setStatus("Chưa chọn endpoint nào.", "err");
    return;
  }

  if (ensureLogin || endpoints.some((ep) => ep.auth || ep.bodyFromForm)) {
    if (!els.email.value.trim() || !els.password.value) {
      setStatus("Nhập email/password trước khi chạy login hoặc endpoint auth.", "err");
      return;
    }
  }

  setBusy(true);
  setStatus(`Đang đo ${endpoints.length} endpoint × ${repeats} lần…`);

  const suite = [];

  try {
    if (ensureLogin) {
      const loginEp = ENDPOINTS.find((ep) => ep.id === "login");
      setStatus("Đang login production…");
      const loginResult = await measureRequest(loginEp);
      suite.push({ endpoint: loginEp, runs: [loginResult] });
      if (!loginResult.ok) {
        setStatus(`Login thất bại (${loginResult.status || "network"}): ${loginResult.preview}`, "err");
        state.results = suite;
        renderResults();
        return;
      }
      await sleep(120);
    }

    for (const endpoint of endpoints) {
      if (ensureLogin && endpoint.id === "login") continue;

      const runs = [];
      for (let i = 0; i < repeats; i += 1) {
        setStatus(`Đang chạy ${endpoint.method} ${endpoint.path} (${i + 1}/${repeats})…`);
        runs.push(await measureRequest(endpoint));
        if (i < repeats - 1) await sleep(80);
      }
      suite.push({ endpoint, runs });
    }

    state.results = suite;
    renderResults();

    const allTotals = suite.flatMap((item) => item.runs.map((run) => run.totalMs));
    const avg =
      allTotals.reduce((sum, value) => sum + value, 0) / Math.max(allTotals.length, 1);
    setStatus(
      `Xong ${suite.length} request group · ${allTotals.length} lần đo · avg ${Math.round(avg)} ms`,
      "ok",
    );
  } finally {
    setBusy(false);
  }
}

function summarize(runs) {
  const totals = runs.map((run) => run.totalMs);
  const avg = totals.reduce((sum, value) => sum + value, 0) / totals.length;
  return {
    avg,
    min: Math.min(...totals),
    max: Math.max(...totals),
    last: runs[runs.length - 1],
  };
}

function renderResults() {
  if (!state.results.length) {
    els.resultsBody.innerHTML = "";
    els.bars.hidden = true;
    els.bars.innerHTML = "";
    els.summaryHint.textContent = "Chưa có lần đo nào.";
    return;
  }

  const rows = state.results.map(({ endpoint, runs }) => {
    const stats = summarize(runs);
    const last = stats.last;
    return `
      <tr>
        <td>
          <div class="req-cell">
            <strong>${endpoint.method} ${endpoint.path}</strong>
            <span>${endpoint.label}${last.preview ? ` · ${escapeHtml(last.preview)}` : ""}</span>
          </div>
        </td>
        <td><span class="status-pill ${statusClass(last.status)}">${last.status || "ERR"}</span></td>
        <td class="mono">${runs.length}</td>
        <td class="mono">${formatMs(last.totalMs)}</td>
        <td class="mono">${formatMs(last.ttfbMs)}</td>
        <td class="mono">${formatMs(last.downloadMs)}</td>
        <td class="mono">${formatBytes(last.size)}</td>
        <td class="mono">${Math.round(stats.avg)} / ${Math.round(stats.min)} / ${Math.round(stats.max)}</td>
      </tr>
    `;
  });

  els.resultsBody.innerHTML = rows.join("");

  const maxAvg = Math.max(
    ...state.results.map(({ runs }) => summarize(runs).avg),
    1,
  );

  els.bars.hidden = false;
  els.bars.innerHTML = state.results
    .map(({ endpoint, runs }) => {
      const stats = summarize(runs);
      const width = Math.max(4, (stats.avg / maxAvg) * 100);
      return `
        <div class="bar-row">
          <div class="label">${endpoint.method} ${endpoint.path}</div>
          <div class="bar-track"><div class="bar-fill" data-width="${width}"></div></div>
          <div class="ms">${Math.round(stats.avg)} ms</div>
        </div>
      `;
    })
    .join("");

  requestAnimationFrame(() => {
    for (const fill of els.bars.querySelectorAll(".bar-fill")) {
      fill.style.width = `${fill.dataset.width}%`;
    }
  });

  const slowest = [...state.results].sort(
    (a, b) => summarize(b.runs).avg - summarize(a.runs).avg,
  )[0];
  els.summaryHint.textContent = `Chậm nhất: ${slowest.endpoint.method} ${slowest.endpoint.path} (~${Math.round(summarize(slowest.runs).avg)} ms avg)`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wireEvents() {
  els.btnLogin.addEventListener("click", () => {
    const selected = selectedEndpoints().filter((ep) => ep.id !== "login");
    const queue = selected.length ? selected : ENDPOINTS.filter((ep) => ep.id !== "logout");
    runEndpoints(queue, { ensureLogin: true });
  });

  els.btnRunSelected.addEventListener("click", () => {
    runEndpoints(selectedEndpoints());
  });

  els.btnRunAll.addEventListener("click", () => {
    runEndpoints(ENDPOINTS.filter((ep) => ep.id !== "logout"));
  });

  els.btnClear.addEventListener("click", () => {
    state.results = [];
    renderResults();
    setStatus("Đã xóa kết quả.");
  });

  els.btnSelectAll.addEventListener("click", () => selectBy(() => true));
  els.btnSelectAuth.addEventListener("click", () => selectBy((ep) => ep.auth));
  els.btnSelectPublic.addEventListener("click", () => selectBy((ep) => !ep.auth));
}

function init() {
  els.apiBase.value = defaultApiBase();
  renderEndpoints();
  wireEvents();
  setStatus(`Target: ${normalizeBase(els.apiBase.value)}`);
}

init();
