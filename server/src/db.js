const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const pg = require("./pg");
const seed = require("./seed");

const schemaPath = path.join(__dirname, "..", "sql", "supabase_schema.sql");

async function initSchema() {
  const sql = fs.readFileSync(schemaPath, "utf8");
  // All statements in supabase_schema.sql are idempotent ("if not exists"),
  // have no parameters, and don't depend on results from earlier statements
  // in this file, so they can be sent to Postgres as a single multi-statement
  // command instead of one awaited round trip per statement. On a remote DB
  // (Neon/Supabase) each round trip can cost 50-150ms; with ~80 statements
  // that was 4-12s added to *every* server boot before the app could accept
  // its first request. Sending it as one batch cuts that to a single round
  // trip. IMPORTANT: must call pool.query(sql) with no second argument —
  // pg.query() always forwards a params array (even [] by default), which
  // forces node-postgres onto the parameterized "extended" protocol, and
  // Postgres rejects multiple commands per statement on that protocol. Only
  // the plain simple-query protocol (single string argument, no params)
  // allows a semicolon-separated batch like this to run.
  await pg.pool.query(sql);
}

async function initDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for PostgreSQL");
  }

  await initSchema();

  const userCountRow = await pg.get("SELECT COUNT(*)::int AS c FROM users");
  const userCount = userCountRow?.c || 0;

  if (userCount === 0) {
    const initialEmail = process.env.INITIAL_ADMIN_EMAIL;
    const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
    if (process.env.NODE_ENV === "production" && initialEmail && initialPassword) {
      if (initialPassword.length < 8) throw new Error("INITIAL_ADMIN_PASSWORD must be at least 8 characters");
      const hash = bcrypt.hashSync(initialPassword, 12);
      await pg.run(
        `INSERT INTO users (name, role, email, "passwordHash", "isProtected")
         VALUES ($1, 'Super Admin', $2, $3, 1) RETURNING id`,
        [process.env.INITIAL_ADMIN_NAME || "Super Admin", initialEmail.trim().toLowerCase(), hash]
      );
    } else if (process.env.NODE_ENV !== "production") {
      const devUsers = [
        ["মুহাম্মদ আলী", "Super Admin"],
        ["আব্দুর রহমান", "Admin"],
        ["ফাতেমা খাতুন", "Accountant"],
      ];
      for (const [name, role] of devUsers) {
        await pg.run('INSERT INTO users (name, role, "isProtected") VALUES ($1, $2, 1) RETURNING id', [name, role]);
      }
    } else {
      console.warn("No users found. Set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD, or restore a backup.");
    }
  } else {
    const superAdmin = await pg.get("SELECT * FROM users WHERE role = 'Super Admin' LIMIT 1");
    if (superAdmin) {
      await pg.run('UPDATE users SET "isProtected" = 1 WHERE id = $1', [superAdmin.id]);
      if (!superAdmin.email) {
        await pg.run("UPDATE users SET email = $1 WHERE id = $2", ["admin@madrasah.edu.bd", superAdmin.id]);
      }
    }
  }

  const countRow = await pg.get("SELECT COUNT(*)::int AS c FROM students");
  const count = countRow?.c || 0;

  if (count === 0) {
    for (const s of seed.students) {
      await pg.run(
        `INSERT INTO students (id, name, "nameEn", roll, class, dept, type, fee, due, phone, blood, para, status)
         OVERRIDING SYSTEM VALUE
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [s.id, s.name, s.nameEn, s.roll, s.class, s.dept, s.type, s.fee, s.due, s.phone, s.blood, s.para, s.status]
      );
    }

    for (const p of seed.payments) {
      await pg.run(
        `INSERT INTO payments (id, "studentId", student, roll, amount, date, receipt, method, status)
         OVERRIDING SYSTEM VALUE
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [p.id, p.studentId, p.student, p.roll, p.amount, p.date, p.receipt, p.method, p.status]
      );
      await pg.run(
        `INSERT INTO income (category, amount, date, note, method, receipt, "studentId", status)
         VALUES ('Student Fee', $1, $2, $3, $4, $5, $6, 'Completed')`,
        [p.amount, p.date, "Student fee payment", p.method, p.receipt, p.studentId]
      );
    }

    for (const e of seed.expenses) {
      await pg.run(
        `INSERT INTO expenses (id, cat, amount, date, note)
         OVERRIDING SYSTEM VALUE
         VALUES ($1, $2, $3, $4, $5)`,
        [e.id, e.cat, e.amount, e.date, e.note]
      );
    }

    for (const [k, v] of Object.entries(seed.settings)) {
      await pg.run("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", [k, String(v)]);
    }
    const { DEFAULT_CATEGORIES } = require("./lib/incomeCategories");
    await pg.run(
      "INSERT INTO settings (key, value) VALUES ('incomeCategories', $1) ON CONFLICT (key) DO NOTHING",
      [JSON.stringify(DEFAULT_CATEGORIES)]
    );

    const today = new Date().toISOString().slice(0, 10);
    for (const s of seed.students.slice(0, 6)) {
      await pg.run('INSERT INTO attendance ("studentId", date, status) VALUES ($1, $2, $3)', [s.id, today, "উপস্থিত"]);
    }
  }

  const catRow = await pg.get("SELECT value FROM settings WHERE key = 'incomeCategories'");
  if (!catRow) {
    const { DEFAULT_CATEGORIES } = require("./lib/incomeCategories");
    await pg.run("INSERT INTO settings (key, value) VALUES ('incomeCategories', $1)", [JSON.stringify(DEFAULT_CATEGORIES)]);
  }

  // BUSINESS_READINESS_ROADMAP.md Phase 8A: a single-tenant deployment has
  // no tenantProvision.js seeding step, so this is where its one
  // sms_wallets row gets created — same "insert once if missing" idiom as
  // the incomeCategories check above, not the seed-only-on-first-boot
  // block further up (an existing deployment upgrading to a version that
  // adds this table still needs the row backfilled).
  const walletRow = await pg.get("SELECT id FROM sms_wallets LIMIT 1");
  if (!walletRow) {
    await pg.run("INSERT INTO sms_wallets (balance_taka) VALUES (0)");
  }

  const incomeCountRow = await pg.get("SELECT COUNT(*)::int AS c FROM income");
  const incomeCount = incomeCountRow?.c || 0;
  if (incomeCount === 0) {
    const payments = await pg.all("SELECT * FROM payments");
    for (const p of payments) {
      await pg.run(
        `INSERT INTO income (category, amount, date, note, method, receipt, "studentId", status)
         VALUES ('Student Fee', $1, $2, $3, $4, $5, $6, 'Completed')`,
        [p.amount, p.date, "Migrated payment", p.method, p.receipt, p.studentId]
      );
    }
  }
}

let initPromise;

function init() {
  if (!initPromise) initPromise = initDb();
  return initPromise;
}

module.exports = {
  ...pg,
  init,
};
