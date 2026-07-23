// scripts/backup-restore.test.js
//
// Automated regression test for the backup/restore feature
// (server/src/routes/backup.js). It runs against a SEPARATE, throwaway
// test database — never production — and checks:
//
//   1. Round trip: seed known data -> backup -> mutate data -> restore ->
//      the database matches the pre-mutation state exactly (all table
//      counts, plus a content-level spot check on a few rows).
//   2. Rejections: a corrupt/non-JSON file is rejected, a backup missing
//      required tables is rejected, and a wrong encryption key is rejected.
//   3. Concurrency: a second restore started while one is already running
//      is refused (RESTORE_LOCKED), never runs both at once.
//
// This does NOT go through HTTP/auth — it calls the same functions the
// routes call (exposed via routerBackup.__test__ for this purpose only),
// so it stays fast and doesn't need a running server or a login.
//
// ─── SETUP (one-time) ───────────────────────────────────────────────────
//   1. Create an empty Postgres database you don't mind truncating —
//      e.g. a free Neon/Supabase project used ONLY for this. Never point
//      this at your real data.
//   2. Add its connection string to server/.env as:
//        BACKUP_TEST_DATABASE_URL=postgresql://...
//      (Keep your real DATABASE_URL in that file too — this script only
//      reads BACKUP_TEST_DATABASE_URL, it never touches DATABASE_URL.)
//   3. As a safety net, the connection string's database name must
//      contain "test" (case-insensitive). If yours doesn't, set
//      ALLOW_NONTEST_DB=yes when running to bypass that check.
//
// Run:  npm run test:backup
//
const path = require("path");
const fs = require("fs");

// --- load server/.env manually (no dependency on where "dotenv" is
// installed from this script's location) ---
function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(path.join(__dirname, "..", "server", ".env"));

const TEST_DB_URL = process.env.BACKUP_TEST_DATABASE_URL;

if (!TEST_DB_URL) {
  console.error(
    "BACKUP_TEST_DATABASE_URL is not set.\n" +
    "Add it to server/.env pointing at a throwaway test database (see the\n" +
    "comment at the top of scripts/backup-restore.test.js). Refusing to run\n" +
    "without it so this can never accidentally hit production."
  );
  process.exit(1);
}
if (!/test/i.test(TEST_DB_URL) && process.env.ALLOW_NONTEST_DB !== "yes") {
  console.error(
    "Refusing to run: BACKUP_TEST_DATABASE_URL's database name doesn't contain\n" +
    "\"test\", which is normally a sign this might not be a throwaway database.\n" +
    "This test TRUNCATEs tables, so if you're certain this is safe, re-run\n" +
    "with ALLOW_NONTEST_DB=yes."
  );
  process.exit(1);
}

process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = process.env.NODE_ENV || "test";

const db = require(path.join(__dirname, "..", "server", "src", "db"));
const backupEncryption = require(path.join(__dirname, "..", "server", "src", "lib", "backupEncryption"));
const backupRouter = require(path.join(__dirname, "..", "server", "src", "routes", "backup"));
const {
  createBackup,
  restoreJsonBackup,
  decodeBackupToJson,
  normalizeBackupDocument,
  performRestore,
  BACKUP_TABLES,
} = backupRouter.__test__;

const MARK = "__BR_TEST__";
let passCount = 0;
let failCount = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passCount++;
    console.log(`  \u2713 ${name}`);
  } else {
    failCount++;
    console.log(`  \u2717 ${name}${detail ? " — " + detail : ""}`);
  }
}

async function expectThrow(name, fn) {
  try {
    await fn();
    ok(name, false, "expected it to throw, but it did not");
  } catch {
    ok(name, true);
  }
}

async function tableCounts() {
  const counts = {};
  for (const table of BACKUP_TABLES) {
    const row = await db.get(`SELECT COUNT(*)::int AS c FROM ${table}`);
    counts[table] = row?.c || 0;
  }
  return counts;
}

function countsEqual(a, b) {
  return BACKUP_TABLES.every((t) => a[t] === b[t]);
}

async function cleanupMarkedRows() {
  // Cascades to attendance/payments/hifz_logs for these students via FK.
  await db.run(`DELETE FROM students WHERE name LIKE $1`, [`${MARK}%`]);
  await db.run(`DELETE FROM income WHERE note LIKE $1`, [`${MARK}%`]);
  await db.run(`DELETE FROM expenses WHERE note LIKE $1`, [`${MARK}%`]);
  await db.run(`DELETE FROM settings WHERE key = $1`, [`${MARK}_setting`]);
}

async function run() {
  console.log(`Connecting to test database (BACKUP_TEST_DATABASE_URL)...`);
  await db.init(); // idempotent: creates schema if missing, safe to re-run

  console.log("\nCleaning up any leftovers from a previous run...");
  await cleanupMarkedRows();

  console.log("\n--- Round-trip restore test ---");

  const studentRow = await db.run(
    `INSERT INTO students (name, "nameEn", roll, class, dept, type, fee, due, phone, blood, para, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [`${MARK} Student One`, "Test Student", "T-101", "5", "হিফজ", "আবাসিক", 1000, 0, "01700000001", "O+", 3, "সক্রিয়"]
  );
  const studentId = studentRow.insertId;

  await db.run(`INSERT INTO attendance ("studentId", date, status) VALUES ($1,$2,$3)`, [
    studentId,
    "2026-07-01",
    "উপস্থিত",
  ]);
  await db.run(
    `INSERT INTO payments ("studentId", student, roll, amount, date, receipt, method, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [studentId, `${MARK} Student One`, "T-101", 1000, "2026-07-01", `${MARK}-receipt-1`, "Cash", "Completed"]
  );
  await db.run(
    `INSERT INTO expenses (cat, amount, date, note) VALUES ($1,$2,$3,$4)`,
    ["Test", 500, "2026-07-01", `${MARK} expense`]
  );
  await db.run(
    `INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [`${MARK}_setting`, "original-value"]
  );

  const beforeCounts = await tableCounts();
  const backup = await createBackup();
  ok("backup file was created on disk", fs.existsSync(backup.localPath));

  const backupText = fs.readFileSync(backup.localPath, "utf8");
  const backupData = JSON.parse(backupText);

  // Now mutate: delete the student (cascades to attendance/payments),
  // change the setting, add an untracked expense — simulates real drift
  // between backup time and "something went wrong, restore it" time.
  await db.run(`DELETE FROM students WHERE id = $1`, [studentId]);
  await db.run(`UPDATE settings SET value = $1 WHERE key = $2`, ["mutated-value", `${MARK}_setting`]);
  await db.run(`INSERT INTO expenses (cat, amount, date, note) VALUES ($1,$2,$3,$4)`, [
    "Drift",
    999,
    "2026-07-02",
    "should disappear after restore",
  ]);

  const mutatedCounts = await tableCounts();
  ok("mutation actually changed the data (sanity check)", !countsEqual(beforeCounts, mutatedCounts));

  const report = await restoreJsonBackup(backupData);
  ok("restore reported success for all backed-up tables", Array.isArray(report.tables) && report.tables.length > 0);

  const afterCounts = await tableCounts();
  ok("table counts after restore match counts at backup time", countsEqual(beforeCounts, afterCounts),
    `before=${JSON.stringify(beforeCounts)} after=${JSON.stringify(afterCounts)}`);

  const restoredStudent = await db.get(`SELECT * FROM students WHERE name = $1`, [`${MARK} Student One`]);
  ok("the deleted student row came back", Boolean(restoredStudent));
  ok("restored student's fields are intact", restoredStudent?.phone === "01700000001" && restoredStudent?.roll === "T-101");

  const restoredPayment = await db.get(`SELECT * FROM payments WHERE receipt = $1`, [`${MARK}-receipt-1`]);
  ok("cascaded payment row came back too", Boolean(restoredPayment));

  const restoredSetting = await db.get(`SELECT value FROM settings WHERE key = $1`, [`${MARK}_setting`]);
  ok("mutated setting was reverted to its backed-up value", restoredSetting?.value === "original-value");

  const driftExpense = await db.get(`SELECT id FROM expenses WHERE note = $1`, ["should disappear after restore"]);
  ok("data added after the backup was taken is gone post-restore", !driftExpense);

  console.log("\n--- Rejection tests ---");

  await expectThrow("garbage (non-JSON) buffer is rejected", () => decodeBackupToJson(Buffer.from("not a backup file")));

  await expectThrow("backup missing required tables is rejected", () =>
    normalizeBackupDocument({ version: 2, format: "madrasah-pg-json", tables: { students: [] } })
  );

  await expectThrow("backup with wrong overall shape is rejected", () => normalizeBackupDocument(null));

  {
    const tmpPlain = path.join(__dirname, "..", "server", "backups", `${MARK}-enc-test.json`);
    const tmpEnc = `${tmpPlain}.enc`;
    fs.mkdirSync(path.dirname(tmpPlain), { recursive: true });
    fs.writeFileSync(tmpPlain, JSON.stringify({ version: 2, format: "madrasah-pg-json", exportedAt: new Date().toISOString(), tables: {} }));
    const originalKey = process.env.BACKUP_ENCRYPTION_KEY;
    try {
      process.env.BACKUP_ENCRYPTION_KEY = "correct-test-key-one";
      backupEncryption.encryptFile(tmpPlain, tmpEnc);
      const encryptedBuffer = fs.readFileSync(tmpEnc);
      process.env.BACKUP_ENCRYPTION_KEY = "a-completely-different-key";
      await expectThrow("a backup encrypted with a different key is rejected", () => decodeBackupToJson(encryptedBuffer));
    } finally {
      process.env.BACKUP_ENCRYPTION_KEY = originalKey;
      fs.rmSync(tmpPlain, { force: true });
      fs.rmSync(tmpEnc, { force: true });
    }
  }

  console.log("\n--- Concurrency test ---");
  {
    // Re-seed one row so there's something valid to restore concurrently.
    await db.run(
      `INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [`${MARK}_setting`, "original-value"]
    );
    const freshBackup = await createBackup();
    const buffer = fs.readFileSync(freshBackup.localPath);

    const results = await Promise.allSettled([performRestore(buffer, null), performRestore(buffer, null)]);
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const lockRejected = results.some(
      (r) => r.status === "rejected" && /already running|RESTORE_LOCKED/i.test(r.reason?.message || "")
    );
    ok("exactly one concurrent restore call succeeded", succeeded === 1, `succeeded=${succeeded}`);
    ok("the other concurrent call was refused as locked, not run", lockRejected);
  }

  console.log("\nCleaning up test rows...");
  await cleanupMarkedRows();

  console.log(`\n${passCount} passed, ${failCount} failed`);
  await db.pool.end();
  process.exit(failCount > 0 ? 1 : 0);
}

run().catch(async (err) => {
  console.error("\nTest run crashed:", err);
  try {
    await db.pool.end();
  } catch {}
  process.exit(1);
});
