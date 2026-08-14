// ============================================================================
// routes/guardianReminders.js  (Guardian Reminder Messenger — ad-hoc)
// ============================================================================
// Admin side of guardian_reminders. Mounted at /api/guardian-reminders,
// after the staff requireAuth/rbac chain in index.js — same "settings"
// permission tier as /api/sms and /api/payment-gateway (see the comment
// on that ROUTE_PERMISSION entry in config/roles.js for why: this is an
// admin-configuration screen, not day-to-day student data, and reusing
// "settings" means Teacher/Accountant/Hostel Manager never see it without
// a roles.js role-list change). The guardian-facing read side (message
// list, unread count, mark-read) lives in routes/guardianAuth.js instead,
// since it needs a guardian session, not a staff one — same split
// routes/assignments.js already uses for class_posts.
// ============================================================================

const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { validate } = require("../middleware/validate");
const { idempotent } = require("../middleware/idempotency");
const { recordAudit } = require("../lib/auditLog");
const { guardianReminderCreateSchema, guardianReminderUpdateSchema } = require("../lib/guardianReminderSchemas");
const {
  createReminder,
  listReminders,
  getReminder,
  setReminderActive,
  deleteReminder,
  dispatchReminder,
  dispatchDueReminders,
} = require("../lib/guardianReminders");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("settings"));

router.get("/", async (req, res) => {
  res.json(await listReminders());
});

router.post(
  "/",
  validate(guardianReminderCreateSchema),
  idempotent(async (req, res) => {
    const { title, body, targetType, targetClass, targetStudentId, scheduleType, scheduleDate, scheduleTime, intervalDays, selectedStudentIds } =
      req.body;

    if (targetType === "class") {
      const row = await db.get("SELECT 1 FROM students WHERE class = $1 LIMIT 1", [targetClass]);
      if (!row) return res.status(400).json({ error: "অজানা ক্লাস" });
    }
    if (targetType === "student") {
      const row = await db.get("SELECT 1 FROM students WHERE id = $1", [targetStudentId]);
      if (!row) return res.status(400).json({ error: "শিক্ষার্থী পাওয়া যায়নি" });
    }
    // docs/CONDITIONAL_REMINDERS_PLAN.md Phase 4 — same existence check
    // pattern as the 'student' branch above, but for every id in the array.
    if (targetType === "selectedStudents") {
      const rows = await db.all("SELECT id FROM students WHERE id = ANY($1)", [selectedStudentIds]);
      if (rows.length !== selectedStudentIds.length) {
        return res.status(400).json({ error: "একটি বা একাধিক শিক্ষার্থী পাওয়া যায়নি" });
      }
    }

    const reminder = await createReminder({
      title,
      body,
      targetType,
      targetClass,
      targetStudentId,
      scheduleType,
      scheduleDate,
      scheduleTime,
      intervalDays,
      selectedStudentIds,
      createdBy: req.user.id,
    });

    // scheduleType 'once' means "send now" — dispatch immediately instead
    // of waiting for the next periodic sweep (up to
    // GUARDIAN_REMINDER_INTERVAL_MINUTES away). 'daily'/'specificDate'
    // reminders are picked up by the sweep (or the manual /dispatch
    // button below) on their own schedule.
    let sentCount = 0;
    if (scheduleType === "once") {
      sentCount = await dispatchReminder(reminder);
    }

    await recordAudit({
      action: "guardian_reminder.created",
      actor: req.user,
      entityType: "guardian_reminder",
      entityId: reminder.id,
      label: `Reminder "${title}" (${targetType}${targetType === "class" ? `: ${targetClass}` : ""}, ${scheduleType})`,
      details: { targetType, targetClass, targetStudentId, scheduleType, scheduleDate, scheduleTime, intervalDays, selectedStudentIds, sentCount },
    });

    res.status(201).json(await getReminder(reminder.id));
  })
);

router.patch("/:id", validate(guardianReminderUpdateSchema), async (req, res) => {
  const existing = await getReminder(req.params.id);
  if (!existing) return res.status(404).json({ error: "রিমাইন্ডার পাওয়া যায়নি" });

  const updated = await setReminderActive(req.params.id, req.body.active);
  await recordAudit({
    action: "guardian_reminder.updated",
    actor: req.user,
    entityType: "guardian_reminder",
    entityId: existing.id,
    label: `Reminder "${existing.title}" ${req.body.active ? "activated" : "paused"}`,
  });
  res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const existing = await getReminder(req.params.id);
  if (!existing) return res.status(404).json({ error: "রিমাইন্ডার পাওয়া যায়নি" });

  await deleteReminder(req.params.id);
  await recordAudit({
    action: "guardian_reminder.deleted",
    actor: req.user,
    entityType: "guardian_reminder",
    entityId: existing.id,
    label: `Deleted reminder "${existing.title}"`,
  });
  res.json({ ok: true });
});

// Manual/on-demand dispatch — the "Admin বাটনে চাপলে পাঠাবে" option kept
// alongside the automatic periodic sweep (guardianReminderScheduler.js),
// per the user's explicit choice of both mechanisms together (see
// docs/CURRENT_TASK.md). Shares dispatchDueReminders()'s same-day dedup,
// so this is safe to press right after an automatic sweep without
// double-sending anything.
router.post("/dispatch", async (req, res) => {
  const dispatched = await dispatchDueReminders();
  if (dispatched.length) {
    await recordAudit({
      action: "guardian_reminder.dispatched",
      actor: req.user,
      entityType: "guardian_reminder",
      label: `Manually dispatched ${dispatched.length} reminder(s)`,
      details: { dispatched },
    });
  }
  res.json({ dispatched });
});

module.exports = router;
