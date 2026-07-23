const express = require("express");
const db = require("../db");
const { applyUserUpdate, deleteEntity, isApprovalRole, publicRequest } = require("../lib/deleteRequests");
const { recordAudit } = require("../lib/auditLog");

const router = express.Router();

router.get("/", async (req, res) => {
  if (!isApprovalRole(req.user?.role)) return res.status(403).json({ error: "Approval access required" });
  const rows = await db.all("SELECT * FROM delete_requests WHERE status = 'pending' ORDER BY id DESC");
  res.json(rows.map(publicRequest));
});

router.post("/:id/approve", async (req, res) => {
  if (!isApprovalRole(req.user?.role)) return res.status(403).json({ error: "Approval access required" });
  const id = Number(req.params.id);
  const row = await db.get("SELECT * FROM delete_requests WHERE id = $1", [id]);
  if (!row) return res.status(404).json({ error: "Request not found" });
  if (row.status !== "pending") return res.status(400).json({ error: "Request already resolved" });

  if ((row.entityType === "user-update" || row.entityType === "user-delete") && row.requestedBy === req.user?.id) {
    return res.status(403).json({ error: "Another Admin or Super Admin must approve this request" });
  }

  let ok = false;
  if (row.entityType === "user-update") {
    const payload = row.payload ? JSON.parse(row.payload) : {};
    ok = await applyUserUpdate(row.entityId, payload);
  } else {
    ok = await deleteEntity(row.entityType, row.entityId);
  }
  await db.run(
    'UPDATE delete_requests SET status = $1, "resolvedAt" = $2, "resolvedBy" = $3 WHERE id = $4',
    [ok ? "approved" : "missing", new Date().toISOString(), req.user?.id || null, id]
  );
  await recordAudit({
    action: "delete-request.approved",
    actor: req.user,
    entityType: row.entityType,
    entityId: row.entityId,
    label: `Approved ${row.entityType} delete/update: ${row.label}`,
    details: { requestedBy: row.requestedByName, applied: ok },
  });
  res.json({ ok: true, deleted: ok });
});

router.post("/:id/reject", async (req, res) => {
  if (!isApprovalRole(req.user?.role)) return res.status(403).json({ error: "Approval access required" });
  const id = Number(req.params.id);
  const row = await db.get("SELECT * FROM delete_requests WHERE id = $1", [id]);
  if (!row) return res.status(404).json({ error: "Request not found" });
  if (row.status !== "pending") return res.status(400).json({ error: "Request already resolved" });
  await db.run(
    `UPDATE delete_requests SET status = 'rejected', "resolvedAt" = $1, "resolvedBy" = $2 WHERE id = $3`,
    [new Date().toISOString(), req.user?.id || null, id]
  );
  await recordAudit({
    action: "delete-request.rejected",
    actor: req.user,
    entityType: row.entityType,
    entityId: row.entityId,
    label: `Rejected ${row.entityType} delete/update: ${row.label}`,
    details: { requestedBy: row.requestedByName },
  });
  res.json({ ok: true });
});

module.exports = router;
