const express = require("express");
const db = require("../db");

const router = express.Router();

async function getAllSettings() {
  const rows = await db.all("SELECT key, value FROM settings");
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

router.get("/", async (_req, res) => {
  res.json(await getAllSettings());
});

router.put("/", async (req, res) => {
  await db.withTransaction(async (tx) => {
    for (const [k, v] of Object.entries(req.body)) {
      await tx.run(
        "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [k, String(v)]
      );
    }
  });
  res.json(await getAllSettings());
});

module.exports = router;
