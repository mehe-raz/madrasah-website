// server/src/routes/shifts.js
//
// docs/SHIFT_SCHEDULE_PLAN.md, Phase 2 — shift/schedule master data CRUD.
// A shift is institution-defined (name, start/end time, grace minutes);
// Phase 3 (routes/classShifts.js, staff.shiftId) assigns classes/staff to
// one, and Phase 4 (lib/attendanceSchedule.js, not yet built) will compare
// a punch's time against a shift's startTime+graceMinutes to decide
// উপস্থিত vs দেরিতে automatically.
//
// No hard DELETE route — a shift may already be referenced by
// class_shifts or staff.shiftId (both `on delete cascade`/`set null`, so a
// hard delete wouldn't even error, it would just silently unassign
// classes/staff). Same "status toggle only" reasoning as routes/staff.js
// (plan doc §6 there) — active=false hides it from future assignment
// pickers without breaking anything already pointing at it.

const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { validate } = require("../middleware/validate");
const { shiftCreateSchema, shiftUpdateSchema } = require("../lib/shiftSchemas");
const { recordAudit } = require("../lib/auditLog");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in
// index.js — same pattern as routes/staff.js.
router.use(requirePermission("shifts"));

const COLUMNS = 'id, name, "nameEn", "startTime", "endTime", "graceMinutes", active, "createdAt"';

router.get("/", async (_req, res) => {
  const rows = await db.all(`SELECT ${COLUMNS} FROM shifts ORDER BY "startTime"`);
  res.json(rows);
});

router.post("/", validate(shiftCreateSchema), async (req, res) => {
  const { name, nameEn, startTime, endTime, graceMinutes } = req.body;

  const result = await db.run(
    `INSERT INTO shifts (name, "nameEn", "startTime", "endTime", "graceMinutes", active, "createdAt")
     VALUES ($1, $2, $3, $4, $5, true, $6) RETURNING id`,
    [name, nameEn || "", startTime, endTime, graceMinutes ?? 0, new Date().toISOString()]
  );
  const row = await db.get(`SELECT ${COLUMNS} FROM shifts WHERE id = $1`, [result.insertId]);

  await recordAudit({
    action: "shift.created",
    actor: req.user,
    entityType: "shifts",
    entityId: row.id,
    label: `নতুন শিফট যোগ: ${row.name} (${row.startTime}-${row.endTime})`,
  });

  res.status(201).json(row);
});

router.patch("/:id", validate(shiftUpdateSchema), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get("SELECT id FROM shifts WHERE id = $1", [id]);
  if (!existing) return res.status(404).json({ error: "শিফট খুঁজে পাওয়া যায়নি" });

  const { name, nameEn, startTime, endTime, graceMinutes, active } = req.body;

  const sets = [];
  const params = [];
  function set(col, value) {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  }

  if (name !== undefined) set("name", name);
  if (nameEn !== undefined) set('"nameEn"', nameEn);
  if (startTime !== undefined) set('"startTime"', startTime);
  if (endTime !== undefined) set('"endTime"', endTime);
  if (graceMinutes !== undefined) set('"graceMinutes"', graceMinutes);
  if (active !== undefined) set("active", active);

  if (sets.length > 0) {
    params.push(id);
    await db.run(`UPDATE shifts SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
  }

  const row = await db.get(`SELECT ${COLUMNS} FROM shifts WHERE id = $1`, [id]);
  await recordAudit({
    action: "shift.updated",
    actor: req.user,
    entityType: "shifts",
    entityId: id,
    label: `শিফট আপডেট: ${row.name}`,
    details: { fields: Object.keys(req.body) },
  });

  res.json(row);
});

module.exports = router;
