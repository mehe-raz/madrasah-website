// ============================================================================
// tenantProvision.js  (Part 2 / 6 — Schema Provisioning System)
// ============================================================================
// Turns a `registry.institutions` row into an actual, usable tenant: creates
// its dedicated Postgres schema, runs the same table definitions every
// single-tenant deployment already uses (sql/supabase_schema.sql), and seeds
// it with one working Super Admin login + default settings so the
// institution can log in immediately.
//
// This module is the only place that creates tenant schemas. It does not
// change how the *existing* single-tenant app connects to the database
// (db.js/pg.js are untouched, still always talk to the `public` schema) —
// that switch-over is Part 3 (Tenant Resolution Middleware). Until then,
// this only affects schemas it creates itself (tenant_xxx), so today's
// single-tenant app keeps working exactly as before.
// ============================================================================

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const pg = require("./pg");
const registryDb = require("./registryDb");
const { DEFAULT_CATEGORIES } = require("./lib/incomeCategories");
const {
  SETTINGS_KEY: CLASS_TREE_SETTINGS_KEY,
  DEFAULT_CLASS_TREE,
  DEFAULT_CLASS_TREE_GENERAL,
} = require("./lib/classTree");

const tenantSchemaPath = path.join(__dirname, "..", "sql", "supabase_schema.sql");

// Same cost factor as routes/auth.js — kept as its own constant here (rather
// than importing from auth.js) because auth.js is a protected path per
// AGENTS.md and shouldn't gain new exports for this.
const SALT_ROUNDS = 12;

// registryDb.codeToSchemaName() already guarantees this shape for any schema
// name it hands out, but this module accepts a schema name as its own
// argument (so it can be called independently of that function later, e.g.
// from a future retry/repair tool), so it re-checks rather than trusting the
// caller. This name gets interpolated directly into DDL (CREATE SCHEMA,
// SET search_path) where parameter placeholders aren't allowed, so this
// check is the only thing standing between a bad value and a broken query —
// it must run before any interpolation happens.
function assertValidSchemaName(schemaName) {
  if (!schemaName || !/^tenant_[a-z0-9_]{1,40}$/.test(schemaName)) {
    const err = new Error(`Refusing to provision invalid schema name: "${schemaName}"`);
    err.status = 400;
    throw err;
  }
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

// Creates the schema + all 17 tenant tables + one Super Admin user + default
// settings, all inside a single transaction on one dedicated connection.
// Table DDL is transactional in Postgres, so if anything fails partway
// (including the admin-user insert), the whole schema creation rolls back
// cleanly instead of leaving a half-built schema behind.
async function provisionTenantSchema(schemaName, { adminName, adminEmail, adminPassword, institutionType = "madrasah" }) {
  assertValidSchemaName(schemaName);

  if (!adminEmail || !adminEmail.trim()) {
    const err = new Error("Admin email is required to provision an institution");
    err.status = 400;
    throw err;
  }
  if (!adminPassword || adminPassword.length < 8) {
    const err = new Error("Admin password must be at least 8 characters");
    err.status = 400;
    throw err;
  }

  const hash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
  const tableSql = fs.readFileSync(tenantSchemaPath, "utf8");

  const client = await pg.pool.connect();
  try {
    await client.query("BEGIN");

    // CREATE SCHEMA and SET search_path each sent as their own plain string
    // (no params) — same reasoning as db.js's initSchema(): a params array
    // (even an empty default one) forces node-postgres onto the extended
    // protocol, which rejects the multi-statement batch in tableSql below.
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schemaName)}`);
    await client.query(`SET search_path TO ${quoteIdent(schemaName)}, public`);

    // Same 17-table definition every single-tenant deployment uses — kept
    // as one shared file so tenant schemas and the legacy single-tenant
    // `public` schema can never drift apart.
    await client.query(tableSql);

    await client.query(
      `INSERT INTO users (name, role, email, "passwordHash", "isProtected")
       VALUES ($1, 'Super Admin', $2, $3, 1)`,
      [(adminName || "Super Admin").trim(), adminEmail.trim().toLowerCase(), hash]
    );

    await client.query(
      `INSERT INTO settings (key, value) VALUES ('incomeCategories', $1)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify(DEFAULT_CATEGORIES)]
    );

    // Default class-jamaat hierarchy — see lib/classTree.js. Every fresh
    // institution starts with a full tree instead of an empty list; its own
    // Super Admin can edit it afterward. Which tree depends on
    // institutionType (docs/GENERAL_MODE_PLAN.md, Phase 2): madrasah tenants
    // get the existing হিফজ/নূরানী-নাজেরা/কিতাব/জেনারেল tree unchanged;
    // general tenants (school/college/coaching, per plan §5 open question 1)
    // get DEFAULT_CLASS_TREE_GENERAL instead.
    const classTreeSeed = institutionType === "general" ? DEFAULT_CLASS_TREE_GENERAL : DEFAULT_CLASS_TREE;
    await client.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [CLASS_TREE_SETTINGS_KEY, JSON.stringify(classTreeSeed)]
    );

    // BUSINESS_READINESS_ROADMAP.md Phase 8A: exactly one sms_wallets row
    // per tenant schema, starting at 0 balance — see the comment above that
    // table in supabase_schema.sql for why there's no institutionId column.
    await client.query(`INSERT INTO sms_wallets (balance_taka) VALUES (0)`);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    // Reset search_path before this connection goes back to the pool — pool
    // connections are reused for unrelated queries (including plain
    // `public`-schema ones from the current single-tenant app), so leaving
    // it pointed at a tenant schema would silently leak into those.
    await client.query("SET search_path TO public");
    client.release();
  }
}

// Drops a tenant schema and everything in it. Only ever called from the
// rollback path below (when provisioning itself fails) — never exposed
// through the CLI or any route, since an accidental call would destroy an
// institution's data with no confirmation step. The name check is repeated
// here (not just relied on from the caller) because CASCADE DROP is
// destructive enough to be worth a second guard.
async function dropTenantSchema(schemaName) {
  assertValidSchemaName(schemaName);
  await pg.pool.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schemaName)} CASCADE`);
}

// End-to-end: register the institution (Part 1) + provision its schema +
// seed its first login (this part), as one logical operation. If schema
// provisioning fails after the registry row was already created, the
// registry row is deleted again so the `code` is free for a retry — callers
// don't have to clean up a half-created institution by hand.
async function provisionInstitution({
  name,
  code,
  contactName,
  contactEmail,
  contactPhone,
  plan,
  trialDays,
  adminName,
  adminEmail,
  adminPassword,
  // docs/GENERAL_MODE_PLAN.md, Phase 2 — defaults to 'madrasah', same as
  // registryDb.createInstitution()'s own default, so existing callers that
  // don't pass this (routes/platform.js's manual creation) are unaffected.
  institutionType = "madrasah",
}) {
  const institution = await registryDb.createInstitution({
    name,
    code,
    contactName,
    contactEmail: contactEmail || adminEmail,
    contactPhone,
    plan,
    trialDays,
    institutionType,
  });

  try {
    await provisionTenantSchema(institution.schema_name, { adminName, adminEmail, adminPassword, institutionType });
  } catch (err) {
    await dropTenantSchema(institution.schema_name).catch(() => {});
    await registryDb.registryPool
      .query("DELETE FROM registry.institutions WHERE id = $1", [institution.id])
      .catch(() => {});
    throw err;
  }

  await registryDb.logAction(institution.id, adminEmail, "institution_provisioned", {
    schema: institution.schema_name,
  });

  return institution;
}

module.exports = {
  assertValidSchemaName,
  provisionTenantSchema,
  dropTenantSchema,
  provisionInstitution,
};
