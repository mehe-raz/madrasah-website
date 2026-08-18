// camera-bridge/index.js
// ============================================================================
// Frigate MQTT → madrasah-website camera-event bridge (docs/CCTV_INTEGRATION_PLAN.md,
// Phase 5) — a small, STANDALONE service, deliberately outside the main
// madrasah-website repo's npm install/build/check (same pattern as
// hardware-bridge/, see that folder's own header comment for the precedent).
//
// WHY THIS EXISTS: Frigate (running on the institution's local bridge
// machine, alongside MediaMTX + Mosquitto via the docker-compose.yml this
// feature ships with) publishes a detection event as JSON on the MQTT
// topic "frigate/events" every time it sees motion/a person/a vehicle.
// This bridge subscribes to that topic and forwards each NEW detection to
// this project's Phase 3 endpoint, POST /api/camera-bridge/event, using
// the deviceId+secretKey pair created from the admin dashboard's camera
// bridge management page — same deviceId+secretKey contract
// hardware-bridge uses for attendance, just a different camera_bridges
// table on the server side.
//
// Frigate's frigate/events payload shape (documented at
// docs.frigate.video/integrations/mqtt) is UNVERIFIED against a real
// Frigate instance in this sandbox — no camera/Frigate install was
// available while this was written (see the plan doc's Phase 5 warning).
// Every raw MQTT message this bridge receives is logged to
// raw-events.log specifically so that once a real Frigate instance is
// running, the actual payload shape can be compared against what this
// file expects and adjusted if needed.
//
// Data flow: Frigate -> Mosquitto (MQTT broker) -> this bridge ->
// POST /api/camera-bridge/event on the main server (Phase 3's
// cameraEvents.js), which itself handles the 5-minute per-camera
// notification cooldown — this bridge does NOT need its own cooldown
// logic, it forwards every "new" detection and lets the server decide.
// ============================================================================

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Same BASE_DIR trick as hardware-bridge/index.js — lets this also run as a
// packaged .exe later (see package.json's "build" script) without .env/log
// files ending up inside the read-only pkg snapshot. No effect on the
// plain `npm start` path (process.pkg is undefined there).
// ---------------------------------------------------------------------------
const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;

require("dotenv").config({ path: path.join(BASE_DIR, ".env") });

const mqtt = require("mqtt");

const API_BASE = (process.env.MADRASAH_API_BASE || "").trim();
const DEVICE_ID = (process.env.DEVICE_ID || "").trim();
const DEVICE_SECRET = (process.env.DEVICE_SECRET || "").trim();
const MQTT_BROKER_URL = (process.env.MQTT_BROKER_URL || "mqtt://127.0.0.1:1883").trim();
const MQTT_USERNAME = (process.env.MQTT_USERNAME || "").trim();
const MQTT_PASSWORD = (process.env.MQTT_PASSWORD || "").trim();
const CAMERA_MAP_RAW = (process.env.CAMERA_MAP || "").trim();
const FRIGATE_URL = (process.env.FRIGATE_URL || "").trim().replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// Per-variable, bilingual startup validation — same approach as
// hardware-bridge/index.js's Phase 3A fix, so a non-technical admin sees
// exactly which .env line is the problem instead of one generic message.
// ---------------------------------------------------------------------------
const PLACEHOLDER_VALUES = new Set([
  "https://your-domain.com/api",
  "replace-with-the-deviceid-you-created",
  "replace-with-the-secretkey-you-were-shown-once",
  "replace-with-your-camera-name-to-id-pairs",
]);

const REQUIRED_VARS = [
  {
    key: "MADRASAH_API_BASE",
    value: API_BASE,
    bn: "MADRASAH_API_BASE (আপনার মূল ওয়েবসাইটের API ঠিকানা) খালি অথবা .env.example-এর নমুনা মান রয়ে গেছে।",
    en: "MADRASAH_API_BASE (your main website's API URL) is blank or still the sample value.",
  },
  {
    key: "DEVICE_ID",
    value: DEVICE_ID,
    bn: "DEVICE_ID খালি অথবা নমুনা মান রয়ে গেছে — অ্যাডমিন ড্যাশবোর্ডের ক্যামেরা পেজ থেকে একটা bridge তৈরি করে সেই deviceId এখানে বসান।",
    en: "DEVICE_ID is blank or still the sample value — create a camera bridge from the admin dashboard's Cameras page and paste its deviceId here.",
  },
  {
    key: "DEVICE_SECRET",
    value: DEVICE_SECRET,
    bn: "DEVICE_SECRET খালি অথবা নমুনা মান রয়ে গেছে — bridge তৈরির সময় একবারই দেখানো secretKey এখানে বসান (হারিয়ে ফেললে ড্যাশবোর্ড থেকে regenerate করা যায়)।",
    en: "DEVICE_SECRET is blank or still the sample value — paste the secretKey shown once when the bridge was created (regenerate it from the dashboard if lost).",
  },
  {
    key: "CAMERA_MAP",
    value: CAMERA_MAP_RAW,
    bn: "CAMERA_MAP খালি অথবা নমুনা মান রয়ে গেছে — অন্তত একটা \"frigate-এর ক্যামেরা-নাম:ড্যাশবোর্ডের ক্যামেরা-আইডি\" জোড়া দিতে হবে।",
    en: "CAMERA_MAP is blank or still the sample value — at least one \"frigate-camera-name:dashboard-camera-id\" pair is required.",
  },
];

const missing = REQUIRED_VARS.filter(
  (v) => !v.value || PLACEHOLDER_VALUES.has(v.value.toLowerCase())
);

if (missing.length > 0) {
  console.error("\n[camera-bridge] থামানো হলো — .env ফাইলে কিছু তথ্য অসম্পূর্ণ / Stopped — .env is incomplete:\n");
  for (const v of missing) {
    console.error(`  • ${v.key}`);
    console.error(`    বাংলা: ${v.bn}`);
    console.error(`    English: ${v.en}\n`);
  }
  console.error(
    "প্রথমবার হলে: .env.example ফাইলটা কপি করে নাম দিন .env, তারপর উপরের মানগুলো বসান।\n" +
      "First time setup: copy .env.example to .env, then fill in the values above.\n"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CAMERA_MAP parsing — "frigateName:id,frigateName2:id2" -> { frigateName: id }.
// A malformed pair (missing colon, non-numeric id) is skipped with a loud
// warning rather than silently dropped or guessed — a wrong mapping would
// mean events get attributed to the wrong camera on the dashboard.
// ---------------------------------------------------------------------------
const CAMERA_MAP = {};
for (const pair of CAMERA_MAP_RAW.split(",")) {
  const trimmed = pair.trim();
  if (!trimmed) continue;
  const idx = trimmed.lastIndexOf(":");
  if (idx === -1) {
    console.warn(`[camera-bridge] ⚠ CAMERA_MAP-এ ভুল ফরম্যাট, উপেক্ষা করা হলো / malformed CAMERA_MAP entry, skipped: "${trimmed}"`);
    continue;
  }
  const frigateName = trimmed.slice(0, idx).trim();
  const cameraId = Number(trimmed.slice(idx + 1).trim());
  if (!frigateName || !Number.isInteger(cameraId) || cameraId <= 0) {
    console.warn(`[camera-bridge] ⚠ CAMERA_MAP-এ ভুল ফরম্যাট, উপেক্ষা করা হলো / malformed CAMERA_MAP entry, skipped: "${trimmed}"`);
    continue;
  }
  CAMERA_MAP[frigateName] = cameraId;
}

if (Object.keys(CAMERA_MAP).length === 0) {
  console.error("[camera-bridge] থামানো হলো — CAMERA_MAP থেকে একটাও বৈধ ক্যামেরা পাওয়া যায়নি / Stopped — no valid camera found in CAMERA_MAP.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Frigate object-label -> this project's camera_events.type enum
// ('motion' | 'human' | 'vehicle', see server/src/lib/cameraSchemas.js).
// Any label not listed here (dog, cat, etc. — Frigate's default model
// recognizes several) falls back to 'motion', never guessed as human/vehicle.
// ---------------------------------------------------------------------------
const HUMAN_LABELS = new Set(["person"]);
const VEHICLE_LABELS = new Set(["car", "truck", "bus", "motorcycle", "bicycle"]);

function labelToType(label) {
  if (HUMAN_LABELS.has(label)) return "human";
  if (VEHICLE_LABELS.has(label)) return "vehicle";
  return "motion";
}

const LOG_FILE = path.join(BASE_DIR, "raw-events.log");

function logRaw(label, payload) {
  const entry = { time: new Date().toISOString(), label, payload };
  console.log(`[camera-bridge] ${label}`);
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  } catch (err) {
    console.error("[camera-bridge] failed to write raw-events.log:", err.message);
  }
}

// Forwards one detection to the main server. Never throws — one bad/
// unmapped event shouldn't crash a bridge that needs to stay up 24/7 next
// to the cameras.
async function forwardEvent({ cameraId, type, detectedAt, clipPath }) {
  try {
    const res = await fetch(`${API_BASE}/camera-bridge/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: DEVICE_ID,
        secretKey: DEVICE_SECRET,
        cameraId,
        type,
        detectedAt,
        ...(clipPath ? { clipPath } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(`[camera-bridge] event forward rejected for cameraId=${cameraId}:`, res.status, data.error);
    } else {
      console.log(`[camera-bridge] event forwarded: camera=${cameraId} type=${type} shouldNotify=${data.shouldNotify}`);
    }
  } catch (err) {
    console.error(`[camera-bridge] event forward failed for cameraId=${cameraId}:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// frigate/events — single JSON topic Frigate publishes every detection
// lifecycle change to (documented shape: { type: "new"|"update"|"end",
// before: {...}, after: {...} }). Only "new" is forwarded — that's the
// moment an object is first detected, which is what should trigger a
// notification; "update"/"end" messages for the same object are Frigate
// refining/closing the same detection, forwarding those too would just
// duplicate the event for something the server-side cooldown (Phase 3)
// would then have to filter out anyway.
// ---------------------------------------------------------------------------
function handleFrigateEvent(payload) {
  let data;
  try {
    data = JSON.parse(payload);
  } catch (err) {
    logRaw("unparseable-events-payload", payload.toString());
    return;
  }
  logRaw("events", data);

  if (data.type !== "new" || !data.after) return;

  const after = data.after;
  const frigateName = after.camera;
  const cameraId = CAMERA_MAP[frigateName];
  if (!cameraId) {
    console.warn(`[camera-bridge] ⚠ অজানা ক্যামেরা, CAMERA_MAP-এ নেই — উপেক্ষা করা হলো / unknown camera, not in CAMERA_MAP, skipped: "${frigateName}"`);
    return;
  }

  const type = labelToType(after.label);
  const startTimeSeconds = typeof after.start_time === "number" ? after.start_time : Date.now() / 1000;
  const detectedAt = new Date(startTimeSeconds * 1000).toISOString();
  const clipPath =
    FRIGATE_URL && after.has_clip && after.id
      ? `${FRIGATE_URL}/api/events/${after.id}/clip.mp4`
      : undefined;

  forwardEvent({ cameraId, type, detectedAt, clipPath });
}

// ---------------------------------------------------------------------------
// Startup self-check — same idea as hardware-bridge's Phase 3A self-check:
// hit the main server's public GET /api/health before doing anything else,
// so a wrong MADRASAH_API_BASE is caught immediately instead of silently
// dropping every event later. Never blocks startup, only warns.
// ---------------------------------------------------------------------------
async function selfCheck() {
  const healthUrl = `${API_BASE}/health`;
  try {
    const res = await fetch(healthUrl, { method: "GET" });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data && data.ok) {
        console.log(`[camera-bridge] ✓ কনফিগারেশন ঠিক আছে, সার্ভার সাড়া দিচ্ছে / config OK, server responded: ${healthUrl}`);
        return;
      }
    }
    console.warn(
      `\n[camera-bridge] ⚠ সতর্কতা: ${healthUrl} থেকে প্রত্যাশিত সাড়া মেলেনি (স্ট্যাটাস ${res.status})। ` +
        `MADRASAH_API_BASE ঠিকানাটা আবার যাচাই করুন।\n` +
        `[camera-bridge] ⚠ Warning: unexpected response from ${healthUrl} (status ${res.status}). ` +
        `Double-check MADRASAH_API_BASE.\n`
    );
  } catch (err) {
    console.warn(
      `\n[camera-bridge] ⚠ সতর্কতা: ${healthUrl}-এ পৌঁছানো যায়নি (${err.message})। ইন্টারনেট/নেটওয়ার্ক সংযোগ অথবা ` +
        `MADRASAH_API_BASE ঠিকানা যাচাই করুন। সার্ভার এখনো চালু না থাকলে এই সতর্কতা উপেক্ষা করা যায়।\n` +
        `[camera-bridge] ⚠ Warning: could not reach ${healthUrl} (${err.message}). Check your network connection or ` +
        `MADRASAH_API_BASE. Safe to ignore if the server just isn't running yet.\n`
    );
  }
}

// ---------------------------------------------------------------------------
// MQTT connection — connects to the local Mosquitto broker (Frigate
// publishes to the same broker, see docker-compose.yml), subscribes to
// frigate/events. Auto-reconnects by default (mqtt.js's built-in
// behavior) — this bridge needs to stay up 24/7 next to the cameras, so a
// dropped connection should recover on its own, not require a restart.
// ---------------------------------------------------------------------------
console.log(`[camera-bridge] ক্যামেরা ম্যাপ / camera map: ${JSON.stringify(CAMERA_MAP)}`);
console.log(`[camera-bridge] MQTT ব্রোকারে সংযোগ করা হচ্ছে / connecting to MQTT broker: ${MQTT_BROKER_URL}`);

const mqttOptions = {};
if (MQTT_USERNAME) mqttOptions.username = MQTT_USERNAME;
if (MQTT_PASSWORD) mqttOptions.password = MQTT_PASSWORD;

const client = mqtt.connect(MQTT_BROKER_URL, mqttOptions);

client.on("connect", () => {
  console.log("[camera-bridge] ✓ MQTT সংযুক্ত / MQTT connected");
  client.subscribe("frigate/events", (err) => {
    if (err) {
      console.error("[camera-bridge] ✗ frigate/events সাবস্ক্রাইব ব্যর্থ / subscribe failed:", err.message);
    } else {
      console.log("[camera-bridge] frigate/events সাবস্ক্রাইব হয়েছে / subscribed to frigate/events");
    }
  });
  selfCheck();
});

client.on("message", (topic, payload) => {
  if (topic === "frigate/events") {
    handleFrigateEvent(payload);
  }
});

client.on("error", (err) => {
  console.error("[camera-bridge] MQTT এরর / MQTT error:", err.message);
});

client.on("reconnect", () => {
  console.log("[camera-bridge] MQTT পুনঃসংযোগের চেষ্টা / attempting MQTT reconnect...");
});

client.on("close", () => {
  console.warn("[camera-bridge] MQTT সংযোগ বন্ধ হয়ে গেছে, পুনঃসংযোগের চেষ্টা চলবে / MQTT connection closed, will keep retrying");
});
