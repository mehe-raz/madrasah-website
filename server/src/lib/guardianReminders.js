// ============================================================================
// lib/guardianReminders.js  (Guardian Reminder Messenger — ad-hoc)
// ============================================================================
// Admin authors a `guardian_reminders` row (once / daily / specificDate);
// dispatchDueReminders() turns a due reminder into one `guardian_messages`
// row per targeted guardian. Guardian-side read functions at the bottom
// mirror lib/classPosts.js's feedForGuardian/markPostRead/unreadCountFor-
// Guardian, but this table is fan-out-at-write (see the schema comment in
// sql/supabase_schema.sql) since each reminder is genuinely a distinct
// per-guardian delivery, not a class-wide feed joined at read time.
// ============================================================================

const db = require("./../db");
const { notifyGuardians } = require("./guardianPush");

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function createReminder({
  title,
  body,
  targetType,
  targetClass,
  targetStudentId,
  scheduleType,
  scheduleDate,
  createdBy,
}) {
  const createdAt = new Date().toISOString();
  return db.get(
    `INSERT INTO guardian_reminders
     (title, body, "targetType", "targetClass", "targetStudentId", "scheduleType", "scheduleDate", "createdBy", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      title,
      body || "",
      targetType,
      targetType === "class" ? targetClass : null,
      targetType === "student" ? targetStudentId : null,
      scheduleType,
      scheduleType === "specificDate" ? scheduleDate : null,
      createdBy || null,
      createdAt,
    ]
  );
}

async function listReminders() {
  return db.all(`SELECT * FROM guardian_reminders ORDER BY "createdAt" DESC LIMIT 200`);
}

async function getReminder(id) {
  return db.get(`SELECT * FROM guardian_reminders WHERE id = $1`, [id]);
}

async function setReminderActive(id, active) {
  return db.get(`UPDATE guardian_reminders SET active = $1 WHERE id = $2 RETURNING *`, [active, id]);
}

async function deleteReminder(id) {
  await db.run(`DELETE FROM guardian_reminders WHERE id = $1`, [id]);
}

// Every ACTIVE-linked guardian matching the reminder's target — same
// `guardian_students ... status = 'active'` rule classPosts.feedForGuardian
// and guardianData.assertGuardianOwnsStudent already apply, so a pending
// child-link never receives a reminder either.
async function resolveTargetGuardianIds(reminder) {
  if (reminder.targetType === "student") {
    const rows = await db.all(
      `SELECT DISTINCT "guardianId" FROM guardian_students WHERE "studentId" = $1 AND status = 'active'`,
      [reminder.targetStudentId]
    );
    return rows.map((r) => r.guardianId);
  }
  if (reminder.targetType === "class") {
    const rows = await db.all(
      `SELECT DISTINCT gs."guardianId"
       FROM guardian_students gs
       JOIN students s ON s.id = gs."studentId"
       WHERE gs.status = 'active' AND s.class = $1`,
      [reminder.targetClass]
    );
    return rows.map((r) => r.guardianId);
  }
  // docs/CONDITIONAL_REMINDERS_PLAN.md Phase 2 — the four conditional
  // target types. targetClass is optional here (whole-institution) except
  // for lateArrival/attendanceMissing, where routes/guardianReminders.js's
  // Zod schema requires it (see plan §5) since "which class, what time"
  // is the whole point of those two.
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
  // 'all'
  const rows = await db.all(`SELECT DISTINCT "guardianId" FROM guardian_students WHERE status = 'active'`);
  return rows.map((r) => r.guardianId);
}

// docs/CONDITIONAL_REMINDERS_PLAN.md Phase 2 — feeDue is the one target
// type where every guardian needs their OWN message body (their own
// children's names/dues), not the admin's static reminder.body. Guardians
// with no remaining due among the targeted students (e.g. they paid
// between resolveTargetGuardianIds() picking them up and this running)
// simply get no entry in the returned map — dispatchReminder() skips them.
async function buildFeeDueBodies(guardianIds, targetClass) {
  if (!guardianIds || guardianIds.length === 0) return new Map();
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

// Writes one guardian_messages row per targeted guardian and stamps
// lastSentAt. Never throws on a per-guardian basis — there's nothing
// per-guardian that can fail here (a plain INSERT), unlike SMS sending.
async function dispatchReminder(reminder) {
  const guardianIds = await resolveTargetGuardianIds(reminder);
  const createdAt = new Date().toISOString();

  // docs/CONDITIONAL_REMINDERS_PLAN.md Phase 2 — feeDue takes a different
  // path from here on: personalized body per guardian instead of the one
  // static reminder.body every other target type shares. Kept as an early
  // return rather than threading a body-lookup through the loop below, so
  // the existing all/class/student/lateArrival/attendanceMissing/
  // selectedStudents path stays exactly as it was before this change.
  if (reminder.targetType === "feeDue") {
    const bodies = await buildFeeDueBodies(guardianIds, reminder.targetClass);
    for (const guardianId of guardianIds) {
      const body = bodies.get(guardianId);
      if (!body) continue; // paid off between resolve and here — nothing to send
      await db.run(
        `INSERT INTO guardian_messages ("reminderId", "guardianId", title, body, "createdAt")
         VALUES ($1, $2, $3, $4, $5)`,
        [reminder.id, guardianId, reminder.title, body, createdAt]
      );
      // Personalized body means this can't go through the shared-payload
      // notifyGuardians() batch below — one call per guardian instead.
      await notifyGuardians([guardianId], { title: reminder.title, body, url: "/guardian" });
    }
    await db.run(`UPDATE guardian_reminders SET "lastSentAt" = $1 WHERE id = $2`, [createdAt, reminder.id]);
    return guardianIds.length;
  }

  for (const guardianId of guardianIds) {
    await db.run(
      `INSERT INTO guardian_messages ("reminderId", "guardianId", title, body, "createdAt")
       VALUES ($1, $2, $3, $4, $5)`,
      [reminder.id, guardianId, reminder.title, reminder.body, createdAt]
    );
  }
  await db.run(`UPDATE guardian_reminders SET "lastSentAt" = $1 WHERE id = $2`, [createdAt, reminder.id]);
  // Push is purely additive on top of the guardian_messages row above —
  // notifyGuardians() never throws (see lib/guardianPush.js), so a push
  // failure or missing VAPID config can never stop a reminder from being
  // recorded/delivered via the existing polling messenger bubble.
  await notifyGuardians(guardianIds, {
    title: reminder.title,
    body: reminder.body,
    url: "/guardian",
  });
  return guardianIds.length;
}

// Called by the periodic sweep (server/src/guardianReminderScheduler.js)
// and by the manual "এখনই পাঠান" admin button (POST /dispatch) — same
// function either way, so there is exactly one place that decides what
// counts as "due today". A 'daily' or 'specificDate' reminder that already
// sent once today is skipped (comparing the date portion of lastSentAt),
// so pressing the manual button right after an automatic sweep — or
// mid-sweep-interval — never double-sends.
async function dispatchDueReminders({ date } = {}) {
  const today = date || todayStr();
  const reminders = await db.all(`SELECT * FROM guardian_reminders WHERE active = true`);
  const results = [];
  for (const reminder of reminders) {
    const lastSentDate = reminder.lastSentAt ? String(reminder.lastSentAt).slice(0, 10) : null;
    let due = false;
    if (reminder.scheduleType === "once") {
      due = !reminder.lastSentAt;
    } else if (reminder.scheduleType === "specificDate") {
      due = reminder.scheduleDate === today && lastSentDate !== today;
    } else if (reminder.scheduleType === "daily") {
      due = lastSentDate !== today;
    }
    if (!due) continue;

    const count = await dispatchReminder(reminder);
    results.push({ reminderId: reminder.id, title: reminder.title, count });

    // A 'once' reminder has nothing left to do after its single send —
    // turned off so it stops showing as "active" in the admin list, same
    // as how a finished thing looks in the rest of this codebase (e.g. a
    // resolved delete_request). 'daily'/'specificDate' stay active;
    // 'daily' fires again tomorrow, 'specificDate' simply never matches
    // `today` again.
    if (reminder.scheduleType === "once") {
      await db.run(`UPDATE guardian_reminders SET active = false WHERE id = $1`, [reminder.id]);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Guardian-side read functions — mirrors lib/classPosts.js's
// feedForGuardian/markPostRead/unreadCountForGuardian shape exactly, so
// routes/guardianAuth.js's new /messages endpoints can follow the same
// try/catch + requireActiveGuardianId pattern as the existing /feed ones.
// ---------------------------------------------------------------------------

async function listMessagesForGuardian(guardianId, { limit = 50 } = {}) {
  const cappedLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const rows = await db.all(
    `SELECT * FROM guardian_messages WHERE "guardianId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
    [guardianId, cappedLimit]
  );
  return rows.map((r) => ({
    id: r.id,
    reminderId: r.reminderId,
    title: r.title,
    body: r.body,
    createdAt: r.createdAt,
    read: !!r.readAt,
  }));
}

async function unreadMessageCountForGuardian(guardianId) {
  const row = await db.get(
    `SELECT COUNT(*)::int AS count FROM guardian_messages WHERE "guardianId" = $1 AND "readAt" IS NULL`,
    [guardianId]
  );
  return row?.count || 0;
}

async function markMessageRead(guardianId, messageId) {
  if (!Number.isFinite(messageId)) return;
  await db.run(
    `UPDATE guardian_messages SET "readAt" = $1 WHERE id = $2 AND "guardianId" = $3 AND "readAt" IS NULL`,
    [new Date().toISOString(), messageId, guardianId]
  );
}

module.exports = {
  createReminder,
  listReminders,
  getReminder,
  setReminderActive,
  deleteReminder,
  resolveTargetGuardianIds,
  dispatchReminder,
  dispatchDueReminders,
  listMessagesForGuardian,
  unreadMessageCountForGuardian,
  markMessageRead,
};
