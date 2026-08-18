// server/src/lib/cameraSchemas.js
//
// docs/CCTV_INTEGRATION_PLAN.md, Phase 2 — Zod schemas for routes/cameras.js.
// Same split as shiftSchemas.js/staffSchemas.js: shape/type only here;
// business rules that need a DB lookup (e.g. "this bridgeDeviceId actually
// exists") stay in the route handler.

const { z } = require("zod");

// ── Camera Bridges ───────────────────────────────────────────────────────────
//
// "deviceId" is a human-readable slug chosen by the Admin (e.g.
// "main-building-bridge"), not an auto-generated UUID — same convention as
// attendance_devices.deviceId. It must be unique; uniqueness is enforced
// by the DB unique constraint, not here. secretKey is generated server-side
// (never sent by the client) — see routes/cameras.js.

const cameraBridgeCreateSchema = z.object({
  deviceId: z
    .string()
    .trim()
    .min(2, "ডিভাইস আইডি কমপক্ষে ২ অক্ষরের হতে হবে")
    .max(60)
    // Only URL-safe characters — this value ends up in API paths and
    // config files on the bridge machine, so spaces/special chars would
    // cause friction there even if the DB accepts them.
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "ডিভাইস আইডিতে শুধু a-z, A-Z, 0-9, _ এবং - ব্যবহার করা যাবে"
    ),
  name: z.string().trim().min(1, "নাম আবশ্যক").max(100),
  location: z.string().trim().max(200).optional().default(""),
});

// PATCH: every field optional (partial update) + active toggle.
// No hard DELETE (active toggle only — same reasoning as staff.js/shifts.js:
// camera_events rows reference cameras which reference bridges; orphaning
// those via a hard delete would break history).
const cameraBridgeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  location: z.string().trim().max(200).optional(),
  active: z.boolean().optional(),
});

// ── Cameras ──────────────────────────────────────────────────────────────────
//
// "bridgeDeviceId" is the text deviceId of the camera_bridge this camera
// belongs to (real FK in the DB on camera_bridges."deviceId"). "streamPath"
// is the MediaMTX stream identifier for this camera (e.g. "cam1" or
// "entrance") — MediaMTX uses this to build the HLS URL:
// http://<bridge-tunnel>/<streamPath>/index.m3u8

const cameraCreateSchema = z.object({
  name: z.string().trim().min(1, "নাম আবশ্যক").max(100),
  location: z.string().trim().max(200).optional().default(""),
  bridgeDeviceId: z
    .string()
    .trim()
    .min(1, "bridge ডিভাইস আইডি আবশ্যক")
    .max(60),
  streamPath: z
    .string()
    .trim()
    .min(1, "স্ট্রিম পাথ আবশ্যক")
    .max(100)
    // Same URL-safe restriction as cameraBridgeCreateSchema.deviceId —
    // this value becomes part of the HLS URL path on the bridge.
    .regex(
      /^[a-zA-Z0-9_/-]+$/,
      "স্ট্রিম পাথে শুধু a-z, A-Z, 0-9, _, / এবং - ব্যবহার করা যাবে"
    ),
});

const cameraUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  location: z.string().trim().max(200).optional(),
  bridgeDeviceId: z.string().trim().min(1).max(60).optional(),
  streamPath: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_/-]+$/)
    .optional(),
  active: z.boolean().optional(),
});

// ── Camera Events (Phase 3) ─────────────────────────────────────────────────
//
// Body sent by the camera-bridge machine (Phase 5, outside this repo) to
// POST /api/camera-bridge/event whenever Frigate reports a detection.
// deviceId/secretKey authenticate the bridge itself (same shape as
// devicePunchSchema in opsSchemas.js — the bridge has no staff JWT).
// cameraId is the numeric id of a `cameras` row (not the text streamPath —
// see routes/cameraEvents.js for why), which is what the bridge's own
// config maps its local camera names to when it's set up in Phase 5.
//
// CAMERA_EVENT_TYPES is exported for reuse (e.g. a future UI filter) — the
// camera_events.type column itself stays plain text at the DB level (see
// that table's schema comment), this enum is where the actual validation
// lives, per this file's own header note.
const CAMERA_EVENT_TYPES = ["motion", "human", "vehicle"];

const cameraEventSchema = z.object({
  deviceId: z.string().trim().min(1, "ডিভাইস আইডি আবশ্যক").max(100),
  secretKey: z.string().trim().min(1, "সিক্রেট কী আবশ্যক").max(200),
  cameraId: z.coerce.number().int().positive(),
  type: z.enum(CAMERA_EVENT_TYPES),
  // ISO datetime string — kept as a validated non-empty string rather than
  // z.coerce.date(), matching this project's project-wide "timestamps are
  // text" convention (see camera_events schema comment in
  // supabase_schema.sql).
  detectedAt: z.string().trim().min(1, "detectedAt আবশ্যক").max(40),
  clipPath: z.string().trim().max(500).optional(),
});

module.exports = {
  cameraBridgeCreateSchema,
  cameraBridgeUpdateSchema,
  cameraCreateSchema,
  cameraUpdateSchema,
  cameraEventSchema,
  CAMERA_EVENT_TYPES,
};
