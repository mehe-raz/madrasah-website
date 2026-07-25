const db = require("./../db");

// Reuses the existing generic settings(key, value) table instead of adding a
// new table — the public site content is just one more JSON blob under its
// own key, same pattern as backupConfig.
const SETTINGS_KEY = "siteContent";
const MAX_LIST = 8;
const MAX_CLASSES = 24;
const MAX_NOTICES = 60;
const MAX_GALLERY = 24;
const MAX_ADMISSION_STEPS = 6;

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
  // Public "গ্যালারি" page. Empty by default — admin uploads real photos
  // (Cloudinary URLs, via /api/uploads) from the Website module.
  gallery: [],
  // Public "ভর্তি" (Admission) page hero + "কীভাবে কাজ করে" steps. These
  // used to be hardcoded literals in Admission.tsx; defaults here match
  // that old copy exactly so nothing visually changes until an admin
  // edits them from the Website module.
  admissionBadge: "ভর্তি",
  admissionTitle: "দ্রুত ও সহজ ভর্তি প্রক্রিয়া",
  admissionSubtitle: "একটি ক্লাস বেছে নিন, বিস্তারিত দেখুন এবং ফর্মে এগিয়ে যান — পুরো প্রক্রিয়াটি সহজ ও মোবাইল-বান্ধব।",
  admissionSteps: [
    { icon: "①", title: "ক্লাস নির্বাচন করুন", desc: "শিক্ষার্থীর বয়স ও পর্যায় অনুযায়ী উপযুক্ত ক্লাস বেছে নিন।" },
    { icon: "②", title: "ফর্ম পূরণ করুন", desc: "ভর্তি ফর্ম খুলে প্রয়োজনীয় তথ্য দিয়ে পূরণ করুন।" },
    { icon: "③", title: "যোগাযোগের অপেক্ষা করুন", desc: "আমাদের দল আবেদন পর্যালোচনা করে দ্রুত যোগাযোগ করবে।" },
  ],
  // Public "গ্যালারি" page hero + intro section text. Previously hardcoded
  // literals in Gallery.tsx; defaults match that old copy exactly.
  galleryHeroBadge: "গ্যালারি",
  galleryHeroTitle: "ক্যাম্পাসের ছবিতে কিছু মুহূর্ত",
  galleryHeroSubtitle: "প্রতিষ্ঠানের কার্যক্রম, অনুষ্ঠান ও দৈনন্দিন পরিবেশের কিছু ছবি এখানে দেখা যাবে।",
  galleryIntroBadge: "মুহূর্তসমূহ",
  galleryIntroTitle: "ক্যাম্পাস জীবনের স্মরণীয় মুহূর্ত",
  galleryIntroSubtitle: "ছবিগুলো Website সেকশন থেকে নিয়মিত আপডেট করা হয়।",
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

// Gallery photos come from /api/uploads (Cloudinary), never typed in by
// hand — but we still validate the shape server-side in case the request
// body was crafted directly. Anything that isn't a plausible http(s) image
// URL is dropped rather than stored, so the public page never renders a
// javascript:/data: URL or similar. publicId is carried through (not
// re-validated beyond length/type) so a later removal can also delete the
// underlying Cloudinary asset instead of just this reference to it.
function sanitizeGallery(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, MAX_GALLERY)
    .map((item) => ({
      url: cleanText(item && item.url, 500),
      caption: cleanText(item && item.caption, 140),
      publicId: cleanText(item && item.publicId, 200),
    }))
    .filter((item) => /^https?:\/\//i.test(item.url));
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
    gallery: sanitizeGallery(body.gallery),
    admissionBadge: cleanText(body.admissionBadge, 60),
    admissionTitle: cleanText(body.admissionTitle, 120),
    admissionSubtitle: cleanText(body.admissionSubtitle, 300),
    admissionSteps: sanitizeList(
      body.admissionSteps,
      [
        ["icon", 8],
        ["title", 60],
        ["desc", 220],
      ],
      MAX_ADMISSION_STEPS
    ),
    galleryHeroBadge: cleanText(body.galleryHeroBadge, 60),
    galleryHeroTitle: cleanText(body.galleryHeroTitle, 120),
    galleryHeroSubtitle: cleanText(body.galleryHeroSubtitle, 300),
    galleryIntroBadge: cleanText(body.galleryIntroBadge, 60),
    galleryIntroTitle: cleanText(body.galleryIntroTitle, 120),
    galleryIntroSubtitle: cleanText(body.galleryIntroSubtitle, 300),
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
