const express = require("express");
const db = require("../db");

const router = express.Router();

function getAllSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

router.get("/", (_req, res) => {
  res.json(getAllSettings());
});

router.put("/", (req, res) => {
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  const tx = db.transaction((obj) => Object.entries(obj).forEach(([k, v]) => upsert.run(k, String(v))));
  tx(req.body);
  res.json(getAllSettings());
});

module.exports = router;
