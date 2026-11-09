const API_BASE = "http://localhost:8000/api";
const TOKEN_KEY = "fc_token";
const USER_KEY = "fc_user";
const $ = (id) => document.getElementById(id);

const authScreen = $("auth-screen");
const dashboard = $("dashboard");
const welcomeUser = $("welcome-user");
const logoutBtn = $("logout-button");

// ---------- session ----------
const saveSession = (t, u) => { localStorage.setItem(TOKEN_KEY, t); localStorage.setItem(USER_KEY, JSON.stringify(u)); };
const clearSession = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); };
const getToken = () => localStorage.getItem(TOKEN_KEY);

// ---------- API ----------
async function api(path, { method = "GET", body, isForm = false, raw = false } = {}) {
  const headers = {};
  if (!isForm) headers["Content-Type"] = "application/json";
  const t = getToken();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method, headers,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new Error("Cannot reach server. Is the backend running on port 8000?"); }
  if (raw) {
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
  return data;
}

// ---------- UI state ----------
function showAuth() {
  authScreen.classList.remove("hidden");
  dashboard.classList.add("hidden");
  welcomeUser.textContent = "";
  logoutBtn.classList.add("hidden");
}
function showDashboard(user) {
  authScreen.classList.add("hidden");
  dashboard.classList.remove("hidden");
  welcomeUser.textContent = `Signed in as ${user.name}`;
  logoutBtn.classList.remove("hidden");
}
function switchTab(tab) {
  const login = tab === "login";
  $("login-tab").classList.toggle("active", login);
  $("register-tab").classList.toggle("active", !login);
  $("login-form").classList.toggle("hidden", !login);
  $("register-form").classList.toggle("hidden", login);
  $("login-message").textContent = "";
  $("register-message").textContent = "";
}
$("login-tab").onclick = () => switchTab("login");
$("register-tab").onclick = () => switchTab("register");

$("login-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const data = await api("/auth/login", { method: "POST", body: {
      email: $("login-email").value.trim(),
      password: $("login-password").value,
    }});
    saveSession(data.token, data.user);
    showDashboard(data.user);
    await loadCases();
  } catch (err) { $("login-message").textContent = err.message; $("login-message").style.color = "var(--danger)"; }
};

$("register-form").onsubmit = async (e) => {
  e.preventDefault();
  if ($("register-password").value !== $("register-confirm").value) {
    $("register-message").textContent = "Passwords do not match.";
    return;
  }
  try {
    const data = await api("/auth/register", { method: "POST", body: {
      name: $("register-name").value.trim(),
      email: $("register-email").value.trim(),
      password: $("register-password").value,
    }});
    saveSession(data.token, data.user);
    showDashboard(data.user);
    await loadCases();
  } catch (err) { $("register-message").textContent = err.message; $("register-message").style.color = "var(--danger)"; }
};

logoutBtn.onclick = () => { clearSession(); showAuth(); switchTab("login"); };

// ---------- cases ----------
let currentCase = null;
let casesCache = [];

async function loadCases() {
  casesCache = await api("/cases");
  const sel = $("case-select");
  sel.innerHTML = '<option value="">— Select a case —</option>';
  casesCache.forEach((c) => {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = `${c.case_number} — ${c.title}${c.role !== "owner" ? ` (${c.role})` : ""}`;
    sel.appendChild(o);
  });
  if (casesCache.length === 0) hidePanels();
}

function hidePanels() {
  ["case-panel", "evidence", "search", "custody", "timeline", "sharing", "report"]
    .forEach((id) => $(id).classList.add("hidden"));
  currentCase = null;
}

async function selectCase(id) {
  if (!id) return hidePanels();
  currentCase = casesCache.find((c) => String(c.id) === String(id));
  if (!currentCase) return hidePanels();

  ["case-panel", "evidence", "search", "custody", "timeline", "sharing", "report"]
    .forEach((id) => $(id).classList.remove("hidden"));

  $("case-title").textContent = currentCase.title;
  $("case-number").textContent = currentCase.case_number;
  $("case-status").textContent = currentCase.status;
  $("case-role").textContent = currentCase.role;
  $("case-description").textContent = currentCase.description || "No description";
  $("case-conclusion").value = currentCase.conclusion || "";

  // Read-only mode for viewers
  const isViewer = currentCase.role === "viewer";
  ["upload-form", "manual-evidence-form", "custody-form", "timeline-form", "share-form"]
    .forEach((id) => { const el = $(id); if (el) el.querySelectorAll("button, input, textarea, select").forEach(x => x.disabled = isViewer); });
  $("save-conclusion-btn").disabled = isViewer;
  $("edit-case-btn").disabled = isViewer;
  $("share-form").classList.toggle("hidden", currentCase.role !== "owner");

  await Promise.all([loadEvidence(), loadCustody(), loadTimeline(), loadShares()]);
  $("search-results").innerHTML = '<p class="muted">Enter a keyword to search.</p>';
}

$("case-select").onchange = (e) => selectCase(e.target.value);

$("save-conclusion-btn").onclick = async () => {
  if (!currentCase) return;
  try {
    await api(`/cases/${currentCase.id}`, { method: "PUT", body: {
      case_number: currentCase.case_number, title: currentCase.title,
      description: currentCase.description, status: currentCase.status,
      conclusion: $("case-conclusion").value,
    }});
    alert("Conclusion saved.");
  } catch (err) { alert(err.message); }
};

// ---------- case modal ----------
$("new-case-btn").onclick = () => openCaseModal();
$("edit-case-btn").onclick = () => openCaseModal(currentCase);
$("case-cancel").onclick = () => $("case-modal").classList.add("hidden");

function openCaseModal(c = null) {
  $("case-modal-title").textContent = c ? "Edit case" : "New case";
  $("cf-case-number").value = c ? c.case_number : "";
  $("cf-title").value = c ? c.title : "";
  $("cf-description").value = c ? c.description : "";
  $("cf-status").value = c ? c.status : "open";
  $("case-form").dataset.id = c ? c.id : "";
  $("case-modal").classList.remove("hidden");
}

$("case-form").onsubmit = async (e) => {
  e.preventDefault();
  const id = $("case-form").dataset.id;
  const payload = {
    case_number: $("cf-case-number").value.trim(),
    title: $("cf-title").value.trim(),
    description: $("cf-description").value,
    status: $("cf-status").value,
    conclusion: currentCase?.conclusion || "",
  };
  try {
    if (id) await api(`/cases/${id}`, { method: "PUT", body: payload });
    else await api("/cases", { method: "POST", body: payload });
    $("case-modal").classList.add("hidden");
    await loadCases();
    if (id) selectCase(id);
  } catch (err) { alert(err.message); }
};

// ---------- evidence with image preview ----------
async function loadEvidence() {
  if (!currentCase) return;
  const list = await api(`/cases/${currentCase.id}/evidence`);
  const wrap = $("evidence-list");
  if (list.length === 0) {
    wrap.innerHTML = '<p class="muted">No evidence recorded.</p>';
    return;
  }
  wrap.innerHTML = list.map((e) => {
    const thumb = e.has_file && e.is_image
      ? `<div class="evidence-thumb" onclick="previewImage(${e.id}, '${escape(e.filename)}')"><img src="${API_BASE}/evidence/${e.id}/file?token=${encodeURIComponent(getToken())}" alt="preview"></div>`
      : `<div class="evidence-thumb"><span class="file-icon">📄</span></div>`;
    const fileBtn = e.has_file
      ? `<a class="button button-outline small" href="${API_BASE}/evidence/${e.id}/file?token=${encodeURIComponent(getToken())}" target="_blank" rel="noopener">Open file</a>`
      : "";
    return `
      <div class="evidence-item">
        ${thumb}
        <div class="evidence-meta">
          <h4>${escape(e.evidence_id)} — ${escape(e.evidence_type)}</h4>
          <div>${escape(e.filename || "no file")}</div>
          <div class="hash" title="${e.hash_sha256}">SHA-256: ${(e.hash_sha256 || "").slice(0, 32)}…</div>
        </div>
        <div class="evidence-actions">
          ${fileBtn}
          <button class="button button-outline small" onclick="deleteEvidence(${e.id})">Delete</button>
        </div>
      </div>`;
  }).join("");
}

// Image preview uses a signed query token because <img src> can't send Bearer headers.
// (Backend also supports Authorization header; for <img> we pass ?token=...)
window.previewImage = (id, name) => {
  $("image-modal-title").textContent = name;
  $("image-modal-img").src = `${API_BASE}/evidence/${id}/file?token=${encodeURIComponent(getToken())}`;
  $("image-modal").classList.remove("hidden");
};
$("image-modal-close").onclick = () => $("image-modal").classList.add("hidden");
$("image-modal").addEventListener("click", (e) => {
  if (e.target === $("image-modal")) $("image-modal").classList.add("hidden");
});

window.deleteEvidence = async (id) => {
  if (!confirm("Delete this evidence record?")) return;
  try { await api(`/evidence/${id}`, { method: "DELETE" }); await loadEvidence(); }
  catch (err) { alert(err.message); }
};

$("upload-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!currentCase) return;
  const file = $("up-file").files[0];
  if (!file) return alert("Select a file");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("evidence_id", $("up-evidence-id").value.trim());
  fd.append("evidence_type", $("up-evidence-type").value.trim() || "disk_image");
  fd.append("description", $("up-description").value);
  try {
    await api(`/cases/${currentCase.id}/evidence/upload`, { method: "POST", body: fd, isForm: true });
    $("upload-form").reset();
    await loadEvidence();
  } catch (err) { alert(err.message); }
};

// ---------- search ----------
$("search-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!currentCase) return;
  const q = $("search-q").value.trim();
  if (!q) return;
  try {
    const data = await api(`/cases/${currentCase.id}/search?q=${encodeURIComponent(q)}`);
    const wrap = $("search-results");
    if (data.hits.length === 0) {
      wrap.innerHTML = `<p class="muted">No matches for “${escape(q)}”.</p>`;
      return;
    }
    wrap.innerHTML = data.hits.map((h) => `
      <div class="search-hit">
        <div><span class="field">${h.field}</span> <strong>${escape(h.evidence_id)}</strong> — ${escape(h.filename)}</div>
        <div class="snippet">${escape(h.snippet)}</div>
      </div>
    `).join("");
  } catch (err) { alert(err.message); }
};

// ---------- custody ----------
async function loadCustody() {
  if (!currentCase) return;
  const list = await api(`/cases/${currentCase.id}/custody`);
  const tbody = $("custody-body");
  tbody.innerHTML = list.length === 0
    ? '<tr><td colspan="4" class="muted">No entries.</td></tr>'
    : list.map((c) => `<tr><td>${escape(c.timestamp)}</td><td>${escape(c.action)}</td><td>${escape(c.actor)}</td><td>${escape(c.notes)}</td></tr>`).join("");
}

$("custody-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!currentCase) return;
  try {
    await api(`/cases/${currentCase.id}/custody`, { method: "POST", body: {
      timestamp: $("co-time").value.trim(), action: $("co-action").value.trim(),
      actor: $("co-actor").value.trim(), notes: $("co-notes").value.trim(),
    }});
    $("custody-form").reset(); await loadCustody();
  } catch (err) { alert(err.message); }
};

// ---------- timeline ----------
async function loadTimeline() {
  if (!currentCase) return;
  const list = await api(`/cases/${currentCase.id}/timeline`);
  const wrap = $("timeline-list");
  wrap.innerHTML = list.length === 0
    ? '<p class="muted">No events recorded.</p>'
    : list.map((t) => `
      <article class="event">
        <time>${escape(t.event_time)}</time>
        <div class="card">
          <h3>${escape(t.title)}</h3>
          <p>${escape(t.description)}</p>
          <span class="tag">${escape(t.artefact_type || "event")}</span>
        </div>
      </article>
    `).join("");
}

$("timeline-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!currentCase) return;
  try {
    await api(`/cases/${currentCase.id}/timeline`, { method: "POST", body: {
      event_time: $("tl-time").value.trim(), title: $("tl-title").value.trim(),
      description: $("tl-desc").value.trim(), artefact_type: $("tl-artefact").value.trim(),
    }});
    $("timeline-form").reset(); await loadTimeline();
  } catch (err) { alert(err.message); }
};

// ---------- sharing ----------
async function loadShares() {
  if (!currentCase) return;
  const list = await api(`/cases/${currentCase.id}/shares`);
  const tbody = $("shares-body");
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">No shares.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map((s) => `
    <tr>
      <td>${escape(s.name)}</td>
      <td>${escape(s.email)}</td>
      <td><span class="status">${escape(s.role)}</span></td>
      <td>${currentCase.role === "owner" ? `<button class="button button-outline small" onclick="removeShare(${s.id})">Remove</button>` : ""}</td>
    </tr>
  `).join("");
}

$("share-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!currentCase) return;
  try {
    await api(`/cases/${currentCase.id}/shares`, { method: "POST", body: {
      email: $("share-email").value.trim(), role: $("share-role").value,
    }});
    $("share-form").reset(); await loadShares();
  } catch (err) { alert(err.message); }
};

window.removeShare = async (shareId) => {
  if (!currentCase) return;
  if (!confirm("Remove this share?")) return;
  try { await api(`/cases/${currentCase.id}/shares/${shareId}`, { method: "DELETE" }); await loadShares(); }
  catch (err) { alert(err.message); }
};

// ---------- report ----------
$("download-report-btn").onclick = async () => {
  if (!currentCase) return;
  try {
    const res = await fetch(`${API_BASE}/cases/${currentCase.id}/report.pdf`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error("Report generation failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `report_${currentCase.case_number}.pdf`; a.click();
    URL.revokeObjectURL(url);
  } catch (err) { alert(err.message); }
};

// ---------- utils ----------
function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------- bootstrap ----------
(async function init() {
  const t = getToken();
  if (!t) return showAuth();
  try {
    const data = await api("/auth/me");
    showDashboard(data.user);
    await loadCases();
  } catch { clearSession(); showAuth(); }
})();