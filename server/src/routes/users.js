const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { createDeleteRequest } = require("../lib/deleteRequests");
const { isUniqueViolation } = require("../pg");
const { requirePermission } = require("../middleware/rbac");
const { recordAudit } = require("../lib/auditLog");
const { passwordPolicyError } = require("../lib/passwordPolicy");
const { classesForTeacher } = require("../lib/teacherScope");
const { getClassOptions } = require("../lib/classOptions");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("settings"));

const ROLES = ["Super Admin", "Admin", "Accountant", "Teacher", "Hostel Manager"];
const SALT_ROUNDS = 12;
const APPROVAL_ROLES = ["Super Admin", "Admin"];

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email || "", role: row.role, isProtected: !!row.isProtected };
}

function isApprovalRole(role) {
  return APPROVAL_ROLES.includes(role);
}

router.get("/", async (_req, res) => {
  // Previously this route had NO explicit role check and relied entirely on
  // the (broken) global rbacMiddleware — meaning any logged-in user, including
  // a Teacher, could list every user's name/email/role. Now guarded above by
  // router.use(requirePermission("settings")), which only Admin/Super Admin have.
  const rows = await db.all('SELECT id, name, email, role, "isProtected" FROM users ORDER BY id');
  const users = await Promise.all(
    rows.map(async (row) => {
      const u = publicUser(row);
      // Only Teachers are ever class-scoped (see lib/teacherScope.js) — no
      // point querying teacher_class_assignments for every other role.
      if (row.role === "Teacher") u.assignedClasses = await classesForTeacher(row.id);
      return u;
    })
  );
  res.json(users);
});

router.post("/", async (req, res) => {
  if (req.user?.role !== "Super Admin" && req.user?.role !== "Admin") {
    return res.status(403).json({ error: "Only admin can create users" });
  }
  const { name, role, email, password } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Name required" });
  if (!ROLES.includes(role)) return res.status(400).json({ error: "Invalid role" });
  if (role === "Super Admin" && req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can assign Super Admin role" });
  }
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }
  {
    const pwError = passwordPolicyError(password);
    if (pwError) return res.status(400).json({ error: pwError });
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const isProtected = role === "Super Admin" ? 1 : 0;
  try {
    const result = await db.run(
      `INSERT INTO users (name, role, email, "passwordHash", "isProtected")
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name.trim(), role, email.trim().toLowerCase(), hash, isProtected]
    );
    const row = await db.get('SELECT id, name, email, role, "isProtected" FROM users WHERE id = $1', [result.insertId]);
    await recordAudit({
      action: "user.created",
      actor: req.user,
      entityType: "user",
      entityId: row.id,
      label: `Created ${row.role}: ${row.name}`,
      details: { role: row.role, email: row.email || "" },
    });
    res.status(201).json(publicUser(row));
  } catch (e) {
    if (isUniqueViolation(e)) return res.status(409).json({ error: "Email already exists" });
    throw e;
  }
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get("SELECT * FROM users WHERE id = $1", [id]);
  if (!existing) return res.status(404).json({ error: "User not found" });

  const privilegedTarget = isApprovalRole(existing.role);
  const privilegedChangeNeedsApproval =
    privilegedTarget &&
    isApprovalRole(req.user?.role) &&
    (req.user?.id === existing.id ||
      req.body.name !== undefined ||
      req.body.email !== undefined ||
      req.body.role !== undefined ||
      req.body.password);

  if (privilegedTarget) {
    if (!isApprovalRole(req.user?.role)) return res.status(403).json({ error: "Cannot modify Admin or Super Admin" });
    if (existing.role === "Super Admin" && req.user?.role !== "Super Admin" && req.body.role && req.body.role !== "Super Admin") {
      return res.status(403).json({ error: "Only Super Admin can change Super Admin role" });
    }
    if (req.user?.id === existing.id && req.body.role && req.body.role !== "Super Admin") {
      return res.status(403).json({ error: "Super Admin role cannot be changed" });
    }
  }

  const { name, role, email, password } = req.body;
  if (privilegedChangeNeedsApproval) {
    const payload = {};
    if (name !== undefined) payload.name = String(name).trim();
    if (email !== undefined) payload.email = String(email).trim().toLowerCase();
    if (role !== undefined) payload.role = role;
    if (password) {
      {
    const pwError = passwordPolicyError(password);
    if (pwError) return res.status(400).json({ error: pwError });
  }
      payload.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    }
    const request = await createDeleteRequest({
      entityType: "user-update",
      entityId: id,
      label: `Update ${existing.role}: ${existing.name}`,
      user: req.user,
      payload,
    });
    await recordAudit({
      action: "user.update.requested",
      actor: req.user,
      entityType: "user",
      entityId: id,
      label: `Requested update for ${existing.role}: ${existing.name}`,
      details: { fields: Object.keys(payload) },
    });
    return res.status(202).json({ ok: true, pendingApproval: true, request });
  }

  if (name !== undefined) await db.run("UPDATE users SET name = $1 WHERE id = $2", [String(name).trim(), id]);
  if (email !== undefined) {
    try {
      await db.run("UPDATE users SET email = $1 WHERE id = $2", [email.trim().toLowerCase(), id]);
    } catch (e) {
      if (isUniqueViolation(e)) return res.status(409).json({ error: "Email already exists" });
      throw e;
    }
  }
  if (role !== undefined) {
    if (!ROLES.includes(role)) return res.status(400).json({ error: "Invalid role" });
    if (role === "Super Admin" && req.user?.role !== "Super Admin") {
      return res.status(403).json({ error: "Only Super Admin can assign Super Admin" });
    }
    if (existing.isProtected && role !== "Super Admin") {
      if (req.user?.role !== "Super Admin") {
        return res.status(403).json({ error: "Only Super Admin can change Super Admin role" });
      }
      if (req.user?.id === existing.id) {
        return res.status(403).json({ error: "Super Admin role cannot be changed" });
      }
    }
    await db.run('UPDATE users SET role = $1, "isProtected" = $2 WHERE id = $3', [role, role === "Super Admin" ? 1 : 0, id]);
  }
  if (password) {
    {
    const pwError = passwordPolicyError(password);
    if (pwError) return res.status(400).json({ error: pwError });
  }
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await db.run('UPDATE users SET "passwordHash" = $1 WHERE id = $2', [hash, id]);
  }
  const row = await db.get('SELECT id, name, email, role, "isProtected" FROM users WHERE id = $1', [id]);
  await recordAudit({
    action: "user.updated",
    actor: req.user,
    entityType: "user",
    entityId: id,
    label: `Updated ${row.role}: ${row.name}`,
    details: {
      nameChanged: name !== undefined,
      emailChanged: email !== undefined,
      roleChanged: role !== undefined,
      passwordChanged: !!password,
    },
  });
  res.json(publicUser(row));
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get("SELECT * FROM users WHERE id = $1", [id]);
  if (!existing) return res.status(404).json({ error: "User not found" });
  if (req.user?.id === id) {
    return res.status(403).json({ error: "Cannot delete your own account" });
  }
  if (isApprovalRole(existing.role) && isApprovalRole(req.user?.role)) {
    const request = await createDeleteRequest({
      entityType: "user-delete",
      entityId: id,
      label: `Delete ${existing.role}: ${existing.name}`,
      user: req.user,
    });
    await recordAudit({
      action: "user.delete.requested",
      actor: req.user,
      entityType: "user",
      entityId: id,
      label: `Requested delete for ${existing.role}: ${existing.name}`,
    });
    return res.status(202).json({ ok: true, pendingApproval: true, request });
  }
  if (isApprovalRole(existing.role)) {
    return res.status(403).json({ error: "Admin or Super Admin changes need approval" });
  }
  const result = await db.run("DELETE FROM users WHERE id = $1", [id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "User not found" });
  await recordAudit({
    action: "user.deleted",
    actor: req.user,
    entityType: "user",
    entityId: id,
    label: `Deleted ${existing.role}: ${existing.name}`,
  });
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Step 3 (Teacher class-scoping): assign/replace the set of classes a
// Teacher can see and act on. Sits under this "settings"-gated router same
// as the rest of user management, per the Step 3 plan — a Teacher never has
// write access here since the "settings" permission isn't granted to that
// role (see config/roles.js). Only a Teacher target makes sense; assigning
// classes to any other role would be a no-op since lib/teacherScope.js only
// ever scopes role === "Teacher".
// ----------------------------------------------------------------------------
router.put("/:id/classes", async (req, res) => {
  const id = Number(req.params.id);
  const target = await db.get("SELECT id, name, role FROM users WHERE id = $1", [id]);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.role !== "Teacher") {
    return res.status(400).json({ error: "শুধুমাত্র Teacher-এর ক্লাস নির্ধারণ করা যায়" });
  }

  const requested = Array.isArray(req.body.classes) ? req.body.classes : null;
  if (!requested) return res.status(400).json({ error: "classes অ্যারে আবশ্যক" });

  // Validate against the tenant's actual class/jamaat master list — same
  // check assignments.js uses for a post's `class` field — so a typo or a
  // stale value here can never create a scope that matches nothing (or,
  // worse, silently drifts from what students.class actually contains).
  const validSlugs = new Set((await getClassOptions()).map((o) => o.en));
  const classes = [...new Set(requested.map((c) => String(c).trim()).filter(Boolean))];
  const invalid = classes.filter((c) => !validSlugs.has(c));
  if (invalid.length > 0) {
    return res.status(400).json({ error: `অজানা ক্লাস: ${invalid.join(", ")}` });
  }

  // Replace wholesale inside one transaction-like pair of statements — the
  // set is small (a handful of classes per teacher) so a delete-then-insert
  // is simpler and safer than diffing, and avoids ever leaving a stale row
  // behind if a class is removed from the selection.
  await db.run('DELETE FROM teacher_class_assignments WHERE "userId" = $1', [id]);
  if (classes.length > 0) {
    const createdAt = new Date().toISOString();
    const valuePlaceholders = [];
    const params = [];
    classes.forEach((cls, i) => {
      const base = i * 3;
      valuePlaceholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
      params.push(id, cls, createdAt);
    });
    await db.run(
      `INSERT INTO teacher_class_assignments ("userId", class, "createdAt") VALUES ${valuePlaceholders.join(", ")}`,
      params
    );
  }

  await recordAudit({
    action: "user.classes_updated",
    actor: req.user,
    entityType: "user",
    entityId: id,
    label: `Updated assigned classes for Teacher: ${target.name}`,
    details: { classes },
  });

  res.json({ id, classes });
});

module.exports = router;
