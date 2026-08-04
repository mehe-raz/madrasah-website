/**
 * এই ফাইলে student.dept / student.type / student.status —
 * এই তিনটা ফিল্ডের ইংরেজি কোড (যা DB/API-তে সংরক্ষিত হয়) থেকে
 * বাংলা লেবেলে ম্যাপ করা হয়, শুধু UI-তে দেখানোর জন্য।
 *
 * গুরুত্বপূর্ণ: ফর্ম সাবমিট, ফিল্টার প্যারামিটার, এবং DB-তে সবসময়
 * এই ফাইলের বাম পাশের ইংরেজি কোডগুলোই ব্যবহার করতে হবে (value)।
 * ডান পাশের বাংলা টেক্সট শুধুই ডিসপ্লে লেবেল (label)।
 */

export const DEPT_OPTIONS = ["Hifz", "Nazera", "Kitab", "Nurani", "General"] as const;
export type DeptCode = (typeof DEPT_OPTIONS)[number];

export const DEPT_LABELS_BN: Record<string, string> = {
  Hifz: "হিফজ",
  Nazera: "নাজেরা",
  Kitab: "কিতাব",
  Nurani: "নূরানী",
  General: "জেনারেল",
};

export const STATUS_OPTIONS = ["Active", "Inactive"] as const;
export type StatusCode = (typeof STATUS_OPTIONS)[number];

export const STATUS_LABELS_BN: Record<string, string> = {
  Active: "সক্রিয়",
  Inactive: "নিষ্ক্রিয়",
};

export const TYPE_OPTIONS = ["Day", "Residential"] as const;
export type TypeCode = (typeof TYPE_OPTIONS)[number];

export const TYPE_LABELS_BN: Record<string, string> = {
  Day: "অনাবাসিক",
  Residential: "আবাসিক",
};

/** কোড থেকে বাংলা লেবেল বের করে; অচেনা/খালি কোড হলে কোডটাই ফেরত দেয় (fallback)। */
export function deptLabel(code?: string | null): string {
  if (!code) return "";
  return DEPT_LABELS_BN[code] ?? code;
}

// Class/jamaat tree top-level department slugs (hifz / nurani-najera / kitab
// / general — see server/src/lib/classTree.js DEFAULT_CLASS_TREE) mapped to
// this file's existing dept codes, so picking a class via the cascading
// tree picker (client/src/components/ui/ClassCascadeSelect.tsx) can
// auto-derive student.dept instead of a separate manual Select (Students.tsx,
// class/jamaat hierarchy Part 2B). "Hifz" is kept unchanged deliberately —
// server/src/routes/hifz.js's Hifz Tracking module filters students by the
// exact string dept = 'Hifz'. "nurani-najera" (the tree merges the old
// separate Nurani/Nazera departments into one) maps to the existing "Nurani"
// code rather than introducing a new one — DEPT_LABELS_BN above still has a
// "Nazera" entry so any pre-existing legacy record keeps displaying
// correctly, it just won't be produced by new admissions anymore.
export const TREE_TOP_LEVEL_TO_DEPT: Record<string, string> = {
  hifz: "Hifz",
  "nurani-najera": "Nurani",
  kitab: "Kitab",
  general: "General",
};

/** Maps a class-tree top-level node's `en` slug to the dept code this app
 * already understands. Falls back to the raw slug if it's an unrecognized
 * top-level department (e.g. a Super Admin added a brand new one from
 * Settings) so the dept field never silently stays blank. */
export function deptCodeFromTreeTopLevel(topLevelEn?: string | null): string {
  if (!topLevelEn) return "";
  return TREE_TOP_LEVEL_TO_DEPT[topLevelEn] ?? topLevelEn;
}

export function statusLabel(code?: string | null): string {
  if (!code) return "";
  return STATUS_LABELS_BN[code] ?? code;
}

export function typeLabel(code?: string | null): string {
  if (!code) return "";
  return TYPE_LABELS_BN[code] ?? code;
}
