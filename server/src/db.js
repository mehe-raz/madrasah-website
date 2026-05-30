const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const seed = require("./seed");

const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "madrasah.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

function migrate() {
  const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!cols.includes("email")) {
    db.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
    db.exec(`ALTER TABLE users ADD COLUMN passwordHash TEXT`);
    db.exec(`ALTER TABLE users ADD COLUMN isProtected INTEGER DEFAULT 0`);
  }
  const deleteRequestCols = db.prepare("PRAGMA table_info(delete_requests)").all().map((c) => c.name);
  if (deleteRequestCols.length && !deleteRequestCols.includes("payload")) {
    db.exec(`ALTER TABLE delete_requests ADD COLUMN payload TEXT DEFAULT ''`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expiresAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      amount INTEGER NOT NULL,
      date TEXT NOT NULL,
      note TEXT DEFAULT '',
      method TEXT DEFAULT 'Cash',
      receipt TEXT NOT NULL,
      studentId INTEGER,
      status TEXT DEFAULT 'Completed',
      FOREIGN KEY (studentId) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS delete_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entityType TEXT NOT NULL,
      entityId INTEGER NOT NULL,
      label TEXT NOT NULL,
      amount INTEGER DEFAULT 0,
      requestedBy INTEGER,
      requestedByName TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL,
      resolvedAt TEXT,
      resolvedBy INTEGER,
      payload TEXT DEFAULT '',
      UNIQUE(entityType, entityId, status)
    );
  `);
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      nameEn TEXT DEFAULT '',
      roll TEXT NOT NULL,
      class TEXT DEFAULT '',
      dept TEXT DEFAULT 'হিফজ',
      type TEXT DEFAULT 'আবাসিক',
      fee INTEGER DEFAULT 1500,
      due INTEGER DEFAULT 0,
      phone TEXT DEFAULT '',
      blood TEXT DEFAULT 'O+',
      para INTEGER DEFAULT 0,
      status TEXT DEFAULT 'সক্রিয়'
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      UNIQUE(studentId, date),
      FOREIGN KEY (studentId) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      student TEXT NOT NULL,
      roll TEXT NOT NULL,
      amount INTEGER NOT NULL,
      date TEXT NOT NULL,
      receipt TEXT NOT NULL,
      method TEXT DEFAULT 'নগদ',
      status TEXT DEFAULT 'সম্পন্ন',
      FOREIGN KEY (studentId) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cat TEXT NOT NULL,
      amount INTEGER NOT NULL,
      date TEXT NOT NULL,
      note TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS hifz_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      date TEXT NOT NULL,
      sabaq TEXT DEFAULT '',
      FOREIGN KEY (studentId) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Teacher',
      email TEXT UNIQUE,
      passwordHash TEXT,
      isProtected INTEGER DEFAULT 0
    );
  `);

  migrate();

  const userCount = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
  if (userCount === 0) {
    const initialEmail = process.env.INITIAL_ADMIN_EMAIL;
    const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
    if (process.env.NODE_ENV === "production" && initialEmail && initialPassword) {
      if (initialPassword.length < 8) throw new Error("INITIAL_ADMIN_PASSWORD must be at least 8 characters");
      const hash = bcrypt.hashSync(initialPassword, 12);
      db.prepare(
        "INSERT INTO users (name, role, email, passwordHash, isProtected) VALUES (?, 'Super Admin', ?, ?, 1)"
      ).run(process.env.INITIAL_ADMIN_NAME || "Super Admin", initialEmail.trim().toLowerCase(), hash);
    } else if (process.env.NODE_ENV !== "production") {
      const insertUser = db.prepare("INSERT INTO users (name, role, isProtected) VALUES (?, ?, 1)");
      insertUser.run("মুহাম্মদ আলী", "Super Admin");
      insertUser.run("আব্দুর রহমান", "Admin");
      insertUser.run("ফাতেমা খাতুন", "Accountant");
    } else {
      console.warn("No users found. Set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD, or restore a backup.");
    }
  } else {
    const superAdmin = db.prepare("SELECT * FROM users WHERE role = 'Super Admin' LIMIT 1").get();
    if (superAdmin) {
      db.prepare("UPDATE users SET isProtected = 1 WHERE id = ?").run(superAdmin.id);
      if (!superAdmin.email) {
        db.prepare("UPDATE users SET email = ? WHERE id = ?").run("admin@madrasah.edu.bd", superAdmin.id);
      }
    }
  }

  const count = db.prepare("SELECT COUNT(*) as c FROM students").get().c;
  if (count === 0) {
    const insertStudent = db.prepare(`
      INSERT INTO students (id, name, nameEn, roll, class, dept, type, fee, due, phone, blood, para, status)
      VALUES (@id, @name, @nameEn, @roll, @class, @dept, @type, @fee, @due, @phone, @blood, @para, @status)
    `);
    const tx = db.transaction((rows) => rows.forEach((r) => insertStudent.run(r)));
    tx(seed.students);

    const insertPayment = db.prepare(`
      INSERT INTO payments (id, studentId, student, roll, amount, date, receipt, method, status)
      VALUES (@id, @studentId, @student, @roll, @amount, @date, @receipt, @method, @status)
    `);
    seed.payments.forEach((p) => {
      insertPayment.run(p);
      db.prepare(
        `INSERT INTO income (category, amount, date, note, method, receipt, studentId, status)
         VALUES ('Student Fee', ?, ?, ?, ?, ?, ?, 'Completed')`
      ).run(p.amount, p.date, "Student fee payment", p.method, p.receipt, p.studentId);
    });

    const insertExpense = db.prepare(`
      INSERT INTO expenses (id, cat, amount, date, note) VALUES (@id, @cat, @amount, @date, @note)
    `);
    seed.expenses.forEach((e) => insertExpense.run(e));

    const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    Object.entries(seed.settings).forEach(([k, v]) => insertSetting.run(k, String(v)));
    const { DEFAULT_CATEGORIES } = require("./lib/incomeCategories");
    insertSetting.run("incomeCategories", JSON.stringify(DEFAULT_CATEGORIES));

    const today = new Date().toISOString().slice(0, 10);
    const insertAtt = db.prepare(
      "INSERT INTO attendance (studentId, date, status) VALUES (?, ?, ?)"
    );
    seed.students.slice(0, 6).forEach((s) => insertAtt.run(s.id, today, "উপস্থিত"));
  }

  const catRow = db.prepare("SELECT value FROM settings WHERE key = 'incomeCategories'").get();
  if (!catRow) {
    const { DEFAULT_CATEGORIES } = require("./lib/incomeCategories");
    db.prepare("INSERT INTO settings (key, value) VALUES ('incomeCategories', ?)").run(
      JSON.stringify(DEFAULT_CATEGORIES)
    );
  }

  const incomeCount = db.prepare("SELECT COUNT(*) as c FROM income").get().c;
  if (incomeCount === 0) {
    const payments = db.prepare("SELECT * FROM payments").all();
    payments.forEach((p) => {
      db.prepare(
        `INSERT INTO income (category, amount, date, note, method, receipt, studentId, status)
         VALUES ('Student Fee', ?, ?, ?, ?, ?, ?, 'Completed')`
      ).run(p.amount, p.date, "Migrated payment", p.method, p.receipt, p.studentId);
    });
  }
}

initDb();

module.exports = db;
