import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useLanguage } from "../context/AppSettingsContext";
import type { GuardianMessage } from "../types";

// Same 45-second polling interval used by NotificationBell.tsx — this app
// has no websocket infra, so both widgets share the one polling pattern.
const POLL_INTERVAL_MS = 45_000;

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

// Persistent floating round button, Messenger-style — rendered once at
// GuardianShell's root (outside <main>) so it stays visible across every
// guardian route. Clicking it opens a slide-over panel with the guardian's
// own reminder-message thread (server/src/routes/guardianAuth.js's
// /messages endpoints).
export function GuardianMessengerBubble() {
  const { t } = useLanguage();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<GuardianMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const loadUnreadCount = () => {
    api.guardian
      .getMessagesUnreadCount()
      .then((d) => setUnreadCount(d.count))
      .catch(() => {
        // Best-effort widget: a failed poll just keeps showing whatever
        // was last loaded instead of breaking the guardian shell.
      });
  };

  useEffect(() => {
    loadUnreadCount();
    const interval = window.setInterval(loadUnreadCount, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  const loadMessages = () => {
    setLoading(true);
    setError("");
    api.guardian
      .getMessages()
      .then(setMessages)
      .catch((err) => setError(err instanceof Error ? err.message : t.guardianMessenger.loadFailed))
      .finally(() => setLoading(false));
  };

  const toggleOpen = () => {
    setOpen((prevOpen) => {
      const next = !prevOpen;
      if (next) loadMessages();
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onOutsideClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  const openMessage = (message: GuardianMessage) => {
    if (message.read) return;
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, read: true } : m)));
    setUnreadCount((c) => Math.max(0, c - 1));
    api.guardian.markMessageRead(message.id).catch(() => {
      // Best-effort: if marking read fails, the unread badge just stays
      // slightly stale until the next poll — not worth rolling the
      // optimistic UI update back for.
    });
  };

  return (
    <div ref={boxRef} className="guardian-messenger">
      <button type="button" onClick={toggleOpen} aria-label={t.guardianMessenger.bubbleLabel} className="guardian-messenger-bubble">
        💬
        {unreadCount > 0 && (
          <span className="guardian-nav-badge guardian-messenger-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="soft-panel guardian-messenger-panel">
          <div className="guardian-messenger-panel__head">
            <span className="guardian-messenger-panel__title">{t.guardianMessenger.panelTitle}</span>
            <button type="button" onClick={() => setOpen(false)} className="guardian-link-btn">
              {t.guardianMessenger.close}
            </button>
          </div>

          {loading && <div className="guardian-loading">{t.guardianMessenger.loading}</div>}
          {!loading && error && <div className="guardian-error-box">{error}</div>}
          {!loading && !error && messages.length === 0 && (
            <div className="guardian-empty">{t.guardianMessenger.noMessages}</div>
          )}

          {!loading && !error && messages.length > 0 && (
            <div className="guardian-messenger-list">
              {messages.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => openMessage(m)}
                  className={`guardian-messenger-item${m.read ? "" : " guardian-messenger-item--unread"}`}
                >
                  <div className="guardian-messenger-item__head">
                    <span className="guardian-post-title guardian-messenger-item__title">{m.title}</span>
                    <span className="guardian-post-time">{relativeTime(m.createdAt)}</span>
                  </div>
                  {m.body && <div className="guardian-post-body">{m.body}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
