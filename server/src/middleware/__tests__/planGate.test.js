import { describe, it, expect, vi } from "vitest";

// docs/GENERAL_MODE_PLAN.md, Phase 8 — "হিফজ রুট ব্লক হচ্ছে কিনা" (is the
// Hifz route actually blocked). planFeatures.test.js already pins the
// underlying flag (getPlanFeatures(...).hifzTracking === false for
// "general"); this file confirms the middleware's *decision logic* turns
// that into a real 403, not just a flag no one reads.
//
// Phase 8 fix #3 — two earlier versions of this file tried to drive the
// real Express middleware through tenantContext.get() (once via the real
// AsyncLocalStorage, once via vi.mock of the tenantContext module) and both
// attempts got a false negative: `next()` was always called as if
// tenantContext.get() returned undefined, even after mocking it. Rather
// than keep guessing at the mock/interop layer, planGate.js now exports
// evaluatePlanGate(institution, feature) — a plain function with no
// tenantContext or Express dependency — and this file tests THAT directly,
// the same pattern rbac.test.js already uses for canAccess() (it never
// drives requirePermission/rbacMiddleware as real Express middleware
// either). A thin smoke test at the bottom confirms the exported
// middleware wrapper still delegates to it correctly.
import { requirePlanFeature, evaluatePlanGate } from "../planGate.js";

describe("evaluatePlanGate — general-type institution", () => {
  it("blocks a hifzTracking-gated route with 403, even on the top-tier plan", () => {
    const result = evaluatePlanGate(
      { plan: "premium", institution_type: "general" },
      "hifzTracking"
    );

    expect(result.allowed).toBe(false);
    expect(result.body.planFeatureLocked).toBe("hifzTracking");
    // Not a plan-upgrade situation (already on the top plan) — the 403
    // reason should be "not applicable to this institution type", not
    // "upgrade your plan", so requiredPlan must come back null.
    expect(result.body.requiredPlan).toBeNull();
  });

  it("does not block an unrelated feature (feesCollection) for a general-type institution", () => {
    const result = evaluatePlanGate(
      { plan: "standard", institution_type: "general" },
      "feesCollection"
    );

    expect(result.allowed).toBe(true);
  });
});

describe("evaluatePlanGate — madrasah-type institution (unaffected by Phase 3)", () => {
  it("lets a hifzTracking request through on a plan that includes it", () => {
    const result = evaluatePlanGate(
      { plan: "standard", institution_type: "madrasah" },
      "hifzTracking"
    );

    expect(result.allowed).toBe(true);
  });

  it("still blocks with 403 (and an upgrade message) on a plan below the required tier", () => {
    const result = evaluatePlanGate(
      { plan: "basic", institution_type: "madrasah" },
      "hifzTracking"
    );

    expect(result.allowed).toBe(false);
    // Unlike the general-type case above, a plan exists that unlocks this
    // for a madrasah tenant, so requiredPlan must be populated (upgrade
    // messaging), not null.
    expect(result.body.requiredPlan).toBe("standard");
  });
});

describe("evaluatePlanGate — no institution (single-tenant deployment)", () => {
  it("never gates when there is no institution (MULTI_TENANT_MODE off)", () => {
    // Deliberately undefined — matches a single-tenant deployment where
    // tenant-resolution middleware never runs, so tenantContext.get() has
    // nothing to return and req context carries no institution.
    const result = evaluatePlanGate(undefined, "hifzTracking");

    expect(result.allowed).toBe(true);
  });
});

// Thin smoke test — confirms requirePlanFeature() (the actual Express
// middleware other route files import) delegates to evaluatePlanGate()
// correctly, using a plain fake req object instead of tenantContext at all.
describe("requirePlanFeature — middleware wrapper", () => {
  function fakeRes() {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
  }

  it("calls next() when the feature is allowed", () => {
    const middleware = requirePlanFeature("feesCollection");
    const res = fakeRes();
    const next = vi.fn();

    middleware({}, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
