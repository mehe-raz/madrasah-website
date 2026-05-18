const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");

const router = express.Router();
const ROLES = ["Super Admin", "Admin", "Accountant", "Teacher", "Hostel Manager"];
const SALT_ROUNDS = 12;

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email || "", role: row.role, isProtected: !!row.isProtected };
}

router.get("/", (_req, res) => {
  const rows = db.prepare("SELECT id, name, email, role, isProtected FROM users ORDER BY id").all();
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
    const result = db
      .prepare(
        "INSERT INTO users (name, role, email, passwordHash, isProtected) VALUES (?, ?, ?, ?, ?)"
      )
      .run(name.trim(), role, email.trim().toLowerCase(), hash, isProtected);
    const row = db.prepare("SELECT id, name, email, role, isProtected FROM users WHERE id = ?").get(
      result.lastInsertRowid
    );
    res.status(201).json(publicUser(row));
  } catch (e) {
    if (e.message.includes("UNIQUE")) return res.status(409).json({ error: "Email already exists" });
    throw e;
  }
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "User not found" });

  if (existing.isProtected) {
    if (req.user?.id !== existing.id && req.user?.role !== "Super Admin") {
      return res.status(403).json({ error: "Cannot modify protected Super Admin" });
    }
    if (req.body.role && req.body.role !== "Super Admin") {
      return res.status(403).json({ error: "Super Admin role cannot be changed" });
    }
  }

  const { name, role, email, password } = req.body;
  if (name !== undefined) db.prepare("UPDATE users SET name = ? WHERE id = ?").run(String(name).trim(), id);
  if (email !== undefined) {
    try {
      db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email.trim().toLowerCase(), id);
    } catch (e) {
      if (e.message.includes("UNIQUE")) return res.status(409).json({ error: "Email already exists" });
      throw e;
    }
  }
  if (role !== undefined) {
    if (!ROLES.includes(role)) return res.status(400).json({ error: "Invalid role" });
    if (role === "Super Admin" && req.user?.role !== "Super Admin") {
      return res.status(403).json({ error: "Only Super Admin can assign Super Admin" });
    }
    if (existing.isProtected && role !== "Super Admin") {
      return res.status(403).json({ error: "Super Admin role cannot be changed" });
    }
    db.prepare("UPDATE users SET role = ?, isProtected = ? WHERE id = ?").run(
      role,
      role === "Super Admin" ? 1 : existing.isProtected,
      id
    );
  }
  if (password) {
    if (password.length < 8) return res.status(400).json({ error: "Password min 8 characters" });
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    db.prepare("UPDATE users SET passwordHash = ? WHERE id = ?").run(hash, id);
  }
  const row = db.prepare("SELECT id, name, email, role, isProtected FROM users WHERE id = ?").get(id);
  res.json(publicUser(row));
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "User not found" });
  if (existing.isProtected) {
    return res.status(403).json({ error: "Super Admin cannot be removed" });
  }
  if (req.user?.id === id) {
    return res.status(403).json({ error: "Cannot delete your own account" });
  }
  const result = db.prepare("DELETE FROM users WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "User not found" });
  res.json({ ok: true });
});

module.exports = router;
