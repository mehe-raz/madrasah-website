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

export function statusLabel(code?: string | null): string {
  if (!code) return "";
  return STATUS_LABELS_BN[code] ?? code;
}

export function typeLabel(code?: string | null): string {
  if (!code) return "";
  return TYPE_LABELS_BN[code] ?? code;
}
