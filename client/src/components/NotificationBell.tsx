import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { C } from "../theme/colors";
import type { Notification } from "../types";

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

export function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = () => {
    api
      .getNotifications(30)
      .then(setItems)
      .catch(() => {
        // Best-effort widget: a failed poll just keeps showing whatever
        // was last loaded instead of breaking the whole topbar.
      });
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  const unreadCount = items.filter((n) => !n.read).length;

  const handleItemClick = async (item: Notification) => {
    if (!item.read) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      api.markNotificationRead(item.id).catch(() => {});
    }
    setOpen(false);
    if (item.link) navigate(item.link);
  };

  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    api.markAllNotificationsRead().catch(() => {});
  };

  return (
    <div ref={containerRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="নোটিফিকেশন"
        className="pill"
        style={{
          position: "relative",
          background: "var(--card)",
          border: `1px solid ${C.border}`,
          cursor: "pointer",
          fontSize: 17,
          color: C.muted,
          padding: "7px 11px",
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: C.rose,
              color: "#fff",
              fontSize: 10,
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 44,
            zIndex: 20,
            width: 320,
            maxWidth: "90vw",
            maxHeight: 420,
            overflowY: "auto",
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            boxShadow: "0 18px 40px rgba(15,23,42,0.14)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <span style={{ fontWeight: 900, fontSize: 13, color: C.text }}>নোটিফিকেশন</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{ border: "none", background: "none", color: C.link, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
              >
                সব পড়া হয়েছে
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>কোনো নোটিফিকেশন নেই</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  borderBottom: `1px solid ${C.border}`,
                  background: item.read ? "transparent" : C.skyL,
                  padding: "10px 14px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  {!item.read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.sky, marginTop: 5, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{item.title}</div>
                    {item.body && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{item.body}</div>}
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{relativeTime(item.createdAt)}</div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
