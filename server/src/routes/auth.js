const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db");
const { signToken } = require("../middleware/auth");
const { isUniqueViolation } = require("../pg");
const nodemailer = require("nodemailer");

const router = express.Router();
const SALT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const cookieOptions = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

router.post("/register", async (req, res) => {
  const userCountRow = await db.get("SELECT COUNT(*)::int AS c FROM users");
  const userCount = userCountRow?.c || 0;
  const publicSetupEnabled = process.env.ENABLE_PUBLIC_SETUP === "true";
  if (process.env.NODE_ENV === "production" && !publicSetupEnabled) {
    return res.status(403).json({ error: "Public setup is disabled on the live server. Ask a Super Admin to create users." });
  }
  if (userCount > 0) {
    return res.status(403).json({ error: "Public registration is closed. Ask an admin to create users." });
  }

  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "Name, email and password required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  try {
    const result = await db.run(
      `INSERT INTO users (name, email, "passwordHash", role, "isProtected")
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name.trim(), email.trim().toLowerCase(), hash, "Super Admin", 1]
    );
    const user = await db.get("SELECT id, name, email, role FROM users WHERE id = $1", [result.insertId]);
    const token = signToken(user);
    res.cookie("token", token, cookieOptions);
    res.status(201).json({ user });
  } catch (e) {
    if (isUniqueViolation(e)) return res.status(409).json({ error: "Email already registered" });
    throw e;
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }
  const row = await db.get('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
  if (!row?.passwordHash) return res.status(401).json({ error: "Invalid email or password" });

  if (row.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now()) {
    const minutesLeft = Math.ceil((new Date(row.lockedUntil).getTime() - Date.now()) / 60000);
    return res.status(423).json({
      error: `Too many failed attempts. This account is temporarily locked. Try again in ${minutesLeft} minute(s).`,
    });
  }

  const ok = await bcrypt.compare(password, row.passwordHash);
  if (!ok) {
    const attempts = (row.failedLoginAttempts || 0) + 1;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
      await db.run(
        'UPDATE users SET "failedLoginAttempts" = 0, "lockedUntil" = $1 WHERE id = $2',
        [lockedUntil, row.id]
      );
      return res.status(423).json({
        error: `Too many failed attempts. This account is now locked for ${Math.round(LOCK_DURATION_MS / 60000)} minutes.`,
      });
    }
    await db.run('UPDATE users SET "failedLoginAttempts" = $1 WHERE id = $2', [attempts, row.id]);
    return res.status(401).json({ error: "Invalid email or password" });
  }

  if (row.failedLoginAttempts > 0 || row.lockedUntil) {
    await db.run('UPDATE users SET "failedLoginAttempts" = 0, "lockedUntil" = NULL WHERE id = $1', [row.id]);
  }

  const user = publicUser(row);
  const token = signToken(user);
  res.cookie("token", token, cookieOptions);
  res.json({ user });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("token", cookieOptions);
  res.json({ ok: true });
});

router.get("/me", async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Not logged in" });
  try {
    const jwt = require("jsonwebtoken");
    const { JWT_SECRET } = require("../middleware/auth");
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await db.get("SELECT id, name, email, role FROM users WHERE id = $1", [payload.id]);
    if (!user) return res.status(401).json({ error: "User not found" });
    res.json({ user });
  } catch {
    res.status(401).json({ error: "Session expired" });
  }
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) return res.status(400).json({ error: "Email required" });
  const row = await db.get("SELECT id, name FROM users WHERE email = $1", [email.trim().toLowerCase()]);
  if (!row) {
    return res.json({ ok: true, message: "If email exists, reset link was generated" });
  }
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await db.run('DELETE FROM password_resets WHERE "userId" = $1', [row.id]);
  await db.run('INSERT INTO password_resets ("userId", token, "expiresAt") VALUES ($1, $2, $3)', [row.id, token, expires]);

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: process.env.EMAIL_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.verify();

    const resetUrl = `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/reset-password?token=${token}`;

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
    console.log("Password reset email sent:", info.messageId);
  } catch (emailError) {
    console.error("Email sending failed:", emailError);
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

  const row = await db.get(
    `SELECT pr."userId" FROM password_resets pr
     WHERE pr.token = $1 AND pr."expiresAt"::timestamptz > NOW()`,
    [token]
  );
  if (!row) return res.status(400).json({ error: "Invalid or expired token" });

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  await db.run('UPDATE users SET "passwordHash" = $1 WHERE id = $2', [hash, row.userId]);
  await db.run('DELETE FROM password_resets WHERE "userId" = $1', [row.userId]);
  res.json({ ok: true, message: "Password updated" });
});

module.exports = router;
