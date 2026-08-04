import type { ClassTreeNode } from "../types";

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
 * the node being removed. */
export function removeClassTreeNode(tree: ClassTreeNode[], path: string[]): ClassTreeNode[] {
  const [head, ...rest] = path;
  if (rest.length === 0) return tree.filter((node) => node.en !== head);
  return tree.map((node) =>
    node.en === head ? { ...node, children: removeClassTreeNode(node.children, rest) } : node
  );
}
