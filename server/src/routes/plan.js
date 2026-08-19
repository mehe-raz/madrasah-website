const express = require("express");
const tenantContext = require("../tenantContext");
const { getPlanFeatures, FEATURE_META, PLAN_ORDER, minPlanForInstitution } = require("../config/planFeatures");

const router = express.Router();

// Deliberately separate from routes/settings.js's existing GET /plan
// (which stays "settings"-permission-gated, used by the Admin-only domain
// section). Phase 6's frontend paywall needs every role — Teacher,
// Accountant, Hostel Manager, not just Admin/Super Admin — to know which
// of ITS OWN pages are plan-locked (PlanFeatureGate, Sidebar locked state).
// "plan" is intentionally absent from ROUTE_PERMISSION in
// config/roles.js, so rbacMiddleware's default (unlisted top-level
// segment => next()) lets any authenticated user reach this route without
// touching rbac.js/roles.js (both protected paths per AGENTS.md). Only
// feature booleans + display labels are returned here — no settings data —
// so no extra permission gate is needed beyond the existing global
// requireAuth (see index.js's app.use("/api", ..., requireAuth, ...)).
//
// No-op (404) outside multi-tenant mode, same reasoning as
// routes/settings.js's requireTenantContext — a single-tenant deployment
// has no registry.institutions row / plan concept, so the client should
// treat a 404 here as "everything unlocked", not "everything locked".
router.get("/", (req, res) => {
  const ctx = tenantContext.get();
  if (!ctx?.institution) {
    return res.status(404).json({ error: "এই ফিচারটি এই ডিপ্লয়মেন্টে উপলব্ধ নয়" });
  }
  const institution = ctx.institution;
  // docs/GENERAL_MODE_PLAN.md, Phase 3 — minPlan is computed per-request
  // (not once at module load, unlike before) because it now depends on this
  // institution's type too: for a general-type tenant, hifzTracking's
  // minPlan comes back null (no plan unlocks it), not "standard" — so the
  // frontend's upgrade card never wrongly suggests upgrading for a feature
  // upgrading can't unlock.
  const featureMeta = Object.fromEntries(
    Object.entries(FEATURE_META).map(([key, meta]) => [
      key,
      { ...meta, minPlan: minPlanForInstitution(key, institution.institution_type) },
    ])
  );
  res.json({
    plan: institution.plan,
    features: getPlanFeatures(institution.plan, institution.institution_type),
    featureMeta,
    planOrder: PLAN_ORDER,
  });
});

module.exports = router;
