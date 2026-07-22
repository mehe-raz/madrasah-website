const db = require("./../db");

// Reuses the existing generic settings(key, value) table instead of adding a
// new table — the public site content is just one more JSON blob under its
// own key, same pattern as backupConfig.
const SETTINGS_KEY = "siteContent";
const MAX_LIST = 8;
const MAX_CLASSES = 24;
const MAX_NOTICES = 60;

const DEFAULT_CONTENT = {
  badge: "ডেমো ওয়েবসাইট — শীঘ্রই সম্পূর্ণ চালু হচ্ছে",
  heroSubtitle: "",
  highlights: [
    { icon: "🏛️", label: "প্রতিষ্ঠাকাল থেকে সুনামের সাথে পরিচালিত" },
    { icon: "🏠", label: "আবাসিক ও অনাবাসিক উভয় ব্যবস্থা" },
    { icon: "👳", label: "অভিজ্ঞ ও যোগ্য শিক্ষক পরিষদ" },
    { icon: "📞", label: "নিয়মিত অভিভাবক যোগাযোগ ব্যবস্থা" },
  ],
  departments: [
    { icon: "📖", title: "হিফজ বিভাগ", desc: "পূর্ণাঙ্গ কুরআন মুখস্থকরণ প্রোগ্রাম, অভিজ্ঞ হাফেজ শিক্ষকমণ্ডলীর তত্ত্বাবধানে।" },
    { icon: "🕌", title: "নাজেরা বিভাগ", desc: "শুদ্ধভাবে কুরআন তিলাওয়াত শিক্ষা ও তাজবীদ চর্চা।" },
    { icon: "📚", title: "কিতাব বিভাগ", desc: "দাওরায়ে হাদীস পর্যন্ত ইসলামী শিক্ষার ধারাবাহিক পাঠ্যক্রম।" },
    { icon: "🎓", title: "জেনারেল বিভাগ", desc: "দ্বীনি শিক্ষার পাশাপাশি জাতীয় শিক্ষাক্রম অনুসরণ।" },
  ],
  // Public "ক্লাস ও কোর্সসমূহ" / "ভর্তি" pages read from this list — admin
  // manages it from the Website module, same pattern as departments above.
  classes: [],
  // Public "নোটিসেস" page. Empty by default; admin adds real notices from
  // the Website module. Sorted newest-first on the client.
  notices: [],
  // Shown only on the public "এবাউট" (About) page — kept separate from
  // heroSubtitle/highlights above so About never mirrors the Home page.
  aboutIntro: "",
  aboutMission: "",
};

function cleanText(value, maxLen) {
  const s = value == null ? "" : String(value).trim();
  return maxLen ? s.slice(0, maxLen) : s;
}

function sanitizeList(list, fields, max = MAX_LIST) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, max).map((item) => {
    const out = {};
    for (const [key, len] of fields) out[key] = cleanText(item && item[key], len);
    return out;
  });
}

function sanitizeContent(input) {
  const body = input && typeof input === "object" ? input : {};
  return {
    badge: cleanText(body.badge, 120),
    heroSubtitle: cleanText(body.heroSubtitle, 300),
    highlights: sanitizeList(body.highlights, [
      ["icon", 8],
      ["label", 140],
    ]),
    departments: sanitizeList(body.departments, [
      ["icon", 8],
      ["title", 60],
      ["desc", 220],
    ]),
    classes: sanitizeList(
      body.classes,
      [
        ["icon", 8],
        ["title", 60],
        ["desc", 160],
      ],
      MAX_CLASSES
    ),
    notices: sanitizeList(
      body.notices,
      [
        ["title", 140],
        ["date", 10],
        ["body", 600],
      ],
      MAX_NOTICES
    ),
    aboutIntro: cleanText(body.aboutIntro, 500),
    aboutMission: cleanText(body.aboutMission, 500),
  };
}

async function getSiteContent() {
  const row = await db.get("SELECT value FROM settings WHERE key = $1", [SETTINGS_KEY]);
  if (!row) return DEFAULT_CONTENT;
  try {
    return sanitizeContent(JSON.parse(row.value));
  } catch {
    return DEFAULT_CONTENT;
  }
}

async function saveSiteContent(input) {
  const content = sanitizeContent(input);
  await db.run(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [SETTINGS_KEY, JSON.stringify(content)]
  );
  return content;
}

module.exports = { getSiteContent, saveSiteContent, sanitizeContent, DEFAULT_CONTENT };
