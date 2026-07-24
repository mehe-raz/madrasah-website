# Multi-Tenant SaaS রূপান্তর — ৬ ভাগের পরিকল্পনা

লক্ষ্য: একটাই কোডবেস/সার্ভার দিয়ে অনেকগুলো মাদ্রাসা (প্রতিষ্ঠান)-কে সার্ভিস দেওয়া, প্রতিটির ডেটা
সম্পূর্ণ আলাদা (schema-per-tenant), আর সবকিছু আপনি এক জায়গা (Super-Admin প্যানেল) থেকে
নিয়ন্ত্রণ করবেন।

## ৬টি ভাগ

| # | ভাগ | কাজ | স্ট্যাটাস |
|---|-----|-----|-----------|
| ১ | **Central Registry Database** | কোন কোন প্রতিষ্ঠান আছে, তাদের schema-নাম, status (trial/active/suspended) রাখার মাস্টার টেবিল | ✅ সম্পন্ন (এই ধাপ) |
| ২ | **Schema Provisioning System** | নতুন প্রতিষ্ঠান যোগ হলে স্বয়ংক্রিয়ভাবে তার জন্য নতুন schema + ১৭টা টেবিল + ডিফল্ট অ্যাডমিন তৈরি | ⏳ বাকি |
| ৩ | **Tenant Resolution Middleware** | রিকোয়েস্ট এলে সাবডোমেইন/কোড দেখে সঠিক schema-তে DB কানেকশন সেট করা (`pg.js`/`db.js` পরিবর্তন) | ⏳ বাকি |
| ৪ | **Auth/JWT আপডেট** | টোকেনে `institution_code` যোগ, লগইনের সময় প্রতিষ্ঠান যাচাই, সাসপেন্ড থাকলে লগইন ব্লক | ⏳ বাকি |
| ৫ | **Super-Admin প্যানেল** | ওয়েব UI দিয়ে প্রতিষ্ঠান যোগ/সাসপেন্ড/স্ট্যাটাস দেখা (এখন পর্যন্ত এটা শুধু CLI দিয়ে করা যায়) | ⏳ বাকি |
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

## চালানোর নির্দেশনা (এখনই টেস্ট করতে চাইলে)

```bash
cd server
npm install   # যদি আগে না করা থাকে
node scripts/registry-cli.js init
node scripts/registry-cli.js create "টেস্ট মাদ্রাসা" test-madrasah
node scripts/registry-cli.js list
```

এটা আপনার বর্তমান `DATABASE_URL`-এ একটা নতুন `registry` schema তৈরি করবে — বিদ্যমান
students/payments/users ইত্যাদি টেবিলে কোনো হাত দেবে না।
