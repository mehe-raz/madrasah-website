import { describe, it, expect } from "vitest";
import { canAccess, requirePermission, rbacMiddleware } from "../rbac.js";
import { ROLE_PERMISSIONS, ROUTE_PERMISSION } from "../../config/roles.js";

// Every route this app actually gates, and the exact set of roles allowed
// through it — hand-written against the current business rules in
// config/roles.js, not derived from canAccess itself, so a drift in
// ROLE_PERMISSIONS/ROUTE_PERMISSION shows up as a failing assertion here
// instead of silently changing behavior. If a role/route is intentionally
// added or removed, update this table in the same change (per AGENTS.md,
// roles.js is the single source of truth — this file just pins current
// expected behavior against it).
const ALL_ROLES = Object.keys(ROLE_PERMISSIONS);

const EXPECTED_ALLOWED = {
  "/api/dashboard": ["Super Admin", "Admin", "Accountant", "Hostel Manager"],
  "/api/delete-requests": ["Super Admin", "Admin", "Accountant", "Hostel Manager"],
  "/api/students": ["Super Admin", "Admin", "Hostel Manager"],
  "/api/attendance": ["Super Admin", "Admin", "Teacher", "Hostel Manager"],
  // Same "attendance" permission as /api/attendance above (docs/
  // ATTENDANCE_DEVICE_PLAN.md Phase 2) — admin device management, same
  // role tier as daily attendance itself, not a new permission bucket.
  "/api/attendance-devices": ["Super Admin", "Admin", "Teacher", "Hostel Manager"],
  "/api/payments": ["Super Admin", "Admin", "Accountant"],
  "/api/income": ["Super Admin", "Admin", "Accountant"],
  "/api/expenses": ["Super Admin", "Admin", "Accountant"],
  "/api/hifz": ["Super Admin", "Admin", "Teacher"],
  "/api/results": ["Super Admin", "Admin", "Teacher"],
  "/api/assignments": ["Super Admin", "Admin", "Teacher"],
  "/api/settings": ["Super Admin", "Admin"],
  "/api/users": ["Super Admin", "Admin"],
  "/api/backup": ["Super Admin", "Admin"],
  "/api/reports": ["Super Admin", "Admin", "Accountant"],
  "/api/audit-logs": ["Super Admin", "Admin"],
  "/api/site-content": ["Super Admin", "Admin"],
  "/api/admissions": ["Super Admin", "Admin"],
  "/api/class-options": ["Super Admin", "Admin", "Hostel Manager"],
  "/api/guardian-approvals": ["Super Admin", "Admin"],
  "/api/sms": ["Admin", "Super Admin"], //
  "/api/payment-gateway": ["Admin", "Super Admin"], // Phase 8E — bKash self-connect, same tier as /api/sms
  "/api/guardian-reminders": ["Admin", "Super Admin"], // Guardian Reminder Messenger (ad-hoc) — same "settings" tier as /api/sms above
  "/api/institution-billing": ["Admin", "Super Admin"], // Institution self-service platform-subscription billing (ad-hoc) — same "settings" tier as /api/payment-gateway above
};

describe("ROUTE_PERMISSION table sanity", () => {
  it("the expectations table above covers every currently-gated route (fails loudly if a route is added/removed)", () => {
    expect(Object.keys(EXPECTED_ALLOWED).sort()).toEqual(Object.keys(ROUTE_PERMISSION).sort());
  });
});

describe("canAccess — full role x route permission matrix", () => {
  for (const [route, allowedRoles] of Object.entries(EXPECTED_ALLOWED)) {
    const permission = ROUTE_PERMISSION[route];
    describe(route, () => {
      for (const role of ALL_ROLES) {
        const shouldAllow = allowedRoles.includes(role);
        it(`${shouldAllow ? "allows" : "denies"} ${role}`, () => {
          expect(canAccess(role, permission)).toBe(shouldAllow);
        });
      }
    });
  }

  it("denies an unknown/unrecognized role everywhere", () => {
    expect(canAccess("Nonexistent Role", "dashboard")).toBe(false);
    expect(canAccess(undefined, "income")).toBe(false);
  });

  it("Super Admin's wildcard (*) grants access to a permission that doesn't exist yet, by design", () => {
    expect(canAccess("Super Admin", "some-future-permission")).toBe(true);
  });
});

describe("requirePermission middleware", () => {
  function mockRes() {
    const res = {};
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body) => {
      res.body = body;
      return res;
    };
    return res;
  }

  it("returns 401 when there is no authenticated user", () => {
    const req = {};
    const res = mockRes();
    const next = () => {
      throw new Error("next() should not be called");
    };
    requirePermission("income")(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Login required" });
  });

  it("returns 403 when the user's role lacks the permission", () => {
    const req = { user: { id: 1, role: "Teacher" } };
    const res = mockRes();
    let nextCalled = false;
    requirePermission("income")(req, res, () => {
      nextCalled = true;
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Access denied" });
    expect(nextCalled).toBe(false);
  });

  it("calls next() with no error when the user's role has the permission", () => {
    const req = { user: { id: 2, role: "Accountant" } };
    const res = mockRes();
    let nextCalled = false;
    requirePermission("income")(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBeUndefined();
  });

  it("accepts an array of alternative permissions, allowing on any single match", () => {
    const req = { user: { id: 3, role: "Admin" } };
    const res = mockRes();
    let nextCalled = false;
    requirePermission(["websiteGallery", "somethingElseAdminLacks"])(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });
});

describe("rbacMiddleware (global route-prefix gate)", () => {
  function mockRes() {
    const res = {};
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body) => {
      res.body = body;
      return res;
    };
    return res;
  }

  it("passes through unauthenticated requests (auth routes themselves enforce login)", () => {
    const req = { path: "/students" };
    const res = mockRes();
    let nextCalled = false;
    rbacMiddleware(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBeUndefined();
  });

  it("passes through a path with no entry in ROUTE_PERMISSION (e.g. /api/auth)", () => {
    const req = { path: "/auth/login", user: { id: 1, role: "Teacher" } };
    const res = mockRes();
    let nextCalled = false;
    rbacMiddleware(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });

  it("denies a logged-in role hitting a gated route it doesn't have permission for", () => {
    const req = { path: "/students", user: { id: 1, role: "Accountant" } };
    const res = mockRes();
    rbacMiddleware(req, res, () => {
      throw new Error("next() should not be called");
    });
    expect(res.statusCode).toBe(403);
  });

  it("allows a logged-in role hitting a gated route it does have permission for", () => {
    const req = { path: "/students", user: { id: 1, role: "Hostel Manager" } };
    const res = mockRes();
    let nextCalled = false;
    rbacMiddleware(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });

  it("reads only the first path segment, ignoring nested sub-paths like /students/42/photo", () => {
    const req = { path: "/students/42/photo", user: { id: 1, role: "Accountant" } };
    const res = mockRes();
    rbacMiddleware(req, res, () => {
      throw new Error("next() should not be called");
    });
    expect(res.statusCode).toBe(403);
  });
});
