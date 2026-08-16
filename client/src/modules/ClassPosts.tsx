import { useEffect, useMemo, useRef, useState } from "react";
import { SkeletonCardList } from "../components/Skeleton";
import { Badge } from "../components/Badge";
import { StudentPicker } from "../components/StudentPicker";
import { Button, Card, Field, Input, Select, Textarea } from "../components/ui";
import { api } from "../lib/api";
import { classTreeLabel, classTreeLeafLabel } from "../lib/classTree";
import { canAccess } from "../lib/permissions";
import { useAuth } from "../context/AuthContext";
import { useAppSettings } from "../context/AppSettingsContext";
import { C } from "../theme/colors";
import { Icons } from "../lib/icons";
import type { ClassPost, ClassTreeNode, Student } from "../types";

const TYPE_COLOR: Record<ClassPost["type"], string> = {
  notice: C.sky,
  assignment: C.emerald,
  message: C.violet,
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "এইমাত্র";
  if (minutes < 60) return `${minutes} মিনিট আগে`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ঘণ্টা আগে`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} দিন আগে`;
  return String(iso).slice(0, 10);
}

// Every leaf `en` under (and including, if it's itself a leaf) this node —
// same walk client/lib/classTree.ts's flattenClassTree does, just scoped to
// one subtree instead of the whole tree, so a single বিভাগ/নেসাব checkbox
// can select/deselect exactly its own descendants.
function leafEnsUnder(node: ClassTreeNode): string[] {
  if (!node.children || node.children.length === 0) return [node.en];
  return node.children.flatMap(leafEnsUnder);
}

type TriState = "all" | "some" | "none";

function nodeTriState(node: ClassTreeNode, selected: Set<string>): TriState {
  const leaves = leafEnsUnder(node);
  const count = leaves.filter((en) => selected.has(en)).length;
  if (count === 0) return "none";
  if (count === leaves.length) return "all";
  return "some";
}

// Plain checkbox with the DOM-only `indeterminate` visual state wired up —
// React has no JSX prop for it (has to be set on the element directly), so
// this is the one spot that needs a ref instead of just a controlled
// `checked` prop.
function TriStateCheckbox({ state, onToggle }: { state: TriState; onToggle: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return <input ref={ref} type="checkbox" className="class-post-tree__checkbox" checked={state === "all"} onChange={onToggle} />;
}

function ClassTreeCheckboxNode({
  node,
  depth,
  selected,
  onToggle,
}: {
  node: ClassTreeNode;
  depth: number;
  selected: Set<string>;
  onToggle: (ens: string[], nextChecked: boolean) => void;
}) {
  const state = nodeTriState(node, selected);
  const leaves = leafEnsUnder(node);
  return (
    // eslint-disable-next-line no-restricted-syntax -- indentation depth is per-instance data (how deep this node sits in an admin-configured, arbitrary-depth বিভাগ/নেসাব/ক্লাস tree), not one of a fixed set of levels a static class could enumerate
    <div style={{ marginLeft: depth * 18 }}>
      <label className={depth === 0 ? "class-post-tree__row class-post-tree__row--root" : "class-post-tree__row"}>
        <TriStateCheckbox state={state} onToggle={() => onToggle(leaves, state !== "all")} />
        <span>{node.bn}</span>
      </label>
      {node.children?.length > 0 && (
        <div>
          {node.children.map((child) => (
            <ClassTreeCheckboxNode key={child.en} node={child} depth={depth + 1} selected={selected} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ClassPosts() {
  const { t, classTree } = useAppSettings();
  const { user } = useAuth();
  // Extended audience targeting (সকল ক্লাস/সকল বিভাগ/পাবলিক সাইট/নির্দিষ্ট
  // গার্ডিয়ান) is Admin/Super Admin only — same "website" permission the
  // server re-checks in routes/assignments.js for the `publicSite` flag,
  // reused here as the one gate for the whole extended picker since a
  // Teacher never has it (see server/src/config/roles.js). A Teacher keeps
  // the exact single-class dropdown flow this module always had.
  const canTargetExtended = canAccess(user?.role || "", "website");

  const typeLabel: Record<ClassPost["type"], string> = {
    notice: t.classPosts.typeNotice,
    assignment: t.classPosts.typeAssignment,
    message: t.classPosts.typeMessage,
  };

  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState(""); // Teacher's single-class picker only
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set()); // Admin/Super Admin tree picker
  const [allClasses, setAllClasses] = useState(false);
  const [publicSite, setPublicSite] = useState(false);
  const [guardianStudents, setGuardianStudents] = useState<Student[]>([]);
  const [guardianPickerValue, setGuardianPickerValue] = useState<Student | null>(null);
  // Closed by default — the picker (class tree + public site + guardian
  // search) is tall, so leaving it expanded on every visit pushed the rest
  // of the form down and looked unfinished, especially on mobile. Opens on
  // demand, or automatically if the user tries to send with nothing picked
  // (see send() below).
  const [destinationOpen, setDestinationOpen] = useState(false);

  const [type, setType] = useState<ClassPost["type"]>("notice");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [composeError, setComposeError] = useState("");

  const [filterType, setFilterType] = useState<ClassPost["type"] | "all">("all");
  const [posts, setPosts] = useState<ClassPost[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");

  useEffect(() => {
    api.getAssignmentClasses().then(setClasses).catch(() => setClasses([]));
  }, []);

  const refreshList = (nextType: ClassPost["type"] | "all") => {
    setLoadingList(true);
    setListError("");
    api
      .getClassPosts(nextType === "all" ? {} : { type: nextType })
      .then(setPosts)
      .catch((err) => setListError(err instanceof Error ? err.message : t.classPosts.noPosts))
      .finally(() => setLoadingList(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refreshList() intentionally sets loading=true immediately so the list shows a loading state right away; the rest of its state updates land after the request resolves
    refreshList(filterType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType]);

  const toggleClassNode = (ens: string[], nextChecked: boolean) => {
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      for (const en of ens) {
        if (nextChecked) next.add(en);
        else next.delete(en);
      }
      return next;
    });
  };

  const addGuardianStudent = (student: Student) => {
    setGuardianStudents((prev) => (prev.some((s) => s.id === student.id) ? prev : [...prev, student]));
    setGuardianPickerValue(null);
  };
  const removeGuardianStudent = (id: number) => {
    setGuardianStudents((prev) => prev.filter((s) => s.id !== id));
  };

  const resetDestination = () => {
    setSelectedClass("");
    setSelectedClasses(new Set());
    setAllClasses(false);
    setPublicSite(false);
    setGuardianStudents([]);
    setGuardianPickerValue(null);
    setDestinationOpen(false);
  };

  const send = async () => {
    if (!title.trim()) {
      setComposeError(t.classPosts.selectClassFirst);
      return;
    }

    let payload: {
      type: ClassPost["type"];
      class: string;
      title: string;
      body?: string;
      targetClasses?: string[];
      allClasses?: boolean;
      publicSite?: boolean;
      guardianStudentIds?: number[];
    };

    if (canTargetExtended) {
      const targetClasses = Array.from(selectedClasses);
      if (!targetClasses.length && !allClasses && !publicSite && !guardianStudents.length) {
        setComposeError(t.classPosts.selectDestinationFirst);
        setDestinationOpen(true);
        return;
      }
      payload = {
        type,
        class: targetClasses[0] || "",
        title: title.trim(),
        body: body.trim(),
        targetClasses,
        allClasses,
        publicSite,
        guardianStudentIds: guardianStudents.map((s) => s.id),
      };
    } else {
      if (!selectedClass) {
        setComposeError(t.classPosts.selectClassFirst);
        return;
      }
      payload = { type, class: selectedClass, title: title.trim(), body: body.trim() };
    }

    setSending(true);
    setSent(false);
    setComposeError("");
    try {
      await api.createClassPost(payload);
      setTitle("");
      setBody("");
      resetDestination();
      setSent(true);
      window.setTimeout(() => setSent(false), 2200);
      refreshList(filterType);
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : t.classPosts.sendFailed);
    } finally {
      setSending(false);
    }
  };

  const remove = async (post: ClassPost) => {
    try {
      await api.deleteClassPost(post.id);
      refreshList(filterType);
    } catch (err) {
      setListError(err instanceof Error ? err.message : t.classPosts.deleteFailed);
    }
  };

  // Human-readable audience summary for a sent post's badge row — replaces
  // the old single `classTreeLabel(classTree, post.class)` now that a post
  // can target several things at once.
  const audienceLabel = (post: ClassPost): string => {
    if (post.allClasses) return t.classPosts.targetAllClasses;
    if (post.targetClasses?.length > 1) {
      return `${classTreeLeafLabel(classTree, post.targetClasses[0])} +${post.targetClasses.length - 1}`;
    }
    if (post.targetClasses?.length === 1) return classTreeLabel(classTree, post.targetClasses[0]);
    if (post.class) return classTreeLabel(classTree, post.class);
    return "";
  };

  // Selected-destination count for the collapsed picker's summary line —
  // "all classes" and "public site" each count as one, plus one per
  // specific class checked and per guardian added.
  const destinationCount = useMemo(
    () => (allClasses ? 1 : selectedClasses.size) + (publicSite ? 1 : 0) + guardianStudents.length,
    [allClasses, selectedClasses, publicSite, guardianStudents]
  );

  return (
    <div>
      <h2 className="page-title">{t.classPosts.title}</h2>
      <p className="page-subtitle">{t.classPosts.subtitle}</p>

      {composeError && <div className="alert alert--rose">{composeError}</div>}

      <Card className="class-post-form">
        <div className="form-grid">
          {!canTargetExtended && (
            <Field label={t.classPosts.selectClass}>
              <Select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
                <option value="">{t.classPosts.selectClass}</option>
                {classes.map((c) => (
                  <option key={c} value={c}>
                    {classTreeLeafLabel(classTree, c)}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label={t.classPosts.type}>
            <Select value={type} onChange={(e) => setType(e.target.value as ClassPost["type"])}>
              <option value="notice">{t.classPosts.typeNotice}</option>
              <option value="assignment">{t.classPosts.typeAssignment}</option>
              <option value="message">{t.classPosts.typeMessage}</option>
            </Select>
          </Field>

          <Field label={t.classPosts.postTitle}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.classPosts.postTitlePlaceholder} />
          </Field>
        </div>

        <Field label={t.classPosts.body}>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
        </Field>

        {canTargetExtended && (
          <div className="soft-panel class-post-destination">
            <button
              type="button"
              className="class-post-destination__toggle"
              onClick={() => setDestinationOpen((v) => !v)}
              aria-expanded={destinationOpen}
              aria-label={destinationOpen ? t.classPosts.destinationToggleCollapse : t.classPosts.destinationToggleExpand}
            >
              <span className="class-post-destination__toggle-text">
                <span className="class-post-destination__label">{t.classPosts.destinationLabel}</span>
                <span className="class-post-destination__summary">
                  {destinationCount === 0
                    ? t.classPosts.destinationSummaryEmpty
                    : t.classPosts.destinationSummarySelected.replace("{count}", String(destinationCount))}
                </span>
              </span>
              <Icons.chevronDown
                size={18}
                aria-hidden="true"
                className={destinationOpen ? "class-post-destination__chevron class-post-destination__chevron--open" : "class-post-destination__chevron"}
              />
            </button>

            {destinationOpen && (
              <div className="class-post-destination__body">
                <label className="class-post-checkbox-row">
                  <input type="checkbox" className="class-post-tree__checkbox" checked={allClasses} onChange={(e) => setAllClasses(e.target.checked)} />
                  <span className="class-post-checkbox-row__text">{t.classPosts.targetAllClasses}</span>
                </label>

                <div className={allClasses ? "class-post-classes-group class-post-classes-group--disabled" : "class-post-classes-group"}>
                  <div className="class-post-hint">{t.classPosts.targetClassesHint}</div>
                  <div className="soft-panel class-post-tree__panel">
                    {classTree.length === 0 && <div className="class-post-hint class-post-hint--empty">{t.classPosts.noClassTree}</div>}
                    {classTree.map((node) => (
                      <ClassTreeCheckboxNode key={node.en} node={node} depth={0} selected={selectedClasses} onToggle={toggleClassNode} />
                    ))}
                  </div>
                </div>

                <label className="class-post-checkbox-row">
                  <input type="checkbox" className="class-post-tree__checkbox" checked={publicSite} onChange={(e) => setPublicSite(e.target.checked)} />
                  <span className="class-post-checkbox-row__text">{t.classPosts.targetPublicSite}</span>
                </label>
                <div className="class-post-hint class-post-hint--tight">{t.classPosts.targetPublicSiteHint}</div>

                <div>
                  <div className="class-post-destination__sublabel">{t.classPosts.targetGuardian}</div>
                  <StudentPicker value={guardianPickerValue} onSelect={addGuardianStudent} placeholder={t.classPosts.targetGuardianPlaceholder} />
                  {guardianStudents.length > 0 && (
                    <div className="class-post-chips">
                      {guardianStudents.map((s) => (
                        <span key={s.id} className="pill class-post-chip">
                          {s.name}
                          <button type="button" onClick={() => removeGuardianStudent(s.id)} className="class-post-chip__remove" aria-label={t.classPosts.delete}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <Button variant={sent ? "emerald" : "sky"} solid onClick={send} disabled={sending}>
          {sending ? t.classPosts.sending : sent ? t.classPosts.sent : t.classPosts.send}
        </Button>
      </Card>

      <Card>
        <div className="page-header">
          <h3 className="page-header__title">{t.classPosts.sentPosts}</h3>
          <Field label={t.classPosts.type} className="filter-bar__select">
            <Select value={filterType} onChange={(e) => setFilterType(e.target.value as ClassPost["type"] | "all")}>
              <option value="all">{t.classPosts.filterAll}</option>
              <option value="notice">{t.classPosts.typeNotice}</option>
              <option value="assignment">{t.classPosts.typeAssignment}</option>
              <option value="message">{t.classPosts.typeMessage}</option>
            </Select>
          </Field>
        </div>

        {loadingList && <SkeletonCardList count={3} lines={2} />}
        {!loadingList && listError && <div className="alert alert--rose">{listError}</div>}
        {!loadingList && !listError && posts.length === 0 && <p className="page-subtitle">{t.classPosts.noPosts}</p>}

        {!loadingList &&
          !listError &&
          posts.map((post) => (
            <Card key={post.id} tight className="class-post">
              <div className="class-post__head">
                <Badge label={`${typeLabel[post.type]} · ${audienceLabel(post)}`} color={TYPE_COLOR[post.type]} />
                {post.publicSite && <Badge label={t.classPosts.targetPublicSite} color={C.amber} />}
                {post.guardianStudentIds?.length > 0 && (
                  <Badge label={`${t.classPosts.targetGuardian} (${post.guardianStudentIds.length})`} color={C.slate} />
                )}
                <span className="class-post__meta">{relativeTime(post.createdAt)}</span>
              </div>
              <div className="class-post__title">{post.title}</div>
              {post.body && <div className="class-post__body">{post.body}</div>}
              <div className="class-post__actions">
                <Button variant="rose" onClick={() => remove(post)}>
                  {t.classPosts.delete}
                </Button>
              </div>
            </Card>
          ))}
      </Card>
    </div>
  );
}
