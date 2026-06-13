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

async function getIncomeCategories() {
  const db = getDb();
  const row = await db.get("SELECT value FROM settings WHERE key = 'incomeCategories'");
  if (!row?.value) return [...DEFAULT_CATEGORIES];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) && parsed.length ? parsed : [...DEFAULT_CATEGORIES];
  } catch {
    return [...DEFAULT_CATEGORIES];
  }
}

async function setIncomeCategories(categories) {
  const db = getDb();
  const clean = categories.map((c) => String(c).trim()).filter(Boolean);
  if (!clean.includes("Student Fee")) clean.unshift("Student Fee");
  if (!clean.length) throw new Error("At least one category required");
  await db.run(
    "INSERT INTO settings (key, value) VALUES ('incomeCategories', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [JSON.stringify(clean)]
  );
  return clean;
}

module.exports = { getIncomeCategories, setIncomeCategories, DEFAULT_CATEGORIES };
