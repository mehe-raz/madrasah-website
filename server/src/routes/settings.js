const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("settings"));

async function getAllSettings() {
  const rows = await db.all("SELECT key, value FROM settings");
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// Keys this generic endpoint is allowed to write. Previously it wrote
// whatever keys were in req.body with no whitelist — since "settings" and
// "backupConfig" live in the same key/value table, that meant this route
// could silently overwrite backupConfig with an unvalidated value, bypassing
// the number-clamping and destination-path checks in routes/backup.js
// saveConfig(). backupConfig now has to go through that route instead.
const ALLOWED_KEYS = new Set(["name", "address", "phone", "email", "footer", "logo", "lang", "theme", "currency"]);

router.get("/", async (_req, res) => {
  res.json(await getAllSettings());
});

router.put("/", async (req, res) => {
  await db.withTransaction(async (tx) => {
    for (const [k, v] of Object.entries(req.body)) {
      if (!ALLOWED_KEYS.has(k)) continue;
      await tx.run(
        "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [k, String(v)]
      );
    }
  });
  res.json(await getAllSettings());
});

module.exports = router;
