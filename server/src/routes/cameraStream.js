// server/src/routes/cameraStream.js
// ============================================================================
// Live-view stream proxy (docs/CCTV_INTEGRATION_PLAN.md, Phase 4)
// ============================================================================
// Mounted in index.js at /api/camera-stream, in the same spot as
// /api/camera-bridge and /api/device — after tenantResolve, before the
// staff requireAuth/rbac chain, because the caller here is a <video>/hls.js
// element, not a fetch() call carrying the staff login cookie. It
// authenticates each request with its own short-lived signed token
// (routes/cameras.js's GET /:id/stream-url issues it; lib/cameraStreamAuth.js
// verifies it here) instead.
//
// Two routes, deliberately NOT a single wildcard route (Express 5 changed
// wildcard/splat syntax and this repo has no prior example of it to copy —
// sticking to plain named params keeps this on well-trodden ground):
//   GET /:cameraId/index.m3u8   — the HLS playlist
//   GET /:cameraId/:segment      — one .ts/.m4s segment referenced by it
//
// What this hides: the bridge's real tunnel URL (Cloudflare Tunnel/
// Tailscale address) never reaches the browser — every request the client
// makes stays on this app's own domain; this route fetches from the real
// address server-side and streams the bytes back. The playlist's segment
// lines are rewritten to point back through this same proxy (with the
// token re-attached) rather than at the bridge directly, so segment
// requests get the same treatment as the playlist itself.
//
// Testable without a real camera only if a test RTSP source is fed into a
// real MediaMTX instance somewhere reachable — see the plan doc's Phase 4
// note. Cannot be verified with a fake/curl body the way Phase 3's event
// route could.
// ============================================================================

const express = require("express");
const db = require("../db");
const { verifyStreamToken } = require("../lib/cameraStreamAuth");

const router = express.Router();

// Looks up the camera + its bridge's tunnelUrl fresh on every request
// (not just at token-issue time) — if an Admin deactivates the camera or
// bridge, or clears the tunnel URL, while a token is still technically
// unexpired, playback stops immediately instead of waiting out the token's
// remaining TTL.
async function resolveStreamBase(cameraId) {
  const camera = await db.get(
    `SELECT id, "bridgeDeviceId", "streamPath" FROM cameras WHERE id = $1 AND active = true`,
    [cameraId]
  );
  if (!camera || !camera.streamPath || !camera.bridgeDeviceId) return null;

  const bridge = await db.get(
    `SELECT "tunnelUrl" FROM camera_bridges WHERE "deviceId" = $1 AND active = true`,
    [camera.bridgeDeviceId]
  );
  if (!bridge || !bridge.tunnelUrl) return null;

  // Same convention as cameraSchemas.js's cameraCreateSchema comment:
  // http://<bridge-tunnel>/<streamPath>/index.m3u8
  const base = bridge.tunnelUrl.replace(/\/+$/, "");
  const streamPath = camera.streamPath.replace(/^\/+/, "").replace(/\/+$/, "");
  return `${base}/${streamPath}`;
}

// Rewrites an HLS playlist's segment references so the player keeps hitting
// THIS proxy (with the token re-attached) instead of the real bridge URL
// that MediaMTX itself would otherwise emit. Leaves #-comment/tag lines and
// blank lines untouched; only non-empty, non-comment lines (segment
// filenames) get the token query string appended.
function rewritePlaylist(text, cameraId, token) {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const sep = trimmed.includes("?") ? "&" : "?";
      return `${trimmed}${sep}token=${token}`;
    })
    .join("\n");
}

async function proxySegment(req, res, cameraId, filename) {
  const token = req.query.token;
  if (!token || !verifyStreamToken(token, cameraId)) {
    return res.status(401).json({ error: "স্ট্রিম টোকেন অবৈধ বা মেয়াদোত্তীর্ণ" });
  }

  const base = await resolveStreamBase(cameraId);
  if (!base) {
    return res
      .status(400)
      .json({ error: "এই ক্যামেরার স্ট্রিম এখন উপলব্ধ নয়" });
  }

  let upstream;
  try {
    upstream = await fetch(`${base}/${filename}`);
  } catch (e) {
    console.error("cameraStream: upstream fetch failed:", e.message);
    return res.status(502).json({ error: "ক্যামেরা bridge-এ পৌঁছানো যায়নি" });
  }

  if (!upstream.ok) {
    return res.status(upstream.status).json({ error: "স্ট্রিম পাওয়া যায়নি" });
  }

  const isPlaylist = filename.endsWith(".m3u8");
  res.set(
    "Content-Type",
    isPlaylist ? "application/vnd.apple.mpegurl" : upstream.headers.get("content-type") || "application/octet-stream"
  );
  // Live HLS content changes constantly — never let a browser/CDN cache it.
  res.set("Cache-Control", "no-store");

  if (isPlaylist) {
    const text = await upstream.text();
    return res.send(rewritePlaylist(text, cameraId, token));
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  res.send(buf);
}

router.get("/:cameraId/index.m3u8", async (req, res) => {
  const cameraId = Number(req.params.cameraId);
  await proxySegment(req, res, cameraId, "index.m3u8");
});

router.get("/:cameraId/:segment", async (req, res) => {
  const cameraId = Number(req.params.cameraId);
  // Only plausible HLS segment filenames — not a general-purpose open
  // proxy for arbitrary paths on the bridge.
  if (!/^[a-zA-Z0-9_-]+\.(ts|m4s)$/.test(req.params.segment)) {
    return res.status(404).json({ error: "পাওয়া যায়নি" });
  }
  await proxySegment(req, res, cameraId, req.params.segment);
});

module.exports = router;
