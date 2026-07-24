// ============================================================================
// migrate-original-to-tenant.js
// ============================================================================
// One-time migration: turns the EXISTING single-tenant `public` schema data
// (your original site, before multi-tenant mode) into a proper, registered
// tenant — so it works exactly like every other institution once
// MULTI_TENANT_MODE=true is left on permanently.
//
// What it does, in ONE database transaction (all-or-nothing — if anything
// fails partway, everything is rolled back automatically and NOTHING is
// changed):
//   1. Registers a new row in registry.institutions (status: active, no
//      trial/expiry) for the given code.
//   2. Creates a fresh tenant_<code> schema with the same 17 tables every
//      tenant uses (sql/supabase_schema.sql).
//   3. Copies every row from public.<table> into tenant_<code>.<table> for
//      all 17 tables (temporarily disables FK/trigger checks during the
//      copy so table order doesn't matter, restores them right after).
//   4. Resets every table's id sequence so new rows created going forward
//      don't collide with the copied ids.
//
// IMPORTANT: the original `public` schema is never modified or deleted —
// it's left exactly as-is, as an untouched backup. Existing users/admins
// keep the exact same email + password (copied as-is), so they can log in
// immediately at ?tenant=<code> once this finishes.
//
// Usage:
//   node scripts/migrate-original-to-tenant.js <code> "<Institution Name>"
//
// Example:
//   node scripts/migrate-original-to-tenant.js tajdidul-iman "Jamia Tajdidul Iman Madrasah"
// ============================================================================

require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const pg = require("../src/pg");
const registryDb = require("../src/registryDb");

// Order matters here: managed Postgres providers like Neon don't allow
// disabling foreign-key checks (no superuser), so tables with no foreign
// keys are copied first, then tables that reference them, so every FK
// target already exists by the time its dependent rows are inserted.
const TABLES = [
  // no foreign keys
  "students",
  "users",
  "settings",
  "expenses",
  "delete_requests",
  "receipt_counters",
  "audit_logs",
  "backup_restore_events",
  "admissions",
  // references students
  "attendance",
  "payments",
  "income",
  "hifz_logs",
  "results",
  // references users
  "password_resets",
  "notifications",
  // references notifications + users
  "notification_reads",
];

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

async function main() {
  const [, , code, ...nameParts] = process.argv;
  if (!code) {
    console.error(
      'Usage: node scripts/migrate-original-to-tenant.js <code> "<Institution Name>"'
    );
    process.exit(1);
  }
  const name = nameParts.join(" ").trim();
  if (!name) {
    console.error("An institution name is required as the second argument.");
    process.exit(1);
  }

  registryDb.assertValidCode(code);
  const schemaName = registryDb.codeToSchemaName(code);

  const existing = await registryDb.getInstitutionByCode(code);
  if (existing) {
    console.error(
      `Code "${code}" is already registered (schema ${existing.schema_name}). Aborting — nothing was changed.`
    );
    process.exit(1);
  }

  console.log(`Migrating public schema -> ${schemaName} (code: ${code})...`);

  const client = await pg.pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Register the institution as already active (no trial countdown —
    // this is your existing, already-running institution, not a new signup).
    await client.query(
      `INSERT INTO registry.institutions (name, code, schema_name, status, plan)
       VALUES ($1, $2, $3, 'active', 'basic')`,
      [name, code, schemaName]
    );

    // 2. Create the schema + the same 17 tables every tenant uses.
    const tableSql = fs.readFileSync(
      path.join(__dirname, "..", "sql", "supabase_schema.sql"),
      "utf8"
    );
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schemaName)}`);
    await client.query(`SET search_path TO ${quoteIdent(schemaName)}, public`);
    await client.query(tableSql);

    // 3. Copy every row from the legacy public schema into the new tenant
    // schema, in the dependency order defined by TABLES above (parents
    // before the tables that reference them), so every foreign-key target
    // already exists by the time its dependent rows are copied.
    for (const table of TABLES) {
      const result = await client.query(
        `INSERT INTO ${quoteIdent(schemaName)}.${quoteIdent(table)}
         SELECT * FROM public.${quoteIdent(table)}`
      );
      console.log(`  ${table}: ${result.rowCount} row(s) copied`);
    }

    // 4. Point every table's identity sequence past the copied ids, so the
    // next INSERT in the new schema doesn't collide with a copied row.
    // Tables with no "id" column (settings, receipt_counters,
    // notification_reads) have nothing to reset — errors there are expected
    // and safely ignored.
    for (const table of TABLES) {
      try {
        await client.query(
          `SELECT setval(
             pg_get_serial_sequence('${schemaName}.${table}', 'id'),
             COALESCE((SELECT MAX(id) FROM ${quoteIdent(schemaName)}.${quoteIdent(table)}), 1),
             true
           )`
        );
      } catch {
        // no "id" column on this table — nothing to reset.
      }
    }

    await client.query("COMMIT");
    console.log(`\nDone. "${name}" is now a registered tenant.`);
    console.log(`  code:   ${code}`);
    console.log(`  schema: ${schemaName}`);
    console.log(`  status: active (no trial/expiry)`);
    console.log(`\nThe original public schema was NOT changed — it's kept as-is, as a backup.`);
    console.log(`Existing users can log in with their same email/password at ?tenant=${code}.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\nMigration failed — rolled back, nothing was changed.");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await client.query("SET search_path TO public").catch(() => {});
    client.release();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
