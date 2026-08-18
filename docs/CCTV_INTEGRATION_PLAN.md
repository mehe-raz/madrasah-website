# পরিকল্পনা: CCTV ক্যামেরা ইন্টিগ্রেশন (Live View + রেকর্ডিং + AI ডিটেকশন)

তৈরি: 2026-08-18 · প্রজেক্ট: madrasah-website · স্ট্যাটাস: **Phase 1–4 সম্পন্ন (2026-08-19) — বাকি Phase 5-৮**

**Phase 1 আপডেট (2026-08-18):** `server/sql/supabase_schema.sql`-এ
`camera_bridges`, `cameras`, `camera_events` টেবিল যোগ হয়েছে (স্কিমা-অনলি,
কোনো রুট/API এখনো নেই)।

**Phase 2 আপডেট (2026-08-19):** Camera/Bridge ম্যানেজমেন্ট API
(`server/src/routes/cameras.js`, authenticated, `"cameras"` পারমিশন)।

**Phase 3 আপডেট (2026-08-19):** ইভেন্ট ইনজেশন API
(`POST /api/camera-bridge/event`, unauthenticated + secretKey, কুলডাউন +
in-app/push নোটিফিকেশন)। বিস্তারিত `docs/CURRENT_TASK.md`-এ।

**Phase 4 আপডেট (2026-08-19):** লাইভ-ভিউ স্ট্রিম প্রক্সি —
`GET /api/cameras/:id/stream-url` (signed temporary URL) +
`GET /api/camera-stream/:cameraId/...` (public proxy, নিজস্ব signed token
দিয়ে)। `camera_bridges`-এ নতুন `"tunnelUrl"` কলাম যোগ হয়েছে (Phase 1-এ ছিল
না)। বিস্তারিত `docs/CURRENT_TASK.md`-এ।

---

## ১. এখন কী চাইছেন (সংক্ষেপে)

প্রতিষ্ঠানের পরিচালক যেন একাধিক প্রতিষ্ঠানের একাধিক CCTV ক্যামেরা আলাদা
মনিটর/অ্যাপ ছাড়াই — সরাসরি এই ওয়েবসাইট/ড্যাশবোর্ড থেকে — লাইভ দেখতে ও
কন্ট্রোল করতে পারেন। ভিডিও ক্যামেরার নিজস্ব মেমোরি/একটা লোকাল কম্পিউটারে
থাকবে, ইন্টারনেটের মাধ্যমে সার্ভারে/ওয়েবসাইটে পাঠানো হবে। কোনো ক্যামেরা
কোম্পানির নিজস্ব ক্লাউডে বাধ্য হওয়া চলবে না। মোশন/হিউম্যান ডিটেকশন হবে,
নোটিফিকেশন যাবে। পরবর্তীতে ধাপে ধাপে আরও AI (যেমন ফেস রিকগনিশন) যোগ হবে।

**সিদ্ধান্ত হয়ে গেছে (আগের আলোচনায়):**
- ক্যামেরা: ONVIF-সাপোর্টেড IP ক্যামেরা (PoE প্রেফার্ড), RTSP লোকালি খোলা
  থাকবে — কোম্পানির অ্যাপ/ক্লাউডে বাধ্য না।
- লোকাল NVR/AI সফটওয়্যার: **Frigate** (ওপেন-সোর্স, বিল্ট-ইন human/motion
  detection, MQTT দিয়ে ইভেন্ট আউটপুট) + **MediaMTX** (RTSP → WebRTC/HLS)।
- সংযোগ: রাউটার পোর্ট-ফরওয়ার্ড ছাড়াই **Cloudflare Tunnel** বা
  **Tailscale** দিয়ে প্রতিষ্ঠানের লোকাল মেশিন ↔ সার্ভার।
- স্টোরেজ: ফুল ফুটেজ লোকালেই থাকবে (SD কার্ড/লোকাল ডিস্ক); শুধু
  মোশন/হিউম্যান-ডিটেক্টেড ক্লিপ আপনার নিজস্ব cloud storage-এ (Cloudflare
  R2/Backblaze B2) ব্যাকআপ যাবে — ফ্রি-টিয়ার/কম খরচে থাকার জন্য।
- ফিজিক্যাল ক্যামেরা **এখনো কেনা হয়নি** — Phase 1-৩ ক্যামেরা ছাড়াই
  (স্কিমা/কোড/স্ট্রাকচার) করা সম্ভব; বাস্তব লাইভ-ভিউ/ডিটেকশন টেস্ট করতে
  আসল ক্যামেরা লাগবে (নিচে প্রতি Phase-এ চিহ্নিত করা আছে)।

---

## ২. প্রজেক্টে এখন যা আছে (রিইউজ হবে)

| জিনিস | ফাইল | কীভাবে কাজে লাগবে |
|---|---|---|
| লোকাল কম্পিউটার → সার্ভার bridge প্যাটার্ন (মূল রিপোর বাইরে, secretKey-ভিত্তিক auth) | `hardware-bridge/` (attendance-এর জন্য) | camera-bridge একই প্যাটার্নে বানানো হবে — নতুন কিছু উদ্ভাবন লাগবে না |
| পাবলিক/unauthenticated রুট + নিজস্ব auth প্যাটার্ন | `server/src/routes/publicSignup.js`, `deviceAttendance.js` (থাকলে), `index.js`-এর `/api/public` চেইন | camera-bridge থেকে আসা ইভেন্ট/স্ট্রিম-রিকোয়েস্ট রুটও এই প্যাটার্নে বসবে |
| Push notification (guardian-দের জন্য বানানো, স্টাফ/এডমিনের জন্যও রিইউজযোগ্য) | `server/src/lib/guardianPush.js` (`notifyGuardians()`) | মোশন/হিউম্যান ডিটেকশন ইভেন্ট → পরিচালককে push notification পাঠাতে একই web-push infra ব্যবহার হবে (নতুন recipient টাইপ হিসেবে "director/staff") |
| RBAC/পারমিশন | `server/src/config/roles.js`, `middleware/rbac.js` | নতুন `"cameras"` পারমিশন-কী যোগ হবে |
| Zod ভ্যালিডেশন প্যাটার্ন | `server/src/lib/*Schemas.js` | camera/event স্কিমার জন্য একই প্যাটার্নে নতুন ফাইল |
| অডিট লগ | `server/src/lib/auditLog.js` | ক্যামেরা অ্যাড/ডিলিট/কন্ট্রোল অ্যাকশনে `recordAudit()` |
| মাল্টি-টেন্যান্ট স্কিমা প্যাটার্ন | `server/sql/supabase_schema.sql`, `tenantProvision.js` | নতুন `cameras`/`camera_events` টেবিলও প্রতি-প্রতিষ্ঠান schema-তেই বসবে |
| রিয়েল-টাইম আপডেট | নেই (পোলিং প্যাটার্নই আছে) | ইভেন্ট/স্ট্যাটাসের জন্য পোলিং যথেষ্ট; **লাইভ ভিডিওর জন্য WebRTC লাগবে — এটা নতুন dependency/প্যাটার্ন, আলাদাভাবে ফ্ল্যাগ করা হলো (AGENTS.md রুল ৫)** |

**নতুন যা লাগবে:** (ক) camera-bridge — মূল রিপোর বাইরে আলাদা Node.js
প্রোজেক্ট, Frigate/MediaMTX-এর সাথে কথা বলবে; (খ) সার্ভারে camera
management + event ingestion API; (গ) লাইভ-ভিউয়ের জন্য WebRTC
সিগন্যালিং (নতুন dependency নিয়ে Phase 4-এ আলাদাভাবে সিদ্ধান্ত হবে); (ঘ)
ক্লায়েন্টে নতুন Cameras মডিউল (ঠিক Students/Attendance-এর মতো)।

---

## ৩. মূল অ্যাসাম্পশন — "শুরু কর" বলার আগে ভুল মনে হলে জানাবেন

- **এক প্রতিষ্ঠান = এক camera-bridge মেশিন।** একাধিক ক্যামেরা একই bridge
  মেশিনে (মিনি-পিসি/Raspberry Pi) কানেক্ট থাকবে, একটাই deviceId/secretKey
  দিয়ে সার্ভারে অথেন্টিকেট হবে (attendance-bridge-এর মতোই)।
- **লাইভ ভিউ পুরোপুরি রিয়েল-টাইম (WebRTC) না রেখে প্রথম ধাপে HLS
  (কয়েক সেকেন্ড ডিলে, কিন্তু কোনো নতুন সার্ভার-সাইড dependency/infra
  ছাড়াই কাজ করে) দিয়ে শুরু করা হবে।** WebRTC ভালো (কম ল্যাটেন্সি) কিন্তু
  TURN/সিগন্যালিং সার্ভার লাগে — বাড়তি ইনফ্রা। HLS দিয়ে শুরু করলে
  `<video>` ট্যাগেই কাজ চলে, MediaMTX নিজেই HLS আউটপুট দেয়। রিয়েল-টাইম
  কন্ট্রোল (PTZ ইত্যাদি) দরকার হলে WebRTC পরে আলাদা কাজ হিসেবে যোগ হবে।
- **নোটিফিকেশন শুধু "মোশন শুরু" ইভেন্টে যাবে**, প্রতি সেকেন্ডে না — নাহলে
  স্প্যাম হয়ে যাবে। একই ক্যামেরায় ৫ মিনিটের মধ্যে বারবার ইভেন্ট এলে
  cooldown থাকবে (Phase 5-এ চূড়ান্ত সংখ্যা ঠিক হবে)।
- **ক্লিপ ব্যাকআপ (cloud storage) স্কোপ প্রথম রাউন্ডে অন্তর্ভুক্ত না** —
  Phase 1-৮-এ লোকাল স্টোরেজ + লাইভ-ভিউ + ডিটেকশন-নোটিফিকেশন পর্যন্ত হবে।
  Cloudflare R2/B2 ব্যাকআপ আলাদা পরের ধাপ (এই ডকের §৬-এ "স্কোপের বাইরে"
  দ্রষ্টব্য), কারণ এটার জন্য নতুন অ্যাকাউন্ট/ক্রেডেনশিয়াল লাগবে যেটা
  আপনার সাথে আগে ঠিক করে নেওয়া দরকার।
- **ফেস রিকগনিশন/AI অ্যাটেনডেন্স স্কোপের বাইরে** — এই প্ল্যান শুধু
  লাইভ-ভিউ + রেকর্ডিং + মোশন/হিউম্যান ডিটেকশন পর্যন্ত। ভবিষ্যতে আলাদা
  প্ল্যান ডক হবে (§৭ দ্রষ্টব্য)।

ভুল মনে হলে "শুরু কর" বলার আগে জানাবেন — সংশোধন সহজ, এই ধাপেই।

---

## ৪. কাজ কয় ভাগে হবে — **৮ ভাগে** (Phase 1 → 8)

কেন ৮ ভাগ, ছোট ছোট করে: প্রতিটা Phase একটা নিজস্ব session-এ (একটা মেসেজ/
একটা ফ্রি AI কোটার মধ্যে) সম্পূর্ণ শুরু-থেকে-শেষ (কোড + `npm run check`
পাস + রিপোর্ট) শেষ করার মতো ছোট রাখা হয়েছে — একটা Phase-এ একটাই স্তর
(শুধু DB, বা শুধু একটা API ফাইল, বা শুধু একটা UI পেজ) ছোঁয়া হবে, একসাথে
অনেক স্তর মেশানো হবে না। প্রতি Phase-এর শেষে `npm run check` + আপনার
প্যাকেজড CMD দিয়ে যাচাই হবে, পাস না করলে পরের Phase-এ যাব না।
`docs/CURRENT_TASK.md`-এ প্রতিটা Phase শেষ হলে টিক দিয়ে পরের এজেন্ট/সেশন
ঠিক কোথা থেকে শুরু করবে তা লেখা থাকবে (SHIFT_SCHEDULE_PLAN.md-এর মতোই)।

### Phase 1 — DB স্কিমা: cameras, camera_events
**ক্যামেরা লাগবে না।**
- `server/sql/supabase_schema.sql`-এ (protected path — AGENTS.md রুল ৪,
  এই ফিচারের জন্য আগেই এখানে ফ্ল্যাগ করা হলো):
  - নতুন `cameras` টেবিল: `id, name, location, "bridgeDeviceId" (fk-এর
    মতো text, কোন bridge মেশিনের আন্ডারে), "streamPath" text (MediaMTX-এ
    এই ক্যামেরার পাথ), active boolean default true, "createdAt"`
  - নতুন `camera_bridges` টেবিল: `id, "deviceId" (unique text), "secretKey"
    text, name, location, active, "createdAt"` — attendance_devices-এর
    সাথে হুবহু একই প্যাটার্ন
  - নতুন `camera_events` টেবিল: `id, "cameraId" (fk), type text
    ('motion'/'human'/'vehicle'), "detectedAt" timestamp, "clipPath" text
    (nullable, লোকাল bridge-এ কোথায় সেভ আছে), acknowledged boolean
    default false, "createdAt"` — raw ইভেন্ট লগ, ডিলিট হবে না
  - মাল্টি-টেন্যান্ট বলে প্রতি-প্রতিষ্ঠান schema-তেই বসবে (আগের সব
    ফিচারের মতোই, `tenantProvision.js` স্বয়ংক্রিয়ভাবে হ্যান্ডেল করবে)
- **টেস্ট:** `npm run check` (server syntax) + SQL bracket/সিনট্যাক্স
  ম্যানুয়াল রিভিউ (sandbox-এ আসল Postgres নেই, স্কিমা প্রথম চলবে আপনার
  প্যাকেজড CMD-তে)।

### Phase 2 — Camera/Bridge ম্যানেজমেন্ট API (ব্যাকএন্ড, authenticated)
**ক্যামেরা লাগবে না।**
- নতুন `server/src/lib/cameraSchemas.js` — Zod স্কিমা (bridge create,
  camera create/update)
- নতুন `server/src/routes/cameras.js` — `GET/POST/PATCH` bridges ও
  cameras-এর জন্য, `requirePermission("cameras")`, `recordAudit`, hard
  delete নেই (active টগল, staff.js-এর প্যাটার্নে)
- `server/src/config/roles.js`-এ নতুন `"cameras"` পারমিশন-কী
- `index.js`-এ `/api/cameras` মাউন্ট
- **টেস্ট:** `npm run check`।

### Phase 3 — ইভেন্ট ইনজেশন API (bridge → সার্ভার, unauthenticated+secretKey)
**ক্যামেরা লাগবে না (কার্ল/পোস্টম্যান দিয়ে ফেক ইভেন্ট পাঠিয়ে টেস্ট করা যাবে)।**
- নতুন `server/src/routes/cameraEvents.js`:
  - `POST /api/camera-bridge/event` — body: `{ deviceId, secretKey,
    cameraId, type, detectedAt, clipPath? }`, deviceAttendance.js-এর
    auth-প্যাটার্নে secretKey যাচাই, rate-limited
  - সেভের পর cooldown-লজিক (একই camera-তে ৫ মিনিটে দ্বিতীয়বার হলে
    নোটিফিকেশন স্কিপ, কিন্তু ইভেন্ট রেকর্ড হবে)
  - `notifyGuardians()`-এর প্যাটার্নে নতুন `notifyDirectors()` (বা বিদ্যমান
    ফাংশন এক্সটেন্ড) দিয়ে push notification
- `index.js`-এ পাবলিক চেইনে মাউন্ট (`/api/public`-এর মতো, নিজস্ব rate
  limiter)
- **টেস্ট:** `npm run check` + ম্যানুয়াল curl দিয়ে ফেক ইভেন্ট পাঠিয়ে DB-তে
  ঢুকল কিনা ও নোটিফিকেশন গেল কিনা যাচাই।

### Phase 4 — লাইভ-ভিউ স্ট্রিম প্রক্সি (ব্যাকএন্ড)
**⚠ এখান থেকে টেস্ট করতে আসল ক্যামেরা বা অন্তত একটা টেস্ট RTSP স্ট্রিম লাগবে।**
- সিদ্ধান্ত অনুযায়ী (§৩) HLS দিয়ে শুরু: MediaMTX bridge মেশিনে HLS সার্ভ
  করবে (`http://bridge-tunnel-url/hls/camera1/index.m3u8`)
- সার্ভারে নতুন রুট `GET /api/cameras/:id/stream-url` — authenticated,
  `requirePermission("cameras")`, DB থেকে camera-র bridge tunnel URL +
  streamPath জোড়া দিয়ে সাইন করা সাময়িক URL রিটার্ন করে (bridge-এর আসল URL
  ক্লায়েন্টে সরাসরি এক্সপোজ না করে)
- **টেস্ট:** `npm run check` + বাস্তব/টেস্ট ক্যামেরা দিয়ে ম্যানুয়াল
  ভেরিফিকেশন (একটা ছোট আলাদা টেস্ট পেজ/curl দিয়ে)।

### Phase 5 — camera-bridge প্রোগ্রাম (মূল রিপোর বাইরে)
**⚠ এখান থেকে টেস্ট করতে আসল ক্যামেরা/Frigate ইনস্টল লাগবে।**
- নতুন ফোল্ডার `camera-bridge/` (repo রুটে, `hardware-bridge/`-এর পাশে,
  নিজস্ব `package.json`, মূল `npm run check` এই অংশ ছোঁবে না)
- Frigate-এর MQTT ইভেন্ট সাবস্ক্রাইব করে → Phase 3-এর
  `/api/camera-bridge/event`-এ ফরওয়ার্ড করে
- `.env.example` + বাংলা README (hardware-bridge/README.md-এর মতোই ধাপে
  ধাপে, অ-টেকনিক্যাল ইউজারের জন্য)
- **টেস্ট:** ম্যানুয়াল — bridge মেশিনে আসলেই চালিয়ে দেখা।

### Phase 6 — ক্লায়েন্ট: Cameras ম্যানেজমেন্ট পেজ (Admin)
**ক্যামেরা লাগবে না (UI বিদ্যমান API দিয়েই কাজ করবে)।**
- নতুন `client/src/modules/Cameras/` — bridge/camera অ্যাড-এডিট-লিস্ট,
  Students/Settings মডিউলের ডিজাইন-সিস্টেম (`Button`, `Input`, `Field`,
  `Card`) রিইউজ করে
- `App.tsx`-এ `lazy()` দিয়ে নতুন রুট, Sidebar-এ এন্ট্রি (permission-গেটেড)
- **টেস্ট:** `npm run lint` + `typecheck` + `build` (এগুলো `npm run
  check`-এর অংশ)।

### Phase 7 — ক্লায়েন্ট: লাইভ-ভিউ ড্যাশবোর্ড উইজেট + মাল্টি-ক্যামেরা গ্রিড
**⚠ এখান থেকে বাস্তব যাচাইয়ে আসল স্ট্রিম লাগবে (কোড লেখা যাবে ক্যামেরা ছাড়াই)।**
- Dashboard-এ ছোট "সাম্প্রতিক ক্যামেরা" উইজেট (থাম্বনেইল/স্ট্যাটাস)
- Cameras মডিউলে ফুল-স্ক্রিন গ্রিড পেজ (hls.js দিয়ে `<video>` প্লেব্যাক —
  এইটা নতুন dependency, Phase শুরুর আগে আলাদাভাবে জানানো হবে, AGENTS.md
  রুল ৫)
- **টেস্ট:** `npm run check` + বাস্তব ক্যামেরায় ম্যানুয়াল ভিজ্যুয়াল
  ভেরিফিকেশন।

### Phase 8 — ক্লায়েন্ট: ইভেন্ট/নোটিফিকেশন টাইমলাইন
**ক্যামেরা ছাড়া আংশিক টেস্ট সম্ভব (Phase 3-এর ফেক ইভেন্ট দিয়ে)।**
- camera_events লিস্ট UI (থাম্বনেইল/সময়/টাইপ, acknowledge বোতাম)
- `NotificationBell`-এর প্যাটার্নে নতুন ইভেন্ট এলে ব্যাজ/আপডেট
- **টেস্ট:** `npm run check` + Phase 3-এর ফেক ইভেন্ট দিয়ে UI-তে দেখা
  যাচ্ছে কিনা যাচাই, তারপর বাস্তব ক্যামেরায় শেষ ভেরিফিকেশন।

---

## ৫. প্রতিটা Phase-এর "নতুন dependency" চেকপয়েন্ট (আগে থেকেই জানিয়ে রাখা হলো)

AGENTS.md রুল ৫ অনুযায়ী নতুন কোনো npm প্যাকেজ যোগ করার আগে আলাদাভাবে
জানানো হবে, কিন্তু এই প্ল্যানে কোথায় কোথায় লাগতে পারে তা আগেই স্বচ্ছভাবে
বলে রাখা হলো যাতে অবাক না হন:
- Phase 5 (camera-bridge): নতুন আলাদা প্রোজেক্ট, নিজস্ব dependency
  (mqtt ক্লায়েন্ট) — মূল রিপোকে প্রভাবিত করবে না
- Phase 7 (ক্লায়েন্ট লাইভ-ভিউ): `hls.js` — ক্লায়েন্ট-সাইড, ছোট লাইব্রেরি

---

## ৬. স্কোপের বাইরে (এই প্ল্যানে নেই, পরে আলাদা কাজ)

- Cloud storage (R2/B2) ক্লিপ ব্যাকআপ — লোকাল স্টোরেজ যথেষ্ট হলে নাও লাগতে
  পারে, চাইলে পরে আলাদা Phase হিসেবে যোগ হবে
- WebRTC (কম-ল্যাটেন্সি রিয়েল-টাইম) — HLS-এ কয়েক সেকেন্ড ডিলে যথেষ্ট না
  মনে হলে পরে যোগ হবে
- PTZ (প্যান-টিল্ট-জুম) কন্ট্রোল UI
- ফেস রিকগনিশন / AI-ভিত্তিক অটো-হাজিরা (ক্যামেরা দিয়ে) — বড় আলাদা প্ল্যান
  লাগবে, প্রাইভেসি/সম্মতি প্রশ্নও আছে
- একাধিক bridge মেশিনের মধ্যে ফেইলওভার/হাই-এভেইলেবিলিটি

---

## ৭. AI রোডম্যাপ (ভবিষ্যৎ, ধাপে ধাপে — এখনই না)

Frigate-এর detection ইঞ্জিন লোকালি চলে বলে ক্লাউড AI API-এর ফ্রি-লিমিটের
প্রশ্নই আসে না (motion/human/vehicle detection পুরোটাই লোকাল মেশিনে)।
ভবিষ্যতে যদি আরও স্মার্ট কিছু (যেমন নির্দিষ্ট ব্যক্তি চেনা) লাগে, তখন
Frigate-এর "face recognition" অ্যাড-অন (এটাও ওপেন-সোর্স, লোকালি চলে) দিয়ে
আলাদা প্ল্যান ডক লেখা হবে — তখনও ক্লাউড AI লাগবে না, তাই ফ্রি-লিমিট নিয়ে
চিন্তা করতে হবে না।

---

## ৮. পরবর্তী পদক্ষেপ

"শুরু কর" বললে Phase 1 থেকে শুরু হবে। নির্দিষ্ট নম্বর বলে দিলে (যেমন
"Phase 3 থেকে শুরু কর") সেখান থেকেও শুরু করা যাবে, তবে Phase 1-২ ছাড়া
Phase 3 কাজ করবে না (DB টেবিল+API লাগবে) — তাই ক্রমানুসারেই এগোনো ভালো।
