const express = require("express");
const db = require("../db");
const { applyUserUpdate, deleteEntity, isApprovalRole, publicRequest } = require("../lib/deleteRequests");

const router = express.Router();

router.get("/", (req, res) => {
  if (!isApprovalRole(req.user?.role)) return res.status(403).json({ error: "Approval access required" });
  const rows = db
    .prepare("SELECT * FROM delete_requests WHERE status = 'pending' ORDER BY id DESC")
    .all();
  res.json(rows.map(publicRequest));
});

router.post("/:id/approve", (req, res) => {
  if (!isApprovalRole(req.user?.role)) return res.status(403).json({ error: "Approval access required" });
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM delete_requests WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Request not found" });
  if (row.status !== "pending") return res.status(400).json({ error: "Request already resolved" });

  if ((row.entityType === "user-update" || row.entityType === "user-delete") && row.requestedBy === req.user?.id) {
    return res.status(403).json({ error: "Another Admin or Super Admin must approve this request" });
  }

  let ok = false;
  if (row.entityType === "user-update") {
    const payload = row.payload ? JSON.parse(row.payload) : {};
    ok = applyUserUpdate(row.entityId, payload);
  } else {
    ok = deleteEntity(row.entityType, row.entityId);
  }
  db.prepare(
    "UPDATE delete_requests SET status = ?, resolvedAt = ?, resolvedBy = ? WHERE id = ?"
  ).run(ok ? "approved" : "missing", new Date().toISOString(), req.user?.id || null, id);
  res.json({ ok: true, deleted: ok });
});

router.post("/:id/reject", (req, res) => {
  if (!isApprovalRole(req.user?.role)) return res.status(403).json({ error: "Approval access required" });
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM delete_requests WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Request not found" });
  if (row.status !== "pending") return res.status(400).json({ error: "Request already resolved" });
  db.prepare(
    "UPDATE delete_requests SET status = 'rejected', resolvedAt = ?, resolvedBy = ? WHERE id = ?"
  ).run(new Date().toISOString(), req.user?.id || null, id);
  res.json({ ok: true });
});

module.exports = router;
