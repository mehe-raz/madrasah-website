// ============================================================================
// config/planFeatures.js  (Step 5 — Plan-gating rules)
// ============================================================================
// Single source of truth for "which plan can use which feature". Both the
// backend (routes/settings.js, before actually applying a change) and the
// frontend (to lock/unlock UI) read from this same shape, so the two can
// never drift apart the way two separately-hand-maintained copies would.
//
// Add a new gated feature by adding one more key here — every plan object
// below must then list it explicitly (no implicit default), so a missing
// entry is a loud bug at review time, not a silent false/true guess.
// ============================================================================

// Phase 6 (scaffolding step) — 4 tiers now exist (basic/standard/pro/
// premium), matching what's actually built in this repo today. This step
// is deliberately NON-BREAKING: every feature that's already in active use
// by tenants regardless of their `plan` value (fees collection, Hifz
// tracking, reports, assignments broadcast, audit logs) is left `true` on
// every tier below, so no existing tenant loses access. Turning any of
// these into a real paywall is a separate, later decision (needs a
// migration plan for existing tenants' plan assignment first — see
// docs/BUSINESS_READINESS_ROADMAP.md Phase 6).
//
// The premium-only keys (payroll/library/idCards/hostel/sms/bkash) are
// `false` everywhere because those modules don't exist in the codebase yet
// — they're placeholders for "Coming Soon" marketing, not real gates on
// working features.
//
// customDomain keeps its existing behavior unchanged (pro+ only).
const PLAN_FEATURES = {
  basic: {
    customDomain: false,
    feesCollection: true,
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
  standard: {
    customDomain: false,
    feesCollection: true,
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
  pro: {
    customDomain: true,
    feesCollection: true,
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

module.exports = { PLAN_FEATURES, getPlanFeatures, planAllows };
