// ============================================================================
// sync-and-switch-back.js — recover from a failover, manually
// ============================================================================
// Run this AFTER a failover has happened (see dbFailover.js) and you've
// confirmed the primary database is healthy again (check the Neon
// dashboard / try connecting). It does the safe, one-directional thing:
//
//   1. Verifies BOTH databases are currently reachable.
//   2. Copies every row from the BACKUP database (which has been the sole
//      source of truth since the failover) into the PRIMARY database,
//      overwriting whatever's in primary for every table this app owns.
//      This direction is intentional and the only safe one: after a
//      failover, backup holds every write made during the outage — primary
//      is the one that's behind, not backup.
//   3. Does NOT touch backup at all — it stays exactly as it is (it keeps
//      being written to, mirrored, and read from until this script
//      finishes and the app process is restarted).
//
// IMPORTANT: this script only re-syncs data. It does NOT flip the running
// server's active pool back to primary by itself — the server process must
// be restarted after this completes (a fresh boot always starts on
// primary — see dbFailover.js's initial activePoolName). Restart your
// server/hosting process (Render/Railway/etc: trigger a redeploy or manual
// restart) once this script reports success.
//
// This is a manual, deliberate step on purpose (never automatic) — see the
// reasoning in docs/DATA_REDUNDANCY.md and dbFailover.js's header comment.
//
// Usage:
//   node scripts/sync-and-switch-back.js
// ============================================================================

require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const readline = require("readline");
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
    await destPool.query(`TRUNCATE TABLE ${quoteIdent(schema)}.${quoteIdent(table)} CASCADE`).catch(() => {});
    const sourceRows = await sourcePool.query(`SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)}`);
    if (sourceRows.rows.length === 0) {
      console.log(`    ${table}: 0 rows`);
      continue;
    }
    const columns = Object.keys(sourceRows.rows[0]);
    const columnList = columns.map(quoteIdent).join(", ");
    for (const row of sourceRows.rows) {
      const values = columns.map((c) => row[c]);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
      await destPool.query(
        `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} (${columnList}) VALUES (${placeholders})`,
        values
      );
    }
    console.log(`    ${table}: ${sourceRows.rows.length} row(s) restored to primary`);
    try {
      await destPool.query(
        `SELECT setval(
           pg_get_serial_sequence('${schema}.${table}', 'id'),
           COALESCE((SELECT MAX(id) FROM ${quoteIdent(schema)}.${quoteIdent(table)}), 1),
           true
         )`
      );
    } catch {
      // no "id" column
    }
  }
}

function askConfirmation(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  const primary = buildPool(process.env.DATABASE_URL, "DATABASE_URL (primary)");
  const backup = buildPool(process.env.DATABASE_URL_BACKUP, "DATABASE_URL_BACKUP");

  console.log("Checking both databases are reachable...");
  await primary.query("SELECT 1");
  console.log("  primary: OK");
  await backup.query("SELECT 1");
  console.log("  backup:  OK\n");

  console.log(
    "This will OVERWRITE all data in the PRIMARY database with the current contents of the BACKUP database."
  );
  console.log("This is only safe if the app has been running on backup since a failover.\n");
  const answer = await askConfirmation('Type "yes" to continue: ');
  if (answer !== "yes") {
    console.log("Aborted. Nothing was changed.");
    await primary.end();
    await backup.end();
    return;
  }

  const registrySql = fs.readFileSync(path.join(__dirname, "..", "sql", "registry_schema.sql"), "utf8");
  await primary.query(registrySql);
  console.log("\n== registry ==");
  const registryTables = await getTablesInSchema(backup, "registry");
  await copySchemaTables(backup, primary, "registry", registryTables);

  const schemaListResult = await backup.query(
    `SELECT schema_name FROM information_schema.schemata
     WHERE schema_name = 'public' OR schema_name LIKE 'tenant\\_%' ESCAPE '\\'
     ORDER BY schema_name`
  );
  const tenantSchemaSql = fs.readFileSync(path.join(__dirname, "..", "sql", "supabase_schema.sql"), "utf8");

  for (const { schema_name: schema } of schemaListResult.rows) {
    const tables = await getTablesInSchema(backup, schema);
    if (tables.length === 0) continue;
    console.log(`\n== ${schema} ==`);
    await primary.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
    await primary.query(`SET search_path TO ${quoteIdent(schema)}, public`);
    await primary.query(tenantSchemaSql);
    await primary.query("SET search_path TO public");
    await copySchemaTables(backup, primary, schema, tables);
  }

  console.log("\nSync complete. Primary now matches backup.");
  console.log("\nNEXT STEP (required): restart the server process now.");
  console.log("A fresh server boot always starts on the primary database — see dbFailover.js.");

  await primary.end();
  await backup.end();
}

main().catch((err) => {
  console.error("\nSync failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
