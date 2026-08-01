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

const PLAN_FEATURES = {
  basic: {
    customDomain: false,
  },
  pro: {
    customDomain: true,
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
