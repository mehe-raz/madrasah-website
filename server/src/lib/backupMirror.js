// ============================================================================
// backupMirror.js — fire-and-forget write mirroring to the secondary database
// ============================================================================
// Every write statement executed against the ACTIVE pool (see pg.js) is also
// sent here, which forwards a copy to the OTHER pool — backup, in the normal
// case; primary, if we're currently failed-over to backup (so writes made
// during an outage still attempt to reach primary once it's reachable again,
// though the authoritative reconciliation is still scripts/sync-and-switch-back.js,
// this is just a best-effort head start).
//
// This module NEVER throws into the caller and NEVER slows down the live
// request — mirrorWrite() is called without awaiting its returned promise
// from pg.js. If the secondary write fails, it's logged and, if the
// secondary is the backup pool specifically, may trigger a failover alert
// email (rate-limited — see backupAlert.js) so a human finds out the two
// databases have started to drift, without the site itself being affected.
// ============================================================================

const tenantContext = require("./../tenantContext");
const failover = require("../dbFailover");

let consecutiveMirrorFailures = 0;
const ALERT_AFTER_N_FAILURES = 3;

function targetPoolForMirror() {
  // Mirror always targets whichever pool is NOT currently active.
  if (failover.isFailedOver()) return failover.primaryPool;
  return failover.backupPool;
}

// Applies the same tenant search_path the primary write used, so a mirrored
// INSERT lands in the same tenant_xxx schema on the secondary database. The
// secondary must have had the identical schema bootstrapped ahead of time
// (see scripts/copy-to-backup-db.js) for this to succeed — if a tenant
// schema is missing on the secondary, every mirror for that tenant fails
// loudly in the logs (and after ALERT_AFTER_N_FAILURES, by email) until
// scripts/copy-to-backup-db.js is run again.
async function withSearchPath(pool, schemaName, fn) {
  if (!schemaName) return fn(pool);
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schemaName}", public`);
    return await fn(client);
  } finally {
    try {
      await client.query("SET search_path TO public");
    } finally {
      client.release();
    }
  }
}

async function doMirror(text, params) {
  const targetPool = targetPoolForMirror();
  if (!targetPool) return; // no backup configured — nothing to mirror to

  const tenant = tenantContext.get();
  const schemaName = tenant?.institution?.schema_name;

  try {
    if (schemaName) {
      await withSearchPath(targetPool, schemaName, (clientOrPool) => clientOrPool.query(text, params));
    } else {
      await targetPool.query(text, params);
    }
    consecutiveMirrorFailures = 0;
  } catch (err) {
    consecutiveMirrorFailures += 1;
    console.error(
      `Backup mirror write failed (${consecutiveMirrorFailures} consecutive):`,
      err.message,
      "-- statement:",
      text.slice(0, 120)
    );
    if (consecutiveMirrorFailures >= ALERT_AFTER_N_FAILURES) {
      try {
        require("./backupAlert").notifyMirrorFailing(err.message, consecutiveMirrorFailures);
      } catch (alertErr) {
        console.error("Failed to send backup-mirror alert email:", alertErr.message);
      }
    }
  }
}

// Fire-and-forget on purpose — pg.js does not (and must not) await this.
function mirrorWrite(text, params) {
  doMirror(text, params).catch((err) => {
    // doMirror already catches everything internally; this is only a
    // last-resort net so a truly unexpected throw can never become an
    // unhandled promise rejection that crashes the process.
    console.error("Unexpected error in backup mirror:", err.message);
  });
}

module.exports = { mirrorWrite };
