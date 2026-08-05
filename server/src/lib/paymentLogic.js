// ============================================================================
// lib/paymentLogic.js
// ============================================================================
// Pure, side-effect-free helpers pulled out of routes/payments.js so the
// "is this payment a conflict, and what should the resulting due/status be"
// logic can be unit tested without spinning up db.withTransaction. Behavior
// is unchanged from the inline version that used to live in payments.js —
// this is an extraction, not a rewrite (see BUSINESS_READINESS_ROADMAP.md
// Phase 5, part 1).
// ============================================================================

// Offline-first Phase 5 (client sync) note, carried over from payments.js:
// a queued payment can reach the server well after it was collected, so by
// sync time another payment for the same student may have already cleared
// the due to 0. Rather than guess which payment is "real" and silently
// double-book income, a payment against a student whose due is already <= 0
// is treated as a conflict that needs manual review (see
// POST /:id/resolve-flag in routes/payments.js).
function isPaymentConflict(currentDue) {
  return Number(currentDue || 0) <= 0;
}

// Given a due BEFORE this payment is applied (and assumed not a conflict —
// callers should check isPaymentConflict first), compute the due AFTER the
// payment and whether that clears the student's balance. Shared by both the
// normal payment path and the "confirm" branch of resolve-flag, which is
// exactly the same due-reduction math computed against the student's
// CURRENT due at confirmation time.
function computeDueAfterPayment(currentDue, payAmount) {
  const due = Number(currentDue || 0);
  const amount = Number(payAmount || 0);
  const newDue = Math.max(0, due - amount);
  const status = newDue === 0 || amount >= due ? "Completed" : "Partial";
  return { newDue, status };
}

// Full outcome for a brand-new payment: conflict check + due/status in one
// call, matching what POST / in routes/payments.js needs. `flagReason` is
// left to the caller (it's user-facing Bangla text that embeds the amount),
// this only returns whether a reason is needed.
function computePaymentOutcome(currentDue, payAmount) {
  const due = Number(currentDue || 0);
  if (isPaymentConflict(due)) {
    return { isConflict: true, newDue: due, status: "Flagged" };
  }
  const { newDue, status } = computeDueAfterPayment(due, payAmount);
  return { isConflict: false, newDue, status };
}

module.exports = { isPaymentConflict, computeDueAfterPayment, computePaymentOutcome };
