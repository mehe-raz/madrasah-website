// server/src/lib/cameraStreamAuth.js
//
// docs/CCTV_INTEGRATION_PLAN.md, Phase 4 — shared between the two halves of
// the live-view stream proxy so they can't drift apart:
//   - routes/cameras.js's GET /:id/stream-url SIGNS a token with these
//     constants (staff-authenticated, requires "cameras" permission).
//   - routes/cameraStream.js VERIFIES it (public route, no staff cookie —
//     see that file's header comment for why).
//
// Kept as its own tiny module rather than duplicating the purpose string/
// TTL number in both route files, or importing one route file from the
// other.

const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../middleware/auth");

const STREAM_TOKEN_PURPOSE = "camera-stream";

// Seconds. Short-lived by design ("সাময়িক URL" per the plan doc) — a
// leaked/copied link stops working quickly on its own, independent of
// whether the issuing staff session is still valid. A live-view page is
// expected to re-request a fresh stream-url before this expires if the
// viewer keeps watching (same refresh pattern as any presigned URL).
const STREAM_TOKEN_TTL = 10 * 60; // 10 minutes

// Verifies signature + shape + purpose, and that the token was issued for
// THIS camera specifically (a token for camera 5 must not play camera 7's
// stream). Returns the decoded payload on success, null on any failure —
// callers just check truthiness, matching decodeState()'s style in
// lib/googleDrive.js.
function verifyStreamToken(token, cameraId) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.purpose !== STREAM_TOKEN_PURPOSE) return null;
    if (Number(payload.cameraId) !== Number(cameraId)) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { STREAM_TOKEN_PURPOSE, STREAM_TOKEN_TTL, verifyStreamToken };
