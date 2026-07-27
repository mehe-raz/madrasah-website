/**
 * Flushes the offline outbox (see offlineDb.ts) once the browser reports it
 * is back online, and exposes a manual trigger for a screen's "Pending
 * Sync" UI to call directly.
 *
 * As of Phase 4 (admission), two screens enqueue into this: attendance
 * (Phase 3, upsert-safe — a resend never conflicts) and admission (queued
 * entries get a real roll/admission number assigned server-side at sync
 * time, and may come back 409 on a duplicate — see the 4xx branch below).
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
      if (res.ok) {
        await removeOutboxEntry(entry.clientRequestId);
        synced += 1;
      } else if (res.status >= 400 && res.status < 500) {
        // A 4xx here is a definitive answer from the server (validation
        // failure, duplicate admission number, etc) — retrying the exact
        // same payload would just fail identically. Phase 4: rather than
        // treating 409 as silently "resolved" (the old behavior), keep the
        // entry as "failed" with the server's message so a screen's own
        // "sync issues" panel can surface it for manual review — see
        // modules/Students.tsx, which lists these next to the pending
        // (still-queued) admissions.
        const body = await res.json().catch(() => ({}) as { error?: string });
        await updateOutboxEntryStatus(entry.clientRequestId, "failed", body.error || `HTTP ${res.status}`);
        failed += 1;
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
