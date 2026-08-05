# BUSINESS_READINESS_ROADMAP.md — মাঠে নামানোর আগের কাজ (৮ ধাপ)

এই ফাইলটা 2026-08-05 তারিখের একটা honest business-readiness review থেকে
তৈরি হয়েছে (দেখুন `docs/CURRENT_TASK.md`-এর সাথে সংযুক্ত queue এন্ট্রি)।
প্রতিটা ধাপ **আলাদাভাবে** ডেলিভার করার জন্য ডিজাইন করা — একটার কাজ শেষ না
হওয়া পর্যন্ত পরেরটা শুরু হবে না, এবং প্রতিটা ধাপের শেষে `npm run check`
পাস করতে হবে (AGENTS.md-এর নিয়ম অনুযায়ী)।

**স্কোপের বাইরে (ইচ্ছাকৃতভাবে, এখনই না — ব্যবহারকারীর সিদ্ধান্ত অনুযায়ী):**
- বাস্তব টাকা লেনদেন যুক্ত যেকোনো ধাপ (প্ল্যাটফর্ম-লেভেল SMS প্রোভাইডারের
  সাথে production চুক্তি, বা কোনো নির্দিষ্ট প্রতিষ্ঠানের bKash/Nagad
  merchant/agent অ্যাকাউন্ট দিয়ে আসল payment execute করা) — **কোনো এজেন্ট
  নিজে থেকে শুরু করবে না।** sandbox/architecture/self-service UI পর্যন্ত
  কাজ করা যাবে (2026-08-05 ব্যবহারকারীর সিদ্ধান্ত অনুযায়ী, দেখুন Phase 8
  নিচে) — কিন্তু প্রকৃত টাকা সরানোর কোড লাইভ করার আগে ব্যবহারকারীর স্পষ্ট
  অনুমতি লাগবে।

---

## Phase 1 — Payments cascade fix (আর্থিক রেকর্ড সুরক্ষা) ✅ সম্পন্ন (2026-08-05)
**অগ্রাধিকার: সবচেয়ে বেশি, সবচেয়ে ছোট কাজ, প্রথমে এটাই করা উচিত।**

- সমস্যা: `server/sql/supabase_schema.sql`-এ `payments` টেবিলের `studentId`
  কলাম এখনো `references students(id) on delete cascade` — কোনো ছাত্র
  ডিলিট হলে তার সব রশিদ/পেমেন্ট রেকর্ড **সম্পূর্ণ মুছে যায়**। `income`
  টেবিলে এটা আগেই `on delete set null`-এ ঠিক করা হয়েছে (দেখুন সেই
  টেবিলের উপরের কমেন্ট) — `payments`-এ একই প্যাটার্ন প্রয়োগ করা বাকি।
- কাজ:
  1. নতুন migration statement যোগ (schema ফাইলে `alter table` — বিদ্যমান
     কনভেনশন অনুসরণ করে, `results`/`income`-এর মতো): FK constraint ড্রপ
     করে `on delete set null` দিয়ে পুনরায় তৈরি। **এটা
     `server/sql/` — AGENTS.md-এর protected path, তাই কাজ শেষে ঠিক কী
     বদলাল আর কেন সেটা স্পষ্ট করে জানাতে হবে (নিয়ম অনুযায়ী)।**
  2. `studentId` কলাম nullable করতে হবে (`not null` বাদ) — `income`
     টেবিলে যেমন আছে।
  3. `server/src/routes/payments.js`, `server/src/routes/students.js`
     (ডিলিট এন্ডপয়েন্ট) — কোথাও `payments.studentId` NOT NULL ধরে কোনো
     কোড লেখা আছে কিনা চেক করে দরকার হলে null-safe করা (যেমন রিসিট
     লিস্টে "ছাত্র মুছে ফেলা হয়েছে" fallback দেখানো, `income`-এ যেভাবে
     হ্যান্ডেল হয় সেভাবেই)।
  4. `payments` টেবিলে ইতিমধ্যে denormalized `student`/`roll` কলাম আছে
     (স্ন্যাপশট হিসেবে) — তাই ছাত্র ডিলিট হয়ে গেলেও রিসিটে নাম/রোল
     ঠিকই দেখা যাবে, শুধু লিংকটা (`studentId`) `null` হয়ে যাবে।
  5. `npm run check` চালানো + ম্যানুয়াল স্মোক-টেস্ট: একজন টেস্ট-ছাত্র
     তৈরি করে তার একটা পেমেন্ট রেকর্ড করে, তারপর ছাত্রটা ডিলিট করে
     নিশ্চিত করা যে পেমেন্ট রেকর্ডটা `studentId = null` নিয়ে টিকে থাকছে,
     মুছে যাচ্ছে না।

## Phase 2 — Email notification চ্যানেল সেটআপ ও সম্প্রসারণ
**ব্যবহারকারীর সিদ্ধান্ত: এসএমএসের আগে ইমেইলটা এখনই সেট করা হবে।**

- বর্তমান অবস্থা: `server/src/lib/mailer.js` (Resend API) শুধু
  `server/src/routes/auth.js`-এর password-reset ফ্লোতে ব্যবহার হয়।
  `server/src/lib/notifications.js` সম্পূর্ণ in-app (ডাটাবেজ-only,
  bell-icon) — কোনো ইমেইল পাঠায় না।
- কাজ:
  1. Production Resend অ্যাকাউন্ট/ডোমেইন ভেরিফিকেশন যাচাই (deployment-side
     কাজ, কোডের অংশ না — `RESEND_API_KEY` ও `EMAIL_FROM` env var বসানো)।
  2. `lib/notifications.js`-এর `createNotification()`-এ একটা optional
     email-dispatch hook যোগ করা — নতুন `lib/notificationEmail.js` ফাইলে
     (existing pattern অনুসরণ, mailer.js-কে wrap করে) যাতে নির্দিষ্ট
     notification type-গুলোর জন্য (fee due reminder, admission
     approved/rejected, result published) ইমেইলও পাঠানো যায়, শুধু
     in-app বেল না।
  3. Guardian-এর ইমেইল না থাকলে silently skip (fallback — কোনো error
     ছুঁড়বে না, শুধু in-app notification-ই থাকবে)।
  4. এই phase-এ **কোনো নতুন notification-trigger তৈরি করা হবে না** —
     শুধু existing trigger points-এ ইমেইল-চ্যানেল যোগ করা (scope
     minimal রাখা, AGENTS.md Rule 1)।
  5. `npm run check` + ম্যানুয়াল টেস্ট: একটা টেস্ট নোটিফিকেশন ট্রিগার
     করে ইনবক্সে ইমেইল পৌঁছাচ্ছে কিনা যাচাই।

## Phase 3 — নোটিশ/অ্যাসাইনমেন্ট ব্রডকাস্ট: স্টাফ-সাইড UI ✅ সম্পন্ন (2026-08-05)
**এটা আগের কথোপকথনে ধরা পড়া পুরনো ফাঁক — ব্যাকএন্ড রেডি, ফ্রন্টএন্ড নেই।**
**নোট: Phase 2 (ইমেইল নোটিফিকেশন) ইচ্ছাকৃতভাবে এখনই স্কিপ করা হয়েছে
(Resend ফ্রি টায়ারের ১০০ ইমেইল লিমিটের কারণে) — ব্যবহারকারী নিজে জানাবেন
কবে সেটা শুরু করতে হবে। এই ধাপ (Phase 3) স্বতন্ত্রভাবে সম্পন্ন হয়েছে,
Phase 2-এর উপর নির্ভর করে না। বিস্তারিত ডিফ `docs/CURRENT_TASK.md`-এ।**

- বর্তমান অবস্থা: `server/src/routes/assignments.js` +
  `server/src/lib/classPosts.js` সম্পূর্ণ কাজ করে (টিচার/অ্যাডমিন নিজের
  নির্ধারিত ক্লাসে পোস্ট পাঠাতে পারার API আছে), আর গার্ডিয়ান সাইডে পড়ার
  UI-ও আছে (`client/src/pages/guardian/GuardianFeed.tsx`)। কিন্তু
  Admin/Teacher প্যানেলে পোস্ট **লেখার** কোনো পেজ/মেনু-আইটেম নেই।
- কাজ:
  1. নতুন module `client/src/modules/ClassPosts.tsx` (বা এই কাজের জন্য
     উপযুক্ত নাম) — টিচারের নিজের assigned class(es)-এর জন্য
     (`teacherScope.js`-এর existing স্কোপিং প্যাটার্ন পুনর্ব্যবহার) নোটিশ/
     পোস্ট লেখা ও পাঠানোর ফর্ম, আর পাঠানো পোস্টগুলোর তালিকা।
  2. `App.tsx`-এ `lazy()` দিয়ে নতুন route যোগ + Sidebar-এ মেনু-আইটেম।
  3. RBAC: `server/src/config/roles.js`-এ ইতিমধ্যে permission আছে কিনা
     চেক করা (`assignments`-এর জন্য) — না থাকলে যোগ করা এবং
     `npm run sync:roles` দিয়ে client copy রিজেনারেট হবে (হাতে এডিট না,
     AGENTS.md Rule 3)।
  4. Design System মেনে (`.ds-*` ক্লাস, নতুন `style={{...}}` না)।
  5. `npm run check` + ম্যানুয়াল স্মোক-টেস্ট: টিচার হিসেবে লগইন করে একটা
     পোস্ট পাঠিয়ে, তারপর সেই ক্লাসের একজন গার্ডিয়ান হিসেবে লগইন করে
     `GuardianFeed.tsx`-এ সেটা দেখা যাচ্ছে কিনা যাচাই।

## Phase 4 — Legal পাতা (Terms of Service + Privacy Policy) ✅ সম্পন্ন (2026-08-05)
- বর্তমান অবস্থা: প্রজেক্টে কোনো Terms/Privacy পেজ নেই — ছাত্রের
  ব্যক্তিগত ডাটা (জন্মনিবন্ধন, ঠিকানা, অভিভাবকের তথ্য) সংরক্ষণ করা
  সফটওয়্যারে এটা বাস্তব ক্লায়েন্টের কাছে বিক্রির আগে থাকা জরুরি।
- কাজ:
  1. `client/src/pages/TermsOfService.tsx` ও `PrivacyPolicy.tsx` — পাবলিক,
     লগইন ছাড়াই পড়া যাবে এমন static/CMS-lite পেজ (বিদ্যমান পাবলিক পেজ
     প্যাটার্ন অনুসরণ, `About.tsx`-এর কাঠামোর কাছাকাছি)।
  2. `App.tsx`-এ route + Footer-এ লিংক (`PublicFooter`/সমতুল্য
     component-এ, যদি একটা কমন footer component থাকে)।
  3. স্ব-নিবন্ধন ফ্লো (`publicSignup.js`/`PublicSignup`-জাতীয় ফ্রন্টএন্ড
     পেজ)-এ একটা checkbox — "আমি শর্তাবলী মেনে নিচ্ছি" — সাইনআপ সম্পন্ন
     করার আগে বাধ্যতামূলক accept।
  4. বিষয়বস্তু (আইনি ভাষা) ব্যবহারকারী নিজে বা একজন আইনজীবীর কাছ থেকে
     রিভিউ করিয়ে নেওয়া উচিত — এই phase কোডের কাঠামো তৈরি করবে,
     draft টেক্সট বসানো হবে placeholder/starting-point হিসেবে, চূড়ান্ত
     আইনি ভাষা না।
  5. `npm run check`।

## Phase 5 — Core business-logic-এর জন্য automated test coverage ✅ সম্পন্ন (2026-08-05)
- বর্তমান অবস্থা: `server/src/lib/__tests__/` ও
  `server/src/routes/__tests__/`-এ মাত্র ৪টা ছোট টেস্ট ফাইল। ফি হিসাব,
  attendance edge case, RBAC edge case-এর কোনো কভারেজ নেই।
- কাজ (ধাপে ধাপে, একবারে সব না — এই ধাপটা নিজেই ২-৩ sub-part-এ ভাগ করা
  যেতে পারে যদি বড় মনে হয়):
  1. Payments/fees হিসাব লজিকের টেস্ট (discount, admission fee, flagged
     payment conflict-resolution — `payments.js`-এর isConflict logic,
     এটা বেশ জটিল, টেস্ট না থাকা ঝুঁকিপূর্ণ)।
  2. `teacherScope.js`-এর existing টেস্ট সম্প্রসারণ — multi-class teacher,
     no-class teacher edge case।
  3. RBAC permission matrix-এর জন্য একটা টেস্ট (প্রতিটা role ঠিক রুটগুলোই
     অ্যাক্সেস করতে পারছে/পারছে না)।
  4. `npm run check` (test runner ইতিমধ্যে `npm run test:server`-এর
     ভেতরে wired, নতুন টেস্ট ফাইল যোগ করলেই এটা কভার করবে)।

## Phase 6 — Plan-tiering পুনর্গঠন (মনিটাইজেশন কাঠামো) ✅ সম্পন্ন — ব্যাকএন্ড + ফ্রন্টএন্ড উভয়ই (2026-08-05, বিস্তারিত: CURRENT_TASK.md)
- বর্তমান অবস্থা: `server/src/config/planFeatures.js`-এ মাত্র ২টা প্ল্যান
  (basic/pro), একটাই ফিচার-গেট (custom domain)। বিক্রির জন্য দুর্বল
  কাঠামো — দাম ভিন্ন করার স্পষ্ট কারণ নেই কাস্টমারের কাছে।
- কাজ:
  1. ব্যবহারকারীর সাথে বসে ঠিক করা কোন ফিচার কোন প্ল্যানে যাবে (এই
     ধাপ শুরুর আগে একটা ছোট আলোচনা দরকার — ধরে নেওয়া উচিত না)। সম্ভাব্য
     candidate: গার্ডিয়ান পোর্টাল ইউজার-সংখ্যা সীমা, রিপোর্ট
     এক্সপোর্ট (PDF/Excel), অফলাইন সিঙ্ক, ভবিষ্যতে SMS/bKash (তখন যোগ
     হবে)।
  2. `PLAN_FEATURES`-এ নতুন কী যোগ + client-side lock/unlock UI (এই
     প্যাটার্ন আগে থেকেই আছে `customDomain`-এর জন্য, একই ভাবে বিস্তৃত
     করা)।
  3. `npm run check`।

## Phase 7 — মাল্টি-ব্রাঞ্চ সাপোর্ট (স্কোপিং আলোচনা প্রয়োজন)
- একই মাদ্রাসার একাধিক শাখা এক অ্যাকাউন্ট থেকে পরিচালনার সুবিধা — বড়
  মাদ্রাসা গ্রুপগুলোর কাছে বিক্রির সময় শক্তিশালী যুক্তি।
- **এটা multi-tenant architecture-এর একটা বড় সংযোজন** (নতুন
  স্কিমা-সম্পর্ক, রিপোর্টিং aggregate করার প্রশ্ন) — শুরু করার আগে
  একটা আলাদা design আলোচনা দরকার (এই roadmap শুধু প্লেসহোল্ডার হিসেবে
  রাখল, বিস্তারিত স্কোপ Phase 6-এর পরে আলোচনা করে ঠিক করা ভালো)।

## Phase 8 — SMS ওয়ালেট + bKash/Nagad self-service কানেক্ট (বিস্তারিত, ৭ সাব-ফেজ)
**সিদ্ধান্ত (2026-08-05, ব্যবহারকারী):** পুরো সিস্টেম (backend + frontend)
এখনই সম্পূর্ণ বানিয়ে রাখা হবে, sandbox দিয়ে টেস্ট করা পর্যন্ত — যাতে যেদিন
আসল SMS প্রোভাইডার/বিকাশ বিজনেস অ্যাকাউন্ট রেডি হয়, শুধু env var/production
credential বসালেই লাইভ হয়ে যায়। **দুইটা আলাদা সাবসিস্টেম, একসাথে গুলিয়ে
ফেলা যাবে না:**

1. **SMS ওয়ালেট** — প্ল্যাটফর্ম-লেভেল একটাই SMS প্রোভাইডার অ্যাকাউন্ট থাকবে
   (যেমন কোনো বাংলাদেশি bulk-SMS reseller API)। প্রতিষ্ঠান নিজের ওয়ালেটে
   টাকা লোড করবে (balance), প্রতিটা SMS পাঠানোর সময় সেই ব্যালেন্স থেকে কাটা
   হবে। ব্যালেন্স ০ হলে SMS পাঠানো বন্ধ হয়ে যাবে (silent skip, error না)।
2. **bKash/Nagad Payment Gateway (Bring-Your-Own)** — প্রতিটা প্রতিষ্ঠান
   **নিজের** এজেন্ট/মার্চেন্ট অ্যাকাউন্টের credential (App Key/Secret,
   ইউজারনেম/পাসওয়ার্ড বা ওয়ালেট নম্বর) নিজের Settings পেজ থেকে সাবমিট
   করবে — প্ল্যাটফর্মকে কোনো নিজস্ব বিজনেস অ্যাকাউন্ট রাখতে হবে না এই
   অংশের জন্য। সাবমিট করলেই ব্যাকএন্ড validate (grant-token কল) করে
   কানেক্টেড দেখাবে। এই গেটওয়ে গার্ডিয়ানদের কাছ থেকে ফি কালেকশনে ব্যবহার
   হবে, এবং ইচ্ছা করলে প্রতিষ্ঠান নিজের SMS ওয়ালেট টপ-আপেও এই একই কানেক্টেড
   গেটওয়ে ব্যবহার করতে পারবে।

**AGENTS.md Rule 1 (one task at a time) মানার জন্য এই Phase-টা ৭টা স্বাধীন
সাব-ফেজে ভাগ, প্রতিটার শেষে `npm run check` + ম্যানুয়াল স্মোক-টেস্ট, একটা
শেষ না হলে পরেরটা শুরু হবে না:**

### 8A — DB স্কিমা: SMS wallet + ledger
- `server/sql/supabase_schema.sql`-এ নতুন টেবিল যোগ (protected path,
  AGENTS.md Rule 4 — কী বদলাল স্পষ্ট জানাতে হবে): `sms_wallets`
  (institution-প্রতি এক রো — `balance_taka`, `updatedAt`), `sms_transactions`
  (ledger — `type`: `topup`/`deduct`, `amount`, `smsCount`, `reference`,
  `createdAt`; tenant isolation বাকি টেবিলের মতোই `search_path` দিয়ে)।
- প্রতিটা প্রতিষ্ঠান তৈরি হওয়ার সময় (tenantProvision.js) ব্যালেন্স ০ দিয়ে
  একটা ওয়ালেট রো অটো-তৈরি হবে।

### 8B — `smsSender.js` wrapper + wallet-deduct লজিক
- `server/src/lib/mailer.js`-এর প্যাটার্নে (single-responsibility, env-var
  driven, `SMS_PROVIDER_API_KEY` না থাকলে no-op) নতুন `smsSender.js`।
- পাঠানোর আগে wallet balance চেক — অপ্রতুল হলে SMS স্কিপ + একটা in-app
  notification অ্যাডমিনকে ("SMS ব্যালেন্স শেষ, রিচার্জ করুন"), এরর থ্রো
  করবে না (Phase 2 email hook-এর fallback প্যাটার্নের মতো)।
- sandbox-এ টেস্ট: বেশিরভাগ বাংলাদেশি bulk-SMS reseller (Alpha SMS,
  MimSMS, BulkSMSBD ইত্যাদি) নিজেদের API-তে একটা ফ্রি টেস্ট/ট্রায়াল
  ক্রেডিট দেয় রেজিস্ট্রেশনে — কোনটা ব্যবহার হবে সেটা এই সাব-ফেজ শুরুর
  আগে ব্যবহারকারীর সাথে ঠিক করে নিতে হবে (ধরে নেওয়া হবে না)।

### 8C — Notification hook-এ SMS চ্যানেল যোগ
- `lib/notifications.js`-এর `createNotification()`-এ Phase 2-এর মতোই
  একটা SMS-dispatch hook (fee due reminder, result published) — শুধু
  ইনস্টিটিউশনের plan-এ `sms` ফিচার true এবং ওয়ালেট ব্যালেন্স > 0 হলে।

### 8D — ফ্রন্টএন্ড: "SMS সেবা" সেটিংস পেজ (প্রতিষ্ঠান-অ্যাডমিন সাইড)
- বর্তমান ব্যালেন্স, লেনদেনের হিস্টোরি টেবিল, কোন নোটিফিকেশন-টাইপে SMS
  চালু/বন্ধ তার টগল। "টাকা লোড করুন" বাটন প্রথমে ম্যানুয়াল ফ্লো-তে যাবে
  (bKash ব্যক্তিগত নম্বরে টাকা পাঠিয়ে Trx ID লিখে সাবমিট → Super-Admin
  প্যানেল থেকে ভেরিফাই করে ব্যালেন্স ম্যানুয়ালি ক্রেডিট) — 8F কমপ্লিট
  হওয়ার পর এটা অটোমেটিক হয়ে যাবে।
- `App.tsx`-এ `lazy()` route + design system (`.ds-*`, নতুন `style={{...}}`
  না) + `PLAN_FEATURES.sms`/`FEATURE_META` এন্ট্রি সচল করা (এখন `false`
  আছে, এই সাব-ফেজে `premium`-এর জন্য `true` করা হবে যেহেতু মডিউলটা এখন
  বাস্তবে বানানো হচ্ছে)।

### 8E — bKash/Nagad self-connect (প্রতিষ্ঠানের নিজের এজেন্ট/মার্চেন্ট অ্যাকাউন্ট)
- নতুন encrypted টেবিল `institution_payment_gateways` — `backupEncryption.js`
  (AES-256-GCM) একই প্যাটার্নে নতুন env key (`GATEWAY_CREDENTIAL_KEY`)
  দিয়ে ক্রেডেনশিয়াল এনক্রিপ্ট করে রাখা, প্লেইনটেক্সটে না।
- `bkashGateway.js` wrapper — App Key/Secret/Username/Password নিয়ে
  grant-token কল করে ভ্যালিডেট করবে; সফল হলে `connected = true`।
- Settings পেজে ফর্ম: প্রতিষ্ঠান-অ্যাডমিন নিজের এজেন্ট/মার্চেন্ট তথ্য বসিয়ে
  "কানেক্ট করুন" চাপবে → ভ্যালিডেশনের রেজাল্ট সাথে সাথে দেখাবে (সফল/ভুল
  তথ্য)। Nagad-এর API শেপ ভিন্ন — এটা bKash সফল হওয়ার পর আলাদা সাব-ফেজ
  হিসেবে যোগ করাই ভালো (স্কোপ ছোট রাখা, Rule 1)।

### 8F — গার্ডিয়ান-facing bKash পেমেন্ট ফ্লো + SMS ওয়ালেট অটো-টপ-আপ
- 8E-তে কানেক্টেড থাকলে Guardian Portal-এর ফি-পেমেন্ট পেজে "বিকাশে
  পরিশোধ করুন" অপশন — create→execute→callback রুট, সফল হলে
  `payments`/`income`-এ রেকর্ড।
- প্রতিষ্ঠান চাইলে একই কানেক্টেড গেটওয়ে দিয়ে নিজের SMS ওয়ালেট টপ-আপও
  করতে পারবে (8D-এর ম্যানুয়াল ফ্লো এখানে অটোমেটিক হয়ে যায়)।

### 8G — Sandbox টেস্টিং (সম্পূর্ণ ফ্রি, কোনো বিজনেস অ্যাকাউন্ট ছাড়াই)
- bKash-এর পাবলিক sandbox (developer.bka.sh) দিয়ে টেস্ট ওয়ালেট নম্বর,
  ফিক্সড OTP/PIN ব্যবহার করে পুরো ফ্লো (grant token → create payment →
  execute → query) verify করা যায়, আসল টাকা কাটে না।
- QA চেকলিস্ট: ভুল credential দিয়ে কানেক্ট করলে reject হচ্ছে কিনা, সঠিক
  sandbox credential-এ কানেক্ট হচ্ছে কিনা, ব্যালেন্স ০ অবস্থায় SMS ঠিকমতো
  স্কিপ হচ্ছে কিনা (silent, no crash), টপ-আপের পর পরের SMS ঠিকমতো
  পাঠাচ্ছে কিনা, sandbox পেমেন্ট callback সঠিকভাবে `payments` টেবিলে
  বসছে কিনা।
- নোট (2026-08-05 অনুসন্ধান): বিকাশের ডেভেলপার পোর্টালে নতুন নিবন্ধন
  সাময়িকভাবে বন্ধ থাকার একটা রিপোর্ট পাওয়া গেছে — 8E শুরুর আগে
  developer.bka.sh-এ গিয়ে নিজে যাচাই করে নেওয়া ভালো, কারণ এটা বদলে
  যেতে পারে।

**সাবধানতা:** 8A–8D (SMS wallet কাঠামো, UI, ম্যানুয়াল টপ-আপ) পুরোপুরি
আজই শুরু করা যায় — কোনো বাইরের অ্যাকাউন্ট লাগে না শুধু SMS প্রোভাইডার
বেছে নেওয়া ছাড়া। 8E–8G (bKash sandbox কানেকশন) sandbox অ্যাকাউন্ট
(ফ্রি, নিজে রেজিস্টার করা যায়) লাগবে। **আসল টাকা** নড়াচড়া করা (production
credential দিয়ে লাইভ পেমেন্ট) — এই ৭ ধাপের কোনোটাতেই হবে না; সেটার জন্য
আলাদা, পরবর্তী স্পষ্ট অনুমতি লাগবে।

---

## এই রোডম্যাপ কীভাবে ব্যবহার করবেন
প্রতিটা phase শুরু করার আগে `docs/CURRENT_TASK.md` চেক/আপডেট করুন — সেই
ফাইলের template অনুযায়ী "Task: BUSINESS_READINESS_ROADMAP Phase N" নাম
দিয়ে IN_PROGRESS এন্ট্রি রাখুন, যাতে সেশন মাঝপথে বন্ধ হলেও পরের এজেন্ট
ঠিক জায়গা থেকে চালিয়ে যেতে পারে (এই প্রজেক্টে ইতিমধ্যে এই প্যাটার্নটাই
class/জামাত hierarchy কাজে ব্যবহার হয়েছে)।
