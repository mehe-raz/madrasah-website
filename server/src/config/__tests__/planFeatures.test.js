import { describe, it, expect } from "vitest";
import {
  PLAN_ORDER,
  getPlanFeatures,
  planAllows,
  minPlanFor,
  minPlanForInstitution,
} from "../planFeatures.js";

// docs/GENERAL_MODE_PLAN.md, Phase 8 — pins down the exact behavior Phase 3
// introduced: hifzTracking is forced off for every "general"-type
// institution regardless of plan tier, while every other gated feature
// (feesCollection, expenses, reportsExport, ...) is completely unaffected
// by institution_type and only depends on plan. If a future change to
// INSTITUTION_TYPE_FEATURE_OVERRIDES in planFeatures.js accidentally widens
// or narrows this, these tests fail loudly instead of silently drifting —
// same intent as rbac.test.js's ROUTE_PERMISSION table sanity check.
describe("institution_type override — hifzTracking", () => {
  it("is off for a general-type institution on every plan tier, even the top one", () => {
    for (const plan of PLAN_ORDER) {
      expect(getPlanFeatures(plan, "general").hifzTracking).toBe(false);
      expect(planAllows(plan, "hifzTracking", "general")).toBe(false);
    }
  });

  it("follows the normal plan-tier rule for a madrasah-type institution (same as no override at all)", () => {
    expect(getPlanFeatures("basic", "madrasah").hifzTracking).toBe(false);
    expect(getPlanFeatures("standard", "madrasah").hifzTracking).toBe(true);
    expect(getPlanFeatures("pro", "madrasah").hifzTracking).toBe(true);
    expect(getPlanFeatures("premium", "madrasah").hifzTracking).toBe(true);
  });

  it("defaults to madrasah's (unrestricted) behavior when institutionType is omitted — backward compatibility for pre-Phase-3 callers", () => {
    expect(getPlanFeatures("standard", undefined).hifzTracking).toBe(true);
    expect(getPlanFeatures("basic", undefined).hifzTracking).toBe(false);
  });

  it("minPlanForInstitution returns null for general (no plan unlocks it) but the real tier for madrasah", () => {
    expect(minPlanForInstitution("hifzTracking", "general")).toBeNull();
    expect(minPlanForInstitution("hifzTracking", "madrasah")).toBe("standard");
    // Sanity: minPlanFor (no institution type — used where institution isn't
    // known yet, e.g. the public pricing page) ignores the override entirely.
    expect(minPlanFor("hifzTracking")).toBe("standard");
  });
});

// The override list only ever names hifzTracking today (see
// INSTITUTION_TYPE_FEATURE_OVERRIDES in planFeatures.js) — every other
// feature key must resolve purely from the plan tier, unaffected by
// institution_type. Guards against a copy-paste mistake silently adding a
// second override for the wrong feature.
describe("institution_type override — everything else is untouched", () => {
  const OTHER_FEATURES = [
    "customDomain",
    "feesCollection",
    "expenses",
    "reportsExport",
    "assignmentsBroadcast",
    "auditLogs",
    "payroll",
    "library",
    "idCards",
    "hostel",
    "sms",
    "bkash",
  ];

  it("gives identical results for madrasah and general on every other feature x plan combination", () => {
    for (const plan of PLAN_ORDER) {
      const madrasah = getPlanFeatures(plan, "madrasah");
      const general = getPlanFeatures(plan, "general");
      for (const feature of OTHER_FEATURES) {
        expect(general[feature]).toBe(madrasah[feature]);
      }
    }
  });
});
