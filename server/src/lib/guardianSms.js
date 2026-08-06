// ============================================================================
// guardianSms.js — plan-gated SMS dispatch to guardians (Phase 8C)
// ============================================================================
// BUSINESS_READINESS_ROADMAP.md Phase 8C asked for the SMS channel to hook
// into lib/notifications.js's createNotification(). That table's audience
// (targetUserId / targetRoles) is staff-only — resolved against `users.id`
// and staff roles (see notifications.js) — while guardians run on a
// completely separate auth system (guardianData.js / GuardianAuthContext,
// no `users` row at all). A guardian-facing event (result published, fee
// due) can't be represented as a row in that table, so this file is the
// guardian-facing equivalent instead: same "call it, never throws, gated
// by plan+wallet" shape as the roadmap's hook, just not literally inside
// createNotification() since there's no guardian notification row to hang
// it off of.
//
// Gate (all required):
//   1. institution's plan has the "sms" feature — `true` for `premium` as
//      of Phase 8D (routes/sms.js's settings page is the opt-in UI this
//      comment used to say was still missing). Single-tenant deployments
//      (no institution in tenantContext) skip this check entirely,
//      matching middleware/planGate.js's own reasoning for the same
//      situation.
//   2. If `notificationType` is passed, the admin hasn't turned that
//      specific type off from the SMS settings page (routes/sms.js's
//      PUT /notification-prefs, stored under the "smsNotificationPrefs"
//      settings key). Callers that don't pass a type (none currently)
//      skip this check — same "opt-out, not opt-in" default as the
//      settings page itself.
//   3. Wallet balance > 0 — not duplicated here; smsSender.js's own
//      race-safe check (immediately before it deducts) is the real gate.
// ============================================================================

const tenantContext = require("../tenantContext");
const { planAllows } = require("../config/planFeatures");
const { sendSms } = require("./smsSender");
const db = require("../db");

function institutionAllowsSms() {
  const ctx = tenantContext.get();
  if (!ctx?.institution) return true; // single-tenant deployment — never gated
  return planAllows(ctx.institution.plan, "sms");
}

async function notificationTypeAllowed(notificationType) {
  if (!notificationType) return true;
  const row = await db.get("SELECT value FROM settings WHERE key = 'smsNotificationPrefs'").catch(() => null);
  if (!row?.value) return true; // no saved prefs yet -> every type defaults to on
  try {
    const prefs = JSON.parse(row.value);
    return prefs[notificationType] !== false;
  } catch {
    return true;
  }
}

/**
 * Sends a guardian-facing SMS if the institution's plan (and, for a typed
 * call, the admin's per-type toggle) allow it. Never throws — same
 * best-effort contract as smsSender.sendSms(), with the plan/preference
 * checks layered in front of it.
 *
 * @param {{ to: string, message: string, reference?: string, notificationType?: string }} params
 *   notificationType — one of routes/sms.js's NOTIFICATION_TYPES (e.g.
 *   "feeDueReminder", "resultPublished"), used to look up the admin's
 *   per-type on/off toggle. Omit for a send that should never be
 *   individually toggleable.
 */
async function sendGuardianSms({ to, message, reference, notificationType }) {
  if (!to) return { sent: false, reason: "no_phone" };
  if (!institutionAllowsSms()) return { sent: false, reason: "plan_not_allowed" };
  if (!(await notificationTypeAllowed(notificationType))) return { sent: false, reason: "notification_type_disabled" };
  return sendSms({ to, message, reference });
}

module.exports = { sendGuardianSms };
