const express = require("express");
const path = require("path");
const fs = require("fs");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const googleDrive = require("../lib/googleDrive");
const backupEncryption = require("../lib/backupEncryption");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
// (Every route below additionally requires Super Admin specifically — backup
// data includes password hashes and full financial records, so the broader
// "settings" permission that Admin also holds isn't enough on its own.)
router.use(requirePermission("settings"));
router.use(requireSuperAdmin);
const backupDir = path.join(__dirname, "..", "..", "backups");
const CONFIG_KEY = "backupConfig";

function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Login required" });
  if (req.user.role !== "Super Admin") return res.status(403).json({ error: "Only Super Admin can access backup" });
  return next();
}

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
  for (const table of BACKUP_TABLES) {
    tables[table] = await db.all(`SELECT * FROM ${table}`);
  }
  return {
    version: 1,
    format: "madrasah-pg-json",
    exportedAt: new Date().toISOString(),
    tables,
  };
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
  if (!data?.tables?.users || !data?.tables?.students || !data?.tables?.settings) {
    throw new Error("Invalid madrasah backup file");
  }

  await db.withTransaction(async (tx) => {
    for (const table of [...BACKUP_TABLES].reverse()) {
      await tx.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
    }
    for (const table of BACKUP_TABLES) {
      const rows = data.tables[table] || [];
      for (const row of rows) {
        const cols = Object.keys(row);
        const values = Object.values(row);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        const quotedCols = cols.map((c) => `"${c}"`).join(", ");
        await tx.run(`INSERT INTO ${table} (${quotedCols}) VALUES (${placeholders})`, values);
      }
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
    res.json(await createBackup());
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

// Counts rows per table in a backup file WITHOUT touching the database, so
// the UI can show "this will replace X students / Y income rows / ..." and
// let the Super Admin confirm before anything is actually restored.
async function previewBackup(buffer) {
  const data = decodeBackupToJson(buffer);
  if (!data?.tables) throw new Error("Invalid madrasah backup file");
  const backupCounts = {};
  const currentCounts = {};
  for (const table of BACKUP_TABLES) {
    backupCounts[table] = Array.isArray(data.tables[table]) ? data.tables[table].length : 0;
    const row = await db.get(`SELECT COUNT(*)::int AS c FROM ${table}`);
    currentCounts[table] = row?.c || 0;
  }
  return { exportedAt: data.exportedAt || null, backupCounts, currentCounts };
}

// Shared by both "upload a file" restore and "pick a Drive backup" restore:
// takes the raw backup bytes, restores it, and always takes a safety backup
// first so a bad restore can be undone.
async function performRestore(buffer) {
  const data = decodeBackupToJson(buffer);
  const beforeBackup = await createBackup();
  await restoreJsonBackup(data);
  return beforeBackup;
}

router.post("/preview", express.raw({ type: ["application/octet-stream", "application/json"], limit: "100mb" }), async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can preview a backup" });
  }
  if (!req.body?.length) return res.status(400).json({ error: "Backup file required" });
  try {
    res.json(await previewBackup(req.body));
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
    const beforeBackup = await performRestore(req.body);
    res.json({
      ok: true,
      message: "Backup restored successfully.",
      safetyBackup: beforeBackup.filename,
    });
  } catch (e) {
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
    res.json(await previewBackup(buffer));
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
    const beforeBackup = await performRestore(buffer);
    res.json({
      ok: true,
      message: "Backup restored successfully.",
      safetyBackup: beforeBackup.filename,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Restore failed" });
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

module.exports = router;
