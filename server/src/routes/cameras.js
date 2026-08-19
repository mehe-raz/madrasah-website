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
const jwt = require("jsonwebtoken");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { validate } = require("../middleware/validate");
const { recordAudit } = require("../lib/auditLog");
const { JWT_SECRET } = require("../middleware/auth");
const {
  cameraBridgeCreateSchema,
  cameraBridgeUpdateSchema,
  cameraCreateSchema,
  cameraUpdateSchema,
} = require("../lib/cameraSchemas");
const { STREAM_TOKEN_PURPOSE, STREAM_TOKEN_TTL } = require("../lib/cameraStreamAuth");

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
// tunnelUrl IS included here (Phase 4) — unlike secretKey it isn't a
// credential by itself (viewing it needs the same "cameras" permission as
// everything else in this router), just the address the stream-url route
// below reads to build a proxied link.
const BRIDGE_COLS =
  'id, "deviceId", name, location, "tunnelUrl", active, "createdAt"';

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
  const { deviceId, name, location, tunnelUrl } = req.body;
  const secretKey = generateSecret();

  let row;
  try {
    row = await db.get(
      `INSERT INTO camera_bridges ("deviceId", "secretKey", name, location, "tunnelUrl", active, "createdAt")
       VALUES ($1, $2, $3, $4, $5, true, $6)
       RETURNING ${BRIDGE_COLS}`,
      [deviceId, secretKey, name, location || "", tunnelUrl || "", new Date().toISOString()]
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

    const { name, location, active, tunnelUrl } = req.body;
    const sets = [];
    const params = [];
    function set(col, value) {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    }

    if (name !== undefined) set("name", name);
    if (location !== undefined) set("location", location);
    if (active !== undefined) set("active", active);
    if (tunnelUrl !== undefined) set('"tunnelUrl"', tunnelUrl);

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

// GET /:id/stream-url — docs/CCTV_INTEGRATION_PLAN.md Phase 4.
// Looks up this camera's bridge tunnel URL + streamPath and returns a
// short-lived signed URL pointing at the proxy route in
// routes/cameraStream.js (mounted publicly at /api/camera-stream), NOT the
// bridge's actual tunnel URL — a client with "cameras" permission never
// sees the real bridge address, only this app's own domain.
//
// The token is self-contained (verified independently of the staff login
// cookie) rather than relying on requireAuth on the proxy route itself,
// because the consumer is a <video>/hls.js element, and hls.js does not
// send cookies by default (its XHR wrapper needs an explicit
// `xhrSetup`/`withCredentials` override to do that) — a bearer token in
// the URL works with zero extra client-side config, same principle as an
// S3/CloudFront presigned URL.
router.get("/:id/stream-url", async (req, res) => {
  const id = Number(req.params.id);
  const camera = await db.get(
    `SELECT id, "bridgeDeviceId", "streamPath" FROM cameras WHERE id = $1 AND active = true`,
    [id]
  );
  if (!camera) {
    return res.status(404).json({ error: "ক্যামেরা পাওয়া যায়নি" });
  }
  if (!camera.streamPath) {
    return res
      .status(400)
      .json({ error: "এই ক্যামেরার স্ট্রিম পাথ সেট করা নেই" });
  }

  const bridge = camera.bridgeDeviceId
    ? await db.get(
        `SELECT "tunnelUrl" FROM camera_bridges WHERE "deviceId" = $1 AND active = true`,
        [camera.bridgeDeviceId]
      )
    : null;
  if (!bridge) {
    return res
      .status(400)
      .json({ error: "এই ক্যামেরার bridge সংযুক্ত নেই বা নিষ্ক্রিয়" });
  }
  if (!bridge.tunnelUrl) {
    return res.status(400).json({
      error: "এই bridge-এর Tunnel URL এখনও সেট করা হয়নি — আগে সেট করুন",
    });
  }

  const token = jwt.sign(
    { cameraId: camera.id, purpose: STREAM_TOKEN_PURPOSE },
    JWT_SECRET,
    { expiresIn: STREAM_TOKEN_TTL }
  );

  // Relative path — same origin as the rest of the API, works behind
  // whatever domain/tunnel this app itself is already served from.
  res.json({
    streamUrl: `/api/camera-stream/${camera.id}/index.m3u8?token=${token}`,
    expiresIn: STREAM_TOKEN_TTL,
  });
});

// ── Camera Events routes (Phase 8) ───────────────────────────────────────────
//
// GET  /events         — paginated list, newest first, optional ?cameraId filter
//                        and ?unacknowledgedOnly=true for the notification badge.
// PATCH /events/:id/acknowledge — flip acknowledged=true; idempotent (already-
//                        acknowledged rows just return 200 without a second audit
//                        write, same as staff.js's active-toggle pattern).

// Columns returned on every events query. camera name is joined in so the
// UI can show "Main Gate — human" without a separate request per event.
const EVENT_COLS = `
  e.id,
  e."cameraId",
  c.name AS "cameraName",
  c.location AS "cameraLocation",
  e.type,
  e."detectedAt",
  e."clipPath",
  e.acknowledged,
  e."createdAt"
`.trim();

// GET /events — list camera events, newest first.
// Query params:
//   cameraId          — filter to a single camera (integer)
//   unacknowledgedOnly — "true" → only rows where acknowledged = false
//   limit              — max rows returned (default 50, max 200)
// No cursor/offset pagination: the UI shows the last N events in a timeline;
// infinite scroll is out of scope for Phase 8.
router.get("/events", async (req, res) => {
  const { cameraId, unacknowledgedOnly, limit: limitParam } = req.query;

  const limit = Math.min(Number.isFinite(Number(limitParam)) ? Number(limitParam) : 50, 200);

  const conditions = [];
  const params = [];

  if (cameraId) {
    params.push(Number(cameraId));
    conditions.push(`e."cameraId" = $${params.length}`);
  }

  if (unacknowledgedOnly === "true") {
    conditions.push("e.acknowledged = false");
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(limit);
  const rows = await db.all(
    `SELECT ${EVENT_COLS}
     FROM camera_events e
     LEFT JOIN cameras c ON c.id = e."cameraId"
     ${where}
     ORDER BY e."detectedAt" DESC
     LIMIT $${params.length}`,
    params
  );

  res.json(rows);
});

// PATCH /events/:id/acknowledge — mark one event as seen.
// Idempotent: already-acknowledged rows return 200 with the existing row,
// no audit write (nothing actually changed), matching the active-toggle
// pattern in staff.js and shifts.js.
router.patch("/events/:id/acknowledge", async (req, res) => {
  const id = Number(req.params.id);

  const existing = await db.get(
    `SELECT ${EVENT_COLS}
     FROM camera_events e
     LEFT JOIN cameras c ON c.id = e."cameraId"
     WHERE e.id = $1`,
    [id]
  );
  if (!existing) {
    return res.status(404).json({ error: "ইভেন্ট পাওয়া যায়নি" });
  }

  if (!existing.acknowledged) {
    await db.run(
      `UPDATE camera_events SET acknowledged = true WHERE id = $1`,
      [id]
    );
    await recordAudit({
      action: "camera_event.acknowledged",
      actor: req.user,
      entityType: "camera_event",
      entityId: id,
      label: `Camera event acknowledge: ${existing.cameraName ?? "unknown"} (${existing.type})`,
      details: { cameraId: existing.cameraId, type: existing.type, detectedAt: existing.detectedAt },
    });
  }

  const row = await db.get(
    `SELECT ${EVENT_COLS}
     FROM camera_events e
     LEFT JOIN cameras c ON c.id = e."cameraId"
     WHERE e.id = $1`,
    [id]
  );
  res.json(row);
});


module.exports = router;
