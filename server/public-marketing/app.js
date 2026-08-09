// ============================================================================
// Public marketing site (Step 3+4). Plain JS, no framework/build step — same
// approach as public-platform/app.js. Only ever talks to /api/public/signup.
// ============================================================================

const API = "/api/public";
const root = document.getElementById("app");

// ---------------------------------------------------------------------------
// Small inline-SVG icon set — same rationale as server/public-platform/app.js
// (plain JS, no build step, so lucide-react from client/src/lib/icons.ts
// can't be imported here). Outline style matches the rest of the app.
// ---------------------------------------------------------------------------
function svgIcon(paths, size) {
  return `<svg width="${size || 22}" height="${size || 22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

const ICONS = {
  students: svgIcon('<path d="m22 10-10-5L2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/>'),
  calendar: svgIcon('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  book: svgIcon('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>'),
  taka: svgIcon('<path d="M7 2v13a4 4 0 0 0 4 4h1"/><path d="M7 8h10"/><path d="M4 12h8"/>'),
  bell: svgIcon('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
  lock: svgIcon('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  celebrate: svgIcon('<path d="M4 22 8 6l10 10-16 6Z"/><path d="M13 3l1.5 3M18 6l3 1.5M20 11l3 1"/>', 18),
};

let state = {
  submitting: false,
  error: "",
  result: null, // { institution, loginUrl } after a successful signup
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

// Loose client-side mirror of server/src/registryDb.js's assertValidCode —
// only used to slugify what the user types into the "code" field and to
// give an instant hint; the server re-validates for real.
function slugify(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .replace(/-{2,}/g, "-");
}

const FEATURES = [
  { icon: ICONS.students, title: "শিক্ষার্থী ব্যবস্থাপনা", desc: "ভর্তি থেকে শুরু করে শিক্ষার্থীর সম্পূর্ণ তথ্য, একই জায়গা থেকে।" },
  { icon: ICONS.calendar, title: "হাজিরা ও রেজাল্ট", desc: "দৈনিক হাজিরা, পরীক্ষার ফলাফল ও রিপোর্ট — কয়েক ক্লিকেই।" },
  { icon: ICONS.book, title: "হিফজ ট্র্যাকিং", desc: "প্রতিটি শিক্ষার্থীর হিফজ অগ্রগতি নিয়মিত রেকর্ড করুন।" },
  { icon: ICONS.taka, title: "আয়-ব্যয় ও পেমেন্ট", desc: "বেতন, খরচ ও প্রতিষ্ঠানের হিসাব — স্বচ্ছ ও সহজ।" },
  { icon: ICONS.bell, title: "নোটিফিকেশন", desc: "গুরুত্বপূর্ণ আপডেট অভিভাবক ও স্টাফদের কাছে সরাসরি পৌঁছে দিন।" },
  { icon: ICONS.lock, title: "নিরাপদ ও নির্ভরযোগ্য", desc: "প্রতিটি প্রতিষ্ঠানের তথ্য আলাদা ও সুরক্ষিত।" },
];

function heroHtml() {
  return `
    <header class="nav wrap">
      <div class="brand"><span class="brand-mark">M</span> Madrasah ERP</div>
      <button class="nav-cta" data-action="scroll-signup">ফ্রি একাউন্ট খুলুন</button>
    </header>
    <section class="hero wrap">
      <h1>আপনার মাদ্রাসা/প্রতিষ্ঠান <span class="accent">সম্পূর্ণ ডিজিটাল</span> করুন</h1>
      <p>শিক্ষার্থী, হাজিরা, হিফজ, ফলাফল, আয়-ব্যয় ও পেমেন্ট — সবকিছু এক জায়গায়। কার্ড লাগবে না, এখনই ফ্রি ট্রায়াল শুরু করুন।</p>
      <div class="hero-actions">
        <button class="btn btn-primary" data-action="scroll-signup">এক ক্লিকে অ্যাকাউন্ট খুলুন</button>
      </div>
    </section>
    <section class="features wrap">
      ${FEATURES.map(
        (f) => `
        <div class="feature-card">
          <div class="icon">${f.icon}</div>
          <h3>${escapeHtml(f.title)}</h3>
          <p>${escapeHtml(f.desc)}</p>
        </div>`
      ).join("")}
    </section>
  `;
}

function signupFormHtml() {
  if (state.result) {
    const { institution, loginUrl } = state.result;
    return `
      <div class="signup-card" id="signup">
        <div class="form-success">
          ${ICONS.celebrate} <strong>${escapeHtml(institution.name)}</strong> এর একাউন্ট সফলভাবে তৈরি হয়েছে!<br/>
          এখন আপনার তৈরি করা ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করুন।
          ${loginUrl ? `<div><a href="${escapeHtml(loginUrl)}">লগইন পেজে যান →</a></div>` : ""}
        </div>
      </div>
    `;
  }

  return `
    <div class="signup-card" id="signup">
      <h2>ফ্রি অ্যাকাউন্ট খুলুন</h2>
      <p class="sub">কোনো কার্ড লাগবে না — সাথে সাথেই ব্যবহার শুরু করুন</p>
      ${state.error ? `<div class="form-error">${escapeHtml(state.error)}</div>` : ""}
      <form id="signup-form">
        <div class="field">
          <label for="f-name">প্রতিষ্ঠানের নাম</label>
          <input id="f-name" name="name" type="text" required placeholder="যেমনঃ আল-ইহসান মাদরাসা" />
        </div>
        <div class="field">
          <label for="f-code">সাবডোমেইন কোড</label>
          <input id="f-code" name="code" type="text" required placeholder="al-ihsan" pattern="[a-z][a-z0-9-]{1,30}" />
          <div class="hint">শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও হাইফেন — এটি হবে আপনার ঠিকানা।</div>
          <div class="domain-preview" id="domain-preview"></div>
        </div>
        <div class="field">
          <label for="f-admin-name">আপনার নাম</label>
          <input id="f-admin-name" name="adminName" type="text" placeholder="আপনার নাম" />
        </div>
        <div class="field">
          <label for="f-email">ইমেইল</label>
          <input id="f-email" name="adminEmail" type="email" required placeholder="you@example.com" />
        </div>
        <div class="field">
          <label for="f-password">পাসওয়ার্ড</label>
          <input id="f-password" name="adminPassword" type="password" required minlength="8" placeholder="কমপক্ষে ৮ অক্ষর" />
        </div>
        <div class="field field--checkbox">
          <label for="f-terms">
            <input id="f-terms" name="acceptTerms" type="checkbox" required />
            <span>আমি <a href="/terms.html" target="_blank" rel="noopener noreferrer">শর্তাবলী</a> ও <a href="/privacy.html" target="_blank" rel="noopener noreferrer">গোপনীয়তা নীতি</a> মেনে নিচ্ছি</span>
          </label>
        </div>
        <button class="submit-btn" type="submit" ${state.submitting ? "disabled" : ""}>
          ${state.submitting ? "তৈরি হচ্ছে…" : "অ্যাকাউন্ট তৈরি করুন"}
        </button>
      </form>
    </div>
  `;
}

function footerHtml() {
  return `<div class="footer wrap">© ${new Date().getFullYear()} Madrasah ERP — সব অধিকার সংরক্ষিত</div>`;
}

function render() {
  root.innerHTML = `${heroHtml()}<section class="signup-section wrap">${signupFormHtml()}</section>${footerHtml()}`;
  attachEvents();
}

function attachEvents() {
  root.querySelectorAll('[data-action="scroll-signup"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("signup")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const codeInput = document.getElementById("f-code");
  const preview = document.getElementById("domain-preview");
  if (codeInput && preview) {
    const updatePreview = () => {
      const slug = slugify(codeInput.value);
      preview.textContent = slug ? `আপনার ঠিকানা হবেঃ ${slug}.yourapp.com` : "";
    };
    codeInput.addEventListener("input", () => {
      codeInput.value = slugify(codeInput.value);
      updatePreview();
    });
    updatePreview();
  }

  const form = document.getElementById("signup-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (state.submitting) return;
      const fd = new FormData(form);
      const body = {
        name: fd.get("name"),
        code: fd.get("code"),
        adminName: fd.get("adminName"),
        adminEmail: fd.get("adminEmail"),
        adminPassword: fd.get("adminPassword"),
      };
      state.submitting = true;
      state.error = "";
      render();
      try {
        const data = await api("/signup", { method: "POST", body });
        state.result = data;
      } catch (err) {
        state.error = err.message || "একাউন্ট তৈরি করা যায়নি";
      } finally {
        state.submitting = false;
        render();
      }
    });
  }
}

render();
