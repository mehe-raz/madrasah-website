// ============================================================================
// ownSmsGatewayCredentials.js — reads back the institution's own connected
// SMSGate (own-phone/SIM) credentials right before a send call.
// ============================================================================
// docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md Phase 1. Same split as
// paymentGatewayCredentials.js / institution_payment_gateways:
// routes/ownSmsGateway.js (Phase 2) only ever WRITES encrypted credentials
// and reports connection status — it never reads them back out. This is the
// one place that does: routes/sms.js's POST /broadcast (Phase 3) calls
// getConnectedGateway() to get a ready-to-use, decrypted credential object
// right before each smsProviders/smsgate.js send() call, and lets it go out
// of scope immediately after — nothing here holds decrypted credentials
// anywhere but a local variable.
// ============================================================================

const db = require("../db");
const gatewayCrypto = require("./gatewayCredentialCrypto");

/**
 * Returns { username, password } for the institution's connected own-SIM
 * SMS gateway, or null if none is connected. Throws only if
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
