import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";

// Three earlier attempts (vi.mock, vi.mock + vi.hoisted, spyOn a plain ESM
// `import`) all silently fell through to the *real* pg pool. The root
// cause: server/package.json sets "type": "commonjs", but this __tests__
// folder overrides to "type": "module" (see __tests__/package.json) — so
// Vitest's own ESM loader gives this file a *separate* module record for
// db.js than the one teacherScope.js gets via its plain `require("../db")`
// (which resolves through Node's real, singleton require.cache). Any
// mock/spy applied to the ESM-imported copy simply never touched the
// object teacherScope.js was actually calling.
//
// Fix: use Node's real `require()` (via createRequire) for both db.js and
// teacherScope.js here, so this test and teacherScope.js resolve "../db"
// through the exact same require.cache entry — guaranteed to be the same
// object, no module-loader boundary in between. pg.js's `new Pool(...)` is
// lazy (no connection attempt until a query actually runs), so requiring
// db.js here has no side effects until we replace `db.all`.
const require = createRequire(import.meta.url);
const db = require("../../db.js");
const { attachTeacherClasses, classesForTeacher } = require("../teacherScope.js");

describe("classesForTeacher", () => {
  let allSpy;

  beforeEach(() => {
    allSpy = vi.spyOn(db, "all").mockResolvedValue([]);
  });

  afterEach(() => {
    allSpy.mockRestore();
  });

  it("returns the class names assigned to a teacher", async () => {
    allSpy.mockResolvedValueOnce([{ class: "Class 6" }, { class: "Class 7" }]);
    const result = await classesForTeacher(42);
    expect(result).toEqual(["Class 6", "Class 7"]);
    expect(allSpy).toHaveBeenCalledWith(expect.stringContaining("teacher_class_assignments"), [42]);
  });

  it("returns an empty array when nothing is assigned yet", async () => {
    allSpy.mockResolvedValueOnce([]);
    expect(await classesForTeacher(7)).toEqual([]);
  });
});

describe("attachTeacherClasses", () => {
  let allSpy;

  beforeEach(() => {
    allSpy = vi.spyOn(db, "all").mockResolvedValue([]);
  });

  afterEach(() => {
    allSpy.mockRestore();
  });

  it("skips non-Teacher roles and leaves req.teacherClasses unset", async () => {
    const req = { user: { id: 1, role: "Admin" } };
    const next = vi.fn();
    await attachTeacherClasses(req, {}, next);
    expect(req.teacherClasses).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
    expect(allSpy).not.toHaveBeenCalled();
  });

  it("skips when there is no authenticated user", async () => {
    const req = {};
    const next = vi.fn();
    await attachTeacherClasses(req, {}, next);
    expect(req.teacherClasses).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("sets req.teacherClasses to the assigned class list for a Teacher", async () => {
    allSpy.mockResolvedValueOnce([{ class: "Class 5" }]);
    const req = { user: { id: 9, role: "Teacher" } };
    const next = vi.fn();
    await attachTeacherClasses(req, {}, next);
    expect(req.teacherClasses).toEqual(["Class 5"]);
    expect(next).toHaveBeenCalledWith();
  });

  it("sets req.teacherClasses to an empty array for a Teacher with nothing assigned", async () => {
    allSpy.mockResolvedValueOnce([]);
    const req = { user: { id: 9, role: "Teacher" } };
    const next = vi.fn();
    await attachTeacherClasses(req, {}, next);
    expect(req.teacherClasses).toEqual([]);
  });

  it("forwards a lookup failure to next() instead of throwing", async () => {
    const boom = new Error("db down");
    allSpy.mockRejectedValueOnce(boom);
    const req = { user: { id: 9, role: "Teacher" } };
    const next = vi.fn();
    await attachTeacherClasses(req, {}, next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});
