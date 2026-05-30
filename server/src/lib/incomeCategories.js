/**
 * Income category helpers | আয়ের ক্যাটাগরি সেটিংস থেকে পড়া/লেখা
 * Stored in settings table as JSON key: incomeCategories
 */
const DEFAULT_CATEGORIES = [
  "Student Fee",
  "Donation",
  "Zakat",
  "Sadaqah",
  "Government Grant",
  "Event Income",
  "Other",
];

function getDb() {
  return require("../db");
}

function getIncomeCategories() {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'incomeCategories'").get();
  if (!row?.value) return [...DEFAULT_CATEGORIES];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) && parsed.length ? parsed : [...DEFAULT_CATEGORIES];
  } catch {
    return [...DEFAULT_CATEGORIES];
  }
}

function setIncomeCategories(categories) {
  const db = getDb();
  const clean = categories.map((c) => String(c).trim()).filter(Boolean);
  if (!clean.includes("Student Fee")) clean.unshift("Student Fee");
  if (!clean.length) throw new Error("At least one category required");
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('incomeCategories', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(JSON.stringify(clean));
  return clean;
}

module.exports = { getIncomeCategories, setIncomeCategories, DEFAULT_CATEGORIES };
