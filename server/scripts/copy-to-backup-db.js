// ============================================================================
// copy-to-backup-db.js — one-time full copy: primary -> backup database
// ============================================================================
// Run this ONCE, right after you create the second Neon project and set
// DATABASE_URL_BACKUP, and before dual-write goes live for real. It:
//
//   1. Discovers every schema that matters: `registry` (the control plane),
//      `public` (single-tenant / legacy data, if any), and every `tenant_*`
//      schema (one per madrasah).
//   2. Recreates each schema's tables on the BACKUP database from the exact
//      same SQL files this app already uses to create them
//      (sql/registry_schema.sql, sql/supabase_schema.sql) — so table
//      structure is guaranteed identical, not hand-copied.
//   3. Copies every row, table by table, in FK-safe dependency order.
//   4. Resets every table's id sequence on the backup so future
//      dual-writes (which specify no explicit id) don't collide.
//
// This does NOT touch the primary database in any way — read-only there.
// Safe to re-run: every step uses CREATE TABLE IF NOT EXISTS / ON CONFLICT
// DO NOTHING style idempotency where the underlying SQL supports it, but
// note re-running after the primary has changed will NOT pick up updates to
// already-copied rows (this script is a one-time bulk copy, not a sync tool
// — for that, see scripts/sync-and-switch-back.js which is meant to run
// after a failover, not before one).
//
// Usage:
//   node scripts/copy-to-backup-db.js
//
// Requires DATABASE_URL (primary, source) and DATABASE_URL_BACKUP (backup,
// destination) both set in the environment.
// ============================================================================

require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

function normalizeDatabaseUrl(url) {
  if (!url) return url;
  return url.replace(/([?&])channel_binding=[^&]*&?/g, "$1").replace(/[?&]$/, "");
}

function buildPool(rawUrl, label) {
  const url = normalizeDatabaseUrl(rawUrl);
  if (!url) {
    console.error(`${label} connection string is missing.`);
    process.exit(1);
  }
  const needsSsl = process.env.DATABASE_SSL === "true" || url.includes("sslmode=require");
  return new Pool({ connectionString: url, ssl: needsSsl ? { rejectUnauthorized: false } : undefined });
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

// Same dependency order migrate-original-to-tenant.js already established
// for this app's fixed 17-ish table set — parents before the tables that
// reference them, so FK targets always exist before their dependents are
// inserted. Any table not in this list (future additions) is appended
// afterward in whatever order information_schema returns it, which is fine
// as long as it has no FK to a not-yet-copied table; if that ever changes,
// add the new table name to this list in the right position.
const TABLE_ORDER = [
  "students",
  "users",
  "settings",
  "expenses",
  "delete_requests",
  "receipt_counters",
  "audit_logs",
  "backup_restore_events",
  "admissions",
  "attendance",
  "payments",
  "income",
  "hifz_logs",
  "results",
  "password_resets",
  "notifications",
  "notification_reads",
];

async function getTablesInSchema(pool, schema) {
  const result = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
    [schema]
  );
  const found = result.rows.map((r) => r.table_name);
  const ordered = TABLE_ORDER.filter((t) => found.includes(t));
  const remaining = found.filter((t) => !TABLE_ORDER.includes(t));
  return [...ordered, ...remaining];
}

async function copySchemaTables(sourcePool, destPool, schema, tables) {
  for (const table of tables) {
    const countRow = (await sourcePool.query(`SELECT COUNT(*)::int AS c FROM ${quoteIdent(schema)}.${quoteIdent(table)}`)).rows[0];
    if (!countRow || countRow.c === 0) {
      console.log(`    ${table}: 0 rows, skipping`);
      continue;
    }
    // Truncate destination first so re-running this script for a single
    // schema doesn't create duplicate rows (safe: this script is meant to
    // run before dual-write goes live, i.e. before backup has any real
    // writes of its own yet).
    await destPool.query(`TRUNCATE TABLE ${quoteIdent(schema)}.${quoteIdent(table)} CASCADE`).catch(() => {});
    const sourceRows = await sourcePool.query(`SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)}`);
    if (sourceRows.rows.length === 0) continue;

    const columns = Object.keys(sourceRows.rows[0]);
    const columnList = columns.map(quoteIdent).join(", ");
    let inserted = 0;
    for (const row of sourceRows.rows) {
      const values = columns.map((c) => row[c]);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
      await destPool.query(
        `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} (${columnList}) VALUES (${placeholders})`,
        values
      );
      inserted += 1;
    }
    console.log(`    ${table}: ${inserted} row(s) copied`);

    // Reset the id sequence past whatever was just copied, same idiom as
    // migrate-original-to-tenant.js — tables with no "id" column throw here
    // and are safely ignored.
    try {
      await destPool.query(
        `SELECT setval(
           pg_get_serial_sequence('${schema}.${table}', 'id'),
           COALESCE((SELECT MAX(id) FROM ${quoteIdent(schema)}.${quoteIdent(table)}), 1),
           true
         )`
      );
    } catch {
      // no "id" column — nothing to reset
    }
  }
}

async function main() {
  const primary = buildPool(process.env.DATABASE_URL, "DATABASE_URL (primary)");
  const backup = buildPool(process.env.DATABASE_URL_BACKUP, "DATABASE_URL_BACKUP");

  console.log("Connecting to primary and backup databases...");
  await primary.query("SELECT 1");
  await backup.query("SELECT 1");
  console.log("Connected.\n");

  // ------------------------------------------------------------------------
  // 1. Registry schema (control plane: which institutions exist)
  // ------------------------------------------------------------------------
  console.log("== registry schema ==");
  const registrySql = fs.readFileSync(path.join(__dirname, "..", "sql", "registry_schema.sql"), "utf8");
  await backup.query(registrySql);
  const registryTables = await getTablesInSchema(primary, "registry");
  await copySchemaTables(primary, backup, "registry", registryTables);

  // ------------------------------------------------------------------------
  // 2. Every tenant_* schema, plus legacy/single-tenant `public` schema if
  //    it has any of the app's own tables (e.g. a students table) — a
  //    brand-new backup Neon project's `public` schema is otherwise empty,
  //    so this is a no-op there for pure multi-tenant deployments.
  // ------------------------------------------------------------------------
  const schemaListResult = await primary.query(
    `SELECT schema_name FROM information_schema.schemata
     WHERE schema_name = 'public' OR schema_name LIKE 'tenant\\_%' ESCAPE '\\'
     ORDER BY schema_name`
  );
  const tenantSchemaSql = fs.readFileSync(path.join(__dirname, "..", "sql", "supabase_schema.sql"), "utf8");

  for (const { schema_name: schema } of schemaListResult.rows) {
    const tables = await getTablesInSchema(primary, schema);
    if (tables.length === 0) {
      console.log(`\n== ${schema} == (no tables, skipping)`);
      continue;
    }
    console.log(`\n== ${schema} ==`);
    await backup.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
    await backup.query(`SET search_path TO ${quoteIdent(schema)}, public`);
    await backup.query(tenantSchemaSql);
    await backup.query("SET search_path TO public");
    await copySchemaTables(primary, backup, schema, tables);
  }

  console.log("\nDone. The backup database now mirrors the primary database's current data.");
  console.log("You can now enable dual-write by keeping DATABASE_URL_BACKUP set and restarting the server.");

  await primary.end();
  await backup.end();
}

main().catch((err) => {
  console.error("\nCopy failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
