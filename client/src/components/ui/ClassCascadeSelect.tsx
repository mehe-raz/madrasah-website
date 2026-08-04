import { useState } from "react";
import type { ClassTreeNode } from "../../types";
import { findClassTreePath } from "../../lib/classTree";
import { useLanguage } from "../../context/AppSettingsContext";
import { Field, Select } from "./Field";

interface ClassCascadeSelectProps {
  label: string;
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

/** বিভাগ -> গ্রুপ/নেসাব -> জামাত, as many <Select> levels deep as the tree
 * goes at the branch currently being walked. Purely data-driven off `tree`
 * (server/src/lib/classTree.js) — doesn't hardcode "বিভাগ"/"গ্রুপ"/"নেসাব" as
 * separate concepts, so a future deeper/shallower branch (e.g. জেনারেল,
 * which is only one level) just works. */
export function ClassCascadeSelect({ label, tree, value, onChange, error }: ClassCascadeSelectProps) {
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
    <Field label={label}>
      <div className="row row--gap-8 row--wrap">
        {levels.map((options, levelIndex) => (
          <Select
            key={levelIndex}
            value={selections[levelIndex] || ""}
            onChange={(event) => handleLevelChange(levelIndex, event.target.value)}
            error={levelIndex === 0 ? error : undefined}
          >
            <option value="">{t.common.select}</option>
            {options.map((node) => (
              <option key={node.en} value={node.en}>
                {node.bn}
              </option>
            ))}
          </Select>
        ))}
      </div>
    </Field>
  );
}
