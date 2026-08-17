// server/src/routes/classShifts.js
//
// docs/SHIFT_SCHEDULE_PLAN.md, Phase 3 — class/jamaat -> shift assignment.
// One whole class/jamaat shares one shift (confirmed with the user, plan
// §3) — not per-student — so this is a small map, not a per-student
// column. The class list itself has no dedicated table (lib/classOptions.js/
// classTree.js store it as a JSON blob in settings), so `class_shifts` is
// keyed directly on the class slug text rather than a real foreign key to
// a classes table (see supabase_schema.sql's comment on class_shifts).
//
// PUT replaces the whole map in one call — same pattern as
// lib/classOptions.js's saveClassOptions (send the full list, not a
// per-row patch), which keeps this route simple and avoids partial-update
// ordering bugs.

const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { validate } = require("../middleware/validate");
const { classShiftMapSchema } = require("../lib/shiftSchemas");
const { recordAudit } = require("../lib/auditLog");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in
// index.js — same pattern as routes/shifts.js.
router.use(requirePermission("shifts"));

router.get("/", async (_req, res) => {
  const rows = await db.all(`SELECT class, "shiftId" FROM class_shifts ORDER BY class`);
  res.json(rows);
});

router.put("/", validate(classShiftMapSchema), async (req, res) => {
  const { assignments } = req.body;

  // Validate every referenced shiftId exists up front, in one query,
  // rather than letting a bad id surface as an opaque FK-violation 500
  // mid-transaction (same "check first, insert second" reasoning as
  // routes/staff.js's assertUserExists for userId).
  if (assignments.length > 0) {
    const shiftIds = [...new Set(assignments.map((a) => a.shiftId))];
    const placeholders = shiftIds.map((_, i) => `$${i + 1}`).join(", ");
    const found = await db.all(`SELECT id FROM shifts WHERE id IN (${placeholders})`, shiftIds);
    const foundIds = new Set(found.map((r) => r.id));
    const missing = shiftIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      return res.status(400).json({ error: `শিফট আইডি খুঁজে পাওয়া যায়নি: ${missing.join(", ")}` });
    }
  }

  await db.withTransaction(async (tx) => {
    await tx.query("DELETE FROM class_shifts", []);
    for (const { class: cls, shiftId } of assignments) {
      await tx.query(
        `INSERT INTO class_shifts (class, "shiftId") VALUES ($1, $2)
         ON CONFLICT (class) DO UPDATE SET "shiftId" = EXCLUDED."shiftId"`,
        [cls, shiftId]
      );
    }
  });

  await recordAudit({
    action: "classShifts.updated",
    actor: req.user,
    entityType: "settings",
    entityId: 0,
    label: `ক্লাস-শিফট বরাদ্দ আপডেট (${assignments.length}টা ক্লাস)`,
    details: { assignments },
  });

  const rows = await db.all(`SELECT class, "shiftId" FROM class_shifts ORDER BY class`);
  res.json(rows);
});

module.exports = router;
