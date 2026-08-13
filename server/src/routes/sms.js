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
const { z } = require("zod");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { requirePlanFeature } = require("../middleware/planGate");
const { recordAudit } = require("../lib/auditLog");
const { validate } = require("../middleware/validate");
const bkashGateway = require("../lib/bkashGateway");
const { getConnectedGateway } = require("../lib/paymentGatewayCredentials");
const { getConnectedGateway: getConnectedOwnSmsGateway } = require("../lib/ownSmsGatewayCredentials");
const smsgate = require("../lib/smsProviders/smsgate");

const router = express.Router();
router.use(requirePermission("settings"));
router.use(requirePlanFeature("sms"));

const PREFS_KEY = "smsNotificationPrefs";

// Every guardian-facing SMS type wired up in guardianSms.js so far. Keeping
// this list here (not just inferred from whatever keys happen to exist in
// the stored JSON) means the settings page always shows every togglable
// type, even before the admin has saved any preferences at all.
const NOTIFICATION_TYPES = ["feeDueReminder", "resultPublished", "paymentReceived", "attendancePunch"];

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
  if (!(amountTaka > 0) || !Number.isInteger(amountTaka)) return res.status(400).json({ error: "amountTaka must be a positive whole number" });
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

// ---------------------------------------------------------------------------
// Phase 8F: SMS wallet top-up via the institution's own connected bKash
// gateway (Phase 8E) — an automatic alternative to the manual Trx-ID flow
// above, once one is connected. Same create→execute→credit shape as the
// guardian fee-payment flow in routes/guardianAuth.js, just admin-initiated
// (requirePermission("settings"), already applied to this whole router)
// and crediting sms_wallets instead of reducing a student's due.
// ---------------------------------------------------------------------------

function adminCallbackUrl(req) {
  const origin = req.get("origin") || req.get("referer") || process.env.CLIENT_ORIGIN || "";
  const base = origin.replace(/\/+$/, "").replace(/\/(sms|payment-gateway).*$/, "");
  return `${base}/sms`;
}

router.post("/topup-via-gateway/create", async (req, res) => {
  const amountTaka = Number(req.body?.amountTaka);
  if (!(amountTaka > 0) || !Number.isInteger(amountTaka)) return res.status(400).json({ error: "amountTaka must be a positive whole number" });

  const gateway = await getConnectedGateway();
  if (!gateway) return res.status(503).json({ error: "প্রতিষ্ঠানের বিকাশ গেটওয়ে কানেক্টেড নেই" });

  const now = new Date().toISOString();
  const intent = await db.get(
    `INSERT INTO bkash_payment_intents (purpose, amount, status, "createdAt")
     VALUES ('sms-topup', $1, 'initiated', $2) RETURNING id`,
    [amountTaka, now]
  );

  const grant = await bkashGateway.grantToken(gateway);
  if (!grant.ok) return res.status(502).json({ error: grant.error });

  const created = await bkashGateway.createPayment({
    idToken: grant.idToken,
    appKey: gateway.appKey,
    amount: amountTaka,
    invoiceId: intent.id,
    callbackURL: adminCallbackUrl(req),
  });
  if (!created.ok) return res.status(502).json({ error: created.error });

  await db.run('UPDATE bkash_payment_intents SET "paymentId" = $1 WHERE id = $2', [created.paymentID, intent.id]);
  res.json({ bkashURL: created.bkashURL, paymentID: created.paymentID });
});

router.post("/topup-via-gateway/execute", async (req, res) => {
  const paymentID = String(req.body?.paymentID || "");
  if (!paymentID) return res.status(400).json({ error: "paymentID প্রয়োজন" });

  const intent = await db.get(
    `SELECT * FROM bkash_payment_intents WHERE "paymentId" = $1 AND purpose = 'sms-topup'`,
    [paymentID]
  );
  if (!intent) return res.status(404).json({ error: "পেমেন্ট পাওয়া যায়নি" });
  if (intent.status === "completed") return res.json({ ok: true, alreadyCompleted: true });

  const gateway = await getConnectedGateway();
  if (!gateway) return res.status(503).json({ error: "প্রতিষ্ঠানের বিকাশ গেটওয়ে কানেক্টেড নেই" });

  const grant = await bkashGateway.grantToken(gateway);
  if (!grant.ok) return res.status(502).json({ error: grant.error });

  const executed = await bkashGateway.executePayment({ idToken: grant.idToken, appKey: gateway.appKey, paymentID });
  if (!executed.ok) {
    await db.run(`UPDATE bkash_payment_intents SET status = 'failed' WHERE id = $1`, [intent.id]);
    return res.status(402).json({ ok: false, error: executed.error });
  }

  const now = new Date().toISOString();
  await db.withTransaction(async (tx) => {
    await tx.run(
      `INSERT INTO sms_transactions (type, "amountTaka", "smsCount", reference, status, "createdAt")
       VALUES ('topup', $1, NULL, $2, 'confirmed', $3)`,
      [intent.amount, `bKash gateway: ${executed.trxID || paymentID}`, now]
    );
    await tx.run(
      `UPDATE sms_wallets SET balance_taka = balance_taka + $1, "updatedAt" = $2`,
      [intent.amount, now]
    );
    await tx.run(
      `UPDATE bkash_payment_intents SET status = 'completed', "bkashTrxId" = $1, "completedAt" = $2 WHERE id = $3`,
      [executed.trxID, now, intent.id]
    );
  });

  await recordAudit({
    action: "sms.topup-via-gateway",
    actor: req.user,
    entityType: "sms_transactions",
    entityId: intent.id,
    label: `৳${intent.amount} টাকা বিকাশ গেটওয়ে দিয়ে SMS ওয়ালেটে টপ-আপ হয়েছে`,
    details: { amountTaka: intent.amount, trxID: executed.trxID },
  });

  res.json({ ok: true, amountTaka: intent.amount });
});

// ============================================================================
// POST /broadcast — own-SIM bulk SMS send (Phase 3)
// ============================================================================
// Deliberately inside this same router (not a new file) so it inherits the
// requirePermission("settings") + requirePlanFeature("sms") gate already
// set up above — see plan doc's Phase 3 note. Completely separate from
// every other route in this file: no sms_wallets/sms_transactions
// involvement, cost is on the institution's own SIM. Uses the own-SIM
// gateway (own_sms_gateway, lib/ownSmsGatewayCredentials.js /
// lib/smsProviders/smsgate.js — Phase 1/2), never sendGuardianSms()/the
// bKash-funded wallet above.
// ============================================================================

const broadcastSchema = z.object({
  contactIds: z.union([z.array(z.coerce.number().int().positive()), z.literal("all")]),
  message: z.string().trim().min(1, "মেসেজ আবশ্যক").max(1000),
});

// Local 01XXXXXXXXX (how sms_contacts.phone is stored, see smsContacts.js)
// -> international +8801XXXXXXXXX (what the SMSGate API expects per the
// plan doc's example phoneNumbers value).
function toInternational(localPhone) {
  const digits = String(localPhone || "").replace(/\D/g, "");
  return `+880${digits.slice(-10)}`;
}

// Replaces both {নাম} and {name} (bn/en users both write naturally — see
// plan doc's design decision #4) with the contact's actual name.
function personalize(template, name) {
  return template.split("{নাম}").join(name).split("{name}").join(name);
}

router.post("/broadcast", validate(broadcastSchema), async (req, res) => {
  const gateway = await getConnectedOwnSmsGateway();
  if (!gateway) {
    return res.status(503).json({ error: "প্রথমে আপনার ফোন গেটওয়ে সংযুক্ত করুন" });
  }

  const { contactIds, message } = req.body;
  const contacts =
    contactIds === "all"
      ? await db.all('SELECT id, name, phone FROM sms_contacts ORDER BY name')
      : await db.all(
          'SELECT id, name, phone FROM sms_contacts WHERE id = ANY($1) ORDER BY name',
          [contactIds]
        );

  let sentCount = 0;
  let failedCount = 0;
  // Sequential loop, one request per contact (rate-limit-friendly) — same
  // single-recipient pattern as lib/smsProviders/bulksmsbd.js, needed here
  // because each message is personalized per contact.
  for (const contact of contacts) {
    const personalized = personalize(message, contact.name);
    let result;
    try {
      result = await smsgate.send({
        username: gateway.username,
        password: gateway.password,
        to: toInternational(contact.phone),
        message: personalized,
      });
    } catch {
      result = { ok: false };
    }
    if (result.ok) sentCount += 1;
    else failedCount += 1;
  }

  await db.run(
    `INSERT INTO sms_broadcast_logs
     ("messageTemplate", "recipientCount", "sentCount", "failedCount", "sentBy", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [message, contacts.length, sentCount, failedCount, req.user?.id || null, new Date().toISOString()]
  );

  await recordAudit({
    action: "own-sms-gateway.broadcast-sent",
    actor: req.user,
    entityType: "sms_broadcast_logs",
    label: `নিজের ফোন গেটওয়ে দিয়ে বাল্ক SMS: মোট ${contacts.length}, সফল ${sentCount}, ব্যর্থ ${failedCount}`,
    details: { total: contacts.length, sent: sentCount, failed: failedCount },
  });

  res.json({ total: contacts.length, sent: sentCount, failed: failedCount });
});

module.exports = router;
