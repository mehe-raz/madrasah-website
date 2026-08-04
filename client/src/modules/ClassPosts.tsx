import { useEffect, useState } from "react";
import { SkeletonCardList } from "../components/Skeleton";
import { Badge } from "../components/Badge";
import { Button, Card, Field, Input, Select, Textarea } from "../components/ui";
import { api } from "../lib/api";
import { useLanguage } from "../context/AppSettingsContext";
import { C } from "../theme/colors";
import type { ClassPost } from "../types";

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

export function ClassPosts() {
  const { t } = useLanguage();
  const typeLabel: Record<ClassPost["type"], string> = {
    notice: t.classPosts.typeNotice,
    assignment: t.classPosts.typeAssignment,
    message: t.classPosts.typeMessage,
  };

  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
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

  const send = async () => {
    if (!selectedClass || !title.trim()) {
      setComposeError(t.classPosts.selectClassFirst);
      return;
    }
    setSending(true);
    setSent(false);
    setComposeError("");
    try {
      await api.createClassPost({ type, class: selectedClass, title: title.trim(), body: body.trim() });
      setTitle("");
      setBody("");
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

  return (
    <div>
      <h2 className="page-title">{t.classPosts.title}</h2>
      <p className="page-subtitle">{t.classPosts.subtitle}</p>

      {composeError && <div className="alert alert--rose">{composeError}</div>}

      <Card className="class-post-form">
        <div className="form-grid">
          <Field label={t.classPosts.selectClass}>
            <Select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
              <option value="">{t.classPosts.selectClass}</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

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
                <Badge label={`${typeLabel[post.type]} · ${post.class}`} color={TYPE_COLOR[post.type]} />
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
