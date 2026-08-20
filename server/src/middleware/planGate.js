// ============================================================================
// middleware/planGate.js  (Phase 6 — real plan-feature enforcement)
// ============================================================================
// Companion to middleware/rbac.js: rbac answers "can this ROLE use this
// route", this answers "does this INSTITUTION's PLAN include this feature
// at all". Both checks run independently — a Teacher on a Pro-plan
// institution still needs the "income" permission to touch payments, and a
// Super Admin on a Basic-plan institution still can't reach it without
// upgrading.
//
// Single-tenant deployments (MULTI_TENANT_MODE off, or any request that
// somehow reaches a route outside tenant-resolution middleware) have no
// institution/plan concept at all — same reasoning as requireTenantContext
// in routes/settings.js — so this never gates them; every feature is
// unconditionally available there, matching how the app worked before
// multi-tenancy existed.
//
// Phase 8 fix — the actual allow/deny decision now lives in
// evaluatePlanGate() below, a plain function with no tenantContext/Express
// dependency (same reasoning as rbac.js's canAccess(): testing the real
// decision logic directly is more reliable than driving a full Express
// middleware call through a mocked AsyncLocalStorage). planGateMiddleware
// is now a thin wrapper: it reads the request context, calls
// evaluatePlanGate(), and translates the result into next()/403.
// ============================================================================

const tenantContext = require("../tenantContext");
const { planAllows, minPlanForInstitution, FEATURE_META } = require("../config/planFeatures");

const PLAN_LABEL_BN = { basic: "Basic", standard: "Standard", pro: "Pro", premium: "Premium" };

// Pure decision function — no Express req/res, no tenantContext. Given an
// institution ({ plan, institution_type }) or null/undefined (single-tenant,
// no tenant context) and the feature key being gated, returns either
// { allowed: true } or { allowed: false, body: <403 JSON payload> }.
// Callers (the Express middleware below, and tests) both go through this
// single place so the actual gating rule can never drift between what's
// tested and what runs in production.
function evaluatePlanGate(institution, feature) {
  // No institution -> single-tenant deployment -> never gate.
  if (!institution) return { allowed: true };

  if (planAllows(institution.plan, feature, institution.institution_type)) {
    return { allowed: true };
  }

  // Lowest plan (if any) that unlocks `feature` for THIS institution's
  // type — null here can mean either "not built yet" (Coming Soon) or
  // "not applicable to this institution type" (e.g. hifzTracking for a
  // general-type tenant); the label picked below distinguishes the two.
  const required = minPlanForInstitution(feature, institution.institution_type);
  const label = FEATURE_META[feature]?.label || feature;
  const upgradeTo = required ? PLAN_LABEL_BN[required] || required : null;

  let error;
  if (upgradeTo) {
    error = `"${label}" ফিচারটি আপনার বর্তমান প্ল্যানে অন্তর্ভুক্ত নয়। ${upgradeTo} প্ল্যানে আপগ্রেড করুন।`;
  } else if (FEATURE_META[feature]?.comingSoon) {
    error = `"${label}" ফিচারটি এখনো চালু হয়নি (শীঘ্রই আসছে)।`;
  } else {
    error = `"${label}" ফিচারটি আপনার প্রতিষ্ঠানের ধরনের জন্য প্রযোজ্য নয়।`;
  }

  return {
    allowed: false,
    body: {
      error,
      planFeatureLocked: feature,
      currentPlan: institution.plan,
      requiredPlan: required,
    },
  };
}

function requirePlanFeature(feature) {
  return function planGateMiddleware(req, res, next) {
    const ctx = tenantContext.get();
    const result = evaluatePlanGate(ctx?.institution, feature);
    if (result.allowed) return next();
    return res.status(403).json(result.body);
  };
}

module.exports = { requirePlanFeature, evaluatePlanGate };
