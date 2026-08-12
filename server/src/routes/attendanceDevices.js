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
const tenantContext = require("../tenantContext");
const registryDb = require("../registryDb");

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
    `SELECT id, "deviceId", name, location, active, protocol, "createdAt"
     FROM attendance_devices ORDER BY "createdAt" DESC`
  );
  res.json(rows);
});

// docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md, Phase 2C — staff-
// authenticated (this router's "attendance" permission, applied above),
// deliberately separate from the public GET /device/latest-punch/:deviceId
// in routes/deviceAttendance.js. That kiosk-facing endpoint never exposes
// a raw fingerprintId/cardUid (only matched student info), so a random
// kiosk poller can't "listen in" on another student's scan; this one does
// expose it, but only to an authenticated staff member with the
// "attendance" permission, for the student-enrollment flow in
// Students.tsx (Phase 2B's fingerprintId/cardUid fields). Uses the
// numeric attendance_devices.id, same as PUT/regenerate-secret above (not
// the string deviceId, which is what deviceAttendance.js's public
// endpoints key on).
router.get("/:id/latest-scan", async (req, res) => {
  const log = await db.get(
    `SELECT "punchAt", identifier
     FROM attendance_logs
     WHERE "deviceId" = $1
     ORDER BY "punchAt" DESC
     LIMIT 1`,
    [req.params.id]
  );
  if (!log) return res.json({ punchAt: null, identifier: null });
  res.json({ punchAt: log.punchAt, identifier: log.identifier });
});

router.post("/", validate(attendanceDeviceCreateSchema), async (req, res) => {
  const { deviceId, name, location, protocol } = req.body;
  const secretKey = generateSecret();

  let row;
  try {
    row = await db.get(
      `INSERT INTO attendance_devices ("deviceId", "secretKey", name, location, active, protocol, "createdAt")
       VALUES ($1, $2, $3, $4, true, $5, $6)
       RETURNING id, "deviceId", name, location, active, protocol, "createdAt"`,
      [deviceId, secretKey, name, location, protocol, new Date().toISOString()]
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

  // docs/ATTENDANCE_DEVICE_CENTRALIZED_INGESTION_PLAN.md, Phase 1 — also
  // register this deviceId in the cross-tenant global registry, so a
  // bridge-free Push/ADMS request (which only carries a raw deviceId, no
  // subdomain to resolve the tenant from) can later be routed back to this
  // institution/schema. Only applies in multi-tenant mode — single-tenant
  // deployments have no institution to register against (same "no
  // institution in context -> skip" reasoning as middleware/planGate.js).
  const institution = tenantContext.get()?.institution;
  if (institution) {
    try {
      await registryDb.registerDevice({
        deviceId: row.deviceId,
        institutionId: institution.id,
        schemaName: institution.schema_name,
        secretOrCommKey: secretKey,
        protocol: row.protocol,
      });
    } catch (err) {
      // deviceId is globally unique in the registry (stricter than the
      // per-tenant unique index this tenant-side insert just satisfied) —
      // roll back the tenant-side row so the two stores never disagree
      // about whether this deviceId exists here.
      await db.run(`DELETE FROM attendance_devices WHERE id = $1`, [row.id]);
      if (err.status === 409) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
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
     RETURNING id, "deviceId", name, location, active, protocol`,
    [name ?? null, location ?? null, active ?? null, req.params.id]
  );
  if (!row) return res.status(404).json({ error: "ডিভাইস খুঁজে পাওয়া যায়নি" });

  // Keep the global registry's active flag in sync (Phase 1) — a
  // deactivated device must stop being routable via deviceId lookup too.
  // No-op if this device was never registered globally (see
  // registryDb.updateDeviceRegistryActive's comment).
  if (tenantContext.get()?.institution && active !== undefined && active !== null) {
    await registryDb.updateDeviceRegistryActive(row.deviceId, row.active);
  }

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

  // Same sync reasoning as PUT above — the global registry's
  // secret_or_comm_key must match the tenant-side secretKey it mirrors.
  if (tenantContext.get()?.institution) {
    await registryDb.updateDeviceRegistrySecret(row.deviceId, secretKey);
  }

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
