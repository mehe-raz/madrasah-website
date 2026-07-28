import { describe, it, expect } from "vitest";
import { sanitizeSubjects } from "../results.js";

describe("sanitizeSubjects", () => {
  it("returns an empty array for non-array input", () => {
    expect(sanitizeSubjects(null)).toEqual([]);
    expect(sanitizeSubjects(undefined)).toEqual([]);
    expect(sanitizeSubjects("not-an-array")).toEqual([]);
  });

  it("caps the list at 20 subjects", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ name: `Subject ${i}`, marks: 50, fullMarks: 100 }));
    expect(sanitizeSubjects(many)).toHaveLength(20);
  });

  it("clamps negative marks to 0", () => {
    const result = sanitizeSubjects([{ name: "Math", marks: -10, fullMarks: 100 }]);
    expect(result[0].marks).toBe(0);
  });

  it("defaults fullMarks to 100 when missing or invalid", () => {
    const result = sanitizeSubjects([{ name: "Math", marks: 40 }]);
    expect(result[0].fullMarks).toBe(100);
  });

  it("ensures fullMarks is never less than 1", () => {
    const result = sanitizeSubjects([{ name: "Math", marks: 40, fullMarks: -5 }]);
    expect(result[0].fullMarks).toBe(1);
  });

  it("falls back to 100 when fullMarks is 0 (falsy)", () => {
    const result = sanitizeSubjects([{ name: "Math", marks: 40, fullMarks: 0 }]);
    expect(result[0].fullMarks).toBe(100);
  });

  it("trims subject names and truncates to 60 characters", () => {
    const longName = "A".repeat(80);
    const result = sanitizeSubjects([{ name: `  ${longName}  `, marks: 10, fullMarks: 100 }]);
    expect(result[0].name).toBe(longName.slice(0, 60));
  });
});
