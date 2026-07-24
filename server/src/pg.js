const { Pool } = require("pg");
const tenantContext = require("./tenantContext");

function normalizeDatabaseUrl(url) {
  if (!url) return url;
  // node-pg can fail with Neon's channel_binding=require param
  return url.replace(/([?&])channel_binding=[^&]*&?/g, "$1").replace(/[?&]$/, "");
}

const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
const needsSsl =
  process.env.DATABASE_SSL === "true" ||
  (databaseUrl || "").includes("sslmode=require");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.message);
});

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

async function query(text, params = []) {
  const client = activeClient();
  if (client) return client.query(text, params);
  return pool.query(text, params);
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
