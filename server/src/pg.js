const tenantContext = require("./tenantContext");
const failover = require("./dbFailover");
const { mirrorWrite } = require("./lib/backupMirror");

// ----------------------------------------------------------------------------
// `pool` used to be a single node-pg Pool exported directly. It's now a Proxy
// that always forwards to whichever pool is currently ACTIVE (primary, or
// backup after a failover — see dbFailover.js). This is what lets every
// existing raw consumer (registryDb.js, tenantProvision.js, migrateTenants.js,
// routes/deviceIngest.js, middleware/tenantResolve.js — all of which call
// pg.pool.connect() or pg.pool.query() directly instead of going through the
// query/get/all/run helpers below) transparently follow a failover with zero
// changes to those files.
// ----------------------------------------------------------------------------
const pool = new Proxy(
  {},
  {
    get(_target, prop) {
      const target = failover.activePool();
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  }
);

function isUniqueViolation(err) {
  return err?.code === "23505";
}

function clientHelpers(client) {
  return {
    query: (text, params) => client.query(text, params),
    get: async (text, params) => (await client.query(text, params)).rows[0],
    all: async (text, params) => (await client.query(text, params)).rows,
    run: async (text, params) => {
      const result = await client.query(text, params);
      return {
        rowCount: result.rowCount,
        insertId: result.rows[0]?.id,
      };
    },
  };
}

// If tenant-resolution middleware (Part 3) has checked out a per-request
// client with search_path already pointed at a tenant_xxx schema, use that
// connection for everything in this request. Outside of any such context
// (server boot, single-tenant deployments, MULTI_TENANT_MODE=false) this is
// undefined and every call below behaves exactly as it did before Part 3 —
// straight to the shared pool, `public` schema.
function activeClient() {
  return tenantContext.get()?.client;
}

// Statements that mutate data or schema — these are the ones mirrored to the
// backup database (see backupMirror.js). A cheap heuristic on the leading
// keyword is enough here: it only decides whether to ALSO send a copy to
// backup, it never affects what happens against the (authoritative, for
// reads) active pool, so a false positive/negative just means one extra or
// one skipped mirror attempt, not a correctness issue for the live response.
const WRITE_RE = /^\s*(insert|update|delete|create|alter|drop|truncate|grant|revoke)\b/i;

function isWriteStatement(text) {
  return WRITE_RE.test(text);
}

async function runOnActivePool(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    if (failover.isConnectionError(err)) {
      failover.switchToBackup(err);
      // Retry once against the (now active) backup pool so this call
      // doesn't fail the in-flight request just because the switch happened
      // mid-query.
      return pool.query(text, params);
    }
    throw err;
  }
}

async function query(text, params = []) {
  const client = activeClient();
  let result;
  if (client) {
    result = await client.query(text, params);
  } else {
    result = await runOnActivePool(text, params);
  }
  if (isWriteStatement(text)) {
    // Fire-and-forget mirror to the OTHER database (backup, normally; or
    // primary, if we're currently failed-over to backup and primary has
    // since come back on its own for an unrelated read — see backupMirror.js
    // for exactly which pool it targets). Never awaited by the caller: a
    // slow or unreachable secondary must never add latency or failure risk
    // to the live request.
    mirrorWrite(text, params);
  }
  return result;
}

async function get(text, params = []) {
  const result = await query(text, params);
  return result.rows[0];
}

async function all(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

async function run(text, params = []) {
  const result = await query(text, params);
  return {
    rowCount: result.rowCount,
    insertId: result.rows[0]?.id,
  };
}

async function withTransaction(fn) {
  const tenantClient = activeClient();
  if (tenantClient) {
    // Already inside a per-request tenant connection whose search_path is
    // set to the right tenant_xxx schema. Nest the transaction on that same
    // connection rather than checking out a second one from the pool — a
    // second connection would default back to `public` and silently defeat
    // tenant isolation. This connection's lifecycle (release, search_path
    // reset) belongs to the tenant-resolution middleware, not to us, so no
    // client.release() here.
    await tenantClient.query("BEGIN");
    try {
      const result = await fn(clientHelpers(tenantClient));
      await tenantClient.query("COMMIT");
      return result;
    } catch (err) {
      await tenantClient.query("ROLLBACK");
      throw err;
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(clientHelpers(client));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  get,
  all,
  run,
  withTransaction,
  isUniqueViolation,
};
