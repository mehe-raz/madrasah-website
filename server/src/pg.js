const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === "true" ||
    (process.env.DATABASE_URL || "").includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
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

async function query(text, params = []) {
  return pool.query(text, params);
}

async function get(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows[0];
}

async function all(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

async function run(text, params = []) {
  const result = await pool.query(text, params);
  return {
    rowCount: result.rowCount,
    insertId: result.rows[0]?.id,
  };
}

async function withTransaction(fn) {
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
