const express = require("express");
const path = require("path");
const fs = require("fs");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const googleDrive = require("../lib/googleDrive");
const backupEncryption = require("../lib/backupEncryption");
const { withRestoreLock, RestoreLockError } = require("../lib/restoreLock");
const { recordBackupEvent } = require("../lib/backupAudit");
const { recordAudit } = require("../lib/auditLog");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
// (Every route below additionally requires Super Admin specifically — backup
// data includes password hashes and full financial records, so the broader
// "settings" permission that Admin also holds isn't enough on its own.)
router.use(requirePermission("settings"));
const backupDir = path.join(__dirname, "..", "..", "backups");
const CONFIG_KEY = "backupConfig";
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
    destinations: ["", "", ""],
    lastRunAt: "",
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

  let tempEncPath = null;
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
  } catch (err) {
    // Google Drive upload is best-effort, same as the local folder destinations above:
    // a failed upload should never block the backup itself from completing.
    console.warn("Google Drive backup upload failed:", err.message);
  } finally {
    if (tempEncPath && fs.existsSync(tempEncPath)) fs.unlinkSync(tempEncPath);
  }

  const saved = await saveConfig({ ...activeConfig, lastRunAt: new Date().toISOString() });
  return { filename, localPath, format: "json", config: saved };
}

async function restoreJsonBackup(data) {
  const { data: backup, version, warnings } = normalizeBackupDocument(data);
  const tablesToRestore = BACKUP_TABLES.filter((table) => Array.isArray(backup.tables[table]));

  return await db.withTransaction(async (tx) => {
    const beforeCounts = await getCounts(tx, tablesToRestore);

    for (const table of [...tablesToRestore].reverse()) {
      await tx.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
    }

    const inserted = {};
    for (const table of tablesToRestore) {
      const rows = backup.tables[table] || [];
      const allowedColumns = await getTableColumns(tx, table);
      inserted[table] = 0;
      for (const row of rows) {
        const cleaned = toRestoreRow(row, allowedColumns);
        const cols = Object.keys(cleaned);
        if (!cols.length) continue;
        const values = cols.map((col) => cleaned[col]);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        const quotedCols = cols.map((c) => `"${c}"`).join(", ");
        await tx.run(`INSERT INTO ${table} (${quotedCols}) VALUES (${placeholders})`, values);
        inserted[table] += 1;
      }
    }

    const afterCounts = await getCounts(tx, tablesToRestore);
    const report = {
      version,
      format: backup.format || BACKUP_FORMAT,
      exportedAt: backup.exportedAt || null,
      warnings,
      beforeCounts,
      afterCounts,
      restoredRows: inserted,
      tables: tablesToRestore,
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

async function performRestore(buffer, user = null) {
  return await withRestoreLock(async () => {
    const beforeBackup = await createBackup();
    try {
      const report = await restoreJsonBackup(decodeBackupToJson(buffer));
      await recordBackupEvent({ event: 'restore', status: 'success', user, backupVersion: report.version, backupFormat: report.format, report: { ...report, safetyBackup: beforeBackup.filename } });
      await recordAudit({
        action: "backup.restored",
        actor: user,
        entityType: "backup",
        entityId: 0,
        label: `Restored backup (v${report.version}, safety copy: ${beforeBackup.filename})`,
        details: { restoredRows: report.restoredRows, warnings: report.warnings },
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
    const { beforeBackup, report } = await performRestore(req.body, req.user);
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
    res.json({ url: googleDrive.getAuthUrl(req.user.id) });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to start Google Drive connection" });
  }
});

// Google redirects the browser here after the user approves/denies access.
// This is a top-level navigation (not a fetch), so auth relies on the
// "token" cookie rather than an Authorization header.
router.get("/google/callback", async (req, res) => {
  const clientOrigin =
    (process.env.CLIENT_ORIGIN || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)[0] || "/";
  const { code, state, error } = req.query;

  try {
    if (error) throw new Error(String(error));
    if (req.user?.role !== "Super Admin") throw new Error("Only Super Admin can connect Google Drive");
    if (!code || !state) throw new Error("Missing Google authorization code");
    await googleDrive.handleCallback(String(code), String(state), req.user.id);
    res.redirect(`${clientOrigin}/settings?googleDrive=connected`);
  } catch (e) {
    res.redirect(`${clientOrigin}/settings?googleDrive=error&message=${encodeURIComponent(e.message || "Google Drive connection failed")}`);
  }
});

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
    const { beforeBackup, report } = await performRestore(buffer, req.user);
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
};

module.exports = router;
