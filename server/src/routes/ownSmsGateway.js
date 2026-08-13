// ============================================================================
// routes/ownSmsGateway.js — own-phone/SIM bulk SMS gateway connect settings
// (docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md Phase 2)
// ============================================================================
// An institution-admin submits their OWN SMSGate (sms-gate.app) Cloud
// account username/password from a Settings page; this route validates
// them with a live verifyCredentials() call (lib/smsProviders/smsgate.js)
// and, only if that succeeds, encrypts (lib/gatewayCredentialCrypto.js,
// reused as-is) and stores them. Exact same shape as
// routes/paymentGateway.js (Phase 8E) — same permission tier ("settings"),
// gated on the existing "sms" plan feature (reused, not a new feature key
// — this is a second, separate SMS-sending path from /api/sms's
// paid-reseller wallet flow).
//
// Credentials are never returned to the client after being saved — GET
// /status only reports whether a gateway is connected and when it was
// last checked, never the decrypted secret values.
// ============================================================================

const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { requirePlanFeature } = require("../middleware/planGate");
const { recordAudit } = require("../lib/auditLog");
const gatewayCrypto = require("../lib/gatewayCredentialCrypto");
const smsgate = require("../lib/smsProviders/smsgate");

const router = express.Router();
router.use(requirePermission("settings"));
router.use(requirePlanFeature("sms"));

router.get("/status", async (_req, res) => {
  const row = await db.get(
    'SELECT provider, connected, "lastCheckedAt", "lastError" FROM own_sms_gateway ORDER BY id LIMIT 1'
  );
  res.json({
    connected: Boolean(row?.connected),
    provider: row?.provider || "smsgate",
    lastCheckedAt: row?.lastCheckedAt || null,
    lastError: row?.connected ? null : row?.lastError || null,
    configured: gatewayCrypto.isConfigured(),
  });
});

router.post("/connect", async (req, res) => {
  if (!gatewayCrypto.isConfigured()) {
    return res.status(503).json({ error: "GATEWAY_CREDENTIAL_KEY সার্ভারে সেট করা নেই — প্ল্যাটফর্ম অপারেটরের সাথে যোগাযোগ করুন" });
  }

  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "").trim();

  let result;
  try {
    result = await smsgate.verifyCredentials({ username, password });
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : "যাচাই করতে ব্যর্থ হয়েছে" };
  }

  const now = new Date().toISOString();
  const existing = await db.get("SELECT id FROM own_sms_gateway ORDER BY id LIMIT 1");

  if (result.ok) {
    const values = {
      provider: "smsgate",
      usernameEnc: gatewayCrypto.encrypt(username),
      passwordEnc: gatewayCrypto.encrypt(password),
      connected: true,
      lastCheckedAt: now,
      lastError: null,
      updatedAt: now,
    };
    if (existing) {
      await db.run(
        `UPDATE own_sms_gateway SET provider=$1, "usernameEnc"=$2, "passwordEnc"=$3,
         connected=$4, "lastCheckedAt"=$5, "lastError"=$6, "updatedAt"=$7
         WHERE id=$8`,
        [values.provider, values.usernameEnc, values.passwordEnc, values.connected, values.lastCheckedAt, values.lastError, values.updatedAt, existing.id]
      );
    } else {
      await db.run(
        `INSERT INTO own_sms_gateway
         (provider, "usernameEnc", "passwordEnc", connected, "lastCheckedAt", "lastError", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [values.provider, values.usernameEnc, values.passwordEnc, values.connected, values.lastCheckedAt, values.lastError, values.updatedAt]
      );
    }
  } else {
    // Deliberately does NOT store the submitted credentials on failure —
    // no reason to keep bad/unverified secrets around, encrypted or not.
    if (existing) {
      await db.run(
        `UPDATE own_sms_gateway SET connected=false, "lastCheckedAt"=$1, "lastError"=$2, "updatedAt"=$3 WHERE id=$4`,
        [now, result.error, now, existing.id]
      );
    } else {
      await db.run(
        `INSERT INTO own_sms_gateway (provider, connected, "lastCheckedAt", "lastError", "updatedAt")
         VALUES ('smsgate', false, $1, $2, $3)`,
        [now, result.error, now]
      );
    }
  }

  await recordAudit({
    action: result.ok ? "own-sms-gateway.connected" : "own-sms-gateway.connect-failed",
    actor: req.user,
    entityType: "own_sms_gateway",
    entityId: 0,
    label: result.ok ? "নিজের ফোন SMS গেটওয়ে কানেক্ট হয়েছে" : "নিজের ফোন SMS গেটওয়ে কানেক্ট ব্যর্থ হয়েছে",
    details: { ok: result.ok, error: result.error || null },
  });

  if (!result.ok) return res.status(400).json({ connected: false, error: result.error });
  res.json({ connected: true, provider: "smsgate", lastCheckedAt: now });
});

router.post("/disconnect", async (req, res) => {
  const existing = await db.get("SELECT id FROM own_sms_gateway ORDER BY id LIMIT 1");
  if (existing) {
    await db.run(
      `UPDATE own_sms_gateway SET connected=false, "usernameEnc"=NULL, "passwordEnc"=NULL,
       "lastError"=NULL, "updatedAt"=$1 WHERE id=$2`,
      [new Date().toISOString(), existing.id]
    );
  }
  await recordAudit({
    action: "own-sms-gateway.disconnected",
    actor: req.user,
    entityType: "own_sms_gateway",
    entityId: 0,
    label: "নিজের ফোন SMS গেটওয়ে ডিসকানেক্ট করা হয়েছে",
  });
  res.json({ connected: false });
});

module.exports = router;
