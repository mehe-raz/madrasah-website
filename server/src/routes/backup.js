const express = require("express");
const path = require("path");
const fs = require("fs");
const db = require("../db");

const router = express.Router();
const dbPath = path.join(__dirname, "..", "..", "data", "madrasah.db");
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

setInterval(() => {
  const config = getConfig();
  if (!config.enabled) return;
  const last = config.lastRunAt ? new Date(config.lastRunAt).getTime() : 0;
  const dueMs = (Number(config.intervalHours) || 24) * 60 * 60 * 1000;
  if (Date.now() - last < dueMs) return;
  createBackup(config).catch((e) => console.error("Auto backup failed:", e.message));
}, 15 * 60 * 1000);

module.exports = router;
