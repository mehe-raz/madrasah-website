import { describe, it, expect } from "vitest";
import { sanitizeSubjects, computeGrade, mergeSubjectIntoList } from "../results.js";

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

describe("computeGrade", () => {
  it("returns F when totalMarks is 0 or missing", () => {
    expect(computeGrade(0, 0)).toEqual({ gpa: "0.00", grade: "F" });
  });

  it("maps percentage tiers to the correct grade/gpa", () => {
    expect(computeGrade(85, 100)).toEqual({ gpa: "5.00", grade: "A+" });
    expect(computeGrade(75, 100)).toEqual({ gpa: "4.00", grade: "A" });
    expect(computeGrade(65, 100)).toEqual({ gpa: "3.50", grade: "A-" });
    expect(computeGrade(55, 100)).toEqual({ gpa: "3.00", grade: "B" });
    expect(computeGrade(45, 100)).toEqual({ gpa: "2.00", grade: "C" });
    expect(computeGrade(35, 100)).toEqual({ gpa: "1.00", grade: "D" });
    expect(computeGrade(20, 100)).toEqual({ gpa: "0.00", grade: "F" });
  });

  it("fails the whole result if any single subject is below 33%", () => {
    // High overall percentage (75%) but one subject at 20/100 (20%)
    const subjects = [
      { name: "Math", marks: 20, fullMarks: 100 },
      { name: "Arabic", marks: 90, fullMarks: 100 },
      { name: "Fiqh", marks: 90, fullMarks: 100 },
    ];
    const obtained = subjects.reduce((s, x) => s + x.marks, 0);
    const total = subjects.reduce((s, x) => s + x.fullMarks, 0);
    expect(computeGrade(obtained, total, subjects)).toEqual({ gpa: "0.00", grade: "F" });
  });

  it("ignores subjects with a non-positive fullMarks when checking the fail rule", () => {
    const subjects = [{ name: "Extra", marks: 0, fullMarks: 0 }, { name: "Math", marks: 80, fullMarks: 100 }];
    expect(computeGrade(80, 100, subjects)).toEqual({ gpa: "5.00", grade: "A+" });
  });
});

describe("mergeSubjectIntoList", () => {
  it("appends a new subject to an empty list", () => {
    const result = mergeSubjectIntoList([], { name: "Math", marks: 80, fullMarks: 100 });
    expect(result).toEqual([{ name: "Math", marks: 80, fullMarks: 100 }]);
  });

  it("appends a new subject alongside existing ones without touching them", () => {
    const existing = [{ name: "Math", marks: 80, fullMarks: 100 }];
    const result = mergeSubjectIntoList(existing, { name: "Arabic", marks: 70, fullMarks: 100 });
    expect(result).toEqual([
      { name: "Math", marks: 80, fullMarks: 100 },
      { name: "Arabic", marks: 70, fullMarks: 100 },
    ]);
    // original array is not mutated
    expect(existing).toHaveLength(1);
  });

  it("replaces an existing subject with the same name instead of duplicating it", () => {
    const existing = [
      { name: "Math", marks: 40, fullMarks: 100 },
      { name: "Arabic", marks: 70, fullMarks: 100 },
    ];
    const result = mergeSubjectIntoList(existing, { name: "Math", marks: 90, fullMarks: 100 });
    expect(result).toEqual([
      { name: "Math", marks: 90, fullMarks: 100 },
      { name: "Arabic", marks: 70, fullMarks: 100 },
    ]);
  });

  it("matches subject names case-insensitively and ignoring surrounding whitespace", () => {
    const existing = [{ name: "Math", marks: 40, fullMarks: 100 }];
    const result = mergeSubjectIntoList(existing, { name: "  math  ", marks: 95, fullMarks: 100 });
    expect(result).toHaveLength(1);
    expect(result[0].marks).toBe(95);
  });

  it("does not add a subject past the 20-subject cap", () => {
    const existing = Array.from({ length: 20 }, (_, i) => ({ name: `Subject ${i}`, marks: 50, fullMarks: 100 }));
    const result = mergeSubjectIntoList(existing, { name: "One Too Many", marks: 60, fullMarks: 100 });
    expect(result).toHaveLength(20);
  });

  it("still updates an already-present subject even when the list is at the cap", () => {
    const existing = Array.from({ length: 20 }, (_, i) => ({ name: `Subject ${i}`, marks: 50, fullMarks: 100 }));
    const result = mergeSubjectIntoList(existing, { name: "Subject 5", marks: 99, fullMarks: 100 });
    expect(result).toHaveLength(20);
    expect(result[5].marks).toBe(99);
  });
});
