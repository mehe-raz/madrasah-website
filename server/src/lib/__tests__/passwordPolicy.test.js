import { describe, it, expect } from "vitest";
import { passwordPolicyError } from "../passwordPolicy.js";

describe("passwordPolicyError", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(passwordPolicyError("Ab1!")).toBe("Password must be at least 8 characters");
  });

  it("rejects empty/missing passwords", () => {
    expect(passwordPolicyError("")).toBe("Password must be at least 8 characters");
    expect(passwordPolicyError(undefined)).toBe("Password must be at least 8 characters");
  });

  it("rejects passwords longer than 128 characters", () => {
    const tooLong = "Aa1!".repeat(40);
    expect(passwordPolicyError(tooLong)).toBe("Password is too long");
  });

  it("rejects passwords with fewer than 3 character classes", () => {
    expect(passwordPolicyError("abcdefgh123")).toBe(
      "Password must include at least 3 of: lowercase, uppercase, numbers, symbols"
    );
  });

  it("accepts a password with 3+ character classes and valid length", () => {
    expect(passwordPolicyError("Abcdefg1")).toBeNull();
  });

  it("accepts a password using all four character classes", () => {
    expect(passwordPolicyError("Abcdef1!")).toBeNull();
  });
});
