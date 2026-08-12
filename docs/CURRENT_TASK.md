# Current Task Queue

Read this file every session, regardless of what the user's message says —
it may carry unfinished work from a previous AI agent's session.

**Phase-naming rule (added 2026-08-06, after a mislabeling incident — see
the second entry below for the full story):** never title a task entry
"BUSINESS_READINESS_ROADMAP Phase N" unless the work matches what
`docs/BUSINESS_READINESS_ROADMAP.md` itself describes under that exact
Phase N heading. Check the roadmap file before naming an entry, every
time — even when the task is answering a question the roadmap left open
under a *different* phase. If it doesn't match a phase verbatim, name it
something else ("Phase 8C follow-up", "ad-hoc", etc.) instead of borrowing
the next sequential number.

## Task: কেন্দ্রীয় (bridge-মুক্ত) মাল্টি-ব্র্যান্ড হাজিরা-ডিভাইস ইনজেশন — ৪
Phase-এ, পুরো পরিকল্পনা `docs/ATTENDANCE_DEVICE_CENTRALIZED_INGESTION_PLAN.md`-এ
(ad-hoc, নিচের সেলফ-সার্ভিস এন্ট্রির **উপরে বসছে**, কিন্তু সম্পূর্ণ আলাদা
কাজ — নিচেরটা প্রতিষ্ঠান নিজে ডিভাইস/এনরোলমেন্ট UI থেকে সেট করবে সেই নিয়ে,
এটা bridge/লোকাল-কম্পিউটার একদমই বাদ দিয়ে Push/ADMS ডিভাইস সরাসরি সার্ভারে
কানেক্ট করা নিয়ে। পুরনো এন্ট্রি অপরিবর্তিত রাখা হয়েছে, এটা তার Phase
4-এর (সেটআপ গাইড) উপর প্রভাব ফেলতে পারে — Phase 4 লেখার সময় এই টাস্কের
অগ্রগতি বিবেচনায় নিতে হবে)

## Status: IN_PROGRESS (Phase 1, Phase 2, Phase 3 সম্পন্ন — Phase 4 বাকি,
ঐচ্ছিক)

Started: 2026-08-12 (প্ল্যান লেখার তারিখ; কোডিং শুরুর তারিখ ভিন্ন হতে পারে)

দেখুন `docs/ATTENDANCE_DEVICE_CENTRALIZED_INGESTION_PLAN.md` — সম্পূর্ণ
প্রেক্ষাপট, ৪টা Phase-এর বিস্তারিত ব্রেকডাউন (গ্লোবাল ডিভাইস-রেজিস্ট্রি
স্কিমা → ADMS ইনজেশন এন্ডপয়েন্ট → অ্যাডমিন প্যানেল নির্দেশনা →
ব্র্যান্ড-ক্লাউড adapter কাঠামো), ও ধারা ৭-এর ঝুঁকি/সীমাবদ্ধতা।

### সম্পন্ন
- [x] প্ল্যান ডকুমেন্ট লেখা ও ব্যবহারকারীর সাথে আলোচনা করে নিশ্চিত করা
- [x] সেলফ-সার্ভিস টাস্কের বিদ্যমান কোড থেকে রিইউজ-বিশ্লেষণ (ধারা ৩.৫)
  যোগ করা
- [x] **Phase 1 সম্পন্ন (2026-08-12)** — গ্লোবাল ডিভাইস-রেজিস্ট্রি স্কিমা +
  অ্যাডমিন প্যানেল ওয়্যারিং, প্ল্যান ডকের ধারা ৫-এ যা লেখা আছে সেভাবে:
  - `server/sql/registry_schema.sql` (protected path — AGENTS.md রুল ৪
    অনুযায়ী, এই কাজেরই অংশ) — নতুন `registry.device_registry` টেবিল
    (`device_id` গ্লোবাল প্রাইমারি-কি, `institution_id`, `schema_name`,
    `secret_or_comm_key`, `protocol`, `brand`, `active`) + ইনডেক্স।
  - `server/sql/supabase_schema.sql` — `attendance_devices`-এ নতুন
    `protocol` কলাম (idempotent `alter table ... add column if not
    exists`, ডিফল্ট `'push_adms'`)।
  - `server/src/registryDb.js` — নতুন `registerDevice()` (গ্লোবাল
    ইউনিকনেস-ভায়োলেশনে পরিষ্কার ৪০৯ Error ছোঁড়ে),
    `updateDeviceRegistrySecret()`, `updateDeviceRegistryActive()`,
    `deleteDeviceRegistryEntry()` — সবগুলো এক্সপোর্ট করা হয়েছে।
  - `server/src/lib/opsSchemas.js` — `attendanceDeviceCreateSchema`-এ
    নতুন `protocol` ফিল্ড (`z.enum(["push_adms","key_reader","pull_sdk"])`,
    ডিফল্ট `push_adms`)।
  - `server/src/routes/attendanceDevices.js` — `POST /` এখন tenant-schema
    ইনসার্টের পাশাপাশি (শুধু multi-tenant মোডে, `tenantContext.get()`-এ
    institution থাকলে) `registryDb.registerDevice()` কল করে; গ্লোবাল
    রেজিস্ট্রিতে deviceId আগে থেকেই অন্য প্রতিষ্ঠানে থাকলে (৪০৯) তখনই
    ট্রেন্যান্ট-সাইড রো ডিলিট করে রোলব্যাক করা হয়, দুই স্টোর কখনো
    বেমিল না থাকে তা নিশ্চিত করতে। `PUT /:id` (active টগল) ও `POST
    /:id/regenerate-secret` এখন গ্লোবাল রেজিস্ট্রির
    active/secret_or_comm_key-ও সিঙ্ক করে (single-tenant/আগে-থেকে-
    রেজিস্টার-না-হওয়া ডিভাইসে silently no-op)। `GET /`-এর SELECT-এ
    `protocol` কলাম যোগ হয়েছে।
  - ফ্রন্টএন্ড: `client/src/types/index.ts` (নতুন
    `AttendanceDeviceProtocol` টাইপ + `AttendanceDevice.protocol`),
    `client/src/lib/api.ts` (`create()` এখন `protocol` পাঠায়),
    `client/src/modules/AttendanceDevices.tsx` (নতুন "ডিভাইসের ধরন"
    `<Select>` ফর্মে, তৈরির পর রিসেট হয়, লিস্টে প্রতিটা ডিভাইসের পাশে
    ধরন দেখানো একটা নতুন `Badge`)। `client/src/i18n/bn.ts`+`en.ts`-এ
    `attendanceDevices.protocolLabel`/`protocolLabels.{push_adms,
    key_reader,pull_sdk}` (key-parity স্ক্রিপ্ট দিয়ে যাচাই করা হয়েছে)।
  - সবগুলো পরিবর্তিত/নতুন `.js` ফাইল `node --check` পাস করেছে; সব
    `.ts`/`.tsx`/`.sql` ফাইলে bracket/paren-balance script দিয়ে
    ম্যানুয়ালি যাচাই করা হয়েছে। **পুরো `npm run check` + একটা টেস্ট
    ডিভাইস অ্যাড করে গ্লোবাল ও tenant দুই টেবিলেই সঠিক ডেটা যাচ্ছে
    কিনা — এই sandbox-এ network/node_modules না থাকায় চালানো যায়নি,
    আপনার প্যাকেজড CMD-তেই প্রথম যাচাই হবে (আগের সব Phase-এর প্যাটার্নে)।**

- [x] **Phase 2 সম্পন্ন (2026-08-12)** — ADMS-সামঞ্জস্যপূর্ণ পাবলিক
  ইনজেশন এন্ডপয়েন্ট, প্ল্যান ডকের ধারা ৫-এ যা লেখা আছে সেভাবে:
  - `server/src/registryDb.js` — নতুন `getDeviceRegistryEntry(deviceId)`
    (Phase 1-এর `registerDevice()`-এর কাউন্টারপার্ট, শুধু লুকআপ) —
    এক্সপোর্ট করা হয়েছে।
  - নতুন `server/src/lib/devicePunch.js` — punch-প্রসেসিং লজিক
    (`deviceAttendance.js` থেকে হুবহু, আচরণ অপরিবর্তিত) একটা শেয়ার্ড
    `recordDevicePunch({device, identifier, identifierType})` ফাংশনে বের
    করা হয়েছে (ছাত্র লুকআপ, attendance_logs/attendance upsert,
    recordAudit, sendGuardianSms — সব একই)। `toStudentPayload()`-ও এখানে
    সরানো হয়েছে।
  - `server/src/routes/deviceAttendance.js` — `POST /punch` এখন
    `recordDevicePunch()` কল করে, নিজের auth (deviceId+secretKey) ও JSON
    রেসপন্স শেপ অপরিবর্তিত রেখে — আচরণে কোনো পরিবর্তন নেই, শুধু কোড সরানো
    হয়েছে।
  - নতুন `server/src/routes/deviceIngest.js` — deviceId (ADMS-এর `SN`
    query param) দিয়ে `registryDb.getDeviceRegistryEntry()` লুকআপ →
    Comm Key মিলিয়ে দেখা (একই ভ্যালু যেটা creation-এর সময় `secretKey`
    হিসেবে দেখানো হয়েছিল) → `registryDb.isAccessAllowed()` চেক →
    `tenantContext.run()` দিয়ে ম্যানুয়ালি tenant schema scope করা
    (`middleware/tenantResolve.js`-এর `withTenantByCode()`-এর একই
    মেকানিজম, কিন্তু institution code-এর বদলে ইতিমধ্যে-জানা
    schema_name/institution দিয়ে) → `recordDevicePunch()` রিইউজ। ADMS
    হ্যান্ডশেক/ATTLOG/getrequest রিকোয়েস্ট-রেসপন্স ফরম্যাট
    `hardware-bridge/index.js` থেকে হুবহু কপি করা হয়েছে (নতুন করে অনুমান
    না করে, ধারা ৩.৫ অনুযায়ী)। Comm Key-বিহীন/ভুল-Comm-Key রিকোয়েস্টেও
    সবসময় `"OK"` রেসপন্স যায় (ডিভাইসের auth-failure বোঝার/রিট্রাই-লুপে
    আটকে যাওয়ার সুযোগ না দিতে) — শুধু আসল ডেটা-লেখা স্কিপ হয়।
  - `server/src/index.js` — `app.use("/iclock", require("./routes/deviceIngest"))`
    বেয়ার top-level path-এ মাউন্ট করা হয়েছে (`/api`-এর নিচে না, কারণ আসল
    ADMS ডিভাইস ফার্মওয়্যার এই ফিক্সড পাথেই রিকোয়েস্ট পাঠায়) — `/api/device`
    মাউন্টের ঠিক পরে। `tenantResolve.js` শুধু `/api/*` পাথ পরীক্ষা করে
    বলে এটা এমনিতেই তার Host-ভিত্তিক রাউটিং-এর বাইরে, কোনো
    `isSkippedPath()` এন্ট্রি লাগেনি।
  - সবগুলো পরিবর্তিত/নতুন `.js` ফাইল `node --check` পাস করেছে। **পুরো
    `npm run check` + curl/Postman দিয়ে একটা সিমুলেটেড ADMS
    হ্যান্ডশেক+ATTLOG পাঠিয়ে punch রেকর্ড হচ্ছে কিনা, ভুল Comm Key-তে
    silently স্কিপ হচ্ছে কিনা — এই sandbox-এ network/node_modules না
    থাকায় চালানো যায়নি, আপনার প্যাকেজড CMD-তেই প্রথম যাচাই হবে (আগের সব
    Phase-এর প্যাটার্নে)। এই ডিজাইন সম্পূর্ণ অপরীক্ষিত আসল হার্ডওয়্যারে
    (ধারা ৭-এর ঝুঁকি অনুযায়ী) — বিশেষ করে ADMS-এর Comm Key ঠিক কীভাবে
    (কোন query param/header-এ) পাঠানো হয় সেটা এখনো নিশ্চিত না, আসল
    ডিভাইস কানেক্ট হওয়ার পর `deviceIngest.js`-এর `extractCommKey()`
    এডজাস্ট করা লাগতে পারে।**

- [x] **Phase 3 সম্পন্ন (2026-08-13)** — অ্যাডমিন প্যানেলে "কীভাবে
  কানেক্ট করব" নির্দেশনা, ব্র্যান্ড-নির্বিশেষে, প্ল্যান ডকের ধারা
  ৫-এ যা লেখা আছে সেভাবে:
  - `client/src/modules/AttendanceDevices.tsx` — Phase 1-এর
    secretKey মোডাল (`SecretModal`) সম্প্রসারিত করে নতুন
    `ConnectInstructions` কম্পোনেন্ট যোগ, secretKey-এর ঠিক নিচে
    protocol অনুযায়ী তিনটা ভিন্ন ব্লক দেখায়: (১) `push_adms` —
    Server ঠিকানা (`window.location.hostname`) + Port (`443
    (HTTPS)`) দুটো readonly রো + নোট যে উপরের সিক্রেট কী-টাই Comm
    Key, device-এর নিজস্ব "Device ID" সেটিংসেও এই আইডিটাই বসাতে হবে,
    কোনো প্রোগ্রাম লাগবে না; (২) `key_reader` — শুধু একটা নোট, কোনো
    প্রোগ্রাম/সেটআপ লাগে না, USB দিয়ে লাগিয়ে সরাসরি কিয়স্ক পেজে কাজ
    করবে; (৩) `pull_sdk` — নোট + একটা বাটন যেটা Phase 4A-এর বিদ্যমান
    `/attendance-devices/guide` পেজে নিয়ে যায় (hardware-bridge
    সেটআপের জন্য, আলাদা কোনো ডাউনলোড হোস্টিং বানানো হয়নি — বিদ্যমান
    গাইড পেজ ও README-ই যথেষ্ট)। `secret` স্টেট এখন `protocol`ও রাখে
    (create-এ ফর্মের protocol, regenerate-এ ডিভাইসের বিদ্যমান
    `device.protocol`) যাতে মোডাল সঠিক ব্লক দেখাতে পারে।
  - `client/src/i18n/bn.ts` + `en.ts` — `attendanceDevices` ব্লকে ৬টা
    নতুন কী (`connectTitle`, `connectPushAdmsNote`,
    `connectServerLabel`, `connectPortLabel`, `connectKeyReaderNote`,
    `connectPullSdkNote`), key-parity স্ক্রিপ্ট দিয়ে যাচাই করা
    হয়েছে (দুই ফাইলেই ৪৪টা কী)।
  - কোনো নতুন CSS ক্লাস লাগেনি — বিদ্যমান `.device-guide__note`
    (Phase 4A-এ যোগ হওয়া) ও `.ds-field`/`.ds-label`/`.ds-readonly`
    ক্লাসই রিইউজ করা হয়েছে। কোনো ব্যাকএন্ড পরিবর্তন লাগেনি (Phase 1/2-এর
    endpoint/registry রেডি ছিল)।
  - ব্র্যাকেট-ব্যালান্স স্ক্রিপ্ট দিয়ে `.tsx` ফাইল যাচাই করা হয়েছে
    (সমান), raw `style={{}}` নেই। **`npm run check` এই এজেন্ট
    চালায়নি (sandbox-এ network/node_modules নেই) — এই ডেলিভারির
    প্যাকেজড CMD-তেই প্রথম যাচাই হবে।** Server/Port ভ্যালু দুটো
    প্ল্যান ডকের ধারা ৭-এর সতর্কতা অনুযায়ী সম্পূর্ণ অপরীক্ষিত (আসল
    ADMS ডিভাইসে HTTPS পোর্ট ৪৪৩ আদৌ কাজ করবে কিনা নিশ্চিত না) —
    আসল হার্ডওয়্যারে টেস্ট করার সময় এই মানগুলো প্রথম সমন্বয়ের
    জায়গা।

### বাকি (পরের এজেন্ট এখান থেকে শুরু করবে)
- [ ] Phase 4 (ব্র্যান্ড-ক্লাউড adapter কাঠামো, ঐচ্ছিক — কোনো নির্দিষ্ট
  ব্র্যান্ডের চাহিদা না আসা পর্যন্ত শুরু করার দরকার নেই, প্ল্যান ডকের
  ধারা ৬ অনুযায়ী)।
- [ ] প্রতিটা Phase শেষ হলে এই এন্ট্রিতে "সম্পন্ন"-এ সরিয়ে "বাকি" আপডেট
  করতে হবে (packaging/zip-এর আগে)

### নোট
এই টাস্ক নিচের সেলফ-সার্ভিস এন্ট্রি বা `ATTENDANCE_DEVICE_PLAN.md`-এর
কোনো ব্যাকএন্ড/UI কোড পরিবর্তন করে না — সমান্তরাল, নতুন এন্ডপয়েন্ট/টেবিল।
তবে সেলফ-সার্ভিস এন্ট্রির Phase 4 (সেটআপ গাইড) লেখার সময় এই টাস্কের
ফলাফল (bridge ঐচ্ছিক হয়ে যাওয়া) অনুযায়ী গাইডের বিষয়বস্তু ঠিক করতে হবে —
কোন Phase আগে শেষ হয় তার উপর নির্ভর করে একে অপরকে রেফারেন্স করবে।

সেলফ-সার্ভিস টাস্কের Phase 1/2A/2B/2C-এর বিদ্যমান কোড থেকে ঠিক কী
রিইউজ হবে, কোনটা শেয়ার্ড ফাংশনে বের করতে হবে, আর কোনটা একদমই নতুন —
তার বিস্তারিত তালিকা `ATTENDANCE_DEVICE_CENTRALIZED_INGESTION_PLAN.md`-এর
নতুন **ধারা ৩.৫**-এ যোগ করা হয়েছে। Phase 2 শুরু করার আগে এই ধারাটা
পড়ে নেওয়া, যাতে বিদ্যমান কোড ভুল করে আবার লেখা না হয়।

---

## Task: মাল্টি-টেন্যান্ট সেলফ-সার্ভিস ডিভাইস কানেক্ট + ছাত্র ফিঙ্গারপ্রিন্ট
এনরোলমেন্ট — ৪ Phase-এ (কিছু Phase sub-phase-এ ভাগ করা), পুরো পরিকল্পনা
`docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md`-এ (ad-hoc, নিচের
ফিঙ্গারপ্রিন্ট-ডিভাইস এন্ট্রির **উপরে বসছে**, তার ব্যাকএন্ড/কিয়স্ক অংশ
রিইউজ করে — কিন্তু আলাদা ফাইল/এন্ট্রি, পুরনো এন্ট্রি অপরিবর্তিত)

## Status: DONE (Phase 1–4 সম্পন্ন — 3B ব্যবহারকারীর মেশিনে বিল্ড/টেস্ট
সহ, শুধু আসল হার্ডওয়্যার দিয়ে end-to-end টেস্ট বাকি সাপেক্ষে ডিভাইস হাতে
আসার)

Started: 2026-08-12 (প্ল্যান লেখার তারিখ; কোডিং শুরুর তারিখ ভিন্ন হতে পারে)

দেখুন `docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md` — সম্পূর্ণ প্রেক্ষাপট,
৪টা Phase-এর (কিছু sub-phase-এ ভাগ করা) বিস্তারিত ব্রেকডাউন, ও শুরুর আগে
কনফার্ম করা লাগবে এমন ৪টা অ্যাসাম্পশন সেখানে আছে।

### সম্পন্ন
- [x] প্ল্যান ডকুমেন্ট লেখা (`docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md`) —
  Phase 1 (ডিভাইস-ম্যানেজমেন্ট UI, 2 sub-phase), Phase 2 (ছাত্র
  fingerprintId/cardUid ফিল্ড + স্ক্যান-এনরোলমেন্ট মোড, 3 sub-phase),
  Phase 3 (hardware-bridge সহজ প্যাকেজ, 2 sub-phase), Phase 4 (সেটআপ
  গাইড, 2 sub-phase)।
- [x] **Phase 1 (1A + 1B) সম্পন্ন** — ডিভাইস-ম্যানেজমেন্ট অ্যাডমিন পেজ:
  `client/src/types/index.ts` (AttendanceDevice/AttendanceDeviceCreateResponse/
  AttendanceDeviceSecretResponse), `client/src/lib/api.ts`
  (`api.attendanceDevices.{list,create,update,regenerateSecret}`),
  `client/src/lib/icons.ts` (fingerprint আইকন), নতুন
  `client/src/modules/AttendanceDevices.tsx` (লিস্ট + অ্যাড-ফর্ম + একবারই
  দেখানো secretKey মোডাল + active টগল + regenerate-secret), `App.tsx`-এ
  `/attendance-devices` রুট, `Sidebar.tsx`-এ nav আইটেম ("attendance"
  permission-এর আওতায়), `i18n/bn.ts` ও `i18n/en.ts`-এ `nav.attendanceDevices`
  + `attendanceDevices` ব্লক (key-parity যাচাই করা হয়েছে)। ব্যাকএন্ডে কোনো
  পরিবর্তন লাগেনি (আগে থেকেই রেডি ছিল)। ব্যবহারকারীর মেশিনে `npm run check`
  চালিয়ে ২টা `no-restricted-syntax` (raw `style={{}}`) lint এরর পাওয়া
  গিয়েছিল — `index.css`-এ নতুন `.ds-readonly--mono`/`.ds-field--spaced`
  ক্লাস যোগ করে ঠিক করা হয়েছে (দ্বিতীয় zip-এ)। **এই ফিক্সের পর
  typecheck/build/test ধাপ পাস করেছে কিনা ব্যবহারকারী স্পষ্টভাবে জানাননি**
  — তিনি সরাসরি Phase 2 শুরু করতে বলেছেন, তাই এগোনো হয়েছে; কোনো
  typecheck/build/test এরর এলে সেটা এখনো এই টাস্কেরই অংশ হিসেবে ঠিক করা
  লাগবে।
- [x] **Phase 2A সম্পন্ন** — ছাত্র create/update-এ fingerprintId/cardUid
  গ্রহণ (ব্যাকএন্ড, কোনো ফ্রন্টএন্ড এখনো না): `server/src/models/studentAdmission.js`-এ
  `TEXT_FIELDS`, `RETURNING_COLUMNS`, `LIST_COLUMNS`-এ দুই ফিল্ড যোগ (ঐচ্ছিক,
  `REQUIRED_FIELDS`-এ যোগ হয়নি); `server/src/routes/students.js`-এ
  `INSERT_COLUMNS`-এ যোগ (`UPDATE_COLUMNS` স্বয়ংক্রিয়ভাবে একই পায়,
  `documents` বাদে), `duplicateError()`-এ pre-check কোয়েরি (বার্তা:
  "This fingerprint ID/card UID is already linked to another student"),
  `constraintError()`-এ `students_fingerprint_id_unique`/`students_card_uid_unique`
  DB constraint ম্যাপিং (schema-তে Phase 1-এই ইনডেক্স দুটো ছিল, নতুন
  মাইগ্রেশন লাগেনি)। `node --check` দিয়ে সিনট্যাক্স যাচাই করা হয়েছে
  (sandbox-এ নেটওয়ার্ক বন্ধ, `npm run check` নিজে চালানো যায়নি)।
- [x] **Phase 2B সম্পন্ন** — ছাত্র প্রোফাইল ফর্মে fingerprintId/cardUid-এর
  সাধারণ (ম্যানুয়াল টাইপ) ইনপুট ফিল্ড: `client/src/types/index.ts`-এর
  `Student` টাইপে দুই ফিল্ড (এই কোডবেসে আলাদা `StudentAdmission` টাইপ
  নেই — `Students.tsx`-এর `AdmissionForm` সরাসরি `Student`-এর উপর
  বসানো, তাই `Student`-এ যোগ করাই যথেষ্ট)। `client/src/modules/Students.tsx`-এ:
  `emptyForm`-এ দুই ফিল্ড, ফর্মের স্টেপ-০ studentInfo সেকশনে
  birthRegistrationNumber-এর ঠিক পরে দুইটা `renderInput(...)` (ঐচ্ছিক
  লেবেল সহ), ডিটেইল-ভিউ রো-তেও যোগ। `saveAdmission()`-এর payload
  `{ ...form }` স্প্রেড করে বলে আলাদা কোনো ওয়্যারিং ছাড়াই সাবমিট হয়ে
  যায় (Phase 2A ব্যাকএন্ড এগুলো আগে থেকেই গ্রহণ করে)। `i18n/bn.ts` ও
  `i18n/en.ts`-এর `students` ব্লকে `fingerprintId`/`cardUid` লেবেল যোগ
  (key-parity যাচাই করা হয়েছে)। ব্রেস-ব্যালান্স যাচাই করা হয়েছে,
  sandbox-এ `npm run check` নিজে চালানো যায়নি।
- [x] **Phase 2C সম্পন্ন — Phase 2 সম্পূর্ণ শেষ** — "স্ক্যান করে বসান"
  এনরোলমেন্ট মোড। ব্যাকএন্ড: `server/src/routes/attendanceDevices.js`-এ
  নতুন `GET /:id/latest-scan` (staff-authenticated, "attendance"
  permission — router-লেভেলেই আছে, নতুন কিছু লাগেনি), সংখ্যাসূচক
  `attendance_devices.id` দিয়ে (PUT/regenerate-secret-এর মতোই, kiosk-এর
  পাবলিক এন্ডপয়েন্টের স্ট্রিং `deviceId`-এর মতো না) — সর্বশেষ
  `attendance_logs` রো-এর `punchAt`+raw `identifier` ফেরত দেয়।
  `server/src/routes/deviceAttendance.js`-এর `POST /punch`-এর
  matched-punch INSERT-এও এখন `identifier` কলাম সেভ হয় (আগে শুধু
  unmatched ব্রাঞ্চে হতো) — যাতে re-enrollment স্ক্যানেও রেসপন্স খালি না
  থাকে। ফ্রন্টএন্ড: `types/index.ts`-এ `AttendanceDeviceLatestScanResponse`,
  `api.ts`-এ `api.attendanceDevices.getLatestScan(id)`, নতুন
  `client/src/components/ScanEnrollModal.tsx` (`ScanEnrollButton` —
  স্ব-সম্পূর্ণ ট্রিগার-বাটন + মোডাল: ডিভাইস-ড্রপডাউন → "শুরু করুন" →
  ২ সেকেন্ড পোলিং, ৩০ সেকেন্ড টাইমআউট, রেসপন্স `punchAt` মোডাল-ওপেনিং
  সময়ের চেয়ে নতুন হলেই ক্যাপচার)। `Students.tsx`-এ fingerprintId/cardUid
  ইনপুটের পাশে বসানো (নতুন `.field-with-action` CSS ক্লাস,
  `index.css`)। `i18n/bn.ts`/`en.ts`-এর `attendanceDevices` ব্লকে
  `scan*` কী-গুলো যোগ (key-parity + ব্যবহৃত-কী উভয়ই যাচাই করা হয়েছে)।
  `node --check` (ব্যাকএন্ড) + ব্রেস-ব্যালান্স (ফ্রন্টএন্ড) দিয়ে
  যাচাই করা হয়েছে, sandbox-এ `npm run check` নিজে চালানো যায়নি।
- [x] **Phase 1/2A/2B/2C-এর `npm run check` এরর ফিক্সড** — ব্যবহারকারীর
  পাঠানো আসল রেজাল্টে শুধু একটাই এরর ছিল:
  `client/src/components/ScanEnrollModal.tsx`-এ `react-hooks/set-state-in-effect`
  (effect-এর ভেতর সরাসরি `setStatus`/`setDeviceId` কল করা হচ্ছিল)। ফিক্স:
  ওই দুইটা `setState` কল trigger-বাটনের `onClick` হ্যান্ডলারে (নতুন
  `openModal()` ফাংশন) সরানো হয়েছে, effect-টা এখন শুধু async ফেচ করে —
  কোনো নতুন state/ব্যবহারকারী-ফেসিং আচরণ বদলায়নি। ব্যবহারকারী পরে
  কনফার্ম করেছেন কমান্ড সফল হয়েছে (check পাস + commit + push)।
  `GuardianReminders.tsx`/`Results.tsx`-এর warning গুলো এই টাস্কের বাইরের
  পুরনো ফাইল, ছোঁয়া হয়নি।
- [x] **Phase 3A সম্পন্ন** — hardware-bridge UX উন্নতি, কোনো নতুন
  dependency ছাড়াই: `hardware-bridge/index.js`-এ (১) প্রতিটা `.env`
  ভ্যারিয়েবল (MADRASAH_API_BASE/DEVICE_ID/DEVICE_SECRET) আলাদা করে
  missing/blank *এবং* `.env.example`-এর নমুনা মান রয়ে গেছে কিনা যাচাই
  করে বাংলা+ইংরেজি উভয় ভাষায় নির্দিষ্ট এরর মেসেজ (আগে একটাই generic
  ইংরেজি লাইন ছিল, কোন ভ্যারিয়েবলে সমস্যা বলত না), (২) স্টার্টআপ
  self-check — `app.listen()`-এর পর `GET ${MADRASAH_API_BASE}/health`-এ
  (মূল সার্ভারের বিদ্যমান, auth ছাড়া পাবলিক রুট, `server/src/index.js`)
  একটা হালকা রিকোয়েস্ট পাঠিয়ে `{ok:true}` পেলে "✓ কনফিগারেশন ঠিক আছে"
  আর ভুল status/network এরর হলে "⚠ সতর্কতা" (কোনটাতে) প্রিন্ট করে — এই
  self-check কখনো bridge-কে ব্লক করে না (শুধু warning), যাতে সার্ভার
  bridge-এর পরে চালু হলেও bridge আটকে না থাকে। `hardware-bridge/README.md`
  সম্পূর্ণ rewrite — কোনো Node.js/npm পূর্বজ্ঞান ধরে নেওয়া হয়নি, প্রতিটা
  কমান্ডের ঠিক আগে "এটা কী করে" এক লাইনে বাংলায়, Node.js ইনস্টল করার
  ধাপও যোগ করা হয়েছে (আগে অনুপস্থিত ছিল)। `.env.example`-এ কোনো পরিবর্তন
  লাগেনি। `node --check` দিয়ে সিনট্যাক্স যাচাই করা হয়েছে — এই ফোল্ডার
  মূল `npm run check`-এর আওতার বাইরে (প্ল্যান ডকের section 3 অনুযায়ী),
  তাই ব্যবহারকারীকে আলাদাভাবে `cd hardware-bridge && npm install && npm start`
  চালিয়ে সেলফ-চেক মেসেজটা (✓ বা ⚠) দেখে কনফার্ম করতে হবে — কিন্তু তার
  জন্য আগে একটা ডিভাইস তৈরি করে deviceId/secretKey লাগবে, তাই এটা এখনই
  টেস্ট করা বাধ্যতামূলক না।
- [x] **Phase 3B সম্পন্ন (কোড রেডি — ব্যবহারকারীর মেশিনে বিল্ড/টেস্ট বাকি)**
  — ব্যবহারকারী কনফার্ম করেছেন এগোতে বলেছেন। `hardware-bridge/package.json`-এ
  `pkg` dev-dependency + `npm run build` স্ক্রিপ্ট (`pkg . --targets
  node18-win-x64 --output dist/madrasah-bridge.exe`), `"bin": "index.js"`
  + `pkg.assets`-এ `.env.example`। UX সিদ্ধান্ত: প্রথমবার-চালু-হলে-
  জিজ্ঞেস-করা টেক্সট-প্রম্পটের বদলে বিদ্যমান `.env` পদ্ধতিই রাখা হয়েছে
  (Notepad-এ এডিট করা যায়, নতুন কিছু শেখা লাগে না) — শুধু `index.js`-এ
  `BASE_DIR` লজিক যোগ (`process.pkg` থাকলে `path.dirname(process.execPath)`,
  না থাকলে আগের মতোই `__dirname`) যাতে প্যাকেজড exe চলার সময় `.env` ও
  `raw-requests.log` exe-এর pkg স্ন্যাপশটের বদলে exe-এর পাশের আসল
  ফোল্ডারে পড়া/লেখা হয় — `npm start` (non-packaged) পথের আচরণ অপরিবর্তিত।
  `.env`-missing এরর মেসেজে exe-প্রসঙ্গের একটা লাইন যোগ। README-এ নতুন
  "এক-ফাইল প্রোগ্রাম (.exe)" সেকশন — বিল্ড কমান্ড, exe+.env পাশাপাশি
  রাখার নিয়ম, রান করার ধাপ, ও স্পষ্ট নোট যে এই পদ্ধতি এখনো আসল Windows
  মেশিনে টেস্ট করা হয়নি। রুট `.gitignore`-এ `dist/`/`.env` আগে থেকেই ছিল,
  পরিবর্তন লাগেনি। `node --check`/`JSON.parse` দিয়ে সিনট্যাক্স/JSON
  যাচাই করা হয়েছে — sandbox-এ নেটওয়ার্ক বন্ধ থাকায় `pkg` নিজে ইনস্টল/রান
  করে আসল exe বানিয়ে টেস্ট করা সম্ভব হয়নি (প্ল্যান ডকের অ্যাসাম্পশন
  অনুযায়ীই — এই সাব-ফেজ পুরোপুরি ব্যবহারকারীর নিজের Windows মেশিনে
  বিল্ড+টেস্ট করা লাগবে)।
- [x] **Phase 3B ব্যবহারকারীর মেশিনে বিল্ড+টেস্ট — সফল, Phase 3 সম্পূর্ণ শেষ**
  — ব্যবহারকারী নিজের Windows মেশিনে `npm install && npm run build`
  চালিয়ে `dist/madrasah-bridge.exe` বানিয়েছেন, পাশে `.env` (আসল
  `MADRASAH_API_BASE=https://tajdidul-iman.oriluxbd.com/api`,
  `DEVICE_ID=main-gate-1`, real secretKey) রেখে exe ডাবল-ক্লিকে চালিয়ে
  টার্মিনালে `[bridge] ✓ কনফিগারেশন ঠিক আছে, সার্ভার সাড়া দিচ্ছে`
  কনফার্ম করেছেন — অর্থাৎ `BASE_DIR`/pkg লজিক, `.env` লোডিং, ও
  self-check তিনটাই আসল packaged exe-তে ঠিকমতো কাজ করছে। শুধু একটা
  নিরীহ Node.js `ExperimentalWarning: Fetch API` লাইন এসেছে (এরর না,
  উপেক্ষাযোগ্য — `fetch` স্বাভাবিকভাবেই কাজ করেছে)। এখনো বাকি: আসল
  ফিঙ্গারপ্রিন্ট/কার্ড হার্ডওয়্যার থেকে punch পাঠিয়ে
  `raw-requests.log`/matching যাচাই করা — কিন্তু সেটা আসল ডিভাইস হাতে
  আসা সাপেক্ষে, এই সাব-ফেজের স্কোপের বাইরে (README-এর "কাজ না করলে কী
  করবেন" অংশে আগে থেকেই কভার করা)।

- [x] **Phase 4 (4A + 4B) সম্পন্ন — সেলফ-সার্ভিস টাস্কের ৪টা Phase-ই এখন
  শেষ।** নতুন `client/src/modules/AttendanceDeviceGuide.tsx` —
  `/attendance-devices/guide` রুটে (App.tsx-এ lazy রুট যোগ), Phase 1-এর
  `AttendanceDevices.tsx`-এ "গাইড দেখুন" বাটন থেকে পৌঁছানো যায়
  (`guideLink` i18n কী)। চারটা নাম্বার-করা ধাপের কার্ড
  (`components/ui`-এর `Card`/`Button` দিয়ে, কোনো raw `style={{}}` নেই):
  (১) ডিভাইস যোগ করা (Phase 1 ফর্ম রেফারেন্স), (২) hardware-bridge
  কানেক্ট করা (Phase 3, exe/self-check মেসেজ রেফারেন্স করে), (৩) ছাত্র
  এনরোলমেন্ট (Phase 2C-এর "স্ক্যান করে বসান" বাটন রেফারেন্স করে), (৪)
  কিয়স্ক স্ক্রিন খোলা (kiosk URL প্যাটার্ন দেখায়)। Phase 4B ভিজ্যুয়াল
  সিদ্ধান্ত অনুযায়ী icon-ভিত্তিক (lucide, `lib/icons.ts` থেকে
  `add`/`bridge`/`fingerprint`/`kiosk`/`checkCircle`/`chevronLeft`) —
  কোনো নতুন asset/screenshot লাগেনি। নতুন `.device-guide__*` CSS ক্লাস
  `index.css`-এ। `i18n/bn.ts`+`en.ts`-এ নতুন `attendanceDeviceGuide`
  ব্লক (১৫টা কী, key-parity স্ক্রিপ্ট দিয়ে যাচাই করা হয়েছে) — প্রতিটা
  ধাপের টেক্সট Phase 1-3-এর আসল UI/ফ্লো-র সাথে মিলিয়ে পড়া হয়েছে
  (ভুল স্ক্রিন-রেফারেন্স নেই)। ব্র্যাকেট-ব্যালান্স স্ক্রিপ্ট দিয়ে
  `.tsx` ফাইল যাচাই করা হয়েছে, ব্যবহৃত সব CSS কাস্টম প্রপার্টি
  (`--slate-l`, `--brand`, `--text`, `--muted`) `index.css`-এ সংজ্ঞায়িত
  পাওয়া গেছে। **`npm run check` এই এজেন্ট চালায়নি (sandbox-এ
  network/node_modules নেই) — এই ডেলিভারির প্যাকেজড CMD-তেই প্রথম
  যাচাই হবে, আগের সব Phase-এর প্যাটার্নে।**

### বাকি
- [ ] (খালি — সেলফ-সার্ভিস টাস্কের ৪টা Phase-ই সম্পন্ন)

### নোট
এই টাস্ক `ATTENDANCE_DEVICE_PLAN.md`-এর ব্যাকএন্ড (attendance_devices/
attendance_logs টেবিল, `POST /api/device/punch`, `GET
/device/latest-punch/:deviceId`, `attendanceDevices.js` API, কিয়স্ক পেজ)
পুরোপুরি রিইউজ করে — সেগুলো এই টাস্কে আবার লেখা হবে না, শুধু তার উপরে
মিসিং UI/UX (অ্যাডমিন পেজ, ছাত্র-ফর্ম ফিল্ড, এনরোলমেন্ট-মোড, সহজ
bridge, গাইড) যোগ হচ্ছে।

---

## Task: ফিঙ্গারপ্রিন্ট/কার্ড ডিভাইস দিয়ে হাজিরা — ৫ ভাগে, পুরো পরিকল্পনা
`docs/ATTENDANCE_DEVICE_PLAN.md`-এ (ad-hoc, নিচের সব এন্ট্রির সাথে
অসম্পর্কিত — আলাদা ফাইল/এলাকা, তাই আলাদা এন্ট্রি, AGENTS.md-এর নিয়ম
অনুযায়ী পুরনো এন্ট্রি অপরিবর্তিত রাখা হয়েছে)

## Status: IN_PROGRESS (Phase 1–4 সম্পন্ন — Phase 5 আংশিক/অপরীক্ষিত, আসল ডিভাইসের অপেক্ষায়)

Started: 2026-08-11

দেখুন `docs/ATTENDANCE_DEVICE_PLAN.md` — সম্পূর্ণ প্রেক্ষাপট, ৫টা Phase-এর
বিস্তারিত ব্রেকডাউন, ও Phase 1 শুরুর সময় কনফার্ম হওয়া অ্যাসাম্পশন সেখানে আছে।

### Phase 1 (DB স্কিমা: ডিভাইস, পাঞ্চ-লগ, ছাত্র-ম্যাপিং) — সম্পন্ন (2026-08-11)
- [x] `server/sql/supabase_schema.sql` (protected path — AGENTS.md রুল ৪
  অনুযায়ী, এই কাজেরই অংশ বলে প্ল্যান ফাইলে আগেই ফ্ল্যাগ করা হয়েছিল, তাই
  সরাসরি এগোনো হয়েছে):
  - `students`-এ `alter table ... add column if not exists` দিয়ে
    `"fingerprintId" text`, `"cardUid" text` (বিদ্যমান `admissionNumber`
    ইত্যাদির ঠিক প্যাটার্নে) + দুটোরই partial unique index (null/খালি
    বাদ দিয়ে)।
  - নতুন `attendance_devices` টেবিল (`deviceId` ইউনিক, `secretKey`,
    `name`, `location`, `active`, `createdAt`) — `attendance` টেবিলের
    ঠিক নিচে বসানো হয়েছে (সম্পর্কিত বলে)।
  - নতুন `attendance_logs` টেবিল (`studentId` fk cascade, `deviceId` fk
    set-null, `punchAt`, `direction` nullable, `method` default
    'fingerprint') + `(studentId, punchAt)`-এর উপর ইনডেক্স। raw ইভেন্ট,
    কখনো আপডেট/ডিলিট হবে না — দৈনিক `attendance.status` এখান থেকেই
    ডেরাইভ হবে Phase 2-এ (এই টেবিল দুটো এখনো কোনো রাউট থেকে ব্যবহৃত হচ্ছে
    না, শুধু স্কিমা)।
  - `server/src/tenantProvision.js` যাচাই করে দেখা হয়েছে — এটা এই একই
    `supabase_schema.sql` ফাইল পড়ে নতুন প্রতিষ্ঠানের schema বানায়, তাই
    নতুন কোনো প্রতিষ্ঠানের জন্য আলাদা কিছু করা লাগেনি; বিদ্যমান
    প্রতিষ্ঠানগুলো এই `alter table`/`create table if not exists`
    স্টেটমেন্টগুলো পরের বার schema sync/deploy-এ স্বয়ংক্রিয়ভাবে পাবে
    (বাকি সব রেট্রোঅ্যাকটিভ ফিক্সের মতোই)।
- Python দিয়ে ব্র্যাকেট/প্যারেন্থেসিস ব্যালান্স চেক করা হয়েছে (সমান
  পাওয়া গেছে) — **আসল Postgres-এ এই SQL প্রথম চলবে আপনার প্যাকেজড CMD-তে
  (`npm run check` + schema sync), sandbox-এ যাচাই সম্ভব না, আগের সব
  স্কিমা-পরিবর্তনের মতোই।**

### Phase 2 (ডিভাইস API — ব্যাকএন্ড, নতুন unauthenticated রুট) — সম্পন্ন (2026-08-11)
- [x] `server/src/lib/opsSchemas.js` — নতুন `devicePunchSchema`,
  `attendanceDeviceCreateSchema`, `attendanceDeviceUpdateSchema` (Zod),
  বিদ্যমান স্কিমাগুলোর ঠিক পাশে, একই ফাইলে (ফাইলের হেডার কমেন্ট অনুযায়ী
  এটাই attendance-domain ভ্যালিডেশনের catch-all)।
- [x] নতুন `server/src/routes/deviceAttendance.js` — ডিভাইসের নিজস্ব
  পাবলিক এন্ডপয়েন্ট (স্টাফ JWT নেই বলে `deviceId`+`secretKey` দিয়ে নিজস্ব
  অথ):
  - `POST /api/device/punch` — ডিভাইস অথেন্টিকেট করে,
    `identifierType` অনুযায়ী `fingerprintId`/`cardUid` দিয়ে ছাত্র খুঁজে,
    `attendance_logs`-এ ইনসার্ট করে, দিনের প্রথম পাঞ্চ কিনা চেক করে (`LIKE`
    দিয়ে date-prefix ম্যাচ, যেহেতু `punchAt` টেক্সট কলাম), `attendance`
    টেবিলে সেই একই `ON CONFLICT ("studentId", date) DO UPDATE` upsert
    (routes/attendance.js-এর সাথে হুবহু মিলিয়ে, যাতে ডিভাইস-হাজিরা আর
    ম্যানুয়াল হাজিরা কখনো আলাদা লজিকে না চলে), `recordAudit()`, এবং
    প্রথম পাঞ্চ হলে ও ফোন নম্বর থাকলে `sendGuardianSms()`
    (`notificationType: "attendancePunch"` — settings-পেজ টগল Phase 3-এ)।
  - `GET /api/device/latest-punch/:deviceId` — কিয়স্ক পোলিং-এর জন্য (Phase
    4), সর্বশেষ পাঞ্চের ছাত্র-ইনফো ফেরত দেয়।
  - দুটোই আলাদা rate limiter সহ (`devicePunchLimiter`,
    `deviceLatestLimiter`, ৬০/মিনিট)।
- [x] নতুন `server/src/routes/attendanceDevices.js` — Admin-facing ডিভাইস
  ম্যানেজমেন্ট (authenticated চেইনের ভেতরে, `requirePermission("attendance")`):
  `GET /`, `POST /` (নতুন ডিভাইস + `crypto.randomBytes` দিয়ে জেনারেটেড
  `secretKey`, শুধু creation/regenerate রেসপন্সেই ফেরত আসে — list-এ না),
  `PUT /:id` (name/location/active আপডেট), `POST /:id/regenerate-secret`।
  ডুপ্লিকেট `deviceId`-এ Postgres 23505 ধরে ৪০৯ রেসপন্স
  (payments_receipt_unique-এর প্যাটার্নে)। প্রতিটা সংবেদনশীল অ্যাকশনে
  `recordAudit()`।
- [x] `server/src/index.js` — `/api/device` নতুন unauthenticated রাউট
  `/api/guardian-auth`-এর ঠিক পরে, `requireAuth` চেইনের আগে মাউন্ট করা
  হয়েছে (tenantResolve-এর পরে, তাই মাল্টি-টেন্যান্ট মোডে ডিভাইসের
  রিকোয়েস্টও Host-ভিত্তিক স্বাভাবিক তেন্যান্ট-রেজোলিউশনই পায় — কোনো
  `isSkippedPath()` এন্ট্রি লাগেনি, যেটা প্ল্যান ফাইলে "এই ধাপেই ঠিক হবে"
  বলে রাখা হয়েছিল)। `/api/attendance-devices` authenticated চেইনে
  `/api/attendance`-এর ঠিক পরে যোগ হয়েছে।
- [x] `server/src/config/roles.js` — `ROUTE_PERMISSION`-এ
  `"/api/attendance-devices": "attendance"` (নতুন কোনো permission bucket
  বানানো হয়নি, প্ল্যানের ধারা ৩-এর সিদ্ধান্ত অনুযায়ী)। `npm run check`
  চললে `client/src/lib/roles.generated.ts` স্বয়ংক্রিয়ভাবে সিঙ্ক হবে
  (কখনো হাতে এডিট করা হয়নি, AGENTS.md রুল ৩)।
- সবগুলো পরিবর্তিত/নতুন `.js` ফাইল `node --check` দিয়ে সিনট্যাক্স-পাস
  (sandbox-এ node আছে, কিন্তু `node_modules`/network নেই বলে zod ইত্যাদি
  আসলে `require()` করে লোড-টেস্ট করা যায়নি) — **পুরো `npm run check` ও
  আসল একটা টেস্ট-পাঞ্চ পাঠিয়ে ম্যানুয়াল যাচাই আপনার প্যাকেজড CMD-তেই প্রথম
  হবে।**

### Phase 3 (গার্জিয়ান SMS হুক — settings-পেজ ইন্টিগ্রেশন) — সম্পন্ন (2026-08-11)
- [x] `server/src/routes/sms.js` — `NOTIFICATION_TYPES`-এ `"attendancePunch"`
  যোগ (বিদ্যমান তিনটা টাইপ অপরিবর্তিত)। `getPrefs()`/`PUT
  /notification-prefs` কোনো কোড-চেঞ্জ ছাড়াই এই নতুন টাইপ স্বয়ংক্রিয়ভাবে
  ধরে নেয় (দুটোই `NOTIFICATION_TYPES` লুপ করে), যেমনটা ফাইলের হেডার
  কমেন্টে বলা আছে। এখন থেকে অ্যাডমিন সেটিংস পেজ থেকে এই টাইপ বন্ধ/চালু
  করতে পারবেন — আগে ডিফল্ট চালু থাকলেও টগল করার উপায় ছিল না।
- [x] `client/src/types/index.ts` — `SmsNotificationPrefs`-এ
  `attendancePunch: boolean` যোগ।
- [x] `client/src/modules/SmsSettings.tsx` — `togglePref`-এর key union-এ
  `"attendancePunch"` যোগ, ও notification-settings কার্ডে বিদ্যমান তিনটা
  checkbox-row-এর ঠিক প্যাটার্নে চতুর্থ checkbox-row যোগ (কোনো নতুন
  `style={{...}}` লাগেনি, `checkbox-row` ক্লাস রিইউজ — AGENTS.md ডিজাইন-
  সিস্টেম রুল মেনে)।
- [x] `client/src/i18n/bn.ts` ও `en.ts` — দুটোতেই `notifyAttendancePunch`
  key যোগ (বিদ্যমান তিন `notify*` key-এর ঠিক পাশে, দুই ফাইলে key-parity
  বজায় রেখে)। "exit" SMS টাইপ এই ধাপে যোগ হয়নি — প্ল্যানের ধারা ৩ অনুযায়ী
  ইচ্ছাকৃতভাবে শুধু entry-punch, ভবিষ্যতে আলাদা কাজ হিসেবে যোগ হবে।
- `node --check` দিয়ে `sms.js`-এর সিনট্যাক্স যাচাই + বাকি চারটা
  `.ts`/`.tsx` ফাইলে bracket/parenthesis ব্যালান্স চেক (sandbox-এ
  node_modules/tsc নেই বলে আসল typecheck/lint/build সম্ভব হয়নি)।
  **পুরো `npm run check` আপনার প্যাকেজড CMD-তেই প্রথম চলবে, আগের সব
  ধাপের মতোই।**

### Phase 2 রিটোঅ্যাকটিভ ফিক্স (2026-08-11, ব্যবহারকারীর CMD চালিয়ে ধরা পড়েছে)
- ব্যবহারকারীর মেশিনে `npm run check`-এর `test:unit` ধাপে
  `server/src/middleware/__tests__/rbac.test.js`-এর
  `"the expectations table above covers every currently-gated route"`
  টেস্ট ফেল করেছিল — সেই ফাইলের হাতে-লেখা `EXPECTED_ALLOWED` টেবিল
  `ROUTE_PERMISSION`-এর প্রতিটা কী-এর বিরুদ্ধে পিন করে রাখে (দেখুন ফাইলের
  নিজস্ব হেডার কমেন্ট), Phase 2-এ `/api/attendance-devices` যোগ করার সময়
  এই টেবিলে এন্ট্রি যোগ করা হয়নি বলে মিসম্যাচ।
- **ফিক্স:** `EXPECTED_ALLOWED`-এ `"/api/attendance-devices": ["Super
  Admin", "Admin", "Teacher", "Hostel Manager"]` যোগ — `/api/attendance`-এর
  ঠিক একই তালিকা, কারণ দুটোই একই `"attendance"` permission শেয়ার করে
  (`ROUTE_PERMISSION`-এ), তাই `canAccess()` উভয় রুটে একই রোল-সেট অনুমোদন
  করে। এখানে একটা লক্ষণীয় ব্যাপার: Teacher-এরও এই ডিভাইস-ম্যানেজমেন্ট
  রুটে অ্যাক্সেস থাকবে (নতুন permission bucket না বানিয়ে বিদ্যমান
  "attendance" রিইউজ করার সরাসরি ফলাফল, প্ল্যান ফাইলের ধারা ৩-এর
  সিদ্ধান্ত অনুযায়ী — ইচ্ছাকৃত, বাগ না)।
- `node --check` দিয়ে ফাইলটার সিনট্যাক্স যাচাই করা হয়েছে (sandbox-এ
  vitest চালানো সম্ভব না)। **এই ফিক্স-সহ `npm run check` আবার চালিয়ে
  `test:unit` পাস করছে কিনা যাচাই করা লাগবে আপনার CMD-তে।**

### Phase 4 (কিয়স্ক মনিটর UI — ফ্রন্টএন্ড) — সম্পন্ন (2026-08-12)
- [x] নতুন `client/src/pages/kiosk/Kiosk.tsx`, রুট `/kiosk/:deviceId` —
  `App.tsx`-এ বিদ্যমান `lazy()` প্যাটার্নে যোগ, কিন্তু `<ProtectedRoute>`-এর
  বাইরে (`/result`-এর ঠিক প্যাটার্নে) — ট্যাবলেট লগইন-স্ক্রিনে বসে থাকবে
  না বলে এই একটা রুট ইচ্ছাকৃতভাবে পাবলিক।
- [x] `GET /api/device/latest-punch/:deviceId`-এ ২ সেকেন্ড পোলিং (প্ল্যানের
  ধারা ৩-এর সিদ্ধান্ত, WebSocket না)। idle অবস্থায় ঘড়ি (প্রতি সেকেন্ডে
  আপডেট) + প্রতিষ্ঠানের নাম/লোগো (`usePublicSite`, বিদ্যমান হুক)। নতুন
  পাঞ্চ এলে (আগের `punchAt`-এর সাথে না মিললে) ছাত্রের ছবি
  (`cloudinaryResize` রিইউজ, `f_auto,q_auto,w_500` — Home/Gallery-এর ঠিক
  প্যাটার্নে) + নাম + ক্লাস-শাখা-রোল + পাঞ্চ-সময় দেখিয়ে ৩ সেকেন্ড পর
  আবার idle-এ ফেরত। ছবি না থাকলে নামের প্রথম অক্ষর দিয়ে placeholder।
- [x] `client/src/lib/api.ts`-এ নতুন `api.device.getLatestPunch()` (নতুন
  `device` নেমস্পেস, `guardian` নেমস্পেসের ঠিক প্যাটার্নে) —
  ডিভাইস-কিয়স্কের কোনো session/cookie নেই বলে আলাদা রাখা হয়েছে।
- [x] `client/src/types/index.ts`-এ `KioskPunchStudent`, `KioskPunch`,
  `KioskLatestPunchResponse` — সার্ভারের `GET /latest-punch/:deviceId`
  রেসপন্স শেপের সাথে হুবহু মিলিয়ে।
- [x] `client/src/index.css`-এ নতুন `.kiosk*` ক্লাস (idle/punch/error তিন
  অবস্থার জন্য) — কোনো নতুন ফাইলে `style={{...}}` বসেনি, AGENTS.md-এর
  mandatory ডিজাইন-সিস্টেম রুল মেনে (এই নতুন ফাইল legacy-exemption
  লিস্টে নেই, `client/eslint.config.js`-এর `no-restricted-syntax` থেকে
  ছাড় পায়নি)।
- **জানা সীমাবদ্ধতা (এই ধাপে ইচ্ছাকৃতভাবে ছোঁয়া হয়নি):** অজানা
  fingerprintId/cardUid দিয়ে পাঞ্চ করলে Phase 2-এর `POST /device/punch`
  ৪০৪ দেয় কিন্তু `attendance_logs`-এ কিছু লেখে না, তাই কিয়স্কের polling
  endpoint-এর কাছে সেই ব্যর্থ পাঞ্চের কোনো তথ্যই পৌঁছায় না — প্ল্যানের
  ধারা ৪-এ বলা "ছাত্র খুঁজে পাওয়া যায়নি" বার্তা তাই এখনো দেখানো সম্ভব না।
  এটা ঠিক করতে হলে Phase 2-এর ব্যাকএন্ড/স্কিমা ছুঁতে হবে, যেটা এই
  frontend-only ধাপের scope-এর বাইরে (AGENTS.md রুল ১) — তাই silently
  ফিক্স না করে এখানে ফ্ল্যাগ করা হলো। কিয়স্ক শুধু ডিভাইস-নট-ফাউন্ড
  (৪০৪, ভুল/ডিঅ্যাক্টিভেটেড deviceId) কেসটা আলাদাভাবে দেখায় ("এই স্ক্রিনটি
  কোনো হাজিরা-ডিভাইসের সাথে যুক্ত নেই") — ক্ষণস্থায়ী নেটওয়ার্ক-ত্রুটি
  চুপচাপ পরের পোলে রিট্রাই হয়।
- bracket/parenthesis ব্যালান্স চেক পাস করেছে সবগুলো পরিবর্তিত/নতুন
  `.tsx`/`.ts`/`.css` ফাইলে (sandbox-এ node_modules/tsc/vite নেই বলে আসল
  lint/typecheck/build সম্ভব হয়নি)। **পুরো `npm run check` আপনার
  প্যাকেজড CMD-তেই প্রথম চলবে, আগের সব ফেজের মতোই।**

### Phase 5 (হার্ডওয়্যার bridge — প্রাথমিক/generic, ব্র্যান্ড অজানা) —
আংশিক, 2026-08-12
- [x] `hardware-bridge/` — নতুন standalone Node.js প্রজেক্ট (মূল
  root/client/server-এর `npm install`/`npm run check`-এর বাইরে, নিজস্ব
  `package.json`, express+dotenv নির্ভরতা)। ব্যবহারকারী ডিভাইসের
  ব্র্যান্ড এখনো ঠিক করেননি বলে push/ADMS-ধরনের প্রোটোকল (অনেক সাশ্রয়ী
  ফিঙ্গারপ্রিন্ট ডিভাইস/ক্লোন যেটা ব্যবহার করে) ধরে একটা generic
  সংস্করণ বানানো হয়েছে — user-এর স্পষ্ট সিদ্ধান্ত অনুযায়ী (push vs pull
  আলোচনার পর)।
  - `hardware-bridge/index.js`: `GET /iclock/cdata` (হ্যান্ডশেক),
    `POST /iclock/cdata?table=ATTLOG` (পাঞ্চ ডাটা পার্স করে প্রতিটা
    রেকর্ড `POST /api/device/punch`-এ ফরওয়ার্ড করে), `GET
    /iclock/getrequest` (কমান্ড পোলিং, খালি "OK")। সব রিকোয়েস্ট
    `raw-requests.log`-এ লগ হয় — আসল ডিভাইস কানেক্ট হওয়ার পর dialect
    মেলানো/অ্যাডজাস্ট করার জন্য এটাই মূল টুল।
  - `hardware-bridge/.env.example`: `BRIDGE_PORT`, `MADRASAH_API_BASE`,
    `DEVICE_ID`, `DEVICE_SECRET`, `IDENTIFIER_TYPE`।
  - `hardware-bridge/README.md`: সেটআপ ধাপ, PIN↔fingerprintId ম্যাচিং
    নিয়ম, ও ডিভাইসটা যদি push/ADMS না হয়ে pull/SDK বা
    keyboard-emulation টাইপ বের হয় তাহলে কী করতে হবে তার নোট।
  - `.gitignore`-এ `hardware-bridge/raw-requests.log` যোগ (bulk
    `node_modules/`/`.env` প্যাটার্ন আগে থেকেই path-agnostic বলে এমনিতেই
    কভার করছিল)।
- **সম্পূর্ণ অপরীক্ষিত** — আসল হার্ডওয়্যার হাতে নেই বলে sandbox বা
  ব্যবহারকারীর মেশিন কোথাও থেকেই টেস্ট করা যায়নি। `node --check` দিয়ে
  শুধু সিনট্যাক্স যাচাই হয়েছে। এই ফোল্ডার মূল অ্যাপের `npm run check`-এর
  scope-এর বাইরে (`scripts/check-server.js` শুধু `server/src` স্ক্যান
  করে) বলে প্যাকেজড CMD-তেও এটা যাচাই হবে না — আলাদাভাবে `cd
  hardware-bridge && npm install && npm start` চালিয়ে টেস্ট করতে হবে।

### বাকি (পরের এজেন্ট এখান থেকে চালিয়ে যাবে)
- [ ] আসল ডিভাইস কেনার/ব্র্যান্ড-মডেল জানার পর: `raw-requests.log`
  ব্যবহারকারীর কাছ থেকে নিয়ে `hardware-bridge/index.js`-এর
  হ্যান্ডশেক/ATTLOG-পার্সিং আসল ডিভাইসের dialect-এর সাথে মেলানো/
  অ্যাডজাস্ট করা, অথবা ডিভাইস pull/SDK বা keyboard-emulation টাইপ হলে
  সম্পূর্ণ ভিন্ন পদ্ধতিতে (README-এর নোট দেখুন) নতুন করে বানানো। Phase 4
  কিয়স্ক পেজে টেস্ট পাঞ্চ দিয়ে end-to-end (ডিভাইস → bridge → API →
  কিয়স্ক স্ক্রিন → গার্জিয়ান SMS) যাচাই এই ধাপেই হবে।

### Phase 2/4 ফিক্স — অজানা স্ক্যানের "ছাত্র খুঁজে পাওয়া যায়নি" (2026-08-12,
ব্যবহারকারীর অনুরোধে, Phase 4-এর সাথে ধরা পড়া জানা সীমাবদ্ধতা)
- Phase 4-এর প্রথম ডেলিভারিতে ফ্ল্যাগ করা গ্যাপ: অজানা fingerprintId/
  cardUid দিয়ে পাঞ্চ করলে ব্যাকএন্ড কোথাও লগ করত না, তাই কিয়স্ক সেই
  ব্যর্থ স্ক্যান সম্পর্কে কিছুই জানতে পারত না।
- **ফিক্স (protected path — `server/sql/supabase_schema.sql`, AGENTS.md
  রুল ৪ অনুযায়ী স্পষ্টভাবে জানিয়ে এগোনো হলো, এই পুরো ফিচারের জন্যই আগে
  ফ্ল্যাগ করা ব্যতিক্রম, প্ল্যান ফাইলের ধারা ৫ দেখুন):**
  - `attendance_logs.studentId` এখন nullable (আগে `not null`), + দুটো নতুন
    কলাম: `matched boolean not null default true`, `identifier text`।
    বিদ্যমান tenant-দের জন্য idempotent `alter table` ব্লক (payments-এর
    2026-08-05 nullable-fix-এর ঠিক প্যাটার্নে) — নতুন ইনস্টলে এমনিতেই
    `create table` স্টেটমেন্ট থেকেই পাবে।
  - `server/src/routes/deviceAttendance.js`-এর `POST /punch`: ছাত্র না
    পাওয়া গেলে এখন `attendance_logs`-এ একটা রো ইনসার্ট হয়
    (`studentId NULL, matched false, identifier <যা স্ক্যান হয়েছিল>`) —
    রেসপন্স আগের মতোই ৪০৪ + একই এরর মেসেজ, ডিভাইস/bridge-এর জন্য কোনো
    ব্রেকিং চেঞ্জ নেই।
  - `GET /latest-punch/:deviceId`: `JOIN students` থেকে `LEFT JOIN
    students`-এ বদলানো হয়েছে (নাহলে unmatched রো — যার studentId null —
    কোয়েরি থেকে বাদ পড়ে যেত)। রেসপন্সে এখন `matched` বুলিয়ান আছে;
    `matched: false` হলে `student: null`।
  - `client/src/types/index.ts`-এর `KioskPunch`-এ `matched: boolean` +
    `student: KioskPunchStudent | null` (আগে student সবসময় present
    ধরা হতো)।
  - `client/src/pages/kiosk/Kiosk.tsx`: পাঞ্চ-স্টেটে `matched` চেক করে
    হয় ছাত্রের কার্ড, নয়তো লাল "ছাত্র খুঁজে পাওয়া যায়নি" কার্ড দেখায়
    (`.kiosk__photo--unmatched` নতুন ক্লাস, `index.css`) — idle-এ ফেরার
    ৩ সেকেন্ডের টাইমার/পোলিং লজিক অপরিবর্তিত।
  - `attendanceSaveSchema`/`devicePunchSchema` কোনোটাই ছোঁয়া হয়নি —
    রিকোয়েস্ট শেপ একই আছে, শুধু সার্ভার-সাইড হ্যান্ডলিং বদলেছে।
- `node --check` দিয়ে `deviceAttendance.js`-এর সিনট্যাক্স যাচাই +
  bracket-balance চেক বাকি সব পরিবর্তিত `.ts`/`.tsx`/`.css`/`.sql` ফাইলে
  (sandbox-এ আসল Postgres/node_modules নেই)। **পুরো `npm run check` +
  schema sync (নতুন কলাম আসলে বসছে কিনা) আপনার প্যাকেজড CMD-তেই প্রথম
  যাচাই হবে, আগের সব ধাপের মতোই।**

### নোট
Phase 4 শেষে কিয়স্ক পেজ পরীক্ষা করতে আসল ডিভাইস লাগবে না — যেকোনো
ব্রাউজারে `/kiosk/<একটা বিদ্যমান deviceId>` খুলে, তারপর
Phase 2-এর `POST /api/device/punch`-এ curl/Postman দিয়ে টেস্ট পাঞ্চ পাঠিয়ে
(deviceId+secretKey লাগবে, attendanceDevices ম্যানেজমেন্ট রাউট থেকে
জেনারেট করা) ২ সেকেন্ডের মধ্যে ছবি/নাম কিয়স্ক স্ক্রিনে আসছে কিনা দেখলেই
হবে।

---



## Task: "রিস্ক জোন" — ২+ মাস বেতন বকেয়া ছাত্রদের আলাদা লিস্ট, ৩ ভাগে,
পুরো পরিকল্পনা `docs/RISK_ZONE_PLAN.md`-এ (ad-hoc, নিচের exam-type
এন্ট্রির সাথে অসম্পর্কিত — আলাদা ফাইল/এলাকা, তাই আলাদা এন্ট্রি,
AGENTS.md-এর নিয়ম অনুযায়ী পুরনো এন্ট্রি অপরিবর্তিত রাখা হয়েছে)

## Status: DONE (Phase 1, Phase 2, Phase 3 সম্পন্ন — 2026-08-13)

Started: 2026-08-10

### Phase 1 (ব্যাকএন্ড: "কত মাস বকেয়া" হিসাব + API) — সম্পন্ন (2026-08-10)
- [x] `server/src/routes/dashboard.js` — stats কোয়েরিতে নতুন `riskCount`
  (কতজন সক্রিয় ছাত্রের `FLOOR(due/fee) >= 2`) ও `riskTotalDue` (তাদের
  সঞ্চিত বকেয়ার যোগফল) যোগ করা হয়েছে, বিদ্যমান `totalDue`/`dueCount`
  অপরিবর্তিত। JS ভ্যারিয়েবল এক্সট্র্যাকশন ও রেসপন্সের `stats`-এ যোগ।
- [x] `server/src/routes/students.js` — `GET /api/students`-এ নতুন
  `riskOnly` ফিল্টার (`dueOnly`-এর ঠিক প্যাটার্নে): `status = 'Active'
  AND fee > 0 AND FLOOR(due::numeric / fee) >= 2`। পাশাপাশি একটা নতুন
  computed কলাম `monthsUnpaid` (`FLOOR(due::numeric / NULLIF(fee,0))`)
  উভয় SELECT-এ (paginated ও non-paginated) যোগ হয়েছে — `LIST_COLUMNS`
  নিজে বদলানো হয়নি (এটা `routes/hifz.js`-ও ব্যবহার করে, সেখানে এই
  কলামের দরকার নেই), বরং লোকাল `selectColumns = LIST_COLUMNS + ...`
  ভ্যারিয়েবল বানানো হয়েছে। `dueOnly`-এর মতোই `riskOnly`-তেও
  `orderBy = "due DESC, roll"` ও পেজিনেটেড রেসপন্সে `totalDue` যোগ হয়।
- **প্ল্যান থেকে একটা সংশোধন:** `RISK_ZONE_PLAN.md`-এর SQL খসড়ায়
  `status = 'সক্রিয়'` অনুমান করা হয়েছিল, কিন্তু আসল কোড
  (`client/src/modules/Students.tsx`-এর status dropdown, ও
  `server/src/routes/students.js`-এর admission default) যাচাই করে
  দেখা গেছে student status কলামের আসল ভ্যালু ইংরেজি `'Active'`/`'Inactive'`
  (Bengali label শুধু UI-তে দেখানো হয়, কলামে সংরক্ষিত হয় না) — তাই
  বাস্তবায়নে `status = 'Active'` ব্যবহার করা হয়েছে, প্ল্যানের বাংলা
  অনুমান না।
- [x] `node -c` দিয়ে দুটো পরিবর্তিত ফাইল সিনট্যাক্স-চেক পাস।
- **যাচাই করা যায়নি (sandbox-এ network/node_modules নেই):** পুরো
  `npm run check`, আসল DB-তে হিসাবটা সঠিক আসছে কিনা — ব্যবহারকারীর
  প্যাকেজড CMD চালানোর সময় প্রথম যাচাই হবে।

### Phase 2 (ফ্রন্টএন্ড: ড্যাশবোর্ড কার্ড + রিস্ক-জোন লিস্ট ভিউ) — সম্পন্ন (2026-08-11)
- [x] `client/src/types/index.ts` — `DashboardData.stats`-এ `riskCount`/
  `riskTotalDue` (Phase 1-এর API রেসপন্সের সাথে মিলিয়ে), `Student`-এ
  অপশনাল `monthsUnpaid` যোগ (সব `GET /api/students` রেসপন্সে সার্ভার এখন
  এটা পাঠায়, `dueOnly`/`riskOnly` নির্বিশেষে)।
- [x] `client/src/lib/api.ts` — `getStudents()`-এ নতুন `riskOnly?: boolean`
  প্যারামিটার (কোয়েরি স্ট্রিং-এ `riskOnly=1`)।
- [x] `client/src/components/StatCard.tsx` — অপশনাল `onClick` prop যোগ।
  দেওয়া হলে কার্ড ক্লিকযোগ্য হয় (`role="button"`, `tabIndex=0`,
  Enter/Space-এ কীবোর্ড ট্রিগার সহ) — প্ল্যানের ধারা ৩-এ রাখা a11y কাজের
  একটা ছোট অংশ (keyboard-focusable) এখানেই যোগ করা হয়েছে, কারণ ক্লিকযোগ্য
  বানানোর সাথেই এটা লাগে (নাহলে মাউস-ছাড়া ব্যবহারকারীর জন্য দিনের শুরুতেই
  ভাঙা থাকত) — বাকি `aria-label` কাস্টমাইজেশন/এম্পটি-স্টেট পলিশ এখনো
  Phase 3-এ। বিদ্যমান সব কল-সাইট (যেগুলো `onClick` পাস করে না) অপরিবর্তিত
  আচরণ করে।
- [x] `client/src/index.css` — নতুন `.stat-card--clickable` ক্লাস
  (hover/focus-visible-এ সামান্য lift + shadow, `--ring` var না থাকলে
  `currentColor` ফলব্যাক আউটলাইন)।
- [x] `client/src/modules/Dashboard.tsx` — `useNavigate` যোগ, "মোট বকেয়া"
  কার্ডের ঠিক পাশে নতুন "রিস্ক জোন" StatCard (`riskCount`/`riskTotalDue`,
  rose রঙ, `alertTriangle` আইকন — due কার্ডের প্যাটার্নেই), ক্লিকে
  `/reports/call-list/risk`-এ নেভিগেট করে।
- [x] `client/src/i18n/bn.ts` + `en.ts` — `dashboard.riskZone` কী (দুই
  ফাইলে key-parity বজায় রেখে)।
- [x] `client/src/lib/exportReports.ts` — `ReportKind` ইউনিয়নে `"risk"`,
  `REPORT_TITLES`/`RANGE_FILTERED`-এ এন্ট্রি (due-এর মতোই date-range-filtered
  না), নতুন `riskListRows()` (due-এর কলামের পাশে `monthsUnpaid` অতিরিক্ত),
  `exportReport()`-এ risk ব্র্যাঞ্চ — `api.getStudents({riskOnly:true})`
  কল করে (due-এর মতো ক্লায়েন্ট-সাইড ফিল্টার না, কারণ থ্রেশহোল্ড `fee`ও
  লাগে, সার্ভার ইতিমধ্যে হিসাব করে রাখে)।
- [x] `client/src/modules/Reports.tsx` — নতুন "রিস্ক জোন" রিপোর্ট কার্ড
  (rose, `alertTriangle`), `REPORT_PERMISSION`-এ `risk: "students"`,
  `CALL_LIST_KINDS`-এ `"risk"` যোগ (কার্ড ক্লিকে সরাসরি এক্সপোর্ট না করে
  কল-লিস্ট পেজে যায়, due/students-এর মতোই)।
- [x] `client/src/modules/reports/CallListView.tsx` — `CallListKind`-এ
  `"risk"`, `TITLES`-এ এন্ট্রি, `kindParam` ভ্যালিডেশনে যোগ। `load()`-এ
  `kind === "risk"` হলে `api.getStudents({riskOnly: true})` (সার্ভার-সাইড
  ফিল্টার, ইতিমধ্যে `monthsUnpaid` সহ), অন্য kind-এর লজিক অপরিবর্তিত।
  টেবিলে `due`/`risk` দুটোতেই "বকেয়া" কলাম, শুধু `risk`-এ আলাদা "কত মাস
  বকেয়া" কলাম (`monthsUnpaid`) অতিরিক্ত। কল-বাটন/কল-মার্কিং লজিক
  অপরিবর্তিত (আগে থেকেই kind-নিরপেক্ষ)।
- [x] `App.tsx`-এর রুট (`reports/call-list/:kind`) আগে থেকেই জেনেরিক —
  কোনো পরিবর্তন লাগেনি। `icons.ts`-এ `alertTriangle` আগে থেকেই আছে।
- [x] সব পরিবর্তিত/নতুন `.ts`/`.tsx` ফাইলে bracket balance (`()`/`{}`/`[]`)
  স্ক্রিপ্ট দিয়ে চেক করা হয়েছে (সমান পাওয়া গেছে)। **`npm run check` এই
  sandbox-এ চালানো যায়নি (network/node_modules নেই)** — packaged CMD-এই
  প্রথম চলবে, আগের সব Phase-এর মতোই।
- **`npm run check` ব্যবহারকারীর মেশিনে চালিয়ে একটা `typecheck` এরর
  ধরা পড়েছিল (2026-08-11), এখানেই ফিক্স করা হলো:** `client/src/data/mockData.ts`-এর
  ডেমো/মক `DashboardData.stats` অবজেক্টে নতুন `riskCount`/`riskTotalDue`
  ফিল্ড ছিল না (Phase 1-এ টাইপ আপডেট হলেও এই মক ডেটা ফাইল মিস হয়ে
  গিয়েছিল) — যোগ করা হলো (`riskCount: 3, riskTotalDue: 5200`, বিদ্যমান
  `dueCount: 8`/`totalDue: 10500`-এর সাবসেট হিসেবে বাস্তবসম্মত ডামি মান)।
  `grep -rln "dueCount:" client/src` দিয়ে যাচাই করা হয়েছে যে
  `DashboardData.stats` অবজেক্ট লিটারেল আর কোথাও নেই (শুধু
  `Dashboard.tsx`-এর `EMPTY_DASHBOARD`, `types/index.ts`-এর টাইপ
  ডেফিনিশন, আর এই মক ফাইল) — তাই আর কোনো ফাইল ভাঙার শঙ্কা নেই।

### Phase 3 (যাচাই, পলিশ, এজ-কেস, ডক) — সম্পন্ন (2026-08-13)
- আসল ডেটায় থ্রেশহোল্ড **ব্যবহারকারী নিজে ভেরিফাই করেছেন** (এই সেশনে
  চ্যাটে কনফার্ম করা হয়েছে) — সাব-স্যান্ডবক্স থেকে এটা যাচাই করা যায় না
  বলে আলাদা কোনো কোড/লগ যাচাই করা হয়নি।
- এজ-কেস (fee=0 বাদ পড়া, ইনঅ্যাক্টিভ বাদ পড়া) — চেক করে দেখা গেছে
  Phase 1-এই `server/src/routes/students.js`-এর `riskOnly` কন্ডিশনে
  (`status = 'Active' AND fee > 0 AND FLOOR(due::numeric / fee) >= 2`)
  আগে থেকেই সঠিকভাবে হ্যান্ডল করা ছিল — নতুন কোনো ব্যাকএন্ড পরিবর্তন
  লাগেনি।
- শূন্য-রেজাল্ট ফাঁকা-স্টেট মেসেজ — `CallListView.tsx`-এ আগে থেকেই
  জেনেরিক "কোনো ছাত্র পাওয়া যায়নি।" মেসেজ আছে (due/risk উভয় kind-এর
  জন্যই), risk-এর জন্য আলাদা কিছু লাগেনি।
- **Accessibility — custom `aria-label` যোগ করা হয়েছে (আসল কোড
  পরিবর্তন)**: `client/src/components/StatCard.tsx`-এ নতুন ঐচ্ছিক
  `ariaLabel` prop (`onClick` থাকলেই `role="button"`-এর সাথে
  `aria-label`-ও বসে, না দিলে আগের মতোই আচরণ — বিদ্যমান কল-সাইট
  অপরিবর্তিত)। `client/src/modules/Dashboard.tsx`-এর রিস্ক-জোন
  `StatCard`-এ (একমাত্র clickable রিস্ক-সম্পর্কিত কার্ড)
  `ariaLabel={t.dashboard.riskZoneCardAriaLabel}` যোগ করা হয়েছে।
  `i18n/bn.ts`+`en.ts`-এর `dashboard` ব্লকে নতুন `riskZoneCardAriaLabel`
  কী (key-parity যাচাই করা হয়েছে)।
- `docs/PROJECT_MAP.md`-এর "Other docs" সেকশনে `RISK_ZONE_PLAN.md`-এর
  জন্য নতুন এক-প্যারাগ্রাফ এন্ট্রি যোগ করা হয়েছে (৩ ফেজই সম্পন্ন,
  Phase 3-এর সারাংশসহ), `CALL_LIST_PLAN.md` এন্ট্রির ঠিক পরে।
- ব্র্যাকেট-ব্যালান্স স্ক্রিপ্ট দিয়ে দুটো `.tsx` ফাইল যাচাই করা হয়েছে
  (সমান), raw `style={{}}` নতুন কিছু যোগ হয়নি (StatCard-এর বিদ্যমান
  ডকুমেন্টেড ব্যতিক্রমটা অক্ষত)। **`npm run check` এই এজেন্ট চালায়নি
  (sandbox-এ network/node_modules নেই) — প্যাকেজড CMD-তেই প্রথম যাচাই
  হবে।**

**এই এন্ট্রির ৩টা Phase-ই এখন সম্পূর্ণ — কোনো "বাকি" নেই।**

---

## Status: DONE (Part 1, Part 2, Part 3, Part 4 সম্পন্ন — 2026-08-13)

Started: 2026-08-09

### Part 1 — সম্পন্ন (2026-08-09)
- [x] নতুন `server/src/lib/examTypes.js` — `EXAM_TYPES` (value+labelBn)
  ও `EXAM_TYPE_VALUES` এক্সপোর্ট, নিচের ১০টা এন্ট্রি।
- [x] `server/src/lib/financeSchemas.js` — `EXAM_TYPE_VALUES` ইমপোর্ট করে
  নতুন `resultSubjectBatchSchema` যোগ (`class`/`examName` (enum)/`year`/
  `subjectName`/`fullMarks`/`entries[]`), এক্সপোর্টে যোগ করা হয়েছে।
  বিদ্যমান `resultSaveSchema` অপরিবর্তিত রাখা হয়েছে।
- [x] নতুন `client/src/lib/examTypes.ts` — একই ১০টা এন্ট্রি (value+labelBn+
  labelEn), `ExamType` টাইপ এক্সপোর্ট।
- [x] `AGENTS.md` → "Single source of truth"-এ exam-type ডুপ্লিকেশনের নোট
  যোগ করা হয়েছে।
- [x] `node -c` দিয়ে দুটো নতুন/পরিবর্তিত server ফাইল সিনট্যাক্স-চেক করা হয়েছে
  (sandbox-এ network না থাকায় পুরো `npm run check` চালানো যায়নি — সেটা
  ব্যবহারকারীর প্যাকেজড CMD-এই প্রথম চলবে)।
- **এখনো বাকি (এই sandbox-এ করা যায়নি, ব্যবহারকারীর মেশিনে CMD চালানোর পর
  চেক করতে হবে):** `resultSaveSchema` (single-student, free-text examName)
  সত্যিই এখনো কোথাও ব্যবহার হচ্ছে কিনা তা `grep -rn "saveResult\b"
  client/src` দিয়ে যাচাই — Part 3-এ পুরনো single-student ফর্ম সরানোর আগে এই
  উত্তর লাগবে।

### Part 2 — সম্পন্ন (2026-08-09)
- [x] `server/src/lib/results.js` —
  - নতুন pure `mergeSubjectIntoList(existingSubjects, newSubject)`:
    subject-নাম case-insensitive/trim মিলিয়ে replace, না মিললে append,
    MAX_SUBJECTS(20) cap বজায় রাখে (cap-এ থাকলেও বিদ্যমান সাবজেক্ট আপডেট
    হয়, নতুন যোগ শুধু বন্ধ হয়)।
  - নতুন internal `upsertResultRow({student, examName, year, subjects})` —
    আগের `upsertResult`-এর ভেতরের পুরো INSERT...ON CONFLICT ব্লক এখানে
    এক্সট্র্যাক্ট করা হয়েছে, `upsertResult` ও নতুন `saveSubjectForClass`
    দুটোতেই reuse হচ্ছে (কোড ডুপ্লিকেট হয়নি)।
  - নতুন `saveSubjectForClass({class, examName, year, subjectName,
    fullMarks, entries})` — প্রতি entry-তে ছাত্র লুকআপ (id + `student.class
    === cls` — ক্লাস স্কোপ মিসম্যাচ হলে স্কিপ, tamper-প্রুফ), বিদ্যমান
    result row থাকলে তার subjects বের করে `mergeSubjectIntoList()` দিয়ে
    নতুন বিষয় মার্জ, `upsertResultRow()` দিয়ে সেভ। রিটার্ন `{updated,
    skipped}` (bad/mismatched studentId পুরো ব্যাচ ফেইল করায় না, শুধু সেই
    এন্ট্রি স্কিপ হয়)।
  - Sequential await loop ব্যবহার করা হয়েছে, ম্যানুয়াল pg transaction না —
    কারণ ফাইলের ভেতরের কমেন্টে ব্যাখ্যা করা হয়েছে (AsyncLocalStorage
    tenant-schema বাইন্ডিং, migrateTenants.js-এর প্যাটার্ন cross-schema
    কাজের জন্য, এখানে দরকার নেই)।
  - `module.exports`-এ `saveSubjectForClass`, `mergeSubjectIntoList` যোগ।
- [x] `server/src/routes/results.js` — নতুন
  `POST /results/subject-batch` (validate: `resultSubjectBatchSchema`) —
  `req.teacherClasses` স্কোপ-চেক (বিদ্যমান `OUT_OF_SCOPE_ERROR` প্যাটার্ন),
  `saveSubjectForClass()` কল, একটাই `recordAudit()`
  (`action: "result.subjectBatchSaved"`, label-এ ক্লাস/বিষয়/পরীক্ষা/বছর/
  কতজন আপডেট+স্কিপ), রেসপন্স `{updated, skipped}`।
- [x] `server/src/lib/__tests__/results.test.js` — নতুন
  `describe("mergeSubjectIntoList", ...)` ব্লক: খালি লিস্টে append, বিদ্যমান
  সাবজেক্টের পাশে নতুন append (original mutate হয় না তাও চেক), একই নামে
  replace (duplicate না হওয়া), case/whitespace-insensitive ম্যাচ, 20-cap-এ
  নতুন যোগ না হওয়া, cap-এ থাকা অবস্থায়ও বিদ্যমান সাবজেক্ট আপডেট হওয়া —
  বিদ্যমান `sanitizeSubjects`/`computeGrade` টেস্টের ঠিক পাশে, একই স্টাইলে।
- [x] `node -c` দিয়ে চারটা পরিবর্তিত/নতুন server ফাইল সিনট্যাক্স-চেক করা
  হয়েছে। `mergeSubjectIntoList`/`computeGrade` ম্যানুয়ালি `node -e`-তে
  রান করে আউটপুট চেক করার চেষ্টা হয়েছিল, কিন্তু এই sandbox-এ
  `server/node_modules` ইনস্টল করা নেই (`bcryptjs` মডিউল পাওয়া যায়নি —
  network বন্ধ থাকায় dependency install করা যায়নি) — তাই
  `results.js`-কে require করে রান করাটা যাচাই করা যায়নি এখানে। vitest
  টেস্টগুলো (এবং পুরো `npm run check`) ব্যবহারকারীর প্যাকেজড CMD-এই প্রথম
  চলবে ও যাচাই হবে।

### Part 3 — সম্পন্ন (2026-08-10)
- [x] `client/src/lib/api.ts` — নতুন `saveResultSubjectBatch()` যোগ, `POST
  /results/subject-batch` কল করে। বিদ্যমান `saveResult`/`getResults`/
  `getResultClasses`/`getResultStudents`/`setResultPublished`/`deleteResult`
  অপরিবর্তিত রাখা হয়েছে।
- [x] `client/src/types/index.ts` — নতুন `ResultSubjectBatchResponse { updated;
  skipped }` টাইপ যোগ।
- [x] `client/src/modules/Results.tsx` — এন্ট্রি-ফর্ম সেকশন পুরোপুরি
  rework: single-student পুরনো ফর্ম (ছাত্র-বাছাই + subjects[] ইনলাইন লিস্ট +
  computeGrade প্রিভিউ) সরিয়ে নতুন bulk ফ্লো বসানো হয়েছে — exam-type ফিক্সড
  `<Select>` (`EXAM_TYPES` থেকে, ভাষা অনুযায়ী লেবেল), class/year/subjectName/
  subjectFullMarks ফিল্ড, ক্লাস সিলেক্ট হলে প্রতি ছাত্রের রো + নম্বর ইনপুট,
  "বিষয় যোগ করুন" বাটনে `saveResultSubjectBatch()` কল (খালি মার্কস বাদ,
  skipped কাউন্ট দেখানো হয়) → সফল হলে subjectName/subjectFullMarks/marksById
  রিসেট (class/exam/year রাখা হয়), `refreshList()`। "সংরক্ষিত ফলাফল" লিস্ট
  অংশ অপরিবর্তিত রাখা হয়েছে (স্পেক অনুযায়ী স্কোপের বাইরে)।
  - Design System: entry-form অংশ `Card`/`Field`/`Input`/`Select`/`Button`
    (components/ui/) ও নতুন `.marks-entry-list`/`.marks-entry-row`/
    `.marks-entry-header` ক্লাসে (index.css-এ যোগ, ডেস্কটপে row/মোবাইলে
    stacked card @max-width:640px) migrate করা হয়েছে — এই ফাইলের ৩৬টা
    inline-style এর ২৫টা সরানো হয়েছে (৩৬ → ১১, বাকি ১১টা untouched
    saved-results-list অংশে)। `docs/DESIGN_SYSTEM_MIGRATION.md` আপডেট করা
    হয়েছে। যেহেতু পুরোপুরি ক্লিন না, `client/eslint.config.js`-এর ignore
    লিস্টে `Results.tsx` রয়ে গেছে।
  - নতুন `.alert--emerald` (success message) ও `.text-muted` ক্লাস যোগ করা
    হয়েছে (index.css)।
- [x] `client/src/i18n/bn.ts` ও `en.ts` — `results` namespace-এ নতুন কী
  (`selectExamType`, `subjectFullMarks`, `marksFor`, `noStudentsInClass`,
  `addSubjectBatch`/`addSubjectBatchSaving`/`addSubjectBatchSaved`/
  `addSubjectBatchSkipped`) যোগ; `selectStudent`/`addSubject` রিমুভ করা
  হয়েছে (`grep -rn` দিয়ে যাচাই করে নিশ্চিত হওয়া গেছে এই দুইটা কী
  `Results.tsx` ছাড়া আর কোথাও ব্যবহার হতো না)। `save`/`saving`/`saved`/
  `fullMarks`/`subjects`/`total` কী-গুলো এখন আর ব্যবহৃত হয় না কিন্তু স্পেকে
  এগুলো রিমুভ করতে বলা হয়নি বলে ইচ্ছাকৃতভাবে রাখা হয়েছে (scope-এর বাইরে না
  গিয়ে)।
- **যাচাই করা যায়নি (sandbox-এ `node_modules`/নেটওয়ার্ক না থাকায়):** পুরো
  `npm run check` (lint/typecheck/build) — ম্যানুয়ালি কোড রিভিউ করে
  import/type সামঞ্জস্য নিশ্চিত করা হয়েছে, কিন্তু আসল যাচাই ব্যবহারকারীর
  মেশিনে প্যাকেজড CMD চালানোর সময় প্রথম হবে।

### Part 4 — যাচাই ও ডকুমেন্টেশন — সম্পন্ন (2026-08-13)
- `npm run check` এই এজেন্ট চালায়নি (sandbox-এ network/node_modules
  নেই) — ব্যবহারকারীর প্যাকেজড CMD-তেই আসল যাচাই হবে, আগের সব Part-এর
  মতোই।
- `docs/PROJECT_MAP.md`-এর "Other docs" সেকশনে নতুন এন্ট্রি যোগ করা
  হয়েছে (per-subject bulk marks-entry ওয়ার্কফ্লো সংক্ষেপে বর্ণনা করে),
  যাতে পরের কোনো এজেন্ট পুরনো single-student ফ্লো ধরে না নেয়।
- ব্যবহারকারী নিশ্চিত করেছেন বাকি ম্যানুয়াল যাচাই নিজে করে নিয়েছেন,
  তাই এই এন্ট্রি এখানেই DONE-এ বন্ধ করা হলো।

**এই টাস্কের ৪টা Part-ই এখন সম্পূর্ণ — কোনো "বাকি" নেই।**

---

## Task: রিপোর্ট সেকশনে "কল লিস্ট" ভিউ (ছাত্র/বকেয়া তালিকা) — ৩ ভাগে,
পুরো পরিকল্পনা `docs/CALL_LIST_PLAN.md`-এ (ad-hoc, কোনো roadmap Phase-এর
সাথে মেলে না — উপরের exam-type কাজের সাথেও অসম্পর্কিত, তাই আলাদা এন্ট্রি)

## Status: DONE (Phase 1, Phase 2, Phase 3 সম্পন্ন — npm run check ও আসল ফোনে
tel: টেস্ট ব্যবহারকারীর মেশিনে বাকি)

Started: 2026-08-10

### Phase 1 (ব্যাকএন্ড: DB + API) — সম্পন্ন (2026-08-10)
- [x] `server/sql/supabase_schema.sql` — নতুন `student_call_log` টেবিল
  (`studentId`, `callMonth` 'YYYY-MM', `calledBy`, `calledAt`, unique on
  `(studentId, callMonth)`) — ইচ্ছাকৃতভাবে `users` টেবিলের ঠিক পরে বসানো
  হয়েছে (আগে বসালে `"calledBy" references users(id)` ফেইল করত, কারণ
  `initSchema()` পুরো ফাইলটা ওপর থেকে নিচে একটাই ব্যাচে রান করে — উপরের
  `users` টেবিল আগে তৈরি থাকা লাগে)।
- [x] `server/src/routes/students.js` — তিনটা নতুন এন্ডপয়েন্ট, existing
  `router.use(requirePermission("students"))`-এর ভেতরেই (নতুন permission
  লাগেনি):
  - `GET /api/students/call-log?month=YYYY-MM` — ঐ মাসে কোন কোন
    `studentId` কল হয়েছে তার লিস্ট (`{studentId, calledBy, calledAt}[]`)।
    **এই রুটটা `/classes/list`-এর ঠিক পরে, `/:id`-এর আগে বসানো হয়েছে** —
    আগে থাকলে Express `/call-log`-কে `/:id` (id="call-log") হিসেবে ধরে
    ফেলত।
  - `POST /api/students/:id/call-log` (body `{month}`) — upsert
    (`ON CONFLICT ... DO UPDATE`), `calledBy` = `req.user.id`।
  - `DELETE /api/students/:id/call-log?month=YYYY-MM` — আনমার্ক (ভুল
    মার্ক হয়ে গেলে ঠিক করার জন্য)।
  - মাস ফরম্যাট (`/^\d{4}-\d{2}$/`) তিনটাতেই ভ্যালিডেট করা হয়েছে।
- [x] Audit log (`recordAudit`) ইচ্ছাকৃতভাবে যোগ করা হয়নি — এটা
  বার-বার টগল হওয়া UI অ্যাকশন (staff অনেকবার ক্লিক করবে), তাই প্রতিবার
  audit_logs-এ row লেখা অতিরিক্ত এবং কম দরকারি মনে হয়েছে। প্রয়োজন মনে
  হলে পরে যোগ করা যাবে — এখন স্কোপে রাখা হয়নি, ব্যবহারকারীকে জানানো
  হয়েছে।
- [x] `node -c server/src/routes/students.js` দিয়ে সিনট্যাক্স-চেক পাস।
  SQL ফাইলে parenthesis-ব্যালেন্স ম্যানুয়ালি চেক করা হয়েছে (162/162)।
- **যাচাই করা যায়নি (sandbox-এ network/node_modules নেই):** পুরো
  `npm run check`, আসল DB-তে টেবিল তৈরি হওয়া, upsert/delete আসলে কাজ
  করা কিনা — এগুলো ব্যবহারকারীর প্যাকেজড CMD চালানোর সময় প্রথম যাচাই
  হবে।
- **মাল্টি-টেন্যান্ট নোট:** `MULTI_TENANT_MODE=true` থাকলে ইতিমধ্যে
  provision হওয়া পুরনো tenant schema-গুলোতে এই নতুন টেবিল স্বয়ংক্রিয়ভাবে
  তৈরি হবে না (`initSchema()` শুধু `public` schema-তে রান হয় — দেখুন
  `payments` cascade fix-এর পুরনো নোট, এই ফাইলের নিচে)। নতুন
  provision হওয়া institution ঠিকই পাবে। বর্তমানে `MULTI_TENANT_MODE`
  off আছে বলে এখন এটা ব্লকিং না, কিন্তু চালু করার আগে এই টেবিলের জন্যও
  Platform panel-এর tenant-migration টুল দিয়ে
  `create table if not exists student_call_log (...)` স্টেটমেন্টটা
  সব tenant-এ ম্যানুয়ালি রান করা লাগবে।

### Phase 2 (ফ্রন্টএন্ড: CallListView পেজ + Reports.tsx ওয়্যারিং) — সম্পন্ন (2026-08-10)
- [x] নতুন `client/src/modules/reports/CallListView.tsx` — নতুন ফোল্ডার/ফাইল।
  - `useParams<{kind}>()` দিয়ে `/reports/call-list/:kind` (`kind` =
    `students`|`due`, অন্য কিছু হলে `/reports`-এ redirect) রুট হ্যান্ডল করে।
  - লোড হওয়ার সময় সমান্তরালে `api.getStudents()` (due হলে `due>0` ফিল্টার,
    exportReports.ts-এর dueListRows-এর মতোই লজিক) ও
    `api.getCallLog(currentMonth)` কল করে — `currentMonth()` হেল্পার
    `YYYY-MM` জেনারেট করে।
  - Back/Exit বাটন (`navigate("/reports")`), টাইটেল, সামারি ("মোট X জন ·
    কল হয়েছে Y জন · বাকি Z জন"), প্রিন্ট/CSV বাটন — এই দুটো বাটন
    **এক্সিস্টিং `exportReport(kind, format)` (lib/exportReports.ts) সরাসরি
    reuse করে**, নতুন এক্সপোর্ট লজিক লেখা হয়নি।
  - প্রতি ছাত্রের রো: রোল/নাম/ক্লাস (+ due হলে বকেয়া কলাম), সবুজ কল বাটন
    (`<a href="tel:...">`, ফোন না থাকলে ডিসেবল + "নম্বর নেই" টুলটিপ,
    `icons.ts`-এ নতুন `phone: Phone` আইকন যোগ করে), স্ট্যাটাস বাটন (সবুজ
    check/লাল alert — ক্লিকে `api.markStudentCalled`/`unmarkStudentCalled`
    কল করে অপটিমিস্টিক-না-হয়ে await করে state আপডেট করে)।
  - `client/src/lib/api.ts`-এ নতুন `getCallLog`, `markStudentCalled`,
    `unmarkStudentCalled` তিনটা মেথড যোগ (Phase 1-এর এন্ডপয়েন্ট তিনটার
    client wiring)।
- [x] `client/src/modules/Reports.tsx` — "ছাত্র তালিকা"/"বকেয়া তালিকা"
  কার্ডের অ্যাকশন বাটন বদলে একটাই "কল লিস্ট দেখুন" বাটন করা হয়েছে যেটা
  `navigate(/reports/call-list/${kind})` করে (নতুন `CALL_LIST_KINDS`
  কনস্ট্যান্ট দিয়ে এই দুই kind চেক করা হয়)। বাকি ৪টা কার্ড
  (attendance/income/expenses/hifz) আগের প্রিন্ট/CSV বাটন-সহ অপরিবর্তিত।
- [x] `client/src/App.tsx` — `CallListView` lazy-imported, নতুন
  `reports/call-list/:kind` route যোগ — `/reports`-এর মতোই একই
  `PlanFeatureGate feature="reportsExport"`-এর ভেতরে (আন্ডারলাইং
  ছাত্র-ডেটা আগে থেকেই সার্ভার-সাইড `students` permission দিয়ে গার্ডেড)।
- [x] `client/src/index.css` — নতুন `.call-list-*` ক্লাস (topbar, summary,
  card, header/row, call-btn, status-btn) — ডেস্কটপে ফ্লেক্স-রো, ≤640px-এ
  স্ট্যাকড (marks-entry-list-এর মতোই প্যাটার্ন, কিন্তু flexbox দিয়ে —
  কলাম-সংখ্যা kind অনুযায়ী ভ্যারিয়েবল বলে grid-template-columns এর বদলে)।
  Design System: কোনো raw `style={{}}` নতুন native element-এ যোগ হয়নি
  (Reports.tsx-এর বিদ্যমান per-report dynamic accent-color exception ছাড়া,
  যেটা আগে থেকেই ছিল ও অপরিবর্তিত)।
- **এই sandbox-এ যাচাই করা যায়নি (network/node_modules নেই):** পুরো
  `npm run check`। ম্যানুয়ালি করা হয়েছে — সব এডিটেড/নতুন ফাইলে bracket
  (`()`/`{}`/`[]`) ব্যালেন্স-কাউন্ট চেক (সমান পাওয়া গেছে), ইম্পোর্ট পাথ ও
  এক্সপোর্ট করা নাম হাতে মিলিয়ে দেখা (`Icons.phone`, `Button` variant
  `"teal"`, `Card`/`HudSpinner`/`exportReport`/`ReportRangeRequiredError`/
  `PopupBlockedError` সব বিদ্যমান এক্সপোর্ট)। **আসল টাইপ-চেক/লিন্ট/বিল্ড
  আপনার প্যাকেজড CMD চালানোর সময়ই প্রথম হবে** — ব্যর্থ হলে থেমে যাবে,
  push হবে না (আপনার preference অনুযায়ী)।
- **আপডেট (একই দিন, প্রথমবার CMD চালানোর পর):** `npm run check` চালিয়ে
  আপনি একটা `react-hooks/set-state-in-effect` **error** পেয়েছিলেন
  `CallListView.tsx`-এ (`setLoading(true)`/`setError(null)` সরাসরি effect
  body-তে সিঙ্ক্রোনাসলি কল হচ্ছিল)। ফিক্স করা হয়েছে — এই দুইটা কল এখন
  একটা আলাদা `load()` (`useCallback`) ফাংশনের ভেতরে, effect শুধু
  `load()` কল করে একটা `eslint-disable-next-line
  react-hooks/set-state-in-effect` কমেন্টসহ (এই কোডবেসেরই বিদ্যমান
  প্যাটার্ন — `AuditLogs.tsx`/`InstitutionBilling.tsx`/`Fees.tsx`-এর
  `loadDue()`-এর মতোই, "লোডিং স্টেট সাথে সাথে দেখানো ইচ্ছাকৃত" যুক্তি)।
  একই রানে `GuardianReminders.tsx` ও `Results.tsx`-এ আরও কিছু pre-existing
  **warning** (error না) দেখা গিয়েছিল — এগুলো এই টাস্কের কোনো ফাইল না,
  তাই AGENTS.md Rule 1 (minimal diff) অনুযায়ী **ছোঁয়া হয়নি**, শুধু
  উল্লেখ করে রাখা হলো যাতে পরের কেউ অবাক না হয়।

### Phase 3 (পলিশ/এজ-কেস/ডক) — সম্পন্ন (2026-08-10)
- [x] `client/src/modules/reports/CallListView.tsx` —
  - নতুন `cleanPhone()` হেল্পার: `s.phone` থেকে digit ও leading `+` ছাড়া
    বাকি সব ক্যারেক্টার (স্পেস/ড্যাশ/বন্ধনী) ছেঁটে ফেলে, `tel:` href-এ এই
    cleaned ভ্যালু ব্যবহার হয় (আগে raw `s.phone` সরাসরি href-এ যেত)।
  - `hasPhone` এখন cleaned ভ্যালুর length-এর উপর ভিত্তি করে ঠিক হয় — আগে
    শুধু `s.phone.trim()` truthy কিনা দেখা হতো, তাই "N/A"-এর মতো
    অক্ষর-শুধু ভ্যালুতেও কল বাটন সক্রিয় থেকে যেত (ক্লিক করলে ভাঙা
    `tel:` লিংক খুলত) — এখন সেটাকে "নম্বর নেই" হিসেবে ধরা হয়।
  - `call-list-row__meta` স্প্যানগুলোতে (ক্লাস/বকেয়া) নতুন BEM মডিফায়ার
    ক্লাস (`--class`/`--due`) যোগ — মোবাইল CSS-এ লেবেল বসানোর জন্য (নিচে
    দেখুন)।
- [x] `client/src/index.css` — `@media (max-width: 640px)` ব্লকে:
  - রোল আগে `display: none` ছিল, এখন `.marks-entry-row__roll`-এর প্যাটার্ন
    অনুসরণ করে ইনলাইন + `::after` দিয়ে "— " সাফিক্স-সহ দেখানো হয় (হেডার
    রো হাইড হয়ে গেলেও রোল নম্বরটা হারিয়ে যায় না)।
  - নতুন `.call-list-row__meta--class::before`/`--due::before` — মোবাইলে
    হেডার না থাকায় খালি "৫ম শ্রেণি" বা "৳৫০০" দেখলে বোঝা যেত না এটা
    ক্লাস না বকেয়া; এখন "ক্লাস: "/"বকেয়া: " প্রিফিক্স যোগ হয়েছে।
- [x] **রেস-কন্ডিশন (একই ছাত্র দুইবার মার্ক):** কোড পরিবর্তন লাগেনি —
  DB-লেভেলে Phase 1-এর `unique ("studentId", "callMonth")` কনস্ট্রেইন্ট +
  `ON CONFLICT` upsert দিয়ে সার্ভার-সাইড ইতিমধ্যেই সেফ, এবং ক্লায়েন্টে
  প্রতি-রো `disabled={togglingId === s.id}` (Phase 2-তেই ছিল) দিয়ে একই
  রো-তে ডাবল-ক্লিক আটকানো হয় — যাচাই করে নিশ্চিত হওয়া হয়েছে, নতুন কিছু
  যোগ করার দরকার হয়নি।
- [x] **৩০০+ ছাত্র পারফরম্যান্স:** রিভিউ করা হয়েছে — এই পেজ প্লেইন
  unvirtualized `.map()` ব্যবহার করে, কিন্তু এই কোডবেসের `Students.tsx`
  (পুরো ছাত্র তালিকা)-ও একই প্যাটার্নে virtualization ছাড়া রেন্ডার করে,
  তাই এটা নতুন কোনো গ্যাপ না বরং বিদ্যমান কনভেনশনের সাথে সামঞ্জস্যপূর্ণ।
  virtualization লাইব্রেরি (react-window ইত্যাদি) যোগ করা হয়নি (AGENTS.md
  Rule 5 — নতুন dependency আগে জানাতে হবে, এবং এটা এই টাস্কের স্কোপেও
  ছিল না)।
- [x] **Accessibility (কল বাটন/স্ট্যাটাস বাটনে `aria-label`):** Phase 2-তেই
  যোগ করা হয়েছিল (`aria-label`, `aria-disabled`, `aria-hidden` আইকনে) —
  পুনরায় চেক করে নিশ্চিত হওয়া গেছে, নতুন কিছু বাকি নেই।
- [x] `docs/PROJECT_MAP.md` — CALL_LIST_PLAN.md এন্ট্রি আপডেট করা হয়েছে,
  ৩ ফেজই সম্পন্ন হিসেবে চিহ্নিত এবং Phase 3-এ ঠিক কী পলিশ হয়েছে তার
  সংক্ষিপ্ত তালিকা যোগ করা হয়েছে।
- **এই sandbox-এ যাচাই করা যায়নি (network/node_modules নেই):** পুরো
  `npm run check`। ম্যানুয়ালি bracket-balance (CallListView.tsx আলাদাভাবে
  parser দিয়ে, index.css `{`/`}` কাউন্ট মিলিয়ে) চেক করা হয়েছে।
  **আপনার প্যাকেজড CMD চালানোর সময়ই প্রথম আসল যাচাই হবে — ব্যর্থ হলে
  থেমে যাবে, push হবে না।**
- **সবচেয়ে গুরুত্বপূর্ণ যেটা এখনো বাকি (কোনো সেশন থেকেই করা সম্ভব না):**
  পরিকল্পনার সেকশন ৪-এ বলা "আপনার আসল ফোনে বাস্তব কল-বাটন টেস্ট" — অর্থাৎ
  আপনার মোবাইলে `/reports/call-list/students` (বা `due`) খুলে সবুজ কল
  বাটনে ট্যাপ করে দেখা যে ডায়ালার আসলেই সঠিক নম্বর নিয়ে খুলছে কিনা,
  এবং সরু স্ক্রিনে রো-লেআউট ঠিকঠাক দেখাচ্ছে কিনা। এটা শুধু আপনি করতে
  পারবেন।

এই টাস্কের তিনটা ফেজই এখন সম্পন্ন — এই এন্ট্রিতে আর কিছু বাকি নেই। (নিচের
exam-type টাস্কটা আলাদা, তার Part 4 এখনো অসম্পূর্ণ — এটা এখানে ছোঁয়া হয়নি,
পরের এজেন্ট/সেশনের জন্য যেমন ছিল তেমনই রাখা হয়েছে।)

## Task: ফলাফল সেকশন — পরীক্ষার ধরন ফিক্সড-লিস্ট (বাংলা/ইংরেজি) + প্রতি-বিষয়ে
পুরো ক্লাসের bulk মার্কস-এন্ট্রি ওয়ার্কফ্লো — ৪ ভাগে বিভক্ত (ad-hoc, কোনো
roadmap Phase-এর সাথে মেলে না)

### প্রেক্ষাপট ও লক্ষ্য
বর্তমানে `Results` মডিউলে এন্ট্রি ফ্লো হলো: ক্লাস বেছে → **একজন নির্দিষ্ট
ছাত্র** বেছে → পরীক্ষার নাম ফ্রি-টেক্সটে টাইপ → বছর টাইপ → একে একে বিষয়
(নাম/প্রাপ্ত নম্বর/পূর্ণমান) যোগ করে → Save। অর্থাৎ প্রতিবার এক ছাত্রের পুরো
রেজাল্ট (সব বিষয়) একসাথে সেভ হয়, এবং `subjects` অ্যারে পুরোটা রিপ্লেস হয়ে যায়
(`server/src/lib/results.js`-এর `upsertResult`)।

ব্যবহারকারীর চাওয়া ফ্লো ভিন্ন — **প্রতি-বিষয়ে, পুরো ক্লাস একসাথে:**
1. পরীক্ষার ধরন একটা ফিক্সড লিস্ট থেকে সিলেক্ট (ফ্রি-টেক্সট না) — লিস্ট নিচে
   দেওয়া ১০টা। UI-তে বাংলা/ইংরেজি ভাষা অনুযায়ী লেবেল বদলাবে, কিন্তু ডাটাবেজে
   সবসময় ইংরেজি ক্যানোনিকাল নামটাই সেভ হবে (ভাষা যাই থাকুক, ডাটা অপরিবর্তিত)।
2. শিক্ষাবর্ষ লিখবে, ক্লাস সিলেক্ট করবে, বিষয়ের নাম + সেই বিষয়ের পূর্ণমান
   লিখবে।
3. এরপর ওই ক্লাসের **সব ছাত্রের লিস্ট অটোমেটিক চলে আসবে** (রোল অনুযায়ী
   সিরিয়ালে), প্রত্যেকের পাশে একটা করে নম্বর-ইনপুট বক্স — শুধু প্রাপ্ত নম্বর
   টাইপ করা লাগবে, বাকি সব (ক্লাস/পরীক্ষা/বছর/বিষয়/পূর্ণমান) আগেই সিলেক্ট করা।
   ডেস্কটপ ও মোবাইল দুটোতেই রেসপন্সিভ হতে হবে।
4. "বিষয় যোগ করুন" বাটনে ক্লিকে — একটা API কলে পুরো ক্লাসের সেই এক বিষয়ের
   নম্বর সেভ হবে। প্রতি ছাত্রের আগে-থেকে-সেভ-করা অন্য বিষয়গুলো (যদি থাকে)
   **মুছে যাবে না** — নতুন বিষয়টা মার্জ হবে (নাম মিললে আপডেট, না মিললে যোগ)।
   পাস/ফেল, GPA, গ্রেড — সব `computeGrade()`-এর মাধ্যমে অটোমেটিক রিক্যালকুলেট
   হবে (এই লজিক আগে থেকেই আছে, শুধু single-student না, batch-এ apply করতে হবে)।
5. এরপর একই ক্লাস/পরীক্ষা/বছরে আরেকটা বিষয় (যেমন Arabic, Fiqh...) একইভাবে
   যোগ করা যাবে — ধাপ ২-৪ রিপিট। যতক্ষণ পাবলিশ না করা হয়, ততক্ষণ এগুলো খসড়া
   (unpublished) থাকবে — পাবলিশ/আনপাবলিশ/ডিলিট ফিচার আগে থেকেই আছে
   (`PATCH /:id/publish`, নিচের "সংরক্ষিত ফলাফল" লিস্ট), সেটা অপরিবর্তিত থাকবে।

**যা আগে থেকেই আছে (ছোঁয়া লাগবে না):** ক্লাস/ছাত্র লিস্ট আনা
(`GET /results/classes`, `/results/students`), GPA/গ্রেড ক্যালকুলেশন
(`computeGrade`, Bangladesh SSC/HSC-স্টাইল স্কেল + single-subject-fail rule),
পাবলিশ টগল + guardian SMS/push (`routes/results.js`-এর `/:id/publish`),
public Result Lookup (`searchPublicResult`), Teacher-scope RBAC
(`attachTeacherClasses`) — এগুলো নতুন bulk এন্ডপয়েন্টেও reuse হবে, নতুন করে
লেখা হবে না।

**ফিক্সড পরীক্ষার-ধরন লিস্ট (মান = ডাটাবেজে সেভ হওয়া ইংরেজি ক্যানোনিকাল নাম):**
| বাংলা লেবেল | value / English label |
|---|---|
| সাপ্তাহিক পরীক্ষা | Weekly Test |
| মাসিক পরীক্ষা | Monthly Test |
| সাময়িক পরীক্ষা | Periodic Test |
| অর্ধবার্ষিক পরীক্ষা | Half-Yearly Examination |
| বার্ষিক পরীক্ষা | Annual Examination |
| প্রাক-নির্বাচনী পরীক্ষা | Pre-Selection Test |
| নির্বাচনী পরীক্ষা | Selection Test |
| প্রাক-পরীক্ষা | Pre-Test |
| মডেল টেস্ট | Model Test |
| টেস্ট পরীক্ষা | Test Examination |

### Part 1 — ফিক্সড exam-type লিস্ট (server validation + client লেবেল)
- **নতুন `server/src/lib/examTypes.js`** — উপরের ১০টা এন্ট্রি
  `{ value, labelBn }` আকারে একটা অ্যারে + `EXAM_TYPE_VALUES` (শুধু value-গুলোর
  অ্যারে, zod enum-এ ব্যবহারের জন্য) এক্সপোর্ট। ফাইলের শীর্ষে কমেন্ট: এই লিস্ট
  `client/src/lib/examTypes.ts`-এর সাথে ম্যানুয়ালি সিঙ্ক রাখতে হবে (roles.js-এর
  মতো auto-generate করা হয়নি, কারণ এটা RBAC-এর মতো security-critical না এবং
  ১০ আইটেমের ছোট, কম-পরিবর্তনশীল লিস্ট — নতুন sync script যোগ করা এই টাস্কের
  স্কোপে নেই)।
- **`server/src/lib/financeSchemas.js`** — নতুন
  `resultSubjectBatchSchema` যোগ: `class` (string, min 1), `examName`
  (`z.enum(EXAM_TYPE_VALUES)`), `year` (string, max 4), `subjectName` (string,
  max 60, min 1), `fullMarks` (`z.coerce.number().positive()`), `entries`
  (`z.array(z.object({ studentId: z.coerce.number().int().positive(), marks:
  z.coerce.number() })).min(1).max(200)`)। বিদ্যমান `resultSaveSchema`
  (single-student ফ্রম) **অপরিবর্তিত** থাকবে — সেটা এখনো ফ্রি-টেক্সট
  examName নেয়, backward-compat-এর জন্য (guardian/অন্য কোথাও এখনো ব্যবহার
  হতে পারে, `grep -rn "saveResult\b"` দিয়ে যাচাই করে নিশ্চিত হতে হবে ব্যবহার
  আছে কিনা, না থাকলে রিমুভ করার সিদ্ধান্ত ব্যবহারকারীকে জানিয়ে নেওয়া, নিজে
  নিজে না মোছা)।
- **নতুন `client/src/lib/examTypes.ts`** — একই ১০টা এন্ট্রি
  `{ value, labelBn, labelEn }` আকারে (labelEn === value)। ফাইলের শীর্ষে
  কমেন্ট: server-এর `examTypes.js`-এর সাথে ম্যানুয়ালি সিঙ্ক রাখতে হবে।
- **`AGENTS.md`** — "Single source of truth" সেকশনে এক লাইন যোগ: exam-type
  লিস্ট client+server দুই জায়গায় ইচ্ছাকৃতভাবে ডুপ্লিকেট করা আছে (কারণ ও
  ফাইল-লোকেশন সহ), যাতে ভবিষ্যতের কোনো এজেন্ট এটাকে "বাগ" ভেবে এক জায়গায়
  fix না করে ফেলে।

### Part 2 — Backend: এক-বিষয়ে পুরো ক্লাসের bulk upsert (merge, replace না)
- **`server/src/lib/results.js`** —
  - নতুন pure/exported helper `mergeSubjectIntoList(existingSubjects,
    newSubject)`: subject name case-insensitive trim করে মেলায় — মিললে ওই
    এন্ট্রি replace, না মিললে array-তে push করে রিটার্ন করে (max 20 subjects
    cap বজায় রেখে, `sanitizeSubjects`-এর MAX_SUBJECTS reuse করে)। এটাকে আলাদা
    pure function হিসেবে রাখা হচ্ছে যাতে DB ছাড়াই ইউনিট-টেস্ট করা যায়
    (`sanitizeSubjects`/`computeGrade`-এর মতো একই প্যাটার্ন)।
  - নতুন exported `async function saveSubjectForClass({ classroom, examName,
    year, subjectName, fullMarks, entries })`: `entries`-এর প্রতিটা
    `{studentId, marks}`-এর জন্য —
    1. `students` টেবিল থেকে ছাত্র লুকআপ (id/name/roll/class), না পেলে সেই
       এন্ট্রি স্কিপ (পুরো ব্যাচ ফেইল করানো হবে না একটা bad id-তে; স্কিপ হওয়া
       আইডিগুলো রিটার্ন ভ্যালুতে `skipped: [...]` আকারে জানানো হবে)।
    2. `(studentId, examName, year)`-এর বিদ্যমান result row খুঁজে বের করা (থাকলে
       তার `subjects` parse করে নেওয়া, না থাকলে খালি অ্যারে থেকে শুরু)।
    3. `mergeSubjectIntoList()` দিয়ে নতুন `{name: subjectName, marks,
       fullMarks}` মার্জ করা।
    4. মার্জ করা সম্পূর্ণ subjects লিস্ট থেকে `obtainedMarks`/`totalMarks`
       রিক্যালকুলেট, `computeGrade()` দিয়ে gpa/grade রিক্যালকুলেট।
    5. বিদ্যমান `INSERT ... ON CONFLICT ("studentId","examName",year) DO
       UPDATE`-এর মতোই upsert (এই SQL ব্লকটা `upsertResult`-এর সাথে প্রায়
       হুবহু — একটা ছোট শেয়ার্ড ইনটার্নাল হেল্পারে (`upsertResultRow(row)`)
       রিফ্যাক্টর করে `upsertResult` ও `saveSubjectForClass` দুটোতেই reuse
       করা, কোড ডুপ্লিকেট না করে)।
    - sequential await loop-ই যথেষ্ট (এই কোডবেসে tenant-schema per-request
      `AsyncLocalStorage`-এর মাধ্যমে বাইন্ড হয় — `db.all/get/run` স্বয়ংক্রিয়ভাবে
      সঠিক tenant schema-তে যায়, তাই ম্যানুয়াল `pg.pool.connect()` +
      `BEGIN`/`COMMIT` ট্রানজ্যাকশন এখানে দরকার নেই, `migrateTenants.js`/
      `registryDb.js`-এর প্যাটার্নটা cross-schema কাজের জন্য, এটা তা না)।
    - রিটার্ন: `{ updated: StudentResult[], skipped: number[] }`।
- **`server/src/routes/results.js`** — নতুন
  `router.post("/subject-batch", validate(resultSubjectBatchSchema), ...)`:
  - `req.teacherClasses` থাকলে `req.body.class` স্কোপ-চেক (বিদ্যমান
    `OUT_OF_SCOPE_ERROR` প্যাটার্ন)।
  - `saveSubjectForClass(req.body)` কল।
  - একটাই `recordAudit()` (প্রতি-ছাত্র না) — `action: "result.subjectBatchSaved"`,
    `label`-এ ক্লাস/বিষয়/পরীক্ষা/বছর/কতজন ছাত্র আপডেট হলো।
  - রেসপন্স: `{ updated, skipped }`।
- **`server/src/lib/__tests__/results.test.js`** — `mergeSubjectIntoList`-এর
  জন্য নতুন `describe` ব্লক (নতুন সাবজেক্ট যোগ, বিদ্যমান নাম-মিলে replace,
  case-insensitive ম্যাচ, MAX_SUBJECTS cap) — বিদ্যমান
  `sanitizeSubjects`/`computeGrade` টেস্টের ঠিক পাশে, একই স্টাইলে।

### Part 3 — Frontend: bulk মার্কস-এন্ট্রি UI (`modules/Results.tsx` rework)
- **`client/src/lib/api.ts`** — নতুন `saveResultSubjectBatch(body: {
  class: string; examName: string; year: string; subjectName: string;
  fullMarks: number; entries: { studentId: number; marks: number }[]; })`
  → `POST /results/subject-batch`। বিদ্যমান `saveResult`/`getResults`/
  `getResultClasses`/`getResultStudents`/`setResultPublished`/`deleteResult`
  অপরিবর্তিত।
- **`client/src/types/index.ts`** — নতুন `ResultSubjectBatchResponse { updated:
  StudentResult[]; skipped: number[] }` টাইপ যোগ।
- **`client/src/modules/Results.tsx`** — এন্ট্রি-ফর্ম সেকশন rework (নিচের
  "সংরক্ষিত ফলাফল" লিস্ট অংশ অপরিবর্তিত থাকবে):
  - state: `examType`(canonical value)/`year`/`selectedClass` আগের মতো,
    কিন্তু single-student `subjects[]` লিস্টের বদলে single `subjectName` +
    `subjectFullMarks` state, এবং ক্লাস সিলেক্ট হলে student লিস্ট লোড হওয়ার
    সাথে সাথে প্রতি ছাত্রের জন্য `marksById: Record<number, string>` state।
  - পরীক্ষার ধরন `<select>` — `EXAM_TYPES` থেকে অপশন, বর্তমান ভাষা
    (`useLanguage()`) অনুযায়ী `labelBn`/`labelEn` দেখাবে, `value` সবসময়
    canonical English।
  - ছাত্র-লিস্ট: ক্লাস + বিষয়ের নাম + পূর্ণমান পূরণ হলে বিদ্যমান
    `api.getResultStudents(selectedClass)` দিয়ে লিস্ট আনা (এটা আগে থেকেই
    ক্লাস সিলেক্টের `useEffect`-এ আছে, রাখা হবে) — প্রতি ছাত্রের রো-তে
    রোল/নাম + একটা marks `<Input>`।
  - রেসপন্সিভনেস: `AGENTS.md`-এর Design System নিয়ম মেনে raw `style={{}}`
    native element-এ না — নতুন `.ds-*`/component-ভিত্তিক ক্লাস ব্যবহার (যেমন
    grid-based ছাত্র-লিস্ট যেটা ডেস্কটপে টেবিল-সদৃশ সারি, মোবাইলে স্ট্যাকড
    কার্ড — CSS grid/flex + breakpoint দিয়ে `index.css`-এ নতুন ক্লাস, পুরনো
    `.data-table`/`.form-grid` ক্লাস আগে থেকে থাকলে সেগুলো reuse করার চেষ্টা
    আগে)। যেহেতু এই টাস্ক পুরো এন্ট্রি-ফর্মটাই ছুঁচ্ছে, AGENTS.md-এর নিয়ম
    অনুযায়ী (touch করা অংশ migrate করা) পুরনো ৩৬টা inline-style-এর একটা বড়
    অংশ এই ফাইলে এই কাজেই পরিষ্কার হয়ে যাবে — `docs/DESIGN_SYSTEM_MIGRATION.md`-এর
    `modules/Results.tsx` এন্ট্রি আপডেট করতে হবে (নতুন count-সহ, বা "Done"-এ
    সরাতে হবে যদি পুরোপুরি ক্লিন হয়)।
  - "বিষয় যোগ করুন" বাটন → `saveResultSubjectBatch()` কল (marks খালি/blank
    রাখা ছাত্রদের entries-এ পাঠানো হবে না — শুধু যাদের নম্বর দেওয়া হয়েছে)।
    সফল হলে: সফলতা বার্তা, `subjectName`/`subjectFullMarks`/`marksById` রিসেট
    (class/exam/year রেখে দেওয়া, যাতে পরের বিষয় দ্রুত যোগ করা যায়), নিচের
    "সংরক্ষিত ফলাফল" লিস্ট রিফ্রেশ (বিদ্যমান `refreshList()`)।
  - single-student পুরনো ফর্ম (ছাত্র-বাছাই + একাধিক বিষয়ের ইনলাইন লিস্ট +
    add/remove বাটন) — সরিয়ে ফেলা হবে, bulk ফ্লো-ই একমাত্র এন্ট্রি-পথ হবে।
- **`client/src/i18n/bn.ts` ও `en.ts`** — `results` namespace আপডেট: নতুন কী
  (`selectExamType`, `subjectFullMarks`, `marksFor` বা প্রতি-রো প্লেসহোল্ডার,
  `addSubjectBatch`/সাফল্য বার্তা ইত্যাদি), অপ্রয়োজনীয় পুরনো কী (`selectStudent`,
  `addSubject` — যদি আর কোথাও ব্যবহার না হয়) রিমুভ করার আগে
  `grep -rn "t.results.selectStudent"` (ও প্রতিটা রিমুভ-প্রার্থী কী)-দিয়ে
  পুরো `client/src` জুড়ে ব্যবহার আছে কিনা যাচাই — শুধু `Results.tsx`-এই থাকলে
  নিরাপদে রিমুভ করা যাবে।

### Part 4 — যাচাই ও ডকুমেন্টেশন
- `npm run check` পাস করা (lint/typecheck/build/sync:roles/test:server) —
  এই sandbox-এ network বন্ধ থাকায় চালানো যায়নি, প্যাকেজড CMD-এই প্রথম আসল
  যাচাই হবে (আগের icon-migration টাস্কের মতোই)।
- `docs/PROJECT_MAP.md`-এ Results/ফলাফল-সংক্রান্ত লাইনগুলোতে (১৬, ১২৯ নং লাইনের
  আশেপাশে) এক লাইন যোগ করে নতুন per-subject batch-entry ওয়ার্কফ্লো উল্লেখ করা,
  যাতে পরের কোনো এজেন্ট PROJECT_MAP পড়ে পুরনো single-student ফ্লো ধরে না নেয়।
- এই এন্ট্রির শেষে অগ্রগতির সারাংশ লিখে **Status: DONE**-এ পরিবর্তন করা
  (icon-migration টাস্কের এন্ট্রির ফরম্যাট অনুসরণ করে)।

### কোন Part কেন এভাবে ভাগ করা হলো
- Part 1 আগে, কারণ 2 ও 3 দুটোই exam-type লিস্টের উপর নির্ভরশীল (server-এ
  validation, client-এ dropdown) — একবারই লিখে দুই জায়গায় বসানো ভালো, পরে
  বদলাতে হবে না।
- Part 2 (backend) আগে Part 3 (frontend)-এর — কারণ নতুন এন্ডপয়েন্ট
  (`POST /results/subject-batch`) প্রস্তুত ও টেস্ট করা না থাকলে frontend-এর
  bulk-সাবমিট বাটন টেস্ট করার কিছু থাকবে না।
- Part 4 সবশেষে — পুরো ফ্লো (exam-type সিলেক্ট → বিষয় → bulk এন্ট্রি →
  publish) এন্ড-টু-এন্ড রেডি হওয়ার পরই `npm run check` অর্থবহ পুরো-স্ট্যাক
  যাচাই দেয়।
- প্রতিটা Part আলাদাভাবে `npm run check`-যোগ্য একটা স্থিতিশীল অবস্থায় শেষ
  হবে (Part 1 শেষে শুধু নতুন কনস্ট্যান্ট ফাইল, কিছু ভাঙে না; Part 2 শেষে নতুন
  এন্ডপয়েন্ট থাকলেও পুরনো ফর্ম কাজ করে; Part 3 শেষে নতুন ফর্মই একমাত্র পথ) —
  তাই মাঝপথে সেশন থেমে গেলেও প্রতিটা Part-এর পরে repo একটা কাজ-করা অবস্থায়
  থাকবে।

## Task: ইমোজি-আইকন → কেন্দ্রীয়ভাবে ব্যবস্থাপনাযোগ্য SVG আইকনে মাইগ্রেশন
(lucide-react) — ৩ ভাগে বিভক্ত (ad-hoc, কোনো roadmap Phase-এর সাথে মেলে না)
Started: 2026-08-09 — সম্পন্ন: 2026-08-09 (৩ ভাগেই)

### প্রেক্ষাপট
ব্যবহারকারী পুরো প্রজেক্ট রিভিউ করিয়ে জানতে চেয়েছিলেন কোন জিনিস দেখলে মনে
হয় এটা AI দিয়ে তৈরি। সবচেয়ে বড় সিগনেচার হিসেবে ধরা পড়েছিল: কোনো icon
library ইনস্টল করা ছিল না — পুরো UI-তে raw emoji (🏠 📅 💰 ইত্যাদি) সরাসরি
string হিসেবে ৩৬টা `client/src` ফাইলে ছড়ানো ছিল, প্রতিটা component নিজের
মতো করে `icon: "🏠"` লিখে। এছাড়া root-এ একটা এতিম ডুপ্লিকেট `/src` ফোল্ডার
পাওয়া গেছে (`client/src`-এর পুরনো কপি, বিল্ডে ব্যবহৃত হয় না) — সেটাও এই
কাজের Part 3-এ মুছে ফেলা হবে।

সমাধান: `lucide-react` ইনস্টল করে একটা কেন্দ্রীয় ম্যাপ ফাইল
(`client/src/lib/icons.ts`) বানানো হয়েছে, যেখানে প্রতিটা semantic key
(যেমন `dashboard`, `students`, `lock`) একটা lucide আইকনে ম্যাপ করা।
ভবিষ্যতে কোনো আইকন বদলাতে শুধু এই এক ফাইল সম্পাদনা করলেই পুরো অ্যাপে
পরিবর্তন হয়ে যাবে।

**গুরুত্বপূর্ণ ব্যতিক্রম (স্কোপের বাইরে রাখা হয়েছে ইচ্ছাকৃতভাবে):**
- `→` (arrow) — এগুলো UI আইকন না, টেক্সটের অংশ (যেমন "বিস্তারিত →"),
  এই কাজে ছোঁয়া হয়নি।
- `PublicHeader.tsx`-এ `classes` prop থেকে আসা `c.icon` (ক্লাসের emoji,
  Website module থেকে অ্যাডমিন-এডিটেবল ডেটা) — এটা ইউজার-কনফিগারযোগ্য
  কন্টেন্ট, হার্ডকোডেড UI আইকন না, তাই এই মাইগ্রেশনের বাইরে। `mockData.ts`/
  `publicSiteDefaults.ts`-এর ডিফল্ট class-icon emoji নিয়ে Part 3-এ আলাদাভাবে
  সিদ্ধান্ত নিতে হবে (নিচে Part 3-এর নোট দেখুন) — সেটা content, চাইলে
  সেভাবেই থাকতে দেওয়া যায়।
- `server/public-platform/app.js` ও `server/public-marketing/app.js`
  React না, প্লেইন JS — এখানে lucide-react ব্যবহার করা যাবে না। Part 3-এ
  এই দুটোর জন্য আলাদা ছোট inline-SVG map লাগবে (নতুন npm dependency এখানে
  টানা যাবে না, `AGENTS.md` Rule 5 অনুযায়ী আগেই ব্যবহারকারীকে জানাতে হবে
  যদি কোনো নতুন প্যাকেজ লাগে — তবে inline SVG-তে কোনো dependency লাগার কথা
  না)।

### সম্পন্ন (Part 1 — কোর ইনফ্রাস্ট্রাকচার + শেল, 2026-08-09)
- [x] `client/package.json` — নতুন `lucide-react` dependency যোগ।
- [x] নতুন `client/src/lib/icons.ts` — কেন্দ্রীয় `Icons` map (24টা key:
  `dashboard`/`students`/`attendance`/`income`/`expenses`/`hifz`/`results`/
  `assignments`/`reports`/`website`/`settings`/`lock`/`bell`/`sms`/
  `paymentGateway`/`institutionBilling`/`auditLogs`/`brand`/`menu`/`close`/
  `school`/`guardianAttendance`/`guardianResults`/`guardianFeed`) +
  `IconKey` টাইপ এক্সপোর্ট।
- [x] `client/src/components/Sidebar.tsx` — `NAV_IDS`-এর `icon: string`
  (emoji) থেকে `icon: IconKey` টাইপে বদলানো, মূল লিস্ট + ৪টা NAV_IDS-বহির্ভূত
  ব্লক (guardian-reminders/sms/payment-gateway/institution-billing) + audit-logs
  — সবক'টা raw emoji স্প্যানকে `<Icon size={18} />` / `Icons.lock`-এ বদলানো।
  লোগো fallback (🕌) → `Icons.brand`।
- [x] `client/src/components/Topbar.tsx` — sidebar-toggle বাটনের ☰ →
  `Icons.menu`।
- [x] `client/src/components/GuardianShell.tsx` — `NAV_ITEMS` (৪টা আইটেম)
  emoji থেকে `IconKey`-তে, লোগো fallback (🕌) → `Icons.brand`।
- [x] `client/src/components/PublicHeader.tsx` — লোগো fallback (🏫) →
  `Icons.school`, মোবাইল মেনু বাটন (☰) → `Icons.menu`, ড্রয়ার ক্লোজ বাটন
  (✕) → `Icons.close`। (এই ফাইলের `c.icon` — ক্লাস ড্রপডাউনের এন্ট্রি — খুব
  ইচ্ছাকৃতভাবে ছোঁয়া হয়নি, উপরের নোট দেখুন।)
- [x] `client/src/components/PublicFooter.tsx` — লোগো fallback (🏫) →
  `Icons.school`।
- [x] `client/src/components/NotificationBell.tsx` — বেল বাটন (🔔) →
  `Icons.bell`।
- [x] `client/src/index.css` — `.guardian-header__logo-emoji`,
  `.guardian-nav-icon`, `.nav-item__lock-badge` — এই ৩টা ক্লাসের
  `font-size`-নির্ভর স্টাইল সরিয়ে `display: inline-flex; align-items: center`
  বসানো হয়েছে (emoji টেক্সটের বদলে এখন SVG চাইল্ড থাকে বলে)।
- **`npm run check` এই sandbox-এ চালানো যায়নি** (network বন্ধ) — packaged
  CMD-এই প্রথম রিয়েল যাচাই, বিশেষ করে `lucide-react`-এর named export
  গুলো (`Home`/`GraduationCap`/... ইত্যাদি) আসলে ইনস্টল হওয়া ভার্সনে
  বিদ্যমান কিনা তা নিশ্চিত করতে।

### বাকি (পরের এজেন্ট/সেশন এখান থেকে চালিয়ে যাবে)

**Part 2 — অ্যাডমিন প্যানেলের মডিউল ও পেজ (সম্পন্ন, 2026-08-09)**
- [x] `client/src/lib/icons.ts`-এ ১৬টা নতুন semantic key যোগ: `add`,
  `alertTriangle`, `checkCircle`, `clipboard`, `printer`, `pencil`,
  `teacherSalary`, `food`, `electricity`, `maintenance`, `stationery`,
  `otherExpense`, `sparkles`, `gallery`, `inbox`, `chat`।
- [x] `client/src/components/StatCard.tsx` — `icon: string` (emoji) থেকে
  `icon: IconKey`-তে বদলানো, ভেতরে `<Icon size={20} />` রেন্ডার করে।
- [x] `modules/Dashboard.tsx` — সব `<StatCard icon="...">` prop + `logIcon()`
  হেল্পার ফাংশন (এখন `IconKey` রিটার্ন করে, রেন্ডার সাইটে `Icons[key]` দিয়ে
  কম্পোনেন্ট রেজলভ করা হয়)।
- [x] `modules/Fees.tsx` — `<StatCard>` props, রসিদ বাটনের 🧾, "সংরক্ষণ
  হচ্ছে/বেতন গ্রহণ" বাটনের ⏳/✅।
- [x] `modules/Income.tsx` — `<StatCard>` props।
- [x] `modules/Expenses.tsx` — `<StatCard>` props + `QUICK_ICONS` ম্যাপ
  (এখন `Record<string, IconKey>`, ইনলাইন রেজলভ করে রেন্ডার করে)।
- [x] `modules/Reports.tsx` — `reports` অ্যারের `icon: string` →
  `icon: IconKey`, কার্ড রেন্ডার + প্রিন্ট বাটনের 🖨️। `index.css`-এর
  `.report-card__icon`ও font-size থেকে inline-flex-এ বদলানো হয়েছে (SVG
  চাইল্ডের জন্য)।
- [x] `modules/Settings.tsx` — Drive এনক্রিপশন স্ট্যাটাস (🔒/⚠️), protected
  user badge (🔒), ইউজার-এডিট বাটনের ✏️।
- [x] `modules/Website.tsx` — `GROUPS`-এর `WebsiteSectionCard.icon: string`
  → `IconKey`, কার্ড রেন্ডার + শীর্ষের 🌐 পিল + নিচের 💡 টিপ।
- [x] `modules/WebsiteSectionEditor.tsx` — `SECTION_META`-এর
  `icon: string` → `IconKey` (হেডার আইকন + 💡 নোট), লিস্ট থেকে ক্যাটাগরি
  মোছার ✕ বাটন, "সংরক্ষিত হয়েছে" ✓ লেবেল — **ইচ্ছাকৃতভাবে ছোঁয়া হয়নি**:
  `highlights`/`departments`/`classes`/`admissionSteps`-এর ডিফল্ট
  `icon: "✨"/"📖"/"🎓"/"✓"` কনটেন্ট-ভ্যালু এবং সংশ্লিষ্ট `<input
  placeholder="...">`গুলো — এগুলো অ্যাডমিন-এডিটেবল কন্টেন্ট (`c.icon`
  প্যাটার্নেরই অংশ), হার্ডকোডেড UI ক্রোম না, Part 3-এর `publicSiteDefaults.ts`
  সিদ্ধান্তের সাথেই একসাথে বিবেচনা করতে হবে।
- [x] `InstitutionBilling.tsx` — স্ক্যান করে কোনো emoji পাওয়া যায়নি, কোনো
  পরিবর্তন লাগেনি।
- [x] `components/PlanFeatureGate.tsx` — লক আইকন 🔒 (`.plan-lock__icon`
  CSS-ও font-size থেকে inline-flex-এ বদলানো হয়েছে)।
- [x] `components/GuardianMessengerBubble.tsx` — ভাসমান বাবল আইকন 💬।
- [x] `components/ReceiptModal.tsx` — লোগো fallback 🕌 (`Icons.brand`,
  Sidebar/GuardianShell-এর একই fallback প্যাটার্নে), প্রিন্ট বাটনের 🖨️।
- [x] `components/ReportDateFilter.tsx` — হেডিং-এর 📅।
- [x] `data/mockData.ts` — `NAV` অ্যারের `icon: string` → `IconKey`
  (এই `NAV` const আসলে অ্যাপে কোথাও ইমপোর্ট হয় না — dead demo data — কিন্তু
  স্কোপ-লিস্টে থাকায় প্যাটার্ন মিলিয়ে আপডেট করা হয়েছে)।
- **যাচাই এই সেশনে:** সবগুলো এডিটেড ফাইলে bracket-balance script (`(`/`)`,
  `{`/`}`, `[`/`]` প্রতিটা ফাইলে মিলেছে) + প্রতিটা ব্যবহৃত `Icons.<key>`/
  `icon: "<key>"` স্ট্রিং `icons.ts`-এর `Icons` ম্যাপের বিপরীতে ক্রস-চেক
  করা হয়েছে (সব key বিদ্যমান, কোনো typo পাওয়া যায়নি)। **এই sandbox-এ
  network বন্ধ থাকায় `npm install`/`npm run check` (আসল tsc/eslint) চালানো
  যায়নি — packaged CMD-এই এই ডেলিভারির প্রথম রিয়েল যাচাই।**

**Part 3 — পাবলিক-ফেসিং পেজ, সার্ভার-সাইড সাইট, ও ক্লিনআপ (সম্পন্ন, 2026-08-09)**
- [x] `client/src/lib/icons.ts`-এ ১২টা নতুন semantic key যোগ: `key`, `eye`,
  `rocket`, `clock`, `camera`, `handshake`, `trophy`, `chevronLeft`,
  `chevronRight`, `attachment`, `childAvatar`, `palette`।
- [x] React পেজ মাইগ্রেট: `AdmissionApply.tsx` (✅), `Login.tsx`/
  `ResetPassword.tsx` (লোগো/key fallback, Sidebar-এর প্যাটার্নে),
  `Pricing.tsx` (✅/🕐), `WebsitePreview.tsx` (✅/👁️/🚀/✕),
  `Gallery.tsx` (হিরো ডেকোরেশন ৬ আইকন + লাইটবক্স close/‹/›),
  `About.tsx` (`principles` — সম্পূর্ণ হার্ডকোডেড মডিউল-লেভেল কনস্ট্যান্ট,
  content না — ✨/🎨/👳/💬), `Admission.tsx` (✅ ৩টা + `c.icon` fallback
  **ছোঁয়া হয়নি**, নিচে দেখুন), `guardian/GuardianLogin.tsx` (🕌),
  `guardian/GuardianDashboard.tsx` (🧒), `guardian/GuardianFeed.tsx` (📎)।
- [x] `client/src/index.css` — `.guardian-auth-emoji`,
  `.guardian-child-avatar--placeholder` font-size সরিয়ে inline-flex
  centering (Part 1-এর প্যাটার্নে)।
- [x] `server/public-platform/app.js` — plain JS বলে একটা ছোট
  `svgIcon()`/`ICONS` হেল্পার (24x24 viewBox, 2px stroke, lucide-এর মতোই
  outline স্টাইল) যোগ করে সবক'টা emoji (🕌✉️🔒🏫✅⏳⛔📱👤⚙️💳) বদলানো
  হয়েছে — কোনো নতুন npm dependency লাগেনি (raw `<svg>` টেমপ্লেট স্ট্রিং)।
- [x] `server/public-marketing/app.js` — একই প্যাটার্নে নিজস্ব `ICONS`
  হেল্পার (🎓🗓📖🔔🔒🎉ও বদলানো হয়েছে; `৳` (টাকা চিহ্ন) কনটেন্ট রয়ে গেছে,
  ওটা currency symbol, UI icon না)।
- [x] root-এর এতিম ডুপ্লিকেট `/src` ফোল্ডার মুছে ফেলা হয়েছে — কনফার্ম করা
  হয়েছে কোনো `vite.config.ts`/`package.json`/import কোথাও এটা রেফারেন্স
  করে না।
- **ইচ্ছাকৃতভাবে ছোঁয়া হয়নি (ব্যবহারকারীর 2026-08-09 সিদ্ধান্ত: ক্লাস-আইকন
  content হিসেবেই থাকবে, fixed icon-picker বানানো হবে না):**
  `client/src/lib/publicSiteDefaults.ts`, `server/src/lib/siteContent.js`
  (ডিফল্ট highlights/departments-এর 🏛🏠👳📞📖🕌📚🎓), `Home.tsx`-এর
  `programs` ফলব্যাক অ্যারে (উপরের ডিফল্টের হুবহু ডুপ্লিকেট),
  `ClassesCourses.tsx`/`Admission.tsx`-এর `c.icon || "🎓"` fallback,
  `WebsiteSectionEditor.tsx`-এর highlights/departments/classes/
  admissionSteps ডিফল্ট আইকন (Part 2-এ ইতিমধ্যে বাদ রাখা হয়েছিল)।
- **যাচাই এই সেশনে:** সবগুলো এডিটেড ফাইলে bracket-balance script পাস +
  সব `Icons.<key>` ব্যবহার `icons.ts`-এর ম্যাপের বিপরীতে ক্রস-চেক (কোনো
  missing key নেই) + দুই server app.js ফাইলে `node --check` দিয়ে syntax
  যাচাই (pass)। **`npm run check`/`npm install` এই sandbox-এ চালানো
  যায়নি** (network বন্ধ, আগের সব Part-এর মতোই সীমাবদ্ধতা) — packaged
  CMD-এই এই ডেলিভারির প্রথম রিয়েল যাচাই।
- `docs/PROJECT_MAP.md`-এ `client/src/lib/icons.ts`-এর এন্ট্রি যোগ করা
  হয়েছে (নিচে দেখুন)।

### নোট
সম্পূর্ণ ৩-ভাগের ইমোজি→SVG মাইগ্রেশন টাস্ক শেষ। পরের কোনো ফিচারে আইকন
লাগলে সরাসরি `client/src/lib/icons.ts`-এর `Icons` ম্যাপ ব্যবহার করা উচিত
(React অংশে), অথবা plain-JS server app.js ফাইলগুলোর জন্য একই ফাইলের
`ICONS`/`svgIcon()` প্যাটার্ন অনুসরণ করা উচিত — নতুন করে raw emoji
স্ট্রিং না লেখা।

---

## Status: IN_PROGRESS

## Task: প্ল্যাটফর্ম সেলফ-সার্ভিস বিলিং — প্রতিষ্ঠান নিজে মাসিক সাবস্ক্রিপশন
বিল বিকাশে পরিশোধ করবে (ad-hoc, BUSINESS_READINESS_ROADMAP.md-এর কোনো
Phase-এর সাথে মেলে না — দিকটা Phase 8E/8F-এর উল্টো: institution -> platform,
guardian -> institution না)
Started: 2026-08-09

### প্রেক্ষাপট
Phase 8 (SMS wallet + guardian bKash) পুরোপুরি কমপ্লিট পাওয়ার পর
ব্যবহারকারী জানতে চান কীভাবে প্রতিষ্ঠান-মালিকদের কাছ থেকে মাসিক প্ল্যাটফর্ম
ফি সংগ্রহ করা যায়। bKash-এর সত্যিকারের "Subscription" (silent auto-debit)
প্রোডাক্টের জন্য bKash-এর সাথে আলাদা ব্যবসায়িক অনুমোদন লাগে (কোডের বিষয় না)
— তাই এই টাস্কের স্কোপ একটা বাস্তবসম্মত "সেমি-অটোমেটিক" ভার্সন: প্রতিষ্ঠানের
Super Admin নিজের প্যানেল থেকে এক ক্লিকে বিকাশ চেকআউটে যাবে, বাকি সব
(রেকর্ড রাখা, subscription_ends_at বাড়ানো, status active করা) স্বয়ংক্রিয়।

### বাস্তবায়িত (২০২৬-০৮-০৯, `node --check` দিয়ে syntax যাচাই করা হয়েছে,
কোনো live রান হয়নি এখনো)
- [x] `registry.platform_gateway` — প্ল্যাটফর্মের নিজস্ব bKash অ্যাকাউন্ট
  (এনক্রিপ্টেড, `institution_payment_gateways`-এর same shape কিন্তু
  registry schema-তে, এক রো)
- [x] `registry.platform_payment_intents` — `bkash_payment_intents`-এর
  registry-level কাউন্টারপার্ট, `institution_id` দিয়ে কে পরিশোধ করছে ট্র্যাক
- [x] `lib/platformGatewayCredentials.js` — গেটওয়ে কানেক্ট/পড়া/ডিসকানেক্ট
- [x] `routes/institutionBilling.js` (তেনান্ট-সাইড, `/api/institution-billing`)
  — `/status`, `/bkash/create`, `/bkash/execute`; সফল হলে existing
  `registryDb.recordPayment()` কল হয় (Super-Admin-এর ম্যানুয়াল payment-entry
  ঠিক একই ফাংশন ব্যবহার করে, লজিক ডুপ্লিকেট হয়নি); শুধু multi-tenant মোডে
  কাজ করে, `req.tenant` না থাকলে ৪০৪
- [x] `routes/platform.js` — `/billing/gateway/status` (সব platform admin),
  `/connect`, `/disconnect` (শুধু super_admin)
- [x] `config/roles.js`, `index.js` — নতুন রুট ওয়্যার করা হয়েছে
- [x] `server/public-platform/app.js` + `styles.css` — "💳 বিলিং গেটওয়ে" বাটন
  (শুধু super_admin দেখে) + কানেক্ট/ডিসকানেক্ট মোডাল
- [x] `client/src/modules/InstitutionBilling.tsx` (নতুন) — status card +
  পরিমাণ/মেয়াদ দিয়ে "এখনই পরিশোধ করুন" বাটন, `SmsSettings.tsx`-এর
  create→redirect→execute-on-return-এর same প্যাটার্ন
- [x] `types/index.ts`, `lib/api.ts` — `InstitutionBillingStatus` +
  ৩টা api ফাংশন
- [x] `App.tsx` (`/settings/billing` রুট, কোনো `PlanFeatureGate` নেই —
  নিজের বিল পরিশোধ করা কোনো প্ল্যান-ফিচার না), `Sidebar.tsx` (🧾 এন্ট্রি)
- [x] `i18n/bn.ts` + `en.ts` — `nav.institutionBilling` +
  পুরো `institutionBilling` ব্লক (দুই ফাইলেই প্যারালাল কী)

### বাকি (পরের এজেন্ট এখান থেকে শুরু করবে)
- [ ] **প্রথমেই zip প্যাক করে user preferences অনুযায়ী CMD দিয়ে ডেলিভার করা
  হয়নি** — এই সেশনেই এরপর হওয়ার কথা
- [ ] `npm run check` (lint/typecheck/build/test) এখনো লাইভ চালিয়ে দেখা হয়নি
  — সম্ভাব্য সমস্যা: `Badge`/`Button`/`Field` প্রপ-টাইপ মিসম্যাচ (best-effort
  মেলানো হয়েছে existing usage দেখে, কিন্তু tsc রান করে কনফার্ম করা হয়নি)
- [ ] মাইগ্রেশন SQL (`registry.platform_gateway` +
  `registry.platform_payment_intents`) Platform প্যানেলের tenant-migration
  টুল দিয়ে রান করা হয়নি এখনো (এটা `registry` schema-তে, তাই
  `migrateAllTenants()` না — সরাসরি একবার রান করলেই হবে, প্রতি tenant-এ
  আলাদা করে লাগবে না)
- [ ] মাসিক রিমাইন্ডার/নোটিফিকেশন (SMS+in-app, বিল বাকি থাকলে) — এখনো শুরুই
  হয়নি, সম্পূর্ণ ভবিষ্যতের কাজ; `guardianReminderScheduler.js`-এর প্যাটার্ন
  অনুসরণ করা যেতে পারে
- [ ] Sandbox দিয়ে end-to-end টেস্ট (super_admin গেটওয়ে কানেক্ট →
  Institution Super Admin "এখনই পরিশোধ করুন" → PIN 12121/OTP 123456 →
  `subscription_ends_at` বেড়েছে কিনা যাচাই) — একদম বাকি
- [ ] `GATEWAY_CREDENTIAL_KEY` env var আগে থেকেই সেট থাকতে হবে (Phase 8E-এর
  জন্য আগেই করা থাকার কথা — শুধু একবার যাচাই করা)

## Status: DONE

## Task: শর্তভিত্তিক (conditional) গার্ডিয়ান রিমাইন্ডার — বকেয়া বেতন/দেরিতে
উপস্থিতি/হাজিরা-মিসিং/নির্বাচিত-ছাত্র, ইন্টারভাল+সময়-ভিত্তিক শিডিউল
(ad-hoc, docs/BUSINESS_READINESS_ROADMAP.md-এর কোনো Phase-এর সাথে মেলে না)
Started: 2026-08-08

**পূর্ণাঙ্গ পরিকল্পনা `docs/CONDITIONAL_REMINDERS_PLAN.md`-এ লেখা আছে —
বাস্তবায়ন শুরুর আগে অবশ্যই সেই ফাইলটা পুরোটা পড়ে নিতে হবে। এখানে শুধু
সারসংক্ষেপ ও ট্র্যাকিং।**

### ব্যবহারকারীর নিশ্চিত করা সিদ্ধান্ত (চ্যাট থেকে)
1. ৪টা নতুন targetType: `feeDue` (বকেয়া বেতন, গার্ডিয়ান-ভিত্তিক গ্রুপড
   মেসেজ), `lateArrival` (আজ দেরিতে-মার্ক), `attendanceMissing` (নির্দিষ্ট
   সময়ের পরও হাজিরা রো নেই), `selectedStudents` (Attendance পেজ থেকে
   ম্যানুয়াল সিলেকশন, existing `scheduleType:"once"` মেকানিজম রিইউজ করে
   তাৎক্ষণিক পাঠানো — নতুন এন্ডপয়েন্ট লাগবে না)।
2. তিনটা অটোমেটিক টাইপের (feeDue/lateArrival/attendanceMissing) জন্যই
   `intervalDays` (কত দিন পরপর, admin-সিলেক্টেবল ১-৩০) + `scheduleTime`
   (কয়টায়) — প্রতি ক্লাসের জন্য আলাদা রুল বানিয়ে আলাদা সময় দেওয়া যাবে।
3. `feeDue`-এর "১০ তারিখের পর থেকে" শুরুর ধারণাটা হার্ডকোড না করে
   ইন্টারভাল-ভিত্তিক জেনারেল সিস্টেমে মিশিয়ে দেওয়া হয়েছে — শুরুর তারিখ
   = রিমাইন্ডার তৈরি/সক্রিয় করার দিন। আলাদা dayOfMonth ফিল্ড এই ফেজে
   নেই (প্ল্যান ডকের §১ পয়েন্ট ৫-এ কারণ লেখা আছে)।

### সম্পন্ন
- [x] Phase 1 — DB migration। `server/sql/supabase_schema.sql`-এ
  `guardian_reminders`-এর নিচে ৩টা `alter table ... add column if not
  exists` (`scheduleTime` text, `intervalDays` integer default 1,
  `selectedStudentIds` jsonb) + `"targetType"` কলামের কমেন্টে ৪টা নতুন
  ভ্যালু যোগ। কোনো নতুন টেবিল না, backward compatible।
- [x] Phase 2 — `server/src/lib/guardianReminders.js`:
  `resolveTargetGuardianIds()`-এ ৪টা নতুন ব্রাঞ্চ (feeDue/lateArrival/
  attendanceMissing/selectedStudents) যোগ হয়েছে existing
  all/class/student ব্রাঞ্চ অক্ষত রেখে। নতুন `buildFeeDueBodies()`
  হেল্পার (per-guardian গ্রুপড ফী-বকেয়া মেসেজ)। `dispatchReminder()`-এ
  `targetType === "feeDue"`-এর জন্য একটা early-return শাখা যোগ হয়েছে যেটা
  প্রতি গার্ডিয়ানকে আলাদা personalized body দিয়ে `notifyGuardians()`
  কল করে (বাকি সব টাইপ আগের shared-payload পথেই যায়, অপরিবর্তিত)।
  `node --check` দিয়ে syntax যাচাই করা হয়েছে।

### বাকি
সব সম্পন্ন — Phase 3-6 (২০২৬-০৮-০৯) একটা পরের সেশনে বাস্তবায়িত হয়েছে,
`npm run check` পাস করেছে (একবার lint fix লেগেছিল —
`useEffect`-এর ভেতর `setState` কল করা যাচ্ছিল না, event handler-এ সরানো
হয়েছে), আর load-test দিয়ে (Artillery, প্রোডাকশনে) ম্যানুয়ালি যাচাই করা
হয়েছে। কোনো বাকি নেই।

### নোট
কোনো নতুন টেবিল বা নতুন API রুট লাগছে না — সবকিছু existing
`guardian_reminders`/`guardian_messages` টেবিল আর existing
`POST /api/guardian-reminders` এন্ডপয়েন্টের সম্প্রসারণ। বিস্তারিত কারণ ও
কোড স্নিপেট প্ল্যান ডকে আছে, এখানে পুনরাবৃত্তি করা হলো না।

---

## Status: DONE

## Task: Guardian push "sent successfully but never shows on phone" — root
cause found & fixed: sw.js served with a 1-year immutable cache header
(ad-hoc, 2026-08-08 সম্পন্ন)

### সমস্যা (কয়েক দিনের ডিবাগিং সেশনের শেষে ধরা পড়েছে)
`server/src/index.js`-এ `express.static(clientDist, { setHeaders... })`-এ
শুধু `index.html`-কে `no-cache` দেওয়ার exception ছিল — বাকি **সব** ফাইলকে
(hash-করা `dist/assets/*` চাঙ্ক এবং `client/public/`-এর হুবহু-কপি করা
ফাইল, দুটোকেই একইভাবে) `Cache-Control: public, max-age=31536000,
immutable` (১ বছর) দেওয়া হচ্ছিল। `sw.js` hash-করা না (ফাইলনেম কখনো
বদলায় না), তাই একবার কোনো গার্ডিয়ানের ব্রাউজার `sw.js` ফেচ করলে
পরবর্তী পুরো এক বছর ব্রাউজার সার্ভারকে **জিজ্ঞেসই করত না** নতুন ভার্সন
আছে কিনা — তাই push feature আসার আগে যারা একবার সাইট ভিজিট করেছিলেন,
তাদের ব্রাউজারে `sw.js`-এর পুরনো (push listener ছাড়া) ভার্সনই স্থায়ীভাবে
আটকে ছিল। ডায়াগনস্টিক লগ দিয়ে নিশ্চিত হয়েছিল সার্ভার-সাইড push ১০০%
সফল (`send OK`) হচ্ছিল, তবু ফোনে কিছুই দেখাচ্ছিল না — এই cache header-ই
আসল কারণ।

### সম্পন্ন
- [x] `server/src/index.js`-এ `setHeaders()`-এর শর্ত পাল্টে দেওয়া হয়েছে:
  শুধু `dist/assets/` পাথের ভেতরের ফাইল (Vite-এর content-hash করা চাঙ্ক)
  immutable cache পায়, বাকি সব (root-level `public/`-এর ফাইল, `sw.js`
  সহ) `no-cache`।
- [x] `server/src/lib/guardianPush.js`-এর সাময়িক `[debug]` ডায়াগনস্টিক
  লগিং সরিয়ে ফেলা হয়েছে (কাজ শেষ, আসল কারণ পাওয়া গেছে)।

### বাকি (ব্যবহারকারীর ম্যানুয়াল ধাপ, কোনো কোড না)
- [ ] ডিপ্লয়ের পরও যেসব গার্ডিয়ান আগে থেকেই সাইট ভিজিট করে ফেলেছেন,
  তাদের ব্রাউজারে পুরনো `sw.js` এখনো cached থাকতে পারে (নতুন no-cache
  header শুধু *পরবর্তী* ফেচ থেকে কার্যকর হয়)। তাদের একবার সাইটের ডেটা
  ক্লিয়ার করে/অ্যাপ uninstall-reinstall করে সতেজ `sw.js` আনতে হবে —
  নতুন কোনো গার্ডিয়ান (এই ফিক্সের পরে প্রথমবার ভিজিট করছেন) এই সমস্যায়
  পড়বেন না, তাদের জন্য এমনিতেই ঠিক থাকবে।

---


করলে ভুল পেজে (staff root "/") ওপেন হওয়ার বাগ (ad-hoc, 2026-08-08 সম্পন্ন)

### সমস্যা (ব্যবহারকারীর স্ক্রিনশট থেকে ধরা পড়েছে)
`client/public/manifest.webmanifest`-এ `start_url: "/"` হার্ডকোডেড ছিল —
গার্ডিয়ান `/guardian` পেজ থেকে "Install app" করলেও Chrome ইনস্টল করা
অ্যাপটাকে সবসময় `"/"` দিয়ে খুলত, যেটা আসলে **staff-side Dashboard**
(`ProtectedRoute` গার্ড করা, staff login লাগে) — guardian পোর্টাল না।
গার্ডিয়ানের staff সেশন না থাকায় API কল ব্যর্থ হতো ("অনুরোধ ব্যর্থ হয়েছে"
+ সব শূন্য দেখাতো)।

### সম্পন্ন
- [x] নতুন `client/public/guardian-manifest.webmanifest` — আলাদা manifest,
  `start_url: "/guardian"`, `scope: "/guardian/"`, নাম "মাদরাসা গার্ডিয়ান
  পোর্টাল"।
- [x] নতুন `client/public/manifest-select.js` (external, CSP-safe — এই
  অ্যাপের CSP `script-src 'self'` কোনো `'unsafe-inline'` ছাড়া, তাই
  `reload-splash.js`-এর ঠিক একই প্যাটার্নে বাইরের ফাইল হিসেবে) —
  `location.pathname` `/guardian` দিয়ে শুরু হলে manifest `<link>`-কে
  `guardian-manifest.webmanifest`-এ সুইচ করে দেয়, Chrome installability
  যাচাই করার আগেই।
- [x] `client/index.html` — manifest link-এর ঠিক পরে
  `<script src="/manifest-select.js"></script>` যোগ।
- মূল `manifest.webmanifest` (staff-side, `start_url: "/"`) অপরিবর্তিত —
  স্টাফ-সাইড ইনস্টলে কোনো প্রভাব পড়েনি।

### বাকি (ব্যবহারকারীর ম্যানুয়াল ধাপ, কোনো কোড না)
- [ ] যেসব গার্ডিয়ান আগেই ভুল manifest দিয়ে অ্যাপ ইনস্টল করে ফেলেছেন,
  তাদের **আগের ইনস্টলটা মুছে (uninstall) নতুন করে `/guardian`/
  `/guardian/login` পেজ থেকে আবার ইনস্টল করতে হবে** — একবার ইনস্টল করা
  PWA পুরনো manifest-এই বাঁধা থাকে, ডিপ্লয় হলেই নিজে থেকে আপডেট হয় না।

---


Started: 2026-08-08

**পূর্ণাঙ্গ পরিকল্পনা `docs/PUSH_NOTIFICATION_PLAN.md`-এ লেখা আছে —
বাস্তবায়ন শুরুর আগে অবশ্যই সেই ফাইলটা পুরোটা পড়ে নিতে হবে। এখানে শুধু
সারসংক্ষেপ ও ট্র্যাকিং।**

### ব্যবহারকারীর নিশ্চিত করা সিদ্ধান্ত (2026-08-08)
1. প্রযুক্তি: Web Push API + VAPID (নতুন dependency শুধু `web-push`,
   কোনো Firebase/Google অ্যাকাউন্ট লাগবে না — AGENTS.md Rule 5 অনুযায়ী
   আগেই ব্যবহারকারীকে জানানো ও কনফার্ম করা হয়েছে)।
2. স্কোপ: শুধু guardian reminder না — গার্ডিয়ান রিমাইন্ডার **এবং**
   ক্লাস পোস্ট/এসাইনমেন্ট/নোটিশ/বার্তা (`classPosts.js`) দুটোই একই
   কেন্দ্রীয় `notifyGuardians()` ফাংশন দিয়ে পুশ পাবে।
3. Admin-সাইড নোটিফিকেশন বেল (`NotificationBell.tsx`) অপরিবর্তিত থাকবে —
   পুশ শুধু গার্ডিয়ান সাইডেই, স্টাফ সাইডে না।

### সম্পন্ন
- [x] পূর্ণাঙ্গ ৭-ফেজ পরিকল্পনা লেখা হয়েছে (`docs/PUSH_NOTIFICATION_PLAN.md`) —
  আর্কিটেকচার, প্রতিটি ফেজে কোন ফাইল ছোঁয়া হবে তার টেবিল, বিদ্যমান
  guardian reminder ও class-posts সিস্টেমের সাথে সংযোগ-বিন্দু ব্যাখ্যা।
- [x] **Phase 0** — `.env.example`-এ নতুন "Guardian Push Notifications"
  সেকশন যোগ (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`, সব
  কমেন্ট-আউট — unset থাকলে push disabled, বিদ্যমান পোলিং বাবল স্বাভাবিক
  কাজ করে, ঠিক `SMS_PROVIDER_API_KEY`-এর no-op-if-unset প্যাটার্নে)। একটা
  বাস্তব VAPID কীপেয়ার এই সেশনে জেনারেট করে ব্যবহারকারীকে চ্যাটে সরাসরি
  দেওয়া হয়েছে (`.env.example`-এ real secret লেখা হয়নি, শুধু জেনারেট করার
  কমান্ড — `BACKUP_ENCRYPTION_KEY`-এর ঠিক প্যাটার্নে)। **কোনো npm install
  লাগেনি** — pure Node `crypto.createECDH('prime256v1')` দিয়েই `web-push`
  প্যাকেজের `generateVAPIDKeys()`-এর সমতুল্য কী জেনারেট করা হয়েছে।
  ব্যবহারকারী নিজের (গিট-ইগনোর করা) `.env`-এ ও হোস্টিং প্ল্যাটফর্মের
  Environment Variables প্যানেলে আসল কী তিনটা বসিয়ে দিয়েছেন বলে কনফার্ম
  করেছেন (2026-08-08) — Phase 0 সম্পূর্ণ শেষ, পরের কোনো এজেন্টের এটা নিয়ে
  আর কিছু করার নেই।
- [x] **Phase 1** — `server/sql/supabase_schema.sql`-এ নতুন
  `guardian_push_subscriptions` টেবিল যোগ (`guardian_messages` টেবিলের
  ঠিক নিচে, protected-path SQL migration — AGENTS.md Rule 4 অনুযায়ী
  অনুমোদিত কারণ কাজটা explicitly এই বিষয়েই)। কলাম: `id`, `"guardianId"`
  (FK → guardian_accounts, cascade delete), `endpoint` (unique — natural
  upsert key, একই ব্রাউজার/ডিভাইস পুনরায় সাবস্ক্রাইব করলে ডুপ্লিকেট রো না
  হয়ে আপডেট হবে), `p256dh`/`auth` (ব্রাউজারের এনক্রিপশন কী, Web Push
  স্পেকের প্রয়োজন), `"userAgent"` (ডিবাগের জন্য), `"createdAt"`। ইনডেক্স
  `"guardianId"`-এর উপর, বাকি সব guardian-টেবিলের কনভেনশন মিলিয়ে। parens
  balance ম্যানুয়ালি যাচাই করা হয়েছে (148/148, ফাইলে কোনো syntax ভাঙেনি)।
  **`migrateTenants.js` ফাইলে কোনো কোড পরিবর্তন লাগেনি** — সেটা আগে থেকেই
  জেনেরিক টুলিং (`migrateOneTenant`/Super-Admin প্যানেলের "run SQL on all
  tenants" ফিচার), নতুন টেবিলের জন্য এখানে কিছু এডিট করার দরকার হয় না,
  Phase 8A-র মতোই বিদ্যমান tenant-দের জন্য শুধু ম্যানুয়াল অ্যাকশন লাগবে
  (নিচে "বাকি" দেখুন)।
- [x] **Phase 2 + Phase 3 (একসাথে, ব্যবহারকারীর অনুরোধে ব্যাচ করা হয়েছে)** —
  পুশ পাঠানোর সম্পূর্ণ ব্যাকএন্ড + সাবস্ক্রাইব ইনফ্রা:
  - `server/package.json` — নতুন `web-push` ডিপেন্ডেন্সি (`^3.6.7`)।
  - `server/src/lib/guardianPush.js` (নতুন) — `notifyGuardians(guardianIds,
    { title, body, url })`, একমাত্র জায়গা যেখানে `web-push` ইম্পোর্ট হয়।
    `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` অনুপস্থিত হলে
    silent no-op (`smsSender.js`-এর প্যাটার্নে)। প্রতিটা সাবস্ক্রিপশনে
    আলাদা `sendNotification()` কল, কখনো throw করে না — 404/410 (Gone)
    পেলে সেই সাবস্ক্রিপশন রো নিজে থেকেই DB থেকে ডিলিট করে দেয় (dead
    সাবস্ক্রিপশনে বারবার চেষ্টা এড়াতে)। `saveSubscription()`/
    `deleteSubscription()`/`getVapidPublicKey()`ও এই ফাইলেই।
  - `server/src/routes/guardianAuth.js` — তিনটা নতুন রুট (বিদ্যমান
    `/messages/:id/read`-এর ঠিক পরে): `GET /push/vapid-public-key`
    (ownership-চেক ছাড়াই — public key secret না), `POST /push/subscribe`
    (`requireActiveGuardianId` + `verifyCsrfToken`, endpoint upsert),
    `DELETE /push/subscribe`।
  - `client/public/sw.js` — নতুন `push` ইভেন্ট লিসেনার
    (`showNotification()`, আইকন `/icon.svg` — বিদ্যমান manifest-এর একমাত্র
    আইকন, নতুন png বানানো হয়নি) + `notificationclick` লিসেনার (আগে থেকে
    খোলা ট্যাব থাকলে সেটাই focus+navigate করে, নাহলে নতুন উইন্ডো খোলে)।
    বিদ্যমান cache/fetch লজিক অক্ষত।
  - `client/src/components/GuardianPushSetup.tsx` (নতুন, headless — কিছু
    render করে না) — লগইন সেশনে একবার VAPID public key আনে, browser
    permission চায় (শুধু প্রথমবার — `localStorage`-এ ফ্ল্যাগ রেখে বারবার
    prompt এড়ানো হয়েছে), `PushManager.subscribe()` কল করে সাবস্ক্রিপশন
    backend-এ সেভ করে। যেকোনো ধাপে সমস্যা হলে (browser সাপোর্ট নেই, VAPID
    কনফিগার করা নেই, permission denied) চুপচাপ থেমে যায় — বিদ্যমান
    পোলিং বাবল (`GuardianMessengerBubble.tsx`, অক্ষত) স্বাভাবিক কাজ করতে
    থাকে fallback হিসেবে।
  - `client/src/components/GuardianShell.tsx` — `<GuardianPushSetup />`
    বসানো হয়েছে `<GuardianMessengerBubble />`-এর ঠিক পাশে, শেলের রুট
    লেভেলে (ওই কম্পোনেন্টের কোনো কোড ছোঁয়া হয়নি)।
  - `client/src/lib/api.ts` — `api.guardian`-এ তিনটা নতুন ফাংশন
    (`getVapidPublicKey`/`subscribePush`/`unsubscribePush`,
    `createBkashPayment`/`executeBkashPayment`-এর ঠিক পাশে বসানো)।
  - সব নতুন/পরিবর্তিত `.js` ফাইল `node --check` পাস করেছে
    (`guardianPush.js`, `guardianAuth.js`)। সব `.ts`/`.tsx` ফাইলে
    bracket-balance ম্যানুয়ালি যাচাই করা হয়েছে (`guardianAuth.js`-এ
    parens কাউন্টে একটা mismatch এসেছিল কিন্তু সেটা Bengali কমেন্টের
    ভেতরের বন্ধনী চিহ্নের কারণে false-positive — `node --check` পাস
    করেছে বলে নিশ্চিত করা গেছে সেটা আসল সিনট্যাক্স এরর না)।
    **এই sandbox-এ network বন্ধ থাকায় `npm install`/`npm run check`
    চালানো যায়নি — packaged CMD-এই এটার প্রথম রিয়েল যাচাই, বিশেষ করে
    নতুন `web-push` ডিপেন্ডেন্সি আসলেই ইনস্টল হচ্ছে ও TypeScript নতুন
    `.tsx` ফাইলে কোনো টাইপ এরর দিচ্ছে না তা নিশ্চিত করতে।**

- [x] **Phase 4** — `server/src/lib/guardianReminders.js`-এ শীর্ষে
  `const { notifyGuardians } = require("./guardianPush");` যোগ করা
  হয়েছে, এবং `dispatchReminder()`-এ `guardian_messages` রো ইনসার্ট +
  `lastSentAt` আপডেটের ঠিক পরে (per-guardian লুপের বাইরে, একবার সব
  টার্গেট `guardianId`-এর জন্য একসাথে) `notifyGuardians(guardianIds,
  { title: reminder.title, body: reminder.body, url: "/guardian" })`
  কল যোগ করা হয়েছে। `url: "/guardian"` বেছে নেওয়া হয়েছে কারণ মেসেজ
  থ্রেড কোনো আলাদা রুট না — `GuardianMessengerBubble.tsx` একটা
  slide-over প্যানেল যেটা প্রতিটা `/guardian/*` রুটেই (শেলের রুট
  লেভেলে) বসানো থাকে, তাই ড্যাশবোর্ড ইনডেক্স রুটই সবচেয়ে যুক্তিসঙ্গত
  ল্যান্ডিং স্পট। `notifyGuardians()` কখনো throw করে না
  (`guardianPush.js`-এর নিজস্ব গ্যারান্টি), তাই push ব্যর্থ হলে বা
  VAPID কনফিগার না থাকলেও reminder dispatch/record করা কখনো ভাঙবে
  না — বিদ্যমান পোলিং বাবল স্বাভাবিক কাজ করতে থাকে। `dispatchDueReminders()`
  বা রুট ফাইলে (`routes/guardianReminders.js`) কোনো পরিবর্তন লাগেনি —
  ম্যানুয়াল "এখনই পাঠান" বাটন ও পিরিয়ডিক sweep দুটোই একই
  `dispatchReminder()` কল করে, তাই দুটোই স্বয়ংক্রিয়ভাবে push পায়।
  `node --check` পাস করেছে। **`npm run check` এই sandbox-এ চালানো
  যায়নি (network বন্ধ) — packaged CMD-এই প্রথম রিয়েল যাচাই।**

- [x] **Phase 5** — `server/src/lib/classPosts.js`-এ নতুন
  `resolveGuardiansForClass(className)` হেল্পার (একই ACTIVE-linked-only
  নিয়ম `feedForGuardian()`-এর মতো, `guardianReminders.js`-এর
  `resolveTargetGuardianIds()`-এর 'class' branch-এর ঠিক একই শেপ), এবং
  `module.exports`-এ যোগ। `server/src/routes/assignments.js`-এ
  `notifyGuardians` + `resolveGuardiansForClass` ইম্পোর্ট, POST
  হ্যান্ডলারে পোস্ট তৈরি + audit-লগের ঠিক পরে (রেসপন্সের আগে)
  `resolveGuardiansForClass(className)` কল করে `notifyGuardians(guardianIds,
  { title, body, url: "/guardian/feed" })` — `notifyGuardians()` কখনো
  throw করে না, তাই পুশ ব্যর্থ হলে পোস্ট তৈরি/রেসপন্স কখনো ভাঙবে না।
- [x] **Phase 6 (ঐচ্ছিক — ব্যবহারকারীর "সবগুলো ফেজ একসাথে করো" নির্দেশে
  এখন করা হয়েছে)** — `server/src/routes/results.js`-এ `notifyGuardians`
  ইম্পোর্ট, `PATCH /:id/publish`-এ existing SMS ব্লকের ঠিক পাশে (শুধু
  `published === true` হলে) একটা one-off `guardian_students` লুকআপ
  (`studentId` + `status = 'active'`) দিয়ে সেই ছাত্রের guardian-দের
  `notifyGuardians()` কল — `url: "/guardian/results"`। এটা একটা
  reusable helper বানানো হয়নি (`classPosts.resolveGuardiansForClass`-এর
  মতো) কারণ এই একটাই call site, AGENTS.md-এর "one-off feature logic"
  ব্যতিক্রম অনুযায়ী।
- [x] **Phase 7** — ম্যানুয়াল টেস্ট চেকলিস্ট নিচে যোগ করা হয়েছে (কোড না,
  ব্যবহারকারীকে ফোনে হাতে-কলমে যাচাই করতে হবে), `docs/PROJECT_MAP.md`
  আপডেট (Guardian Portal সেকশনে push-এর উল্লেখ + "Other docs"-এ
  `PUSH_NOTIFICATION_PLAN.md`-এর এন্ট্রি, ৭ ফেজই done হিসেবে চিহ্নিত)।
  এই এন্ট্রি DONE-এ রিসেট করা হয়েছে (নিচের একমাত্র বাকি আইটেম বাদে, যেটা
  কোনো এজেন্টের কাজ না — শুধু ব্যবহারকারীর একবারের ম্যানুয়াল DB অ্যাকশন)।

### ম্যানুয়াল টেস্ট চেকলিস্ট (Phase 7, ব্যবহারকারী নিজে ফোনে করবেন)
- [ ] গার্ডিয়ান পোর্টালে লগইন করে ব্রাউজার permission prompt আসছে কিনা
  দেখুন (প্রথমবার লগইনে)।
- [ ] permission "Allow" দেওয়ার পর অ্যাপ/ট্যাব সম্পূর্ণ বন্ধ করে দিন।
- [ ] অন্য কোনো ডিভাইস/অ্যাডমিন প্যানেল থেকে একটা রিমাইন্ডার পাঠান বা
  ক্লাস পোস্ট/নোটিশ তৈরি করুন — ফোনে push notification আসছে কিনা যাচাই
  করুন (অ্যাপ বন্ধ থাকা অবস্থায়ও)।
- [ ] notification-এ ট্যাপ করলে সঠিক পেজে (`/guardian` বা
  `/guardian/feed`) নিয়ে যাচ্ছে কিনা যাচাই করুন।
- [ ] একটা রেজাল্ট publish করে push + SMS দুটোই আসছে কিনা যাচাই করুন
  (Phase 6)।
- [ ] permission "Block"/dismiss করার পরেও পোলিং মেসেঞ্জার বাবল স্বাভাবিক
  কাজ করছে কিনা যাচাই করুন (fallback অক্ষত থাকার নিশ্চয়তা)।

### বাকি (কোনো কোড বাকি নেই, শুধু ম্যানুয়াল DB ধাপ)
- [ ] **ব্যবহারকারীর ম্যানুয়াল অ্যাকশন (কোনো কোড না, Phase 8A-র মতো)** —
  যদি ইতিমধ্যে বিদ্যমান (already-provisioned) multi-tenant প্রতিষ্ঠান
  থাকে, তাদের schema-তে নতুন `guardian_push_subscriptions` টেবিলটা
  পৌঁছাতে Super-Admin প্যানেলের "run SQL on all tenants" টুল দিয়ে নিচের
  স্টেটমেন্টটা ম্যানুয়ালি একবার রান করতে হবে (নতুন প্রতিষ্ঠান
  provision হলে `tenantProvision.js` এমনিতেই একই `supabase_schema.sql`
  পড়ে বলে অটোমেটিক তৈরি হয়ে যাবে, শুধু আগের প্রতিষ্ঠানগুলোর জন্য এই
  ম্যানুয়াল ধাপ লাগবে):
  ```sql
  create table if not exists guardian_push_subscriptions (
    id integer generated by default as identity primary key,
    "guardianId" integer not null references guardian_accounts(id) on delete cascade,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    "userAgent" text,
    "createdAt" text not null
  );
  create index if not exists guardian_push_subscriptions_guardian_idx on guardian_push_subscriptions ("guardianId");
  ```

### নোট
এই টাস্কটা বিদ্যমান "Guardian Reminder Messenger" এন্ট্রির (নিচে) উপরে
নতুন এন্ট্রি হিসেবে যোগ করা হয়েছে — সেই এন্ট্রি টাচ করা হয়নি, কারণ ওটা
আলাদা, এখনো নিজের "বাকি" আছে (`npm run check` যাচাই + ঐচ্ছিক Part 5)।
দুটো IN_PROGRESS এন্ট্রি একসাথে থাকা ইচ্ছাকৃত (এই ফাইলের "How to use this
file" নির্দেশনা অনুযায়ী — নতুন টাস্ক পুরনোটাকে merge করবে না)।

---

## Status: IN_PROGRESS

## Task: Guardian Reminder Messenger — গার্ডিয়ান পোর্টালে অ্যাডমিন-নিয়ন্ত্রিত
শিডিউলড রিমাইন্ডার মেসেজ, ভাসমান গোল আইকন থেকে খোলা মেসেজ থ্রেড
(ad-hoc — `docs/BUSINESS_READINESS_ROADMAP.md`-এর কোনো Phase-এর সাথে মেলে
না, তাই উপরের নিয়ম অনুযায়ী "Phase N" নাম দেওয়া হয়নি)
Started: 2026-08-07

### ফিচার (ব্যবহারকারীর অনুরোধ থেকে)
- অ্যাডমিন প্যানেল থেকে নিয়ন্ত্রণযোগ্য রিমাইন্ডার মেসেজ।
- গার্ডিয়ান পোর্টালে Messenger-এর মতো একটা ভাসমান গোল আইকন — ক্লিক করলে
  আলাদা একটা মেসেজ প্যানেল/পোর্টাল খুলে সেই ব্যক্তির (guardian-এর নিজের)
  মেসেজ থ্রেডে নিয়ে যায়।
- শিডিউল: Daily (প্রতিদিন) অথবা নির্দিষ্ট তারিখ সিলেক্ট করে।

### কোডবেস রিসার্চ করে পাওয়া প্রাসঙ্গিক জিনিস (রিইউজ করতে হবে, নতুন বানানো
যাবে না)
- **`server/src/lib/notifications.js`** স্টাফ-সাইড — `targetUserId`/
  `targetRoles` সম্পূর্ণ `users.id`/staff-role ভিত্তিক। গার্ডিয়ানদের জন্য
  কোনো `users` রো নেই (Phase 8C-তে এটা আগেই আবিষ্কার হয়েছিল, `guardianSms.js`
  বানানোর কারণ এটাই)। **তাই এই টেবিল/ফাংশন রিমাইন্ডারের জন্য ব্যবহার করা
  যাবে না** — guardian-facing একটা সমতুল্য নতুন স্তর লাগবে।
- **`server/src/lib/classPosts.js`** (+ SQL টেবিল `class_posts`,
  `class_post_reads`) — এটাই সঠিক রেফারেন্স প্যাটার্ন: guardian-facing
  broadcast, read-tracking সহ, `feedForGuardian()`-এ
  `guardian_students ... status='active'` দিয়ে ownership filter। রিমাইন্ডার
  ফিচারের DB ডিজাইন এই প্যাটার্ন অনুসরণ করবে, কপি-পেস্ট না — রিমাইন্ডারের
  নিজস্ব targeting/scheduling দরকার যা class_posts-এ নেই।
- **`server/src/lib/guardianData.js`** — `assertGuardianOwnsStudent()`
  reuse করা যাবে single-guardian-target রিমাইন্ডারে ownership চেকের জন্য।
- **`client/src/components/GuardianShell.tsx`** — সব guardian পেজ এই শেলের
  ভেতরে render হয় (`<Outlet>`)। ভাসমান গোল আইকনটা এখানেই বসবে (persistent,
  সব guardian route-এ দেখা যাবে) — নতুন কোনো wrapper লাগবে না।
  `unreadCount`/`load()`-এর প্যাটার্ন (GuardianShellContext) ইতিমধ্যে
  আছে notice-feed-এর জন্য; রিমাইন্ডার-থ্রেডের unread count এই একই শেলে
  পোল করা যেতে পারে, অথবা আলাদা lightweight পোল — Part 3-এ ঠিক হবে।
- **`client/src/components/NotificationBell.tsx`** — polling প্যাটার্ন
  (৪৫ সেকেন্ড ইন্টারভাল, কোনো websocket নেই এই অ্যাপে) — মেসেজ
  থ্রেড/আনরিড কাউন্টের জন্য এটাই রেফারেন্স, নতুন realtime infra লাগবে না।
- **`server/src/lib/guardianSms.js`** — চাইলে রিমাইন্ডার পাঠানোর সময়
  SMS-ও পাঠানো যায় (একই plan+wallet-gated কল), নতুন `notificationType`
  যোগ করে `server/src/routes/sms.js`-এর `NOTIFICATION_TYPES`-এ, Phase 8F-এর
  `paymentReceived`-এর প্যাটার্নে — এটা optional, Part 5-এ, admin টগল করতে
  পারবে কিনা তা সিদ্ধান্তসাপেক্ষ।
- **Scheduling infra নেই** — `server/package.json`-এ কোনো cron/scheduler
  লাইব্রেরি ইনস্টল করা নেই (`node-cron` ইত্যাদি)। Phase 8C-তেও ঠিক এই একই
  বাধায় পড়ে fee-due-reminder ফিচারটা "ম্যানুয়াল/অন-ডিমান্ড" বেছে নেওয়া
  হয়েছিল, cron না। এখানেও AGENTS.md Rule 5 অনুযায়ী নতুন dependency যোগ
  করার আগে ব্যবহারকারীকে বলে নিতে হবে — নিচে "সিদ্ধান্ত দরকার" দেখুন।
- **`server/src/config/roles.js`** protected path (AGENTS.md Rule 4) —
  admin-সাইড রিমাইন্ডার ম্যানেজমেন্ট পেজের জন্য কোন permission ব্যবহার হবে
  (বিদ্যমান কোনোটা রিইউজ, নাকি নতুন `\"guardianReminders\"` permission)
  সেটা এডিট করার আগে কনফার্ম করে নিতে হবে।

### সিদ্ধান্ত (ব্যবহারকারী কনফার্ম করেছেন, 2026-08-08)
1. **Daily/scheduled ডেলিভারি:** দুইটা মেকানিজমই — (ক) স্বয়ংক্রিয় সার্ভার-সাইড
   সুইপ এবং (গ) ম্যানুয়াল Admin বাটন — দুটোই থাকবে। **বাস্তবায়নের সময়
   `node-cron` dependency যোগ না করে `setInterval`-ভিত্তিক sweep করা
   হয়েছে** (`server/src/billing.js`-এর `startExpiryScanJob()`-এর ঠিক একই
   প্যাটার্ন — AGENTS.md Rule 5 অনুযায়ী নতুন dependency এড়ানো হলো, ফলাফল
   ব্যবহারকারীর চাওয়া "সার্ভার নিজে চেক করবে" আচরণই, শুধু ভিন্ন
   ইমপ্লিমেন্টেশনে)। প্রি-সেভড মেসেজসহ একাধিক রিমাইন্ডার সেট করার সুবিধা
   Part 1-এর টেবিল ডিজাইনেই আছে (প্রতিটা রিমাইন্ডার একটা আলাদা রো)।
2. **Admin permission:** `settings` রিইউজ করা হয়েছে (roles.js-এ
   `ROLE_PERMISSIONS` স্পর্শ করা হয়নি, শুধু `ROUTE_PERMISSION`-এ একটা
   নতুন লাইন — `/api/sms`/`/api/payment-gateway`-এর মতোই)।
3. **মেসেজ থ্রেড UI:** ভাসমান বাটনে ক্লিকে মডাল/স্লাইড-ওভার প্যানেল
   (আলাদা রুটের বদলে) — এখনো বাস্তবায়ন করা হয়নি, নিচে "বাকি" দেখুন।
4. **SMS টাই-ইন + plan-gating (Part 5):** এখনো সিদ্ধান্ত হয়নি, ঐচ্ছিক
   হিসেবে ডিফার করা হয়েছে।

### সম্পন্ন (এই সেশনে, ব্যাকএন্ড সম্পূর্ণ)
- [x] `server/sql/supabase_schema.sql` — `guardian_reminders` +
  `guardian_messages` টেবিল যোগ (ইনডেক্সসহ)।
- [x] `server/src/lib/guardianReminderSchemas.js` (নতুন) — zod
  create/update schema।
- [x] `server/src/lib/guardianReminders.js` (নতুন) — CRUD
  (`createReminder`/`listReminders`/`getReminder`/`setReminderActive`/
  `deleteReminder`), টার্গেট-রেজলভ (`resolveTargetGuardianIds` —
  all/class/student, সব জায়গায় `guardian_students status='active'`
  ফিল্টার), ডিসপ্যাচ (`dispatchReminder`, `dispatchDueReminders` — same-day
  dedup সহ, `once`/`daily`/`specificDate` তিন টাইপের লজিক), এবং
  guardian-সাইড read ফাংশন (`listMessagesForGuardian`/
  `unreadMessageCountForGuardian`/`markMessageRead`, `classPosts.js`-এর
  প্যাটার্নে)।
- [x] `server/src/routes/guardianReminders.js` (নতুন, admin-সাইড,
  `requirePermission("settings")`) — `GET /`, `POST /` (তৈরি + `once`
  হলে সাথে সাথে dispatch), `PATCH /:id` (active টগল), `DELETE /:id`,
  `POST /dispatch` (ম্যানুয়াল বাটনের endpoint)। সবকিছুতে `recordAudit`।
- [x] `server/src/guardianReminderScheduler.js` (নতুন) — `setInterval`
  sweep (ডিফল্ট প্রতি ৩০ মিনিটে, `GUARDIAN_REMINDER_INTERVAL_MINUTES`
  দিয়ে override করা যায়, `DISABLE_GUARDIAN_REMINDERS=true` দিয়ে বন্ধ করা
  যায় — `billing.js`-এর env var নেমিং কনভেনশন অনুসরণ করে)।
- [x] `server/src/index.js` — `/api/guardian-reminders` রুট মাউন্ট +
  `app.listen()`-এর পরে `startGuardianReminderJob()` কল।
- [x] `server/src/config/roles.js` — `ROUTE_PERMISSION`-এ
  `"/api/guardian-reminders": "settings"` যোগ (শুধু এই এক লাইন)।
- [x] `server/src/routes/guardianAuth.js` — guardian-সাইড
  `GET /messages`, `GET /messages/unread-count`, `POST /messages/:id/read`
  যোগ (`requireActiveGuardianId` + `feed`-রুটগুলোর একই try/catch শেপ)।
- [x] `client/src/types/index.ts` — `GuardianReminder` + `GuardianMessage`
  টাইপ যোগ।
- [x] `client/src/lib/api.ts` — admin ফাংশন যোগ (`getGuardianReminders`,
  `createGuardianReminder`, `toggleGuardianReminder`,
  `deleteGuardianReminder`, `dispatchGuardianReminders`,
  `getClassPosts`/`createClassPost`-এর ঠিক পাশে) + `api.guardian`
  অবজেক্টে guardian-সাইড ফাংশন (`getMessages`, `getMessagesUnreadCount`,
  `markMessageRead`, `getFeed`/`markFeedRead`-এর ঠিক পাশে)। আগের প্যাকেজে
  শুধু টাইপ-ইম্পোর্ট যোগ হয়েছিল আর ফাংশন বডি বাকি ছিল — যার কারণে
  `npm run check`-এর lint ধাপে `GuardianReminder`/`GuardianMessage`
  "defined but never used" এরর দিয়েছিল (unused import — এই ফাংশনগুলোই
  সেগুলো ব্যবহার করা শুরু করল, তাই ফিক্স হয়ে গেছে)।

### সম্পন্ন (এই সেশনে, ফ্রন্টএন্ড)
- [x] **`client/src/modules/GuardianReminders.tsx`** (নতুন) —
  `ClassPosts.tsx`-এর কাঠামো অনুসরণ করে: কম্পোজ ফর্ম (title/body/
  targetType Select [all/class/student] → conditionally targetClass
  Select [`api.getAssignmentClasses()` রিইউজ] অথবা বিদ্যমান
  `<StudentPicker>`, scheduleType Select [once/daily/specificDate] →
  conditionally scheduleDate date input) + "এখনই সব পাঠান" ম্যানুয়াল
  ডিসপ্যাচ বাটন (`api.dispatchGuardianReminders()`) + তৈরি করা
  রিমাইন্ডারের তালিকা (active টগল বাটন, ডিলিট বাটন, `lastSentAt`
  দেখানো, `Badge` দিয়ে target/schedule চিপ)। শুধু `components/ui/`
  (`Card`/`Field`/`Input`/`Select`/`Textarea`/`Button`) ব্যবহার করা
  হয়েছে — কোনো raw `style={{}}` নেই (AGENTS.md Design System rule)।
  পুরোপুরি `useLanguage()`/`t.guardianReminders.*` দিয়ে — কোনো
  hardcoded স্ট্রিং নেই।
- [x] **`client/src/components/GuardianMessengerBubble.tsx`** (নতুন) —
  সিদ্ধান্ত #3 অনুযায়ী: নিচে-ডানে ভাসমান গোল বাটন (Messenger-স্টাইল),
  `NotificationBell.tsx`-এর ৪৫-সেকেন্ড পোলিং প্যাটার্নে আনরিড ব্যাজ
  (`api.guardian.getMessagesUnreadCount()`), ক্লিকে স্লাইড-ওভার প্যানেল
  খুলে `GuardianFeed.tsx`-এর লিস্ট-রেন্ডার প্যাটার্নে মেসেজ দেখায়
  (ক্লিকে `markMessageRead` কল + অপ্টিমিস্টিক আনরিড কাউন্ট আপডেট)।
  **সিদ্ধান্ত (ব্যবহারকারী কনফার্ম করেছেন, 2026-08-08):** যদিও বিদ্যমান
  guardian-সাইড পেজগুলো (`GuardianShell.tsx`, `GuardianFeed.tsx`)
  hardcoded বাংলা ব্যবহার করে (কোনো i18n নেই), এই নতুন কম্পোনেন্টে
  `useLanguage()`/`t.guardianMessenger.*` ব্যবহার করা হয়েছে —
  `AppSettingsProvider` পুরো অ্যাপ রুট (`main.tsx`) থেকে wrap করে বলে
  guardian রুটেও উপলব্ধ। ভবিষ্যতে অন্য guardian-সাইড পেজ/ফিচার একই
  ধরনের সিদ্ধান্তের মুখোমুখি হলে i18n-ই ব্যবহার করা উচিত, hardcoded না
  — এটাই এখন থেকে guardian-সাইড নতুন কাজের কনভেনশন, পুরনো ফাইলগুলো
  migrate করার দরকার নেই (AGENTS.md Rule 1, minimal diff)।
- [x] **`client/src/components/GuardianShell.tsx`**-এ
  `<GuardianMessengerBubble />` বসানো হয়েছে (main এর বাইরে, শেলের রুট
  লেভেলে, সব guardian পেজে persist করে)।
- [x] **`client/src/App.tsx`** — নতুন lazy import + admin route
  `path="guardian-reminders"` (`settings` রুটের ঠিক পাশে বসানো হয়েছে,
  `assignments`-এর পাশে না — কারণ permission-ভিত্তিক গ্রুপিং
  `"settings"` permission-কেই অনুসরণ করে, `PlanFeatureGate` ছাড়াই
  যেহেতু plan-gating এখনো সিদ্ধান্ত হয়নি — সিদ্ধান্ত #4 দেখুন)।
- [x] **`client/src/components/Sidebar.tsx`** — `NAV_IDS`-এর ভেতরে না
  বসিয়ে, `sms`/`payment-gateway` ব্লকের ঠিক প্যাটার্নে NAV_IDS-এর বাইরে
  একটা নতুন `NavLink` যোগ করা হয়েছে (`canAccess(role, "settings")`,
  আইকন 🔔, `t.nav.guardianReminders` লেবেল, কোনো plan-lock নেই) — কারণ
  `key: "settings"` দিয়ে NAV_IDS-এ যোগ করলে লেবেল "সেটিংস" দুইবার দেখাত
  (এই একই কারণে SMS/bKash ব্লক দুটোও NAV_IDS-এর বাইরে রাখা হয়েছিল,
  কোড কমেন্টে ব্যাখ্যা করা আছে)।
- [x] **`client/src/i18n/bn.ts` + `en.ts`** — নতুন কী-ব্লক দুটো যোগ করা
  হয়েছে: `guardianReminders: {...}` (admin মডিউল, `classPosts`
  ব্লকের প্যাটার্নে, ৩৯টা কী) এবং `guardianMessenger: {...}`
  (guardian-সাইড বাবল, ৬টা কী) + `nav.guardianReminders`। দুই ফাইলে
  key-parity একটা ছোট পাইথন স্ক্রিপ্ট দিয়ে যাচাই করা হয়েছে (এই
  রিপোতে কোনো বিদ্যমান key-parity script খুঁজে পাওয়া যায়নি —
  `scripts/`/`client/scripts/`-এ নেই, তাই ম্যানুয়ালি যাচাই করা
  হয়েছে; ভবিষ্যতে একই কাজ বারবার লাগলে এরকম একটা স্ক্রিপ্ট
  `client/scripts/`-এ যোগ করার কথা বিবেচনা করা যেতে পারে)।
- [x] **`client/src/index.css`** — `.guardian-reminder-*` (admin মডিউলের
  জন্য) ও `.guardian-messenger-*` (ভাসমান বাবল/প্যানেলের জন্য) নতুন
  ক্লাস যোগ করা হয়েছে, বিদ্যমান `.guardian-nav-badge`, `.guardian-post`,
  `.soft-panel`, `.class-post__*` কনভেনশন অনুসরণ করে, কোনো raw inline
  style ছাড়াই।
- [x] **`server/src/middleware/__tests__/rbac.test.js`** — `EXPECTED_ALLOWED`
  টেবিলে `"/api/guardian-reminders": ["Admin", "Super Admin"]` যোগ করা
  হয়েছে। **এই ফাইলটা `roles.js`-এ নতুন রুট যোগ করার সাথে সাথেই আপডেট
  করা উচিত ছিল, প্রথম প্যাকেজে বাদ পড়ে গিয়েছিল** — `npm run test:unit`
  চালানোর সময় `rbac.test.js`-এর "ROUTE_PERMISSION table sanity" টেস্টটা
  ধরেছে (এই টেবিলটা `ROUTE_PERMISSION`-এর keys-এর সাথে হুবহু মিলতে হয়,
  নাহলে fail করবে — ফাইলের উপরের কমেন্টেই এই নিয়ম লেখা আছে)। **শিক্ষা:
  ভবিষ্যতে `config/roles.js`-এ কোনো নতুন `ROUTE_PERMISSION` এন্ট্রি যোগ
  করলে একই কমিটে `middleware/__tests__/rbac.test.js`-এর `EXPECTED_ALLOWED`
  টেবিলেও এন্ট্রি যোগ করতে হবে — নাহলে `npm run test:unit` ফেইল করবে।**
### বাকি (পরের এজেন্ট/সেশন এখান থেকে চালিয়ে যাবে)
- [ ] **টেস্ট/যাচাই** — এই sandbox-এ `node_modules`/নেটওয়ার্ক না থাকায়
  `npm run check` চালানো যায়নি। এই সেশনে করা ম্যানুয়াল sanity-check:
  সব নতুন/এডিট করা `.tsx` ফাইলে bracket-balance script (parens/braces/
  brackets প্রতিটা ফাইলে মিলেছে), সব import ব্যবহৃত হচ্ছে কিনা যাচাই
  (unused-import lint এড়াতে), `guardianReminders`/`guardianMessenger`/
  `nav` ব্লকের bn.ts↔en.ts key-parity স্ক্রিপ্ট দিয়ে যাচাই (মিলেছে),
  প্রতিটা নতুন CSS ক্লাস ঠিক একবার ডিফাইন হয়েছে কিনা চেক, `Permission`
  ইউনিয়নে `"settings"` আগে থেকেই আছে কিনা নিশ্চিত করা (নতুন permission
  লাগেনি), rbac.test.js-এর `EXPECTED_ALLOWED` টেবিল আগের সেশনেই ঠিক করা
  হয়েছে তা পুনরায় নিশ্চিত করা। **এইগুলো tsc/eslint-এর বিকল্প না — `npm
  run check` (root থেকে, sync:roles/lint/typecheck/build/test:server সব
  ধাপসহ) এই ডেলিভারির প্রথম রিয়েল যাচাই, packaged CMD-এর ফলাফলকেই
  বিশ্বাস করুন এই ম্যানুয়াল চেকের চেয়ে বেশি।**
- [ ] **Part 5 (ঐচ্ছিক, সিদ্ধান্ত #4 এখনো বাকি)** — SMS টাই-ইন
  (`guardianSms.js` দিয়ে) + `planFeatures.js`-এ প্ল্যান-গেটিং, যদি
  ব্যবহারকারী চান। কোর ফিচার (backend + frontend UI, এই এন্ট্রি) এটা
  ছাড়াই সম্পূর্ণ ব্যবহারযোগ্য — Part 5 শুধু ঐচ্ছিক সম্প্রসারণ।

### নোট
ব্যাকএন্ড ও ফ্রন্টএন্ড দুটোই এখন সম্পূর্ণ — schema, lib, routes,
scheduler, index.js/roles.js ওয়্যারিং, admin কম্পোজ/লিস্ট মডিউল, এবং
guardian-সাইড ভাসমান মেসেজ বাবল, সব বসানো হয়েছে। ফিচারটা এখন এন্ড-টু-এন্ড
ব্যবহারযোগ্য, শুধু `npm run check` দিয়ে প্যাকেজড CMD-এ যাচাই বাকি (উপরের
"বাকি" দেখুন) এবং Part 5 (ঐচ্ছিক SMS টাই-ইন) ব্যবহারকারীর সিদ্ধান্ত
সাপেক্ষে। `npm run check` পাস করলে এই এন্ট্রির Status `DONE`-এ পাল্টে
দিতে হবে এবং "বাকি"-তে শুধু Part 5 (যদি ব্যবহারকারী না চান) থাকলে সেটাও
ড্রপ করে টেমপ্লেটে রিসেট করতে হবে (নিচের "How to use this file" দেখুন)।

---

## Status: DONE (mostly — one manual step listed below)

## Task: BUSINESS_READINESS_ROADMAP Phase 8F — guardian bKash fee payment
+ SMS wallet gateway auto-topup (2026-08-06 সম্পন্ন)

### সম্পন্ন
- `server/sql/supabase_schema.sql` (protected path) — নতুন
  `bkash_payment_intents` টেবিল: প্রতিটা bKash checkout attempt-এর
  create→execute lifecycle ট্র্যাক করে (`paymentId`, `purpose`
  `'fee'`/`'sms-topup'`, `guardianId`/`studentId` (fee-only), `amount`,
  `status`, `bkashTrxId`)। `paymentId`-এ unique index, যাতে একই
  paymentID দুইবার finalize/double-credit না হয়।
- `server/src/lib/bkashGateway.js` — `validateCredentials`কে
  `grantToken`-এ রিফ্যাক্টর করে (আগের নাম alias হিসেবে রাখা হয়েছে,
  routes/paymentGateway.js অপরিবর্তিত), নতুন `createPayment()` ও
  `executePayment()` bKash API wrapper যোগ।
- `server/src/lib/paymentGatewayCredentials.js` (নতুন) — কানেক্টেড
  গেটওয়ের এনক্রিপ্টেড ক্রেডেনশিয়াল ডিক্রিপ্ট করে ফেরত দেয়, শুধু একটা
  actual পেমেন্ট কলের ঠিক আগে ব্যবহারের জন্য (routes/paymentGateway.js
  কখনো নিজে ডিক্রিপ্ট করে না, শুধু স্টোর করে)।
- `server/src/lib/guardianData.js` — `activeChildrenForGuardian()`
  এখন `fee`/`due`ও ফেরত দেয়, যাতে গার্ডিয়ান ড্যাশবোর্ডে বকেয়া দেখানো
  ও "পরিশোধ করুন" বাটন দেখাতে আলাদা API কল না লাগে।
- `server/src/routes/guardianAuth.js` — নতুন `POST
  /students/:id/bkash/create` (ownership check, amount ≤ due validate,
  bKash checkout শুরু করে bkashURL ফেরত দেয়) ও `POST /bkash/execute`
  (paymentID দিয়ে intent লুকআপ, bKash-কে execute কল করে *শুধু সেই
  রেসপন্স* বিশ্বাস করে — redirect-এর query string না, কারণ সেটা signed
  না — সফল হলে `payments`+`income` ইনসার্ট, due কমানো,
  guardianSms দিয়ে রশিদ SMS, ব্যর্থ হলে বা due আগেই ০ থাকলে staff-side
  payments.js-এর মতোই `Flagged` করে admin notification)। ইতিমধ্যে
  `completed` intent-এ দ্বিতীয়বার execute কল করলে re-credit হয় না
  (idempotent)।
- `server/src/routes/sms.js` — নতুন `POST /topup-via-gateway/create` +
  `/execute` (admin-side, "settings" পারমিশন — router-এ আগে থেকেই
  আছে): একই কানেক্টেড গেটওয়ে দিয়ে SMS ওয়ালেট টপ-আপ, 8D-এর ম্যানুয়াল
  Trx-ID ফ্লো এখন এটার পাশাপাশি (প্রতিস্থাপন না) থাকবে। নতুন
  `NOTIFICATION_TYPES` এন্ট্রি `paymentReceived` (বিকাশে পেমেন্ট
  পাওয়া গেলে guardianSms পাঠানো হয় কিনা টগল করার জন্য)।
- Client: `types/index.ts` (`fee`/`due` on `GuardianChild`,
  `BkashCheckoutStart`), `lib/api.ts` (`guardian.createBkashPayment`/
  `executeBkashPayment`, `createSmsTopupViaGateway`/
  `executeSmsTopupViaGateway`), নতুন
  `pages/guardian/GuardianPayFee.tsx` (amount ফর্ম → bKash checkout
  redirect, sessionStorage-এ paymentID রাখে) ও
  `pages/guardian/GuardianPayCallback.tsx` (bKash থেকে ফিরে এসে
  execute কল করে ফলাফল দেখায়), `App.tsx` (`/guardian/pay/:studentId` +
  `/guardian/pay/callback` রুট), `GuardianDashboard.tsx` (বকেয়া +
  "বিকাশে পরিশোধ করুন" বাটন), `SmsSettings.tsx` (গেটওয়ে কানেক্টেড
  থাকলে "স্বয়ংক্রিয় টপ-আপ" কার্ড + `?paymentID=` দিয়ে ফিরে আসলে
  স্বয়ংক্রিয়ভাবে execute কল), `i18n/bn.ts`+`i18n/en.ts`
  (`notifyPaymentReceived`, `gatewayTopupTitle/Subtitle/Button` —
  script দিয়ে key parity যাচাই করা হয়েছে)।
- এই Phase-এ কোনো নতুন top-level route prefix যোগ হয়নি (সব
  `/api/sms/...` ও `/api/guardian-auth/...` এর আন্ডারে) — তাই
  `rbac.test.js`-এর `EXPECTED_ALLOWED` টেবিল ছুঁতে হয়নি, Phase 8E-এর
  মতো ঘটনা এখানে ঘটেনি।
- সবগুলো পরিবর্তিত/নতুন `.js` ফাইল `node --check` পাস করেছে, সব
  `.ts`/`.tsx` ফাইলে bracket-balance script + i18n key-parity script
  দিয়ে ম্যানুয়াল sanity-check করা হয়েছে। **এই sandbox-এ `node_modules`/
  নেটওয়ার্ক না থাকায় `npm run check` চালানো যায়নি — packaged CMD-এর
  `npm run check` এই ডেলিভারির প্রথম রিয়েল যাচাই, সেটার ফলাফলকেই
  বিশ্বাস করুন আমার ম্যানুয়াল চেকের চেয়ে বেশি।**

### বাকি (কোনো কোড বাকি নেই, শুধু ম্যানুয়াল ধাপ)
- Phase 8E-এর মতোই `GATEWAY_CREDENTIAL_KEY` সেট থাকা লাগবে — না থাকলে
  উভয় create রুট একটা পরিষ্কার 503 দেয়, ভাঙে না।
- callbackURL রিকোয়েস্টের `Origin`/`Referer` হেডার থেকে অনুমান করা হয়
  (নতুন কোনো env var লাগেনি) — যদি কোনো প্রক্সি/CDN এই হেডারগুলো strip
  করে ফেলে, bKash checkout ভুল URL-এ redirect করবে। প্রোডাকশনে প্রথম
  আসল পেমেন্ট টেস্টের সময় এটা যাচাই করে নেওয়া দরকার (roadmap 8G)।
- roadmap 8G-এর sandbox QA checklist (ভুল/সঠিক sandbox credential,
  callback সঠিকভাবে বসছে কিনা ইত্যাদি) এখনো বাকি — কোড রেডি, শুধু
  sandbox অ্যাকাউন্ট দিয়ে হাতে-কলমে টেস্ট করা দরকার।

---

## Status: DONE (mostly — one manual step listed below)

## Task: BUSINESS_READINESS_ROADMAP Phase 8E — bKash self-connect (bKash
only; Nagad deferred, per the roadmap's own note under this heading)
(2026-08-06 সম্পন্ন)

### সম্পন্ন
- `server/sql/supabase_schema.sql` (protected path) — নতুন
  `institution_payment_gateways` টেবিল: `provider`, ৪টা এনক্রিপ্টেড
  ক্রেডেনশিয়াল কলাম (`appKeyEnc`/`appSecretEnc`/`usernameEnc`/
  `passwordEnc`, প্লেইনটেক্সট না), `connected`, `lastCheckedAt`,
  `lastError`, `updatedAt`। `sms_wallets`-এর মতোই tenant-schema-প্রতি এক
  রো, কোনো `institutionId` কলাম লাগে না।
- `server/src/lib/gatewayCredentialCrypto.js` (নতুন) — `backupEncryption.js`
  এর AES-256-GCM প্যাটার্ন, কিন্তু ফাইলের বদলে ছোট স্ট্রিং-এর জন্য, আলাদা
  `GATEWAY_CREDENTIAL_KEY` env var দিয়ে (ব্যাকআপ কী লিক হলেও এই
  ক্রেডেনশিয়াল সুরক্ষিত থাকে)।
- `server/src/lib/bkashGateway.js` (নতুন) — bKash-এর grant-token
  এন্ডপয়েন্টে কল করে credential ভ্যালিডেট করে (কখনো throw করে না ordinary
  rejection-এ, `smsProviders/bulksmsbd.js`-এর প্যাটার্নে)। `BKASH_BASE_URL`
  ডিফল্ট bKash-এর পাবলিক sandbox (`tokenized.sandbox.bka.sh`)।
- `server/src/routes/paymentGateway.js` (নতুন, tenant-side,
  `requirePermission("settings")` + `requirePlanFeature("bkash")`):
  `GET /status` (connected/provider/lastCheckedAt/lastError/configured,
  কখনো ডিক্রিপ্টেড secret ফেরত দেয় না), `POST /connect` (validate → সফল
  হলে এনক্রিপ্ট করে সেভ, ব্যর্থ হলে জমা দেওয়া ক্রেডেনশিয়াল সেভ হয় না),
  `POST /disconnect` (কানেকশন ক্লিয়ার করে, এনক্রিপ্টেড কলামগুলো NULL করে)।
- `server/src/config/roles.js` — `"/api/payment-gateway": "settings"`।
- `server/src/index.js` — `app.use("/api/payment-gateway", ...)`।
- `server/src/config/planFeatures.js` — `premium.bkash: true` (আগে
  `false`/`comingSoon: true` ছিল), `FEATURE_META.bkash.comingSoon: false`।
  Guardian-facing পেমেন্ট কালেকশন (Phase 8F) এখনো বাকি — এটা শুধু
  institution-এর নিজের অ্যাকাউন্ট কানেক্ট করার অংশ।
- `.env.example` — `GATEWAY_CREDENTIAL_KEY` (আবশ্যক, না থাকলে
  `/connect` একটা পরিষ্কার 503 দেয়) ও `BKASH_BASE_URL` (ঐচ্ছিক,
  sandbox ডিফল্ট) ডকুমেন্টেড।
- Client: `client/src/types/index.ts` (`PaymentGatewayStatus`),
  `client/src/lib/api.ts` (`getPaymentGatewayStatus`/
  `connectPaymentGateway`/`disconnectPaymentGateway`), নতুন
  `client/src/modules/PaymentGatewaySettings.tsx` (স্ট্যাটাস কার্ড +
  কানেক্ট ফর্ম + ডিসকানেক্ট বাটন, শুধু `components/ui/` + `.ds-*`/বিদ্যমান
  ক্লাস ব্যবহার করে, নতুন `style={{}}` নেই), `App.tsx` (lazy route,
  `PlanFeatureGate feature="bkash"`), `Sidebar.tsx` (sms-block-এর
  প্যাটার্নে নতুন nav আইটেম, NAV_IDS-এর বাইরে), `i18n/bn.ts` + `i18n/en.ts`
  (`nav.paymentGateway` + পুরো `gateway` ব্লক, স্ক্রিপ্ট দিয়ে key parity
  যাচাই করা হয়েছে)।
- সবগুলো পরিবর্তিত/নতুন `.js` ফাইল `node --check` পাস করেছে। TypeScript
  (`npm run check`) এই sandbox-এ `node_modules`/নেটওয়ার্ক না থাকায় চালানো
  যায়নি — bracket-balance script দিয়ে সব `.ts`/`.tsx` ফাইলে ম্যানুয়াল
  sanity-check করা হয়েছে। **Run `npm run check` as part of this
  delivery's CMD before trusting it** — packaged CMD-এ এটাই প্রথম রিয়েল
  চেক।

### বাকি (কোনো কোড বাকি নেই, শুধু ব্যবহারকারীর ম্যানুয়াল ধাপ)
- `GATEWAY_CREDENTIAL_KEY` env var এখনো সেট করা হয়নি — সেট না করলে
  "কানেক্ট করুন" বাটনে একটা পরিষ্কার এরর মেসেজ দেখাবে, ভাঙবে না। জেনারেট
  করার কমান্ড `.env.example`-এ আছে।
- 8E–8G roadmap নোট অনুযায়ী, sandbox দিয়ে আসল টেস্ট (bKash sandbox
  credential দিয়ে কানেক্ট করে দেখা) এখনো বাকি — কোড রেডি, শুধু sandbox
  অ্যাকাউন্ট রেজিস্টার করে ট্রাই করা দরকার (roadmap 8G)।
- Nagad self-connect ইচ্ছাকৃতভাবে এই সাব-ফেজে করা হয়নি — roadmap নিজেই এটা
  "bKash সফল হওয়ার পর আলাদা সাব-ফেজ" হিসেবে চিহ্নিত করেছে।

---

## Status: DONE (mostly — one manual step listed below)

## Task: BUSINESS_READINESS_ROADMAP Phase 8D — "SMS সেবা" settings page,
the ACTUAL Phase 8D (2026-08-06 সম্পন্ন)

### একটা নামকরণ-বিভ্রান্তি ঠিক করা হলো এই সেশনে
নিচের এন্ট্রি ("BUSINESS_READINESS_ROADMAP Phase 8C follow-up —
fee-due-reminder...") আগে ভুলভাবে "Phase 8D" নাম নিয়ে এই ফাইলের শীর্ষে
বসানো ছিল। ওটা আসলে roadmap-এর কোনো নির্দিষ্ট সাব-ফেজ ছিল না — Phase
8C-এর "বাকি" সেকশনে রাখা দুটো প্রশ্নের উত্তর ছিল মাত্র, যেটা BUSINESS_
READINESS_ROADMAP.md-এ ঠিক এই নামে কোথাও লেখা নেই। roadmap-এর আসল Phase
8D হলো এই এন্ট্রিতে বর্ণিত কাজ — প্রতিষ্ঠান-অ্যাডমিন সাইডে "SMS সেবা"
সেটিংস পেজ। ভুলটা কীভাবে হয়েছিল ও ভবিষ্যতে এড়াতে কী করতে হবে তার
বিস্তারিত নিচের "### কেন এই বিভ্রান্তি হয়েছিল" সেকশনে।

### সম্পন্ন
- `server/sql/supabase_schema.sql` — `sms_transactions`-এ নতুন `"status"`
  কলাম (`add column if not exists ... default 'confirmed'`, idempotent) —
  Phase 8B-এর deduct রোগুলো ডিফল্টে 'confirmed' থাকে, নতুন ম্যানুয়াল
  টপ-আপ অনুরোধ 'pending' দিয়ে শুরু হয়।
- `server/src/migrateTenants.js` — নতুন `withTenantSchema(schemaName, fn)`
  হেল্পার (parameterized query সাপোর্ট করে, `migrateOneTenant`-এর মতো raw
  SQL string না) + `listTenantSchemas()`-এ `id` ফিল্ড যোগ (platform.js-এর
  নতুন রুটের জন্য দরকার ছিল)।
- `server/src/routes/sms.js` (নতুন, tenant-side, `requirePermission("settings")`
  + `requirePlanFeature("sms")`):
  - `GET /wallet` — ব্যালেন্স, সব লেনদেন (৳ ২০০টা পর্যন্ত), নোটিফিকেশন
    প্রেফারেন্স, আর `SMS_TOPUP_BKASH_NUMBER` env var (সেট না থাকলে খালি
    স্ট্রিং, ফ্রন্টএন্ড ফলব্যাক টেক্সট দেখায়)।
  - `PUT /notification-prefs` — `settings` টেবিলে `smsNotificationPrefs`
    key-তে JSON হিসেবে সেভ (২টা টাইপ: `feeDueReminder`, `resultPublished`)।
  - `POST /topup-request` — শুধু একটা `status='pending'` রো ইনসার্ট করে,
    ব্যালেন্স ছোঁয় না (নিচের "ভেরিফিকেশন" পয়েন্ট দেখুন)।
- `server/src/config/roles.js` — `"/api/sms": "settings"` (ROUTE_PERMISSION)।
- `server/src/index.js` — `app.use("/api/sms", require("./routes/sms"))`।
- `server/src/lib/guardianSms.js` — `sendGuardianSms()`-এ নতুন ঐচ্ছিক
  `notificationType` প্যারামিটার, `smsNotificationPrefs`-এর বিপরীতে চেক
  করে। `routes/payments.js` (send-due-reminders) আর `routes/results.js`
  (publish hook) দুটোই এখন `notificationType: "feeDueReminder"` /
  `"resultPublished"` পাস করে — তাই সেটিংস পেজের টগল সত্যিই কাজ করে,
  শুধু UI-তে দেখানোর জন্য না।
- `server/src/config/planFeatures.js` — `premium.sms: true` (আগে `false`
  ছিল সব tier-এ), `FEATURE_META.sms.comingSoon: false`।
- `server/src/routes/platform.js` — ৩টা নতুন এন্ডপয়েন্ট (Super-Admin
  প্যানেল, `requirePlatformRole("super_admin", "admin")` approve/reject-এ):
  `GET /sms-topups/pending` (সব tenant schema লুপ করে pending রো খুঁজে
  বের করে), `POST /sms-topups/:institutionId/:transactionId/approve`
  (ব্যালেন্স ক্রেডিট + status='confirmed', `withTenantSchema` দিয়ে
  এক transaction-এ), `POST .../reject` (status='rejected', ব্যালেন্স
  অপরিবর্তিত)। এই ৩টা রুট এই ফাইলের একমাত্র ব্যতিক্রম যেখানে platform.js
  সরাসরি একটা নির্দিষ্ট tenant schema-তে ঢোকে — কেন সেটা routes/platform.js-এর
  নিজের কমেন্টে ব্যাখ্যা করা আছে (registry-only নিয়মের ইচ্ছাকৃত, সীমিত
  exception, migrations/run-এর মতো "সব tenant"-এ না, একটাতেই)।
- `server/public-platform/app.js` — "📱 SMS টপ-আপ" বাটন (ড্যাশবোর্ড
  টুলবারে) নতুন মডাল খোলে, প্রতিটা pending অনুরোধের পাশে অনুমোদন/বাতিল
  বাটন।
- Client: `client/src/types/index.ts` (SmsTransaction/SmsNotificationPrefs/
  SmsWallet), `client/src/lib/api.ts` (getSmsWallet/updateSmsNotificationPrefs/
  requestSmsTopup), নতুন `client/src/modules/SmsSettings.tsx` (ব্যালেন্স
  কার্ড + নোটিফিকেশন টগল + টপ-আপ ফর্ম + লেনদেন হিস্টোরি টেবিল,
  `data-table`/`ds-card`/`ds-btn` ইত্যাদি বিদ্যমান ক্লাস ব্যবহার করে, নতুন
  `style={{}}` নেই), `App.tsx` (lazy route, `PlanFeatureGate feature="sms"`),
  `Sidebar.tsx` (নতুন nav আইটেম, audit-logs-এর প্যাটার্নে NAV_IDS-এর বাইরে
  রাখা হয়েছে যেহেতু এটা "settings" পারমিশন শেয়ার করে কিন্তু নিজস্ব লেবেল/লক
  লাগে), `i18n/bn.ts` + `i18n/en.ts` (`nav.sms` + পুরো `sms` ব্লক, key সেট
  দুই ফাইলে হুবহু মিলিয়ে দেখা হয়েছে)।
- `.env.example` — `SMS_TOPUP_BKASH_NUMBER` ডকুমেন্টেড (ঐচ্ছিক, খালি
  রাখলে ফ্রন্টএন্ড ফলব্যাক মেসেজ দেখায়)।
- সবগুলো পরিবর্তিত/নতুন `.js` ফাইল `node --check` পাস করেছে। TypeScript
  (`npm run check`) নেটওয়ার্ক-স্যান্ডবক্সে `node_modules` না থাকায় এখানে
  চালানো যায়নি — packaged CMD-এ npm install-এর পরে সেটাই প্রথম চেক।

### বাকি (কোনো কোড বাকি নেই, শুধু ব্যবহারকারীর ম্যানুয়াল ধাপ)
- Phase 8A-র মতোই: ইতিমধ্যে বিদ্যমান multi-tenant প্রতিষ্ঠানের schema-তে
  নতুন `sms_transactions."status"` কলাম পৌঁছাতে Super-Admin প্যানেলের
  মাইগ্রেশন টুল দিয়ে (অথবা নতুন "SMS টপ-আপ" বাটন-চালিত সিস্টেম প্রথমবার
  ব্যবহারের আগে) এই একটা স্টেটমেন্ট ম্যানুয়ালি চালাতে হবে:
  `ALTER TABLE sms_transactions ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'confirmed';`
- `SMS_TOPUP_BKASH_NUMBER` env var এখনো সেট করা হয়নি (এটা অপারেটর-নির্দিষ্ট
  ডেটা, কোড না) — সেট না করলে পেজে ফলব্যাক মেসেজ দেখাবে, ভাঙবে না।

### কেন এই বিভ্রান্তি হয়েছিল (ব্যবহারকারীর অনুরোধে, পরবর্তী এজেন্টদের জন্য)
আগের একটা সেশনে Phase 8C-এর "বাকি" সেকশনে দুটো প্রশ্ন রাখা হয়েছিল
(ডেলিভারি মেকানিজম + থ্রেশহোল্ড)। পরের সেশনে ব্যবহারকারী সেই প্রশ্ন দুটোর
উত্তর দেন এবং fee-due-reminder ফিচারটা বানানো হয় — কিন্তু কাজটা শেষ করে
এই ফাইলে যখন এন্ট্রি লেখা হয়, তখন ভুলভাবে roadmap-এর পরবর্তী ক্রমিক
নম্বর ("Phase 8D") বসিয়ে দেওয়া হয়, যদিও roadmap-এ Phase 8D ইতিমধ্যে
সম্পূর্ণ আলাদা একটা কাজ (SMS সেবা সেটিংস পেজ) হিসেবে নির্দিষ্ট করাই ছিল।
কারণ: **"Phase N" নাম্বারিং শুধুমাত্র BUSINESS_READINESS_ROADMAP.md-এ
লেখা সাব-ফেজগুলোর জন্য সংরক্ষিত হওয়া উচিত ছিল — কোনো ad-hoc ফলো-আপ কাজের
জন্য পরবর্তী ক্রমিক সংখ্যাটা "ধার করা" ঠিক হয়নি।**

এড়ানোর উপায় (পরবর্তী এজেন্টদের জন্য নিয়ম): কোনো কাজ roadmap-এর কোনো
Phase-এর নাম নেওয়ার আগে, `docs/BUSINESS_READINESS_ROADMAP.md`-এ ঠিক সেই
Phase নম্বরের নিচে লেখা বিবরণের সাথে কাজটা মিলিয়ে দেখা বাধ্যতামূলক। না
মিললে সেটা "Phase 8C follow-up" বা "ad-hoc" জাতীয় নাম দিতে হবে, কোনো
Phase নম্বর বসানো যাবে না — এমনকি এটা roadmap-এর কোনো Phase-এর প্রশ্নের
জবাব হলেও (এই ঘটনায় যেমন হয়েছিল)। নিচের এন্ট্রিটা এই নিয়ম অনুসরণ করতে
রিটাইটেল করা হয়েছে।

---

## Status: DONE

## Task: BUSINESS_READINESS_ROADMAP Phase 8C follow-up — fee-due-reminder, manual/
on-demand variant (2026-08-06 সম্পন্ন)

### সিদ্ধান্ত (ব্যবহারকারী কনফার্ম করেছেন এই সেশনে)
Phase 8C-এর "বাকি" সেকশনে রাখা দুটো প্রশ্নের উত্তর:
- **ডেলিভারি মেকানিজম:** ম্যানুয়াল/অন-ডিমান্ড (Admin/Accountant একটা বাটনে
  চাপলে পাঠাবে) — অটোমেটিক/cron না। তাই `node-cron`-এর মতো কোনো নতুন
  dependency লাগেনি (AGENTS.md Rule 5)।
- **থ্রেশহোল্ড:** যেকোনো বকেয়া থাকলেই (`due > 0`) — আলাদা টাকা/দিনের
  থ্রেশহোল্ড নেই।

### সম্পন্ন
- `server/src/routes/payments.js` — নতুন `POST /api/payments/send-due-reminders`।
  `due > 0` থাকা সব ছাত্র খুঁজে বের করে, প্রতিটার জন্য existing
  `sendGuardianSms()` (Phase 8C) কল করে বকেয়ার পরিমাণ উল্লেখ করে একটা SMS
  পাঠায় — phone না থাকলে, plan-এ sms ফিচার না থাকলে, বা wallet খালি থাকলে
  silently স্কিপ (কখনো throw করে না, `results.js`-এর publish hook-এর মতোই)।
  রুটটা ইতিমধ্যে `router.use(requirePermission("income"))` +
  `router.use(requirePlanFeature("feesCollection"))`-এর আওতায় (ফাইলের
  উপরে), তাই আলাদা কোনো গেটিং কোড লাগেনি। শেষে একটাই সামারি
  `recordAudit()` কল (প্রতি ছাত্রের জন্য আলাদা অডিট রো না — burst এড়াতে)।
  রেসপন্স: `{ totalDue, sent, noPhone, notSent }`।
- `client/src/lib/api.ts` — নতুন `api.sendDueReminders()`।
- `client/src/modules/Income.tsx` — টাইটেলের পাশে "বকেয়া reminder পাঠান"
  বাটন (নতুন `components/ui/Button` ব্যবহার করে, raw `style={{}}` না —
  এই ফাইল legacy exemption list-এ থাকলেও AGENTS.md-এর "Migration status"
  নির্দেশনা অনুযায়ী নতুন অংশ design system দিয়ে লেখা হয়েছে)। চাপার আগে
  `confirm()`, চাপার পর ফলাফলের সামারি বিদ্যমান `msg` ব্যানারে দেখায়
  (কত জন বকেয়া, কত জনকে SMS গেছে, ফোন না থাকলে/পাঠানো না গেলে কত জন)।
- `server/src/routes/payments.js`-এর নতুন রুটের ওপরের কমেন্টে ব্যাখ্যা
  করা আছে কেন ম্যানুয়াল বেছে নেওয়া হয়েছে, যাতে পরের এজেন্ট
  cron-এ পরিবর্তন করার আগে বুঝতে পারে এটা ইচ্ছাকৃত সিদ্ধান্ত ছিল, অনুমান
  নয়।
- নতুন/পরিবর্তিত `.js` ফাইল `node --check` পাস করেছে; `.ts`/`.tsx`
  ফাইলের brace/paren ব্যালেন্স ম্যানুয়ালি যাচাই করা হয়েছে (network
  sandbox-এ বন্ধ ছিল বলে `npm run check` এখানে চালানো যায়নি — packaged
  CMD-এ সেটাই প্রথম ধাপ, আগের সব Phase-এর মতোই)।

### বাকি
কিছু না — এই সাব-ফেজ সম্পূর্ণ। fee-due-reminder-এর জন্য অটোমেটিক/cron
ভ্যারিয়েন্ট এখনো বানানো হয়নি — ব্যবহারকারী ভবিষ্যতে সেটা চাইলে এটা একটা
আলাদা সাব-টাস্ক হবে (তখন `node-cron` বা হোস্টিং প্ল্যাটফর্মের নিজস্ব
scheduled-task ফিচার — কোনটা, আবার জিজ্ঞেস করে নিতে হবে)।

### নোট
এই ফিচারও আজ বাস্তবে কোনো SMS পাঠাচ্ছে না — `sendGuardianSms()`/
`sendSms()`-এর একই কারণে (`config/planFeatures.js`-এ `sms` এখনো সব
tier-এ `false`, `SMS_PROVIDER_API_KEY`-ও সেট নেই)। বাটনে চাপলে
`totalDue`/`sent`/`noPhone`/`notSent` সব ঠিকভাবে গণনা হবে, কিন্তু `sent`
সবসময় ০ থাকবে যতক্ষণ না Phase 8D-এর premium SMS ফিচার চালু হয় বা
`SMS_PROVIDER_API_KEY` বসানো হয় — প্রোডাকশনে কোনো ঝুঁকি ছাড়াই ডিপ্লয় করা
যায়।

---

## Task: BUSINESS_READINESS_ROADMAP Phase 8C — Notification hook-এ SMS
চ্যানেল যোগ (2026-08-06 সম্পন্ন)

### স্কোপ নিয়ে একটা বিচ্যুতি (ব্যবহারকারীকে জানানো দরকার)
Roadmap-এর মূল টেক্সট বলছিল `lib/notifications.js`-এর `createNotification()`
ফাংশনে SMS hook বসাতে। কোড দেখে পাওয়া গেছে সেটা সম্ভব না, যেভাবে লেখা ছিল
সেভাবে: `createNotification()`-এর অডিয়েন্স (`targetUserId`/`targetRoles`)
সম্পূর্ণ স্টাফ-সাইড — `users.id`/স্টাফ role-ভিত্তিক। গার্ডিয়ানদের জন্য কোনো
`users` রো নেই (`guardianData.js`/`GuardianAuthContext` সম্পূর্ণ আলাদা auth
সিস্টেম), তাই "fee due reminder"/"result published"-এর মতো
guardian-facing ইভেন্ট এই টেবিলে কোনো রো হতে পারে না। তাই এই টেবিলে হুক না
বসিয়ে একটা সমতুল্য guardian-facing ফাইল বানানো হয়েছে (নিচে দেখুন) — একই
"কল করো, কখনো throw করে না, plan+wallet দিয়ে গেটেড" শেপ, শুধু
`createNotification()`-এর ভেতরে না।

এটাও পাওয়া গেছে যে **"fee due reminder" এবং "result published" কোনোটাই
আগে কোনো notification/trigger হিসেবে ছিলই না** — result-publish
এন্ডপয়েন্ট আগে থেকে ছিল কিন্তু কোনো নোটিফিকেশন পাঠাতো না (in-app-ও না),
আর fee-due-reminder-এর কোনো cron/scheduled job কোথাও ছিল না। এই দুটোর
মধ্যে **শুধু result-published**-টা এই ডেলিভারিতে যোগ করা হয়েছে (existing
action-এ নতুন side-effect, নতুন dependency/infra লাগে না)। fee-due-reminder
ইচ্ছাকৃতভাবে বাদ রাখা হয়েছে — নিচে "বাকি" দেখুন কেন।

### সম্পন্ন
- নতুন `server/src/lib/guardianSms.js` — `sendGuardianSms({ to, message,
  reference })`। `sendSms()` কল করার আগে ইনস্টিটিউশনের প্ল্যানে `sms`
  ফিচার আছে কিনা চেক করে (`planAllows()`, `config/planFeatures.js` থেকে —
  এখনো সব tier-এ `false`, তাই আজকের যেকোনো real multi-tenant ইনস্টিটিউশনে
  এটা সঠিকভাবেই no-op; Phase 8D premium-এর জন্য `true` করবে)। সিঙ্গেল-টেন্যান্ট
  ডিপ্লয়মেন্টে (কোনো institution context নেই) এই চেক স্কিপ হয়ে যায় —
  `middleware/planGate.js`-এর একই যুক্তি অনুসরণ করে। কখনো throw করে না।
- `server/src/routes/results.js`-এর `PATCH /:id/publish` — `published:
  true` হলে (unpublish-এ না) ছাত্রের `phone` কলাম থেকে নম্বর নিয়ে
  `sendGuardianSms()` কল করে ("... এর ... পরীক্ষার ফলাফল প্রকাশিত হয়েছে")।
  `reference: "result-published:<resultId>"` দিয়ে (smsSender.js-এর
  ledger-এ রেফারেন্স হিসেবে যায়)। ফোন নম্বর না থাকলে silently স্কিপ।
- `AGENTS.md`-এর "Reusable building blocks" তালিকায় `guardianSms.js` এন্ট্রি
  যোগ — ভবিষ্যতে নতুন কোনো guardian-facing SMS trigger বানাতে হলে সরাসরি
  `sendSms()` না ডেকে এটা ব্যবহার করার নির্দেশনা সহ।
- সবগুলো নতুন/পরিবর্তিত `.js` ফাইল `node --check` পাস করেছে (network
  sandbox-এ বন্ধ ছিল বলে `npm run check` এখানে চালানো যায়নি — packaged
  CMD-এ সেটাই প্রথম ধাপ)।

### বাকি (ইচ্ছাকৃতভাবে এই ডেলিভারিতে বাদ, পরের একটা আলাদা সাব-টাস্ক)
- **fee-due-reminder** — কোনো ফর্মেই এখনো বানানো হয়নি। এটার জন্য একটা
  আলাদা সিদ্ধান্ত দরকার শুরুর আগে (AGENTS.md Rule 5 — নতুন dependency
  আগে বলে নিতে হবে):
  - **অটোমেটিক/cron** (যেমন প্রতিদিন রাতে বকেয়া থাকা সব ছাত্রের গার্ডিয়ানকে
    SMS) — `server/package.json`-এ এখন কোনো cron/scheduler লাইব্রেরি নেই,
    তাই এটার জন্য নতুন dependency (যেমন `node-cron`) লাগবে, অথবা হোস্টিং
    প্ল্যাটফর্মের নিজস্ব scheduled-task ফিচার ব্যবহার করতে হবে (কোনটা,
    ব্যবহারকারীকে ঠিক করে দিতে হবে — Render/Google Cloud যেটাতেই ডিপ্লয় হোক)।
    এটা টাকা খরচ করা একটা অটোমেটেড অ্যাকশন, তাই ভুল ফ্রিকোয়েন্সি/থ্রেশহোল্ড
    সেট হলে সরাসরি real cost — confirm ছাড়া অনুমান করে বানানো ঠিক হবে না।
  - **ম্যানুয়াল/অন-ডিমান্ড** (Admin একটা বাটনে চাপলে বকেয়া থাকা সবাইকে
    reminder যাবে) — কোনো নতুন dependency লাগে না, স্কোপ ছোট, কিন্তু নতুন
    endpoint + ফ্রন্টএন্ড বাটন লাগবে (এটাও নিজেই একটা আলাদা সাব-টাস্ক,
    এই ডেলিভারির সাথে মেশানো হয়নি)।
  পরের সেশনে শুরু করার আগে ব্যবহারকারীর সাথে এই দুইটার মধ্যে কোনটা,
  থ্রেশহোল্ড (কত টাকা/কত দিন বকেয়া হলে), আর ফ্রিকোয়েন্সি ঠিক করে নিতে হবে।

### নোট
`sendGuardianSms()`/`sendSms()` দুটোই আজ বাস্তবে কোনো SMS পাঠাচ্ছে না —
`config/planFeatures.js`-এ `sms` এখনো সব tier-এ `false` (Phase 8D-এর কাজ),
আর `SMS_PROVIDER_API_KEY` env var-ও সেট নেই। তাই এই ডেলিভারি প্রোডাকশনে
কোনো ঝুঁকি ছাড়াই ডিপ্লয় করা যায়।

---

## Task: BUSINESS_READINESS_ROADMAP Phase 8B — `smsSender.js` wrapper +
wallet-deduct লজিক (2026-08-06 সম্পন্ন)

### সম্পন্ন
- ব্যবহারকারী প্রোভাইডার হিসেবে **BulkSMSBD** কনফার্ম করেছেন (এন্ট্রি খরচ
  ও প্রতি-SMS রেট Alpha SMS-এর চেয়ে কম, ভবিষ্যতে অন্য রিসেলার যোগ করার
  ব্যবস্থাও রাখতে বলেছেন — তাই provider registry প্যাটার্নে বানানো হয়েছে,
  hardcoded একটা প্রোভাইডার নয়)।
- নতুন `server/src/lib/smsProviders/` ফোল্ডার:
  - `bulksmsbd.js` — BulkSMSBD-এর `POST /api/smsapi` কল করে, response-এর
    `response_code === 202` কে সফল ধরে; অন্য যেকোনো কোড/network এরর ব্যর্থ
    হিসেবে ফেরত দেয় (থ্রো করে না — HTTP-লেভেল এরর ছাড়া)।
  - `index.js` — প্রোভাইডার রেজিস্ট্রি (`{ bulksmsbd: ... }`)। নতুন রিসেলার
    (Alpha SMS, MimSMS) যোগ করতে শুধু একটা নতুন ফাইল + এখানে এক লাইন লাগবে
    — `smsSender.js`-এ কোনো পরিবর্তন লাগবে না।
- নতুন `server/src/lib/smsSender.js` — `lib/mailer.js`-এর প্যাটার্নে
  (env-var driven), কিন্তু কখনো throw করে না (roadmap-এর শর্ত অনুযায়ী):
  - `SMS_PROVIDER_API_KEY` না থাকলে silent no-op (`{ sent: false, reason:
    "not_configured" }`)।
  - পাঠানোর আগে `sms_wallets.balance_taka` চেক করে; খরচ (`SMS_COST_PER_SMS`
    × smsCount, ডিফল্ট ৳0.4/SMS — আসল রেট এখনো কনফার্ম হয়নি, placeholder)
    থেকে কম হলে SMS স্কিপ + Admin/Super Admin-কে ১ ঘণ্টার cooldown সহ একটা
    in-app নোটিফিকেশন (`createNotification`, বার্স্টে একাধিক স্কিপে একগাদা
    নোটিফিকেশন এড়াতে)।
  - সফল সেন্ডের পরই `sms_transactions`-এ একটা `deduct` রো + `sms_wallets`
    ব্যালেন্স আপডেট — একই ট্রানজ্যাকশনে (`db.withTransaction`, payments.js-এর
    প্যাটার্নে)।
- `.env.example` — `SMS_PROVIDER`/`SMS_PROVIDER_API_KEY`/
  `SMS_PROVIDER_SENDER_ID`/`SMS_COST_PER_SMS` (সব কমেন্ট-আউট, ডিফল্ট
  unset = SMS বন্ধ)।
- `AGENTS.md`-এর "Reusable building blocks" তালিকায় এক লাইন যোগ (নতুন
  reusable piece — নিয়ম অনুযায়ী)।
- এই সাব-ফেজে কোনো রুট/`index.js` ওয়্যারিং হয়নি ইচ্ছাকৃতভাবে — `sendSms()`
  এখনো কোথাও কল হচ্ছে না (Phase 8C-এর কাজ, `notifications.js`-এ hook করা)।
  Rule 1 অনুযায়ী স্কোপ শুধু wrapper + wallet-deduct লজিক পর্যন্ত।
- সবগুলো নতুন `.js` ফাইল `node --check` পাস করেছে (network sandbox-এ বন্ধ
  ছিল বলে `npm run check` চালানো যায়নি এখানে — packaged CMD-এ সেটাই প্রথম
  ধাপ)।

### বাকি
কিছু না — এই সাব-ফেজ সম্পূর্ণ। Phase 8C (notification hook-এ SMS চ্যানেল
যোগ) পরের আলাদা টাস্ক।

### নোট
`SMS_COST_PER_SMS`-এর ডিফল্ট মান (৳0.4) placeholder — BulkSMSBD সাইনআপের
পর আসল রিচার্জ-টায়ার রেট জানা গেলে `.env`-এ এটা বসিয়ে দিতে হবে (কোড
পরিবর্তন লাগবে না)। sandbox/ফ্রি ট্রায়াল ক্রেডিট দিয়ে আসল সেন্ড টেস্ট করা
এখনো বাকি — `SMS_PROVIDER_API_KEY` না বসানো পর্যন্ত পুরো ফিচার no-op হয়ে
থাকবে, প্রোডাকশনে কোনো ঝুঁকি নেই।

---

## Task: BUSINESS_READINESS_ROADMAP Phase 8A — SMS wallet + ledger, DB স্কিমা
(2026-08-05 সম্পন্ন)

### সম্পন্ন
- `server/sql/supabase_schema.sql` (protected path) — দুইটা নতুন টেবিল:
  `sms_wallets` (schema-per-tenant হওয়ায় প্রতিষ্ঠান-প্রতি এক রো,
  institutionId কলাম ছাড়াই — `balance_taka` + `updatedAt` timestamptz) এবং
  `sms_transactions` (লেজার — type: topup/deduct, amountTaka, smsCount,
  reference, createdAt text + ইনডেক্স)।
- `server/src/tenantProvision.js` — নতুন প্রতিষ্ঠান provision হওয়ার সময়
  ব্যালেন্স ০ দিয়ে একটা `sms_wallets` রো অটো-ইনসার্ট (settings ইনসার্টের
  পাশে, একই ট্রানজ্যাকশনে)।
- `server/src/db.js` — সিঙ্গেল-টেন্যান্ট ডিপ্লয়মেন্টের জন্য একই backfill
  (`incomeCategories` চেকের প্যাটার্নে "না থাকলে ইনসার্ট করো")।
- সবগুলো `node --check` পাস করেছে (network sandbox-এ বন্ধ ছিল বলে
  `npm run check` চালানো যায়নি এখানে — packaged CMD-এ সেটাই প্রথম ধাপ)।

### বাকি (ব্যবহারকারী already-provisioned multi-tenant ইনস্টিটিউশন থাকলে,
manual ধাপ — কোনো কোড বাকি নেই)
- ইতিমধ্যে বিদ্যমান tenant schema-গুলোতে নতুন টেবিল দুটো পৌঁছাতে হলে
  Super-Admin প্যানেল থেকে বিদ্যমান "run SQL on all tenants" টুল
  (`routes/platform.js`, `migrateTenants.js`) দিয়ে এই দুই CREATE TABLE
  স্টেটমেন্ট ম্যানুয়ালি রান করতে হবে — নতুন কোনো কোড লাগবে না, শুধু
  ব্যবহারকারীর একটা অ্যাকশন।

### নোট
Phase 8B (`smsSender.js` wrapper + wallet-deduct লজিক) শুরুর আগে কোন SMS
reseller ব্যবহার হবে সেটা ব্যবহারকারীর সাথে ঠিক করে নিতে হবে (roadmap-এর
8B সেকশনে বলা আছে) — পরের এজেন্ট ধরে নেবে না, জিজ্ঞেস করবে। AGENTS.md
Rule 1 অনুযায়ী একটা সাব-ফেজ শেষ না হওয়া পর্যন্ত পরেরটা শুরু হবে না — Phase
6 real paywall (backend+frontend) আগেই সম্পন্ন হয়েছে; বিস্তারিত ফাইল
লিস্টের জন্য নিচের আর্কাইভড কমেন্ট ব্লক দেখুন।

<!-- ORIGINAL TASK WORDING (kept for context, superseded by নোট below):
The user explicitly confirmed (2026-08-05): turn the earlier Phase 6
scaffolding into a REAL paywall now, don't wait on pricing numbers (those
come later, separately), support two billing models (per-student and flat),
and existing/demo tenants that lose access are fine — they'll be
reassigned a real plan or deleted from the Super-Admin panel, since they're
demo accounts, not paying customers.

### সম্পন্ন (this round, backend only)
- `server/src/config/planFeatures.js` — rewritten from the old "everything
  true" scaffolding to REAL per-tier gates: `basic` (nothing extra beyond
  the always-free core), `standard` (+feesCollection/expenses/
  hifzTracking/reportsExport/assignmentsBroadcast), `pro` (+customDomain/
  auditLogs), `premium` (same as pro + 6 "Coming Soon" keys — payroll/
  library/idCards/hostel/sms/bkash — all still `false` because those
  modules don't exist in code; flip one to `true` under `premium` the day
  its module ships, that's the only change needed). Also added
  `PLAN_ORDER`, `FEATURE_META` (Bengali labels + `comingSoon` flag per
  feature, for UI use), `PRICING_MODELS` (`student`/`flat` labels only, no
  numbers), and `minPlanFor(feature)`.
- `server/src/middleware/planGate.js` — new `requirePlanFeature(feature)`
  middleware (parallel to `middleware/rbac.js`'s `requirePermission`).
  Never gates single-tenant deployments (no `tenantContext.get().institution`
  → always `next()`), same reasoning as `requireTenantContext` in
  `routes/settings.js`. Returns 403 with `{ error, planFeatureLocked,
  currentPlan, requiredPlan }` when blocked — `requiredPlan` is the JSON key
  the frontend should read to build the "upgrade to X" message.
- Applied `requirePlanFeature(...)` to: `routes/payments.js` +
  `routes/income.js` (both → `"feesCollection"`, since the Income.tsx page's
  tabs hit both endpoints), `routes/expenses.js` (`"expenses"`),
  `routes/hifz.js` (`"hifzTracking"`), `routes/reports.js`
  (`"reportsExport"`), `routes/assignments.js` (`"assignmentsBroadcast"` —
  staff side only; the guardian-facing read routes in `guardianAuth.js` are
  intentionally NOT gated so guardians can still read posts made before a
  downgrade), `routes/auditLogs.js` (`"auditLogs"`).
- `server/sql/registry_schema.sql` — added nullable `billing_model` (check
  constraint: `student`/`flat`/null) and `price_amount numeric(12,2)`
  columns to `registry.institutions`. Additive/non-breaking (both nullable,
  `add column if not exists`). No numbers filled in anywhere — purely
  billing bookkeeping columns, NOT read by any feature-gating code (plan
  tier alone gates features).
- `server/src/registryDb.js`'s `updateSubscription()` now also accepts
  `billingModel`/`priceAmount` (same COALESCE-if-omitted pattern as
  `plan`/`subscriptionEndsAt`).
- `server/src/routes/platform.js`'s `PATCH /institutions/:id/subscription`
  validates and passes through `billingModel` (`student`|`flat`) and
  `priceAmount` (non-negative number).
- `server/public-platform/app.js` (Super-Admin panel) — subscription modal's
  plan field is now a `<select>` of the 4 real tiers instead of free text,
  plus new billing-model select and price input; institutions table row
  shows billing model + price next to the plan name when set. **This is
  where you go to bump a demo institution's plan from `basic` to whatever
  it should be, or to leave it locked until reassigned.**
- All of the above pass `node --check`. `npm run check` (the real gate —
  lint/typecheck/build/test) has NOT been run yet (no node_modules/network
  in the sandbox this was written in) — **the very first thing the next
  agent or the packaged CMD does must be `npm run check`, and it may
  surface issues these individual syntax checks couldn't catch.**

### বাকি (পরের এজেন্ট এখান থেকে চালিয়ে যাবে) — ফ্রন্টএন্ড অংশ
This is the second half of the same task, deliberately split into a
separate delivery. Do NOT re-decide the tier structure or feature mapping —
it's already fixed in `server/src/config/planFeatures.js`; just build the UI
against it.

1. **Client `usePlanFeatures()` hook / context** — fetch
   `GET /api/settings/plan` (already exists, returns
   `{ plan, features, customDomain }` — note `features` now has many more
   keys than just `customDomain`) once near the app root (e.g. inside
   `AuthContext` or a new small context), so every page/component below can
   read `features.xxx` without each re-fetching. Remember: this endpoint
   404s outside multi-tenant mode (`requireTenantContext`) — treat that as
   "everything unlocked" (single-tenant deployments have no plan concept),
   don't show lock screens there.
2. **A reusable lock/upgrade wrapper component** — e.g.
   `client/src/components/PlanFeatureGate.tsx` — takes a `feature` key
   (matching `planFeatures.js`'s keys) and children; if the feature isn't in
   the current plan, renders an "upgrade" card instead of the children
   (Bengali message, similar tone to the existing customDomain upsell text
   in `client/src/modules/Settings.tsx` around line ~1011). Use
   `FEATURE_META`'s labels for feature names — but that file is server-side;
   either mirror the labels in a small client-side copy, or have
   `GET /api/settings/plan` also return label/comingSoon per feature so
   there's still one source of truth (prefer this — extend the `/plan`
   route in `routes/settings.js` to include `FEATURE_META` in the response
   rather than hand-duplicating labels in the client).
3. **Wrap the 6 gated routes in `client/src/App.tsx`** (`income`, `expenses`,
   `hifz`, `assignments`, `reports`, `audit-logs`) with the gate component
   from step 2, each with its matching feature key (see the backend list
   above for the exact mapping — `income` route covers BOTH
   `feesCollection`-gated endpoints).
4. **`client/src/components/Sidebar.tsx`** — currently hides nav items only
   by RBAC permission (`canAccess`). Add a locked/greyed state (not full
   hiding) for nav items whose feature isn't in the current plan, so users
   see the feature exists and can be upgraded to, per the user's explicit
   "marketing" intent — clicking a locked item still navigates to the page,
   which now shows the upgrade card from step 2/3, so no separate "locked"
   click-handling needed in the Sidebar itself. Note: `Sidebar.tsx` is on
   `client/eslint.config.js`'s legacy inline-style exemption list, so
   `style={{}}` there is fine — don't attempt a full migration to the
   design-system classes as part of this task, that's unrelated scope.
5. **Public pricing/marketing page** — new `client/src/pages/Pricing.tsx`
   (public route, e.g. `/pricing`, outside `ProtectedRoute`, added to
   `App.tsx`'s lazy imports + public `<Routes>` block alongside `/about`
   etc.). Renders the 4 tiers (Basic/Standard/Pro/Premium) with feature
   checklists, matching the visual reference image the user shared
   (eXimus-style 4-column pricing cards) but with THIS repo's real feature
   set (see `FEATURE_META`/tier mapping in `planFeatures.js`). Premium's
   6 not-built features show a "শীঘ্রই আসছে" (Coming Soon) badge instead of
   a checkmark. No prices shown yet (pricing not decided) — show
   "যোগাযোগ করুন" (Contact us) / "মূল্য শীঘ্রই" instead of a number, for all
   4 tiers, until the user gives real numbers for both the `student` and
   `flat` billing models.
6. **`npm run check`** — must pass before anything is committed/pushed, per
   AGENTS.md. Fix whatever it surfaces (this batch was only syntax-checked
   with `node --check`, not the real lint/typecheck/build/test suite).
7. Report back explicitly which of the 6 wired routes were tested how (or
   if only visually reasoned through, say so) — this is UI on top of a real
   backend permission change, worth double-checking against at least one
   `basic`-plan and one `pro`-plan institution if the user can provide test
   accounts.
-->

### নোট
Phase 6 (plan-tiering, real paywall — **both backend and frontend**)
delivered 2026-08-05. Backend half (see the archived task text above) was
already done; this session completed the frontend half:

1. **New `GET /api/plan` route** (`server/src/routes/plan.js`, mounted in
   `index.js`) — deliberately separate from the existing `GET
   /api/settings/plan` (which stays Admin/Super-Admin-only via the
   `"settings"` permission, used only by Settings.tsx's domain section).
   The new route is NOT listed in `ROUTE_PERMISSION`
   (`server/src/config/roles.js`), so `rbacMiddleware`'s default (unlisted
   top-level segment → `next()`) lets every authenticated role reach it —
   necessary because Teacher/Accountant/Hostel Manager all need to know
   which of THEIR OWN pages are plan-locked, not just Admin. This was a
   deliberate, minimal, additive choice specifically to avoid touching
   `rbac.js`/`roles.js` (both protected paths per AGENTS.md). Returns
   `{ plan, features, featureMeta, planOrder }` — `featureMeta` is
   `planFeatures.js`'s `FEATURE_META` enriched with `minPlan` per key
   (computed via the existing `minPlanFor()`), so the frontend's upgrade
   message never hand-duplicates the tier logic.
2. **`client/src/context/PlanContext.tsx`** — new `PlanProvider`/
   `usePlanFeatures()` hook (same pattern as `AppSettingsContext.tsx`).
   Fetches once. Fails **open** (`isLocked()` always `false`) on a 404
   (single-tenant deployment, no plan concept) or any other error —
   never blocks a page because of a network hiccup; the real gate is
   still the server route's own `requirePlanFeature()` middleware.
3. **`client/src/components/PlanFeatureGate.tsx`** — new reusable lock/
   upgrade wrapper. Renders children unchanged unless
   `isLocked(feature)`, in which case it shows a Bengali upgrade card
   (feature label + current/required plan, or a "coming soon" message for
   the not-yet-built Premium features) with a link to `/pricing`. Built
   entirely from `components/ui/` (`Card`, `Button`) + new scoped
   `.plan-lock*` classes in `index.css` — no raw `style={{}}`, since this
   is a new file and not on `client/eslint.config.js`'s legacy exemption
   list.
4. **`client/src/App.tsx`** — wrapped the 6 gated routes with
   `PlanFeatureGate` (`income`→`feesCollection`, `expenses`→`expenses`,
   `hifz`→`hifzTracking`, `assignments`→`assignmentsBroadcast`,
   `reports`→`reportsExport`, `audit-logs`→`auditLogs`), and put
   `PlanProvider` around the authenticated `Layout` route (not the whole
   app — `/api/plan` requires auth, and public pages don't need plan
   state). Added the new `/pricing` public route.
5. **`client/src/components/Sidebar.tsx`** — added an optional `feature`
   key to `NAV_IDS` entries; a locked item gets the new `.nav-item--locked`
   (dimmed) class plus a small 🔒 badge, but is NOT hidden and NOT
   click-intercepted — clicking it still navigates, where
   `PlanFeatureGate` shows the upgrade card. This file stays on the
   legacy inline-style exemption list; only a new shared class was added,
   no new inline styles.
6. **`client/src/pages/Pricing.tsx`** — new public `/pricing` page,
   `About.tsx`/`TermsOfService.tsx`-style (`PublicHeader`/`PublicFooter`/
   `PublicPageSkeleton`, `usePublicSite`, `useSeoMeta`), 4-column tier
   cards. Reads tier/feature data from a **new public, unauthenticated**
   `GET /api/public/plan-tiers` (`server/src/index.js`, same pattern as
   the existing `/api/public/settings` etc.) rather than a hand-copied
   client-side mirror of `planFeatures.js` — kept as the single source of
   truth per AGENTS.md's "Single source of truth" section. No prices
   shown (pricing not decided yet) — "যোগাযোগ করুন — মূল্য শীঘ্রই" on
   every tier. Premium's 6 not-built features show a "শীঘ্রই আসছে" badge;
   Basic/Standard/Pro cards only list the real (already-built)
   feature set.
7. `client/src/i18n/bn.ts` / `en.ts` — added `planLock` (used by
   `PlanFeatureGate`) and `pricing` (tier labels, used by
   `PlanFeatureGate`'s upgrade message — NOT by the public `Pricing.tsx`
   page itself, which hardcodes Bengali like every other public page;
   `useLanguage`/the i18n dict is an authenticated-app-only system, see
   `About.tsx`/`TermsOfService.tsx`). Structural key-parity between the
   two files was checked by eye against the existing pattern.
8. **All files syntax-checked** (`node --check` on the `.js` files,
   manual brace/paren-balance + JSX-structure review on every new/edited
   `.tsx`/`.ts` file — no `node_modules`/network in this sandbox, same
   limitation as every earlier phase). **`npm run check` (lint + typecheck
   + build) was NOT run by this agent** — this is exactly what the
   packaged delivery CMD runs first, before any commit/push happens.
9. **Testing status (roadmap item 7):** none of the 6 wired routes were
   exercised in a running browser from this sandbox (no dev server here)
   — this was reasoned through by reading the code paths, not observed.
   **Please smoke-test after deploying:** log in as (or switch) a
   `basic`-plan institution and confirm `/income`, `/expenses`, `/hifz`,
   `/assignments`, `/reports`, `/audit-logs` each show the locked upgrade
   card (not the real page, not a crash), and that a `pro`/`premium`
   institution sees the real pages normally. Also check `/pricing` loads
   logged out.

Phase 6 (plan-tiering, scaffolding-only — SUPERSEDED by the above, kept for
history) finished 2026-08-05:
- User decided the tier structure: `basic` / `standard` / `pro` / `premium`,
  mapped to what's actually built in this repo (Basic = student/attendance/
  results/notices/guardian portal; Standard = + fees collection/expenses/
  reports/Hifz tracking/assignments; Pro = + custom domain, unchanged from
  before; Premium = payroll/library/ID cards/hostel/SMS/bKash, none of
  which exist in code yet — "Coming Soon" marketing only).
- **Deliberately did NOT turn this into a real paywall yet.** Before today,
  every tenant regardless of `plan` already had unrestricted access to fees
  collection, Hifz tracking, reports, assignments, and audit logs — locking
  those behind `standard`/`pro` now would silently cut off any tenant
  currently on `plan = "basic"` in the database. So `server/src/config/
  planFeatures.js` now has 4 tier objects, but the already-in-use features
  are `true` on all 4, and the not-yet-built Premium features are `false`
  on all 4 (placeholder keys only, not gates on working code).
  `customDomain` is untouched (still pro+ only, same as before).
- **Still open — needs the user's explicit decision before coding further:**
  (1) pricing per tier (not decided), (2) which of the already-built
  features (if any) actually move behind a real paywall, and if so what
  happens to existing tenants already on a lower plan (a migration/
  grandfathering decision, not a code decision), (3) whether "Coming Soon"
  Premium features get a marketing page now or wait until built.
- No client-side UI changes this round — no new lock/unlock screens, no
  pricing page changes. Only `server/src/config/planFeatures.js` touched.

Phase 5 (core business-logic test coverage) finished 2026-08-05:
- **Part 1 — payments/fees logic:** `payments.js`'s inline due/conflict/
  status math (the `isConflict` block the roadmap flagged as risky) was
  extracted, unchanged in behavior, into new `server/src/lib/paymentLogic.js`
  (`isPaymentConflict`, `computeDueAfterPayment`, `computePaymentOutcome`) —
  the same pure-function-in-lib pattern `results.js` already uses for
  `sanitizeSubjects`/`computeGrade`. This was necessary (not a drive-by
  refactor) because the logic can't be meaningfully unit tested while stuck
  inside a route handler wrapped in `db.withTransaction`. Both call sites in
  `payments.js` (`POST /` and `POST /:id/resolve-flag`'s confirm branch,
  which duplicated the same due/status math) now call the shared helpers.
  New tests: `server/src/lib/__tests__/paymentLogic.test.js` — conflict
  detection (zero/negative/missing due), Partial vs Completed status,
  overpayment clamping to 0 due, and string-vs-number input coercion (values
  read back from Postgres often arrive as strings).
- **Part 2 — `teacherScope.js` expansion:** added multi-class-teacher and
  no-class-teacher edge cases to the existing
  `server/src/lib/__tests__/teacherScope.test.js` — asserts a Teacher with
  nothing assigned gets a defined-but-empty array (not `undefined`, which
  `routes/attendance.js`/`results.js`/`assignments.js` all depend on to
  distinguish "scoped to nothing" from "unscoped"), a multi-class Teacher
  gets the full list, and the lookup uses the request's own `user.id`.
- **Part 3 — RBAC permission matrix:** new
  `server/src/middleware/__tests__/rbac.test.js` (+ sibling `package.json`
  with `"type": "module"`, matching the other `__tests__` folders per
  `teacherScope.test.js`'s comment on why that's needed) — a hand-written
  per-route "which roles are allowed" table checked against every route in
  `ROUTE_PERMISSION` (fails loudly if a route is added without updating the
  table), full `canAccess()` coverage for all 5 roles × 18 routes, plus
  `requirePermission()` (401/403/pass, array-of-alternatives) and
  `rbacMiddleware()` (path-segment parsing, ungated routes, nested
  sub-paths) behavior tests.
- **`npm run check` NOT run by this agent** (no network/node_modules in this
  sandbox, same limitation noted for Phases 1/3/4). Instead: `node --check`
  on every new/modified file (including the new ESM test files, which
  correctly picked up the nested `package.json`'s `"type": "module"`), plus
  every assertion in all three new/expanded test files was independently
  re-run as a plain Node script against the real `paymentLogic.js`/`rbac.js`
  modules (not vitest, since that's unavailable offline) — all passed.
  **Run `npm run check` (which runs `test:server` + the real `vitest`
  suite via `test:unit`) as part of this delivery's CMD before trusting
  it** — this is exactly what the packaged CMD does.

Phase 4 (Terms of Service + Privacy Policy) finished 2026-08-05:
- New public (logged-out) pages in the tenant React client, matching the
  `About.tsx`/`Notices.tsx` public-page pattern (`PublicHeader`/
  `PublicFooter`/`PublicPageSkeleton`, `usePublicSite`, `useSeoMeta`) but
  **not** copying their inline-`style={{}}` approach: `About.tsx` etc. are
  on the legacy exemption list in `client/eslint.config.js`, these two new
  files are not, so per AGENTS.md's Design System rule they had to be
  clean from the start —
  `client/src/pages/TermsOfService.tsx` (route `/terms`) and
  `client/src/pages/PrivacyPolicy.tsx` (route `/privacy`).
- New CSS added to `client/src/index.css`: `.legal-page__*` (badge/heading/
  updated-date/notice) and `.legal-content*` (card + typography for the
  section list), plus `.public-footer__legal` for the new footer link row.
  Reused existing generic classes (`app-shell`, `page-shell`,
  `section-shell`, `soft-panel(-strong)`, `pill`, `section-heading`,
  `alert alert--amber`) rather than inventing near-duplicates.
- Both pages open with an amber "এটি একটি খসড়া নথি..." notice — per the
  roadmap's Phase 4 point 4, the content is a structural starting point,
  not lawyer-reviewed final language. Flagging this to the user explicitly
  here too: **have an actual lawyer review the wording before relying on
  it with real customers.**
- `client/src/App.tsx`: lazy-imported both pages, added the `/terms` and
  `/privacy` public routes (outside `ProtectedRoute`, alongside
  `/about`/`/notices`/etc.).
- `client/src/components/PublicFooter.tsx`: added a legal-links row
  (Terms/Privacy) below the copyright line. This file is on the legacy
  exemption list too, but per AGENTS.md "Migration status" (touched parts
  of a legacy file should use the design system, not add more inline
  styles next to the old ones) the new row uses the new
  `.public-footer__legal` class, not `style={{}}`.
- `server/src/lib/seoMeta.js`: added `/terms` and `/privacy` to
  `PUBLIC_ROUTES` (title/description) so crawlers/link-previews get real
  meta tags instead of falling into the generic noindex default, and so
  the two paths are picked up automatically by the existing
  `/sitemap.xml` route (`INDEXABLE_PUBLIC_PATHS`) — no route/index.js
  change needed, that wiring already existed.
- **Scope call not in the original roadmap wording:** the roadmap's step 3
  ("স্ব-নিবন্ধন ফ্লো ... একটা checkbox") assumed a `PublicSignup`-style
  frontend page, but there isn't one — the actual self-signup UI is the
  separate plain-HTML/JS marketing site (`server/public-marketing/`,
  served only on the bare apex root domain per `PLATFORM_ROOT_DOMAIN`,
  see `index.js`'s apex-host middleware) that only talks to
  `POST /api/public/signup`. The tenant client's new `/terms`/`/privacy`
  routes aren't reachable from that apex domain (different serving path
  entirely), so:
  - Added standalone `server/public-marketing/terms.html` and
    `privacy.html` (plain HTML, same visual language as `index.html` via
    the shared `styles.css`, plus a small page-scoped `<style>` block for
    the section-list layout). Linked with the `.html` extension
    (`/terms.html`, `/privacy.html`) because the apex middleware's
    `express.static` call has no `extensions` option configured, so an
    extensionless `/terms` request there would fall through to the
    marketing SPA's `index.html` instead of matching a static file.
  - `server/public-marketing/app.js`: added a required "আমি শর্তাবলী ও
    গোপনীয়তা নীতি মেনে নিচ্ছি" checkbox (links to the two new `.html`
    pages, opened in a new tab) right before the submit button. Enforced
    client-side only via the native HTML `required` attribute (form
    submission is blocked by the browser until checked) — did **not**
    add server-side enforcement in `publicSignup.js`, since the roadmap
    only asked for the flow to have the checkbox, and adding a new
    required-field check there would be a second, unscoped change to a
    file outside this task's stated diff. Flagging this as a possible
    follow-up if the user wants it enforced server-side too (a bad actor
    could bypass the checkbox by calling `POST /api/public/signup`
    directly, same as with any client-only validation).
  - New `.field--checkbox` styles added to
    `server/public-marketing/styles.css` for that checkbox row.
- **`npm run check` NOT run by this agent** (no network/node_modules in
  this sandbox, same limitation noted for Phase 1 and Phase 3). Manual
  review only: read-through of both new `.tsx` files against the
  `no-restricted-syntax` ESLint rule (confirmed no native-element
  `style={{`), a bracket/JSX-balance pass, confirmed `App.tsx`'s new
  routes/imports are well-formed, confirmed the new/edited `.js`/`.html`
  files have no syntax errors, and confirmed no CSS custom property was
  referenced without being defined (caught and fixed one: `var(--slate-d)`
  doesn't exist in `index.css`, swapped to `var(--muted)`).
  **Run `npm run check` as part of this delivery's CMD before trusting
  it** — this is exactly what the packaged CMD does.

Phase 3 (staff-side notice/assignment broadcast UI) finished 2026-08-05:
- Backend was already complete (`server/src/routes/assignments.js`,
  `server/src/lib/classPosts.js`); only a new `GET /api/assignments/classes`
  endpoint was added (mirrors `results.js`'s `/classes` — teacher-scoped via
  `attachTeacherClasses`, unscoped roles get every class with a student).
  Required adding `const db = require("../db");` to that route file, which
  wasn't imported before.
- New client module `client/src/modules/ClassPosts.tsx` — compose form
  (class/type/title/body) + sent-posts list with a type filter, built
  entirely from `components/ui/` (`Card`, `Field`, `Input`, `Select`,
  `Textarea`, `Button`) plus the existing `Badge` component for the
  type/class chip — no raw `style={{}}` on native elements, per AGENTS.md's
  Design System rule (this file was not on the legacy-exemption list, so it
  had to comply from the start).
- New scoped CSS classes added to `client/src/index.css`:
  `.class-post-form`, `.class-post`, `.class-post__head`,
  `.class-post__meta`, `.class-post__title`, `.class-post__body`,
  `.class-post__actions` — same pattern as `.report-card__*` in the same
  file.
- `client/src/lib/api.ts`: added `getAssignmentClasses`, `getClassPosts`,
  `createClassPost`, `deleteClassPost`.
- `client/src/lib/permissions.ts`: added `"assignments"` to the
  `Permission` union type and to `firstAllowedPath`'s fallback order (right
  after `results`). No `roles.js`/`roles.generated.ts` change was needed —
  the `"assignments"` permission already existed for Admin/Teacher.
- `client/src/App.tsx`: lazy-imported `ClassPosts` and added the
  `/assignments` protected route.
- `client/src/components/Sidebar.tsx`: added one `NAV_IDS` entry (📢) —
  only a data-array addition, so it renders through the file's existing
  `NavLink` block and needed no new inline styles (the file is on the
  legacy-exemption list, but nothing new was written there anyway).
- `client/src/i18n/bn.ts` + `en.ts`: added `nav.assignments` and a new
  `classPosts` block (structural key-parity between the two files was
  checked by script, not just by eye).
- Attachments (image/PDF upload on a post) were intentionally left out of
  this UI — the roadmap's Phase 3 scope only asked for the write/send form
  and list, and the backend schema already defaults `attachments` to `[]`
  if omitted, so this can be added later as its own small task without
  touching what's here.
- **`npm run check` NOT run by this agent** (no network/node_modules in
  this sandbox, same limitation noted for Phase 1). Manual review only:
  `node --check` on the new/edited `.js` route file, a bracket-balance
  pass on the new `.tsx` file, and a script-based structural diff
  confirming `bn.ts`/`en.ts` key parity for the new translation blocks.
  **Run `npm run check` as part of this delivery's CMD before trusting
  it** — this is exactly what the packaged CMD does.

Phase 1 (payments cascade fix) finished 2026-08-05:
- `server/sql/supabase_schema.sql`: `payments.studentId` changed from
  `not null ... on delete cascade` to `references students(id) on delete
  set null` (nullable) in the `create table if not exists payments` block,
  matching `income.studentId`'s existing pattern. Added an idempotent
  migration block right after it (`alter column ... drop not null` +
  `drop constraint if exists` + `add constraint ... on delete set null`) so
  **existing** databases (not just fresh ones) pick up the fix — this
  mirrors the file's established idempotent-statement convention (see
  `db.js`'s `initSchema()` comment).
- No server route code needed changes: `payments.js`'s only place that
  reads a payment row's `studentId` after the fact (`resolve-flag`
  endpoint) already guards with `if (student)` before touching
  `students`, so a null `studentId` degrades gracefully. `payments.student`/
  `payments.roll` are already denormalized snapshot columns, so receipts
  keep showing the right name/roll even after `studentId` goes null.
  `students.js`'s delete endpoint needed no change — the DB now handles
  the cascade behavior via the FK itself.
- No frontend code reads `payment.studentId` anywhere, so no client changes
  needed either.
- **Deployment-time action the user still needs to take (not code, can't be
  done from this sandbox):** `db.js`'s `initSchema()` only re-runs
  `supabase_schema.sql` against the `public` schema on every boot — it does
  NOT automatically reach existing tenant schemas (`tenant_xxx`), per
  `migrateTenants.js`'s own header comment. Any **already-provisioned**
  institution's `payments` table still has the old CASCADE constraint until
  someone runs this migration SQL against it via the Platform panel's
  tenant-migration tool (`POST` route in `platform.js`, calls
  `migrateTenants.migrateAllTenants(sql)`):
  ```sql
  alter table payments alter column "studentId" drop not null;
  alter table payments drop constraint if exists "payments_studentId_fkey";
  alter table payments add constraint "payments_studentId_fkey"
    foreign key ("studentId") references students(id) on delete set null;
  ```
  Brand-new institutions provisioned after this deploy get the fix
  automatically (`tenantProvision.js` reads the same schema file).
- `npm run check` NOT run by this agent (no network/node_modules in this
  sandbox) — manual review only (parens-balance sanity check on the SQL
  file, read-through of every `studentId` usage in `payments.js` and the
  student-delete endpoint in `students.js`, confirmed no frontend
  dependency). **Run `npm run check` as part of this delivery's CMD before
  trusting it.**

## How to use this file (for the AI agent)

**If `Status: IN_PROGRESS` above:**
1. Read "বাকি" below — that is the next work, already scoped by a previous
   agent. Continue it without asking the user to re-explain, unless the
   user's current message gives a clearly different/new instruction (a new
   instruction always takes priority — see AGENTS.md).
2. When you finish another part of the queued task, move it from "বাকি" to
   "সম্পন্ন" and update "বাকি" with what's still left — do this *before*
   packaging the delivery zip, so it travels with the commit.
3. If, after your part, nothing remains in "বাকি", reset this entire file
   back to the template below (Status: DONE, both lists cleared). Do not
   leave a stale IN_PROGRESS with an empty "বাকি" list — that's ambiguous
   for the next agent.

**If `Status: DONE` above:** there is no carried-over task. Proceed on
whatever the user asks in their current message; if they say to split it
into parts, switch this file to the IN_PROGRESS template below as part of
your delivery.

**If the user gives a brand-new task while Status is IN_PROGRESS:** do the
new task, and leave the existing IN_PROGRESS entry untouched unless the
user says to drop it — don't merge the two into one entry.

---

## Template (copy this in when starting a multi-part task)

```markdown
## Status: IN_PROGRESS

## Task: [এক লাইনে মূল কাজের নাম]
Started: [YYYY-MM-DD]

### সম্পন্ন
- [x] Part 1 — কী করা হয়েছে, কোন ফাইলে

### বাকি (পরের এজেন্ট এখান থেকে চালিয়ে যাবে)
- [ ] Part 2 — ঠিক কী করতে হবে, কোন ফাইলে/ফাংশনে
- [ ] Part 3 — ঠিক কী করতে হবে, কোন ফাইলে/ফাংশনে

### নোট
পরের অংশ করতে যা context লাগবে — নাম/স্ট্রাকচার/সিদ্ধান্ত যা এই সেশনে ঠিক
হয়েছে এবং কোথাও লেখা নেই।
```
