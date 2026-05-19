const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const PDFDocument = require("pdfkit");

const router = express.Router();

function getSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  return rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
}

function logoBuffer(logo) {
  if (!logo || !String(logo).startsWith("data:image/")) return null;
  const base64 = String(logo).split(",")[1];
  if (!base64) return null;
  try {
    return Buffer.from(base64, "base64");
  } catch {
    return null;
  }
}

router.get("/classes/list", (_req, res) => {
  const rows = db.prepare("SELECT DISTINCT class FROM students WHERE class != '' ORDER BY class").all();
  res.json(rows.map((r) => r.class));
});

router.get("/:id/attendance", (req, res) => {
  const { from, to, month } = req.query;
  let f = from;
  let t = to;
  if (month) {
    f = `${month}-01`;
    const [y, m] = String(month).split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    t = `${month}-${String(last).padStart(2, "0")}`;
  }
  if (!f) f = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  if (!t) t = new Date().toISOString().slice(0, 10);

  const rows = db
    .prepare(
      `SELECT date, status FROM attendance WHERE studentId = ? AND date >= ? AND date <= ? ORDER BY date`
    )
    .all(req.params.id, f, t);

  const summary = { present: 0, absent: 0, late: 0 };
  rows.forEach((r) => {
    if (r.status === "উপস্থিত") summary.present++;
    else if (r.status === "অনুপস্থিত") summary.absent++;
    else if (r.status === "দেরিতে") summary.late++;
  });
  res.json({ from: f, to: t, records: rows, summary });
});

router.get("/", (req, res) => {
  const { dept, search, status, class: cls } = req.query;
  let rows = db.prepare("SELECT * FROM students ORDER BY roll").all();
  if (status === "সক্রিয়") rows = rows.filter((s) => s.status === "সক্রিয়");
  else if (status === "নিষ্ক্রিয়") rows = rows.filter((s) => s.status === "নিষ্ক্রিয়");
  if (cls) rows = rows.filter((s) => s.class === cls);
  if (dept && dept !== "সব") rows = rows.filter((s) => s.dept === dept);
  if (search) {
    const q = String(search).toLowerCase();
    rows = rows.filter(
      (s) =>
        s.name.includes(search) ||
        s.nameEn.toLowerCase().includes(q) ||
        s.roll.includes(search)
    );
  }
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM students WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "ছাত্র পাওয়া যায়নি" });
  
  // Get attendance summary
  const attendanceRows = db.prepare("SELECT status FROM attendance WHERE studentId = ?").all(req.params.id);
  const attendanceSummary = {
    total: attendanceRows.length,
    present: 0,
    absent: 0,
    late: 0
  };
  attendanceRows.forEach((r) => {
    if (r.status === "উপস্থিত") attendanceSummary.present++;
    else if (r.status === "অনুপস্থিত") attendanceSummary.absent++;
    else if (r.status === "দেরিতে") attendanceSummary.late++;
  });
  
  res.json({ ...row, attendanceSummary });
});

router.post("/", (req, res) => {
  const { name, class: cls, dept, type, fee } = req.body;
  if (!name) return res.status(400).json({ error: "নাম আবশ্যক" });
  const maxId = db.prepare("SELECT MAX(id) as m FROM students").get().m || 0;
  const maxRoll = db.prepare("SELECT MAX(CAST(roll AS INTEGER)) as m FROM students").get().m || 0;
  const id = maxId + 1;
  const roll = String(maxRoll + 1).padStart(3, "0");
  const student = {
    id,
    name,
    nameEn: req.body.nameEn || "",
    roll,
    class: cls || "",
    dept: dept || "হিফজ",
    type: type || "আবাসিক",
    fee: fee != null ? Number(fee) : 1500,
    due: req.body.due != null ? Number(req.body.due) : 0,
    phone: req.body.phone || "",
    blood: req.body.blood || "O+",
    para: req.body.para || 0,
    status: "সক্রিয়",
  };
  db.prepare(`
    INSERT INTO students (id, name, nameEn, roll, class, dept, type, fee, due, phone, blood, para, status)
    VALUES (@id, @name, @nameEn, @roll, @class, @dept, @type, @fee, @due, @phone, @blood, @para, @status)
  `).run(student);
  res.status(201).json(student);
});

router.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM students WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "ছাত্র পাওয়া যায়নি" });
  const updated = { ...existing, ...req.body, id: existing.id };
  db.prepare(`
    UPDATE students SET name=@name, nameEn=@nameEn, roll=@roll, class=@class, dept=@dept,
    type=@type, fee=@fee, due=@due, phone=@phone, blood=@blood, para=@para, status=@status
    WHERE id=@id
  `).run(updated);
  res.json(updated);
});

router.delete("/:id", requirePermission("*"), (req, res) => {
  const existing = db.prepare("SELECT * FROM students WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "ছাত্র পাওয়া যায়নি" });
  
  // Delete attendance records
  db.prepare("DELETE FROM attendance WHERE studentId = ?").run(req.params.id);
  // Delete student
  db.prepare("DELETE FROM students WHERE id = ?").run(req.params.id);
  
  res.json({ ok: true, message: "ছাত্র মুছে ফেলা হয়েছে" });
});

router.get("/:id/pdf", async (req, res) => {
  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(req.params.id);
  if (!student) return res.status(404).json({ error: "ছাত্র পাওয়া যায়নি" });
  
  // Get attendance summary
  const attendanceRows = db.prepare("SELECT status FROM attendance WHERE studentId = ?").all(req.params.id);
  const attendanceSummary = {
    total: attendanceRows.length,
    present: 0,
    absent: 0,
    late: 0
  };
  attendanceRows.forEach((r) => {
    if (r.status === "উপস্থিত") attendanceSummary.present++;
    else if (r.status === "অনুপস্থিত") attendanceSummary.absent++;
    else if (r.status === "দেরিতে") attendanceSummary.late++;
  });

  try {
    console.log("Starting PDF generation for student:", student.id);
    const settings = getSettings();
    const logo = logoBuffer(settings.logo);
    
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      console.log("PDF generated successfully for student:", student.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="student-${student.id}-${student.name.replace(/\s+/g, '-')}.pdf"`);
      res.send(pdfBuffer);
    });

    if (logo) {
      try {
        doc.image(logo, 257, 42, { fit: [80, 80] });
        doc.moveDown(5);
      } catch {
        doc.moveDown();
      }
    }
    
    // Header
    doc.fontSize(24).fillColor('#333').text('মাদ্রাসা ছাত্র প্রোফাইল', { align: 'center' });
    doc.fontSize(12).fillColor('#666').text('ছাত্র তথ্য রিসিপ্ট', { align: 'center' });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#333').lineWidth(3).stroke();
    doc.moveDown();
    
    // Student Info
    doc.fontSize(14).fillColor('#333').text('ছাত্রের তথ্য:');
    doc.moveDown();
    
    const info = [
      ['নাম:', student.name],
      ['রোল:', student.roll],
      ['শ্রেণি:', student.class || 'N/A'],
      ['বিভাগ:', student.dept],
      ['ধরন:', student.type],
      ['মাসিক বেতন:', `৳${student.fee}`],
      ['বকেয়া:', `৳${student.due}`],
      ['মোবাইল:', student.phone || 'N/A'],
      ['রক্তের গ্রুপ:', student.blood],
      ['পাড়া:', student.para || 'N/A'],
      ['অবস্থা:', student.status],
    ];
    
    info.forEach(([label, value]) => {
      doc.fontSize(12).fillColor('#333').text(label, { continued: true });
      doc.fillColor('#555').text(` ${value}`);
    });
    
    doc.moveDown();
    
    // Attendance Summary
    doc.rect(50, doc.y, 495, 100).fill('#e8f4e8');
    doc.fillColor('#2d5a2d').fontSize(16).text('হাজিরা সারসংক্ষেপ', 60, doc.y + 15);
    
    const stats = [
      ['মোট দিন', attendanceSummary.total],
      ['উপস্থিত', attendanceSummary.present],
      ['অনুপস্থিত', attendanceSummary.absent],
    ];
    
    let xPos = 60;
    stats.forEach(([label, value]) => {
      doc.rect(xPos, doc.y + 45, 150, 40).fill('#fff');
      doc.fillColor('#2d5a2d').fontSize(20).text(String(value), xPos + 75, doc.y + 55, { align: 'center' });
      doc.fillColor('#666').fontSize(11).text(label, xPos + 75, doc.y + 75, { align: 'center' });
      xPos += 165;
    });
    
    doc.y += 120;
    
    // Footer
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').lineWidth(1).stroke();
    doc.moveDown();
    doc.fontSize(10).fillColor('#999').text(`তারিখ: ${new Date().toLocaleDateString('bn-BD')}`, { align: 'center' });
    doc.text('মাদ্রাসা এরিপি সিস্টেম', { align: 'center' });
    
    doc.end();
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'PDF তৈরি করতে সমস্যা হয়েছে: ' + error.message });
  }
});

module.exports = router;
