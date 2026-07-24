# Multi-Tenant SaaS রূপান্তর — ৬ ভাগের পরিকল্পনা

লক্ষ্য: একটাই কোডবেস/সার্ভার দিয়ে অনেকগুলো মাদ্রাসা (প্রতিষ্ঠান)-কে সার্ভিস দেওয়া, প্রতিটির ডেটা
সম্পূর্ণ আলাদা (schema-per-tenant), আর সবকিছু আপনি এক জায়গা (Super-Admin প্যানেল) থেকে
নিয়ন্ত্রণ করবেন।

## ৬টি ভাগ

| # | ভাগ | কাজ | স্ট্যাটাস |
|---|-----|-----|-----------|
| ১ | **Central Registry Database** | কোন কোন প্রতিষ্ঠান আছে, তাদের schema-নাম, status (trial/active/suspended) রাখার মাস্টার টেবিল | ✅ সম্পন্ন (এই ধাপ) |
| ২ | **Schema Provisioning System** | নতুন প্রতিষ্ঠান যোগ হলে স্বয়ংক্রিয়ভাবে তার জন্য নতুন schema + ১৭টা টেবিল + ডিফল্ট অ্যাডমিন তৈরি | ✅ সম্পন্ন (এই ধাপ) |
| ৩ | **Tenant Resolution Middleware** | রিকোয়েস্ট এলে সাবডোমেইন/কোড দেখে সঠিক schema-তে DB কানেকশন সেট করা (`pg.js`/`db.js` পরিবর্তন) | ✅ সম্পন্ন |
| ৪ | **Auth/JWT আপডেট** | টোকেনে `institution_code` যোগ, লগইনের সময় প্রতিষ্ঠান যাচাই, সাসপেন্ড থাকলে লগইন ব্লক | ✅ সম্পন্ন (এই ধাপ) |
| ৫ | **Super-Admin প্যানেল** | ওয়েব UI দিয়ে প্রতিষ্ঠান যোগ/সাসপেন্ড/স্ট্যাটাস দেখা (এখন পর্যন্ত এটা শুধু CLI দিয়ে করা যায়) | ✅ সম্পন্ন (এই ধাপ) |
| ৬ | **Billing + Migration Tooling** | সাবস্ক্রিপশন/পেমেন্ট, মেয়াদ শেষে অটো-সাসপেন্ড, সব tenant schema-তে একসাথে migration চালানোর স্ক্রিপ্ট | ⏳ বাকি |

প্রতিটা ভাগ আলাদাভাবে সম্পন্ন করা হবে, প্রতিটার পরে: (ক) পরিবর্তিত/নতুন ফাইলের লিস্ট, (খ) হালনাগাদ
প্রজেক্টের zip, (গ) git-এ push করার কমান্ড — এভাবে দেওয়া হবে।

---

## ভাগ ১ — Central Registry Database (এই ধাপে যা হয়েছে)

**এই ধাপ বিদ্যমান অ্যাপের কোনো ফাইল পরিবর্তন করেনি — শুধু নতুন, স্বতন্ত্র ফাইল যোগ হয়েছে।**
তাই এখনো বর্তমান single-tenant অ্যাপ ঠিক আগের মতোই চলবে; registry শুধু পাশে বসে থাকবে, ব্যবহার
না করা পর্যন্ত কোনো প্রভাব ফেলবে না।

### নতুন ফাইল

- `server/sql/registry_schema.sql` — `registry` স্কিমা, ৩টা টেবিল:
  - `registry.institutions` — প্রতিষ্ঠানের নাম, `code` (সাবডোমেইন), `schema_name`
    (tenant_xxx), `status` (trial/active/suspended/cancelled), plan, ট্রায়াল/সাবস্ক্রিপশন
    মেয়াদ।
  - `registry.platform_admins` — আপনার/আপনার টিমের সুপার-অ্যাডমিন লগইন (ভাগ ৫-এ ব্যবহৃত হবে)।
  - `registry.audit_logs` — কোন প্রতিষ্ঠান কবে তৈরি/সাসপেন্ড হলো তার ট্র্যাক।
- `server/src/registryDb.js` — registry টেবিলগুলোর সাথে কথা বলার ফাংশন:
  `createInstitution`, `getInstitutionByCode`, `listInstitutions`, `updateStatus`,
  `updateSubscription`, `isAccessAllowed` (ভাগ ৪-এ auth middleware এটা কল করে ঠিক করবে
  লগইন করতে দেওয়া হবে কিনা)।
- `server/scripts/registry-cli.js` — টার্মিনাল থেকে ব্যবহারের জন্য (ভাগ ৫-এ ওয়েব প্যানেল না হওয়া
  পর্যন্ত এটাই একমাত্র উপায় প্রতিষ্ঠান যোগ করার):
  ```
  node server/scripts/registry-cli.js init
  node server/scripts/registry-cli.js create "Al-Madina Madrasah" al-madina admin@almadina.com 01700000000
  node server/scripts/registry-cli.js list
  node server/scripts/registry-cli.js status al-madina suspended
  ```

### পরিবর্তিত ফাইল

- `.env.example` — নতুন ঐচ্ছিক ভেরিয়েবল `REGISTRY_DATABASE_URL`-এর ব্যাখ্যা যোগ (সেট না করলে
  registry বর্তমান `DATABASE_URL`-এর মধ্যেই আলাদা schema হিসেবে থাকবে, নতুন কোনো DB লাগবে না)।

### কেন এভাবে

- সাবডোমেইন কোড (`code`) আর Postgres schema-নাম (`schema_name`) আলাদা রাখা হয়েছে কারণ
  সাবডোমেইনে হাইফেন (`al-madina`) চলে, কিন্তু Postgres schema identifier-এ হাইফেন চলে না —
  তাই ভেতরে ভেতরে `tenant_al_madina` নামে schema হবে, বাইরে `al-madina.yourapp.com` দেখাবে।
- `isAccessAllowed()` কোনো ডেটা পরিবর্তন করে না, শুধু true/false বলে দেয় — সিদ্ধান্ত (সাসপেন্ড
  করা, প্ল্যান বদলানো) সবসময় আপনার/CLI-র হাতে থাকে, স্বয়ংক্রিয়ভাবে কিছু বদলে যায় না।

### পরের ধাপ (ভাগ ২)

`registry.institutions`-এ একটা প্রতিষ্ঠান তৈরি হওয়ার পর, তার জন্য প্রকৃত `tenant_xxx` schema-তে
১৭টা টেবিল (students, payments, users ইত্যাদি) বসানোর script — এটাই ভাগ ২।

---

## ভাগ ২ — Schema Provisioning System (এই ধাপে যা হয়েছে)

**এই ধাপও বিদ্যমান কোনো ফাইল ভাঙেনি।** `db.js`/`pg.js` এখনও শুধু `public` schema-তেই কথা বলে —
এই ধাপ শুধু নতুন `tenant_xxx` schema তৈরির ক্ষমতা যোগ করেছে, বর্তমান single-tenant অ্যাপের
কানেকশন-লজিক এখনো অপরিবর্তিত (সেটা ভাগ ৩-এ হবে)।

### নতুন ফাইল

- `server/src/tenantProvision.js` — মূল প্রোভিশনিং লজিক:
  - `provisionTenantSchema(schemaName, { adminName, adminEmail, adminPassword })` — একটা
    ট্রানজ্যাকশনে: schema তৈরি করে → `search_path` সেই schema-তে সেট করে → বিদ্যমান
    `sql/supabase_schema.sql` (একই ফাইল, single-tenant অ্যাপও যেটা ব্যবহার করে) চালিয়ে ১৭টা
    টেবিল বসায় → একটা Super Admin ইউজার + ডিফল্ট `incomeCategories` সেটিং তৈরি করে। মাঝপথে কিছু
    ব্যর্থ হলে পুরো ট্রানজ্যাকশন রোলব্যাক হয়ে যায় — আধা-তৈরি schema থেকে যায় না।
  - `dropTenantSchema(schemaName)` — শুধু ব্যর্থ provisioning-এর rollback path থেকে ব্যবহৃত হয়
    (CLI/route থেকে সরাসরি এক্সপোজ করা হয়নি — ভুলবশত ডেটা মুছে যাওয়া ঠেকাতে)।
  - `provisionInstitution({ name, code, adminEmail, adminPassword, ... })` — ভাগ ১-এর
    `registryDb.createInstitution` আর উপরের `provisionTenantSchema` — দুটোকে একসাথে চালায়। schema
    provisioning ব্যর্থ হলে registry-তে তৈরি হওয়া প্রতিষ্ঠানের সারিটাও মুছে দেয়, যাতে একই `code`
    দিয়ে আবার চেষ্টা করা যায়।

### পরিবর্তিত ফাইল

- `server/scripts/registry-cli.js`:
  - `create` কমান্ড এখন শুধু registry-তে সারি বসায় না — পুরো schema + admin login তৈরি করে দেয়।
    নতুন সিগনেচার: `create "<Name>" <code> <adminEmail> <adminPassword> [phone]`
  - নতুন কমান্ড `provision <code> <adminEmail> <adminPassword>` — যদি কোনো প্রতিষ্ঠান আগে থেকে
    registry-তে আছে কিন্তু schema তৈরি হয়নি (যেমন ভাগ ১-এর সময় তৈরি পুরনো সারি), সেটার জন্য
    schema বসাতে।

### কেন এভাবে

- Provisioning-এর পুরো কাজ (schema + ১৭ টেবিল + admin ইউজার + settings) একটাই DB কানেকশনে,
  একটাই ট্রানজ্যাকশনে করা হয়েছে — Postgres-এ DDL (CREATE SCHEMA/TABLE) ট্রানজ্যাকশনাল, তাই মাঝে
  কোনো ধাপ ব্যর্থ হলে (যেমন duplicate admin email) পুরোটাই রোলব্যাক হয়, কোনো "অর্ধেক তৈরি" tenant
  থেকে যায় না।
- `pool.connect()` দিয়ে একটা ডেডিকেটেড ক্লায়েন্ট নেওয়া হয়েছে (`pool.query()` না) — কারণ
  `SET search_path` একটা নির্দিষ্ট কানেকশনের session-level সেটিং; পুল থেকে এলোমেলো কানেকশন
  ব্যবহার করলে schema ঠিকমতো টার্গেট হতো না। কাজ শেষে `client.release()`-এর আগে `search_path`
  আবার `public`-এ রিসেট করা হয়েছে, যাতে পুলে ফেরত যাওয়া কানেকশনটা পরে অন্য (single-tenant)
  কোয়েরিতে ভুল schema-তে না চলে যায়।
- একই `sql/supabase_schema.sql` ফাইল ব্যবহার করা হয়েছে যেটা এখনকার single-tenant অ্যাপও ব্যবহার
  করে — আলাদা কোনো "tenant schema" ফাইল রাখা হয়নি, যাতে দুটো কখনো একে অপরের থেকে আলাদা
  (drift) হয়ে না যায়।

### পরের ধাপ (ভাগ ৩)

এখন `tenant_xxx` schema-গুলো তৈরি হয়, কিন্তু অ্যাপ এখনো জানে না কোন রিকোয়েস্টের জন্য কোন schema
ব্যবহার করতে হবে — `db.js`/`pg.js` সবসময় `public`-এ কথা বলে। ভাগ ৩-এ সাবডোমেইন/কোড দেখে সঠিক
`tenant_xxx` schema-তে প্রতি-রিকোয়েস্ট কানেকশন সুইচ করার middleware বসবে।

---

## ভাগ ৩ — Tenant Resolution Middleware (এই ধাপে যা হয়েছে)

### নতুন ফাইল

- `server/src/tenantContext.js` — `AsyncLocalStorage` wrapper, প্রতি-রিকোয়েস্ট tenant client ধরে
  রাখে।
- `server/src/middleware/tenantResolve.js` — সাবডোমেইন/`X-Tenant-Code` হেডার থেকে কোড বের করে →
  registry-তে লুকআপ → suspend/expired হলে ৪০৩ → allowed হলে dedicated connection checkout করে
  `search_path` সেট করে পুরো রিকোয়েস্ট সেই context-এ চালায়।

### পরিবর্তিত ফাইল

- `server/src/pg.js` — `query`/`get`/`all`/`run`/`withTransaction` এখন প্রথমে tenant context চেক
  করে; context না থাকলে (ডিফল্ট) আগের মতোই shared pool ব্যবহার করে।
- `server/src/index.js` — `tenantResolve` middleware যোগ হয়েছে auth/public রুটের আগে।
- `.env.example` — `MULTI_TENANT_MODE`, `PLATFORM_ROOT_DOMAIN` ডকুমেন্টেড।

### কেন এভাবে

২০+টা route ফাইলের **একটাও বদলাতে হয়নি** — `AsyncLocalStorage` দিয়ে middleware একবার client সেট
করলে পুরো রিকোয়েস্ট চেইনে সেটা স্বয়ংক্রিয়ভাবে পাওয়া যায়। আর `MULTI_TENANT_MODE=true` সেট না করলে
middleware প্রথম লাইনেই বেরিয়ে যায় — এখনকার single-tenant ডিপ্লয়মেন্ট একদম আগের মতোই চলবে।

### পরের ধাপ (ভাগ ৪)

এখন প্রতিটা রিকোয়েস্ট সঠিক `tenant_xxx` schema-তে চলে, কিন্তু JWT টোকেনে কোনো প্রতিষ্ঠানের
পরিচয় নেই — তাই তাত্ত্বিকভাবে একজন ইউজার এক প্রতিষ্ঠানের সাবডোমেইনে লগইন করে পাওয়া টোকেন অন্য
প্রতিষ্ঠানের সাবডোমেইনে ব্যবহার করে ফেলতে পারত (দুটোরই `JWT_SECRET` একই)। ভাগ ৪-এ টোকেনকে
নির্দিষ্ট প্রতিষ্ঠানের সাথে বেঁধে দেওয়া হবে।

---

## ভাগ ৪ — Auth/JWT আপডেট (এই ধাপে যা হয়েছে)

### পরিবর্তিত ফাইল

- `server/src/middleware/auth.js`:
  - `signToken(user, institution)` — `institution` (ঐচ্ছিক, শুধু `MULTI_TENANT_MODE=true`-এ পাস
    করা হয়) দিলে টোকেনে `institutionId`/`institutionCode` ক্লেইম যোগ হয়। না দিলে টোকেনের গঠন আগের
    মতোই অবিকল থাকে — single-tenant ডিপ্লয়মেন্টে কোনো পার্থক্য নেই।
  - নতুন `verifyRequestToken(req)` — `requireAuth` আর `/api/auth/me` দুটোই এখন এই একই ফাংশন
    ব্যবহার করে (আগে `/me`-এ আলাদা করে ম্যানুয়াল `jwt.verify` কল ছিল, দুই জায়গায় দুই রকম লজিক
    থাকার ঝুঁকি ছিল)। এই ফাংশন সিগনেচার/মেয়াদ যাচাইয়ের পর, যদি রিকোয়েস্টটা কোনো tenant-এ resolve
    হয়ে থাকে (`req.tenant` সেট থাকলে — মানে `MULTI_TENANT_MODE=true`), টোকেনের
    `institutionCode`-এর সাথে `req.tenant.code` মিলছে কিনা চেক করে। না মিললে (ভিন্ন প্রতিষ্ঠানের
    টোকেন, অথবা এই ফিচার আসার আগের পুরনো টোকেন) — সেশন-মেয়াদ-শেষ ধরে ৪০১ রিটার্ন করে, ফের লগইন
    করতে বাধ্য করে।
- `server/src/routes/auth.js`:
  - `/login` — টোকেন সাইন করার ঠিক আগে `registryDb.isAccessAllowed(req.tenant)` আবার চেক করা
    হয় — `tenantResolve` মিডলওয়্যার রিকোয়েস্টের শুরুতেই এটা চেক করে, কিন্তু পাসওয়ার্ড
    ভেরিফাই করতে করতে ঐ অল্প সময়ের মধ্যে প্রতিষ্ঠান সাসপেন্ড হয়ে গেলে সেটাও ধরার জন্য এই
    দ্বিতীয় চেক। তারপর `signToken(user, req.tenant)` কল করে টোকেনে institution বেঁধে দেওয়া হয়।
  - `/register` — একই ভাবে `signToken(user, req.tenant)`।
  - `/me` — এখন `verifyRequestToken` ব্যবহার করে, তাই `requireAuth`-এর মতোই tenant-বাইন্ডিং চেক
    পায়।

### কেন এভাবে

শুধু টোকেনে `institutionCode` বসিয়ে দিলেই কিছু হতো না — সেটা কোথাও *চেক* না করলে স্রেফ একটা অকেজো
ফিল্ড। তাই `institutionCode`-কে "verify request" পথে বাধ্যতামূলক করা হয়েছে: প্রতিটা authenticated
রিকোয়েস্টে (শুধু লগইনে না) টোকেনের প্রতিষ্ঠান বনাম রিকোয়েস্টের প্রতিষ্ঠান মিলছে কিনা দেখা হয়। এতে
একই `JWT_SECRET` শেয়ার করা সত্ত্বেও এক প্রতিষ্ঠানের টোকেন অন্য প্রতিষ্ঠানের সাবডোমেইনে খাটবে না।
`MULTI_TENANT_MODE` বন্ধ থাকা অবস্থায় (`req.tenant` কখনো সেট হয় না) এই পুরো চেক স্কিপ হয়ে যায় —
তাই বর্তমান single-tenant ডিপ্লয়মেন্টে লগইন/সেশন আচরণ একদম আগের মতোই থাকবে।

### পরের ধাপ (ভাগ ৫)

এখন প্রতিষ্ঠান তৈরি/সাসপেন্ড/স্ট্যাটাস-দেখা শুধু CLI (`registry-cli.js`) দিয়ে করা যায়। ভাগ ৫-এ এর
জন্য একটা ওয়েব Super-Admin প্যানেল (`registry.platform_admins` দিয়ে লগইন) বসানো হবে, যাতে টার্মিনাল
ছাড়াই এসব করা যায়।

---

## ভাগ ৫ — Super-Admin প্যানেল (এই ধাপে যা হয়েছে)

### নতুন ফাইল

- `server/src/middleware/platformAuth.js` — প্ল্যাটফর্ম-অ্যাডমিন লগইনের জন্য **আলাদা** JWT/কুকি
  (`platform_token`) — `middleware/auth.js` (tenant user লগইন, AGENTS.md-এ protected path) থেকে
  সম্পূর্ণ আলাদা রাখা হয়েছে যাতে এই কাজে সেই ফাইলে হাত দিতে না হয়। ডিফল্টে `JWT_SECRET` থেকে
  derive করা একটা আলাদা সিক্রেট ব্যবহার হয়, প্রোডাকশনে নিজের `PLATFORM_JWT_SECRET` সেট করা
  বাধ্যতামূলক।
- `server/src/routes/platform.js` — `/api/platform/*` রুট: `auth/login`, `auth/logout`,
  `auth/me`, প্রতিষ্ঠান লিস্ট/তৈরি (`tenantProvision.provisionInstitution` কল করে), স্ট্যাটাস
  পরিবর্তন, সাবস্ক্রিপশন পরিবর্তন, আর অডিট-লগ দেখা। এই ফাইল শুধু `registry.*` schema-র সাথে কথা
  বলে, কোনো `tenant_xxx` schema-তে সরাসরি হাত দেয় না।
- `server/public-platform/` (`index.html`, `app.js`, `styles.css`) — আসল ওয়েব UI। কোনো বিল্ড-স্টেপ
  ছাড়া প্লেইন HTML/CSS/JS (নতুন কোনো npm প্যাকেজ লাগেনি) — `/platform` পাথে সার্ভ হয়, লগইন ফর্ম +
  প্রতিষ্ঠানের টেবিল (স্ট্যাটাস ফিল্টার, স্ট্যাটাস/সাবস্ক্রিপশন পরিবর্তনের ফর্ম, অডিট-লগ মোডাল) +
  নতুন প্রতিষ্ঠান তৈরির ফর্ম।
- `server/scripts/registry-cli.js` — নতুন কমান্ড `platform-admin-create` (প্রথম প্ল্যাটফর্ম-অ্যাডমিন
  বানানোর একমাত্র উপায়, যেহেতু কোনো সেলফ-রেজিস্ট্রেশন নেই)।

### পরিবর্তিত ফাইল

- `server/src/registryDb.js` — `getPlatformAdminByEmail`, `createPlatformAdmin`,
  `listAuditLogs` যোগ হয়েছে (bcrypt hashing এখানেই, অন্য কোথাও ছড়ানো হয়নি)।
- `server/src/index.js` — `/api/platform` রাউট আর `/platform` static ফোল্ডার মাউন্ট করা হয়েছে
  (tenant `requireAuth`/`rbac` চেইনের আগে — `tenantResolve.js`-এর `isSkippedPath()` ভাগ ৩ থেকেই
  `/api/platform/*` বাদ দেয়, তাই সেখানে কোনো পরিবর্তন লাগেনি)। CSP/rate-limiter কনফিগে হাত
  দেওয়া হয়নি — প্যানেলের JS বহিরাগত ফাইল থেকে লোড হয় (`<script src="...">`, inline না), তাই
  বিদ্যমান `scriptSrc: ['self']`-এই কাজ করে।
- `.env.example` — `PLATFORM_JWT_SECRET` ডকুমেন্টেড।

### কেন এভাবে

- **আলাদা auth ফাইল, আলাদা কুকি, আলাদা সিক্রেট** — একজন প্ল্যাটফর্ম-অ্যাডমিনের টোকেন কখনো কোনো
  মাদ্রাসার তার নিজের ইউজার-টোকেন হিসেবে ভুল করে গ্রহণযোগ্য হবে না, আর উল্টোটাও না। কারো ব্রাউজারে
  একই সময়ে নিজের মাদ্রাসার ড্যাশবোর্ড আর `/platform` — দুটোই লগইন করা থাকতে পারে, একটা আরেকটাকে
  লগআউট করে দেবে না।
- **কোনো নতুন npm প্যাকেজ নেই** — AGENTS.md-এর নিয়ম অনুযায়ী প্যানেলটা প্লেইন HTML/CSS/vanilla JS
  দিয়ে বানানো হয়েছে, React/বিল্ড-স্টেপ লাগেনি — client অ্যাপ থেকে সম্পূর্ণ স্বাধীন, তাই মূল
  React অ্যাপের কোনো ফাইলে হাত দিতে হয়নি।
- **প্রতিটা mutating রুট অডিট-লগে যায়** — প্রতিষ্ঠান তৈরি, স্ট্যাটাস পরিবর্তন, সাবস্ক্রিপশন
  পরিবর্তন — সবকিছু `registry.audit_logs`-এ actor ইমেইলসহ রেকর্ড হয়, প্যানেলেই "লগ" বাটনে
  দেখা যায়।

### সীমাবদ্ধতা (যা এই ধাপে করা হয়নি)

- Sandbox পরিবেশে network/npm না থাকায় `npm run check` (lint/typecheck/build) সরাসরি চালানো
  যায়নি — শুধু `node --check`-এ প্রতিটা `.js` ফাইল সিনট্যাক্স-ভ্যালিডেট করা হয়েছে। পুশ করার আগে
  আপনার নিজের মেশিনে একবার `npm run check` চালিয়ে নেওয়া ভালো (client-এর কোনো ফাইল স্পর্শ করা
  হয়নি বলে lint/typecheck ফেইল করার কথা না, কিন্তু নিশ্চিত হতে ক্ষতি নেই)।
- প্রথম প্ল্যাটফর্ম-অ্যাডমিন তৈরি এখনো CLI-নির্ভর (`platform-admin-create`) — ইচ্ছাকৃতভাবে, যাতে
  কেউ ওয়েব থেকে নিজেকে প্ল্যাটফর্ম-অ্যাডমিন বানাতে না পারে।
- একজন প্ল্যাটফর্ম-অ্যাডমিন সাসপেন্ড/মুছে ফেলার UI নেই এখনো (দরকার হলে সরাসরি DB থেকে করতে হবে)
  — টিম ছোট থাকলে এটা তেমন জরুরি না, ভাগ ৬-এর সময় দরকার মনে হলে যোগ করা যাবে।

### পরের ধাপ (ভাগ ৬)

সাবস্ক্রিপশন/পেমেন্ট (bKash/Nagad/SSLCommerz), মেয়াদ শেষ হলে অটো-সাসপেন্ড (এখন `isAccessAllowed`
শুধু মেয়াদ পার হয়েছে কিনা *পড়ে*, কেউ status স্বয়ংক্রিয়ভাবে বদলায় না — একটা cron/scheduled job
লাগবে), আর সব tenant schema-তে একসাথে migration চালানোর টুল — এটাই ভাগ ৬।

---

## চালানোর নির্দেশনা (এখনই টেস্ট করতে চাইলে)

```bash
cd server
npm install   # যদি আগে না করা থাকে
node scripts/registry-cli.js init
node scripts/registry-cli.js create "টেস্ট মাদ্রাসা" test-madrasah admin@test-madrasah.com "Str0ngPass!"
node scripts/registry-cli.js list
```

এটা আপনার বর্তমান `DATABASE_URL`-এ একটা নতুন `registry` schema এবং একটা নতুন `tenant_test_madrasah`
schema (পুরো ১৭ টেবিল + একটা Super Admin লগইনসহ) তৈরি করবে — বিদ্যমান `public` schema-র
students/payments/users ইত্যাদি টেবিলে কোনো হাত দেবে না।

### ভাগ ৩ ও ৪ টেস্ট করতে (দুটো প্রতিষ্ঠান দিয়ে token-binding যাচাই)

```bash
# .env-এ MULTI_TENANT_MODE=true সেট করে সার্ভার চালু করুন, তারপর:

node server/scripts/registry-cli.js create "মাদ্রাসা এ" madrasah-a a@example.com "Str0ngPass!"
node server/scripts/registry-cli.js create "মাদ্রাসা বি" madrasah-b b@example.com "Str0ngPass!"

# মাদ্রাসা এ-তে লগইন করে টোকেন নিন
curl -i -c cookies-a.txt -X POST http://localhost:10000/api/auth/login \
  -H "Content-Type: application/json" -H "X-Tenant-Code: madrasah-a" \
  -d '{"email":"a@example.com","password":"Str0ngPass!"}'

# এই cookie দিয়েই মাদ্রাসা বি-এর কোডে রিকোয়েস্ট পাঠান — ৪০১ (Session expired) আসা উচিত,
# কারণ টোকেনের institutionCode "madrasah-a", কিন্তু রিকোয়েস্ট resolve হয়েছে "madrasah-b"-তে
curl -i -b cookies-a.txt http://localhost:10000/api/auth/me -H "X-Tenant-Code: madrasah-b"

# নিজের কোডে একই কুকি দিয়ে অ্যাক্সেস স্বাভাবিকভাবেই কাজ করবে
curl -i -b cookies-a.txt http://localhost:10000/api/auth/me -H "X-Tenant-Code: madrasah-a"

# সাসপেন্ড করে দেখুন লগইন ব্লক হয় কিনা
node server/scripts/registry-cli.js status madrasah-b suspended
curl -i -X POST http://localhost:10000/api/auth/login \
  -H "Content-Type: application/json" -H "X-Tenant-Code: madrasah-b" \
  -d '{"email":"b@example.com","password":"Str0ngPass!"}'   # 403 আসা উচিত
```

### ভাগ ৫ টেস্ট করতে (Super-Admin প্যানেল)

```bash
# প্রথম প্ল্যাটফর্ম-অ্যাডমিন বানান
node server/scripts/registry-cli.js platform-admin-create "আপনার নাম" you@example.com "Str0ngPass!"

# সার্ভার চালু করে ব্রাউজারে খুলুন:
#   http://localhost:10000/platform
# উপরের ইমেইল/পাসওয়ার্ড দিয়ে লগইন করুন — এখান থেকেই নতুন প্রতিষ্ঠান তৈরি, স্ট্যাটাস/সাবস্ক্রিপশন
# পরিবর্তন, আর অডিট লগ দেখা যাবে (CLI লাগবে না)।
```
