const express = require("express");
const tenantContext = require("../tenantContext");
const { getPlanFeatures, FEATURE_META, PLAN_ORDER, minPlanFor } = require("../config/planFeatures");

// Enriched once at module load (FEATURE_META/PLAN_FEATURES are static), not
// per-request: adds `minPlan` (lowest tier that unlocks each feature, or
// null for "Coming Soon" keys not on any tier yet) so the frontend's
// upgrade message ("প্রো প্ল্যানে আপগ্রেড করুন") doesn't have to duplicate
// planFeatures.js's tier logic — this is the one place that reads it.
const FEATURE_META_WITH_MIN_PLAN = Object.fromEntries(
  Object.entries(FEATURE_META).map(([key, meta]) => [key, { ...meta, minPlan: minPlanFor(key) }])
);

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
  res.json({
    plan: institution.plan,
    features: getPlanFeatures(institution.plan),
    featureMeta: FEATURE_META_WITH_MIN_PLAN,
    planOrder: PLAN_ORDER,
  });
});

module.exports = router;
