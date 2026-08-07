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
  // 'all'
  const rows = await db.all(`SELECT DISTINCT "guardianId" FROM guardian_students WHERE status = 'active'`);
  return rows.map((r) => r.guardianId);
}

// Writes one guardian_messages row per targeted guardian and stamps
// lastSentAt. Never throws on a per-guardian basis — there's nothing
// per-guardian that can fail here (a plain INSERT), unlike SMS sending.
async function dispatchReminder(reminder) {
  const guardianIds = await resolveTargetGuardianIds(reminder);
  const createdAt = new Date().toISOString();
  for (const guardianId of guardianIds) {
    await db.run(
      `INSERT INTO guardian_messages ("reminderId", "guardianId", title, body, "createdAt")
       VALUES ($1, $2, $3, $4, $5)`,
      [reminder.id, guardianId, reminder.title, reminder.body, createdAt]
    );
  }
  await db.run(`UPDATE guardian_reminders SET "lastSentAt" = $1 WHERE id = $2`, [createdAt, reminder.id]);
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
