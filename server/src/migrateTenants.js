// ============================================================================
// migrateTenants.js  (Part 6 / 6 — Billing + Migration Tooling)
// ============================================================================
// Runs an arbitrary SQL string against every tenant_xxx schema, one at a
// time, each in its own transaction on its own connection. This is what
// keeps every institution's tables in sync after this point: whenever
// sql/supabase_schema.sql gains a new "ALTER TABLE ... ADD COLUMN IF NOT
// EXISTS ..." (the same idempotent style already used throughout this repo),
// this module is how that change reaches every existing tenant schema —
// re-running db.js's initSchema() only ever touched `public`.
//
// Deliberately per-tenant transactions (not one transaction for the whole
// batch): if institution #14 out of 40 has some unexpected drift and its
// statement fails, institutions #1-13 keep their successful change and
// #15-40 still get a chance — a single failure doesn't roll back everyone
// else's already-applied migration. Each result is reported individually so
// a failed subset can be retried (e.g. by hand) without re-running the rest.
// ============================================================================

const pg = require("./pg");
const registryDb = require("./registryDb");

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

// Re-validated here for the same reason tenantProvision.js re-checks it:
// this value is interpolated directly into `SET search_path`, where bind
// parameters aren't allowed, so this is the only guard between a corrupted
// registry row and a broken/unsafe query.
const SAFE_SCHEMA_NAME = /^tenant_[a-z0-9_]{1,40}$/;

// Every institution currently in the registry, regardless of status —
// a suspended institution's data still needs to stay on the same table
// shape as everyone else's in case it's ever reactivated.
async function listTenantSchemas() {
  const institutions = await registryDb.listInstitutions();
  // `id` added for Phase 8D's sms-topups/pending listing, which needs to
  // hand each row back to the client as an /institutions/:id/... route
  // param — every earlier caller here (migrateAllTenants' report,
  // routes/platform.js's migration-tool preview) only ever displayed
  // code/name/schemaName, so this is purely additive.
  return institutions.map((i) => ({ id: i.id, code: i.code, name: i.name, schemaName: i.schema_name }));
}

async function migrateOneTenant(schemaName, sqlText) {
  if (!SAFE_SCHEMA_NAME.test(schemaName)) {
    throw new Error(`Refusing to migrate invalid schema name: "${schemaName}"`);
  }
  const client = await pg.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET search_path TO ${quoteIdent(schemaName)}, public`);
    await client.query(sqlText);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.query("SET search_path TO public").catch(() => {});
    client.release();
  }
}

// Runs `fn(client)` against one specific tenant's schema (search_path set,
// same transaction/rollback safety as migrateOneTenant above), returning
// whatever `fn` returns. Unlike migrateOneTenant (a raw SQL string with no
// bind-parameter support — fine for hand-typed migration SQL, not fine for
// user-supplied values like a top-up amount or a bKash Trx ID), this hands
// `fn` a live pg client so it can run its own parameterized queries.
// BUSINESS_READINESS_ROADMAP.md Phase 8D — the platform panel's SMS-wallet
// top-up approval is the first caller (routes/platform.js): it needs to
// touch exactly ONE institution's sms_wallets/sms_transactions rows, not
// every tenant like migrateAllTenants does.
async function withTenantSchema(schemaName, fn) {
  if (!SAFE_SCHEMA_NAME.test(schemaName)) {
    throw new Error(`Refusing to run in invalid schema name: "${schemaName}"`);
  }
  const client = await pg.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET search_path TO ${quoteIdent(schemaName)}, public`);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.query("SET search_path TO public").catch(() => {});
    client.release();
  }
}

// Runs `sqlText` against every tenant schema currently in the registry.
// Returns { succeeded: [{code,name,schemaName}], failed: [{code,name,schemaName,error}] }
// and never throws itself — a failure in one tenant is captured per-item so
// the caller (CLI or platform route) can show a full report instead of
// stopping at the first problem.
async function migrateAllTenants(sqlText) {
  if (!sqlText || !sqlText.trim()) {
    const err = new Error("No SQL provided to migrate");
    err.status = 400;
    throw err;
  }
  const tenants = await listTenantSchemas();
  const succeeded = [];
  const failed = [];
  for (const tenant of tenants) {
    try {
      await migrateOneTenant(tenant.schemaName, sqlText);
      succeeded.push(tenant);
    } catch (err) {
      failed.push({ ...tenant, error: err.message });
    }
  }
  return { succeeded, failed, total: tenants.length };
}

module.exports = {
  listTenantSchemas,
  migrateOneTenant,
  migrateAllTenants,
  withTenantSchema,
};
