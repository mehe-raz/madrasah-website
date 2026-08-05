# BUSINESS_READINESS_ROADMAP.md — মাঠে নামানোর আগের কাজ (৮ ধাপ)

এই ফাইলটা 2026-08-05 তারিখের একটা honest business-readiness review থেকে
তৈরি হয়েছে (দেখুন `docs/CURRENT_TASK.md`-এর সাথে সংযুক্ত queue এন্ট্রি)।
প্রতিটা ধাপ **আলাদাভাবে** ডেলিভার করার জন্য ডিজাইন করা — একটার কাজ শেষ না
হওয়া পর্যন্ত পরেরটা শুরু হবে না, এবং প্রতিটা ধাপের শেষে `npm run check`
পাস করতে হবে (AGENTS.md-এর নিয়ম অনুযায়ী)।

**স্কোপের বাইরে (ইচ্ছাকৃতভাবে, এখনই না — ব্যবহারকারীর সিদ্ধান্ত অনুযায়ী):**
- SMS gateway integration — SIM/SMS প্রোভাইডার অ্যাকাউন্ট এখনো সেটআপ হয়নি।
  **কোনো এজেন্ট যেন এই কাজ নিজে থেকে শুরু না করে** — ব্যবহারকারী নিজে
  জানাবেন কবে শুরু করতে হবে। Phase 8-এ শুধু architecture note রাখা আছে,
  কোড না।
- bKash/Nagad/Rocket অনলাইন পেমেন্ট গেটওয়ে — বিজনেস অ্যাকাউন্ট ও অফিশিয়াল
  API এখনো নেওয়া হয়নি। একই কারণে এখনই শুরু না করার নির্দেশ।

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

## Phase 6 — Plan-tiering পুনর্গঠন (মনিটাইজেশন কাঠামো)
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

## Phase 8 — SMS + bKash/Nagad আর্কিটেকচার নোট (কোড না, শুধু প্রস্তুতি)
**এই ফেজ কার্যকর করা যাবে না যতক্ষণ না ব্যবহারকারী নিজে জানান যে SIM/SMS
প্রোভাইডার অ্যাকাউন্ট বা বিকাশ বিজনেস API রেডি।**
- যখন প্রস্তুত হবে তখনকার জন্য শুধু নোট: `mailer.js` যেভাবে Resend-কে
  wrap করে (single responsibility, env-var driven, no-op if unset)
  ঠিক একই প্যাটার্নে `smsSender.js` ও `bkashGateway.js` বানানো হবে —
  যাতে বাকি কোড (`notifications.js`, `payments.js`) থেকে শুধু একটা
  ফাংশন কল হয়, প্রোভাইডার-নির্দিষ্ট ডিটেইল আলাদা থাকে। এখন কোনো কোড
  লেখার দরকার নেই।

---

## এই রোডম্যাপ কীভাবে ব্যবহার করবেন
প্রতিটা phase শুরু করার আগে `docs/CURRENT_TASK.md` চেক/আপডেট করুন — সেই
ফাইলের template অনুযায়ী "Task: BUSINESS_READINESS_ROADMAP Phase N" নাম
দিয়ে IN_PROGRESS এন্ট্রি রাখুন, যাতে সেশন মাঝপথে বন্ধ হলেও পরের এজেন্ট
ঠিক জায়গা থেকে চালিয়ে যেতে পারে (এই প্রজেক্টে ইতিমধ্যে এই প্যাটার্নটাই
class/জামাত hierarchy কাজে ব্যবহার হয়েছে)।
