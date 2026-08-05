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
// Gate (both required):
//   1. institution's plan has the "sms" feature. Still `false` on every
//      tier as of this phase — Phase 8D flips it on for `premium` once
//      there's a settings-page opt-in — so every call through here on a
//      real multi-tenant institution is a correct no-op today, same as
//      smsSender.js being a no-op until SMS_PROVIDER_API_KEY is set.
//      Single-tenant deployments (no institution in tenantContext) skip
//      this check entirely, matching middleware/planGate.js's own
//      reasoning for the same situation.
//   2. Wallet balance > 0 — not duplicated here; smsSender.js's own
//      race-safe check (immediately before it deducts) is the real gate.
// ============================================================================

const tenantContext = require("../tenantContext");
const { planAllows } = require("../config/planFeatures");
const { sendSms } = require("./smsSender");

function institutionAllowsSms() {
  const ctx = tenantContext.get();
  if (!ctx?.institution) return true; // single-tenant deployment — never gated
  return planAllows(ctx.institution.plan, "sms");
}

/**
 * Sends a guardian-facing SMS if the institution's plan allows it. Never
 * throws — same best-effort contract as smsSender.sendSms(), with the
 * plan check layered in front of it. A `plan_not_allowed` result is an
 * expected, routine outcome for every institution today (SMS isn't
 * enabled on any tier yet), not something worth logging as an error.
 *
 * @param {{ to: string, message: string, reference?: string }} params
 */
async function sendGuardianSms({ to, message, reference }) {
  if (!to) return { sent: false, reason: "no_phone" };
  if (!institutionAllowsSms()) return { sent: false, reason: "plan_not_allowed" };
  return sendSms({ to, message, reference });
}

module.exports = { sendGuardianSms };
