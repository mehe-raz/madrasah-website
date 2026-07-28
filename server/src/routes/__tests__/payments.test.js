import { describe, it, expect, vi } from "vitest";

vi.mock("../../db", () => ({}));
vi.mock("../../middleware/rbac", () => ({ requirePermission: () => (req, res, next) => next() }));
vi.mock("../../lib/receiptCounter", () => ({ nextReceipt: async () => "R-1" }));
vi.mock("../../lib/auditLog", () => ({ recordAudit: async () => {} }));

import paymentsRouter from "../payments.js";
const { clampInt } = paymentsRouter;

describe("clampInt (payments pagination helper)", () => {
  it("falls back to default for non-numeric input", () => {
    expect(clampInt("abc", 25, 1, 100)).toBe(25);
    expect(clampInt(undefined, 25, 1, 100)).toBe(25);
  });

  it("clamps values below the minimum", () => {
    expect(clampInt(0, 1, 1, 100)).toBe(1);
    expect(clampInt(-5, 1, 1, 100)).toBe(1);
  });

  it("clamps values above the maximum", () => {
    expect(clampInt(9999, 25, 1, 100)).toBe(100);
  });

  it("accepts values within range unchanged", () => {
    expect(clampInt("42", 25, 1, 100)).toBe(42);
  });
});
