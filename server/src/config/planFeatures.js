// ============================================================================
// config/planFeatures.js  (Step 5 — Plan-gating rules; Phase 6 — real gates)
// ============================================================================
// Single source of truth for "which plan can use which feature". Both the
// backend (routes/*.js, before letting a request through; routes/settings.js
// for the custom-domain check) and the frontend (to lock/unlock UI, and to
// render the public pricing page) read from this same shape, so the two can
// never drift apart the way two separately-hand-maintained copies would.
//
// Add a new gated feature by adding one more key here — every plan object
// below must then list it explicitly (no implicit default), so a missing
// entry is a loud bug at review time, not a silent false/true guess.
//
// Tier structure decided by the user 2026-08-05, matching what's actually
// built in this repo:
//   basic    -> Students, Attendance, Results, Notices/Website, Guardian
//               Portal (never gated at all — these routes don't check a
//               feature flag, so they're implicitly free on every tier).
//   standard -> + Fees/Payments Collection, Expenses, Reports, Hifz
//               Tracking, Assignments broadcast.
//   pro      -> + Custom Domain, Audit Logs (Backup/Restore and
//               Multi-branch are future Phase 7+ work, not gated yet
//               because they aren't finished/built).
//   premium  -> same working features as pro, PLUS the "Coming Soon" keys
//               below — these stay `false` until the module genuinely
//               exists in the codebase (payroll, library, ID cards,
//               hostel, bKash still don't). The user builds and flips
//               these on ONE AT A TIME; when a module ships, turn its key
//               `true` for `premium` here — that's the only change needed
//               to activate it for premium tenants. `sms` was the first to
//               flip (Phase 8D, 2026-08-06) — see routes/sms.js.
//
// This is now a REAL paywall (not the earlier non-breaking scaffolding):
// any institution whose `plan` isn't at least the tier a feature requires
// gets a 403 from the route, and the frontend nav/pages show a locked
// "upgrade" state instead of the page. Existing/demo tenants currently on
// `plan = "basic"` will lose access to Fees/Expenses/Hifz/Reports/
// Assignments/Audit-Logs until their plan is changed from the Super-Admin
// panel (routes/platform.js PATCH .../subscription) — per the user's
// explicit instruction, since these are demo accounts to be reassigned or
// deleted, not real paying customers yet.
const PLAN_FEATURES = {
  basic: {
    customDomain: false,
    feesCollection: false,
    expenses: false,
    hifzTracking: false,
    reportsExport: false,
    assignmentsBroadcast: false,
    auditLogs: false,
    payroll: false,
    library: false,
    idCards: false,
    hostel: false,
    sms: false,
    bkash: false,
  },
  standard: {
    customDomain: false,
    feesCollection: true,
    expenses: true,
    hifzTracking: true,
    reportsExport: true,
    assignmentsBroadcast: true,
    auditLogs: false,
    payroll: false,
    library: false,
    idCards: false,
    hostel: false,
    sms: false,
    bkash: false,
  },
  pro: {
    customDomain: true,
    feesCollection: true,
    expenses: true,
    hifzTracking: true,
    reportsExport: true,
    assignmentsBroadcast: true,
    auditLogs: true,
    payroll: false,
    library: false,
    idCards: false,
    hostel: false,
    sms: false,
    bkash: false,
  },
  premium: {
    customDomain: true,
    feesCollection: true,
    expenses: true,
    hifzTracking: true,
    reportsExport: true,
    assignmentsBroadcast: true,
    auditLogs: true,
    // "Coming Soon" — flip to true one at a time as each module ships.
    // sms flipped 2026-08-06 (Phase 8D): the settings page, wallet ledger,
    // and manual top-up flow are now real (routes/sms.js, routes/platform.js).
    // bkash flipped 2026-08-06 (Phase 8E): institution self-connect of its
    // own bKash agent/merchant account is now real (routes/paymentGateway.js).
    // Guardian-facing payment collection itself is still Phase 8F, not this.
    payroll: false,
    library: false,
    idCards: false,
    hostel: false,
    sms: true,
    bkash: true,
  },
};

// Ordered weakest -> strongest. Used to compute "minimum plan required for
// feature X" for upgrade messaging (frontend + 403 responses), and to keep
// FEATURE_META's per-key "minPlan" honest without hand-maintaining it twice.
const PLAN_ORDER = ["basic", "standard", "pro", "premium"];

// Human labels + which modules are genuinely not-built-yet ("comingSoon").
// The pricing page and Settings > Plan screen both read this instead of
// hand-listing feature names, so this file stays the single source of
// truth even for display text.
const FEATURE_META = {
  feesCollection: { label: "ফি/পেমেন্ট কালেকশন", comingSoon: false },
  expenses: { label: "খরচ ব্যবস্থাপনা", comingSoon: false },
  hifzTracking: { label: "হিফজ ট্র্যাকিং", comingSoon: false },
  reportsExport: { label: "রিপোর্টস", comingSoon: false },
  assignmentsBroadcast: { label: "অ্যাসাইনমেন্ট/নোটিশ ব্রডকাস্ট", comingSoon: false },
  auditLogs: { label: "অডিট লগ", comingSoon: false },
  customDomain: { label: "কাস্টম ডোমেইন", comingSoon: false },
  payroll: { label: "পে-রোল", comingSoon: true },
  library: { label: "লাইব্রেরি ম্যানেজমেন্ট", comingSoon: true },
  idCards: { label: "আইডি কার্ড", comingSoon: true },
  hostel: { label: "হোস্টেল ম্যানেজমেন্ট", comingSoon: true },
  sms: { label: "এসএমএস নোটিফিকেশন", comingSoon: false },
  bkash: { label: "বিকাশ/নগদ পেমেন্ট", comingSoon: false },
};

// The two billing models the user wants supported (actual prices decided
// later, per-institution, from the Super-Admin panel — see
// registry.institutions.billing_model / price_amount in registry_schema.sql
// and routes/platform.js). This is metadata only, no numbers baked in.
const PRICING_MODELS = {
  student: { label: "প্রতি স্টুডেন্ট/মাস" },
  flat: { label: "ফ্ল্যাট রেট/মাস" },
};

// Falls back to "basic" (the most restrictive plan) for any unrecognized
// plan value, so a typo'd or not-yet-listed plan name can never
// accidentally unlock a paid feature.
function getPlanFeatures(plan) {
  return PLAN_FEATURES[plan] || PLAN_FEATURES.basic;
}

function planAllows(plan, feature) {
  return !!getPlanFeatures(plan)[feature];
}

// Lowest tier (by PLAN_ORDER) that has `feature` turned on. Returns null if
// no tier currently has it (e.g. a genuinely not-built "Coming Soon" key) —
// callers should treat null as "not available on any plan yet".
function minPlanFor(feature) {
  for (const plan of PLAN_ORDER) {
    if (PLAN_FEATURES[plan]?.[feature]) return plan;
  }
  return null;
}

module.exports = {
  PLAN_FEATURES,
  PLAN_ORDER,
  FEATURE_META,
  PRICING_MODELS,
  getPlanFeatures,
  planAllows,
  minPlanFor,
};
