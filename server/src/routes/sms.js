// ============================================================================
// routes/sms.js — "SMS সেবা" settings page API (Phase 8D)
// ============================================================================
// BUSINESS_READINESS_ROADMAP.md Phase 8D: institution-admin-side wallet
// balance + ledger history + per-notification-type SMS toggle + manual
// top-up request submission. Same permission tier as routes/backup.js and
// routes/settings.js ("settings"), and same requirePlanFeature("sms") gate
// as every other Coming-Soon-turned-real module in routes/*.js.
//
// Crediting a top-up request is NOT done here — it needs a human (the
// platform operator) to check the real bKash inbox for the Trx ID before
// trusting it, so that step lives in routes/platform.js instead, running
// against this exact tenant's schema via migrateTenants.withTenantSchema().
// This route only ever writes a 'pending' row; only that other, hard-to-
// reach code path can flip it to 'confirmed' and touch the balance.
// ============================================================================

const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { requirePlanFeature } = require("../middleware/planGate");
const { recordAudit } = require("../lib/auditLog");

const router = express.Router();
router.use(requirePermission("settings"));
router.use(requirePlanFeature("sms"));

const PREFS_KEY = "smsNotificationPrefs";

// Every guardian-facing SMS type wired up in guardianSms.js so far. Keeping
// this list here (not just inferred from whatever keys happen to exist in
// the stored JSON) means the settings page always shows every togglable
// type, even before the admin has saved any preferences at all.
const NOTIFICATION_TYPES = ["feeDueReminder", "resultPublished"];

async function getPrefs() {
  const row = await db.get("SELECT value FROM settings WHERE key = $1", [PREFS_KEY]);
  let stored = {};
  if (row?.value) {
    try {
      stored = JSON.parse(row.value);
    } catch {
      stored = {};
    }
  }
  // Default every known type to "on" (true) unless the admin explicitly
  // turned it off — matches sendGuardianSms()'s own fallback in
  // guardianSms.js, so a fresh install with no saved row behaves exactly
  // the same whether or not this endpoint has ever been called.
  const prefs = {};
  for (const type of NOTIFICATION_TYPES) prefs[type] = stored[type] !== false;
  return prefs;
}

router.get("/wallet", async (_req, res) => {
  const wallet = await db.get("SELECT balance_taka, \"updatedAt\" FROM sms_wallets LIMIT 1");
  const transactions = await db.all(
    'SELECT id, type, "amountTaka", "smsCount", reference, status, "createdAt" FROM sms_transactions ORDER BY "createdAt" DESC LIMIT 200'
  );
  const prefs = await getPrefs();
  res.json({
    balanceTaka: Number(wallet?.balance_taka || 0),
    updatedAt: wallet?.updatedAt || null,
    transactions,
    notificationPrefs: prefs,
    // Personal bKash number the admin should send money to before
    // submitting a Trx ID below — set once by whoever runs the platform
    // (SMS_TOPUP_BKASH_NUMBER env var), same "unconfigured -> empty
    // string, frontend shows a fallback" contract as every other
    // env-driven display value in this codebase (e.g. lib/mailer.js).
    // Never hardcoded here since it's operator-specific, not code.
    topupBkashNumber: process.env.SMS_TOPUP_BKASH_NUMBER || "",
  });
});

router.put("/notification-prefs", async (req, res) => {
  const current = await getPrefs();
  const next = { ...current };
  for (const type of NOTIFICATION_TYPES) {
    if (typeof req.body?.[type] === "boolean") next[type] = req.body[type];
  }
  await db.run(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [PREFS_KEY, JSON.stringify(next)]
  );
  await recordAudit({
    action: "sms.notification-prefs-updated",
    actor: req.user,
    entityType: "sms",
    entityId: 0,
    label: "SMS নোটিফিকেশন সেটিংস আপডেট হয়েছে",
    details: next,
  });
  res.json({ notificationPrefs: next });
});

router.post("/topup-request", async (req, res) => {
  const amountTaka = Number(req.body?.amountTaka);
  const trxId = String(req.body?.trxId || "").trim();
  if (!(amountTaka > 0)) return res.status(400).json({ error: "amountTaka must be a positive number" });
  if (!trxId) return res.status(400).json({ error: "trxId is required" });

  const row = await db.get(
    `INSERT INTO sms_transactions (type, "amountTaka", "smsCount", reference, status, "createdAt")
     VALUES ('topup', $1, NULL, $2, 'pending', $3)
     RETURNING id, type, "amountTaka", "smsCount", reference, status, "createdAt"`,
    [amountTaka, trxId, new Date().toISOString()]
  );

  await recordAudit({
    action: "sms.topup-requested",
    actor: req.user,
    entityType: "sms_transactions",
    entityId: row.id,
    label: `৳${amountTaka} টাকা টপ-আপ অনুরোধ (Trx: ${trxId})`,
    details: { amountTaka, trxId },
  });

  res.status(201).json(row);
});

module.exports = router;
