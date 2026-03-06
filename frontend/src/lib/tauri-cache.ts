/**
 * Offline SQLite cache for Tauri native app.
 *
 * Stores API responses as JSON blobs in SQLite so the app can hydrate
 * TanStack Query from cache on cold start (even offline). Also provides
 * a write queue for offline mutations that drain on reconnect.
 *
 * Cache stores ciphertext as-is — decryption stays in the TanStack Query
 * layer (use-crypto.ts). Rust never touches encryption keys.
 *
 * v0.62.0: Phase 3 — Offline SQLite Cache
 */

import { isTauri } from "@/hooks/use-device";
import {
  TAURI_CACHE_TTL_MS,
  TAURI_CIRCUIT_BREAKER_COOLDOWN_MS,
  TAURI_IPC_TIMEOUT_MS,
} from "@/lib/tauri-constants";

interface WriteQueueEntry {
  id: number;
  method: string;
  url: string;
  body: string | null;
  created_at: number;
}

type Database = {
  execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number }>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T[]>;
};

// Lazy singleton — avoids importing @tauri-apps/plugin-sql on web
let db: Database | null = null;

// Circuit breaker: track if SQL plugin is known-broken, with cooldown for retry
let sqlAvailable = true;
let sqlBrokeAt = 0;

// Deduplicate concurrent getDb() calls — prevents multiple Database.load() IPC requests
let dbLoadPromise: Promise<Database | null> | null = null;

/** Race a promise against a timeout — returns fallback if the promise doesn't settle in time */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function getDb(): Promise<Database | null> {
  if (db) return db;
  if (!sqlAvailable) {
    // Half-open: retry after cooldown
    if (Date.now() - sqlBrokeAt < TAURI_CIRCUIT_BREAKER_COOLDOWN_MS) return null;
    sqlAvailable = true;
  }
  if (dbLoadPromise) return dbLoadPromise;
  dbLoadPromise = loadDb();
  return dbLoadPromise;
}

async function loadDb(): Promise<Database | null> {
  try {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const loaded = await withTimeout(
      Database.load("sqlite:whendoist-cache.db"),
      TAURI_IPC_TIMEOUT_MS,
      null as Database | null,
    );
    if (!loaded) {
      sqlAvailable = false;
      sqlBrokeAt = Date.now();
      return null;
    }
    await withTimeout(migrate(loaded), TAURI_IPC_TIMEOUT_MS, undefined);
    db = loaded;
    return db;
  } catch {
    sqlAvailable = false;
    sqlBrokeAt = Date.now();
    return null;
  } finally {
    dbLoadPromise = null;
  }
}

async function migrate(database: Database): Promise<void> {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS cache_entries (
      key          TEXT PRIMARY KEY,
      data         TEXT NOT NULL,
      data_version INTEGER,
      updated_at   INTEGER NOT NULL
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS write_queue (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      method     TEXT NOT NULL,
      url        TEXT NOT NULL,
      body       TEXT,
      created_at INTEGER NOT NULL
    )
  `);
}

// ---------------------------------------------------------------------------
// Cache CRUD
// ---------------------------------------------------------------------------

/** Initialize the cache database (idempotent — safe to call multiple times). */
export async function initCache(): Promise<void> {
  if (!isTauri) return;
  await getDb();
}

/** Read a cached API response by key. Discards entries older than TAURI_CACHE_TTL_MS. */
export async function getCachedData<T>(key: string): Promise<T | null> {
  if (!isTauri) return null;
  const database = await getDb();
  if (!database) return null;
  const rows = await database.select<{ data: string; updated_at: number }>(
    "SELECT data, updated_at FROM cache_entries WHERE key = $1",
    [key],
  );
  if (rows.length === 0) return null;
  // Discard stale entries — users who haven't opened the app in weeks
  // shouldn't see very old data on cold start
  if (Date.now() - rows[0].updated_at > TAURI_CACHE_TTL_MS) return null;
  return JSON.parse(rows[0].data) as T;
}

/** Store an API response in the cache. */
export async function setCachedData(
  key: string,
  data: unknown,
  dataVersion?: number,
): Promise<void> {
  if (!isTauri) return;
  const database = await getDb();
  if (!database) return;
  await database.execute(
    `INSERT INTO cache_entries (key, data, data_version, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(key) DO UPDATE SET data = $2, data_version = $3, updated_at = $4`,
    [key, JSON.stringify(data), dataVersion ?? null, Date.now()],
  );
}

/** Get the cached data_version (from the 'me' cache entry). */
export async function getCachedDataVersion(): Promise<number | null> {
  if (!isTauri) return null;
  const database = await getDb();
  if (!database) return null;
  const rows = await database.select<{ data_version: number | null }>(
    "SELECT data_version FROM cache_entries WHERE key = 'me'",
  );
  if (rows.length === 0) return null;
  return rows[0].data_version;
}

// ---------------------------------------------------------------------------
// Write Queue
// ---------------------------------------------------------------------------

/** Queue an offline mutation for later replay. */
export async function addToWriteQueue(method: string, url: string, body?: unknown): Promise<void> {
  if (!isTauri) return;
  const database = await getDb();
  if (!database) return;
  await database.execute(
    "INSERT INTO write_queue (method, url, body, created_at) VALUES ($1, $2, $3, $4)",
    [method, url, body ? JSON.stringify(body) : null, Date.now()],
  );
}

/** Get all pending write queue entries (FIFO order). */
export async function getPendingWrites(): Promise<WriteQueueEntry[]> {
  if (!isTauri) return [];
  const database = await getDb();
  if (!database) return [];
  return database.select<WriteQueueEntry>(
    "SELECT id, method, url, body, created_at FROM write_queue ORDER BY id ASC",
  );
}

/** Remove a write queue entry after successful replay. */
export async function removePendingWrite(id: number): Promise<void> {
  if (!isTauri) return;
  const database = await getDb();
  if (!database) return;
  await database.execute("DELETE FROM write_queue WHERE id = $1", [id]);
}

/** Get the count of pending writes (for UI indicator). */
export async function getPendingWriteCount(): Promise<number> {
  if (!isTauri) return 0;
  const database = await getDb();
  if (!database) return 0;
  const rows = await database.select<{ count: number }>(
    "SELECT COUNT(*) as count FROM write_queue",
  );
  return rows[0]?.count ?? 0;
}

/** Clear the entire write queue (e.g. on logout). */
export async function clearWriteQueue(): Promise<void> {
  if (!isTauri) return;
  const database = await getDb();
  if (!database) return;
  await database.execute("DELETE FROM write_queue");
}

/** Clear all cached data and write queue (e.g. on logout). */
export async function clearAllCache(): Promise<void> {
  if (!isTauri) return;
  const database = await getDb();
  if (!database) return;
  await database.execute("DELETE FROM cache_entries");
  await database.execute("DELETE FROM write_queue");
}

export type { WriteQueueEntry };
