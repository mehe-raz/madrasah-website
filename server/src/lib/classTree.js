// ============================================================================
// classTree.js  (Class/Jamaat Hierarchy — Part 1 / 2: Data structure + Backend)
// ============================================================================
// Replaces the flat classOptions list (lib/classOptions.js, still kept as-is
// for backward compatibility) with a hierarchical tree: বিভাগ (department) ->
// গ্রুপ/নেসাব (group/curriculum) -> জামাত/ক্লাস (leaf). Only leaf nodes are
// ever stored on a student record (students.class keeps being a single
// string, exactly as before — no schema change, no student migration).
//
// Stored the same way classOptions.js stores its flat list: one JSON blob
// in the generic settings(key, value) table, under its own key, so both
// coexist without conflict during the Students.tsx/Settings.tsx rollout in
// Part 2.
//
// Tree shape (see DEFAULT_CLASS_TREE below for a concrete example):
//   {
//     id: "hifz",              // stable identifier, only used for React keys
//     bn: "হিফজ বিভাগ",         // Bengali label — what staff/guardians see
//     en: "hifz",               // English data-label — the slug; on a leaf
//                                // node this is the exact value written to
//                                // students.class (must never change once
//                                // students exist under it)
//     leaf: false,               // true only on nodes with no children —
//                                 // those are the actual selectable
//                                 // classes/jamaats
//     children: [ ... ]          // same shape, recursively; omitted/[] on
//                                 // leaves
//   }
//
// Depth is at most 3 levels below the root array (department -> group/nesab
// -> jamat), but sanitizeClassTree() does not hard-code that — it just walks
// however deep it's given, so a future দুই-স্তরের বিভাগ (e.g. জেনারেল, which
// only has one level of children) works the same way.
// ============================================================================

const db = require("./../db");

const SETTINGS_KEY = "classOptionsTree";
const MAX_DEPARTMENTS = 20;
const MAX_CHILDREN_PER_NODE = 60;
const MAX_TREE_DEPTH = 4; // root departments (1) + up to 3 nested levels
const BN_MAX_LEN = 80;
const EN_MAX_LEN = 60;

// Same rule as classOptions.js: the English data-label is a plain identifier
// stored on student records / used in exports & filters, so only
// ASCII letters, digits and hyphens are allowed here — never Bengali text or
// spaces. This is deliberately stricter than the earlier flat-list version's
// conversation history (which briefly considered allowing Bengali in "en")
// — that idea was for a different problem (migrating pre-existing Bengali
// data) and doesn't apply here since Part 1 seeds a fresh tree with its own
// English slugs and drops old free-text student data instead of migrating it.
const EN_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function cleanText(value, maxLen) {
  return String(value ?? "").trim().slice(0, maxLen);
}

// Walks the whole tree once to sanitize every node and collect leaves, so
// callers don't need a second pass. Drops malformed nodes instead of
// throwing (same philosophy as classOptions.js) so one bad node from a
// future buggy client can't corrupt the whole tree. `en` values are
// deduped GLOBALLY across the entire tree (not just per-sibling), because a
// leaf's `en` is what actually lands in students.class and ambiguous/
// duplicate slugs anywhere in the tree would make that value meaningless.
function sanitizeClassTree(input) {
  const seenEn = new Set();

  function sanitizeLevel(nodes, depth) {
    if (!Array.isArray(nodes) || depth > MAX_TREE_DEPTH) return [];
    const out = [];
    for (const raw of nodes.slice(0, depth === 1 ? MAX_DEPARTMENTS : MAX_CHILDREN_PER_NODE)) {
      const bn = cleanText(raw?.bn, BN_MAX_LEN);
      const en = cleanText(raw?.en, EN_MAX_LEN).toLowerCase();
      if (!bn || !en || !EN_SLUG_RE.test(en)) continue;
      if (seenEn.has(en)) continue;
      seenEn.add(en);

      const children = sanitizeLevel(raw?.children, depth + 1);
      out.push({
        id: cleanText(raw?.id, EN_MAX_LEN) || en,
        bn,
        en,
        leaf: children.length === 0,
        children,
      });
    }
    return out;
  }

  return sanitizeLevel(input, 1);
}

// Flattens the tree to just its leaves, each carrying its full bn/en path —
// this is the shape Part 2's cascading dropdowns and any legacy consumer
// that just wants "every selectable class" will want (e.g. building a
// single-level <select> fallback, or CSV export headers). Not used yet by
// any route in Part 1, but kept here (next to the data it derives from)
// rather than duplicated later in a frontend file.
function flattenClassTree(tree) {
  const leaves = [];
  function walk(nodes, path) {
    for (const node of nodes) {
      const nextPath = [...path, { bn: node.bn, en: node.en }];
      if (!node.children || node.children.length === 0) {
        leaves.push({
          en: node.en,
          bn: node.bn,
          path: nextPath,
          bnPath: nextPath.map((p) => p.bn).join(" / "),
        });
      } else {
        walk(node.children, nextPath);
      }
    }
  }
  walk(tree || [], []);
  return leaves;
}

// Default seed tree — see the project's class/jamaat planning conversation
// for the exact source list. Applied to every newly-provisioned institution
// (tenantProvision.js) so a fresh madrasah never starts with an empty class
// list; Super Admin can still add/rename/remove entries afterward from
// Settings (Part 2 UI carries a warning about editing this without
// technical help, since `en` values are load-bearing identifiers).
const DEFAULT_CLASS_TREE = sanitizeClassTree([
  {
    id: "hifz",
    bn: "হিফজ বিভাগ",
    en: "hifz",
    children: [
      { id: "hifz-ka", bn: "ক গ্রুপ", en: "hifz-group-ka" },
      { id: "hifz-kha", bn: "খ গ্রুপ", en: "hifz-group-kha" },
      { id: "hifz-ga", bn: "গ গ্রুপ", en: "hifz-group-ga" },
      { id: "hifz-gha", bn: "ঘ গ্রুপ", en: "hifz-group-gha" },
      { id: "hifz-nga", bn: "ঙ গ্রুপ", en: "hifz-group-nga" },
    ],
  },
  {
    id: "nurani-najera",
    bn: "নূরানী ও নাজেরা বিভাগ",
    en: "nurani-najera",
    children: [
      { id: "nurani-ka", bn: "ক গ্রুপ", en: "nurani-group-ka" },
      { id: "nurani-kha", bn: "খ গ্রুপ", en: "nurani-group-kha" },
      { id: "nurani-ga", bn: "গ গ্রুপ", en: "nurani-group-ga" },
      { id: "nurani-gha", bn: "ঘ গ্রুপ", en: "nurani-group-gha" },
    ],
  },
  {
    id: "kitab",
    bn: "কিতাব বিভাগ",
    en: "kitab",
    children: [
      {
        id: "madani-nesab",
        bn: "মাদানী নেসাব",
        en: "madani-nesab",
        children: [
          { id: "madani-miyan", bn: "মীযান জামাত", en: "madani-miyan" },
          { id: "madani-nahbemir", bn: "নাহবেমীর জামাত", en: "madani-nahbemir" },
          { id: "madani-hidayatunnahu", bn: "হিদায়াতুন নাহু জামাত", en: "madani-hidayatunnahu" },
          { id: "madani-kafiya", bn: "কাফিয়া জামাত", en: "madani-kafiya" },
          { id: "madani-sharhejami", bn: "শরহে জামি জামাত", en: "madani-sharhejami" },
          { id: "madani-sharhebekaya", bn: "শরহে বেকায়া জামাত", en: "madani-sharhebekaya" },
          { id: "madani-hedaya", bn: "হেদায়া জামাত", en: "madani-hedaya" },
          { id: "madani-meshkat", bn: "মেশকাত জামাত", en: "madani-meshkat" },
          { id: "madani-dawra", bn: "দাওরায়ে হাদিস", en: "madani-dawra-hadith" },
          { id: "madani-ifta", bn: "ইফতা", en: "madani-ifta" },
          { id: "madani-tafsir", bn: "তাফসির", en: "madani-tafsir" },
          { id: "madani-hadith", bn: "হাদিস", en: "madani-hadith" },
          { id: "madani-adab", bn: "আদব (আরবি ভাষা ও সাহিত্য)", en: "madani-adab" },
          { id: "madani-qiraat", bn: "কিরাআত", en: "madani-qiraat" },
        ],
      },
      {
        id: "dorse-nizami-nesab",
        bn: "দরসে নেজামী নেসাব (কাদীম নেসাব)",
        en: "dorse-nizami-nesab",
        children: [
          { id: "dorse-miyan", bn: "মীযান", en: "dorse-miyan" },
          { id: "dorse-nahbemir", bn: "নাহবেমীর", en: "dorse-nahbemir" },
          { id: "dorse-hidayatunnahu", bn: "হিদায়াতুন নাহু", en: "dorse-hidayatunnahu" },
          { id: "dorse-kafiya", bn: "কাফিয়া", en: "dorse-kafiya" },
          { id: "dorse-sharhejami", bn: "শরহে জামি", en: "dorse-sharhejami" },
          { id: "dorse-sharhebekaya", bn: "শরহে বেকায়া", en: "dorse-sharhebekaya" },
          { id: "dorse-hedaya", bn: "হেদায়া (প্রথম ও দ্বিতীয়)", en: "dorse-hedaya" },
          { id: "dorse-meshkat", bn: "মেশকাত", en: "dorse-meshkat" },
          { id: "dorse-dawra", bn: "দাওরায়ে হাদিস", en: "dorse-dawra-hadith" },
          { id: "dorse-ifta", bn: "ইফতা", en: "dorse-ifta" },
          { id: "dorse-tafsir", bn: "তাফসির", en: "dorse-tafsir" },
          { id: "dorse-hadith", bn: "হাদিস", en: "dorse-hadith" },
          { id: "dorse-adab", bn: "আদব (আরবি ভাষা ও সাহিত্য)", en: "dorse-adab" },
          { id: "dorse-qiraat", bn: "কিরাআত", en: "dorse-qiraat" },
        ],
      },
    ],
  },
  {
    id: "general",
    bn: "জেনারেল বিভাগ",
    en: "general",
    children: [
      { id: "general-play", bn: "প্লে", en: "general-play" },
      { id: "general-nursery", bn: "নার্সারি", en: "general-nursery" },
      { id: "general-class-1", bn: "ক্লাস ১", en: "general-class-1" },
      { id: "general-class-2", bn: "ক্লাস ২", en: "general-class-2" },
      { id: "general-class-3", bn: "ক্লাস ৩", en: "general-class-3" },
      { id: "general-class-4", bn: "ক্লাস ৪", en: "general-class-4" },
      { id: "general-class-5", bn: "ক্লাস ৫", en: "general-class-5" },
    ],
  },
]);

async function getClassTree() {
  const row = await db.get("SELECT value FROM settings WHERE key = $1", [SETTINGS_KEY]);
  if (!row) return [];
  try {
    return sanitizeClassTree(JSON.parse(row.value));
  } catch {
    return [];
  }
}

async function saveClassTree(input) {
  const tree = sanitizeClassTree(input);
  await db.run(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [SETTINGS_KEY, JSON.stringify(tree)]
  );
  return tree;
}

module.exports = {
  SETTINGS_KEY,
  EN_SLUG_RE,
  sanitizeClassTree,
  flattenClassTree,
  DEFAULT_CLASS_TREE,
  getClassTree,
  saveClassTree,
};
