// server/src/routes/cameraEvents.js
// ============================================================================
// Camera-bridge event ingestion API (docs/CCTV_INTEGRATION_PLAN.md, Phase 3)
// ============================================================================
// Mounted in index.js at /api/camera-bridge, in the same spot as
// /api/device (routes/deviceAttendance.js) — after tenantResolve (so a
// bridge's request, hitting the institution's own subdomain/Host like any
// browser request, is scoped to that institution's schema automatically)
// but before the staff requireAuth/rbac chain, since the bridge machine
// (Phase 5, outside this repo) has no staff JWT to send. It authenticates
// itself with its own deviceId+secretKey pair (camera_bridges table,
// Phase 1 schema) instead, via authenticateBridge() below — same shape as
// deviceAttendance.js's authenticateDevice().
//
// One endpoint:
//   POST /event — a single Frigate detection (motion/human/vehicle),
//   forwarded by the bridge machine. Testable without any real camera —
//   curl/Postman with a fake { deviceId, secretKey, cameraId, type,
//   detectedAt } body, per the plan doc's own Phase 3 test note.
// ============================================================================

const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { validate } = require("../middleware/validate");
const { cameraEventSchema } = require("../lib/cameraSchemas");
const { createNotification } = require("../lib/notifications");
const adminPush = require("../lib/adminPush");

const router = express.Router();

// Same 60/min ceiling as deviceAttendance.js's devicePunchLimiter — one
// bridge machine forwarding Frigate events for several cameras at once is
// a comparable traffic shape to a busy gate.
const cameraEventLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { error: "একটু পরে আবার চেষ্টা করুন" },
});

// Cooldown window for notifications on the SAME camera — per the plan
// doc's §৩ assumption ("একই ক্যামেরায় ৫ মিনিটের মধ্যে বারবার ইভেন্ট এলে
// cooldown"). Only suppresses the push/in-app notification; the event
// itself is always recorded in camera_events regardless, so the Phase 8
// timeline never loses an event.
const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;

// secretKey is a server-generated random token (routes/cameras.js's
// crypto.randomBytes), not a user-chosen password — plain equality is
// enough, same reasoning as deviceAttendance.js's authenticateDevice().
async function authenticateBridge(deviceId, secretKey) {
  const bridge = await db.get(
    `SELECT * FROM camera_bridges WHERE "deviceId" = $1 AND active = true`,
    [deviceId]
  );
  if (!bridge || bridge.secretKey !== secretKey) return null;
  return bridge;
}

router.post(
  "/event",
  cameraEventLimiter,
  validate(cameraEventSchema),
  async (req, res) => {
    const { deviceId, secretKey, cameraId, type, detectedAt, clipPath } =
      req.body;

    const bridge = await authenticateBridge(deviceId, secretKey);
    if (!bridge) {
      return res.status(401).json({ error: "ব্রিজ শনাক্ত করা যায়নি" });
    }

    // Confirm the camera actually belongs to THIS bridge (not just that
    // it exists) — otherwise a bridge with valid credentials could forward
    // events tagged with another bridge's camera id.
    const camera = await db.get(
      `SELECT id, name FROM cameras WHERE id = $1 AND "bridgeDeviceId" = $2 AND active = true`,
      [cameraId, deviceId]
    );
    if (!camera) {
      return res
        .status(400)
        .json({ error: "এই bridge-এর অধীনে এই ক্যামেরা পাওয়া যায়নি" });
    }

    // Cooldown check happens BEFORE the insert, against whatever the most
    // recent event on this camera already was — the new row is written
    // either way right after.
    const lastEvent = await db.get(
      `SELECT "detectedAt" FROM camera_events WHERE "cameraId" = $1 ORDER BY "detectedAt" DESC LIMIT 1`,
      [camera.id]
    );
    let shouldNotify = true;
    if (lastEvent) {
      const lastMs = Date.parse(lastEvent.detectedAt);
      const newMs = Date.parse(detectedAt);
      if (
        !Number.isNaN(lastMs) &&
        !Number.isNaN(newMs) &&
        newMs - lastMs < NOTIFY_COOLDOWN_MS
      ) {
        shouldNotify = false;
      }
    }

    const row = await db.get(
      `INSERT INTO camera_events ("cameraId", type, "detectedAt", "clipPath", acknowledged, "createdAt")
       VALUES ($1, $2, $3, $4, false, $5)
       RETURNING *`,
      [camera.id, type, detectedAt, clipPath || null, new Date().toISOString()]
    );

    if (shouldNotify) {
      const typeLabelBn =
        type === "human" ? "মানুষ" : type === "vehicle" ? "গাড়ি" : "মোশন";
      const title = `${camera.name} — ${typeLabelBn} শনাক্ত হয়েছে`;
      const body = `ক্যামেরা "${camera.name}"-এ সম্প্রতি ${typeLabelBn} শনাক্ত হয়েছে।`;

      // In-app bell (lib/notifications.js) — never throws, own try/catch
      // inside createNotification().
      await createNotification({
        type: "camera_event",
        title,
        body,
        entityType: "camera_event",
        entityId: row.id,
        link: "/cameras",
        targetRoles: ["Admin", "Super Admin"],
      });

      // Push (lib/adminPush.js) — reuses the existing admin/Super-Admin
      // push infra built for backup alerts (routes/backup.js), per the
      // plan doc's §৩ note to extend an existing function rather than
      // invent a new "notifyDirectors()". Wrapped separately so a push
      // failure never blocks the response or the in-app notification
      // above (notifyByRole() itself is also internally never-throwing,
      // but the extra guard costs nothing and matches backup.js's own
      // pattern).
      try {
        await adminPush.notifyByRole(["Admin", "Super Admin"], {
          title,
          body,
          url: "/cameras",
        });
      } catch (e) {
        console.error("cameraEvents: push notification failed:", e.message);
      }
    }

    res.status(201).json({ ok: true, id: row.id, notified: shouldNotify });
  }
);

module.exports = router;
