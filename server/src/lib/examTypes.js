// Fixed list of exam types the Results module allows selecting from
// (docs/CURRENT_TASK.md, ad-hoc — "ফলাফল সেকশন — পরীক্ষার ধরন ফিক্সড-লিস্ট").
//
// `value` is the canonical English name — this is what gets saved in the
// `results.examName` column, always, regardless of which UI language the
// person entering marks has selected. `labelBn` is only for display.
//
// KEEP IN SYNC WITH: client/src/lib/examTypes.ts (same 10 values/order).
// This is intentionally duplicated rather than auto-generated (see
// AGENTS.md → "Single source of truth" for why) — if you add/rename/remove
// an entry here, make the same change there.
const EXAM_TYPES = [
  { value: "Weekly Test", labelBn: "সাপ্তাহিক পরীক্ষা" },
  { value: "Monthly Test", labelBn: "মাসিক পরীক্ষা" },
  { value: "Periodic Test", labelBn: "সাময়িক পরীক্ষা" },
  { value: "Half-Yearly Examination", labelBn: "অর্ধবার্ষিক পরীক্ষা" },
  { value: "Annual Examination", labelBn: "বার্ষিক পরীক্ষা" },
  { value: "Pre-Selection Test", labelBn: "প্রাক-নির্বাচনী পরীক্ষা" },
  { value: "Selection Test", labelBn: "নির্বাচনী পরীক্ষা" },
  { value: "Pre-Test", labelBn: "প্রাক-পরীক্ষা" },
  { value: "Model Test", labelBn: "মডেল টেস্ট" },
  { value: "Test Examination", labelBn: "টেস্ট পরীক্ষা" },
];

const EXAM_TYPE_VALUES = EXAM_TYPES.map((e) => e.value);

module.exports = { EXAM_TYPES, EXAM_TYPE_VALUES };
