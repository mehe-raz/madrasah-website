/**
 * One-time migration: seeds the default হিফজ/নূরানী-নাজেরা/কিতাব/জেনারেল
 * class-jamaat tree (lib/classTree.js's DEFAULT_CLASS_TREE) into any schema
 * that is missing it.
 *
 * Why this is needed: db.js only seeds `classOptionsTree` when the
 * `students` table is empty at first boot, and tenantProvision.js only
 * seeds it when a brand-new tenant schema is created. A site that already
 * had student/class data before the class-tree feature existed never got
 * either of those, so its `settings` table has no `classOptionsTree` row —
 * getClassTree() then returns [], and every classTreeLabel() call falls
 * back to showing the raw `en` slug (dorse-miyan, general-play, etc.)
 * instead of its বাংলা label, everywhere in admin + guardian screens.
 *
 * Safe to re-run: uses ON CONFLICT (key) DO NOTHING, so it only ever fills
 * in a missing row — it will never overwrite a tree someone has already
 * customized via Settings.
 *
 * Runs against:
 *   - the `public` schema (single-tenant / this project's own deployment)
 *   - every `tenant_xxx` schema in the registry, if this deployment uses
 *     the multi-tenant platform (registry.institutions) — skipped
 *     automatically if that table doesn't exist.
 *
 * Usage:
 *   cd server
 *   node scripts/seed-class-tree.js
 *
 * Requires DATABASE_URL (loaded automatically from server/.env if present).
 */
require("dotenv").config();
const pg = require("../src/pg");
const { SETTINGS_KEY, DEFAULT_CLASS_TREE } = require("../src/lib/classTree");

const TREE_JSON = JSON.stringify(DEFAULT_CLASS_TREE);
const SAFE_SCHEMA_NAME = /^tenant_[a-z0-9_]{1,40}$/;

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

async function seedSchema(client, schemaLabel) {
  const before = await client.query(
    "SELECT 1 FROM settings WHERE key = $1",
    [SETTINGS_KEY]
  );
  const result = await client.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO NOTHING`,
    [SETTINGS_KEY, TREE_JSON]
  );
  const inserted = result.rowCount > 0;
  if (inserted) {
    console.log(`  ✔ ${schemaLabel}: classOptionsTree seeded (${DEFAULT_CLASS_TREE.length} departments)`);
  } else if (before.rowCount > 0) {
    console.log(`  – ${schemaLabel}: already has a classOptionsTree, left untouched`);
  } else {
    console.log(`  ? ${schemaLabel}: insert reported 0 rows but no existing row found — check manually`);
  }
  return inserted;
}

async function main() {
  const client = await pg.pool.connect();
  let seededCount = 0;
  try {
    // 1) public schema (single-tenant deployment, or the platform's own schema)
    await client.query("SET search_path TO public");
    const hasSettingsTable = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'settings'`
    );
    if (hasSettingsTable.rowCount > 0) {
      if (await seedSchema(client, "public")) seededCount++;
    } else {
      console.log("  – public: no `settings` table found, skipping");
    }

    // 2) every tenant_xxx schema, if the multi-tenant registry exists
    const hasRegistry = await client.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'registry'`
    );
    if (hasRegistry.rowCount > 0) {
      const institutions = await client.query(
        `SELECT schema_name FROM registry.institutions`
      );
      for (const row of institutions.rows) {
        const schemaName = row.schema_name;
        if (!SAFE_SCHEMA_NAME.test(schemaName)) {
          console.log(`  ! skipping invalid schema name: ${schemaName}`);
          continue;
        }
        await client.query("BEGIN");
        try {
          await client.query(`SET search_path TO ${quoteIdent(schemaName)}, public`);
          if (await seedSchema(client, schemaName)) seededCount++;
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          console.error(`  ✘ ${schemaName}: ${err.message}`);
        } finally {
          await client.query("SET search_path TO public").catch(() => {});
        }
      }
    } else {
      console.log("  – no `registry` schema found, this is a single-tenant deployment");
    }

    console.log(`\nDone. Seeded classOptionsTree in ${seededCount} schema(s).`);
  } finally {
    client.release();
    await pg.pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
