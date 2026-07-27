/**
 * IndexedDB "outbox" — foundation for offline-first mode (Phase 0).
 *
 * This file only provides storage primitives. It is NOT yet wired into any
 * form: attendance, admission, and payment screens still call `api.ts`
 * directly and fail normally when offline, exactly as before. Later phases
 * will call `enqueueOutboxEntry()` from those screens' submit handlers when
 * a request fails due to no connection, and rely on `offlineSync.ts` to
 * flush the queue once the connection returns.
 *
 * Kept deliberately generic (path + method + body) rather than one
 * function per entity (queueAttendance, queueAdmission, ...) so adding a
 * new offline-capable screen later never requires a schema change here.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type OutboxStatus = "pending" | "syncing" | "failed";

export interface OutboxEntry {
  /** Same id sent as the X-Client-Request-Id header — see lib/api.ts. */
  clientRequestId: string;
  /** API path, e.g. "/payments" (no /api prefix — request() adds that). */
  path: string;
  method: string;
  body: unknown;
  createdAt: string;
  status: OutboxStatus;
  lastError?: string;
}

interface OfflineDBSchema extends DBSchema {
  outbox: {
    key: string;
    value: OutboxEntry;
    indexes: { "by-status": string; "by-createdAt": string };
  };
}

const DB_NAME = "madrasah-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OfflineDBSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore("outbox", { keyPath: "clientRequestId" });
        store.createIndex("by-status", "status");
        store.createIndex("by-createdAt", "createdAt");
      },
    });
  }
  return dbPromise;
}

export async function enqueueOutboxEntry(
  entry: Pick<OutboxEntry, "clientRequestId" | "path" | "method" | "body">
): Promise<OutboxEntry> {
  const db = await getDb();
  const full: OutboxEntry = { ...entry, status: "pending", createdAt: new Date().toISOString() };
  await db.put("outbox", full);
  return full;
}

export async function getPendingOutboxEntries(): Promise<OutboxEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex("outbox", "by-status", "pending");
}

export async function getAllOutboxEntries(): Promise<OutboxEntry[]> {
  const db = await getDb();
  return db.getAll("outbox");
}

export async function updateOutboxEntryStatus(
  clientRequestId: string,
  status: OutboxStatus,
  lastError?: string
): Promise<void> {
  const db = await getDb();
  const existing = await db.get("outbox", clientRequestId);
  if (!existing) return;
  await db.put("outbox", { ...existing, status, lastError });
}

export async function removeOutboxEntry(clientRequestId: string): Promise<void> {
  const db = await getDb();
  await db.delete("outbox", clientRequestId);
}

export async function countPendingOutboxEntries(): Promise<number> {
  const pending = await getPendingOutboxEntries();
  return pending.length;
}

/**
 * All outbox entries (any status) for one endpoint — e.g. every queued or
 * failed admission (`"/students"`, `"POST"`). Used by a screen's own
 * "pending"/"needs review" panel (see modules/Students.tsx, Phase 4) rather
 * than the generic count in useOnlineStatus, which only needs a total.
 */
export async function getOutboxEntriesFor(path: string, method: string): Promise<OutboxEntry[]> {
  const all = await getAllOutboxEntries();
  return all.filter((entry) => entry.path === path && entry.method === method);
}
