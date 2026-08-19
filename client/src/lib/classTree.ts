import type { ClassTreeNode, ClassTreeSubject } from "../types";
import { deptCodeFromTreeTopLevel } from "./labels";

// Client-side counterpart to server/src/lib/classTree.js's flattenClassTree
// — same shape, same " / " path separator — so the cascading picker
// (ClassCascadeSelect) and any place that just needs to show/look up a
// student's `class` value (lists, filters, print reports) read the tree the
// same way instead of each re-implementing the walk.

export interface ClassTreeLeaf {
  en: string;
  bn: string;
  bnPath: string;
}

export function flattenClassTree(tree: ClassTreeNode[]): ClassTreeLeaf[] {
  const leaves: ClassTreeLeaf[] = [];
  function walk(nodes: ClassTreeNode[], path: string[]) {
    for (const node of nodes) {
      const nextPath = [...path, node.bn];
      if (!node.children || node.children.length === 0) {
        leaves.push({ en: node.en, bn: node.bn, bnPath: nextPath.join(" / ") });
      } else {
        walk(node.children, nextPath);
      }
    }
  }
  walk(tree || [], []);
  return leaves;
}

// docs/GENERAL_MODE_PLAN.md, Phase 4 — department filter options (Students
// list filter, Attendance dept tabs) derived from this tenant's own tree
// top-level departments, instead of a hardcoded madrasah-only list. Works
// the same way for a madrasah tenant (hifz/nurani-najera/kitab/general) and
// a "general" institution_type tenant (school/college — see
// server/src/lib/classTree.js DEFAULT_CLASS_TREE_GENERAL), and picks up any
// custom top-level department a Super Admin adds later from Settings,
// without needing a code change here. Value is the same dept code a student
// record actually carries (deptCodeFromTreeTopLevel); label is the tree's
// own বাংলা name for that department, deduplicated by value.
export function deptFilterOptions(tree: ClassTreeNode[]): { value: string; label: string }[] {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const node of tree || []) {
    const value = deptCodeFromTreeTopLevel(node.en);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label: node.bn });
  }
  return out;
}

/** Full বিভাগ -> ... -> leaf path of nodes for a given leaf `en`, or null if not found. */
export function findClassTreePath(tree: ClassTreeNode[], en: string): ClassTreeNode[] | null {
  if (!en) return null;
  function walk(nodes: ClassTreeNode[], path: ClassTreeNode[]): ClassTreeNode[] | null {
    for (const node of nodes) {
      const nextPath = [...path, node];
      if (node.en === en && (!node.children || node.children.length === 0)) return nextPath;
      if (node.children?.length) {
        const found = walk(node.children, nextPath);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(tree || [], []);
}

/** "হিফজ বিভাগ / ক গ্রুপ" style label for a stored leaf `en` value, or the raw
 * value itself if it isn't found in the tree (e.g. legacy/demo data that
 * predates this tree — see class/jamaat hierarchy conversation). */
export function classTreeLabel(tree: ClassTreeNode[], en: string): string {
  const path = findClassTreePath(tree, en);
  if (!path) return en;
  return path.map((node) => node.bn).join(" / ");
}

/** Just the leaf's own বাংলা name (e.g. "পঞ্চম শ্রেণী"), without the
 * বিভাগ/নেসাব ancestors classTreeLabel prefixes it with — for flat
 * "pick any class" dropdowns (Income, BulkSms, Results, ClassPosts) where
 * every option is a leaf already and repeating its full ancestry on each
 * one is just noise. Falls back to the raw value the same way
 * classTreeLabel does when `en` isn't found in the tree. */
export function classTreeLeafLabel(tree: ClassTreeNode[], en: string): string {
  const path = findClassTreePath(tree, en);
  if (!path || !path.length) return en;
  return path[path.length - 1].bn;
}

// --- Settings tree-editor helpers -----------------------------------------
// Pure, immutable tree edits used by Settings.tsx to build the next tree
// before calling saveClassTree (the server re-sanitizes/re-dedupes
// regardless — see classTree.js's sanitizeClassTree — these just build a
// well-formed candidate). `parentPath` is a list of `en` slugs from a root
// department down to (but not including) the node being added under;
// an empty array means "add as a new top-level department".

export function addClassTreeNode(
  tree: ClassTreeNode[],
  parentPath: string[],
  newNode: { bn: string; en: string }
): ClassTreeNode[] {
  const child: ClassTreeNode = { id: newNode.en, bn: newNode.bn, en: newNode.en, leaf: true, children: [] };
  if (parentPath.length === 0) return [...tree, child];

  function walk(nodes: ClassTreeNode[], remaining: string[]): ClassTreeNode[] {
    const [head, ...rest] = remaining;
    return nodes.map((node) => {
      if (node.en !== head) return node;
      if (rest.length === 0) {
        return { ...node, leaf: false, children: [...node.children, child] };
      }
      return { ...node, children: walk(node.children, rest) };
    });
  }
  return walk(tree, parentPath);
}

/** `path` is the full list of `en` slugs from root down to (and including)
 * the node being removed. Deleting a node does NOT take its descendants
 * with it — its direct children are spliced into its own former position
 * instead, so e.g. removing a বিভাগ promotes its নেসাব/ক্লাস children to
 * new top-level বিভাগ entries, and removing a নেসাব promotes its ক্লাস
 * children to sit directly under its বিভাগ — nothing under the deleted
 * node is ever lost, only its own single entry goes away. A leaf (no
 * children) simply disappears, same as before. Any student already on one
 * of the promoted descendants stays linked exactly as before (`en` values
 * are untouched by a move) — only where it sits in the tree changes. */
export function removeClassTreeNode(tree: ClassTreeNode[], path: string[]): ClassTreeNode[] {
  const [head, ...rest] = path;
  if (rest.length === 0) {
    const index = tree.findIndex((node) => node.en === head);
    if (index === -1) return tree;
    const promoted = tree[index].children || [];
    return [...tree.slice(0, index), ...promoted, ...tree.slice(index + 1)];
  }
  return tree.map((node) =>
    node.en === head ? { ...node, children: removeClassTreeNode(node.children, rest) } : node
  );
}

// --- Subject helpers (Part 2) ----------------------------------------------
// Subjects live only on leaf nodes (see ClassTreeNode.subjects in
// types/index.ts). All three walk down to the leaf at `leafPath` the same
// way addClassTreeNode/removeClassTreeNode walk to a class node, then edit
// just that leaf's own `subjects` array — same "build a well-formed
// candidate, let the server's sanitizeClassTree re-check it" division of
// labor as the class-node helpers above.

function walkToLeaf(
  nodes: ClassTreeNode[],
  remaining: string[],
  editSubjects: (subjects: ClassTreeSubject[]) => ClassTreeSubject[]
): ClassTreeNode[] {
  const [head, ...rest] = remaining;
  return nodes.map((node) => {
    if (node.en !== head) return node;
    if (rest.length === 0) {
      return { ...node, subjects: editSubjects(node.subjects || []) };
    }
    return { ...node, children: walkToLeaf(node.children, rest, editSubjects) };
  });
}

export function addSubject(
  tree: ClassTreeNode[],
  leafPath: string[],
  subject: { bn: string; en: string }
): ClassTreeNode[] {
  const newSubject: ClassTreeSubject = { id: subject.en, bn: subject.bn, en: subject.en };
  return walkToLeaf(tree, leafPath, (subjects) => [...subjects, newSubject]);
}

export function editSubject(
  tree: ClassTreeNode[],
  leafPath: string[],
  subjectEn: string,
  updates: { bn: string; en: string }
): ClassTreeNode[] {
  return walkToLeaf(tree, leafPath, (subjects) =>
    subjects.map((s) => (s.en === subjectEn ? { id: updates.en, bn: updates.bn, en: updates.en } : s))
  );
}

export function removeSubject(tree: ClassTreeNode[], leafPath: string[], subjectEn: string): ClassTreeNode[] {
  return walkToLeaf(tree, leafPath, (subjects) => subjects.filter((s) => s.en !== subjectEn));
}
