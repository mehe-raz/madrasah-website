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
