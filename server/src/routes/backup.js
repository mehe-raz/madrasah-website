const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const db = require("../db");

const router = express.Router();
const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "madrasah.db");
const backupDir = path.join(__dirname, "..", "..", "backups");
const CONFIG_KEY = "backupConfig";

function defaultConfig() {
  return {
    enabled: false,
    intervalHours: 24,
    keepLocalCopies: 14,
    destinations: ["", "", ""],
    lastRunAt: "",
  };
}

function getConfig() {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(CONFIG_KEY);
  if (!row) return defaultConfig();
  try {
    return { ...defaultConfig(), ...JSON.parse(row.value) };
  } catch {
    return defaultConfig();
  }
}

function saveConfig(config) {
  const clean = {
    ...defaultConfig(),
    ...config,
    intervalHours: Math.max(1, Number(config.intervalHours) || 24),
    keepLocalCopies: Math.max(1, Number(config.keepLocalCopies) || 14),
    destinations: Array.isArray(config.destinations) ? config.destinations.slice(0, 3) : ["", "", ""],
  };
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(CONFIG_KEY, JSON.stringify(clean));
  return clean;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function createBackup(config = getConfig()) {
  if (!fs.existsSync(dbPath)) throw new Error("Database not found");
  ensureDir(backupDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `madrasah-backup-${stamp}.db`;
  const localPath = path.join(backupDir, filename);

  await db.backup(localPath);

  config.destinations
    .map((d) => String(d || "").trim())
    .filter(Boolean)
    .forEach((dest) => {
      ensureDir(dest);
      fs.copyFileSync(localPath, path.join(dest, filename));
    });

  const copies = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith("madrasah-backup-") && f.endsWith(".db"))
    .sort()
    .reverse();
  copies.slice(config.keepLocalCopies).forEach((f) => fs.unlinkSync(path.join(backupDir, f)));

  const saved = saveConfig({ ...config, lastRunAt: new Date().toISOString() });
  return { filename, localPath, config: saved };
}

router.get("/", (_req, res) => {
  if (!fs.existsSync(dbPath)) return res.status(404).json({ error: "Database not found" });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  res.download(dbPath, `madrasah-backup-${stamp}.db`);
});

router.get("/config", (_req, res) => {
  res.json(getConfig());
});

router.put("/config", (req, res) => {
  res.json(saveConfig(req.body || {}));
});

router.post("/run", async (_req, res) => {
  try {
    res.json(await createBackup());
  } catch (e) {
    res.status(500).json({ error: e.message || "Backup failed" });
  }
});

router.post("/restore", express.raw({ type: "application/octet-stream", limit: "100mb" }), async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can restore backup" });
  }
  if (!req.body?.length) return res.status(400).json({ error: "Backup file required" });

  ensureDir(dataDir);
  ensureDir(backupDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const tempPath = path.join(backupDir, `restore-upload-${stamp}.db`);
  const currentBackupPath = path.join(backupDir, `before-restore-${stamp}.db`);

  try {
    fs.writeFileSync(tempPath, req.body);
    const uploaded = new Database(tempPath, { readonly: true });
    const tables = uploaded.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
    uploaded.close();
    if (!tables.includes("users") || !tables.includes("students") || !tables.includes("settings")) {
      fs.unlinkSync(tempPath);
      return res.status(400).json({ error: "Invalid madrasah backup file" });
    }

    if (fs.existsSync(dbPath)) await db.backup(currentBackupPath);
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
    fs.copyFileSync(tempPath, dbPath);
    [dbPath + "-wal", dbPath + "-shm"].forEach((file) => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
    fs.unlinkSync(tempPath);
    res.json({ ok: true, message: "Backup restored. Server restarting." });
    setTimeout(() => process.exit(0), 300);
  } catch (e) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    res.status(500).json({ error: e.message || "Restore failed" });
  }
});

setInterval(() => {
  const config = getConfig();
  if (!config.enabled) return;
  const last = config.lastRunAt ? new Date(config.lastRunAt).getTime() : 0;
  const dueMs = (Number(config.intervalHours) || 24) * 60 * 60 * 1000;
  if (Date.now() - last < dueMs) return;
  createBackup(config).catch((e) => console.error("Auto backup failed:", e.message));
}, 15 * 60 * 1000);

module.exports = router;
