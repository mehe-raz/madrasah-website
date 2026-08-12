// server/src/routes/deviceIngest.js
// ============================================================================
// ADMS-native, bridge-free attendance-device ingestion
// (docs/ATTENDANCE_DEVICE_CENTRALIZED_INGESTION_PLAN.md, Phase 2)
// ============================================================================
// Lets a Push/ADMS fingerprint device (see the plan doc's section 2 table —
// most budget/mid-range ZKTeco-lineage machines) point its "Server IP/Port"
// setting directly at this server, with NO local hardware-bridge/ program
// required. Understands the same iclock/ADMS request/response shapes
// hardware-bridge/index.js already implements — copied from there verbatim
// (plan doc section 3.5, "না নতুন করে অনুমান না করে"), not re-derived. The
// difference from that file is entirely in HOW a request gets routed to the
// right institution:
//
//   - routes/deviceAttendance.js (existing) is Host/subdomain-scoped: it
//     relies on middleware/tenantResolve.js having already picked the right
//     tenant schema from the request's Host header, same as any normal
//     browser/app request.
//   - This file is deviceId-scoped instead (plan doc section 3.2): many
//     cheap ADMS devices can only be configured with a raw server IP, no
//     hostname, so there's no subdomain to resolve from. Every request here
//     carries its own deviceId (the "SN" query param, ADMS convention),
//     looked up in the global, cross-tenant registry.device_registry table
//     (registryDb.js, Phase 1) to find which institution/schema it belongs
//     to — then tenantContext.run() is set up manually (the same mechanism
//     tenantResolve.js and its withTenantByCode() helper use) so every
//     db.*() call made while handling the request transparently targets
//     that institution's schema.
//
// Mounted at the bare top-level path /iclock (NOT under /api) in index.js,
// because real device firmware sends these requests to a fixed path it
// doesn't let an admin customize — the same fixed paths hardware-bridge/
// listens on. middleware/tenantResolve.js only inspects paths starting with
// "/api/", so this sits outside its Host-based routing automatically — no
// isSkippedPath() entry needed, unlike /api/platform.
//
// UNVERIFIED AGAINST REAL HARDWARE (same caveat as hardware-bridge/index.js
// and the plan doc's section 7): the exact ADMS request/response shapes
// below, and in particular how (or whether) a given device sends its
// configured "Comm Key" back on each request, are best-effort/commonly
// documented conventions, not confirmed against a specific device. If a
// real machine's handshake doesn't match, this file is the first place to
// adjust — small adjustments here are expected, per the plan doc.
// ============================================================================

const express = require("express");
const rateLimit = require("express-rate-limit");
const pg = require("../pg");
const db = require("../db");
const tenantContext = require("../tenantContext");
const registryDb = require("../registryDb");
const { recordDevicePunch } = require("../lib/devicePunch");

const router = express.Router();

// ADMS/push-protocol bodies are plain text (tab-separated punch lines), not
// JSON — same as hardware-bridge/index.js's app.use(express.text(...)).
router.use(express.text({ type: "*/*", limit: "2mb" }));

// Open to the internet, no staff/device JWT possible here (firmware can't
// send one) — rate-limited response is still plain "OK" text (never JSON),
// same "never break the device's expectation of an ack" reasoning as the
// rest of this file, via a custom handler instead of express-rate-limit's
// default JSON message.
const deviceIngestLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  handler: (req, res) => res.type("text/plain").send("OK"),
});
router.use(deviceIngestLimiter);

// Schema names only ever come from registryDb.codeToSchemaName() at
// provisioning time, but this is still double-checked before being
// interpolated into SET search_path below (identifiers can't be bind
// parameters) — same belt-and-braces pattern tenantResolve.js/
// migrateTenants.js use before doing the same thing.
const SAFE_SCHEMA_NAME = /^[a-z][a-z0-9_]*$/;

function extractDeviceId(req) {
  return (req.query.SN || req.query.sn || "").toString().trim();
}

// Every possible spelling/location a device's configured "Comm Key" might
// arrive in — see the file header's "UNVERIFIED" note. Checked in order,
// first non-empty value wins.
function extractCommKey(req) {
  return (
    req.query.commkey ||
    req.query.CommKey ||
    req.query.key ||
    req.get("x-comm-key") ||
    ""
  ).toString();
}

// Looks up the global registry entry, validates the Comm Key against it,
// and confirms the institution still has access (not suspended/expired —
// registryDb.isAccessAllowed(), the same check tenantResolve.js applies to
// every normal request). Returns { entry, institution } on success or null
// on any failure — callers always still reply "OK" either way (plan doc
// section 3.2's "punch গ্রহণের আগে ... মিলিয়ে দেখা বাধ্যতামূলক" is about
// gating the actual DB write, not the protocol-level ack) so a real device
// never gets stuck retrying against an unfamiliar error response, and an
// unauthenticated caller can't distinguish "wrong key" from "unknown
// deviceId" by the response alone.
async function authenticateIngestRequest(req) {
  const deviceId = extractDeviceId(req);
  if (!deviceId) return null;

  const entry = await registryDb.getDeviceRegistryEntry(deviceId);
  if (!entry || !entry.active) return null;
  if (!SAFE_SCHEMA_NAME.test(entry.schema_name || "")) return null;

  const commKey = extractCommKey(req);
  if (!commKey || commKey !== entry.secret_or_comm_key) return null;

  const institution = await registryDb.getInstitutionById(entry.institution_id);
  if (!institution || !registryDb.isAccessAllowed(institution)) return null;

  return { entry, institution };
}

// Runs fn() with tenantContext scoped to this device's institution — the
// same mechanism middleware/tenantResolve.js uses per-request (checks out a
// dedicated pg client, sets its search_path, runs fn() inside
// tenantContext.run() so every db.*() call transparently targets the right
// schema), reused directly here since there's no Express middleware chain
// to hook a Host-based resolution into for a deviceId-routed request.
async function withDeviceTenant({ entry, institution }, fn) {
  const client = await pg.pool.connect();
  try {
    await client.query(`SET search_path TO "${entry.schema_name}", public`);
    return await tenantContext.run({ client, institution }, fn);
  } finally {
    try {
      await client.query("SET search_path TO public");
    } catch (err) {
      console.error("Failed to reset search_path after device-ingest request:", err.message);
    } finally {
      client.release();
    }
  }
}

// Looks up the tenant-scoped attendance_devices row (needed for its numeric
// .id — attendance_logs."deviceId" FK — and .name for the audit label),
// the same shape routes/deviceAttendance.js's authenticateDevice() returns.
// Must be called from inside withDeviceTenant() so db.*() resolves to the
// right schema. Deliberately doesn't re-check the secret here (already
// checked against the global registry's mirrored copy in
// authenticateIngestRequest()) — only confirms the tenant-side row still
// exists and is active, in case it was deactivated there without the sync
// reaching the registry for some reason.
async function lookupTenantDevice(deviceId) {
  return db.get(`SELECT * FROM attendance_devices WHERE "deviceId" = $1 AND active = true`, [deviceId]);
}

// ---------------------------------------------------------------------------
// GET /iclock/cdata — device "check-in"/handshake. Doesn't touch tenant
// data, so no auth/tenant-routing needed — just acknowledges so the device
// moves on to pushing ATTLOG data, copied verbatim from
// hardware-bridge/index.js's version (same UNVERIFIED caveat applies).
// ---------------------------------------------------------------------------
router.get("/cdata", (req, res) => {
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
// WorkCode, ... (field count/order varies by device — only PIN, the first
// field, is used here, same as hardware-bridge/index.js). PIN is expected
// to be exactly what an admin typed into the student's fingerprintId field.
// identifierType is hardcoded to "fingerprint" (matches
// hardware-bridge/.env.example's IDENTIFIER_TYPE default) — a card-based
// ADMS device isn't distinguishable from this protocol alone, so isn't
// supported by this endpoint yet.
// ---------------------------------------------------------------------------
router.post("/cdata", async (req, res) => {
  const table = req.query.table || req.query.Table;
  const body = typeof req.body === "string" ? req.body : "";

  if (table === "ATTLOG" && body.trim()) {
    const lines = body.split(/\r?\n/).filter((l) => l.trim());
    const auth = await authenticateIngestRequest(req);

    if (auth) {
      await withDeviceTenant(auth, async () => {
        const device = await lookupTenantDevice(auth.entry.device_id);
        if (!device) return; // deactivated tenant-side after registry sync — skip silently
        for (const line of lines) {
          const fields = line.split("\t");
          const pin = fields[0]?.trim();
          if (!pin) continue;
          try {
            await recordDevicePunch({ device, identifier: pin, identifierType: "fingerprint" });
          } catch (err) {
            console.error(`[device-ingest] failed to record punch for pin="${pin}":`, err.message);
          }
        }
      });
    } else {
      console.warn(
        `[device-ingest] rejected ATTLOG push: unknown/unauthenticated device (SN=${req.query.SN || req.query.sn || "?"})`
      );
    }

    // Always ack "OK: <count>" even when unauthenticated — never reveals
    // the auth failure to the caller (see authenticateIngestRequest()'s
    // comment) and avoids the device retrying indefinitely against an
    // unfamiliar error response.
    return res.type("text/plain").send(`OK: ${lines.length}`);
  }

  // Other tables (OPERLOG, user-info sync, etc.) aren't needed for
  // attendance — acknowledge so the device doesn't retry indefinitely.
  res.type("text/plain").send("OK");
});

// ---------------------------------------------------------------------------
// GET /iclock/getrequest — device polls for pending remote commands. This
// endpoint never queues any, so always "no command" — copied verbatim from
// hardware-bridge/index.js's version.
// ---------------------------------------------------------------------------
router.get("/getrequest", (req, res) => {
  res.type("text/plain").send("OK");
});

// Catch-all — replies 200 defensively for any other iclock/* path a device
// might hit, so it doesn't get stuck retrying against an error, same as
// hardware-bridge/index.js's catch-all.
router.use((req, res) => {
  res.type("text/plain").send("OK");
});

module.exports = router;
