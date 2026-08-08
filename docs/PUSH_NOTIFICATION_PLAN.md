# গার্ডিয়ান পুশ নোটিফিকেশন — পূর্ণাঙ্গ পরিকল্পনা

> Status: PLANNED (কোনো ধাপ এখনো শুরু হয়নি)
> এই ফাইলটি শুধু পরিকল্পনা — কোনো কোড পরিবর্তন হয়নি। ব্যবহারকারী নির্দিষ্ট ধাপ
> ("Phase X শুরু করো") না বলা পর্যন্ত বাস্তবায়ন শুরু হবে না। AGENTS.md-এর নিয়ম
> অনুযায়ী প্রতিটি ফেজ = "one task at a time, minimal diff" + শেষে `npm run check`।

---

## ১. মূল প্রশ্নের উত্তর: কোন প্রযুক্তি, কেন ফ্রি

ব্যবহারকারী "গুগলের ফ্রি সার্ভিস" বলেছেন — এখানে দুটি রাস্তা আছে:

| অপশন | কী | খরচ/জটিলতা |
|---|---|---|
| **A. Web Push API + VAPID** (সুপারিশকৃত) | ব্রাউজার-স্ট্যান্ডার্ড পুশ (W3C)। Android/Chrome-এ এটি ভেতরে-ভেতরে **Google-এরই FCM অবকাঠামো** ব্যবহার করে, কিন্তু কোনো Firebase অ্যাকাউন্ট/প্রজেক্ট লাগে না — শুধু একজোড়া VAPID কী (নিজে জেনারেট করা, বিনামূল্যে, কোনো তৃতীয় পক্ষের সাইনআপ ছাড়াই) | সম্পূর্ণ ফ্রি, কোনো external অ্যাকাউন্ট লাগে না, ১টা npm প্যাকেজ (`web-push`) |
| B. Firebase Cloud Messaging SDK সরাসরি | আলাদা Firebase প্রজেক্ট বানাতে হবে, `firebase-admin` SDK, google-services কনফিগ | ফ্রি টায়ারেই থাকে, কিন্তু বাড়তি অ্যাকাউন্ট + কনফিগ + বাড়তি ডিপেন্ডেন্সি |

**সুপারিশ: অপশন A।** কারণ প্রজেক্টে ইতিমধ্যে `client/public/sw.js` (service worker) আছে, AGENTS.md-এর Rule 5 বলছে না-দরকারি ডিপেন্ডেন্সি না বাড়াতে — Web Push standard-এই কাজ চলে যায়, Android/Chrome-এ ফলাফল কার্যত Firebase-এরই মতো (একই অবকাঠামো), আর iOS Safari (16.4+, PWA হোম-স্ক্রিনে ইনস্টল করা থাকলে) এবং ডেস্কটপ ব্রাউজারেও কাজ করে — Firebase SDK দিয়ে করলে সেটাও এক্সট্রা কিছু দেয় না।

**নতুন ডিপেন্ডেন্সি (AGENTS.md Rule 5 অনুযায়ী আগে থেকে জানিয়ে রাখা হলো):**
- সার্ভারে: `web-push` (npm) — VAPID সাইন করে পুশ পাঠানোর জন্য। এটাই একমাত্র নতুন প্যাকেজ, পুরো পরিকল্পনায়।
- ক্লায়েন্টে: কোনো নতুন প্যাকেজ লাগবে না — ব্রাউজারের বিল্ট-ইন `PushManager`/`Notification` API যথেষ্ট।

---

## ২. বর্তমান সিস্টেমের সাথে সংযোগ — কী আছে, কোথায় জোড়া লাগবে

এই মুহূর্তে গার্ডিয়ানের জন্য **দুটি আলাদা, সম্পূর্ণ স্বতন্ত্র** মেসেজিং পাইপলাইন আছে —
কোনোটাই একে অপরের সাথে যুক্ত না, দুটোই শুধু পোলিং (৪৫ সেকেন্ড) দিয়ে চলে:

1. **গার্ডিয়ান রিমাইন্ডার** (`server/src/lib/guardianReminders.js`)
   Admin রিমাইন্ডার লেখে → সময় হলে `dispatchReminder()` প্রতিটি টার্গেটেড গার্ডিয়ানের
   জন্য `guardian_messages`-এ একটা রো লেখে → `GuardianMessengerBubble.tsx` পোল করে দেখায়।

2. **ক্লাস পোস্ট / এসাইনমেন্ট-নোটিশ-বার্তা** (`server/src/lib/classPosts.js`,
   `server/src/routes/assignments.js`)
   শিক্ষক পোস্ট করে → `class_posts`-এ একটা রো লেখে (fan-out **read-time**-এ, guardian_messages-এর
   মতো fan-out **write-time**-এ না) → গার্ডিয়ান পোর্টালের ফিড পোল করে দেখায়।

**পরিকল্পনার মূল সিদ্ধান্ত:** দুটোর জন্য আলাদা পুশ-লজিক লেখা হবে না। একটামাত্র কেন্দ্রীয়
মডিউল — `server/src/lib/guardianPush.js` — বানানো হবে, যেটার একটাই ফাংশন
`notifyGuardians(guardianIds, { title, body, url })`। এই একই ফাংশন দুই জায়গা থেকে ডাকা হবে:

- `guardianReminders.js`-এর `dispatchReminder()`-এর শেষে (guardian_messages রো লেখার ঠিক পরে)
- `classPosts.js`-এর `createPost()`-এর ঠিক পরে, `routes/assignments.js`-এ POST হ্যান্ডলারের ভেতর
  (কারণ `createPost()` টার্গেট গার্ডিয়ান জানে না, শুধু ক্লাস জানে — resolve করার লজিক
  `guardianReminders.js`-এর `resolveTargetGuardianIds()`-এর "class" শাখার মতোই হবে,
  `classPosts.js`-এ একটা ছোট `resolveGuardiansForClass(className)` হেল্পার হিসেবে যোগ হবে)

ফলে **রেজাল্ট প্রকাশ** (`lib/results.js`) বা ভবিষ্যতে অন্য যেকোনো গার্ডিয়ান-মুখী ইভেন্ট চাইলে
একই `notifyGuardians()` কল করেই পুশে যুক্ত হয়ে যাবে — এটা এই ফেজে করা হচ্ছে না (নিচে Phase 6,
ঐচ্ছিক), কিন্তু আর্কিটেকচারটা সেভাবেই সাজানো হচ্ছে যাতে পরে সহজে যোগ করা যায়।

**Admin সাইড বেল (`NotificationBell.tsx`) অপরিবর্তিত থাকবে** — ব্যবহারকারীর সিদ্ধান্ত
অনুযায়ী পুশ শুধু গার্ডিয়ান সাইডেই।

---

## ৩. ফেজ-ভিত্তিক পরিকল্পনা

প্রতিটি ফেজ স্বতন্ত্রভাবে ডেপ্লয়যোগ্য এবং প্রতিটির শেষে `npm run check`। AGENTS.md Rule 4
অনুযায়ী কোনো ফেজই protected path (`auth.js`, `rbac.js`, `backup.js`, SQL migration ফাইল,
`index.js`-এর security block) স্পর্শ করে না — শুধু Phase 1-এ `sql/supabase_schema.sql`-এ
নতুন টেবিল যোগ হবে, যেটা "SQL migration" নিয়মের আওতায় পড়ে, তাই সেটা করার আগে স্পষ্টভাবে
জানিয়ে করা হবে (AGENTS.md-এর শর্ত অনুযায়ী — কাজটা explicitly এই বিষয়েই, তাই অনুমোদিত)।

### Phase 0 — প্রস্তুতি (কোনো কোড না, শুধু ভ্যালু জেনারেট)
- VAPID কীপেয়ার জেনারেট করা হবে (`web-push generate-vapid-keys` কমান্ড দিয়ে, ইনস্টলের পরপরই
  এক-লাইনের স্ক্রিপ্ট চালিয়ে)।
- `.env` / `.env.example`-এ তিনটা নতুন ভ্যারিয়েবল যোগ হবে: `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (একটা `mailto:` ঠিকানা — web-push স্পেকের প্রয়োজনীয়তা)।
- কোনো secret এই পরিকল্পনা ফাইলে বা zip-এ থাকবে না — ব্যবহারকারী নিজে `.env`-এ বসাবেন।

### Phase 1 — DB স্কিমা: `guardian_push_subscriptions`
- **ফাইল:** `server/sql/supabase_schema.sql` (নতুন টেবিল, `if not exists`, বাকি সব টেবিলের
  মতোই idempotent)।
- কলাম: `id`, `"guardianId"` (FK → guardian_accounts, cascade delete), `endpoint` (text,
  unique — একই এন্ডপয়েন্ট দুইবার সাবস্ক্রাইব হলে upsert), `p256dh`, `auth` (push কী-জোড়া,
  ব্রাউজার থেকে আসে), `"userAgent"` (কোন ডিভাইস থেকে সাবস্ক্রাইব হলো, ডিবাগের জন্য),
  `"createdAt"`।
- Index: `"guardianId"`-এর উপর (guardianReminders.js-এর অন্য টেবিলগুলোর প্যাটার্নেই)।
- **Multi-tenant:** `tenantProvision.js` আলাদা কিছু করতে হবে না — যেহেতু নতুন টেবিলও
  `supabase_schema.sql`-এরই অংশ, প্রতিটি tenant schema provision-এর সময় এমনিতেই তৈরি হয়ে
  যাবে (db.js-এর মন্তব্য অনুযায়ী পুরো ফাইলটাই idempotent ভাবে রান হয়)। বিদ্যমান
  tenant-দের জন্য `migrateTenants.js`-এ একটা এন্ট্রি লাগবে যাতে already-provisioned
  স্কিমাগুলোতেও টেবিলটা যোগ হয়ে যায়।

### Phase 2 — কেন্দ্রীয় পুশ-পাঠানোর মডিউল
- **নতুন ফাইল:** `server/src/lib/guardianPush.js`
- `web-push` লাইব্রেরি VAPID ডিটেইল দিয়ে init করবে (env থেকে)।
- `notifyGuardians(guardianIds, { title, body, url })`:
  - প্রতিটি guardianId-এর সব সাবস্ক্রিপশন রো টানবে
  - প্রতিটি সাবস্ক্রিপশনে push পাঠাবে (`guardianReminders.js`-এর `dispatchReminder()`-এর
    মতোই — per-subscription চেষ্টা, একটা ফেইল করলে বাকিগুলো থামবে না)
  - **410/404 (Gone/Not Found)** রেসপন্স এলে সেই সাবস্ক্রিপশন রো নিজে থেকেই DB থেকে মুছে
    দেবে (browser-এর সাবস্ক্রিপশন এক্সপায়ার হয়ে গেলে standard practice — নইলে dead
    সাবস্ক্রিপশনে বারবার চেষ্টা চলতেই থাকবে)
  - অন্য কোনো এরর হলে শুধু লগ করবে, throw করবে না (ঠিক `dispatchReminder()`-এর মতোই
    "never throws per-guardian" নীতি)
- এই ফাইলটাই একমাত্র জায়গা যেখানে `web-push` ইম্পোর্ট হবে — বাকি কোথাও সরাসরি না।

### Phase 3 — সাবস্ক্রাইব/আনসাবস্ক্রাইব API + সার্ভিস ওয়ার্কার + ক্লায়েন্ট প্রম্পট
- **ব্যাকএন্ড (`server/src/routes/guardianAuth.js`-এ নতুন রুট, বিদ্যমান
  `requireActiveGuardianId` গার্ডের সাথেই):**
  - `GET /guardian-auth/push/vapid-public-key` — public key ফেরত দেয় (secret না, ক্লায়েন্টের
    দরকার)
  - `POST /guardian-auth/push/subscribe` — ব্রাউজার থেকে আসা subscription object সেভ/আপডেট
    করে (endpoint দিয়ে upsert)
  - `DELETE /guardian-auth/push/subscribe` — লগআউট বা permission revoke হলে রো মুছে দেয়
- **সার্ভিস ওয়ার্কার (`client/public/sw.js`-এ যোগ, বিদ্যমান cache লজিক অক্ষত রেখে):**
  - `push` ইভেন্ট লিসেনার — এসে যাওয়া payload (title/body/url) দিয়ে
    `self.registration.showNotification(...)` কল করবে
  - `notificationclick` লিসেনার — ক্লিক করলে payload-এর `url`-এ (যেমন
    `/guardian/messages` বা নির্দিষ্ট class-post) ফোকাস/ওপেন করবে
- **ক্লায়েন্ট (নতুন ছোট হুক/কম্পোনেন্ট, `GuardianShell`-এর ভেতরে মাউন্ট হবে —
  `GuardianMessengerBubble.tsx`-এর পাশে, ওটাকে না ছুঁয়ে):**
  - গার্ডিয়ান লগইন করলে একবার browser notification permission চাইবে (ব্রাউজারের নিয়মেই
    এড়ানো যায় না — ব্যবহারকারীকে "Allow" চাপতে হবেই, এটা আগেই জানানো হয়েছিল)
  - অনুমতি পেলে `PushManager.subscribe()` কল করে সাবস্ক্রিপশন অবজেক্ট backend-এ পাঠাবে
  - প্রত্যাখ্যান করলে চুপচাপ বাদ — এক্সিস্টিং পোলিং বাবল আগের মতোই কাজ করতে থাকবে
    (push শুধু অতিরিক্ত স্তর, পোলিং সরানো হচ্ছে না — fallback হিসেবে থেকে যাবে)

### Phase 4 — গার্ডিয়ান রিমাইন্ডারের সাথে সংযোগ
- **ফাইল:** `server/src/lib/guardianReminders.js`
- `dispatchReminder()`-এ `guardian_messages` ইনসার্ট লুপের পরে (একেবারে শেষে, `lastSentAt`
  আপডেটের আগে/পরে) একটা কল: `notifyGuardians(guardianIds, { title, body, url: "/guardian/messages" })`
- এখানে পরিবর্তন সত্যিই ন্যূনতম — একটা ইম্পোর্ট লাইন + একটা ফাংশন কল। বাকি ফাইল অক্ষত।

### Phase 5 — ক্লাস পোস্ট / এসাইনমেন্ট-নোটিশ-বার্তার সাথে সংযোগ
- **ফাইল:** `server/src/lib/classPosts.js` (নতুন হেল্পার `resolveGuardiansForClass(className)`,
  `guardianReminders.js`-এর "class" রেজলভ-কোয়েরির অনুরূপ) + `server/src/routes/assignments.js`
  (POST হ্যান্ডলারে `createPost()`-এর পরে একটা কল)
- পুশে টাইটেল হবে পোস্টের টাইপ অনুযায়ী (এসাইনমেন্ট/নোটিশ/বার্তা — `t.` অনুবাদ কী ইতিমধ্যে
  ক্লায়েন্টে আছে, সার্ভার-সাইড পুশ payload-এ বাংলা স্ট্যাটিক স্ট্রিং ব্যবহার হবে), url হবে
  গার্ডিয়ান পোর্টালের নোটিশ/ফিড পেজ।

### Phase 6 — (ঐচ্ছিক, এই মুহূর্তে শুরু হবে না) রেজাল্ট প্রকাশ
- ব্যবহারকারী চাইলে ভবিষ্যতে `lib/results.js`-এর রেজাল্ট-প্রকাশ ইভেন্টেও একই
  `notifyGuardians()` জোড়া লাগানো যাবে — স্থাপত্য এমনভাবেই সাজানো হচ্ছে যাতে এটা এক ঘণ্টার
  কাজ হয়ে যায়। এই পরিকল্পনায় এটা শুধু নোট করে রাখা হলো, বাস্তবায়ন না।

### Phase 7 — টেস্টিং, ডকুমেন্টেশন, রোলআউট
- ম্যানুয়াল টেস্ট চেকলিস্ট: ফোনে অনুমতি দেওয়া → অ্যাপ/ট্যাব সম্পূর্ণ বন্ধ করা → Admin থেকে
  রিমাইন্ডার পাঠানো (বা শিক্ষক থেকে নোটিশ পোস্ট করা) → ফোনের নোটিফিকেশন ট্রেতে সত্যিই পপ-আপ
  আসছে কিনা, ক্লিক করলে সঠিক পেজে নিচ্ছে কিনা যাচাই
  - **সীমাবদ্ধতা যা টেস্ট করার সময় মনে রাখতে হবে:** Android/Chrome-এ ফুল সাপোর্ট। iOS Safari-এ
    শুধুমাত্র সাইট **হোম স্ক্রিনে PWA হিসেবে ইনস্টল করা থাকলে** (16.4+), ব্রাউজার ট্যাব
    হিসেবে খোলা থাকলে iOS পুশ কাজ করে না — এটা Apple-এর সীমাবদ্ধতা, কোনো কোড দিয়ে এড়ানো
    যায় না।
- `docs/PROJECT_MAP.md`-এ নতুন সেকশন যোগ (push পাইপলাইনের সংক্ষিপ্ত বিবরণ, ভবিষ্যতের এজেন্টদের
  জন্য)।
- `docs/CURRENT_TASK.md` আপডেট (কোন ফেজ পর্যন্ত DONE)।

---

## ৪. প্রতিটি ফেজে কোন ফাইল স্পর্শ হবে (সারসংক্ষেপ)

| ফেজ | নতুন ফাইল | পরিবর্তিত ফাইল |
|---|---|---|
| 0 | — | `.env.example` |
| 1 | — | `server/sql/supabase_schema.sql`, `server/src/migrateTenants.js` |
| 2 | `server/src/lib/guardianPush.js` | `server/package.json` (web-push ডিপেন্ডেন্সি) |
| 3 | নতুন ক্লায়েন্ট হুক/কম্পোনেন্ট (নাম চূড়ান্ত হবে বাস্তবায়নের সময়) | `server/src/routes/guardianAuth.js`, `client/public/sw.js`, `client/src/pages/GuardianShell.tsx` (বা যেখানে বাবল মাউন্ট হয়) |
| 4 | — | `server/src/lib/guardianReminders.js` |
| 5 | — | `server/src/lib/classPosts.js`, `server/src/routes/assignments.js` |
| 7 | — | `docs/PROJECT_MAP.md`, `docs/CURRENT_TASK.md` |

**কোনো ফেজেই বদলাচ্ছে না:** `middleware/auth.js`, `middleware/rbac.js`, `routes/backup.js`,
`index.js`-এর CSP/rate-limit ব্লক, `NotificationBell.tsx` (Admin সাইড), পোলিং-বেসড
`GuardianMessengerBubble.tsx`-এর মূল লজিক (শুধু পাশে নতুন সাবস্ক্রাইব-প্রম্পট বসবে, বাবল
নিজে সরানো হচ্ছে না — push আসতে ৪৫ সেকেন্ড দেরি হলেও পোলিং হিসেবে fallback থাকবে)।

---

## ৫. পরবর্তী পদক্ষেপ

এই ফাইলটা `docs/PUSH_NOTIFICATION_PLAN.md` হিসেবে প্রজেক্টে বসবে। শুরু করতে চাইলে বলবে —
"Phase 1 শুরু করো" — তাহলে সেই ফেজটুকু একা বাস্তবায়ন করে, `npm run check` পাস করিয়ে,
zip + CMD দেওয়া হবে। একবারে সব ফেজ একসাথে করা হবে না (AGENTS.md Rule 1)।
