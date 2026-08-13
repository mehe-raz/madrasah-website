// ============================================================================
// routes/smsContacts.js — manual name+phone contact list for the own-SIM
// bulk SMS gateway
// ============================================================================
// docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md Phase 3. Deliberately unrelated to
// the students/guardian_students tables — see the plan doc's design
// decision #2: this is a standalone, manually-maintained list, no
// auto-import from student data. Manual entry only in this phase; no
// CSV/bulk-import (not requested).
//
// No recordAudit() here — contact add/delete is a routine, repeat UI
// action, same reasoning as student_call_log's deliberate audit omission
// (see docs/CALL_LIST_PLAN.md Phase 1 note). The broadcast-send route in
// routes/sms.js (extended in this same Phase) does audit, since sending an
// actual SMS batch is the sensitive action, not maintaining the list.
// ============================================================================

const express = require("express");
const { z } = require("zod");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { requirePlanFeature } = require("../middleware/planGate");
const { validate } = require("../middleware/validate");

const router = express.Router();
router.use(requirePermission("settings"));
router.use(requirePlanFeature("sms"));

// Same normalize-then-check approach as models/studentAdmission.js's
// isValidMobile (strip spaces/dashes, expect a plain 11-digit 01[3-9]...
// local number) — this feature's contacts are always Bangladeshi numbers.
const PHONE_RE = /^01[3-9]\d{8}$/;
const phoneField = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .refine((v) => PHONE_RE.test(v), "সঠিক বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 01712345678)");

const contactCreateSchema = z.object({
  name: z.string().trim().min(1, "নাম আবশ্যক").max(120),
  phone: phoneField,
  groupName: z.string().trim().max(60).optional().default(""),
});

const contactUpdateSchema = z.object({
  name: z.string().trim().min(1, "নাম আবশ্যক").max(120).optional(),
  phone: phoneField.optional(),
  groupName: z.string().trim().max(60).optional(),
});

router.get("/", async (_req, res) => {
  const rows = await db.all(
    'SELECT id, name, phone, "groupName", "createdAt" FROM sms_contacts ORDER BY name'
  );
  res.json(rows);
});

router.post("/", validate(contactCreateSchema), async (req, res) => {
  const { name, phone, groupName } = req.body;
  const row = await db.get(
    `INSERT INTO sms_contacts (name, phone, "groupName", "createdAt")
     VALUES ($1, $2, $3, $4) RETURNING id, name, phone, "groupName", "createdAt"`,
    [name, phone, groupName || null, new Date().toISOString()]
  );
  res.status(201).json(row);
});

router.put("/:id", validate(contactUpdateSchema), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get("SELECT id FROM sms_contacts WHERE id = $1", [id]);
  if (!existing) return res.status(404).json({ error: "কন্টাক্ট পাওয়া যায়নি" });

  const fields = [];
  const params = [];
  let i = 1;
  for (const key of ["name", "phone", "groupName"]) {
    if (req.body[key] !== undefined) {
      fields.push(`"${key}"=$${i}`);
      params.push(req.body[key] || null);
      i += 1;
    }
  }
  if (fields.length === 0) return res.status(400).json({ error: "কোনো পরিবর্তন দেওয়া হয়নি" });

  params.push(id);
  const row = await db.get(
    `UPDATE sms_contacts SET ${fields.join(", ")} WHERE id=$${i}
     RETURNING id, name, phone, "groupName", "createdAt"`,
    params
  );
  res.json(row);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.run("DELETE FROM sms_contacts WHERE id = $1", [id]);
  res.json({ ok: true });
});

module.exports = router;
