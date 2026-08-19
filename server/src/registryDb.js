// ============================================================================
// registryDb.js  (Part 1 / 6 — Central Registry Database)
// ============================================================================
// Talks ONLY to the `registry` schema (see sql/registry_schema.sql). It never
// touches tenant tables (students, payments, users, ...) — that separation is
// the whole point: this module is the "control plane", tenant data is the
// "data plane" and is handled by db.js/pg.js (unchanged in this part).
//
// Uses the same DATABASE_URL / connection pool as the rest of the app by
// default (registry.* tables live in the same physical database, just a
// different schema namespace), unless REGISTRY_DATABASE_URL is explicitly
// set to point somewhere else.
// ============================================================================

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const pg = require("./pg");

const schemaPath = path.join(__dirname, "..", "sql", "registry_schema.sql");

const STATUSES = ["trial", "active", "suspended", "cancelled"];

// docs/GENERAL_MODE_PLAN.md, Phase 2 — same two values as the
// institutions_institution_type_check constraint in registry_schema.sql
// (Phase 1). Kept here too so createInstitution() can validate before the
// INSERT round-trip, same pattern as assertValidCode() below.
const INSTITUTION_TYPES = ["madrasah", "general"];

// Reuse the main pool unless a dedicated registry DB is configured. Keeping
// this as its own pool reference (even when it points at the same place)
// means we can move the registry to a different physical database later
// (e.g. for extra isolation) by just setting REGISTRY_DATABASE_URL, with no
// other code changes.
function buildRegistryPool() {
  if (!process.env.REGISTRY_DATABASE_URL) return pg.pool;
  return new Pool({
    connectionString: process.env.REGISTRY_DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
}

const registryPool = buildRegistryPool();

async function initRegistrySchema() {
  const sql = fs.readFileSync(schemaPath, "utf8");
  // Same reasoning as db.js's initSchema(): plain-string query so multiple
  // semicolon-separated statements can run in a single round trip.
  await registryPool.query(sql);
}

function assertValidCode(code) {
  if (!code || typeof code !== "string" || !/^[a-z][a-z0-9-]{1,30}$/.test(code)) {
    const err = new Error(
      "Institution code must be 2-31 lowercase letters/digits/hyphens, starting with a letter"
    );
    err.status = 400;
    throw err;
  }
}

// Same shape a browser/DNS would accept: dot-separated labels of
// letters/digits/hyphens (no leading/trailing hyphen per label), at least
// one dot (so a bare "localhost"-style single label can't be claimed), and
// no protocol/path (that's a config mistake, not a domain).
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

function assertValidDomain(domain) {
  if (!domain || typeof domain !== "string" || !DOMAIN_RE.test(domain.toLowerCase())) {
    const err = new Error(
      "Domain must look like a real hostname (e.g. school.example.com), no https:// or path"
    );
    err.status = 400;
    throw err;
  }
}

function codeToSchemaName(code) {
  // Postgres identifiers can't contain hyphens, so the schema name swaps
  // them for underscores and gets a fixed "tenant_" prefix. This also keeps
  // tenant schema names visually distinct from "registry" and "public".
  return `tenant_${code.replace(/-/g, "_")}`;
}

async function listInstitutions({ status } = {}) {
  if (status) {
    const result = await registryPool.query(
      "SELECT * FROM registry.institutions WHERE status = $1 ORDER BY created_at DESC",
      [status]
    );
    return result.rows;
  }
  const result = await registryPool.query("SELECT * FROM registry.institutions ORDER BY created_at DESC");
  return result.rows;
}

async function getInstitutionByCode(code) {
  const result = await registryPool.query(
    "SELECT * FROM registry.institutions WHERE lower(code) = lower($1)",
    [code]
  );
  return result.rows[0];
}

async function getInstitutionByDomain(domain) {
  if (!domain) return null;
  const result = await registryPool.query(
    "SELECT * FROM registry.institutions WHERE lower(custom_domain) = lower($1)",
    [domain]
  );
  return result.rows[0];
}

async function getInstitutionById(id) {
  const result = await registryPool.query("SELECT * FROM registry.institutions WHERE id = $1", [id]);
  return result.rows[0];
}

async function createInstitution({
  name,
  code,
  contactName,
  contactEmail,
  contactPhone,
  plan = "basic",
  trialDays = 14,
  // docs/GENERAL_MODE_PLAN.md, Phase 2 — defaults to 'madrasah' so every
  // existing caller (routes/platform.js's manual institution creation, any
  // script) that doesn't pass this keeps today's behavior unchanged, same
  // as the column's own DB-level default from Phase 1.
  institutionType = "madrasah",
}) {
  if (!name || !name.trim()) {
    const err = new Error("Institution name is required");
    err.status = 400;
    throw err;
  }
  assertValidCode(code);
  if (!INSTITUTION_TYPES.includes(institutionType)) {
    const err = new Error(`Institution type must be one of: ${INSTITUTION_TYPES.join(", ")}`);
    err.status = 400;
    throw err;
  }

  const existing = await getInstitutionByCode(code);
  if (existing) {
    const err = new Error(`Institution code "${code}" is already in use`);
    err.status = 409;
    throw err;
  }

  const schemaName = codeToSchemaName(code);
  const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

  const result = await registryPool.query(
    `INSERT INTO registry.institutions
       (name, code, schema_name, status, plan, contact_name, contact_email, contact_phone, trial_ends_at, institution_type)
     VALUES ($1, $2, $3, 'trial', $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      name.trim(),
      code,
      schemaName,
      plan,
      contactName || null,
      contactEmail || null,
      contactPhone || null,
      trialEndsAt,
      institutionType,
    ]
  );
  return result.rows[0];
}

// Schema names are only ever produced by codeToSchemaName() above ("tenant_"
// + lowercase letters/digits/underscores), but this is double-checked here
// against that exact shape before being interpolated into DROP SCHEMA below
// (identifiers can't be bind parameters) — same belt-and-braces pattern
// tenantResolve.js uses before interpolating a schema name into SQL.
const SAFE_SCHEMA_NAME = /^[a-z][a-z0-9_]*$/;

// Permanently removes an institution: drops its entire tenant_xxx schema
// (all students/payments/users/etc data) and deletes its registry row.
// Wrapped in a transaction so a failure partway through can't leave the
// institution half-deleted (e.g. schema gone but registry row still there,
// or vice versa) — Postgres DDL participates in transactions like any other
// statement, so DROP SCHEMA rolls back too if the DELETE that follows fails.
// This is irreversible; the platform.js route requires the caller to
// confirm by re-typing the institution's code before calling this.
async function deleteInstitution(id) {
  const institution = await getInstitutionById(id);
  if (!institution) return null;

  if (!SAFE_SCHEMA_NAME.test(institution.schema_name || "")) {
    const err = new Error(`Refusing to delete institution ${id}: invalid schema name`);
    err.status = 500;
    throw err;
  }

  const client = await registryPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DROP SCHEMA IF EXISTS "${institution.schema_name}" CASCADE`);
    await client.query("DELETE FROM registry.institutions WHERE id = $1", [id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return institution;
}

async function updateStatus(id, status) {
  if (!STATUSES.includes(status)) {
    const err = new Error(`Status must be one of: ${STATUSES.join(", ")}`);
    err.status = 400;
    throw err;
  }
  const result = await registryPool.query(
    `UPDATE registry.institutions SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return result.rows[0];
}

// billingModel/priceAmount: Phase 6 billing scaffolding (see
// registry_schema.sql). Same COALESCE-if-not-provided pattern as
// plan/subscriptionEndsAt above — pass undefined/null/"" to leave the
// existing value untouched, pass a real value to set it.
async function updateSubscription(id, { plan, subscriptionEndsAt, billingModel, priceAmount }) {
  const result = await registryPool.query(
    `UPDATE registry.institutions
     SET plan = COALESCE($1, plan),
         subscription_ends_at = COALESCE($2, subscription_ends_at),
         billing_model = COALESCE($3, billing_model),
         price_amount = COALESCE($4, price_amount),
         updated_at = now()
     WHERE id = $5
     RETURNING *`,
    [plan || null, subscriptionEndsAt || null, billingModel || null, priceAmount ?? null, id]
  );
  return result.rows[0];
}

// The institution's name/contact info is stored twice: once here in
// registry.institutions (read by the Super Admin panel), and again per-tenant
// in that tenant's own `settings` table (read by the public site + admin
// Settings page). Nothing kept them in sync — a tenant renaming itself from
// Settings would leave the Super Admin panel showing the old name forever.
// This is called (best-effort) from routes/settings.js whenever a tenant
// saves one of these fields, so registry.institutions stays the mirror of
// whatever the tenant itself considers current. It intentionally only
// pushes tenant -> registry, never the other direction, so there's still a
// single clear source of truth for "what does the tenant currently say
// their name/contact info is" (their own Settings page).
async function updateInstitutionContact(id, { name, contactEmail, contactPhone }) {
  const result = await registryPool.query(
    `UPDATE registry.institutions
     SET name = COALESCE($1, name),
         contact_email = COALESCE($2, contact_email),
         contact_phone = COALESCE($3, contact_phone),
         updated_at = now()
     WHERE id = $4
     RETURNING *`,
    [name || null, contactEmail || null, contactPhone || null, id]
  );
  return result.rows[0];
}

// Sets or clears (pass null/"") an institution's custom domain. Checked
// against DOMAIN_RE and against the unique index (via the DB error below)
// so two institutions can never claim the same domain.
async function updateCustomDomain(id, customDomain) {
  const normalized = customDomain ? customDomain.trim().toLowerCase() : null;
  if (normalized) assertValidDomain(normalized);

  try {
    const result = await registryPool.query(
      `UPDATE registry.institutions SET custom_domain = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [normalized, id]
    );
    return result.rows[0];
  } catch (err) {
    // unique_violation on institutions_custom_domain_unique
    if (err.code === "23505") {
      const dupErr = new Error(`Domain "${normalized}" is already used by another institution`);
      dupErr.status = 409;
      throw dupErr;
    }
    throw err;
  }
}

async function logAction(institutionId, actorEmail, action, detail = {}) {
  await registryPool.query(
    `INSERT INTO registry.audit_logs (institution_id, actor_email, action, detail) VALUES ($1, $2, $3, $4)`,
    [institutionId || null, actorEmail || null, action, JSON.stringify(detail)]
  );
}

// Is this institution currently allowed to log in / use the app? Trial and
// active are OK (trial still works until trial_ends_at passes); suspended
// and cancelled are always blocked. Expired trial with no subscription is
// also blocked. This function has no side effects — it doesn't auto-flip
// status in the DB, so the platform admin always has the final say; a
// background job (Part 6) can use this same check to auto-suspend on a
// schedule if desired.
function isAccessAllowed(institution) {
  if (!institution) return false;
  if (institution.status === "suspended" || institution.status === "cancelled") return false;
  if (institution.status === "active") {
    if (institution.subscription_ends_at && new Date(institution.subscription_ends_at) < new Date()) {
      return false;
    }
    return true;
  }
  if (institution.status === "trial") {
    if (institution.trial_ends_at && new Date(institution.trial_ends_at) < new Date()) {
      return false;
    }
    return true;
  }
  return false;
}

// ============================================================================
// Platform admins (Part 5 / 6 — Super-Admin panel)
// ============================================================================
// registry.platform_admins holds the platform operator logins (you/your
// team) — completely separate from any institution's own users table.
// Same bcrypt cost factor used everywhere else in this app (routes/auth.js,
// tenantProvision.js) for consistency.
const PLATFORM_SALT_ROUNDS = 12;
const PLATFORM_ROLES = ["super_admin", "admin", "manager"];

function assertValidPlatformRole(role) {
  if (!PLATFORM_ROLES.includes(role)) {
    const err = new Error(`Role must be one of: ${PLATFORM_ROLES.join(", ")}`);
    err.status = 400;
    throw err;
  }
}

async function getPlatformAdminByEmail(email) {
  const result = await registryPool.query(
    "SELECT * FROM registry.platform_admins WHERE lower(email) = lower($1)",
    [email]
  );
  return result.rows[0];
}

async function createPlatformAdmin({ name, email, password, role = "admin" }) {
  if (!name || !name.trim()) {
    const err = new Error("Name is required");
    err.status = 400;
    throw err;
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    const err = new Error("A valid email is required");
    err.status = 400;
    throw err;
  }
  if (!password || password.length < 8) {
    const err = new Error("Password must be at least 8 characters");
    err.status = 400;
    throw err;
  }
  assertValidPlatformRole(role);
  const hash = await bcrypt.hash(password, PLATFORM_SALT_ROUNDS);
  try {
    const result = await registryPool.query(
      `INSERT INTO registry.platform_admins (name, email, "passwordHash", role)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at`,
      [name.trim(), email.trim().toLowerCase(), hash, role]
    );
    return result.rows[0];
  } catch (err) {
    if (pg.isUniqueViolation(err)) {
      const dup = new Error(`Platform admin "${email}" already exists`);
      dup.status = 409;
      throw dup;
    }
    throw err;
  }
}

// Every platform admin except the passwordHash, for the management list in
// the Super-Admin panel.
async function listPlatformAdmins() {
  const result = await registryPool.query(
    `SELECT id, name, email, role, created_at FROM registry.platform_admins ORDER BY created_at ASC`
  );
  return result.rows;
}

async function countSuperAdmins() {
  const result = await registryPool.query(
    `SELECT count(*)::int AS count FROM registry.platform_admins WHERE role = 'super_admin'`
  );
  return result.rows[0].count;
}

// Updates a platform admin's name/role. Guards against locking everyone out
// of admin-management by demoting the last remaining super_admin.
async function updatePlatformAdmin(id, { name, role }) {
  if (role) assertValidPlatformRole(role);
  if (role && role !== "super_admin") {
    const current = await registryPool.query(
      "SELECT role FROM registry.platform_admins WHERE id = $1",
      [id]
    );
    const row = current.rows[0];
    if (!row) return null;
    if (row.role === "super_admin") {
      const remaining = await countSuperAdmins();
      if (remaining <= 1) {
        const err = new Error("অন্তত একজন Super Admin থাকা আবশ্যক — শেষজনের রোল পরিবর্তন করা যাবে না");
        err.status = 400;
        throw err;
      }
    }
  }
  const result = await registryPool.query(
    `UPDATE registry.platform_admins
     SET name = COALESCE($1, name),
         role = COALESCE($2, role)
     WHERE id = $3
     RETURNING id, name, email, role, created_at`,
    [name ? name.trim() : null, role || null, id]
  );
  return result.rows[0];
}

// Permanently removes a platform admin login. Refuses to delete the last
// remaining super_admin so the panel can never end up with nobody able to
// manage admins.
async function deletePlatformAdmin(id) {
  const current = await registryPool.query(
    "SELECT role FROM registry.platform_admins WHERE id = $1",
    [id]
  );
  const row = current.rows[0];
  if (!row) return null;
  if (row.role === "super_admin") {
    const remaining = await countSuperAdmins();
    if (remaining <= 1) {
      const err = new Error("অন্তত একজন Super Admin থাকা আবশ্যক — শেষজনকে মুছে ফেলা যাবে না");
      err.status = 400;
      throw err;
    }
  }
  const result = await registryPool.query(
    "DELETE FROM registry.platform_admins WHERE id = $1 RETURNING id",
    [id]
  );
  return result.rows[0];
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Real LIMIT/OFFSET pagination plus an optional created_at date-range filter
// (previously this just capped at `limit` rows with no page/offset or date
// filter — fine while there were only a handful of institutions, but it
// silently hid everything past the cap once audit history grew). Mirrors the
// tenant-side pattern in routes/auditLogs.js.
async function listAuditLogs({ institutionId, page = 1, limit = 100, from, to } = {}) {
  const clampedLimit = clampInt(limit, 100, 1, 200);
  const clampedPage = clampInt(page, 1, 1, 100000);
  const offset = (clampedPage - 1) * clampedLimit;

  const conditions = [];
  const params = [];
  if (institutionId) {
    params.push(institutionId);
    conditions.push(`al.institution_id = $${params.length}`);
  }
  if (from) {
    params.push(`${from} 00:00:00`);
    conditions.push(`al.created_at >= $${params.length}`);
  }
  if (to) {
    params.push(`${to} 23:59:59`);
    conditions.push(`al.created_at <= $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRow = await registryPool.query(
    `SELECT COUNT(*)::int AS total FROM registry.audit_logs al ${where}`,
    params
  );
  const total = totalRow.rows[0]?.total || 0;

  const result = await registryPool.query(
    `SELECT al.*, i.name AS institution_name, i.code AS institution_code
     FROM registry.audit_logs al
     LEFT JOIN registry.institutions i ON i.id = al.institution_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, clampedLimit, offset]
  );

  return {
    items: result.rows,
    page: clampedPage,
    limit: clampedLimit,
    total,
    totalPages: Math.max(1, Math.ceil(total / clampedLimit)),
  };
}

// ============================================================================
// Billing (Part 6 / 6 — Billing + Migration Tooling)
// ============================================================================
// See the comment above `registry.payments` in sql/registry_schema.sql for
// why this is a manually-confirmed ledger rather than a live payment-gateway
// integration.

// Records one payment and, in the same transaction, extends the
// institution's subscription: if it still has time left on its current
// subscription_ends_at (or trial_ends_at, for a first-ever payment), the new
// period is added ON TOP of that remaining time rather than from "now" —
// paying early never costs the institution days. Also flips status to
// 'active' (a suspended/trial institution that pays should regain access
// immediately, without a separate manual status-change step).
async function recordPayment(institutionId, {
  amount,
  currency = "BDT",
  method = "manual",
  reference,
  periodDays = 30,
  recordedBy,
  note,
}) {
  if (!(Number(amount) > 0)) {
    const err = new Error("Payment amount must be a positive number");
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(periodDays) || periodDays <= 0) {
    const err = new Error("periodDays must be a positive integer");
    err.status = 400;
    throw err;
  }

  const client = await registryPool.connect();
  try {
    await client.query("BEGIN");

    const instRes = await client.query(
      "SELECT * FROM registry.institutions WHERE id = $1 FOR UPDATE",
      [institutionId]
    );
    const institution = instRes.rows[0];
    if (!institution) {
      const err = new Error("Institution not found");
      err.status = 404;
      throw err;
    }

    const now = new Date();
    const currentEnd = [institution.subscription_ends_at, institution.trial_ends_at]
      .map((d) => (d ? new Date(d) : null))
      .filter((d) => d && d > now)
      .sort((a, b) => b - a)[0]; // latest of the two, if still in the future
    const base = currentEnd || now;
    const coversUntil = new Date(base.getTime() + periodDays * 24 * 60 * 60 * 1000);

    const paymentRes = await client.query(
      `INSERT INTO registry.payments
         (institution_id, amount, currency, method, reference, period_days, covers_until, recorded_by, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [institutionId, amount, currency, method, reference || null, periodDays, coversUntil, recordedBy || null, note || null]
    );

    await client.query(
      `UPDATE registry.institutions
       SET status = 'active', subscription_ends_at = $1, updated_at = now()
       WHERE id = $2`,
      [coversUntil, institutionId]
    );

    await client.query("COMMIT");
    return paymentRes.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Same real page/offset + date-range pagination as listAuditLogs above,
// instead of a bare `limit`-capped, unfiltered query.
async function listPayments({ institutionId, page = 1, limit = 100, from, to } = {}) {
  const clampedLimit = clampInt(limit, 100, 1, 200);
  const clampedPage = clampInt(page, 1, 1, 100000);
  const offset = (clampedPage - 1) * clampedLimit;

  const conditions = [];
  const params = [];
  if (institutionId) {
    params.push(institutionId);
    conditions.push(`p.institution_id = $${params.length}`);
  }
  if (from) {
    params.push(`${from} 00:00:00`);
    conditions.push(`p.created_at >= $${params.length}`);
  }
  if (to) {
    params.push(`${to} 23:59:59`);
    conditions.push(`p.created_at <= $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRow = await registryPool.query(
    `SELECT COUNT(*)::int AS total FROM registry.payments p ${where}`,
    params
  );
  const total = totalRow.rows[0]?.total || 0;

  const result = await registryPool.query(
    `SELECT p.*, i.name AS institution_name, i.code AS institution_code
     FROM registry.payments p
     LEFT JOIN registry.institutions i ON i.id = p.institution_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, clampedLimit, offset]
  );

  return {
    items: result.rows,
    page: clampedPage,
    limit: clampedLimit,
    total,
    totalPages: Math.max(1, Math.ceil(total / clampedLimit)),
  };
}

// Auto-suspend sweep: finds every 'trial' or 'active' institution whose
// relevant expiry date has already passed (same rule isAccessAllowed()
// already reads) and flips its status to 'suspended', logging one audit
// entry per institution with actor 'system:expiry-scan' so it's clearly
// distinguishable from a manual suspension in the audit log. This is the
// only place in the whole codebase that changes an institution's status
// without a human clicking something — it exists because isAccessAllowed()
// is read-only by design (see its comment), so nothing previously enforced
// expiry automatically. Safe to call repeatedly (e.g. from a scheduled job
// or an operator-triggered manual scan) — institutions already suspended
// are simply not matched again.
// ============================================================================
// Platform settings (generic key/value config, see sql/registry_schema.sql).
// Currently only DEFAULT_TRIAL_DAYS is used (by the public self-signup
// route, once that exists), but getPlatformSetting/setPlatformSetting are
// generic on purpose so a future setting doesn't need a new pair of
// functions or a new migration.
// ============================================================================

const DEFAULT_TRIAL_DAYS_KEY = "default_trial_days";
const DEFAULT_TRIAL_DAYS_FALLBACK = 14;

async function getPlatformSetting(key, fallback = null) {
  const result = await registryPool.query(
    "SELECT value FROM registry.platform_settings WHERE key = $1",
    [key]
  );
  return result.rows[0] ? result.rows[0].value : fallback;
}

async function setPlatformSetting(key, value) {
  const result = await registryPool.query(
    `INSERT INTO registry.platform_settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()
     RETURNING *`,
    [key, String(value)]
  );
  return result.rows[0];
}

async function getDefaultTrialDays() {
  const raw = await getPlatformSetting(DEFAULT_TRIAL_DAYS_KEY, String(DEFAULT_TRIAL_DAYS_FALLBACK));
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TRIAL_DAYS_FALLBACK;
}

async function setDefaultTrialDays(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n < 1 || n > 365) {
    const err = new Error("Default trial days must be a number between 1 and 365");
    err.status = 400;
    throw err;
  }
  await setPlatformSetting(DEFAULT_TRIAL_DAYS_KEY, Math.floor(n));
  return Math.floor(n);
}

async function runExpiryScan() {
  const result = await registryPool.query(
    `SELECT * FROM registry.institutions
     WHERE (status = 'active' AND subscription_ends_at IS NOT NULL AND subscription_ends_at < now())
        OR (status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at < now())`
  );
  const suspended = [];
  for (const institution of result.rows) {
    await registryPool.query(
      `UPDATE registry.institutions SET status = 'suspended', updated_at = now() WHERE id = $1`,
      [institution.id]
    );
    await logAction(institution.id, "system:expiry-scan", "auto_suspended", {
      previousStatus: institution.status,
      subscription_ends_at: institution.subscription_ends_at,
      trial_ends_at: institution.trial_ends_at,
    });
    suspended.push({ id: institution.id, name: institution.name, code: institution.code });
  }
  return suspended;
}

// ============================================================================
// Global device registry (ad-hoc —
// docs/ATTENDANCE_DEVICE_CENTRALIZED_INGESTION_PLAN.md, Phase 1)
// ============================================================================
// See the table comment above registry.device_registry in
// registry_schema.sql for why this exists. Only ever called from
// routes/attendanceDevices.js, and only when a tenant institution is
// actually in context (single-tenant deployments have no institution to
// register against, and never need cross-tenant deviceId uniqueness).

// Inserts the lookup row for a newly-created device. Throws a 409-status
// Error (same shape as createInstitution's duplicate-code check) if the
// deviceId is already registered to ANY institution — this is the
// authoritative global-uniqueness check; the caller is expected to roll
// back its own tenant-side insert on this error, since deviceId is only
// unique per-schema there.
async function registerDevice({ deviceId, institutionId, schemaName, secretOrCommKey, protocol }) {
  try {
    const result = await registryPool.query(
      `INSERT INTO registry.device_registry
         (device_id, institution_id, schema_name, secret_or_comm_key, protocol)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [deviceId, institutionId, schemaName, secretOrCommKey, protocol || "push_adms"]
    );
    return result.rows[0];
  } catch (err) {
    if (pg.isUniqueViolation(err)) {
      const dup = new Error(`ডিভাইস আইডি "${deviceId}" ইতিমধ্যে অন্য একটি প্রতিষ্ঠানে ব্যবহৃত হচ্ছে`);
      dup.status = 409;
      throw dup;
    }
    throw err;
  }
}

// Called from PUT /:id (active toggle) and POST /:id/regenerate-secret so
// the lookup row never drifts from the tenant-side attendance_devices row
// that owns it. Both are no-ops (0 rows affected) if this device was never
// registered globally (e.g. created before Phase 1, or in a single-tenant
// deployment) — deliberately silent, matching the "best effort sync,
// tenant-side stays the source of truth" note above.
// Looks up which institution/schema owns a deviceId — the core lookup for
// Phase 2's bridge-free ADMS ingestion endpoint (routes/deviceIngest.js),
// which receives only a raw deviceId with no Host/subdomain to resolve the
// tenant from otherwise. Returns undefined if the deviceId was never
// registered (e.g. a tenant-only device created before Phase 1, or in a
// single-tenant deployment) or is unknown.
async function getDeviceRegistryEntry(deviceId) {
  const result = await registryPool.query(
    `SELECT * FROM registry.device_registry WHERE device_id = $1`,
    [deviceId]
  );
  return result.rows[0];
}

async function updateDeviceRegistrySecret(deviceId, secretOrCommKey) {
  await registryPool.query(
    `UPDATE registry.device_registry SET secret_or_comm_key = $1 WHERE device_id = $2`,
    [secretOrCommKey, deviceId]
  );
}

async function updateDeviceRegistryActive(deviceId, active) {
  await registryPool.query(
    `UPDATE registry.device_registry SET active = $1 WHERE device_id = $2`,
    [active, deviceId]
  );
}

// Used only to roll back a registerDevice() call when the caller's own
// tenant-side insert needs to be undone (e.g. some other failure after
// both writes) — not exposed as a device "delete" feature, since
// attendanceDevices.js has no delete endpoint (devices are deactivated,
// not removed).
async function deleteDeviceRegistryEntry(deviceId) {
  await registryPool.query(`DELETE FROM registry.device_registry WHERE device_id = $1`, [deviceId]);
}

module.exports = {
  registryPool,
  initRegistrySchema,
  INSTITUTION_TYPES,
  registerDevice,
  getDeviceRegistryEntry,
  updateDeviceRegistrySecret,
  updateDeviceRegistryActive,
  deleteDeviceRegistryEntry,
  assertValidCode,
  codeToSchemaName,
  listInstitutions,
  getInstitutionByCode,
  getInstitutionByDomain,
  getInstitutionById,
  createInstitution,
  deleteInstitution,
  updateStatus,
  updateSubscription,
  updateCustomDomain,
  assertValidDomain,
  updateInstitutionContact,
  logAction,
  isAccessAllowed,
  STATUSES,
  getPlatformAdminByEmail,
  createPlatformAdmin,
  listPlatformAdmins,
  updatePlatformAdmin,
  deletePlatformAdmin,
  countSuperAdmins,
  assertValidPlatformRole,
  PLATFORM_ROLES,
  listAuditLogs,
  recordPayment,
  listPayments,
  runExpiryScan,
  getPlatformSetting,
  setPlatformSetting,
  getDefaultTrialDays,
  setDefaultTrialDays,
};
