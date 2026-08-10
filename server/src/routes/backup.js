const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const googleDrive = require("../lib/googleDrive");
const backupEncryption = require("../lib/backupEncryption");
const { withRestoreLock, RestoreLockError } = require("../lib/restoreLock");
const { recordBackupEvent } = require("../lib/backupAudit");
const { recordAudit } = require("../lib/auditLog");
const tenantResolve = require("../middleware/tenantResolve");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
// (Every route below additionally requires Super Admin specifically — backup
// data includes password hashes and full financial records, so the broader
// "settings" permission that Admin also holds isn't enough on its own.)
router.use(requirePermission("settings"));
const backupDir = path.join(__dirname, "..", "..", "backups");
const CONFIG_KEY = "backupConfig";
// Must match CONFIG_KEY in lib/googleDrive.js — that's the settings row that
// holds the connected account's OAuth tokens. Referenced here (not imported)
// because it's not exported there; kept as a named constant so the intent at
// each call site below is obvious rather than a bare string literal.
const GOOGLE_DRIVE_AUTH_KEY = "googleDriveAuth";
const BACKUP_FORMAT = "madrasah-pg-json";
const BACKUP_VERSION = 2;
const RESTORE_REQUIRED_TABLES = ["users", "students", "settings"];

const BACKUP_TABLES = [
  "students",
  "attendance",
  "payments",
  "income",
  "expenses",
  "hifz_logs",
  "settings",
  "users",
  "password_resets",
  "delete_requests",
];

function defaultConfig() {
  return {
    enabled: false,
    intervalHours: 24,
    keepLocalCopies: 14,
    // Separate cap from keepLocalCopies because Drive has no automatic
    // rotation of its own (see pruneOldBackups in lib/googleDrive.js) — left
    // unbounded, every scheduled run would just add another file forever.
    keepDriveCopies: 14,
    destinations: ["", "", ""],
    lastRunAt: "",
    // Sha256 of the last backup's table contents (see computeDataHash
    // below). Lets createBackup() detect "nothing changed since last time"
    // and skip uploading a byte-for-byte duplicate to Drive.
    lastBackupHash: "",
  };
}

async function getConfig() {
  const row = await db.get("SELECT value FROM settings WHERE key = $1", [CONFIG_KEY]);
  if (!row) return defaultConfig();
  try {
    return { ...defaultConfig(), ...JSON.parse(row.value) };
  } catch {
    return defaultConfig();
  }
}

async function saveConfig(config) {
  const destinations = (Array.isArray(config.destinations) ? config.destinations.slice(0, 3) : ["", "", ""]).map(
    (d) => {
      const trimmed = String(d || "").trim();
      // Reject relative segments so a typo like "../.." can't walk the
      // destination outside of wherever the admin intended. Now that this
      // route requires Super Admin, this is a safety net against mistakes
      // more than an attack defense, but it's cheap to keep.
      if (trimmed && trimmed.includes("..")) return "";
      return trimmed;
    }
  );
  const clean = {
    ...defaultConfig(),
    ...config,
    intervalHours: Math.max(1, Number(config.intervalHours) || 24),
    keepLocalCopies: Math.max(1, Number(config.keepLocalCopies) || 14),
    keepDriveCopies: Math.max(1, Number(config.keepDriveCopies) || 14),
    destinations,
  };
  await db.run(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [CONFIG_KEY, JSON.stringify(clean)]
  );
  return clean;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Mirrors index.js's isAllowedOrigin() CORS check: an explicit CLIENT_ORIGIN
// entry, any *.vercel.app (the client's default host), or the configured
// PLATFORM_ROOT_DOMAIN and its subdomains (tenant-a.example.com, etc). Kept
// as a separate small copy here rather than importing from index.js to
// avoid a circular require (index.js is what requires this router).
function isAllowedReturnOrigin(origin) {
  if (!origin) return false;
  const allowed = (process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (allowed.includes(origin)) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.hostname.endsWith(".vercel.app")) return true;
    const rootDomain = (process.env.PLATFORM_ROOT_DOMAIN || "").toLowerCase();
    if (rootDomain) {
      const host = parsed.hostname.toLowerCase();
      if (host === rootDomain || host.endsWith(`.${rootDomain}`)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function safeOriginFromUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function defaultClientOrigin() {
  return (
    (process.env.CLIENT_ORIGIN || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)[0] || "/"
  );
}

// Both restore routes take an optional `?tables=students,attendance,...`
// query param (the file-upload route already uses its body for the raw
// backup bytes, so the selection can't travel in the body there). Returns
// null (meaning "everything in the backup", the pre-existing behavior) when
// the param is absent so old bookmarked links / API callers are unaffected.
function parseSelectedTables(req) {
  const raw = req.query?.tables;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const list = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

async function exportJsonBackup() {
  const tables = {};
  const counts = {};
  for (const table of BACKUP_TABLES) {
    tables[table] = await db.all(`SELECT * FROM ${table}`);
    counts[table] = Array.isArray(tables[table]) ? tables[table].length : 0;
  }
  return {
    version: BACKUP_VERSION,
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    tables,
    counts,
  };
}

// Hashes only the table contents — never `exportedAt`, which is different
// on every single call by definition and would make every backup "look"
// changed even when the underlying data is byte-for-byte identical. Two
// exports of the same data always produce the same hash, so createBackup()
// below can tell "nothing changed since the last backup" apart from "real
// new data" and only upload to Drive (and only count against
// keepDriveCopies) in the second case.
function computeDataHash(snapshot) {
  return crypto.createHash("sha256").update(JSON.stringify(snapshot.tables)).digest("hex");
}

function normalizeBackupDocument(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid madrasah backup file");
  }
  if (data.format && data.format !== BACKUP_FORMAT) {
    throw new Error(`Unsupported backup format: ${data.format}`);
  }
  const version = Number.isInteger(data.version) ? data.version : 1;
  if (version > BACKUP_VERSION) {
    throw new Error(`Backup version ${version} is newer than this server can restore`);
  }
  if (!data.tables || typeof data.tables !== "object" || Array.isArray(data.tables)) {
    throw new Error("Invalid madrasah backup file");
  }

  const missing = RESTORE_REQUIRED_TABLES.filter((t) => !Array.isArray(data.tables[t]));
  if (missing.length) {
    throw new Error(`Backup is missing required tables: ${missing.join(', ')}`);
  }

  const unsupported = Object.keys(data.tables).filter((table) => !BACKUP_TABLES.includes(table));
  const warnings = [];
  if (version < BACKUP_VERSION) warnings.push(`Older backup version ${version}; restore will still proceed.`);
  if (unsupported.length) warnings.push(`Ignoring unsupported tables: ${unsupported.join(', ')}`);

  return { data, version, warnings, unsupported };
}

async function getTableColumns(tx, table) {
  const rows = await tx.all(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  return rows.map((r) => r.column_name);
}

function toRestoreRow(row, allowedColumns) {
  const allowed = new Set(allowedColumns);
  const cleaned = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (allowed.has(key)) cleaned[key] = value;
  }
  return cleaned;
}

// Inserts `rows` into `table` using multi-row INSERT statements instead of
// one INSERT per row. A restore's real cost isn't Postgres's work — it's the
// network round trip to it (this server talks to a remote managed DB), and
// the old code paid that round trip ~2000+ times for a typical backup
// (1500 attendance rows alone). Batching cuts that to roughly one round
// trip per table.
//
// Rows are grouped by their exact set of present columns (same idea as
// toRestoreRow) because a single INSERT statement needs one fixed column
// list — in practice every row of a table shares the same keys (they all
// came from one `SELECT * FROM table` when the backup was made), so this
// almost always ends up as a single group per table, not a fallback to
// per-row. CHUNK_ROWS is capped by column count so a single statement never
// approaches Postgres's ~65535 bound-parameter limit.
async function insertRowsBatched(tx, table, rows, allowedColumns) {
  let inserted = 0;
  let i = 0;
  while (i < rows.length) {
    const first = toRestoreRow(rows[i], allowedColumns);
    const cols = Object.keys(first);
    if (!cols.length) {
      i += 1;
      continue;
    }
    const colKey = cols.slice().sort().join(",");
    const chunkRows = Math.max(1, Math.min(500, Math.floor(60000 / cols.length)));

    const group = [first];
    let j = i + 1;
    while (j < rows.length && group.length < chunkRows) {
      const cleaned = toRestoreRow(rows[j], allowedColumns);
      if (Object.keys(cleaned).sort().join(",") !== colKey) break;
      group.push(cols.reduce((acc, c) => ((acc[c] = cleaned[c]), acc), {}));
      j += 1;
    }

    const quotedCols = cols.map((c) => `"${c}"`).join(", ");
    const values = [];
    const rowPlaceholders = group.map((row, rIdx) => {
      const placeholders = cols.map((_, cIdx) => `$${rIdx * cols.length + cIdx + 1}`);
      for (const c of cols) values.push(row[c]);
      return `(${placeholders.join(", ")})`;
    });
    await tx.run(`INSERT INTO ${table} (${quotedCols}) VALUES ${rowPlaceholders.join(", ")}`, values);
    inserted += group.length;
    i = j;
  }
  return inserted;
}

async function getCounts(tx, tables) {
  const counts = {};
  for (const table of tables) {
    const row = await tx.get(`SELECT COUNT(*)::int AS c FROM ${table}`);
    counts[table] = row?.c || 0;
  }
  return counts;
}

// NOTE: backups are JSON-only, on purpose. An earlier version also produced a
// pg_dump/psql SQL format, but restoring that onto a live, already-existing
// database required "--clean" (drop-and-recreate), which on managed Postgres
// (Supabase/Render) can drop and fail to properly recreate the "public"
// schema itself — taking the whole app down at boot ("no schema has been
// selected to create in"), far worse than a bad data restore. JSON restore
// only ever TRUNCATEs + INSERTs rows inside a single transaction; it never
// touches schema, so it can't cause that class of outage.
async function createBackup(config = null) {
  const activeConfig = config || (await getConfig());
  ensureDir(backupDir);
  const time = stamp();
  const filename = `madrasah-backup-${time}.json`;
  const localPath = path.join(backupDir, filename);

  const snapshot = await exportJsonBackup();
  const dataHash = computeDataHash(snapshot);
  fs.writeFileSync(localPath, JSON.stringify(snapshot, null, 2));

  activeConfig.destinations
    .map((d) => String(d || "").trim())
    .filter(Boolean)
    .forEach((dest) => {
      ensureDir(dest);
      fs.copyFileSync(localPath, path.join(dest, filename));
    });

  const copies = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith("madrasah-backup-") && f.endsWith(".json"))
    .sort()
    .reverse();
  copies.slice(activeConfig.keepLocalCopies).forEach((f) => fs.unlinkSync(path.join(backupDir, f)));

  // Same content as the last backup that actually reached Drive? Then
  // there's nothing new to preserve there — uploading again would just be
  // an identical file sitting next to the old one, and every scheduled run
  // between now and the next real change would keep repeating that.
  // (The local copy above still happens every time regardless — it's cheap,
  // already rotated by keepLocalCopies, and "Download backup" always needs
  // a fresh file to hand to the browser.)
  const driveUploadSkipped = Boolean(dataHash && activeConfig.lastBackupHash && dataHash === activeConfig.lastBackupHash);
  if (driveUploadSkipped) {
    console.log(`Backup data unchanged since the last Drive upload — skipping Drive upload for ${filename} (kept locally only).`);
  }

  let tempEncPath = null;
  if (!driveUploadSkipped) {
    try {
      let uploadPath = localPath;
      let uploadFilename = filename;
      let uploadMimeType = "application/json";

      if (backupEncryption.isConfigured()) {
        tempEncPath = `${localPath}.enc`;
        backupEncryption.encryptFile(localPath, tempEncPath);
        uploadPath = tempEncPath;
        uploadFilename = `${filename}.enc`;
        uploadMimeType = "application/octet-stream";
      } else {
        console.warn(
          "BACKUP_ENCRYPTION_KEY is not set — backups uploaded to Google Drive will be plain, readable JSON."
        );
      }

      const uploaded = await googleDrive.uploadBackupFile(uploadPath, uploadFilename, uploadMimeType);
      if (uploaded) console.log(`Backup uploaded to Google Drive: ${uploadFilename}`);

      // Only trim once something new actually landed — running this on a
      // skipped upload would do nothing useful and just cost an extra
      // Drive API round trip.
      await googleDrive.pruneOldBackups(activeConfig.keepDriveCopies);
    } catch (err) {
      // Google Drive upload is best-effort, same as the local folder destinations above:
      // a failed upload should never block the backup itself from completing.
      console.warn("Google Drive backup upload failed:", err.message);
    } finally {
      if (tempEncPath && fs.existsSync(tempEncPath)) fs.unlinkSync(tempEncPath);
    }
  }

  const saved = await saveConfig({
    ...activeConfig,
    lastRunAt: new Date().toISOString(),
    // Keep the previous hash on record if this run's upload was skipped due
    // to a Drive error inside the try/catch above (dataHash would still be
    // set from this run, but we only want to "commit" it once we know it's
    // actually the hash of what's in Drive) — but a clean skip (identical
    // data) or a clean upload should both persist today's hash so the next
    // comparison is against this run either way.
    lastBackupHash: dataHash || activeConfig.lastBackupHash,
  });
  return { filename, localPath, format: "json", config: saved, driveUploadSkipped };
}

// `options.selectedTables`, when given, narrows a restore down to only those
// sections (e.g. the admin unchecked "users" and "income" in the restore
// preview). Anything not in BACKUP_TABLES is ignored rather than rejected,
// so a stale/garbled value from an old client just falls back safely.
// `options.actingUser` is who clicked "Confirm restore" — see the
// self-account preservation block below for why it's needed.
// `options.stripGoogleDriveAuth`, when true, drops the backed-up Google
// Drive connection (its OAuth tokens live in the "settings" table under
// GOOGLE_DRIVE_AUTH_KEY) instead of restoring it. This is set for manual
// file-upload restores only (see performRestore's callers): someone
// installing fresh and uploading an old .json/.enc backup should NOT end up
// silently connected to whichever Google Drive account the ORIGINAL
// institution had linked — that's a different institution's Drive, and
// connecting to it must always be a deliberate action taken from the
// Google Drive section itself, never an automatic side effect of restoring
// a file. (Restoring directly from a Drive file the admin already picked
// in that section is a different case — they explicitly chose that
// account, so its connection is left alone there.)
async function restoreJsonBackup(data, options = {}) {
  const { data: backup, version, warnings } = normalizeBackupDocument(data);
  const requestedTables =
    Array.isArray(options.selectedTables) && options.selectedTables.length
      ? BACKUP_TABLES.filter((t) => options.selectedTables.includes(t))
      : BACKUP_TABLES;
  const tablesToRestore = requestedTables.filter((table) => Array.isArray(backup.tables[table]));
  if (!tablesToRestore.length) {
    throw new Error("No sections were selected to restore.");
  }
  const actingUser = options.actingUser || null;
  const stripGoogleDriveAuth = Boolean(options.stripGoogleDriveAuth);

  return await db.withTransaction(async (tx) => {
    const beforeCounts = await getCounts(tx, tablesToRestore);

    // If the "users" table is about to be wiped and replaced, capture the
    // acting Super Admin's own current row *before* the TRUNCATE below.
    // Without this, restoring a backup taken before this account existed
    // (e.g. right after setting up a brand-new install) would truncate
    // their login out of existence along with everything else, locking
    // the very person doing the restore out of the software they just
    // recovered.
    let actingUserRow = null;
    if (actingUser?.id && tablesToRestore.includes("users")) {
      actingUserRow = await tx.get('SELECT * FROM users WHERE id = $1', [actingUser.id]);
    }

    for (const table of [...tablesToRestore].reverse()) {
      await tx.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
    }

    const inserted = {};
    let selfAccountRestored = false;
    let googleDriveAuthStripped = false;
    for (const table of tablesToRestore) {
      let rows = backup.tables[table] || [];
      if (table === "settings" && stripGoogleDriveAuth) {
        const hadAuthRow = rows.some((r) => r?.key === GOOGLE_DRIVE_AUTH_KEY);
        if (hadAuthRow) {
          rows = rows.filter((r) => r?.key !== GOOGLE_DRIVE_AUTH_KEY);
          googleDriveAuthStripped = true;
        }
      }
      const allowedColumns = await getTableColumns(tx, table);
      inserted[table] = await insertRowsBatched(tx, table, rows, allowedColumns);

      // Add the acting user's account back in if the backup didn't already
      // bring back one under the same email — if it did, that's the
      // backup's own version of them and takes priority (they'll need to
      // use whatever password was current as of that backup).
      if (table === "users" && actingUserRow) {
        const emailLower = String(actingUserRow.email || "").toLowerCase();
        const alreadyPresent = emailLower && rows.some((r) => String(r?.email || "").toLowerCase() === emailLower);
        if (emailLower && !alreadyPresent) {
          const cleaned = toRestoreRow(actingUserRow, allowedColumns);
          delete cleaned.id; // let RESTART IDENTITY assign a fresh id
          const cols = Object.keys(cleaned);
          if (cols.length) {
            const values = cols.map((col) => cleaned[col]);
            const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
            const quotedCols = cols.map((c) => `"${c}"`).join(", ");
            await tx.run(`INSERT INTO ${table} (${quotedCols}) VALUES (${placeholders})`, values);
            inserted[table] += 1;
            selfAccountRestored = true;
          }
        }
      }
    }

    const afterCounts = await getCounts(tx, tablesToRestore);
    const finalWarnings = googleDriveAuthStripped
      ? [...warnings, "Google Drive connection was not restored — reconnect it from the Google Drive section if needed."]
      : warnings;
    const report = {
      version,
      format: backup.format || BACKUP_FORMAT,
      exportedAt: backup.exportedAt || null,
      warnings: finalWarnings,
      beforeCounts,
      afterCounts,
      restoredRows: inserted,
      tables: tablesToRestore,
      selfAccountRestored,
      googleDriveAuthStripped,
    };
    return report;
  });
}

async function getRestoreReport(buffer) {
  const data = decodeBackupToJson(buffer);
  const { data: backup, version, warnings, unsupported } = normalizeBackupDocument(data);
  const backupCounts = {};
  const currentCounts = {};
  for (const table of BACKUP_TABLES) {
    backupCounts[table] = Array.isArray(backup.tables[table]) ? backup.tables[table].length : 0;
    const row = await db.get(`SELECT COUNT(*)::int AS c FROM ${table}`);
    currentCounts[table] = row?.c || 0;
  }
  return { exportedAt: backup.exportedAt || null, version, format: backup.format || BACKUP_FORMAT, warnings, unsupportedTables: unsupported, backupCounts, currentCounts };
}

async function performRestore(buffer, user = null, selectedTables = null, stripGoogleDriveAuth = false) {
  return await withRestoreLock(async () => {
    const beforeBackup = await createBackup();
    try {
      const report = await restoreJsonBackup(decodeBackupToJson(buffer), { selectedTables, actingUser: user, stripGoogleDriveAuth });
      await recordBackupEvent({ event: 'restore', status: 'success', user, backupVersion: report.version, backupFormat: report.format, report: { ...report, safetyBackup: beforeBackup.filename } });
      await recordAudit({
        action: "backup.restored",
        actor: user,
        entityType: "backup",
        entityId: 0,
        label: `Restored backup (v${report.version}, safety copy: ${beforeBackup.filename}, sections: ${report.tables.join(", ")})${report.selfAccountRestored ? " — restorer's own account kept" : ""}${report.googleDriveAuthStripped ? " — Google Drive connection not carried over" : ""}`,
        details: { restoredRows: report.restoredRows, warnings: report.warnings, selfAccountRestored: report.selfAccountRestored, googleDriveAuthStripped: report.googleDriveAuthStripped },
      });
      return { beforeBackup, report };
    } catch (e) {
      await recordBackupEvent({ event: 'restore', status: 'failed', user, error: e.message || 'Restore failed', report: { safetyBackup: beforeBackup.filename } });
      await recordAudit({
        action: "backup.restore-failed",
        actor: user,
        entityType: "backup",
        entityId: 0,
        label: `Restore failed: ${e.message || "Restore failed"}`,
      });
      throw e;
    }
  });
}

router.get("/", async (req, res) => {
  // Was previously guarded only by the generic "settings" permission, which
  // Admin also holds — meaning an Admin could call this directly (bypassing
  // the UI, which only shows the backup section to Super Admin) and download
  // a full database dump including every user's password hash. /restore and
  // the /google/* routes below already required Super Admin explicitly; this
  // brings download/config/run in line with them.
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can download backups" });
  }
  try {
    const { localPath, filename } = await createBackup();
    res.download(localPath, filename);
  } catch (e) {
    res.status(500).json({ error: e.message || "Backup failed" });
  }
});

router.get("/config", async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can view backup settings" });
  }
  res.json({ ...(await getConfig()), driveEncryptionEnabled: backupEncryption.isConfigured() });
});

router.put("/config", async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can change backup settings" });
  }
  res.json(await saveConfig(req.body || {}));
});

router.post("/run", async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can run a backup" });
  }
  try {
    const result = await createBackup();
    await recordAudit({
      action: "backup.created",
      actor: req.user,
      entityType: "backup",
      entityId: 0,
      label: `Manual backup created: ${result.filename}`,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || "Backup failed" });
  }
});

// Shared by upload/Drive restore AND preview: decrypts a .enc backup if
// needed and returns the parsed JSON. Only JSON backups are supported now
// (see the note above createBackup for why the old SQL path was removed).
function decodeBackupToJson(buffer) {
  let plain = buffer;
  let text = plain.toString("utf8");

  // An encrypted backup (see lib/backupEncryption.js) is binary and won't
  // start with "{", whether it arrived via the "restore from Drive" button
  // or was manually re-uploaded as a .enc file someone downloaded from the
  // Drive folder. Try decrypting first so both paths behave the same way.
  if (!text.trimStart().startsWith("{") && backupEncryption.isConfigured()) {
    try {
      plain = backupEncryption.decryptBuffer(buffer);
      text = plain.toString("utf8");
    } catch {
      // Not an encrypted backup either — fall through to the JSON.parse
      // below, which will throw a clear "Unsupported backup format" error.
    }
  }

  if (!text.trimStart().startsWith("{")) {
    throw new Error("Unsupported backup format. Only JSON madrasah backups (.json or encrypted .enc) can be restored.");
  }
  return JSON.parse(text);
}

router.post("/preview", express.raw({ type: ["application/octet-stream", "application/json"], limit: "100mb" }), async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can preview a backup" });
  }
  if (!req.body?.length) return res.status(400).json({ error: "Backup file required" });
  try {
    res.json(await getRestoreReport(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message || "Could not read backup file" });
  }
});

router.post("/dry-run", express.raw({ type: ["application/octet-stream", "application/json"], limit: "100mb" }), async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can preview a backup" });
  }
  if (!req.body?.length) return res.status(400).json({ error: "Backup file required" });
  try {
    res.json(await getRestoreReport(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message || "Could not read backup file" });
  }
});

router.post("/restore", express.raw({ type: ["application/octet-stream", "application/json"], limit: "100mb" }), async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can restore backup" });
  }
  if (!req.body?.length) return res.status(400).json({ error: "Backup file required" });

  try {
    // Manual upload — always strip any Google Drive connection the backup
    // file carries (see the big comment on restoreJsonBackup). Whoever is
    // running this is potentially setting up a brand-new install from an
    // old file and must never end up silently linked to another
    // institution's Drive account just because it happened to be connected
    // when that backup was taken.
    const { beforeBackup, report } = await performRestore(req.body, req.user, parseSelectedTables(req), true);
    res.json({
      ok: true,
      message: "Backup restored successfully.",
      safetyBackup: beforeBackup.filename,
      report,
    });
  } catch (e) {
    if (e instanceof RestoreLockError) {
      return res.status(409).json({ error: e.message });
    }
    res.status(500).json({ error: e.message || "Restore failed" });
  }
});

router.get("/google/status", async (_req, res) => {
  try {
    res.json(await googleDrive.getStatus());
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to load Google Drive status" });
  }
});

router.get("/google/auth-url", async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can connect Google Drive" });
  }
  try {
    if (!googleDrive.isConfigured()) {
      return res.status(400).json({
        error: "Google Drive integration is not configured on the server (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_DRIVE_REDIRECT_URI).",
      });
    }
    // This app is multi-tenant (one subdomain per institution/training
    // site), so remember which one this request came from — the OAuth
    // callback below has no tenant context of its own and otherwise has no
    // way to know where to send the popup back to, or which tenant's schema
    // to save the connection into. Only trust the origin if it's actually
    // one of our allowed origins (same check CORS uses), so this can never
    // be turned into an open redirect. req.tenant is set by tenantResolve
    // from this request's own Host (this route IS reached tenant-aware,
    // unlike the callback below — see middleware/tenantResolve.js).
    const rawOrigin = req.get("origin") || (req.get("referer") ? safeOriginFromUrl(req.get("referer")) : "");
    const returnOrigin = isAllowedReturnOrigin(rawOrigin) ? rawOrigin : "";
    res.json({ url: googleDrive.getAuthUrl(req.user.id, returnOrigin, req.tenant?.code || "") });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to start Google Drive connection" });
  }
});

// Google redirects the browser here after the user approves/denies access.
// This is a top-level navigation (not a fetch), so it CANNOT rely on the
// "token" cookie the way every other route in this file does: that cookie
// is issued (and therefore only ever stored by the browser) for whichever
// tenant subdomain the admin actually logged into (e.g.
// dhaka-madrasah.example.com), because it's a host-only cookie with no
// `domain` attribute. GOOGLE_DRIVE_REDIRECT_URI, by contrast, always points
// at one fixed host registered once in Google Cloud Console (typically a
// dedicated api.example.com — see .env.example) — a DIFFERENT host than the
// tenant subdomain, for every single tenant. The browser therefore never
// attaches that cookie to this request, so req.user is never trustworthy
// here (this used to be read as req.user, which meant this route silently
// failed for every multi-tenant deployment). tenantResolve.js's
// isSkippedPath() also lets this request through without trying (and
// failing) to match this fixed Host to an institution.
//
// Instead, identity is re-derived from the signed `state` param itself:
// /google/auth-url below only ever mints it for a request that already
// passed cookie auth as Super Admin, so its `uid`/`institutionCode` claims
// are trustworthy. The institution code opens the correct tenant's database
// context by hand via withTenantByCode, and the uid is then looked up
// against *that* tenant's users table (not just decoded from the token) so
// a stale/deleted/demoted account can't complete the connection.
// Pulled out as a standalone named function (not just an inline router
// callback) so index.js can mount it directly on the Express app at
// /api/backup/google/callback BEFORE the global `app.use("/api", ...,
// requireAuth, ..., rbacMiddleware)` chain. That global chain used to run
// first for every /api/* path — including this one — and since Google's
// redirect never carries the tenant cookie (see the big comment above),
// requireAuth rejected the request with 401 "Login required" before this
// handler ever ran, no matter how carefully IT avoided depending on
// req.user. Mounting it earlier in index.js fixes that; it's still also
// wired up on the router below so a direct `/api/backup/google/callback`
// hit through the normal router (e.g. in tests) keeps working the same way.
async function googleCallbackHandler(req, res) {
  const { code, state, error } = req.query;

  // Prefer the tenant origin that was signed into `state` when the connect
  // flow started (see /google/auth-url above); fall back to the single
  // global CLIENT_ORIGIN for old links or single-tenant deployments. This
  // has to be resolved before the try/catch below so error redirects (e.g.
  // "access denied") also land back on the right tenant site instead of a
  // hardcoded one.
  const statePayload = typeof state === "string" ? googleDrive.decodeState(state) : null;
  const clientOrigin =
    statePayload?.origin && isAllowedReturnOrigin(statePayload.origin) ? statePayload.origin : defaultClientOrigin();
  const institutionCode = statePayload?.institutionCode || "";

  const finishConnection = async () => {
    if (error) throw new Error(String(error));
    if (!code || !state) throw new Error("Missing Google authorization code");
    if (!statePayload || statePayload.purpose !== "google-drive-oauth" || !statePayload.uid) {
      throw new Error("Google Drive connection link expired. Please try connecting again.");
    }
    // Re-verify the connecting user against THIS tenant's own users table
    // (rather than trusting req.user, which is unavailable here — see the
    // comment above the route) so a token minted for institution A can
    // never be replayed to connect institution B's Drive, and so a user
    // who was demoted/removed after clicking "Connect" can't slip through.
    const user = await db.get("SELECT id, role FROM users WHERE id = $1", [statePayload.uid]);
    if (!user || user.role !== "Super Admin") {
      throw new Error("Only Super Admin can connect Google Drive");
    }
    await googleDrive.handleCallback(String(code), String(state), user.id);
  };

  try {
    if (institutionCode && process.env.MULTI_TENANT_MODE === "true") {
      await tenantResolve.withTenantByCode(institutionCode, finishConnection);
    } else {
      await finishConnection();
    }
    res.redirect(`${clientOrigin}/settings?googleDrive=connected`);
  } catch (e) {
    res.redirect(`${clientOrigin}/settings?googleDrive=error&message=${encodeURIComponent(e.message || "Google Drive connection failed")}`);
  }
}

router.get("/google/callback", googleCallbackHandler);

router.get("/google/files", async (_req, res) => {
  try {
    res.json(await googleDrive.listBackupFiles());
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to load Google Drive backups" });
  }
});

router.get("/google/preview/:fileId", async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can preview a backup" });
  }
  try {
    const buffer = await googleDrive.downloadBackupFile(req.params.fileId);
    res.json(await getRestoreReport(buffer));
  } catch (e) {
    res.status(400).json({ error: e.message || "Could not read backup file" });
  }
});

router.post("/google/restore/:fileId", async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can restore backup" });
  }
  try {
    const buffer = await googleDrive.downloadBackupFile(req.params.fileId);
    // stripGoogleDriveAuth intentionally left at its default (false) here:
    // the admin picked this file from an already-connected Google Drive
    // account in the Drive section, so keeping that connection is the
    // expected outcome — unlike the manual-upload /restore route above,
    // nothing is being silently inherited here.
    const { beforeBackup, report } = await performRestore(buffer, req.user, parseSelectedTables(req));
    res.json({
      ok: true,
      message: "Backup restored successfully.",
      safetyBackup: beforeBackup.filename,
      report,
    });
  } catch (e) {
    if (e instanceof RestoreLockError) {
      return res.status(409).json({ error: e.message });
    }
    res.status(500).json({ error: e.message || "Restore failed" });
  }
});

router.post("/google/dry-run/:fileId", async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can preview a backup" });
  }
  try {
    const buffer = await googleDrive.downloadBackupFile(req.params.fileId);
    res.json(await getRestoreReport(buffer));
  } catch (e) {
    res.status(400).json({ error: e.message || "Could not read backup file" });
  }
});

router.post("/google/disconnect", async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can disconnect Google Drive" });
  }
  try {
    await googleDrive.disconnect();
    res.json(await googleDrive.getStatus());
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to disconnect Google Drive" });
  }
});

router.get("/restores", async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can view restore logs" });
  }
  try {
    const rows = await db.all(
      `SELECT id, event, status, "requestedByName" AS "requestedByName", "backupVersion" AS "backupVersion", "backupFormat" AS "backupFormat", report, error, "createdAt"
       FROM backup_restore_events
       ORDER BY id DESC
       LIMIT 20`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to load restore logs" });
  }
});

setInterval(() => {
  getConfig()
    .then((config) => {
      if (!config.enabled) return;
      const last = config.lastRunAt ? new Date(config.lastRunAt).getTime() : 0;
      const dueMs = (Number(config.intervalHours) || 24) * 60 * 60 * 1000;
      if (Date.now() - last < dueMs) return;
      return createBackup(config);
    })
    .catch((e) => console.error("Auto backup failed:", e.message));
}, 15 * 60 * 1000);

// Test-only hook: exposes the core backup/restore functions so
// scripts/backup-restore.test.js can exercise them directly against a
// throwaway test database, without going through HTTP/auth. Nothing here
// changes the routes above or is reachable from the network — it's just a
// property on the exported router object. See that script for the actual
// test scenarios (round-trip restore, corrupt/wrong-key rejection,
// concurrent-restore locking).
router.__test__ = {
  createBackup,
  restoreJsonBackup,
  decodeBackupToJson,
  getRestoreReport,
  performRestore,
  normalizeBackupDocument,
  BACKUP_TABLES,
  RESTORE_REQUIRED_TABLES,
  GOOGLE_DRIVE_AUTH_KEY,
};

// Exposed separately (not just reachable through the router below) so
// index.js can mount it directly on the app, ahead of the global
// requireAuth/rbac chain — see the big comment above googleCallbackHandler
// for why that's required.
router.googleCallbackHandler = googleCallbackHandler;

module.exports = router;
