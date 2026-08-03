import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../lib/api";
import type { GuardianShellContext } from "../../components/GuardianShell";
import type { ClassPost } from "../../types";

const TYPE_LABEL: Record<ClassPost["type"], string> = { notice: "নোটিশ", assignment: "অ্যাসাইনমেন্ট", message: "বার্তা" };
const TYPE_BADGE_CLASS: Record<ClassPost["type"], string> = {
  notice: "guardian-post-badge--notice",
  assignment: "guardian-post-badge--assignment",
  message: "guardian-post-badge--message",
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

const FILTERS: Array<{ value: ClassPost["type"] | "all"; label: string }> = [
  { value: "all", label: "সব" },
  { value: "notice", label: "নোটিশ" },
  { value: "assignment", label: "অ্যাসাইনমেন্ট" },
  { value: "message", label: "বার্তা" },
];

export function GuardianFeed() {
  const { refresh } = useOutletContext<GuardianShellContext>();
  const [filter, setFilter] = useState<ClassPost["type"] | "all">("all");
  const [posts, setPosts] = useState<ClassPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentionally sets loading=true immediately so the panel shows a loading state right away; the rest of the state updates land after the request resolves
    setLoading(true);
    setError("");
    api.guardian
      .getFeed(filter === "all" ? undefined : filter)
      .then(setPosts)
      .catch((err) => setError(err instanceof Error ? err.message : "লোড করা যায়নি"))
      .finally(() => setLoading(false));
  }, [filter]);

  const openPost = (post: ClassPost) => {
    if (post.read) return;
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, read: true } : p)));
    api.guardian
      .markFeedRead(post.id)
      .then(refresh)
      .catch(() => {
        // Best-effort: if the read-marking call fails, the unread badge in
        // the header just stays as-is until the next poll — not worth
        // rolling the optimistic UI update back for.
      });
  };

  return (
    <div className="guardian-page">
      <div className="soft-panel-strong guardian-panel">
        <h1 className="guardian-title">নোটিশ ও অ্যাসাইনমেন্ট</h1>
        <div className="guardian-tab-row">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`pill guardian-tab${filter === f.value ? " guardian-tab--active" : ""}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="guardian-loading">লোড হচ্ছে...</div>}
      {!loading && error && <div className="soft-panel guardian-error-box">{error}</div>}

      {!loading && !error && posts.length === 0 && (
        <div className="soft-panel guardian-empty">কোনো নোটিশ নেই</div>
      )}

      {!loading && !error &&
        posts.map((post) => (
          <button
            key={post.id}
            type="button"
            onClick={() => openPost(post)}
            className={`soft-panel guardian-post${post.read ? "" : " guardian-post--unread"}`}
          >
            <div className="guardian-post__head">
              <span className={`guardian-post-badge ${TYPE_BADGE_CLASS[post.type]}`}>
                {TYPE_LABEL[post.type]} · {post.class}
              </span>
              <span className="guardian-post-time">{relativeTime(post.createdAt)}</span>
            </div>
            <div className="guardian-post-title">{post.title}</div>
            {post.body && <div className="guardian-post-body">{post.body}</div>}
            {post.attachments.length > 0 && (
              <div className="guardian-attachments">
                {post.attachments.map((a, i) => (
                  <a
                    key={i}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="pill guardian-attachment-link"
                  >
                    📎 {a.name || `ফাইল ${i + 1}`}
                  </a>
                ))}
              </div>
            )}
          </button>
        ))}
    </div>
  );
}
