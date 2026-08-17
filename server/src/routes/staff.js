// server/src/routes/staff.js
//
// docs/STAFF_ATTENDANCE_PLAN.md, Phase 2 — staff registry CRUD. Separate
// from routes/users.js (software login accounts): a `staff` row is a real
// employee record, optionally linked to a `users` row via userId for the
// subset who also have a software login. See the plan doc §2 for why the
// two aren't merged.
//
// No hard DELETE route — plan doc §6, open question 2 defaulted to
// "status toggle only" so staff_attendance history is never orphaned by a
// delete. If a genuine hard-delete need comes up later, add it as its own
// task rather than assuming this default still holds.

const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { recordAudit } = require("../lib/auditLog");
const { staffCreateSchema, staffUpdateSchema } = require("../lib/staffSchemas");
const { validate } = require("../middleware/validate");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("staff"));

const COLUMNS = 'id, name, phone, designation, class, "joiningDate", photo, status, "userId", note, "fingerprintId", "cardUid", "shiftId", "createdAt"';

function publicStaff(row) {
  return row;
}

router.get("/", async (req, res) => {
  const { status, designation, search } = req.query;
  const conditions = [];
  const params = [];

  if (status && status !== "All" && status !== "সব") {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (designation) {
    params.push(designation);
    conditions.push(`designation = $${params.length}`);
  }
  if (search && String(search).trim()) {
    params.push(`%${String(search).trim()}%`);
    conditions.push(`(name ILIKE $${params.length} OR phone ILIKE $${params.length})`);
  }

  let sql = `SELECT ${COLUMNS} FROM staff`;
  if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
  sql += " ORDER BY name";

  const rows = await db.all(sql, params);
  res.json(rows.map(publicStaff));
});

router.get("/:id", async (req, res) => {
  const row = await db.get(`SELECT ${COLUMNS} FROM staff WHERE id = $1`, [req.params.id]);
  if (!row) return res.status(404).json({ error: "স্টাফ পাওয়া যায়নি" });
  res.json(publicStaff(row));
});

// If a userId is supplied, confirm it actually points at an existing
// `users` row before saving — a dangling userId would otherwise silently
// make the "সফটওয়্যার লগইন যুক্ত" badge lie in the UI.
async function assertUserExists(userId) {
  if (userId == null) return;
  const user = await db.get("SELECT id FROM users WHERE id = $1", [userId]);
  if (!user) {
    const err = new Error("নির্বাচিত ব্যবহারকারী পাওয়া যায়নি");
    err.status = 400;
    throw err;
  }
}

// docs/SHIFT_SCHEDULE_PLAN.md, Phase 3 — same "check first, insert
// second" pattern as assertUserExists above, so an unknown shiftId
// surfaces as a clean 400 instead of an FK-violation 500.
async function assertShiftExists(shiftId) {
  if (shiftId == null) return;
  const shift = await db.get("SELECT id FROM shifts WHERE id = $1", [shiftId]);
  if (!shift) {
    const err = new Error("নির্বাচিত শিফট পাওয়া যায়নি");
    err.status = 400;
    throw err;
  }
}

// docs/STAFF_ATTENDANCE_PLAN.md, Phase 7 — fingerprintId/cardUid must be
// unique not just among staff (staff_fingerprint_id_unique/
// staff_card_uid_unique) but also against `students` — the same device
// punch is looked up by identifier alone (lib/devicePunch.js tries
// students first, then staff), so a value reused across both tables
// would make the staff enrollment silently unreachable rather than erroring
// loudly. Same "check both tables" reasoning applies to fingerprintId and
// cardUid independently.
async function assertDeviceIdentifiersFree({ fingerprintId, cardUid, excludeId }) {
  if (fingerprintId) {
    const inStaff = await db.get(
      `SELECT id FROM staff WHERE "fingerprintId" = $1 AND ($2::int IS NULL OR id <> $2)`,
      [fingerprintId, excludeId ?? null]
    );
    if (inStaff) {
      const err = new Error("এই ফিঙ্গারপ্রিন্ট আইডি ইতিমধ্যে অন্য স্টাফের সাথে যুক্ত আছে");
      err.status = 409;
      throw err;
    }
    const inStudents = await db.get(`SELECT id FROM students WHERE "fingerprintId" = $1`, [fingerprintId]);
    if (inStudents) {
      const err = new Error("এই ফিঙ্গারপ্রিন্ট আইডি ইতিমধ্যে একজন শিক্ষার্থীর সাথে যুক্ত আছে");
      err.status = 409;
      throw err;
    }
  }
  if (cardUid) {
    const inStaff = await db.get(
      `SELECT id FROM staff WHERE "cardUid" = $1 AND ($2::int IS NULL OR id <> $2)`,
      [cardUid, excludeId ?? null]
    );
    if (inStaff) {
      const err = new Error("এই কার্ড UID ইতিমধ্যে অন্য স্টাফের সাথে যুক্ত আছে");
      err.status = 409;
      throw err;
    }
    const inStudents = await db.get(`SELECT id FROM students WHERE "cardUid" = $1`, [cardUid]);
    if (inStudents) {
      const err = new Error("এই কার্ড UID ইতিমধ্যে একজন শিক্ষার্থীর সাথে যুক্ত আছে");
      err.status = 409;
      throw err;
    }
  }
}

router.post("/", validate(staffCreateSchema), async (req, res) => {
  const { name, phone, designation, class: cls, joiningDate, note, userId, fingerprintId, cardUid, shiftId } = req.body;

  try {
    await assertUserExists(userId ?? null);
    await assertShiftExists(shiftId ?? null);
    await assertDeviceIdentifiersFree({ fingerprintId, cardUid });
  } catch (e) {
    if (e.status === 400 || e.status === 409) return res.status(e.status).json({ error: e.message });
    throw e;
  }

  const result = await db.run(
    `INSERT INTO staff (name, phone, designation, class, "joiningDate", note, "userId", "fingerprintId", "cardUid", "shiftId", status, "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Active', $11) RETURNING id`,
    [name, phone || "", designation, cls || "", joiningDate || "", note || "", userId ?? null, fingerprintId || null, cardUid || null, shiftId ?? null, new Date().toISOString()]
  );
  const row = await db.get(`SELECT ${COLUMNS} FROM staff WHERE id = $1`, [result.insertId]);
  await recordAudit({
    action: "staff.created",
    actor: req.user,
    entityType: "staff",
    entityId: row.id,
    label: `Added staff: ${row.name} (${row.designation})`,
    details: { designation: row.designation },
  });
  res.status(201).json(publicStaff(row));
});

router.patch("/:id", validate(staffUpdateSchema), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get("SELECT * FROM staff WHERE id = $1", [id]);
  if (!existing) return res.status(404).json({ error: "স্টাফ পাওয়া যায়নি" });

  const { name, phone, designation, class: cls, joiningDate, note, userId, status, fingerprintId, cardUid, shiftId } = req.body;

  if (userId !== undefined) {
    try {
      await assertUserExists(userId);
    } catch (e) {
      if (e.status === 400) return res.status(400).json({ error: e.message });
      throw e;
    }
  }

  if (shiftId !== undefined) {
    try {
      await assertShiftExists(shiftId);
    } catch (e) {
      if (e.status === 400) return res.status(400).json({ error: e.message });
      throw e;
    }
  }

  if (fingerprintId !== undefined || cardUid !== undefined) {
    try {
      await assertDeviceIdentifiersFree({ fingerprintId, cardUid, excludeId: id });
    } catch (e) {
      if (e.status === 409) return res.status(409).json({ error: e.message });
      throw e;
    }
  }

  const sets = [];
  const params = [];
  function set(col, value) {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  }

  if (name !== undefined) set("name", name);
  if (phone !== undefined) set("phone", phone);
  if (designation !== undefined) set("designation", designation);
  if (cls !== undefined) set("class", cls);
  if (joiningDate !== undefined) set('"joiningDate"', joiningDate);
  if (note !== undefined) set("note", note);
  if (userId !== undefined) set('"userId"', userId);
  if (status !== undefined) set("status", status);
  if (fingerprintId !== undefined) set('"fingerprintId"', fingerprintId || null);
  if (cardUid !== undefined) set('"cardUid"', cardUid || null);
  if (shiftId !== undefined) set('"shiftId"', shiftId);

  if (sets.length > 0) {
    params.push(id);
    await db.run(`UPDATE staff SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
  }

  const row = await db.get(`SELECT ${COLUMNS} FROM staff WHERE id = $1`, [id]);
  await recordAudit({
    action: "staff.updated",
    actor: req.user,
    entityType: "staff",
    entityId: id,
    label: `Updated staff: ${row.name}`,
    details: { fields: Object.keys(req.body) },
  });
  res.json(publicStaff(row));
});

module.exports = router;
