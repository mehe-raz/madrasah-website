// ============================================================================
// platformGatewayCredentials.js — প্ল্যাটফর্মের নিজস্ব bKash গেটওয়ে
// (registry.platform_gateway) কানেক্ট/পড়া/ডিসকানেক্ট করার লজিক (ad-hoc,
// docs/CURRENT_TASK.md-এ পূর্ণ লেখা আছে)।
// ============================================================================
// lib/paymentGatewayCredentials.js-এর ঠিক same প্যাটার্ন (Phase 8E/8F), শুধু
// institution_payment_gateways-এর বদলে registry.platform_gateway-তে — এই
// একটাই রো প্ল্যাটফর্ম অপারেটরের নিজের bKash মার্চেন্ট/এজেন্ট অ্যাকাউন্ট,
// কোনো নির্দিষ্ট প্রতিষ্ঠানের না। প্রতিটা প্রতিষ্ঠান তাদের নিজস্ব মাসিক
// সাবস্ক্রিপশন বিল এই একই কানেক্টেড গেটওয়ে দিয়ে পরিশোধ করে
// (routes/institutionBilling.js) — routes/paymentGateway.js (Phase 8E) এর
// থেকে সম্পূর্ণ আলাদা, ওটা প্রতিষ্ঠানের নিজের গেটওয়ে (গার্ডিয়ানদের কাছ
// থেকে ফি কালেকশনের জন্য)।
//
// connect/disconnect ওয়্যারিং routes/platform.js-এ (super_admin only) —
// এই ফাইল শুধু ডেটা পড়া/লেখার লজিক, কোনো live bKash কল নিজে করে না
// (সেটা lib/bkashGateway.js-এর কাজ, আগে থেকেই আছে)।
// ============================================================================

const registryDb = require("../registryDb");
const gatewayCrypto = require("./gatewayCredentialCrypto");

/** Connection status only — never returns decrypted secrets. */
async function getPlatformGatewayStatus() {
  const { rows } = await registryDb.registryPool.query(
    `SELECT provider, connected, "lastCheckedAt", "lastError" FROM registry.platform_gateway ORDER BY id LIMIT 1`
  );
  const row = rows[0];
  return {
    connected: Boolean(row?.connected),
    provider: row?.provider || "bkash",
    lastCheckedAt: row?.lastCheckedAt || null,
    lastError: row?.connected ? null : row?.lastError || null,
    configured: gatewayCrypto.isConfigured(),
  };
}

/**
 * Returns decrypted { appKey, appSecret, username, password } for the
 * platform's own connected gateway, or null if none is connected. Callers
 * (routes/institutionBilling.js) let this go out of scope right after a
 * grant/create/execute call — never held anywhere longer-lived.
 */
async function getConnectedPlatformGateway() {
  const { rows } = await registryDb.registryPool.query(
    `SELECT "appKeyEnc", "appSecretEnc", "usernameEnc", "passwordEnc" FROM registry.platform_gateway WHERE connected = true ORDER BY id LIMIT 1`
  );
  const row = rows[0];
  if (!row) return null;
  return {
    appKey: gatewayCrypto.decrypt(row.appKeyEnc),
    appSecret: gatewayCrypto.decrypt(row.appSecretEnc),
    username: gatewayCrypto.decrypt(row.usernameEnc),
    password: gatewayCrypto.decrypt(row.passwordEnc),
  };
}

/** Only called after a live grantToken() call already succeeded — see routes/platform.js. */
async function saveConnectedPlatformGateway({ appKey, appSecret, username, password }) {
  const now = new Date().toISOString();
  const { rows } = await registryDb.registryPool.query(
    "SELECT id FROM registry.platform_gateway ORDER BY id LIMIT 1"
  );
  const existing = rows[0];
  const values = [
    "bkash",
    gatewayCrypto.encrypt(appKey),
    gatewayCrypto.encrypt(appSecret),
    gatewayCrypto.encrypt(username),
    gatewayCrypto.encrypt(password),
    true,
    now,
    null,
    now,
  ];
  if (existing) {
    await registryDb.registryPool.query(
      `UPDATE registry.platform_gateway SET provider=$1, "appKeyEnc"=$2, "appSecretEnc"=$3,
       "usernameEnc"=$4, "passwordEnc"=$5, connected=$6, "lastCheckedAt"=$7, "lastError"=$8, updated_at=$9
       WHERE id=$10`,
      [...values, existing.id]
    );
  } else {
    await registryDb.registryPool.query(
      `INSERT INTO registry.platform_gateway
       (provider, "appKeyEnc", "appSecretEnc", "usernameEnc", "passwordEnc", connected, "lastCheckedAt", "lastError", updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      values
    );
  }
}

/**
 * Records a failed grant-token attempt (bad credentials) — deliberately
 * does NOT store the submitted secrets, same reasoning as
 * routes/paymentGateway.js's failure branch.
 */
async function markPlatformGatewayFailed(error) {
  const now = new Date().toISOString();
  const { rows } = await registryDb.registryPool.query(
    "SELECT id FROM registry.platform_gateway ORDER BY id LIMIT 1"
  );
  const existing = rows[0];
  if (existing) {
    await registryDb.registryPool.query(
      `UPDATE registry.platform_gateway SET connected=false, "lastCheckedAt"=$1, "lastError"=$2, updated_at=$3 WHERE id=$4`,
      [now, error, now, existing.id]
    );
  } else {
    await registryDb.registryPool.query(
      `INSERT INTO registry.platform_gateway (provider, connected, "lastCheckedAt", "lastError", updated_at)
       VALUES ('bkash', false, $1, $2, $3)`,
      [now, error, now]
    );
  }
}

async function disconnectPlatformGateway() {
  const now = new Date().toISOString();
  await registryDb.registryPool.query(
    `UPDATE registry.platform_gateway SET connected=false, "appKeyEnc"=NULL, "appSecretEnc"=NULL,
     "usernameEnc"=NULL, "passwordEnc"=NULL, "lastError"=NULL, updated_at=$1
     WHERE id = (SELECT id FROM registry.platform_gateway ORDER BY id LIMIT 1)`,
    [now]
  );
}

module.exports = {
  getPlatformGatewayStatus,
  getConnectedPlatformGateway,
  saveConnectedPlatformGateway,
  markPlatformGatewayFailed,
  disconnectPlatformGateway,
};
