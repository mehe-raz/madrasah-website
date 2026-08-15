import { useState } from "react";
import type { ClassTreeNode } from "../../types";
import { findClassTreePath } from "../../lib/classTree";
import { useLanguage } from "../../context/AppSettingsContext";
import { Field, Select } from "./Field";

interface ClassCascadeSelectProps {
  tree: ClassTreeNode[];
  /** Currently stored leaf `en` value (what's saved on students.class), or "". */
  value: string;
  /** Fires with the leaf's `en` once a full path is picked, or "" while the
   * selection is incomplete (a parent level was just changed and the next
   * level hasn't been chosen yet) — the caller should treat "" the same as
   * an empty/invalid class, same as before this component existed. */
  onChange: (en: string) => void;
  error?: boolean;
}

/** বিভাগ -> নেসাব -> ক্লাস, as many <Select> levels deep as the tree goes at
 * the branch currently being walked. Each level gets its own label instead
 * of one shared field label: the first level is always বিভাগ (a tree's
 * top-level departments), the last level — whichever one that ends up being
 * for the branch chosen, since branches aren't all the same depth — is
 * always ক্লাস (the actual leaf/selectable class), and anything strictly
 * between the two (only some branches have this, e.g. কিতাব বিভাগ's নেসাব
 * groupings) is labeled নেসাব. Purely data-driven off `tree`
 * (server/src/lib/classTree.js) — doesn't hardcode a fixed number of
 * levels, so a 2-level বিভাগ (বিভাগ -> ক্লাস directly, no নেসাব) and a
 * 3-level one (বিভাগ -> নেসাব -> ক্লাস) both label correctly. */
export function ClassCascadeSelect({ tree, value, onChange, error }: ClassCascadeSelectProps) {
  const { t } = useLanguage();
  const [selections, setSelections] = useState<string[]>(() => {
    const path = findClassTreePath(tree, value);
    return path ? path.map((n) => n.en) : [];
  });
  // Re-derives `selections` from `value`/`tree` whenever either changes from
  // outside this component (a different student loaded into the form, or
  // the tree finishing its async load after mount) — a render-time state
  // adjustment, not an effect, per React's "adjusting state when a prop
  // changes" pattern; safe here because it only ever narrows down to a
  // strictly-smaller set of re-renders (no loop risk).
  const [syncedKey, setSyncedKey] = useState(`${value}|${tree.length}`);
  const currentKey = `${value}|${tree.length}`;
  if (currentKey !== syncedKey) {
    const path = findClassTreePath(tree, value);
    setSelections(path ? path.map((n) => n.en) : []);
    setSyncedKey(currentKey);
  }

  const levels: ClassTreeNode[][] = [];
  let currentOptions = tree;
  for (const chosenEn of selections) {
    levels.push(currentOptions);
    const chosenNode = currentOptions.find((n) => n.en === chosenEn);
    if (!chosenNode || chosenNode.children.length === 0) break;
    currentOptions = chosenNode.children;
  }
  const deepestChosen = selections.length
    ? levels[levels.length - 1]?.find((n) => n.en === selections[selections.length - 1])
    : null;
  if (!selections.length || deepestChosen?.children.length) levels.push(currentOptions);

  const handleLevelChange = (levelIndex: number, en: string) => {
    const next = [...selections.slice(0, levelIndex), en].filter(Boolean);
    setSelections(next);
    const optionsAtLevel = levels[levelIndex];
    const node = optionsAtLevel.find((n) => n.en === en);
    const resolvedEn = node && node.children.length === 0 ? node.en : "";
    setSyncedKey(`${resolvedEn}|${tree.length}`); // this change is now the source of truth, not an outside prop update
    onChange(resolvedEn);
  };

  return (
    <div className="row row--gap-8 row--wrap">
      {levels.map((options, levelIndex) => {
        const isFirst = levelIndex === 0;
        const isLast = levelIndex === levels.length - 1;
        const levelLabel = isFirst ? "বিভাগ" : isLast ? "ক্লাস" : "নেসাব";
        return (
          <Field key={levelIndex} label={levelLabel}>
            <Select
              value={selections[levelIndex] || ""}
              onChange={(event) => handleLevelChange(levelIndex, event.target.value)}
              error={isFirst ? error : undefined}
            >
              <option value="">{t.common.select}</option>
              {options.map((node) => (
                <option key={node.en} value={node.en}>
                  {node.bn}
                </option>
              ))}
            </Select>
          </Field>
        );
      })}
    </div>
  );
}
