// Fixed list of exam types the Results module lets you pick from
// (docs/CURRENT_TASK.md, ad-hoc — "ফলাফল সেকশন — পরীক্ষার ধরন ফিক্সড-লিস্ট").
//
// `value` is the canonical English name — this is what gets sent to and
// saved by the server, always, regardless of which UI language is active.
// `labelBn`/`labelEn` are display-only; the Results screen picks one of
// them based on the current language, never the other way around.
//
// KEEP IN SYNC WITH: server/src/lib/examTypes.js (same 10 values/order).
// This is intentionally duplicated rather than auto-generated (see
// AGENTS.md → "Single source of truth" for why) — if you add/rename/remove
// an entry here, make the same change there.
export interface ExamType {
  value: string;
  labelBn: string;
  labelEn: string;
}

export const EXAM_TYPES: ExamType[] = [
  { value: "Weekly Test", labelBn: "সাপ্তাহিক পরীক্ষা", labelEn: "Weekly Test" },
  { value: "Monthly Test", labelBn: "মাসিক পরীক্ষা", labelEn: "Monthly Test" },
  { value: "Periodic Test", labelBn: "সাময়িক পরীক্ষা", labelEn: "Periodic Test" },
  { value: "Half-Yearly Examination", labelBn: "অর্ধবার্ষিক পরীক্ষা", labelEn: "Half-Yearly Examination" },
  { value: "Annual Examination", labelBn: "বার্ষিক পরীক্ষা", labelEn: "Annual Examination" },
  { value: "Pre-Selection Test", labelBn: "প্রাক-নির্বাচনী পরীক্ষা", labelEn: "Pre-Selection Test" },
  { value: "Selection Test", labelBn: "নির্বাচনী পরীক্ষা", labelEn: "Selection Test" },
  { value: "Pre-Test", labelBn: "প্রাক-পরীক্ষা", labelEn: "Pre-Test" },
  { value: "Model Test", labelBn: "মডেল টেস্ট", labelEn: "Model Test" },
  { value: "Test Examination", labelBn: "টেস্ট পরীক্ষা", labelEn: "Test Examination" },
];
