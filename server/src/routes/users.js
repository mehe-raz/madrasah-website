const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { createDeleteRequest } = require("../lib/deleteRequests");
const { isUniqueViolation } = require("../pg");
const { requirePermission } = require("../middleware/rbac");

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
  res.json(rows.map(publicUser));
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
  if (password.length < 8) return res.status(400).json({ error: "Password min 8 characters" });

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const isProtected = role === "Super Admin" ? 1 : 0;
  try {
    const result = await db.run(
      `INSERT INTO users (name, role, email, "passwordHash", "isProtected")
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name.trim(), role, email.trim().toLowerCase(), hash, isProtected]
    );
    const row = await db.get('SELECT id, name, email, role, "isProtected" FROM users WHERE id = $1', [result.insertId]);
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
      if (password.length < 8) return res.status(400).json({ error: "Password min 8 characters" });
      payload.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    }
    const request = await createDeleteRequest({
      entityType: "user-update",
      entityId: id,
      label: `Update ${existing.role}: ${existing.name}`,
      user: req.user,
      payload,
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
    if (password.length < 8) return res.status(400).json({ error: "Password min 8 characters" });
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await db.run('UPDATE users SET "passwordHash" = $1 WHERE id = $2', [hash, id]);
  }
  const row = await db.get('SELECT id, name, email, role, "isProtected" FROM users WHERE id = $1', [id]);
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
    return res.status(202).json({ ok: true, pendingApproval: true, request });
  }
  if (isApprovalRole(existing.role)) {
    return res.status(403).json({ error: "Admin or Super Admin changes need approval" });
  }
  const result = await db.run("DELETE FROM users WHERE id = $1", [id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "User not found" });
  res.json({ ok: true });
});

module.exports = router;
