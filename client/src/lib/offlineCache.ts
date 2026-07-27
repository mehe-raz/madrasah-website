/**
 * Caches the last successful response of every GET request so read-only
 * screens (student list, dashboard, settings, etc.) still show something
 * useful when offline — never live data, always clearly the last-synced
 * snapshot (see OfflineStatusBar.tsx, which surfaces `cachedAt`).
 *
 * A separate IndexedDB database from offlineDb.ts's outbox on purpose: this
 * store is disposable (safe to clear/rebuild any time, it's pure cache),
 * while the outbox holds not-yet-synced user data that must never be
 * silently dropped. Keeping them apart means a future "clear cache" action
 * can never accidentally wipe unsynced entries.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

interface CacheEntry {
  path: string;
  value: unknown;
  cachedAt: string;
}

interface CacheDBSchema extends DBSchema {
  "get-cache": {
    key: string;
    value: CacheEntry;
  };
}

const DB_NAME = "madrasah-offline-cache";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<CacheDBSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<CacheDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<CacheDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("get-cache", { keyPath: "path" });
      },
    });
  }
  return dbPromise;
}

export interface CachedResponse<T> {
  value: T;
  cachedAt: string;
}

export async function cacheGetResponse(path: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put("get-cache", { path, value, cachedAt: new Date().toISOString() });
}

export async function getCachedGetResponse<T>(path: string): Promise<CachedResponse<T> | undefined> {
  const db = await getDb();
  const entry = await db.get("get-cache", path);
  if (!entry) return undefined;
  return { value: entry.value as T, cachedAt: entry.cachedAt };
}
