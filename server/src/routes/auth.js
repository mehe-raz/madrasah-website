const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db");
const { signToken } = require("../middleware/auth");
const nodemailer = require("nodemailer");

const router = express.Router();
const SALT_ROUNDS = 12;

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "Name, email and password required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const withPassword = db.prepare("SELECT COUNT(*) as c FROM users WHERE passwordHash IS NOT NULL").get().c;
  const role = withPassword === 0 ? "Super Admin" : "User";

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  try {
    const result = db
      .prepare(
        "INSERT INTO users (name, email, passwordHash, role, isProtected) VALUES (?, ?, ?, ?, 0)"
      )
      .run(name.trim(), email.trim().toLowerCase(), hash, role);
    const user = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(result.lastInsertRowid);
    const token = signToken(user);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.status(201).json({ user, token });
  } catch (e) {
    if (e.message.includes("UNIQUE")) return res.status(409).json({ error: "Email already registered" });
    throw e;
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
  if (!row?.passwordHash) return res.status(401).json({ error: "Invalid email or password" });
  const ok = await bcrypt.compare(password, row.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });
  const user = publicUser(row);
  const token = signToken(user);
  res.cookie("token", token, { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ user, token });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  const header = req.headers.authorization;
  const cookie = req.cookies?.token;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : cookie;
  if (!token) return res.status(401).json({ error: "Not logged in" });
  try {
    const jwt = require("jsonwebtoken");
    const { JWT_SECRET } = require("../middleware/auth");
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(payload.id);
    if (!user) return res.status(401).json({ error: "User not found" });
    res.json({ user });
  } catch {
    res.status(401).json({ error: "Session expired" });
  }
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) return res.status(400).json({ error: "Email required" });
  const row = db.prepare("SELECT id, name FROM users WHERE email = ?").get(email.trim().toLowerCase());
  if (!row) {
    return res.json({ ok: true, message: "If email exists, reset link was generated" });
  }
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  db.prepare("DELETE FROM password_resets WHERE userId = ?").run(row.id);
  db.prepare("INSERT INTO password_resets (userId, token, expiresAt) VALUES (?, ?, ?)").run(
    row.id,
    token,
    expires
  );

  // Send email with reset link
  try {
    console.log("Email config check:", {
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      user: process.env.EMAIL_USER,
      hasPass: !!process.env.EMAIL_PASS,
    });

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: process.env.EMAIL_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Verify transporter configuration
    await transporter.verify();
    console.log("Email transporter verified successfully");

    const resetUrl = `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/reset-password?token=${token}`;
    console.log("Sending email to:", email.trim().toLowerCase());
    
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email.trim().toLowerCase(),
      subject: "Password Reset - Madrasah ERP",
      html: `
        <h2>Password Reset Request</h2>
        <p>Hello ${row.name},</p>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <p><a href="${resetUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    });
    console.log("Email sent successfully:", info.messageId);
  } catch (emailError) {
    console.error("Email sending failed:", emailError);
    // Still return success to prevent email enumeration
  }

  res.json({
    ok: true,
    message: "If email exists, reset link was sent",
  });
});

router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "Token and password required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const row = db
    .prepare(
      `SELECT pr.userId FROM password_resets pr
       WHERE pr.token = ? AND pr.expiresAt > datetime('now')`
    )
    .get(token);
  if (!row) return res.status(400).json({ error: "Invalid or expired token" });

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  db.prepare("UPDATE users SET passwordHash = ? WHERE id = ?").run(hash, row.userId);
  db.prepare("DELETE FROM password_resets WHERE userId = ?").run(row.userId);
  res.json({ ok: true, message: "Password updated" });
});

module.exports = router;
