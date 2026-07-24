// ============================================================================
// billing.js  (Part 6 / 6 — Billing + Migration Tooling)
// ============================================================================
// Schedules registryDb.runExpiryScan() to run periodically, so a trial or
// subscription that has run out actually gets suspended without a human
// remembering to click something. Deliberately implemented with a plain
// setInterval instead of adding a cron-style npm dependency (AGENTS.md rule
// 5: no new dependency without saying so first) — a periodic sweep on a
// long interval is all this needs; a full cron expression parser would be
// solving a problem this app doesn't have.
//
// OFF BY DEFAULT in the sense that matters: if no institution's expiry has
// passed, each sweep is a single cheap SELECT that matches zero rows and
// does nothing else. It's always safe to leave running, including on a
// single-tenant deployment that has never provisioned any tenant (the
// registry schema simply has zero rows).
// ============================================================================

const registryDb = require("./registryDb");

let intervalHandle = null;

function isEnabled() {
  return process.env.DISABLE_BILLING_AUTOSUSPEND !== "true";
}

function intervalMs() {
  const minutes = Number(process.env.BILLING_AUTOSUSPEND_INTERVAL_MINUTES) || 60;
  return Math.max(minutes, 5) * 60 * 1000; // 5-minute floor so a typo can't turn this into a hot loop
}

async function runScanOnce() {
  const suspended = await registryDb.runExpiryScan();
  if (suspended.length) {
    console.log(
      `[billing] auto-suspended ${suspended.length} institution(s): ${suspended.map((i) => i.code).join(", ")}`
    );
  }
  return suspended;
}

// Called once from index.js at server startup. Idempotent — calling it
// twice just clears and restarts the interval rather than stacking two
// timers.
function startExpiryScanJob() {
  if (intervalHandle) clearInterval(intervalHandle);
  if (!isEnabled()) {
    console.log("[billing] auto-suspend job disabled (DISABLE_BILLING_AUTOSUSPEND=true)");
    return;
  }
  const ms = intervalMs();
  intervalHandle = setInterval(() => {
    runScanOnce().catch((err) => console.error("[billing] expiry scan failed:", err.message));
  }, ms);
  // Don't let this timer keep the process alive on its own during shutdown.
  if (intervalHandle.unref) intervalHandle.unref();
  console.log(`[billing] auto-suspend job scheduled every ${Math.round(ms / 60000)} minute(s)`);
  // Run one sweep shortly after boot too, rather than waiting a full
  // interval for the first check.
  setTimeout(() => {
    runScanOnce().catch((err) => console.error("[billing] initial expiry scan failed:", err.message));
  }, 10 * 1000).unref?.();
}

function stopExpiryScanJob() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = {
  startExpiryScanJob,
  stopExpiryScanJob,
  runScanOnce,
};
