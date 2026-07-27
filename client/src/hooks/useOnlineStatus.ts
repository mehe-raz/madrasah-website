import { useEffect, useState } from "react";
import { countPendingOutboxEntries } from "../lib/offlineDb";

export interface OnlineStatus {
  online: boolean;
  pendingCount: number;
}

/**
 * Tracks browser connectivity (`navigator.onLine` + online/offline events)
 * and how many outbox entries are still waiting to sync (see
 * lib/offlineDb.ts). The outbox is empty in production until later phases
 * (attendance, admission, fee collection) start enqueueing into it — this
 * hook already reflects that count correctly once they do, no changes
 * needed here.
 */
export function useOnlineStatus(): OnlineStatus {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      countPendingOutboxEntries()
        .then((count) => {
          if (!cancelled) setPendingCount(count);
        })
        .catch(() => {
          /* IndexedDB unavailable (private browsing etc.) — not critical */
        });
    };
    refresh();
    // Polling rather than an event bus: the outbox changes from several
    // independent places (form submits, background sync flushes), and at
    // this queue size a 5s poll is simpler and cheap enough to not need a
    // pub/sub layer.
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener("online", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("online", refresh);
    };
  }, []);

  return { online, pendingCount };
}
