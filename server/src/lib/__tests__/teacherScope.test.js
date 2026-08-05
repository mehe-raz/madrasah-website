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

  it("returns every assigned class, in the order the (already-sorted) query gives back, for a multi-class teacher", async () => {
    allSpy.mockResolvedValueOnce([{ class: "Class 3" }, { class: "Class 5" }, { class: "Class 9" }]);
    expect(await classesForTeacher(11)).toEqual(["Class 3", "Class 5", "Class 9"]);
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

  // No-class edge case: routes/attendance.js and routes/results.js both
  // treat `req.teacherClasses` being *present but empty* as "scoped to
  // nothing" (they short-circuit to an empty result) rather than falling
  // back to unscoped access — this is the property those routes rely on,
  // so it's worth asserting on its own rather than only inside the assert
  // above.
  it("a Teacher with no assigned classes ends up with a defined-but-empty array, distinguishable from unscoped (undefined)", async () => {
    allSpy.mockResolvedValueOnce([]);
    const req = { user: { id: 9, role: "Teacher" } };
    await attachTeacherClasses(req, {}, vi.fn());
    expect(req.teacherClasses).not.toBeUndefined();
    expect(Array.isArray(req.teacherClasses)).toBe(true);
    expect(req.teacherClasses).toHaveLength(0);
  });

  it("sets req.teacherClasses to the full list for a Teacher assigned to multiple classes", async () => {
    allSpy.mockResolvedValueOnce([{ class: "Class 4" }, { class: "Class 6" }, { class: "Class 8" }]);
    const req = { user: { id: 21, role: "Teacher" } };
    const next = vi.fn();
    await attachTeacherClasses(req, {}, next);
    expect(req.teacherClasses).toEqual(["Class 4", "Class 6", "Class 8"]);
    expect(next).toHaveBeenCalledWith();
  });

  it("looks up classes using the Teacher's own user id, not some other id on the request", async () => {
    allSpy.mockResolvedValueOnce([{ class: "Class 2" }]);
    const req = { user: { id: 77, role: "Teacher" } };
    await attachTeacherClasses(req, {}, vi.fn());
    expect(allSpy).toHaveBeenCalledWith(expect.stringContaining("teacher_class_assignments"), [77]);
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
