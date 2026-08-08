// ============================================================================
// guardianReminderScheduler.js  (Guardian Reminder Messenger — ad-hoc)
// ============================================================================
// Schedules lib/guardianReminders.js's dispatchDueReminders() to run
// periodically, so a 'daily' or 'specificDate' reminder actually goes out
// without an admin remembering to press the manual "এখনই পাঠান" button
// every day. Deliberately implemented with a plain setInterval instead of
// adding a cron-style npm dependency — same reasoning, and the same
// pattern, as server/src/billing.js's startExpiryScanJob (AGENTS.md Rule
// 5: no new dependency without saying so first). A periodic sweep on an
// interval well under 24 hours is all "daily" needs here; a full cron
// expression parser would be solving a problem this app doesn't have.
//
// This is one of the two delivery mechanisms the user explicitly asked
// for together — see docs/CURRENT_TASK.md — the other being the manual
// POST /api/guardian-reminders/dispatch button in routes/guardianReminders.js.
// Both call the exact same dispatchDueReminders(), which is same-day-dedup
// safe, so running both never double-sends.
// ============================================================================

const { dispatchDueReminders } = require("./lib/guardianReminders");

let intervalHandle = null;

function isEnabled() {
  return process.env.DISABLE_GUARDIAN_REMINDERS !== "true";
}

function intervalMs() {
  // Default: every 10 minutes (docs/CONDITIONAL_REMINDERS_PLAN.md Phase 3 —
  // was 30 minutes before scheduleTime existed; feeDue/lateArrival/
  // attendanceMissing reminders now carry an admin-picked time-of-day, so
  // the sweep needs to land within roughly 5-10 minutes of it, not just
  // "sometime the same day". Override with GUARDIAN_REMINDER_INTERVAL_MINUTES
  // if a deployment needs a different cadence.
  const minutes = Number(process.env.GUARDIAN_REMINDER_INTERVAL_MINUTES) || 10;
  return Math.max(minutes, 5) * 60 * 1000; // 5-minute floor so a typo can't turn this into a hot loop
}

async function runSweepOnce() {
  const dispatched = await dispatchDueReminders();
  if (dispatched.length) {
    console.log(
      `[guardian-reminders] auto-dispatched ${dispatched.length} reminder(s): ${dispatched
        .map((d) => `#${d.reminderId} (${d.count})`)
        .join(", ")}`
    );
  }
  return dispatched;
}

// Called once from index.js at server startup. Idempotent — calling it
// twice just clears and restarts the interval rather than stacking two
// timers.
function startGuardianReminderJob() {
  if (intervalHandle) clearInterval(intervalHandle);
  if (!isEnabled()) {
    console.log("[guardian-reminders] auto-dispatch disabled (DISABLE_GUARDIAN_REMINDERS=true)");
    return;
  }
  const ms = intervalMs();
  intervalHandle = setInterval(() => {
    runSweepOnce().catch((err) => console.error("[guardian-reminders] sweep failed:", err.message));
  }, ms);
  // Don't let this timer keep the process alive on its own during shutdown.
  if (intervalHandle.unref) intervalHandle.unref();
  console.log(`[guardian-reminders] auto-dispatch scheduled every ${Math.round(ms / 60000)} minute(s)`);
  // Run one sweep shortly after boot too, rather than waiting a full
  // interval for the first check.
  setTimeout(() => {
    runSweepOnce().catch((err) => console.error("[guardian-reminders] initial sweep failed:", err.message));
  }, 15 * 1000).unref?.();
}

function stopGuardianReminderJob() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = { startGuardianReminderJob, stopGuardianReminderJob, runSweepOnce };
