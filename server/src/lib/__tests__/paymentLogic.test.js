import { describe, it, expect } from "vitest";
import { isPaymentConflict, computeDueAfterPayment, computePaymentOutcome } from "../paymentLogic.js";

describe("isPaymentConflict", () => {
  it("flags a payment as conflicting when due is already 0", () => {
    expect(isPaymentConflict(0)).toBe(true);
  });

  it("flags a payment as conflicting when due is negative", () => {
    expect(isPaymentConflict(-50)).toBe(true);
  });

  it("treats missing/undefined due as 0 (conflict)", () => {
    expect(isPaymentConflict(undefined)).toBe(true);
    expect(isPaymentConflict(null)).toBe(true);
  });

  it("is not a conflict when due is positive", () => {
    expect(isPaymentConflict(500)).toBe(false);
  });
});

describe("computeDueAfterPayment", () => {
  it("marks the payment Completed when it exactly clears the due", () => {
    expect(computeDueAfterPayment(500, 500)).toEqual({ newDue: 0, status: "Completed" });
  });

  it("marks the payment Partial when it only reduces the due", () => {
    expect(computeDueAfterPayment(500, 200)).toEqual({ newDue: 300, status: "Partial" });
  });

  it("marks the payment Completed and clamps due at 0 when it overpays", () => {
    expect(computeDueAfterPayment(500, 800)).toEqual({ newDue: 0, status: "Completed" });
  });

  it("treats a missing/undefined amount as 0 (Partial, due unchanged)", () => {
    expect(computeDueAfterPayment(500, undefined)).toEqual({ newDue: 500, status: "Partial" });
  });

  it("coerces string numeric input the same as db-sourced values often arrive", () => {
    expect(computeDueAfterPayment("500", "500")).toEqual({ newDue: 0, status: "Completed" });
  });
});

describe("computePaymentOutcome", () => {
  it("returns a Flagged conflict outcome when due is already 0, ignoring the amount", () => {
    expect(computePaymentOutcome(0, 300)).toEqual({ isConflict: true, newDue: 0, status: "Flagged" });
  });

  it("returns a Flagged conflict outcome when due is negative, preserving the negative due", () => {
    expect(computePaymentOutcome(-100, 300)).toEqual({ isConflict: true, newDue: -100, status: "Flagged" });
  });

  it("returns a normal Partial outcome for a partial payment against a positive due", () => {
    expect(computePaymentOutcome(1000, 400)).toEqual({ isConflict: false, newDue: 600, status: "Partial" });
  });

  it("returns a normal Completed outcome when the payment clears the due exactly", () => {
    expect(computePaymentOutcome(1000, 1000)).toEqual({ isConflict: false, newDue: 0, status: "Completed" });
  });

  it("returns a normal Completed outcome when the payment overpays the due", () => {
    expect(computePaymentOutcome(1000, 1500)).toEqual({ isConflict: false, newDue: 0, status: "Completed" });
  });
});
