const db = require("./../db");

// Reuses the existing generic settings(key, value) table instead of adding a
// new table — same pattern as siteContent.js / backupConfig: one more JSON
// blob under its own key.
//
// This is the single source of truth for a tenant's class/jamaat list,
// managed by Super Admin from Settings.tsx. Two places read it:
//   - the authenticated admission form (Students.tsx, via /api/class-options)
//   - the public admission-apply page (AdmissionApply.tsx, via
//     /api/public/class-options), so both stay in sync automatically.
const SETTINGS_KEY = "classOptions";
const MAX_OPTIONS = 60;
const BN_MAX_LEN = 60;
const EN_MAX_LEN = 60;

// English "data label" is a slug used as the stored value on student
// records (and in exports/filters), so it must stay stable and safe to use
// as a plain identifier — Bengali text or spaces are not allowed here (the
// Bengali display name is a separate field).
const EN_SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;

function cleanText(value, maxLen) {
  return String(value ?? "").trim().slice(0, maxLen);
}

// Drops malformed/empty entries and de-dupes on the English slug (which is
// what's actually stored on student records) rather than throwing, so a bad
// row from an older client never corrupts the whole list.
function sanitizeOptions(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const cleaned = [];
  for (const raw of input.slice(0, MAX_OPTIONS)) {
    const bn = cleanText(raw?.bn, BN_MAX_LEN);
    const en = cleanText(raw?.en, EN_MAX_LEN);
    if (!bn || !en || !EN_SLUG_RE.test(en)) continue;
    const key = en.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ bn, en });
  }
  return cleaned.map((option, index) => ({ ...option, order: index }));
}

async function getClassOptions() {
  const row = await db.get("SELECT value FROM settings WHERE key = $1", [SETTINGS_KEY]);
  if (!row) return [];
  try {
    return sanitizeOptions(JSON.parse(row.value));
  } catch {
    return [];
  }
}

async function saveClassOptions(input) {
  const options = sanitizeOptions(input);
  await db.run(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [SETTINGS_KEY, JSON.stringify(options)]
  );
  return options;
}

module.exports = { getClassOptions, saveClassOptions, sanitizeOptions };
