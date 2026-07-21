const express = require("express");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
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
const backupDir = path.join(__dirname, "..", "..", "backups");
const CONFIG_KEY = "backupConfig";

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

async function runPgDump(outputPath) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not configured");
  return new Promise((resolve, reject) => {
    const child = spawn("pg_dump", ["--no-owner", "--no-acl", process.env.DATABASE_URL], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    const errors = [];
    child.stdout.on("data", (d) => chunks.push(d));
    child.stderr.on("data", (d) => errors.push(d));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(errors).toString("utf8") || `pg_dump exited with code ${code}`));
        return;
      }
      fs.writeFileSync(outputPath, Buffer.concat(chunks));
      resolve(outputPath);
    });
  });
}

async function createBackup(config = null) {
  const activeConfig = config || (await getConfig());
  ensureDir(backupDir);
  const time = stamp();
  const jsonFilename = `madrasah-backup-${time}.json`;
  const sqlFilename = `madrasah-backup-${time}.sql`;
  const jsonPath = path.join(backupDir, jsonFilename);
  const sqlPath = path.join(backupDir, sqlFilename);

  const snapshot = await exportJsonBackup();
  fs.writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2));

  let filename = jsonFilename;
  let localPath = jsonPath;
  let format = "json";

  try {
    await runPgDump(sqlPath);
    filename = sqlFilename;
    localPath = sqlPath;
    format = "sql";
  } catch (err) {
    console.warn("pg_dump unavailable, using JSON backup:", err.message);
  }

  activeConfig.destinations
    .map((d) => String(d || "").trim())
    .filter(Boolean)
    .forEach((dest) => {
      ensureDir(dest);
      fs.copyFileSync(localPath, path.join(dest, filename));
      if (format === "sql" && fs.existsSync(jsonPath)) {
        fs.copyFileSync(jsonPath, path.join(dest, jsonFilename));
      }
    });

  const copies = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith("madrasah-backup-") && (f.endsWith(".json") || f.endsWith(".sql")))
    .sort()
    .reverse();
  copies.slice(activeConfig.keepLocalCopies).forEach((f) => fs.unlinkSync(path.join(backupDir, f)));

  let tempEncPath = null;
  try {
    const mimeType = format === "sql" ? "application/sql" : "application/json";
    let uploadPath = localPath;
    let uploadFilename = filename;
    let uploadMimeType = mimeType;

    if (backupEncryption.isConfigured()) {
      tempEncPath = `${localPath}.enc`;
      backupEncryption.encryptFile(localPath, tempEncPath);
      uploadPath = tempEncPath;
      uploadFilename = `${filename}.enc`;
      uploadMimeType = "application/octet-stream";
    } else {
      console.warn(
        "BACKUP_ENCRYPTION_KEY is not set — backups uploaded to Google Drive will be plain, readable JSON/SQL."
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
  return { filename, localPath, format, config: saved };
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

async function restoreSqlBackup(buffer) {
  // IMPORTANT: pg_dump output can contain psql-only meta-commands
  // (\restrict / \unrestrict on PostgreSQL 17+) and COPY ... FROM stdin
  // blocks, neither of which the generic `pg` client can execute via
  // client.query(). Those must go through the actual psql binary, the
  // same way pg_dump is spawned as a subprocess for backups.
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not configured");

  return new Promise((resolve, reject) => {
    const child = spawn("psql", [process.env.DATABASE_URL, "--set", "ON_ERROR_STOP=1"], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (d) => stdout.push(d));
    child.stderr.on("data", (d) => stderr.push(d));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8") || `psql exited with code ${code}`));
        return;
      }
      resolve();
    });

    child.stdin.write(buffer);
    child.stdin.end();
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

// Shared by both "upload a file" restore and "pick a Drive backup" restore:
// takes the raw backup bytes, detects JSON vs SQL, restores it, and always
// takes a safety backup first so a bad restore can be undone.
async function performRestore(buffer) {
  ensureDir(backupDir);
  const time = stamp();
  const tempPath = path.join(backupDir, `restore-upload-${time}.bin`);

  fs.writeFileSync(tempPath, buffer);
  try {
    let plain = buffer;
    let text = plain.toString("utf8");

    // An encrypted backup (see lib/backupEncryption.js) is binary and won't
    // match either marker below, whether it arrived via the "restore from
    // Drive" button or was manually re-uploaded as a .enc file someone
    // downloaded from the Drive folder. Try decrypting first so both paths
    // restore the same way a plain backup does.
    if (
      !text.trimStart().startsWith("{") &&
      !text.includes("PostgreSQL database dump") &&
      !text.includes("CREATE TABLE") &&
      backupEncryption.isConfigured()
    ) {
      try {
        plain = backupEncryption.decryptBuffer(buffer);
        text = plain.toString("utf8");
      } catch {
        // Not an encrypted backup either — fall through to the
        // "Unsupported backup format" error below with the original bytes.
      }
    }

    const beforeBackup = await createBackup();

    if (text.trimStart().startsWith("{")) {
      const data = JSON.parse(text);
      await restoreJsonBackup(data);
    } else if (text.includes("PostgreSQL database dump") || text.includes("CREATE TABLE")) {
      await restoreSqlBackup(plain);
    } else {
      throw new Error("Unsupported backup format. Upload JSON or pg_dump SQL.");
    }

    fs.unlinkSync(tempPath);
    return beforeBackup;
  } catch (e) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw e;
  }
}

router.post("/restore", express.raw({ type: ["application/octet-stream", "application/json"], limit: "100mb" }), async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can restore backup" });
  }
  if (!req.body?.length) return res.status(400).json({ error: "Backup file required" });

  try {
    const beforeBackup = await performRestore(req.body);
    res.json({
      ok: true,
      message: "Backup restored. Server restarting.",
      safetyBackup: beforeBackup.filename,
    });
    setTimeout(() => process.exit(0), 300);
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

router.post("/google/restore/:fileId", async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can restore backup" });
  }
  try {
    const buffer = await googleDrive.downloadBackupFile(req.params.fileId);
    const beforeBackup = await performRestore(buffer);
    res.json({
      ok: true,
      message: "Backup restored. Server restarting.",
      safetyBackup: beforeBackup.filename,
    });
    setTimeout(() => process.exit(0), 300);
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
