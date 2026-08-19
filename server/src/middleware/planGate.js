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
// ============================================================================

const tenantContext = require("../tenantContext");
const { planAllows, minPlanForInstitution, FEATURE_META } = require("../config/planFeatures");

const PLAN_LABEL_BN = { basic: "Basic", standard: "Standard", pro: "Pro", premium: "Premium" };

function requirePlanFeature(feature) {
  return function planGateMiddleware(req, res, next) {
    const ctx = tenantContext.get();
    // No institution in context -> single-tenant deployment -> never gate.
    if (!ctx?.institution) return next();

    const institution = ctx.institution;
    // docs/GENERAL_MODE_PLAN.md, Phase 3 — institution_type can force a
    // feature off (currently just hifzTracking for non-madrasah types)
    // regardless of plan tier, so a general-type tenant can't reach a
    // madrasah-only route even by calling the API directly.
    if (planAllows(institution.plan, feature, institution.institution_type)) return next();

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

    return res.status(403).json({
      error,
      planFeatureLocked: feature,
      currentPlan: institution.plan,
      requiredPlan: required,
    });
  };
}

module.exports = { requirePlanFeature };
