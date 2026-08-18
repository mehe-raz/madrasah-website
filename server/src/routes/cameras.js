// server/src/routes/cameras.js
//
// docs/CCTV_INTEGRATION_PLAN.md, Phase 2 — Admin-facing camera bridge +
// camera management CRUD. Mounted at /api/cameras in index.js.
//
// Route layout:
//   Bridges (the local machine running Frigate/MediaMTX):
//     GET    /bridges              — list all bridges
//     POST   /bridges              — add a bridge (returns secretKey once)
//     PATCH  /bridges/:id          — update name/location/active
//     POST   /bridges/:id/regen-key — regenerate secretKey (shown once)
//   Cameras (individual RTSP sources on a bridge):
//     GET    /                     — list all cameras
//     POST   /                     — add a camera
//     PATCH  /:id                  — update camera fields / active toggle
//
// No hard DELETE on either resource — active toggle only. camera_events rows
// reference cameras which reference bridges; hard-deleting either would
// orphan history rows silently. If a genuine delete need arises later, add
// it as a separate task.
//
// secretKey is generated server-side (48 hex chars, same as
// attendanceDevices.js) and returned ONLY at creation or explicit regen —
// never re-exposed by GET. Whoever sets up the bridge machine copies it
// into the bridge's .env once.

const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { validate } = require("../middleware/validate");
const { recordAudit } = require("../lib/auditLog");
const {
  cameraBridgeCreateSchema,
  cameraBridgeUpdateSchema,
  cameraCreateSchema,
  cameraUpdateSchema,
} = require("../lib/cameraSchemas");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js
// — same pattern as routes/staff.js, routes/shifts.js.
router.use(requirePermission("cameras"));

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateSecret() {
  // 48 hex chars — same length as attendanceDevices.js (randomBytes(24))
  return crypto.randomBytes(24).toString("hex");
}

// Columns returned from camera_bridges on every list/detail call.
// secretKey intentionally excluded — only returned at creation or regen.
const BRIDGE_COLS =
  'id, "deviceId", name, location, active, "createdAt"';

// Columns returned from cameras on every list/detail call.
const CAMERA_COLS =
  'id, name, location, "bridgeDeviceId", "streamPath", active, "createdAt"';

// Check that a bridgeDeviceId actually points at an active bridge row
// before saving a camera — surfaces as a clean 400 instead of an FK
// violation 500. Same "check first" pattern as assertUserExists in staff.js.
async function assertBridgeExists(bridgeDeviceId) {
  const bridge = await db.get(
    `SELECT id FROM camera_bridges WHERE "deviceId" = $1`,
    [bridgeDeviceId]
  );
  if (!bridge) {
    const err = new Error(
      "নির্বাচিত camera bridge পাওয়া যায়নি — আগে একটা bridge যোগ করুন"
    );
    err.status = 400;
    throw err;
  }
}

// ── Camera Bridge routes ──────────────────────────────────────────────────────

// GET /bridges — list all bridges (secretKey never included)
router.get("/bridges", async (req, res) => {
  const rows = await db.all(
    `SELECT ${BRIDGE_COLS} FROM camera_bridges ORDER BY "createdAt" DESC`
  );
  res.json(rows);
});

// POST /bridges — create a new bridge; secretKey returned once here only
router.post("/bridges", validate(cameraBridgeCreateSchema), async (req, res) => {
  const { deviceId, name, location } = req.body;
  const secretKey = generateSecret();

  let row;
  try {
    row = await db.get(
      `INSERT INTO camera_bridges ("deviceId", "secretKey", name, location, active, "createdAt")
       VALUES ($1, $2, $3, $4, true, $5)
       RETURNING ${BRIDGE_COLS}`,
      [deviceId, secretKey, name, location || "", new Date().toISOString()]
    );
  } catch (e) {
    // Unique violation on deviceId
    if (e.message && e.message.includes("unique")) {
      return res
        .status(409)
        .json({ error: `ডিভাইস আইডি "${deviceId}" ইতিমধ্যে ব্যবহৃত হচ্ছে` });
    }
    throw e;
  }

  await recordAudit({
    action: "camera_bridge.created",
    actor: req.user,
    entityType: "camera_bridge",
    entityId: row.id,
    label: `নতুন camera bridge যোগ: ${row.deviceId} (${row.name})`,
    details: { deviceId: row.deviceId, location: row.location },
  });

  // Return row + secretKey together — this is the only time the caller
  // sees secretKey. Same pattern as attendanceDevices.js POST.
  res.status(201).json({ ...row, secretKey });
});

// PATCH /bridges/:id — update name, location, or active toggle
router.patch(
  "/bridges/:id",
  validate(cameraBridgeUpdateSchema),
  async (req, res) => {
    const id = Number(req.params.id);
    const existing = await db.get(
      "SELECT * FROM camera_bridges WHERE id = $1",
      [id]
    );
    if (!existing) {
      return res.status(404).json({ error: "Camera bridge পাওয়া যায়নি" });
    }

    const { name, location, active } = req.body;
    const sets = [];
    const params = [];
    function set(col, value) {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    }

    if (name !== undefined) set("name", name);
    if (location !== undefined) set("location", location);
    if (active !== undefined) set("active", active);

    if (sets.length > 0) {
      params.push(id);
      await db.run(
        `UPDATE camera_bridges SET ${sets.join(", ")} WHERE id = $${params.length}`,
        params
      );
    }

    const row = await db.get(
      `SELECT ${BRIDGE_COLS} FROM camera_bridges WHERE id = $1`,
      [id]
    );
    await recordAudit({
      action: "camera_bridge.updated",
      actor: req.user,
      entityType: "camera_bridge",
      entityId: id,
      label: `Camera bridge আপডেট: ${row.deviceId}`,
      details: { fields: Object.keys(req.body) },
    });
    res.json(row);
  }
);

// POST /bridges/:id/regen-key — regenerate secretKey; returned once here only.
// Useful if the bridge machine is compromised or the key is lost. Same
// "explicit regen" pattern as attendanceDevices.js.
router.post("/bridges/:id/regen-key", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get(
    `SELECT id, "deviceId" FROM camera_bridges WHERE id = $1`,
    [id]
  );
  if (!existing) {
    return res.status(404).json({ error: "Camera bridge পাওয়া যায়নি" });
  }

  const secretKey = generateSecret();
  await db.run(
    `UPDATE camera_bridges SET "secretKey" = $1 WHERE id = $2`,
    [secretKey, id]
  );

  await recordAudit({
    action: "camera_bridge.key_regenerated",
    actor: req.user,
    entityType: "camera_bridge",
    entityId: id,
    label: `Camera bridge secretKey পুনরায় তৈরি: ${existing.deviceId}`,
    details: {},
  });

  res.json({ id, deviceId: existing.deviceId, secretKey });
});

// ── Camera routes ─────────────────────────────────────────────────────────────

// GET / — list all cameras (optionally filtered by bridgeDeviceId)
router.get("/", async (req, res) => {
  const { bridgeDeviceId } = req.query;
  let sql = `SELECT ${CAMERA_COLS} FROM cameras`;
  const params = [];

  if (bridgeDeviceId) {
    params.push(bridgeDeviceId);
    sql += ` WHERE "bridgeDeviceId" = $1`;
  }

  sql += ` ORDER BY "createdAt" DESC`;
  const rows = await db.all(sql, params);
  res.json(rows);
});

// POST / — add a new camera
router.post("/", validate(cameraCreateSchema), async (req, res) => {
  const { name, location, bridgeDeviceId, streamPath } = req.body;

  try {
    await assertBridgeExists(bridgeDeviceId);
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    throw e;
  }

  const row = await db.get(
    `INSERT INTO cameras (name, location, "bridgeDeviceId", "streamPath", active, "createdAt")
     VALUES ($1, $2, $3, $4, true, $5)
     RETURNING ${CAMERA_COLS}`,
    [name, location || "", bridgeDeviceId, streamPath, new Date().toISOString()]
  );

  await recordAudit({
    action: "camera.created",
    actor: req.user,
    entityType: "camera",
    entityId: row.id,
    label: `নতুন ক্যামেরা যোগ: ${row.name} (bridge: ${row.bridgeDeviceId})`,
    details: { bridgeDeviceId: row.bridgeDeviceId, streamPath: row.streamPath },
  });

  res.status(201).json(row);
});

// PATCH /:id — update camera fields or active toggle
router.patch("/:id", validate(cameraUpdateSchema), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get("SELECT * FROM cameras WHERE id = $1", [id]);
  if (!existing) {
    return res.status(404).json({ error: "ক্যামেরা পাওয়া যায়নি" });
  }

  const { name, location, bridgeDeviceId, streamPath, active } = req.body;

  // If bridgeDeviceId is being changed, confirm the new bridge exists
  if (bridgeDeviceId !== undefined) {
    try {
      await assertBridgeExists(bridgeDeviceId);
    } catch (e) {
      if (e.status === 400) return res.status(400).json({ error: e.message });
      throw e;
    }
  }

  const sets = [];
  const params = [];
  function set(col, value) {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  }

  if (name !== undefined) set("name", name);
  if (location !== undefined) set("location", location);
  if (bridgeDeviceId !== undefined) set('"bridgeDeviceId"', bridgeDeviceId);
  if (streamPath !== undefined) set('"streamPath"', streamPath);
  if (active !== undefined) set("active", active);

  if (sets.length > 0) {
    params.push(id);
    await db.run(
      `UPDATE cameras SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params
    );
  }

  const row = await db.get(
    `SELECT ${CAMERA_COLS} FROM cameras WHERE id = $1`,
    [id]
  );
  await recordAudit({
    action: "camera.updated",
    actor: req.user,
    entityType: "camera",
    entityId: id,
    label: `ক্যামেরা আপডেট: ${row.name}`,
    details: { fields: Object.keys(req.body) },
  });
  res.json(row);
});

module.exports = router;
