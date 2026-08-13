// ============================================================================
// ownSmsGatewayCredentials.js — reads back the institution's own connected
// SMSGate (own-phone/SIM) credentials for an actual send call
// (docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md Phase 1).
// ============================================================================
// routes/ownSmsGateway.js only ever WRITES encrypted credentials and
// reports connection status — it never reads them back out. This is the
// one place that does: routes/sms.js's POST /broadcast (Phase 3) calls
// getConnectedGateway() to get a ready-to-use, decrypted credential object
// right before a send() call, and lets it go out of scope immediately
// after — nothing here holds decrypted credentials anywhere but a local
// variable. Same shape as lib/paymentGatewayCredentials.js, reusing the
// same lib/gatewayCredentialCrypto.js (GATEWAY_CREDENTIAL_KEY) rather than
// a new crypto module — this protects the same class of secret.
// ============================================================================

const db = require("../db");
const gatewayCrypto = require("./gatewayCredentialCrypto");

/**
 * Returns { username, password } for the institution's connected SMSGate
 * account, or null if none is connected. Throws only if
 * GATEWAY_CREDENTIAL_KEY itself is missing/wrong (an operator misconfig,
 * not a normal "not connected" case) — callers should let that surface as
 * a 500 rather than silently treating it as "not connected".
 */
async function getConnectedGateway() {
  const row = await db.get(
    'SELECT "usernameEnc", "passwordEnc" FROM own_sms_gateway WHERE connected = true ORDER BY id LIMIT 1'
  );
  if (!row) return null;
  return {
    username: gatewayCrypto.decrypt(row.usernameEnc),
    password: gatewayCrypto.decrypt(row.passwordEnc),
  };
}

module.exports = { getConnectedGateway };
