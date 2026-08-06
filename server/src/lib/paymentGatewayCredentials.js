// ============================================================================
// paymentGatewayCredentials.js — reads back the institution's own connected
// bKash credentials for an actual payment call (Phase 8F).
// ============================================================================
// routes/paymentGateway.js (Phase 8E) only ever WRITES encrypted credentials
// and reports connection status — it never reads them back out. This is the
// one place that does: guardianAuth.js's fee-payment routes and
// routes/sms.js's gateway-topup routes both call getConnectedGateway() to
// get a ready-to-use, decrypted credential object right before a
// grant/create/execute call, and let it go out of scope immediately after
// — nothing here holds decrypted credentials anywhere but a local variable.
// ============================================================================

const db = require("../db");
const gatewayCrypto = require("./gatewayCredentialCrypto");

/**
 * Returns { appKey, appSecret, username, password } for the institution's
 * connected bKash gateway, or null if none is connected. Throws only if
 * GATEWAY_CREDENTIAL_KEY itself is missing/wrong (an operator misconfig,
 * not a normal "not connected" case) — callers should let that surface as
 * a 500 rather than silently treating it as "not connected".
 */
async function getConnectedGateway() {
  const row = await db.get(
    'SELECT "appKeyEnc", "appSecretEnc", "usernameEnc", "passwordEnc" FROM institution_payment_gateways WHERE connected = true ORDER BY id LIMIT 1'
  );
  if (!row) return null;
  return {
    appKey: gatewayCrypto.decrypt(row.appKeyEnc),
    appSecret: gatewayCrypto.decrypt(row.appSecretEnc),
    username: gatewayCrypto.decrypt(row.usernameEnc),
    password: gatewayCrypto.decrypt(row.passwordEnc),
  };
}

module.exports = { getConnectedGateway };
