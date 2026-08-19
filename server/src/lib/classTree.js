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
const MAX_SUBJECTS_PER_LEAF = 30;

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

// Subjects (বিষয়) live only on leaf nodes (জামাত/ক্লাস) — a department or
// নেসাব/গ্রুপ groups other nodes, it isn't itself a class students sit in,
// so it never carries its own subject list. `en` is deduped only WITHIN one
// leaf's own subject list (not globally like class `en` values), since
// nothing outside this node currently reads a subject's `en` — it's just a
// stable per-subject identifier for this leaf's own list (edit/delete by
// value, future marks-entry keying), not a cross-tree slug.
function sanitizeSubjects(input) {
  if (!Array.isArray(input)) return [];
  const seenEn = new Set();
  const out = [];
  for (const raw of input.slice(0, MAX_SUBJECTS_PER_LEAF)) {
    const bn = cleanText(raw?.bn, BN_MAX_LEN);
    const en = cleanText(raw?.en, EN_MAX_LEN).toLowerCase();
    if (!bn || !en || !EN_SLUG_RE.test(en)) continue;
    if (seenEn.has(en)) continue;
    seenEn.add(en);
    out.push({ id: cleanText(raw?.id, EN_MAX_LEN) || en, bn, en });
  }
  return out;
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
      const leaf = children.length === 0;
      out.push({
        id: cleanText(raw?.id, EN_MAX_LEN) || en,
        bn,
        en,
        leaf,
        children,
        subjects: leaf ? sanitizeSubjects(raw?.subjects) : [],
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

// docs/GENERAL_MODE_PLAN.md, Phase 2 — default seed for a "general"
// institution_type tenant (school / college / coaching center — plan doc §5
// open question 1 decided these share one enum value, so there's one shared
// default tree rather than a separate seed per sub-kind). Same sanitized
// tree shape as DEFAULT_CLASS_TREE above; a fresh general tenant's own Super
// Admin can rename/add/remove nodes afterward exactly like a madrasah tenant
// can with theirs — this is just the starting point.
const DEFAULT_CLASS_TREE_GENERAL = sanitizeClassTree([
  {
    id: "school",
    bn: "স্কুল বিভাগ",
    en: "school",
    children: [
      { id: "school-play", bn: "প্লে", en: "school-play" },
      { id: "school-nursery", bn: "নার্সারি", en: "school-nursery" },
      { id: "school-class-1", bn: "ক্লাস ১", en: "school-class-1" },
      { id: "school-class-2", bn: "ক্লাস ২", en: "school-class-2" },
      { id: "school-class-3", bn: "ক্লাস ৩", en: "school-class-3" },
      { id: "school-class-4", bn: "ক্লাস ৪", en: "school-class-4" },
      { id: "school-class-5", bn: "ক্লাস ৫", en: "school-class-5" },
      { id: "school-class-6", bn: "ক্লাস ৬", en: "school-class-6" },
      { id: "school-class-7", bn: "ক্লাস ৭", en: "school-class-7" },
      { id: "school-class-8", bn: "ক্লাস ৮", en: "school-class-8" },
      { id: "school-class-9", bn: "ক্লাস ৯", en: "school-class-9" },
      { id: "school-class-10", bn: "ক্লাস ১০", en: "school-class-10" },
    ],
  },
  {
    id: "college",
    bn: "কলেজ বিভাগ",
    en: "college",
    children: [
      { id: "college-hsc-1", bn: "একাদশ শ্রেণি", en: "college-hsc-1" },
      { id: "college-hsc-2", bn: "দ্বাদশ শ্রেণি", en: "college-hsc-2" },
    ],
  },
]);

// Finds a node by its full `en`-slug path (root -> ... -> node), same path
// shape the client already builds for add/delete (see client/lib/classTree.ts
// findClassTreePath / removeClassTreeNode). Returns the live node reference
// from within `tree` (not a copy) — callers here only read from it before
// building an immutable replacement tree.
function findClassTreeNodeByPath(tree, path) {
  if (!Array.isArray(path) || path.length === 0) return null;
  let nodes = tree;
  let node = null;
  for (const en of path) {
    node = (nodes || []).find((n) => n.en === en);
    if (!node) return null;
    nodes = node.children;
  }
  return node;
}

// Every `en` value currently used anywhere in the tree, so a rename can be
// checked against global uniqueness the same way sanitizeClassTree()
// enforces it on write.
function collectAllEnValues(tree) {
  const out = new Set();
  function walk(nodes) {
    for (const node of nodes || []) {
      out.add(node.en);
      if (node.children?.length) walk(node.children);
    }
  }
  walk(tree);
  return out;
}

// Immutably replaces just the bn/en label of the node at `path`, leaving
// every other node (including that node's own children) untouched.
function replaceNodeLabel(nodes, path, bn, en) {
  const [head, ...rest] = path;
  return (nodes || []).map((node) => {
    if (node.en !== head) return node;
    if (rest.length === 0) return { ...node, bn, en };
    return { ...node, children: replaceNodeLabel(node.children, rest, bn, en) };
  });
}

class ClassTreeEditError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// Renames one node's বাংলা label and/or ইংরেজি data-slug in place, keeping
// its id, its children, and every other node in the tree exactly as they
// were. Only validates and builds the new tree shape — it does NOT touch
// student/teacher-assignment/etc. rows; the route handler decides whether
// that migration is needed (only when the target is a leaf and its `en`
// actually changed) and runs it in the same transaction as the save below.
function editClassTreeNode(tree, path, updates) {
  const bn = cleanText(updates?.bn, BN_MAX_LEN);
  const en = cleanText(updates?.en, EN_MAX_LEN).toLowerCase();
  if (!Array.isArray(path) || path.length === 0) {
    throw new ClassTreeEditError("অবৈধ পাথ", "INVALID_PATH");
  }
  if (!bn) throw new ClassTreeEditError("বাংলা নাম আবশ্যক", "INVALID_BN");
  if (!en || !EN_SLUG_RE.test(en)) {
    throw new ClassTreeEditError(
      "ইংরেজি ডাটা-লেবেল শুধু ছোট হাতের অক্ষর, সংখ্যা ও হাইফেন দিয়ে হতে হবে",
      "INVALID_EN"
    );
  }

  const target = findClassTreeNodeByPath(tree, path);
  if (!target) throw new ClassTreeEditError("এন্ট্রি খুঁজে পাওয়া যায়নি", "NOT_FOUND");

  const oldEn = target.en;
  const wasLeaf = !target.children || target.children.length === 0;

  if (en !== oldEn && collectAllEnValues(tree).has(en)) {
    throw new ClassTreeEditError("এই ইংরেজি ডাটা-লেবেল ইতিমধ্যে ব্যবহৃত হয়েছে", "DUPLICATE_EN");
  }

  const nextTree = sanitizeClassTree(replaceNodeLabel(tree, path, bn, en));
  return { tree: nextTree, oldEn, newEn: en, enChanged: en !== oldEn, wasLeaf };
}

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

// Tables (besides students.class, handled separately below) that store the
// SAME live leaf `en` slug and must move together when a leaf is renamed —
// i.e. anything that means "this row currently applies to that class", as
// opposed to a historical snapshot. Snapshots (results.class,
// admissions."className") are deliberately excluded: those rows are meant
// to keep reading the class a student was in *at that time*, exactly like
// they already do when a student's own class changes later (see the
// comment on the `results` table in supabase_schema.sql) — renaming would
// incorrectly rewrite history.
const LIVE_CLASS_REFERENCE_TABLES = [
  { table: "teacher_class_assignments", column: '"class"' },
  { table: "class_posts", column: '"class"' },
  { table: "guardian_reminders", column: '"targetClass"' },
];

// Moves every row that currently points at `oldEn` (a leaf class/jamaat
// slug that's being renamed) over to `newEn`, across students.class and
// every other table in LIVE_CLASS_REFERENCE_TABLES, all inside the given
// transaction client (`tx` — from db.withTransaction). Returns how many
// rows were updated in total, purely for the confirmation message. Must
// only be called for an actual rename of a LEAF node's `en` — non-leaf
// nodes and unchanged `en` values have nothing to migrate.
async function migrateLiveClassReferences(tx, oldEn, newEn) {
  let migratedCount = 0;

  const studentsResult = await tx.run(`UPDATE students SET class = $1 WHERE class = $2`, [newEn, oldEn]);
  migratedCount += studentsResult.rowCount || 0;

  for (const { table, column } of LIVE_CLASS_REFERENCE_TABLES) {
    if (table === "teacher_class_assignments") {
      // Only this table carries a unique ("userId", class) constraint, so
      // only here can a plain UPDATE hit a 23505 (a teacher who — extremely
      // rare, but possible from old data — already has a separate
      // assignment row sitting on `newEn`). Guard just this case rather
      // than merging/deleting the colliding row; it stays on `oldEn`
      // untouched, which a Super Admin can clean up by hand if it ever
      // happens.
      const result = await tx.run(
        `UPDATE teacher_class_assignments t SET class = $1
         WHERE class = $2
           AND NOT EXISTS (
             SELECT 1 FROM teacher_class_assignments dup
             WHERE dup."userId" = t."userId" AND dup.class = $1
           )`,
        [newEn, oldEn]
      );
      migratedCount += result.rowCount || 0;
      continue;
    }

    // class_posts / guardian_reminders have no such constraint — many rows
    // legitimately already share one class value, so a plain UPDATE is
    // safe here.
    const result = await tx.run(`UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`, [newEn, oldEn]);
    migratedCount += result.rowCount || 0;
  }

  // class_posts."targetClasses" (ad-hoc, docs/CURRENT_TASK.md) is a jsonb
  // ARRAY of leaf `en` slugs, not a plain text column, so it can't go
  // through the simple `column = $1 WHERE column = $2` UPDATE above —
  // every post whose array happens to contain `oldEn` needs that one
  // element replaced in place, leaving the rest of the array (any other
  // classes that same post targets) untouched. Same "live reference, keep
  // it working" reasoning as the `class` column itself.
  const targetClassesResult = await tx.run(
    `UPDATE class_posts
     SET "targetClasses" = (
       SELECT jsonb_agg(CASE WHEN elem = $1::text THEN $2::text ELSE elem END)
       FROM jsonb_array_elements_text("targetClasses") AS elem
     )
     WHERE "targetClasses" ? $1`,
    [oldEn, newEn]
  );
  migratedCount += targetClassesResult.rowCount || 0;

  return migratedCount;
}

module.exports = {
  SETTINGS_KEY,
  EN_SLUG_RE,
  sanitizeClassTree,
  flattenClassTree,
  DEFAULT_CLASS_TREE,
  DEFAULT_CLASS_TREE_GENERAL,
  getClassTree,
  saveClassTree,
  findClassTreeNodeByPath,
  editClassTreeNode,
  migrateLiveClassReferences,
  ClassTreeEditError,
};
