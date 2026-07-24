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
}) {
  if (!name || !name.trim()) {
    const err = new Error("Institution name is required");
    err.status = 400;
    throw err;
  }
  assertValidCode(code);

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
       (name, code, schema_name, status, plan, contact_name, contact_email, contact_phone, trial_ends_at)
     VALUES ($1, $2, $3, 'trial', $4, $5, $6, $7, $8)
     RETURNING *`,
    [name.trim(), code, schemaName, plan, contactName || null, contactEmail || null, contactPhone || null, trialEndsAt]
  );
  return result.rows[0];
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

async function updateSubscription(id, { plan, subscriptionEndsAt }) {
  const result = await registryPool.query(
    `UPDATE registry.institutions
     SET plan = COALESCE($1, plan),
         subscription_ends_at = COALESCE($2, subscription_ends_at),
         updated_at = now()
     WHERE id = $3
     RETURNING *`,
    [plan || null, subscriptionEndsAt || null, id]
  );
  return result.rows[0];
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

async function getPlatformAdminByEmail(email) {
  const result = await registryPool.query(
    "SELECT * FROM registry.platform_admins WHERE lower(email) = lower($1)",
    [email]
  );
  return result.rows[0];
}

async function createPlatformAdmin({ name, email, password }) {
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
  const hash = await bcrypt.hash(password, PLATFORM_SALT_ROUNDS);
  try {
    const result = await registryPool.query(
      `INSERT INTO registry.platform_admins (name, email, "passwordHash")
       VALUES ($1, $2, $3) RETURNING id, name, email, created_at`,
      [name.trim(), email.trim().toLowerCase(), hash]
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

async function listAuditLogs({ institutionId, limit = 100 } = {}) {
  if (institutionId) {
    const result = await registryPool.query(
      `SELECT al.*, i.name AS institution_name, i.code AS institution_code
       FROM registry.audit_logs al
       LEFT JOIN registry.institutions i ON i.id = al.institution_id
       WHERE al.institution_id = $1
       ORDER BY al.created_at DESC LIMIT $2`,
      [institutionId, limit]
    );
    return result.rows;
  }
  const result = await registryPool.query(
    `SELECT al.*, i.name AS institution_name, i.code AS institution_code
     FROM registry.audit_logs al
     LEFT JOIN registry.institutions i ON i.id = al.institution_id
     ORDER BY al.created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
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

async function listPayments({ institutionId, limit = 100 } = {}) {
  if (institutionId) {
    const result = await registryPool.query(
      `SELECT * FROM registry.payments WHERE institution_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [institutionId, limit]
    );
    return result.rows;
  }
  const result = await registryPool.query(
    `SELECT p.*, i.name AS institution_name, i.code AS institution_code
     FROM registry.payments p
     LEFT JOIN registry.institutions i ON i.id = p.institution_id
     ORDER BY p.created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
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

module.exports = {
  registryPool,
  initRegistrySchema,
  assertValidCode,
  codeToSchemaName,
  listInstitutions,
  getInstitutionByCode,
  getInstitutionById,
  createInstitution,
  updateStatus,
  updateSubscription,
  logAction,
  isAccessAllowed,
  STATUSES,
  getPlatformAdminByEmail,
  createPlatformAdmin,
  listAuditLogs,
  recordPayment,
  listPayments,
  runExpiryScan,
};
