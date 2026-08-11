// hardware-bridge/index.js
// ============================================================================
// Generic fingerprint-device push bridge (docs/ATTENDANCE_DEVICE_PLAN.md,
// Phase 5) — a small, STANDALONE service, deliberately outside the main
// madrasah-website repo's npm install/build/check (see the plan doc's
// section 3 assumption: this file's own package.json/npm install is
// separate, and nothing here is touched by the main project's
// `npm run check`).
//
// WHY THIS EXISTS / WHAT IT ASSUMES — read before wiring up a real device:
// The user hadn't picked a device brand yet when this was written, so this
// targets the "push/ADMS" protocol family that a large share of budget
// fingerprint attendance devices (ZKTeco and the many OEM/clone devices
// built on the same firmware lineage) implement — NOT a specific brand's
// SDK. This is a best-effort, UNVERIFIED implementation of the commonly
// documented handshake shape:
//   GET  /iclock/cdata?SN=...              — device registers/checks in
//   POST /iclock/cdata?SN=...&table=ATTLOG — device pushes punch records
//   GET  /iclock/getrequest?SN=...         — device polls for commands
// It has NOT been tested against real hardware. Every request this bridge
// receives is logged (see logRequest() below) specifically so that once a
// real device is connected, the actual raw traffic can be compared against
// what this file expects and adjusted — check raw-requests.log first if a
// real device doesn't show punches on the kiosk.
//
// Data flow: device -> this bridge -> POST /api/device/punch on the main
// server (Phase 2's deviceAttendance.js), using the deviceId+secretKey
// pair created from the admin dashboard's device management page — same
// contract the plan doc's Phase 5 section describes.
// ============================================================================

require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");

const PORT = process.env.BRIDGE_PORT || 8090;
const API_BASE = process.env.MADRASAH_API_BASE;
const DEVICE_ID = process.env.DEVICE_ID;
const DEVICE_SECRET = process.env.DEVICE_SECRET;
const IDENTIFIER_TYPE = process.env.IDENTIFIER_TYPE || "fingerprint";

if (!API_BASE || !DEVICE_ID || !DEVICE_SECRET) {
  console.error(
    "Missing required .env values (MADRASAH_API_BASE, DEVICE_ID, DEVICE_SECRET). Copy .env.example to .env and fill them in."
  );
  process.exit(1);
}

const app = express();

// ADMS/push-protocol bodies are plain text (tab-separated punch lines), not
// JSON — accept any content-type as text so a device that sends a slightly
// different Content-Type header (some send none at all) doesn't get
// silently dropped by a stricter parser.
app.use(express.text({ type: "*/*", limit: "2mb" }));

const LOG_FILE = path.join(__dirname, "raw-requests.log");

// Every request gets logged, unmatched routes especially — this is the
// main debugging tool once a real device is connected, since its exact
// dialect may differ from what's assumed below.
function logRequest(label, req) {
  const entry = {
    time: new Date().toISOString(),
    label,
    method: req.method,
    url: req.originalUrl,
    headers: req.headers,
    body: req.body,
  };
  const line = JSON.stringify(entry);
  console.log(`[bridge] ${label} ${req.method} ${req.originalUrl}`);
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (err) {
    console.error("[bridge] failed to write raw-requests.log:", err.message);
  }
}

// Forwards one punch to the main server. Never throws — a single bad/
// unmatched record shouldn't stop the rest of a batch (a device can push
// several ATTLOG lines in one POST) or crash the bridge process, which
// needs to stay up 24/7 next to the device.
async function forwardPunch(identifier) {
  try {
    const res = await fetch(`${API_BASE}/device/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: DEVICE_ID,
        secretKey: DEVICE_SECRET,
        identifier,
        identifierType: IDENTIFIER_TYPE,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(`[bridge] punch forward rejected for identifier="${identifier}":`, res.status, data.error);
    } else {
      console.log(`[bridge] punch forwarded for identifier="${identifier}": ${data.student?.name ?? "matched"}`);
    }
  } catch (err) {
    console.error(`[bridge] punch forward failed for identifier="${identifier}":`, err.message);
  }
}

// ---------------------------------------------------------------------------
// GET /iclock/cdata — device "check-in"/handshake. Real devices send query
// params like SN=<serial>&options=all&pushver=... on first contact and
// periodically after. The reply format below is the commonly documented
// ADMS handshake shape (device-side polling interval + flags) — UNVERIFIED
// against any specific device; if the real device rejects this or keeps
// retrying the handshake instead of moving on to pushing ATTLOG data, check
// raw-requests.log for what it actually sent and adjust this response.
// ---------------------------------------------------------------------------
app.get("/iclock/cdata", (req, res) => {
  logRequest("handshake", req);
  const sn = req.query.SN || req.query.sn || "unknown";
  res.type("text/plain").send(
    [
      `GET OPTION FROM: ${sn}`,
      "Stamp=9999",
      "OpStamp=0",
      "ErrorDelay=30",
      "Delay=10",
      "TransFlag=1111111111",
      "Realtime=1",
      "Encrypt=0",
    ].join("\n")
  );
});

// ---------------------------------------------------------------------------
// POST /iclock/cdata?table=ATTLOG — the actual punch data. Body is plain
// text, one record per line, tab-separated: PIN, Time, Status, Verify,
// WorkCode, ... (field count/order varies by device — only PIN (first
// field) and Time (second field) are used here). PIN is expected to be
// exactly what an admin typed into the student's fingerprintId/cardUid
// field (Phase 1 assumption) — if punches aren't matching any student,
// double check the PIN format here (leading zeros, etc — see
// raw-requests.log) against what's stored on the student record.
// ---------------------------------------------------------------------------
app.post("/iclock/cdata", async (req, res) => {
  logRequest("attlog", req);
  const table = req.query.table || req.query.Table;
  const body = typeof req.body === "string" ? req.body : "";

  if (table === "ATTLOG" && body.trim()) {
    const lines = body.split(/\r?\n/).filter((l) => l.trim());
    for (const line of lines) {
      const fields = line.split("\t");
      const pin = fields[0]?.trim();
      if (pin) await forwardPunch(pin);
    }
    return res.type("text/plain").send(`OK: ${lines.length}`);
  }

  // Other tables (OPERLOG, user-info sync, etc.) aren't needed for
  // attendance — acknowledge so the device doesn't retry indefinitely.
  res.type("text/plain").send("OK");
});

// ---------------------------------------------------------------------------
// GET /iclock/getrequest — device polls for pending remote commands
// (e.g. "sync users"). This bridge never queues any, so always "no
// command" — still needs a 200 response, or some devices back off/retry.
// ---------------------------------------------------------------------------
app.get("/iclock/getrequest", (req, res) => {
  logRequest("getrequest", req);
  res.type("text/plain").send("OK");
});

// Catch-all — logs anything that doesn't match the routes above (a
// different URL shape than expected is the most likely first surprise
// from a real device) and replies 200 defensively so the device doesn't
// get stuck retrying against an error.
app.use((req, res) => {
  logRequest("unmatched", req);
  res.type("text/plain").send("OK");
});

app.listen(PORT, () => {
  console.log(`[bridge] listening on port ${PORT}, forwarding to ${API_BASE}/device/punch as device ${DEVICE_ID}`);
});
