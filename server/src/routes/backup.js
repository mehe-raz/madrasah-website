const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();
const dbPath = path.join(__dirname, "..", "..", "data", "madrasah.db");

router.get("/", (_req, res) => {
  if (!fs.existsSync(dbPath)) return res.status(404).json({ error: "Database not found" });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  res.download(dbPath, `madrasah-backup-${stamp}.db`);
});

module.exports = router;
