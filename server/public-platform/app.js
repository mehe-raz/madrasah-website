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

// Platform-admin roles (registry.platform_admins.role — see
// sql/registry_schema.sql for what each one is allowed to do).
const ROLE_LABELS = {
  super_admin: "সুপার এডমিন",
  admin: "এডমিন",
  manager: "ম্যানেজার",
};

let state = {
  admin: null,
  institutions: [],
  admins: [], // platform admins (Part 5.1) — only loaded/shown for super_admin
  statusFilter: "",
  loading: true,
  error: "",
  info: "", // Part 6 — transient success message (expiry-scan / migration results)
  modal: null, // { type: 'create' | 'subscription' | 'audit' | 'payment' | 'migration' | 'admins', ... }
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

// Same reusable ring spinner as the reload splash (classes defined in
// styles.css) — the only loading indicator used anywhere in this panel.
// Small variant, centered, for list/table loading placeholders.
function spinnerHtml() {
  return `
    <div style="display:flex; justify-content:center; padding:16px;">
      <div class="rs-orbit rs-orbit--sm">
        <div class="rs-ring rs-ring--r1"></div>
        <div class="rs-ring rs-ring--r2">
          <span class="rs-dot"></span>
          <span class="rs-dot"></span>
          <span class="rs-dot"></span>
          <span class="rs-dot"></span>
        </div>
        <div class="rs-ring rs-ring--r3"></div>
        <div class="rs-ring rs-ring--r4"></div>
        <div class="rs-ring rs-ring--r5"></div>
      </div>
    </div>
  `;
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
        <div class="brand-wrap">
          <div class="brand-mark">🕌</div>
          <h1>Super-Admin প্যানেল</h1>
          <p class="sub">প্ল্যাটফর্ম অ্যাডমিন লগইন — শুধু আপনার/আপনার টিমের জন্য</p>
        </div>
        ${state.error ? `<div class="error-box">${escapeHtml(state.error)}</div>` : ""}
        <form id="login-form">
          <label>ইমেইল</label>
          <div class="field-icon-wrap">
            <span class="icon">✉️</span>
            <input type="email" name="email" required autocomplete="username" placeholder="you@example.com" />
          </div>
          <label>পাসওয়ার্ড</label>
          <div class="field-icon-wrap">
            <span class="icon">🔒</span>
            <input type="password" name="password" required autocomplete="current-password" placeholder="••••••••" />
          </div>
          <div class="modal-actions" style="justify-content:stretch; margin-top:22px;">
            <button type="submit" style="width:100%;">লগইন করুন</button>
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
  const role = (state.admin && state.admin.role) || "super_admin";
  const isSuperAdmin = role === "super_admin";
  return `
    <tr data-id="${inst.id}">
      <td data-label="নাম">${escapeHtml(inst.name)}</td>
      <td class="mono" data-label="কোড">${escapeHtml(inst.code)}</td>
      <td data-label="স্ট্যাটাস"><span class="badge ${status}">${STATUS_LABELS[status] || status}</span></td>
      <td data-label="প্ল্যান">${escapeHtml(inst.plan)}</td>
      <td class="muted" data-label="ট্রায়াল শেষ">${fmtDate(inst.trial_ends_at)}</td>
      <td class="muted" data-label="সাবস্ক্রিপশন শেষ">${fmtDate(inst.subscription_ends_at)}</td>
      <td class="row-actions-cell">
        <div class="row-actions">
          <select class="status-select" data-id="${inst.id}">
            ${Object.entries(STATUS_LABELS)
              .map(([v, label]) => `<option value="${v}" ${v === status ? "selected" : ""}>${label}</option>`)
              .join("")}
          </select>
          <button class="small secondary apply-status" data-id="${inst.id}">আপডেট</button>
          <button class="small secondary open-subscription" data-id="${inst.id}">সাবস্ক্রিপশন</button>
          <button class="small secondary open-payment" data-id="${inst.id}">পেমেন্ট</button>
          <button class="link-btn open-audit" data-id="${inst.id}">লগ</button>
          ${isSuperAdmin ? `<button class="small danger open-delete" data-id="${inst.id}">মুছুন</button>` : ""}
        </div>
      </td>
    </tr>
  `;
}

function statCounts() {
  const list = state.institutions || [];
  return {
    total: list.length,
    active: list.filter((i) => i.status === "active").length,
    trial: list.filter((i) => i.status === "trial").length,
    suspended: list.filter((i) => i.status === "suspended" || i.status === "cancelled").length,
  };
}

function renderDashboard() {
  const counts = statCounts();
  const role = state.admin.role || "super_admin";
  const isSuperAdmin = role === "super_admin";
  const canManageInstitutions = role === "super_admin" || role === "admin";
  root.innerHTML = `
    <header class="topbar">
      <div class="brand-group">
        <div class="brand-mark">🕌</div>
        <h1>Super-Admin প্যানেল</h1>
      </div>
      <div class="who">
        <span class="name-chip">${escapeHtml(state.admin.name)}</span>
        <span class="role-chip role-${role}">${ROLE_LABELS[role] || role}</span>
        <span>${escapeHtml(state.admin.email)}</span>
        <button id="logout-btn" class="secondary small">লগআউট</button>
      </div>
    </header>
    <main>
      <div class="stat-grid">
        <div class="stat-card total">
          <div class="stat-icon">🏫</div>
          <div><div class="stat-num">${counts.total}</div><div class="stat-label">মোট প্রতিষ্ঠান</div></div>
        </div>
        <div class="stat-card active">
          <div class="stat-icon">✅</div>
          <div><div class="stat-num">${counts.active}</div><div class="stat-label">সক্রিয়</div></div>
        </div>
        <div class="stat-card trial">
          <div class="stat-icon">⏳</div>
          <div><div class="stat-num">${counts.trial}</div><div class="stat-label">ট্রায়াল</div></div>
        </div>
        <div class="stat-card suspended">
          <div class="stat-icon">⛔</div>
          <div><div class="stat-num">${counts.suspended}</div><div class="stat-label">সাসপেন্ড/বাতিল</div></div>
        </div>
      </div>
      <div class="toolbar">
        <div class="filters">
          <select id="status-filter">
            <option value="">সব প্রতিষ্ঠান</option>
            ${Object.entries(STATUS_LABELS)
              .map(([v, label]) => `<option value="${v}" ${v === state.statusFilter ? "selected" : ""}>${label}</option>`)
              .join("")}
          </select>
          <button id="view-audit" class="secondary">সব অডিট লগ</button>
          <button id="run-expiry-scan" class="secondary">মেয়াদ স্ক্যান চালান</button>
          ${isSuperAdmin ? `<button id="open-migration" class="secondary">মাইগ্রেশন টুল</button>` : ""}
          ${isSuperAdmin ? `<button id="open-admins" class="secondary">👤 এডমিন ম্যানেজমেন্ট</button>` : ""}
        </div>
        ${canManageInstitutions ? `<button id="new-institution">+ নতুন প্রতিষ্ঠান</button>` : ""}
      </div>
      ${state.error ? `<div class="error-box">${escapeHtml(state.error)}</div>` : ""}
      ${state.info ? `<div class="info-box">${escapeHtml(state.info)}</div>` : ""}
      <div class="card">
        ${
          state.loading
            ? spinnerHtml()
            : state.institutions.length === 0
            ? `<div class="empty-state"><span class="empty-icon">🏫</span>কোনো প্রতিষ্ঠান পাওয়া যায়নি। "+ নতুন প্রতিষ্ঠান" দিয়ে যোগ করুন।</div>`
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
  if (state.modal.type === "payment") return renderPaymentModal();
  if (state.modal.type === "migration") return renderMigrationModal();
  if (state.modal.type === "delete") return renderDeleteModal();
  if (state.modal.type === "admins") return renderAdminsModal();
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

function renderDeleteModal() {
  const inst = state.institutions.find((i) => i.id === state.modal.institutionId);
  if (!inst) return "";
  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <h2>প্রতিষ্ঠান মুছুন — ${escapeHtml(inst.name)}</h2>
        <p class="sub">এই প্রতিষ্ঠানের সব তথ্য (শিক্ষার্থী, পেমেন্ট, ইউজার, সব কিছু) স্থায়ীভাবে মুছে যাবে। এটি আর ফেরত আনা যাবে না।</p>
        ${state.modal.error ? `<div class="error-box">${escapeHtml(state.modal.error)}</div>` : ""}
        <form id="delete-form">
          <label>নিশ্চিত করতে প্রতিষ্ঠানের কোড লিখুন: <span class="mono">${escapeHtml(inst.code)}</span></label>
          <input name="confirmCode" required autocomplete="off" placeholder="${escapeHtml(inst.code)}" />
          <div class="modal-actions">
            <button type="button" class="secondary" id="modal-cancel">বাতিল</button>
            <button type="submit" id="delete-submit" class="danger">স্থায়ীভাবে মুছুন</button>
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
            ? spinnerHtml()
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

function renderPaymentModal() {
  const inst = state.institutions.find((i) => i.id === state.modal.institutionId);
  if (!inst) return "";
  const payments = state.modal.payments || [];
  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" style="max-width:520px;">
        <h2>পেমেন্ট — ${escapeHtml(inst.name)}</h2>
        <p class="sub">
          পেমেন্ট নিশ্চিত হওয়ার পর এখানে যোগ করুন (bKash/Nagad/ব্যাংক ইত্যাদি) — এটা
          স্বয়ংক্রিয়ভাবে সাবস্ক্রিপশনের মেয়াদ বাড়িয়ে দেবে ও অ্যাকাউন্ট সক্রিয় করে দেবে।
        </p>
        ${state.modal.error ? `<div class="error-box">${escapeHtml(state.modal.error)}</div>` : ""}
        <form id="payment-form">
          <label>পরিমাণ (টাকা) *</label>
          <input name="amount" type="number" step="0.01" min="0.01" required />
          <label>মাধ্যম</label>
          <select name="method">
            <option value="bkash">bKash</option>
            <option value="nagad">Nagad</option>
            <option value="bank">ব্যাংক</option>
            <option value="cash">নগদ (হাতে)</option>
            <option value="manual">অন্যান্য</option>
          </select>
          <label>রেফারেন্স / ট্রানজেকশন আইডি</label>
          <input name="reference" placeholder="TRX..." />
          <label>মেয়াদ (দিন)</label>
          <input name="periodDays" type="number" min="1" placeholder="30" />
          <label>নোট</label>
          <input name="note" />
          <div class="modal-actions">
            <button type="button" class="secondary" id="modal-cancel">বন্ধ করুন</button>
            <button type="submit">পেমেন্ট রেকর্ড করুন</button>
          </div>
        </form>
        <p class="sub" style="margin-top:18px;">পূর্ববর্তী পেমেন্ট</p>
        ${
          state.modal.loading
            ? spinnerHtml()
            : payments.length === 0
            ? `<p class="muted">কোনো পেমেন্ট রেকর্ড নেই।</p>`
            : `<div class="card" style="max-height:220px; overflow-y:auto;">
                <table>
                  <thead><tr><th>তারিখ</th><th>পরিমাণ</th><th>মাধ্যম</th><th>মেয়াদ পর্যন্ত</th></tr></thead>
                  <tbody>
                    ${payments
                      .map(
                        (p) => `
                      <tr>
                        <td class="muted">${fmtDate(p.created_at)}</td>
                        <td>${escapeHtml(p.amount)} ${escapeHtml(p.currency)}</td>
                        <td class="mono">${escapeHtml(p.method)}</td>
                        <td class="muted">${fmtDate(p.covers_until)}</td>
                      </tr>`
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>`
        }
      </div>
    </div>
  `;
}

function renderMigrationModal() {
  const result = state.modal.result;
  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" style="max-width:640px;">
        <h2>মাইগ্রেশন টুল</h2>
        <p class="sub">
          এই SQL প্রতিটা প্রতিষ্ঠানের (tenant) schema-তে আলাদা আলাদা করে চালানো হবে।
          idempotent SQL দিন (যেমন <span class="mono">ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...</span>) —
          একটা প্রতিষ্ঠানে ব্যর্থ হলে বাকিগুলো তবুও চেষ্টা করা হবে।
        </p>
        ${state.modal.error ? `<div class="error-box">${escapeHtml(state.modal.error)}</div>` : ""}
        <form id="migration-form">
          <label>SQL</label>
          <textarea name="sql" rows="8" required placeholder="ALTER TABLE students ADD COLUMN IF NOT EXISTS ..."></textarea>
          <div class="modal-actions">
            <button type="button" class="secondary" id="modal-cancel">বন্ধ করুন</button>
            <button type="submit" id="migration-submit">সব প্রতিষ্ঠানে চালান</button>
          </div>
        </form>
        ${
          result
            ? `<p class="sub" style="margin-top:18px;">ফলাফল — মোট ${result.total}টির মধ্যে ${result.succeeded.length}টি সফল</p>
               <div class="card" style="max-height:220px; overflow-y:auto;">
                 <table>
                   <thead><tr><th>কোড</th><th>ফলাফল</th></tr></thead>
                   <tbody>
                     ${result.succeeded
                       .map((t) => `<tr><td class="mono">${escapeHtml(t.code)}</td><td><span class="badge active">সফল</span></td></tr>`)
                       .join("")}
                     ${result.failed
                       .map(
                         (t) => `<tr><td class="mono">${escapeHtml(t.code)}</td>
                           <td><span class="badge suspended">ব্যর্থ</span> <span class="muted">${escapeHtml(t.error)}</span></td></tr>`
                       )
                       .join("")}
                   </tbody>
                 </table>
               </div>`
            : ""
        }
      </div>
    </div>
  `;
}

function adminRow(admin) {
  const isSelf = state.admin && admin.id === state.admin.id;
  return `
    <tr data-id="${admin.id}">
      <td data-label="নাম">
        <div style="font-weight:700;">${escapeHtml(admin.name)}${isSelf ? ` <span class="muted" style="font-weight:500;">(আপনি)</span>` : ""}</div>
        <div class="muted" style="font-size:12px;">${escapeHtml(admin.email)}</div>
      </td>
      <td data-label="রোল">
        <select class="admin-role-select" data-id="${admin.id}" ${isSelf ? "disabled" : ""}>
          ${Object.entries(ROLE_LABELS)
            .map(([v, label]) => `<option value="${v}" ${v === admin.role ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>
      </td>
      <td class="row-actions-cell">
        <div class="row-actions">
          <button class="small secondary apply-admin-role" data-id="${admin.id}" ${isSelf ? "disabled" : ""}>আপডেট</button>
          <button class="small danger open-delete-admin" data-id="${admin.id}" ${isSelf ? "disabled" : ""}>মুছুন</button>
        </div>
      </td>
    </tr>
  `;
}

function renderAdminsModal() {
  const admins = state.modal.admins || [];
  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" style="max-width:640px;">
        <h2>এডমিন ম্যানেজমেন্ট</h2>
        <p class="sub">
          প্ল্যাটফর্ম প্যানেলে লগইন করতে পারা অ্যাকাউন্টগুলো। সুপার এডমিন সব কিছু করতে পারেন;
          এডমিন প্রতিষ্ঠান তৈরি/স্ট্যাটাস/সাবস্ক্রিপশন পরিবর্তন করতে পারেন কিন্তু মুছতে বা মাইগ্রেশন
          চালাতে পারেন না; ম্যানেজার শুধু দেখতে ও পেমেন্ট/মেয়াদ-স্ক্যান চালাতে পারেন।
        </p>
        ${state.modal.error ? `<div class="error-box">${escapeHtml(state.modal.error)}</div>` : ""}
        ${state.modal.info ? `<div class="info-box">${escapeHtml(state.modal.info)}</div>` : ""}
        ${
          state.modal.loading
            ? spinnerHtml()
            : `<div class="card" style="max-height:280px; overflow-y:auto;">
                <table>
                  <thead><tr><th>নাম / ইমেইল</th><th>রোল</th><th>অ্যাকশন</th></tr></thead>
                  <tbody>${admins.map(adminRow).join("")}</tbody>
                </table>
              </div>`
        }

        <p class="sub" style="margin-top:20px; font-weight:700; color:var(--text);">নতুন এডমিন যোগ করুন</p>
        <form id="create-admin-form">
          <label>নাম *</label>
          <input name="name" required />
          <label>ইমেইল *</label>
          <input name="email" type="email" required />
          <label>পাসওয়ার্ড * (৮+ ক্যারেক্টার)</label>
          <input name="password" type="password" required minlength="8" />
          <label>রোল</label>
          <select name="role">
            ${Object.entries(ROLE_LABELS)
              .map(([v, label]) => `<option value="${v}" ${v === "admin" ? "selected" : ""}>${label}</option>`)
              .join("")}
          </select>
          <div class="modal-actions">
            <button type="button" class="secondary" id="modal-cancel">বন্ধ করুন</button>
            <button type="submit" id="create-admin-submit">যোগ করুন</button>
          </div>
        </form>
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

  const newInstitutionBtn = document.getElementById("new-institution");
  if (newInstitutionBtn) {
    newInstitutionBtn.addEventListener("click", () => {
      state.modal = { type: "create", error: "" };
      render();
    });
  }

  document.getElementById("view-audit").addEventListener("click", () => openAuditModal(null));

  document.getElementById("run-expiry-scan").addEventListener("click", async (e) => {
    const btn = e.target;
    btn.disabled = true;
    state.error = "";
    state.info = "";
    try {
      const { suspended } = await api("/billing/expiry-scan", { method: "POST" });
      state.info = suspended.length
        ? `মেয়াদ শেষ হওয়ায় ${suspended.length}টি প্রতিষ্ঠান সাসপেন্ড করা হয়েছে: ${suspended.map((i) => i.code).join(", ")}`
        : "মেয়াদ শেষ হওয়া কোনো প্রতিষ্ঠান পাওয়া যায়নি।";
      await loadInstitutions();
    } catch (err) {
      state.error = err.message;
      render();
    } finally {
      btn.disabled = false;
    }
  });

  const openMigrationBtn = document.getElementById("open-migration");
  if (openMigrationBtn) {
    openMigrationBtn.addEventListener("click", () => {
      state.modal = { type: "migration", error: "", result: null };
      render();
    });
  }

  const openAdminsBtn = document.getElementById("open-admins");
  if (openAdminsBtn) {
    openAdminsBtn.addEventListener("click", () => openAdminsModal());
  }

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

  root.querySelectorAll(".open-payment").forEach((btn) => {
    btn.addEventListener("click", () => openPaymentModal(Number(btn.dataset.id)));
  });

  root.querySelectorAll(".open-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.modal = { type: "delete", institutionId: Number(btn.dataset.id), error: "" };
      render();
    });
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

  const paymentForm = document.getElementById("payment-form");
  if (paymentForm) {
    paymentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(paymentForm);
      const body = Object.fromEntries(fd.entries());
      if (body.periodDays) body.periodDays = Number(body.periodDays);
      else delete body.periodDays;
      Object.keys(body).forEach((k) => { if (body[k] === "") delete body[k]; });
      try {
        await api(`/institutions/${state.modal.institutionId}/payments`, { method: "POST", body });
        await openPaymentModal(state.modal.institutionId);
        await loadInstitutions();
      } catch (err) {
        state.modal.error = err.message;
        render();
      }
    });
  }

  const deleteForm = document.getElementById("delete-form");
  if (deleteForm) {
    deleteForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(deleteForm);
      const submitBtn = document.getElementById("delete-submit");
      submitBtn.disabled = true;
      try {
        await api(`/institutions/${state.modal.institutionId}`, {
          method: "DELETE",
          body: { confirmCode: fd.get("confirmCode") },
        });
        closeModal();
        await loadInstitutions();
      } catch (err) {
        state.modal.error = err.message;
        submitBtn.disabled = false;
        render();
      }
    });
  }

  const migrationForm = document.getElementById("migration-form");
  if (migrationForm) {
    migrationForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(migrationForm);
      const submitBtn = document.getElementById("migration-submit");
      submitBtn.disabled = true;
      state.modal.error = "";
      try {
        const result = await api("/migrations/run", { method: "POST", body: { sql: fd.get("sql") } });
        state.modal.result = result;
        render();
      } catch (err) {
        state.modal.error = err.message;
        render();
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  const createAdminForm = document.getElementById("create-admin-form");
  if (createAdminForm) {
    createAdminForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(createAdminForm);
      const body = Object.fromEntries(fd.entries());
      const submitBtn = document.getElementById("create-admin-submit");
      submitBtn.disabled = true;
      state.modal.error = "";
      try {
        await api("/admins", { method: "POST", body });
        createAdminForm.reset();
        await refreshAdminsModal();
      } catch (err) {
        state.modal.error = err.message;
        render();
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  root.querySelectorAll(".apply-admin-role").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      const select = root.querySelector(`.admin-role-select[data-id="${id}"]`);
      btn.disabled = true;
      state.modal.error = "";
      try {
        await api(`/admins/${id}`, { method: "PATCH", body: { role: select.value } });
        state.modal.info = "রোল আপডেট হয়েছে।";
        await refreshAdminsModal();
      } catch (err) {
        state.modal.error = err.message;
        render();
      }
    });
  });

  root.querySelectorAll(".open-delete-admin").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      if (!window.confirm("এই এডমিন অ্যাকাউন্টটি স্থায়ীভাবে মুছে ফেলতে চান?")) return;
      btn.disabled = true;
      state.modal.error = "";
      try {
        await api(`/admins/${id}`, { method: "DELETE" });
        await refreshAdminsModal();
      } catch (err) {
        state.modal.error = err.message;
        render();
      }
    });
  });
}

async function openAdminsModal() {
  state.modal = { type: "admins", admins: [], loading: true, error: "", info: "" };
  render();
  try {
    state.modal.admins = await api("/admins");
  } catch (err) {
    state.modal.error = err.message;
  } finally {
    state.modal.loading = false;
    render();
  }
}

// Re-fetches the admin list into the already-open modal (used after
// create/update-role/delete) without closing it, so the operator can keep
// making changes without reopening the modal each time.
async function refreshAdminsModal() {
  try {
    state.modal.admins = await api("/admins");
    state.modal.error = "";
  } catch (err) {
    state.modal.error = err.message;
  } finally {
    render();
  }
}

async function openPaymentModal(institutionId) {
  state.modal = { type: "payment", institutionId, payments: [], loading: true, error: "" };
  render();
  try {
    state.modal.payments = await api(`/institutions/${institutionId}/payments`);
  } catch (err) {
    state.modal.error = err.message;
  } finally {
    state.modal.loading = false;
    render();
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
  // Signals the reload-only splash screen (index.html / reload-splash.js)
  // that the panel has finished its first render, so it can fade out.
  window.dispatchEvent(new Event("app:ready"));
})();
