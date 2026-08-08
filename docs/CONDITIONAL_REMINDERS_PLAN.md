# শর্তভিত্তিক (Conditional/Automatic) গার্ডিয়ান রিমাইন্ডার — পূর্ণাঙ্গ পরিকল্পনা

> Status: PLANNED (কোনো কোড পরিবর্তন এখনো হয়নি)
> এই ফাইলটা `docs/PUSH_NOTIFICATION_PLAN.md`-এর ঠিক একই ভূমিকা পালন করে —
> বাস্তবায়ন শুরুর আগে এই পুরো ফাইলটা পড়ে নিতে হবে। AGENTS.md-এর "one task
> at a time, minimal diff" নিয়ম অনুযায়ী প্রতিটি ফেজ আলাদাভাবে শেষ করে
> `npm run check` চালাতে হবে, তারপর পরের ফেজ শুরু করতে হবে।
> **এই টাস্কের ট্র্যাকিং এন্ট্রি `docs/CURRENT_TASK.md`-এর সবচেয়ে উপরে
> আছে — কোন ফেজ পর্যন্ত হয়েছে সেটার জন্য ওই ফাইলটাই আসল সোর্স, এই
> ফাইলটা শুধু "কীভাবে করতে হবে" তার নকশা।**

---

## ১. ব্যবহারকারীর সাথে চূড়ান্ত হওয়া সিদ্ধান্ত (কথোপকথন থেকে)

1. বর্তমান টার্গেট-টাইপ (`all`/`class`/`student`) ছাড়াও ৪টা নতুন
   অটোমেটিক/সেমি-অটোমেটিক টার্গেট-টাইপ লাগবে:
   - **বকেয়া বেতন** (`feeDue`) — `students.due > 0` এমন ছাত্রদের গার্ডিয়ান
   - **দেরিতে উপস্থিতি** (`lateArrival`) — আজ `attendance.status = 'দেরিতে'`
     মার্ক হওয়া ছাত্রদের গার্ডিয়ান
   - **হাজিরা আপডেট হয়নি** (`attendanceMissing`) — নির্দিষ্ট সময়ের পরও
     আজকের কোনো attendance row নেই এমন সক্রিয় ছাত্রদের গার্ডিয়ান
   - **নির্বাচিত ছাত্র** (`selectedStudents`) — Attendance পেজ থেকে
     ম্যানুয়ালি বেছে নেওয়া নির্দিষ্ট কিছু ছাত্র, তাৎক্ষণিক পাঠানোর জন্য
2. **শিডিউলিং জেনারালাইজড করা হচ্ছে** — শুধু fee-due না, উপরের ৩টা
   অটোমেটিক টাইপের (feeDue/lateArrival/attendanceMissing) জন্যই অ্যাডমিন
   রিমাইন্ডার সেভ করার সময় দুটো নতুন জিনিস সেট করবেন:
   - **কত দিন পরপর** (`intervalDays`, ১-৩০ এর মধ্যে একটা সংখ্যা,
     অ্যাডমিন নিজে বসাবেন) — প্রতিদিন চাইলে `1`
   - **কয়টায় পাঠাবে** (`scheduleTime`, HH:MM) — প্রতিটা ক্লাসের জন্য
     আলাদা রুল বানিয়ে আলাদা সময় দেওয়া যাবে (একই ফর্ম, শুধু ক্লাস আলাদা)
3. **বকেয়া বেতনের মেসেজ গার্ডিয়ান-ভিত্তিক গ্রুপ করা** — একজন গার্ডিয়ানের
   একাধিক সন্তান বকেয়া থাকলে একটাই মেসেজ যাবে, ভেতরে প্রতিটা সন্তানের
   নাম + বকেয়ার পরিমাণ আলাদা লাইনে।
4. **নির্বাচিত ছাত্র** — কোনো শিডিউল ছাড়াই তাৎক্ষণিক পাঠানো, existing
   `scheduleType: "once"` (যেটা create করা মাত্র dispatch হয়ে যায়) সেই
   একই মেকানিজম পুনর্ব্যবহার হবে, নতুন কোনো "send now" এন্ডপয়েন্ট লাগবে
   না।
5. **শুরুর তারিখ (fee-due-এর ক্ষেত্রে আগে বলা "১০ তারিখের পর থেকে")** —
   ব্যবহারকারীর শেষ সিদ্ধান্ত অনুযায়ী এটা হার্ডকোড না করে সম্পূর্ণ
   অ্যাডমিনের হাতে দেওয়া হচ্ছে: অ্যাডমিন যেদিন রিমাইন্ডারটা বানাবেন/সক্রিয়
   করবেন সেদিন থেকেই ইন্টারভাল গোনা শুরু হবে। আলাদা "dayOfMonth" ফিল্ড
   এই ফেজে বানানো হচ্ছে না — লাগলে ভবিষ্যতে ছোট সংযোজন হিসেবে যোগ করা
   যাবে (এখানে নোট করে রাখা হলো, যাতে কেউ অবাক না হয়)।

---

## ২. ডাটাবেজ পরিবর্তন (Phase 1) — Protected path, তাই স্পষ্টভাবে জানিয়ে করা

**ফাইল:** `server/sql/supabase_schema.sql` (AGENTS.md Rule 4-এর আওতায় পড়ে
— কিন্তু কাজটা explicitly এই migration নিয়েই, তাই অনুমোদিত)।

`guardian_reminders` টেবিলের ঠিক নিচে (existing `create table` স্টেটমেন্টের
পরে, বাকি সব টেবিলের মতোই idempotent `alter table ... add column if not
exists`):

```sql
-- Conditional reminders (feeDue/lateArrival/attendanceMissing/selectedStudents)
alter table guardian_reminders add column if not exists "scheduleTime" text; -- 'HH:MM', 24hr; null = আগের আচরণ (নির্দিষ্ট সময় ছাড়াই sweep-এ যা পড়ে তাই পাঠায়)
alter table guardian_reminders add column if not exists "intervalDays" integer not null default 1; -- শুধু scheduleType='daily'-তে কার্যকর; বিদ্যমান সব daily রিমাইন্ডার default 1 পাবে, আচরণ অপরিবর্তিত থাকবে
alter table guardian_reminders add column if not exists "selectedStudentIds" jsonb; -- targetType='selectedStudents'-এর জন্য, students.id-এর অ্যারে
```

- কোনো নতুন টেবিল লাগছে না, existing কলাম কিছু বদলাচ্ছে না — শুধু ৩টা
  nullable/default-সহ কলাম যোগ, তাই **backward compatible**: বিদ্যমান সব
  রিমাইন্ডার আগের মতোই কাজ করবে।
- `"targetType"` কলামের উপরের কমেন্ট (`-- 'all' | 'class' | 'student'`)
  আপডেট করে ৪টা নতুন ভ্যালু যোগ করতে হবে — কমেন্ট-ই, কোনো CHECK constraint
  নেই এই কলামে, তাই এনাম ভ্যালু যোগ করতে আলাদা কিছু লাগবে না।

**বিদ্যমান tenant-দের জন্য:** `guardian_push_subscriptions` টেবিল আগে যেভাবে
যোগ হয়েছিল ঠিক সেভাবেই — নতুন কোনো কোড লাগবে না, ডিপ্লয়ের পরে অ্যাডমিন
platform প্যানেলের existing migration টুল (`routes/platform.js` →
`migrateTenants.js`-এর `migrateAllTenants`) থেকে এই ৩ লাইন চালিয়ে দিলেই
প্রতিটা প্রতিষ্ঠানের schema-তে কলাম যোগ হয়ে যাবে। এটা ব্যবহারকারীর
ম্যানুয়াল পোস্ট-ডিপ্লয় ধাপ, কোনো নতুন কোড না।

---

## ৩. টার্গেটিং লজিক (Phase 2)

**ফাইল:** `server/src/lib/guardianReminders.js` — `resolveTargetGuardianIds()`
ফাংশনে ৪টা নতুন `if` ব্রাঞ্চ যোগ (existing `student`/`class`/`all` ব্রাঞ্চ
অপরিবর্তিত রেখে):

```js
if (reminder.targetType === "feeDue") {
  const rows = await db.all(
    `SELECT DISTINCT gs."guardianId"
     FROM guardian_students gs
     JOIN students s ON s.id = gs."studentId"
     WHERE gs.status = 'active' AND s.due > 0
       AND ($1::text IS NULL OR s.class = $1)`,
    [reminder.targetClass || null]
  );
  return rows.map((r) => r.guardianId);
}
if (reminder.targetType === "lateArrival") {
  const today = todayStr();
  const rows = await db.all(
    `SELECT DISTINCT gs."guardianId"
     FROM guardian_students gs
     JOIN students s ON s.id = gs."studentId"
     JOIN attendance a ON a."studentId" = s.id AND a.date = $1
     WHERE gs.status = 'active' AND a.status = 'দেরিতে' AND s.class = $2`,
    [today, reminder.targetClass]
  );
  return rows.map((r) => r.guardianId);
}
if (reminder.targetType === "attendanceMissing") {
  const today = todayStr();
  const rows = await db.all(
    `SELECT DISTINCT gs."guardianId"
     FROM guardian_students gs
     JOIN students s ON s.id = gs."studentId"
     WHERE gs.status = 'active' AND s.class = $2
       AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a."studentId" = s.id AND a.date = $1)`,
    [today, reminder.targetClass]
  );
  return rows.map((r) => r.guardianId);
}
if (reminder.targetType === "selectedStudents") {
  const ids = Array.isArray(reminder.selectedStudentIds) ? reminder.selectedStudentIds : [];
  if (ids.length === 0) return [];
  const rows = await db.all(
    `SELECT DISTINCT "guardianId" FROM guardian_students WHERE status = 'active' AND "studentId" = ANY($1)`,
    [ids]
  );
  return rows.map((r) => r.guardianId);
}
```

`lateArrival`/`attendanceMissing`-এর জন্য `targetClass` **আবশ্যিক** (একটা
ক্লাস নির্দিষ্ট না থাকলে "প্রতি ক্লাস আলাদা সময়" ধারণাটাই অর্থহীন হয়ে
যায়) — এটা Zod স্কিমাতেই আটকানো হবে, নিচে দেখুন।

### বকেয়া বেতনের মেসেজ গার্ডিয়ান-ভিত্তিক গ্রুপ করা

`feeDue`-এর জন্য সবার কাছে একই স্ট্যাটিক `reminder.body` পাঠানো ঠিক না —
প্রতিটা গার্ডিয়ানের নিজের সন্তানদের নাম/বকেয়া লাগবে। তাই নতুন হেল্পার:

```js
// শুধু targetType==='feeDue'-এর জন্য — guardianId -> personalized body টেক্সট।
async function buildFeeDueBodies(guardianIds, targetClass) {
  const rows = await db.all(
    `SELECT gs."guardianId", s.name, s.roll, s.due
     FROM guardian_students gs
     JOIN students s ON s.id = gs."studentId"
     WHERE gs.status = 'active' AND gs."guardianId" = ANY($1) AND s.due > 0
       AND ($2::text IS NULL OR s.class = $2)
     ORDER BY s.name`,
    [guardianIds, targetClass || null]
  );
  const byGuardian = new Map();
  for (const r of rows) {
    const list = byGuardian.get(r.guardianId) || [];
    list.push(`${r.name} (রোল ${r.roll}) — বকেয়া ৳${r.due}`);
    byGuardian.set(r.guardianId, list);
  }
  const bodies = new Map();
  for (const [guardianId, lines] of byGuardian) {
    bodies.set(guardianId, `আপনার নিম্নলিখিত সন্তানের বেতন বকেয়া রয়েছে:\n${lines.join("\n")}`);
  }
  return bodies;
}
```

### `dispatchReminder()`-এ শাখা

`feeDue`-এর জন্য প্রতি-গার্ডিয়ান আলাদা বডি দরকার বলে এই একটা টাইপের
ক্ষেত্রেই লুপ ভিন্নভাবে চলবে — বাকি সব টাইপ (নতুন ৩টাসহ) বর্তমান কোড
অপরিবর্তিত রেখে চলবে:

```js
async function dispatchReminder(reminder) {
  const guardianIds = await resolveTargetGuardianIds(reminder);
  const createdAt = new Date().toISOString();

  if (reminder.targetType === "feeDue") {
    const bodies = await buildFeeDueBodies(guardianIds, reminder.targetClass);
    for (const guardianId of guardianIds) {
      const body = bodies.get(guardianId);
      if (!body) continue; // এর মধ্যে বকেয়া শোধ হয়ে থাকলে বাদ
      await db.run(
        `INSERT INTO guardian_messages ("reminderId", "guardianId", title, body, "createdAt")
         VALUES ($1, $2, $3, $4, $5)`,
        [reminder.id, guardianId, reminder.title, body, createdAt]
      );
      // প্রতি গার্ডিয়ানের জন্য আলাদা পুশ — বডি ভিন্ন বলে ব্যাচে পাঠানো যায় না
      await notifyGuardians([guardianId], { title: reminder.title, body, url: "/guardian" });
    }
    await db.run(`UPDATE guardian_reminders SET "lastSentAt" = $1 WHERE id = $2`, [createdAt, reminder.id]);
    return guardianIds.length;
  }

  // ... বিদ্যমান কোড অপরিবর্তিত (all/class/student/lateArrival/attendanceMissing/selectedStudents একই পথে) ...
}
```

---

## ৪. শিডিউলার আপডেট (Phase 3)

**ফাইল:** `server/src/lib/guardianReminders.js`-এর `dispatchDueReminders()`

বর্তমান `daily` শাখা:
```js
} else if (reminder.scheduleType === "daily") {
  due = lastSentDate !== today;
}
```
পরিবর্তন হয়ে হবে (ইন্টারভাল + নির্দিষ্ট সময় দুটোই মেনে):
```js
} else if (reminder.scheduleType === "daily") {
  const intervalDays = Math.max(1, Number(reminder.intervalDays) || 1);
  const daysSinceLast = reminder.lastSentAt
    ? Math.floor((new Date(today) - new Date(lastSentDate)) / 86400000)
    : Infinity;
  const intervalOk = daysSinceLast >= intervalDays;
  const nowHHMM = new Date().toTimeString().slice(0, 5); // local server time, HH:MM
  const timeOk = !reminder.scheduleTime || nowHHMM >= reminder.scheduleTime;
  due = lastSentDate !== today && intervalOk && timeOk;
}
```
- `scheduleTime` না থাকলে (পুরনো রিমাইন্ডার) আচরণ অভিন্ন থাকে — শুধু
  "আজ পাঠানো হয়নি" চেক করে সাথে সাথে পাঠায়, আগের মতোই।
- `intervalDays` না থাকলে (ডিফল্ট ১) মানেও আগের "প্রতিদিন" আচরণ।

**সার্ভার টাইমজোন সতর্কতা:** `new Date().toTimeString()` সার্ভার প্রসেসের
নিজের টাইমজোনে সময় দেয়। এই রিপোর ডেপ্লয়মেন্ট (Google Cloud Console)
UTC-তে চলে কিনা বা `TZ` env var সেট আছে কিনা যাচাই করে নিতে হবে — না হলে
অ্যাডমিন "সকাল ১০টা" সেট করলেও UTC অনুযায়ী অন্য সময়ে পাঠাবে। এটা Phase 3
বাস্তবায়নের সময় প্রথমেই যাচাই করা আবশ্যক (ছোট কাজ, কিন্তু ভুল হলে পুরো
ফিচারই কার্যত অকেজো মনে হবে)।

**সুইপ ফ্রিকোয়েন্সি:** `server/src/guardianReminderScheduler.js`-এর
`intervalMs()`-এ ডিফল্ট এখন ৩০ মিনিট — নির্দিষ্ট সময়ের কাছাকাছি (৫-১০
মিনিটের মধ্যে) পাঠাতে চাইলে ডিফল্ট কমিয়ে ১০ মিনিট করা উচিত (env var
`GUARDIAN_REMINDER_INTERVAL_MINUTES` দিয়ে override করার সুবিধা আগে থেকেই
আছে, শুধু ডিফল্ট ভ্যালু বদলাবে — `30` থেকে `10`, আর কিছু না)।

---

## ৫. ভ্যালিডেশন স্কিমা (Phase 4)

**ফাইল:** `server/src/lib/guardianReminderSchemas.js`

```js
const TARGET_TYPES = ["all", "class", "student", "feeDue", "lateArrival", "attendanceMissing", "selectedStudents"];
```

নতুন ফিল্ড:
```js
scheduleTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "সঠিক সময় (HH:MM) আবশ্যক").optional().nullable(),
intervalDays: z.coerce.number().int().min(1).max(30).optional().default(1),
selectedStudentIds: z.array(z.coerce.number().int().positive()).optional(),
```

নতুন `.refine()` চেকগুলো:
```js
.refine((d) => !["lateArrival", "attendanceMissing"].includes(d.targetType) || d.targetClass, {
  message: "ক্লাস নির্বাচন আবশ্যক",
  path: ["targetClass"],
})
.refine((d) => !["feeDue", "lateArrival", "attendanceMissing"].includes(d.targetType) || d.scheduleTime, {
  message: "সময় নির্বাচন আবশ্যক",
  path: ["scheduleTime"],
})
.refine((d) => d.targetType !== "selectedStudents" || (d.selectedStudentIds && d.selectedStudentIds.length > 0), {
  message: "অন্তত একজন ছাত্র নির্বাচন আবশ্যক",
  path: ["selectedStudentIds"],
})
```

**ফাইল:** `server/src/routes/guardianReminders.js` — POST হ্যান্ডলারে
`req.body`-থেকে `scheduleTime`, `intervalDays`, `selectedStudentIds` তুলে
`createReminder()`-এ পাস করা, আর `selectedStudents`-এর জন্য existing
`targetType === "student"` এর মতোই একটা DB-lookup ভ্যালিডেশন (সবগুলো
`studentId` আসলে বিদ্যমান কিনা)। `createReminder()` (lib/guardianReminders.js)
নিজেও এই ৩টা নতুন প্যারামিটার নিয়ে INSERT-এ যোগ করবে — ছোট, যান্ত্রিক
পরিবর্তন।

---

## ৬. অ্যাডমিন UI (Phase 5)

**ফাইল:** `client/src/modules/GuardianReminders.tsx` (২৮৯ লাইন, existing
কম্পোজ ফর্ম)

- টার্গেট-টাইপ ড্রপডাউনে ৪টা নতুন অপশন যোগ (বকেয়া বেতন / দেরিতে উপস্থিতি /
  হাজিরা আপডেট হয়নি / নির্বাচিত ছাত্র — শেষটা আসলে UI-তে দেখানো হবে না,
  কারণ সেটা Attendance পেজ থেকে আসে, নিচে দেখুন)।
- `lateArrival`/`attendanceMissing`/`feeDue` সিলেক্ট করলে ফর্মে নতুন দুটো
  ইনপুট দেখাবে: **"কত দিন পরপর"** (নাম্বার ইনপুট, ১-৩০) আর **"কয়টায়
  পাঠাবে"** (টাইম পিকার) — বিদ্যমান `Field`/`Input`/`Select` ডিজাইন-সিস্টেম
  কম্পোনেন্ট দিয়েই (AGENTS.md-এর "Design System (mandatory)" নিয়ম
  অনুযায়ী, কোনো raw `style={{}}` না)।
- `lateArrival`/`attendanceMissing` সিলেক্ট করলে `targetClass` ফিল্ড
  বাধ্যতামূলক দেখাবে (এখন `class` টাইপে যেমন হয়, একই প্যাটার্ন পুনর্ব্যবহার)।

**ফাইল:** `client/src/modules/Attendance.tsx` (১৭৮ লাইন)

- প্রতিটা ছাত্রের রো-তে (বিশেষ করে যাদের status `অনুপস্থিত`/`দেরিতে`)
  একটা চেকবক্স যোগ।
- উপরে একটা বাটন **"নির্বাচিতদের গার্ডিয়ানে রিমাইন্ডার পাঠান"** — ক্লিক
  করলে ছোট একটা মোডাল/ইনলাইন ফর্মে টাইটেল+বডি লিখে সাবমিট করলে
  `POST /api/guardian-reminders` কল হবে
  `{ targetType: "selectedStudents", selectedStudentIds: [...], scheduleType: "once", title, body }`
  দিয়ে — **এটা existing এন্ডপয়েন্টই**, নতুন কোনো রুট লাগছে না, কারণ
  `scheduleType: "once"` হলে সার্ভার create করার সাথে সাথেই dispatch করে
  দেয় (এই লজিক আগে থেকেই আছে, দেখুন §৭)।

---

## ৭. যা রিইউজ হচ্ছে, নতুন এন্ডপয়েন্ট লাগছে না

`routes/guardianReminders.js`-এর `POST /` হ্যান্ডলারে আগে থেকেই আছে:
```js
if (scheduleType === "once") {
  sentCount = await dispatchReminder(reminder);
}
```
তাই **"নির্বাচিত ছাত্র"-কে তাৎক্ষণিক পাঠানো** একটা আলাদা "send now"
এন্ডপয়েন্ট বানানো ছাড়াই, শুধু `targetType: "selectedStudents"` +
`scheduleType: "once"` দিয়ে existing create এন্ডপয়েন্ট কল করলেই হয়ে
যাবে — AGENTS.md-এর "minimal diff, reuse existing" নিয়ম অনুযায়ী এটাই
সঠিক পথ।

---

## ৮. ধাপ-ভিত্তিক কাজের ক্রম (প্রতিটার শেষে `npm run check`)

- **Phase 1** — DB migration: `server/sql/supabase_schema.sql`-এ ৩টা
  `alter table` লাইন।
- **Phase 2** — `server/src/lib/guardianReminders.js`: ৪টা নতুন
  `resolveTargetGuardianIds()` ব্রাঞ্চ + `buildFeeDueBodies()` + 
  `dispatchReminder()`-এ `feeDue` শাখা।
- **Phase 3** — একই ফাইলে `dispatchDueReminders()`-এর `daily` শাখায়
  interval+time লজিক, + `guardianReminderScheduler.js`-এর ডিফল্ট সুইপ
  ফ্রিকোয়েন্সি ৩০→১০ মিনিট, + সার্ভার টাইমজোন যাচাই।
- **Phase 4** — `server/src/lib/guardianReminderSchemas.js` +
  `server/src/routes/guardianReminders.js`: নতুন ফিল্ড ভ্যালিডেশন +
  `createReminder()`-এ প্যাসথ্রু (lib/guardianReminders.js-এর
  `createReminder()` ফাংশনেও ৩টা নতুন প্যারামিটার/কলাম যোগ)।
- **Phase 5** — `client/src/modules/GuardianReminders.tsx` (নতুন
  টার্গেট-টাইপ + interval/time ইনপুট) + `client/src/modules/Attendance.tsx`
  (চেকবক্স + তাৎক্ষণিক-পাঠানো বাটন)।
- **Phase 6** — টেস্টিং চেকলিস্ট:
  - বিদ্যমান `all`/`class`/`student` + `once`/`daily`/`specificDate`
    রিমাইন্ডার আগের মতোই কাজ করছে কিনা (regression)
  - `feeDue`: দুই সন্তানওয়ালা এক গার্ডিয়ান একটাই গ্রুপড মেসেজ পাচ্ছেন
    কিনা, একটা সন্তানের বকেয়া শোধ হলে পরদিন থেকে সে বাদ পড়ছে কিনা
  - `lateArrival`/`attendanceMissing`: নির্দিষ্ট সময়ের আগে না পাঠিয়ে
    ঠিক সময়ের কাছাকাছি পাঠাচ্ছে কিনা (টাইমজোন সঠিক আছে কিনা)
  - `intervalDays`: ৫ সেট করে ৫ দিনের কমে দ্বিতীয়বার না পাঠানো
  - `selectedStudents`: Attendance পেজ থেকে সিলেক্ট করে পাঠালে তাৎক্ষণিক
    যাচ্ছে কিনা, আর সেই রিমাইন্ডার লিস্টে "once" হিসেবে দেখাচ্ছে
    (এবং dispatch হওয়ার পর `active=false` হয়ে যাচ্ছে) কিনা

---

## ৯. Standards checklist (AGENTS.md অনুযায়ী, নতুন কাজ তৈরি হলে)

- নতুন কিছু endpoint তৈরি হচ্ছে না (§৭ দেখুন) — existing
  `POST /api/guardian-reminders` আগে থেকেই `requirePermission("settings")`
  আর Zod ভ্যালিডেশনের ভেতরে, তাই checklist-এর "নতুন রুট" আইটেমগুলো
  প্রযোজ্য না।
- Attendance পেজের নতুন বাটনও একই existing এন্ডপয়েন্ট কল করছে, তাই
  আলাদা permission/audit যোগ করার দরকার নেই — `guardian_reminder.created`
  অডিট লগ আগে থেকেই সব creation-এ লেখা হয় (route handler-এ
  `recordAudit()` কল আগে থেকেই আছে)।
- নতুন ডিপেন্ডেন্সি লাগছে না (Rule 5) — সব প্লেইন SQL + existing Zod।
