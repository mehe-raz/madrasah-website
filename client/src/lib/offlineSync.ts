/**
 * Flushes the offline outbox (see offlineDb.ts) once the browser reports it
 * is back online, and exposes a manual trigger for later phases' "Pending
 * Sync" UI to call directly.
 *
 * Phase 0 only: nothing currently puts entries into the outbox, so
 * flushOutbox() runs against an empty queue in production today. It's wired
 * up now so Phase 2 (attendance) only needs to add the enqueue call at the
 * point of failure, not build this retry machinery from scratch.
 */
import { getPendingOutboxEntries, removeOutboxEntry, updateOutboxEntryStatus } from "./offlineDb";

const API = import.meta.env.VITE_API_URL || "/api";

function readCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export interface FlushResult {
  synced: number;
  failed: number;
}

export async function flushOutbox(): Promise<FlushResult> {
  const entries = await getPendingOutboxEntries();
  let synced = 0;
  let failed = 0;

  for (const entry of entries) {
    await updateOutboxEntryStatus(entry.clientRequestId, "syncing");
    try {
      const csrfToken = readCsrfToken();
      const res = await fetch(`${API}${entry.path}`, {
        method: entry.method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          "X-Client-Request-Id": entry.clientRequestId,
        },
        body: entry.body != null ? JSON.stringify(entry.body) : undefined,
      });
      if (res.ok || res.status === 409) {
        // 409 (e.g. duplicate admission number) is a resolved outcome, not a
        // transient failure — the server has already given a definitive
        // answer, so retrying it again would just get the same answer.
        // Surfacing it for manual review is a later-phase "Pending Sync" UI
        // concern, not this foundation layer's job.
        await removeOutboxEntry(entry.clientRequestId);
        synced += 1;
      } else {
        await updateOutboxEntryStatus(entry.clientRequestId, "failed", `HTTP ${res.status}`);
        failed += 1;
      }
    } catch (e) {
      // Still offline, or the connection dropped mid-request — leave it
      // "pending" (not "failed") so the next flush retries it automatically.
      await updateOutboxEntryStatus(entry.clientRequestId, "pending", e instanceof Error ? e.message : String(e));
      failed += 1;
    }
  }

  return { synced, failed };
}

let initialized = false;

/** Call once at app startup (see main.tsx). Safe to call more than once. */
export function initOfflineSync(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("online", () => {
    flushOutbox().catch((e) => console.warn("Outbox flush failed:", e));
  });
}
