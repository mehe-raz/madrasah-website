// server/src/routes/attendanceDevices.js
// ============================================================================
// Admin-facing device management (docs/ATTENDANCE_DEVICE_PLAN.md, Phase 2)
// ============================================================================
// Mounted inside the normal authenticated /api chain in index.js (unlike
// routes/deviceAttendance.js, which is the device's own public-facing
// endpoint) — an Admin/Hostel Manager adds a device here and gets back its
// generated secretKey once, then hands that to whoever configures the
// hardware bridge/agent (Phase 5). Reuses the existing "attendance"
// permission (config/roles.js) rather than a new permission bucket — same
// role tier that already manages daily attendance.
// ============================================================================

const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { validate } = require("../middleware/validate");
const {
  attendanceDeviceCreateSchema,
  attendanceDeviceUpdateSchema,
} = require("../lib/opsSchemas");
const { recordAudit } = require("../lib/auditLog");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in
// index.js — same pattern as routes/attendance.js.
router.use(requirePermission("attendance"));

function generateSecret() {
  return crypto.randomBytes(24).toString("hex");
}

// secretKey deliberately excluded here — only ever returned once, at
// creation (POST /) or on explicit regeneration, same "shown once" pattern
// as an API key. Listing devices never re-exposes an existing secret.
router.get("/", async (req, res) => {
  const rows = await db.all(
    `SELECT id, "deviceId", name, location, active, "createdAt"
     FROM attendance_devices ORDER BY "createdAt" DESC`
  );
  res.json(rows);
});

router.post("/", validate(attendanceDeviceCreateSchema), async (req, res) => {
  const { deviceId, name, location } = req.body;
  const secretKey = generateSecret();

  let row;
  try {
    row = await db.get(
      `INSERT INTO attendance_devices ("deviceId", "secretKey", name, location, active, "createdAt")
       VALUES ($1, $2, $3, $4, true, $5)
       RETURNING id, "deviceId", name, location, active, "createdAt"`,
      [deviceId, secretKey, name, location, new Date().toISOString()]
    );
  } catch (err) {
    // attendance_devices_device_id_unique (Phase 1 schema) — same
    // "translate the DB's own uniqueness error into a clean 409" pattern
    // used for payments_receipt_unique elsewhere in this codebase.
    if (err.code === "23505") {
      return res.status(409).json({ error: "এই ডিভাইস আইডি ইতিমধ্যে ব্যবহৃত হচ্ছে" });
    }
    throw err;
  }

  await recordAudit({
    action: "attendanceDevice.created",
    actor: req.user,
    entityType: "attendance_devices",
    entityId: row.id,
    label: `নতুন হাজিরা ডিভাইস যোগ: ${row.deviceId}`,
  });

  res.status(201).json({ ...row, secretKey });
});

router.put("/:id", validate(attendanceDeviceUpdateSchema), async (req, res) => {
  const { name, location, active } = req.body;
  const row = await db.get(
    `UPDATE attendance_devices
     SET name = COALESCE($1, name),
         location = COALESCE($2, location),
         active = COALESCE($3, active)
     WHERE id = $4
     RETURNING id, "deviceId", name, location, active`,
    [name ?? null, location ?? null, active ?? null, req.params.id]
  );
  if (!row) return res.status(404).json({ error: "ডিভাইস খুঁজে পাওয়া যায়নি" });
  res.json(row);
});

router.post("/:id/regenerate-secret", async (req, res) => {
  const secretKey = generateSecret();
  const row = await db.get(
    `UPDATE attendance_devices SET "secretKey" = $1 WHERE id = $2
     RETURNING id, "deviceId"`,
    [secretKey, req.params.id]
  );
  if (!row) return res.status(404).json({ error: "ডিভাইস খুঁজে পাওয়া যায়নি" });

  await recordAudit({
    action: "attendanceDevice.secretRegenerated",
    actor: req.user,
    entityType: "attendance_devices",
    entityId: row.id,
    label: `ডিভাইস সিক্রেট রিজেনারেট: ${row.deviceId}`,
  });

  res.json({ id: row.id, deviceId: row.deviceId, secretKey });
});

module.exports = router;
