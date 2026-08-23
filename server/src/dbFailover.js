// ============================================================================
// dbFailover.js — Primary/Backup Postgres failover state
// ============================================================================
// This app now talks to TWO independent Postgres databases (two separate
// Neon accounts, on purpose — see docs/DATA_REDUNDANCY.md): DATABASE_URL
// (primary) and DATABASE_URL_BACKUP (backup). Every write goes to both
// (mirrored from pg.js). Reads normally come from whichever pool is
// currently "active" — primary, unless a failover has happened.
//
// FAILOVER MODEL (deliberately manual recovery, see docs/DATA_REDUNDANCY.md):
//   - If a query against the primary pool fails with a connection-level
//     error (not a normal validation/constraint error), this module flips
//     `activePoolName` to "backup" so every subsequent query — read AND
//     write — in pg.js and every raw pg.pool.connect()/query() consumer
//     (registryDb.js, tenantProvision.js, migrateTenants.js,
//     routes/deviceIngest.js, tenantResolve.js) transparently starts
//     targeting the backup database instead. No route file changes needed.
//   - It does NOT automatically flip back once primary recovers. Recovery
//     requires a human to run scripts/sync-and-switch-back.js, which copies
//     everything written to backup during the outage back to primary, then
//     calls switchToPrimary() explicitly. Auto-switch-back is intentionally
//     NOT implemented: it would silently risk masking data written only to
//     backup during the outage, or worse, cause primary and backup to
//     silently diverge with no clear "source of truth". See the writeup in
//     docs/DATA_REDUNDANCY.md for the full reasoning.
//   - A failover event fires an email alert (see backupAlert.js), rate
//     limited so a flapping connection doesn't spam the mailbox.
// ============================================================================

const { Pool } = require("pg");

function normalizeDatabaseUrl(url) {
  if (!url) return url;
  // node-pg can fail with Neon's channel_binding=require param
  return url.replace(/([?&])channel_binding=[^&]*&?/g, "$1").replace(/[?&]$/, "");
}

function buildPool(rawUrl, label) {
  const url = normalizeDatabaseUrl(rawUrl);
  if (!url) return null;
  const needsSsl = process.env.DATABASE_SSL === "true" || url.includes("sslmode=require");
  const pool = new Pool({
    connectionString: url,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
  pool.on("error", (err) => {
    console.error(`Unexpected PostgreSQL pool error (${label}):`, err.message);
  });
  return pool;
}

const primaryPool = buildPool(process.env.DATABASE_URL, "primary");
// Backup is optional: if DATABASE_URL_BACKUP isn't set, the app behaves
// exactly as it did before this feature existed (single database, no
// mirroring, no failover) — this is what keeps every existing single-DB
// deployment working unchanged.
const backupPool = buildPool(process.env.DATABASE_URL_BACKUP, "backup");

if (!primaryPool) {
  throw new Error("DATABASE_URL is required for PostgreSQL");
}

let activePoolName = "primary";
let lastFailoverAt = null;
let lastFailoverReason = null;

// Connection-level errors mean the DATABASE ITSELF is unreachable — refused
// connection, DNS failure, timeout, admin shutdown, too many connections,
// etc. These are the only errors that should ever trigger a failover.
// Everything else (unique violation 23505, check constraint, foreign key,
// syntax error, etc.) is a NORMAL application-level error that has nothing
// to do with the database being down, and must keep behaving exactly as it
// always has (thrown straight back to the caller, no pool switch).
const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
]);
// Postgres error codes (not Node error codes) for server-side connection
// trouble: 57P01 admin shutdown, 57P02 crash shutdown, 57P03 cannot connect
// now, 08000/08003/08006 connection exceptions, 53300 too many connections.
const CONNECTION_ERROR_PG_CODES = new Set(["57P01", "57P02", "57P03", "08000", "08003", "08006", "53300"]);

function isConnectionError(err) {
  if (!err) return false;
  if (CONNECTION_ERROR_CODES.has(err.code)) return true;
  if (CONNECTION_ERROR_PG_CODES.has(err.code)) return true;
  // node-postgres wraps some connect()-time failures without a .code but
  // with a recognizable message.
  const msg = String(err.message || "");
  return /connect(ion)? (terminated|refused|timeout)|timeout expired/i.test(msg);
}

function activePool() {
  return activePoolName === "backup" && backupPool ? backupPool : primaryPool;
}

function isFailedOver() {
  return activePoolName === "backup";
}

function hasBackup() {
  return !!backupPool;
}

function failoverInfo() {
  return { activePoolName, lastFailoverAt, lastFailoverReason };
}

// Called by pg.js when a query against the active (primary) pool throws a
// connection-level error. Idempotent — calling it again while already
// failed-over just refreshes the reason/timestamp, it doesn't re-alert on
// every single query (backupAlert.js handles its own rate limiting too).
function switchToBackup(err) {
  if (!backupPool) {
    console.error(
      "PRIMARY DATABASE UNREACHABLE and no DATABASE_URL_BACKUP configured — site will go down:",
      err?.message
    );
    return false;
  }
  const alreadyFailedOver = activePoolName === "backup";
  activePoolName = "backup";
  lastFailoverAt = new Date();
  lastFailoverReason = err?.message || "unknown connection error";
  if (!alreadyFailedOver) {
    console.error(
      "!!! DATABASE FAILOVER: primary unreachable, switching all traffic to backup database !!!",
      lastFailoverReason
    );
    // Fire-and-forget; backupAlert.js does its own error handling so this
    // never throws back into a request path.
    try {
      require("./lib/backupAlert").notifyFailover(lastFailoverReason);
    } catch (alertErr) {
      console.error("Failed to send failover alert email:", alertErr.message);
    }
  }
  return true;
}

// Called only by scripts/sync-and-switch-back.js after a human has verified
// primary is healthy again and has run the reconciliation sync. Deliberately
// not exposed anywhere in the normal request path.
function switchToPrimary() {
  activePoolName = "primary";
  lastFailoverAt = null;
  lastFailoverReason = null;
  console.log("Database traffic switched back to primary.");
}

module.exports = {
  primaryPool,
  backupPool,
  activePool,
  isFailedOver,
  hasBackup,
  failoverInfo,
  isConnectionError,
  switchToBackup,
  switchToPrimary,
};
