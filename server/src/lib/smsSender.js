// ============================================================================
// smsSender.js — provider-agnostic SMS sending + wallet deduction
// ============================================================================
// BUSINESS_READINESS_ROADMAP.md Phase 8B. Same single-responsibility,
// env-var-driven, no-op-when-unconfigured shape as lib/mailer.js — but
// unlike mailer.js (which throws on failure so a password-reset request
// can surface the error to the user), this never throws: a skipped or
// failed SMS must never break the caller (a fee-due reminder, a
// result-published hook, ...), matching notifications.js's "best-effort,
// log and continue" contract.
//
// Provider selection: SMS_PROVIDER env var, looked up in
// lib/smsProviders/index.js's registry. Configured today: BulkSMSBD
// (bulksmsbd.net) — chosen 2026-08-06 by the user after comparing it to
// Alpha SMS on entry cost and per-SMS rate at small/medium volume. Adding
// another reseller later needs no change in this file — see
// smsProviders/index.js.
//
// Wallet balance lives in sms_wallets/sms_transactions
// (server/sql/supabase_schema.sql, Phase 8A) — one row per tenant schema,
// no institutionId column, so the usual db.get/db.run/db.withTransaction
// calls below are already tenant-scoped via tenantContext.js the same way
// every other route/lib file in this repo is.
// ============================================================================

const db = require("../db");
const { createNotification } = require("./notifications");
const PROVIDERS = require("./smsProviders");

// Per-SMS cost in taka, deducted from the wallet on every successful send.
// Overridable via SMS_COST_PER_SMS once the real BulkSMSBD rate for this
// account's recharge tier is known — this default is just a safe starting
// placeholder, not a quoted price.
const DEFAULT_COST_PER_SMS = 0.4;

function getConfig() {
  const costEnv = Number(process.env.SMS_COST_PER_SMS);
  return {
    provider: (process.env.SMS_PROVIDER || "bulksmsbd").trim(),
    apiKey: process.env.SMS_PROVIDER_API_KEY || "",
    senderId: process.env.SMS_PROVIDER_SENDER_ID || "",
    costPerSms: costEnv > 0 ? costEnv : DEFAULT_COST_PER_SMS,
  };
}

// Cooldown so a burst of skipped sends (e.g. a notification hook firing for
// many students in a row once the wallet hits zero) doesn't write one
// notification row per skipped SMS — one heads-up per hour is enough to
// act on. In-memory only (per server process), which is fine: worst case
// after a restart is one extra notification, not a missed one.
let lowBalanceNotifiedAt = 0;
const LOW_BALANCE_NOTIFY_COOLDOWN_MS = 60 * 60 * 1000;

async function notifyLowBalance(balance) {
  const now = Date.now();
  if (now - lowBalanceNotifiedAt < LOW_BALANCE_NOTIFY_COOLDOWN_MS) return;
  lowBalanceNotifiedAt = now;
  await createNotification({
    type: "sms-balance-low",
    title: "SMS ব্যালেন্স শেষ, রিচার্জ করুন",
    body: `বর্তমান ব্যালেন্স ৳${balance.toFixed(2)} — নতুন SMS পাঠানো বন্ধ আছে।`,
    targetRoles: ["Admin", "Super Admin"],
    link: "/settings",
  });
}

/**
 * Sends one SMS after checking/deducting the tenant's SMS wallet balance.
 * Never throws — every failure mode (no provider configured, insufficient
 * balance, provider API error) returns { sent: false, reason } instead, so
 * a caller can fire-and-forget this the same way it already does with
 * notifications.createNotification, with no try/catch needed at the call
 * site.
 *
 * @param {{ to: string, message: string, smsCount?: number, reference?: string }} params
 *   smsCount — how many SMS units this message counts as (a long message
 *   can split into multiple parts at the provider's end); defaults to 1.
 *   reference — free text stored on the ledger row, e.g. what triggered
 *   this send ("fee-due:<studentId>", "result-published:<examId>") — kept
 *   as a string since it shares the column with manual top-ups' bKash
 *   Trx IDs (see the sms_transactions comment in supabase_schema.sql).
 * @returns {Promise<{ sent: boolean, reason?: string, providerMessageId?: string, raw?: any, error?: string }>}
 */
async function sendSms({ to, message, smsCount = 1, reference = "" }) {
  const config = getConfig();

  if (!config.apiKey) {
    // Unconfigured deployment (SMS_PROVIDER_API_KEY unset) — silent no-op.
    // Same trigger condition as mailer.js's RESEND_API_KEY check, except
    // mailer.js throws (a password reset needs to tell the user it
    // failed) and this doesn't (SMS is a background dispatch hook, not a
    // user-initiated action waiting on a response).
    return { sent: false, reason: "not_configured" };
  }

  if (!to || !message) {
    return { sent: false, reason: "invalid_input" };
  }

  const provider = PROVIDERS[config.provider];
  if (!provider) {
    console.error(`smsSender: unknown SMS_PROVIDER "${config.provider}"`);
    return { sent: false, reason: "unknown_provider" };
  }

  const units = Math.max(1, Number(smsCount) || 1);
  const cost = config.costPerSms * units;

  try {
    const wallet = await db.get("SELECT * FROM sms_wallets LIMIT 1");
    const balance = Number(wallet?.balance_taka || 0);

    if (balance < cost) {
      await notifyLowBalance(balance);
      return { sent: false, reason: "insufficient_balance" };
    }

    let providerResult;
    try {
      providerResult = await provider.send({
        apiKey: config.apiKey,
        senderId: config.senderId,
        to,
        message,
      });
    } catch (err) {
      console.error("smsSender: provider request failed:", err.message);
      return { sent: false, reason: "provider_error", error: err.message };
    }

    if (!providerResult?.ok) {
      console.error("smsSender: provider rejected the message:", providerResult?.raw);
      return { sent: false, reason: "provider_rejected", raw: providerResult?.raw };
    }

    // Deduct only after a confirmed successful send, ledger row + running
    // balance update in one transaction — same shape as the payments.js
    // insert-row-then-update-running-total pattern.
    await db.withTransaction(async (tx) => {
      await tx.run(
        `INSERT INTO sms_transactions (type, "amountTaka", "smsCount", reference, "createdAt")
         VALUES ('deduct', $1, $2, $3, $4)`,
        [cost, units, reference ? String(reference) : "", new Date().toISOString()]
      );
      await tx.run(`UPDATE sms_wallets SET balance_taka = balance_taka - $1, "updatedAt" = now()`, [cost]);
    });

    return { sent: true, providerMessageId: providerResult.providerMessageId, raw: providerResult.raw };
  } catch (err) {
    console.error("smsSender: unexpected error:", err.message);
    return { sent: false, reason: "error", error: err.message };
  }
}

module.exports = { sendSms };
