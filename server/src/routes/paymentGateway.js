// ============================================================================
// routes/paymentGateway.js — bKash self-connect settings (Phase 8E)
// ============================================================================
// BUSINESS_READINESS_ROADMAP.md Phase 8E: an institution-admin submits their
// OWN bKash agent/merchant account credentials (App Key/Secret/Username/
// Password) from a Settings page; this route validates them with a live
// grant-token call (lib/bkashGateway.js) and, only if that succeeds,
// encrypts (lib/gatewayCredentialCrypto.js) and stores them. Same
// permission tier as routes/sms.js ("settings" + requirePlanFeature),
// gated on the "bkash" plan feature.
//
// Credentials are never returned to the client after being saved — GET
// /status only reports whether a gateway is connected, which provider,
// and when it was last checked, never the decrypted secret values.
// ============================================================================

const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { requirePlanFeature } = require("../middleware/planGate");
const { recordAudit } = require("../lib/auditLog");
const gatewayCrypto = require("../lib/gatewayCredentialCrypto");
const bkashGateway = require("../lib/bkashGateway");

const router = express.Router();
router.use(requirePermission("settings"));
router.use(requirePlanFeature("bkash"));

router.get("/status", async (_req, res) => {
  const row = await db.get(
    'SELECT provider, connected, "lastCheckedAt", "lastError" FROM institution_payment_gateways ORDER BY id LIMIT 1'
  );
  res.json({
    connected: Boolean(row?.connected),
    provider: row?.provider || "bkash",
    lastCheckedAt: row?.lastCheckedAt || null,
    lastError: row?.connected ? null : row?.lastError || null,
    configured: gatewayCrypto.isConfigured(),
  });
});

router.post("/connect", async (req, res) => {
  if (!gatewayCrypto.isConfigured()) {
    return res.status(503).json({ error: "GATEWAY_CREDENTIAL_KEY সার্ভারে সেট করা নেই — প্ল্যাটফর্ম অপারেটরের সাথে যোগাযোগ করুন" });
  }

  const appKey = String(req.body?.appKey || "").trim();
  const appSecret = String(req.body?.appSecret || "").trim();
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "").trim();

  let result;
  try {
    result = await bkashGateway.validateCredentials({ appKey, appSecret, username, password });
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : "যাচাই করতে ব্যর্থ হয়েছে" };
  }

  const now = new Date().toISOString();
  const existing = await db.get("SELECT id FROM institution_payment_gateways ORDER BY id LIMIT 1");

  if (result.ok) {
    const values = {
      provider: "bkash",
      appKeyEnc: gatewayCrypto.encrypt(appKey),
      appSecretEnc: gatewayCrypto.encrypt(appSecret),
      usernameEnc: gatewayCrypto.encrypt(username),
      passwordEnc: gatewayCrypto.encrypt(password),
      connected: true,
      lastCheckedAt: now,
      lastError: null,
      updatedAt: now,
    };
    if (existing) {
      await db.run(
        `UPDATE institution_payment_gateways SET provider=$1, "appKeyEnc"=$2, "appSecretEnc"=$3,
         "usernameEnc"=$4, "passwordEnc"=$5, connected=$6, "lastCheckedAt"=$7, "lastError"=$8, "updatedAt"=$9
         WHERE id=$10`,
        [values.provider, values.appKeyEnc, values.appSecretEnc, values.usernameEnc, values.passwordEnc, values.connected, values.lastCheckedAt, values.lastError, values.updatedAt, existing.id]
      );
    } else {
      await db.run(
        `INSERT INTO institution_payment_gateways
         (provider, "appKeyEnc", "appSecretEnc", "usernameEnc", "passwordEnc", connected, "lastCheckedAt", "lastError", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [values.provider, values.appKeyEnc, values.appSecretEnc, values.usernameEnc, values.passwordEnc, values.connected, values.lastCheckedAt, values.lastError, values.updatedAt]
      );
    }
  } else {
    // Deliberately does NOT store the submitted credentials on failure —
    // no reason to keep bad/unverified secrets around, encrypted or not.
    if (existing) {
      await db.run(
        `UPDATE institution_payment_gateways SET connected=false, "lastCheckedAt"=$1, "lastError"=$2, "updatedAt"=$3 WHERE id=$4`,
        [now, result.error, now, existing.id]
      );
    } else {
      await db.run(
        `INSERT INTO institution_payment_gateways (provider, connected, "lastCheckedAt", "lastError", "updatedAt")
         VALUES ('bkash', false, $1, $2, $3)`,
        [now, result.error, now]
      );
    }
  }

  await recordAudit({
    action: result.ok ? "payment-gateway.connected" : "payment-gateway.connect-failed",
    actor: req.user,
    entityType: "institution_payment_gateways",
    entityId: 0,
    label: result.ok ? "বিকাশ গেটওয়ে কানেক্ট হয়েছে" : "বিকাশ গেটওয়ে কানেক্ট ব্যর্থ হয়েছে",
    details: { ok: result.ok, error: result.error || null },
  });

  if (!result.ok) return res.status(400).json({ connected: false, error: result.error });
  res.json({ connected: true, provider: "bkash", lastCheckedAt: now });
});

router.post("/disconnect", async (req, res) => {
  const existing = await db.get("SELECT id FROM institution_payment_gateways ORDER BY id LIMIT 1");
  if (existing) {
    await db.run(
      `UPDATE institution_payment_gateways SET connected=false, "appKeyEnc"=NULL, "appSecretEnc"=NULL,
       "usernameEnc"=NULL, "passwordEnc"=NULL, "lastError"=NULL, "updatedAt"=$1 WHERE id=$2`,
      [new Date().toISOString(), existing.id]
    );
  }
  await recordAudit({
    action: "payment-gateway.disconnected",
    actor: req.user,
    entityType: "institution_payment_gateways",
    entityId: 0,
    label: "বিকাশ গেটওয়ে ডিসকানেক্ট করা হয়েছে",
  });
  res.json({ connected: false });
});

module.exports = router;
