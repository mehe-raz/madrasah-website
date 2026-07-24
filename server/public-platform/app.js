// ============================================================================
// Super-Admin panel (Part 5 / 6). Plain JS, no framework/build step — this
// panel is served directly by Express (see server/src/index.js) and only
// ever talks to /api/platform/*, never to any tenant's own API.
// ============================================================================

const API = "/api/platform";
const root = document.getElementById("app");

const STATUS_LABELS = {
  trial: "ট্রায়াল",
  active: "সক্রিয়",
  suspended: "সাসপেন্ড",
  cancelled: "বাতিল",
};

let state = {
  admin: null,
  institutions: [],
  statusFilter: "",
  loading: true,
  error: "",
  modal: null, // { type: 'create' | 'subscription' | 'audit', ... }
};

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    method: opts.method || "GET",
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("bn-BD", { year: "numeric", month: "short", day: "numeric" });
}

async function loadMe() {
  try {
    const { admin } = await api("/auth/me");
    state.admin = admin;
  } catch {
    state.admin = null;
  }
}

async function loadInstitutions() {
  state.loading = true;
  render();
  try {
    const qs = state.statusFilter ? `?status=${encodeURIComponent(state.statusFilter)}` : "";
    state.institutions = await api(`/institutions${qs}`);
    state.error = "";
  } catch (err) {
    state.error = err.message;
  } finally {
    state.loading = false;
    render();
  }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function renderLogin() {
  root.innerHTML = `
    <div class="login-shell">
      <div class="login-card">
        <h1>Super-Admin প্যানেল</h1>
        <p class="sub">প্ল্যাটফর্ম অ্যাডমিন লগইন — শুধু আপনার/আপনার টিমের জন্য</p>
        ${state.error ? `<div class="error-box">${escapeHtml(state.error)}</div>` : ""}
        <form id="login-form">
          <label>ইমেইল</label>
          <input type="email" name="email" required autocomplete="username" />
          <label>পাসওয়ার্ড</label>
          <input type="password" name="password" required autocomplete="current-password" />
          <div class="modal-actions" style="justify-content:stretch; margin-top:20px;">
            <button type="submit" style="width:100%;">লগইন</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.error = "";
    try {
      const { admin } = await api("/auth/login", {
        method: "POST",
        body: { email: fd.get("email"), password: fd.get("password") },
      });
      state.admin = admin;
      await loadInstitutions();
    } catch (err) {
      state.error = err.message;
      render();
    }
  });
}

function institutionRow(inst) {
  const status = inst.status;
  return `
    <tr data-id="${inst.id}">
      <td>${escapeHtml(inst.name)}</td>
      <td class="mono">${escapeHtml(inst.code)}</td>
      <td><span class="badge ${status}">${STATUS_LABELS[status] || status}</span></td>
      <td>${escapeHtml(inst.plan)}</td>
      <td class="muted">${fmtDate(inst.trial_ends_at)}</td>
      <td class="muted">${fmtDate(inst.subscription_ends_at)}</td>
      <td>
        <div class="row-actions">
          <select class="status-select" data-id="${inst.id}">
            ${Object.entries(STATUS_LABELS)
              .map(([v, label]) => `<option value="${v}" ${v === status ? "selected" : ""}>${label}</option>`)
              .join("")}
          </select>
          <button class="small secondary apply-status" data-id="${inst.id}">আপডেট</button>
          <button class="small secondary open-subscription" data-id="${inst.id}">সাবস্ক্রিপশন</button>
          <button class="link-btn open-audit" data-id="${inst.id}">লগ</button>
        </div>
      </td>
    </tr>
  `;
}

function renderDashboard() {
  root.innerHTML = `
    <header class="topbar">
      <h1>Super-Admin প্যানেল</h1>
      <div class="who">
        ${escapeHtml(state.admin.name)} (${escapeHtml(state.admin.email)})
        <button id="logout-btn" class="secondary small" style="margin-inline-start:10px;">লগআউট</button>
      </div>
    </header>
    <main>
      <div class="toolbar">
        <div class="filters">
          <select id="status-filter">
            <option value="">সব প্রতিষ্ঠান</option>
            ${Object.entries(STATUS_LABELS)
              .map(([v, label]) => `<option value="${v}" ${v === state.statusFilter ? "selected" : ""}>${label}</option>`)
              .join("")}
          </select>
          <button id="view-audit" class="secondary">সব অডিট লগ</button>
        </div>
        <button id="new-institution">+ নতুন প্রতিষ্ঠান</button>
      </div>
      ${state.error ? `<div class="error-box">${escapeHtml(state.error)}</div>` : ""}
      <div class="card">
        ${
          state.loading
            ? `<div class="empty-state">লোড হচ্ছে…</div>`
            : state.institutions.length === 0
            ? `<div class="empty-state">কোনো প্রতিষ্ঠান পাওয়া যায়নি। "+ নতুন প্রতিষ্ঠান" দিয়ে যোগ করুন।</div>`
            : `<table>
                <thead>
                  <tr>
                    <th>নাম</th><th>কোড</th><th>স্ট্যাটাস</th><th>প্ল্যান</th>
                    <th>ট্রায়াল শেষ</th><th>সাবস্ক্রিপশন শেষ</th><th>অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody>${state.institutions.map(institutionRow).join("")}</tbody>
              </table>`
        }
      </div>
    </main>
    ${state.modal ? renderModal() : ""}
  `;
  wireDashboardEvents();
}

function renderModal() {
  if (state.modal.type === "create") return renderCreateModal();
  if (state.modal.type === "subscription") return renderSubscriptionModal();
  if (state.modal.type === "audit") return renderAuditModal();
  return "";
}

function renderCreateModal() {
  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <h2>নতুন প্রতিষ্ঠান</h2>
        <p class="sub">রেজিস্ট্রিতে যোগ + schema প্রভিশন + প্রথম Super Admin লগইন — সব একসাথে হবে।</p>
        ${state.modal.error ? `<div class="error-box">${escapeHtml(state.modal.error)}</div>` : ""}
        <form id="create-form">
          <label>প্রতিষ্ঠানের নাম *</label>
          <input name="name" required />
          <label>কোড (সাবডোমেইন) * — শুধু ছোট হাতের অক্ষর/সংখ্যা/হাইফেন</label>
          <input name="code" required pattern="[a-z][a-z0-9-]{1,30}" placeholder="al-madina" />
          <label>অ্যাডমিনের ইমেইল *</label>
          <input name="adminEmail" type="email" required />
          <label>অ্যাডমিনের পাসওয়ার্ড * (৮+ ক্যারেক্টার)</label>
          <input name="adminPassword" type="password" required minlength="8" />
          <label>অ্যাডমিনের নাম</label>
          <input name="adminName" placeholder="Super Admin" />
          <label>যোগাযোগের ফোন</label>
          <input name="contactPhone" />
          <label>প্ল্যান</label>
          <input name="plan" placeholder="basic" />
          <label>ট্রায়াল (দিন)</label>
          <input name="trialDays" type="number" min="0" placeholder="14" />
          <div class="modal-actions">
            <button type="button" class="secondary" id="modal-cancel">বাতিল</button>
            <button type="submit" id="modal-submit">তৈরি করুন</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderSubscriptionModal() {
  const inst = state.institutions.find((i) => i.id === state.modal.institutionId);
  if (!inst) return "";
  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <h2>সাবস্ক্রিপশন — ${escapeHtml(inst.name)}</h2>
        <p class="sub">প্ল্যান ও মেয়াদ পরিবর্তন করুন (ফাঁকা রাখলে অপরিবর্তিত থাকবে)।</p>
        ${state.modal.error ? `<div class="error-box">${escapeHtml(state.modal.error)}</div>` : ""}
        <form id="subscription-form">
          <label>প্ল্যান</label>
          <input name="plan" value="${escapeHtml(inst.plan)}" />
          <label>সাবস্ক্রিপশন শেষের তারিখ</label>
          <input name="subscriptionEndsAt" type="date" value="${inst.subscription_ends_at ? String(inst.subscription_ends_at).slice(0, 10) : ""}" />
          <div class="modal-actions">
            <button type="button" class="secondary" id="modal-cancel">বাতিল</button>
            <button type="submit">সংরক্ষণ করুন</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderAuditModal() {
  const inst = state.modal.institutionId
    ? state.institutions.find((i) => i.id === state.modal.institutionId)
    : null;
  const logs = state.modal.logs || [];
  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" style="max-width:560px;">
        <h2>অডিট লগ ${inst ? "— " + escapeHtml(inst.name) : "(সব প্রতিষ্ঠান)"}</h2>
        ${
          state.modal.loading
            ? `<p class="muted">লোড হচ্ছে…</p>`
            : logs.length === 0
            ? `<p class="muted">কোনো লগ নেই।</p>`
            : `<div class="card" style="max-height:360px; overflow-y:auto;">
                <table>
                  <thead><tr><th>সময়</th><th>প্রতিষ্ঠান</th><th>অ্যাকশন</th><th>কে</th></tr></thead>
                  <tbody>
                    ${logs
                      .map(
                        (l) => `
                      <tr>
                        <td class="muted">${new Date(l.created_at).toLocaleString("bn-BD")}</td>
                        <td>${escapeHtml(l.institution_name || "—")}</td>
                        <td class="mono">${escapeHtml(l.action)}</td>
                        <td class="muted">${escapeHtml(l.actor_email || "—")}</td>
                      </tr>`
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>`
        }
        <div class="modal-actions">
          <button type="button" class="secondary" id="modal-cancel">বন্ধ করুন</button>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function closeModal() {
  state.modal = null;
  render();
}

function wireDashboardEvents() {
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    state.admin = null;
    state.institutions = [];
    render();
  });

  document.getElementById("status-filter").addEventListener("change", (e) => {
    state.statusFilter = e.target.value;
    loadInstitutions();
  });

  document.getElementById("new-institution").addEventListener("click", () => {
    state.modal = { type: "create", error: "" };
    render();
  });

  document.getElementById("view-audit").addEventListener("click", () => openAuditModal(null));

  root.querySelectorAll(".apply-status").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      const select = root.querySelector(`.status-select[data-id="${id}"]`);
      btn.disabled = true;
      try {
        await api(`/institutions/${id}/status`, { method: "PATCH", body: { status: select.value } });
        await loadInstitutions();
      } catch (err) {
        state.error = err.message;
        render();
      }
    });
  });

  root.querySelectorAll(".open-subscription").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.modal = { type: "subscription", institutionId: Number(btn.dataset.id), error: "" };
      render();
    });
  });

  root.querySelectorAll(".open-audit").forEach((btn) => {
    btn.addEventListener("click", () => openAuditModal(Number(btn.dataset.id)));
  });

  const backdrop = document.getElementById("modal-backdrop");
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });
    const cancelBtn = document.getElementById("modal-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
  }

  const createForm = document.getElementById("create-form");
  if (createForm) {
    createForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(createForm);
      const body = Object.fromEntries(fd.entries());
      if (body.trialDays) body.trialDays = Number(body.trialDays);
      else delete body.trialDays;
      Object.keys(body).forEach((k) => { if (body[k] === "") delete body[k]; });
      const submitBtn = document.getElementById("modal-submit");
      submitBtn.disabled = true;
      try {
        await api("/institutions", { method: "POST", body });
        closeModal();
        await loadInstitutions();
      } catch (err) {
        state.modal.error = err.message;
        render();
      }
    });
  }

  const subForm = document.getElementById("subscription-form");
  if (subForm) {
    subForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(subForm);
      const body = {};
      if (fd.get("plan")) body.plan = fd.get("plan");
      if (fd.get("subscriptionEndsAt")) body.subscriptionEndsAt = fd.get("subscriptionEndsAt");
      try {
        await api(`/institutions/${state.modal.institutionId}/subscription`, {
          method: "PATCH",
          body,
        });
        closeModal();
        await loadInstitutions();
      } catch (err) {
        state.modal.error = err.message;
        render();
      }
    });
  }
}

async function openAuditModal(institutionId) {
  state.modal = { type: "audit", institutionId, logs: [], loading: true };
  render();
  try {
    const qs = institutionId ? `?institutionId=${institutionId}` : "";
    const logs = await api(`/audit-logs${qs}`);
    state.modal.logs = logs;
  } catch (err) {
    state.error = err.message;
  } finally {
    state.modal.loading = false;
    render();
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function render() {
  if (!state.admin) {
    renderLogin();
  } else {
    renderDashboard();
  }
}

(async function boot() {
  await loadMe();
  if (state.admin) {
    await loadInstitutions();
  } else {
    render();
  }
})();
