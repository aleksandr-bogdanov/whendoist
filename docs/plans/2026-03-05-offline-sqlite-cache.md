---
version:
pr:
created: 2026-03-05
---

# Phase 3: Offline SQLite Cache (Read Cache + Write Queue)

## Context

Tauri mobile app talks to the remote backend (`https://whendoist.com`) for all data.
When the user loses connectivity — or kills and relaunches the app without internet —
they see nothing. This phase adds a local SQLite cache so:

- **Cold start offline**: App shows cached tasks/domains instantly
- **Offline mutations**: Complete/create/update tasks queue locally, drain on reconnect
- **Fast warm start**: Hydrate TanStack Query from cache, then revalidate in background

Design constraint from the original plan: "Cache stores ciphertext as-is. Decryption stays
in WebView at TanStack Query layer. Rust never needs the encryption key."

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (TypeScript)                                  │
│                                                         │
│  TanStack Query ◄──── use-crypto.ts (decrypt/encrypt)  │
│       ▲    │                                            │
│       │    ▼                                            │
│  api-client.ts ───► axios ───► whendoist.com            │
│       │    ▲                        │                   │
│       │    │   (offline fallback)   │                   │
│       ▼    │                        │                   │
│  tauri-cache.ts ──► SQLite via      │                   │
│       │             @tauri-apps/    │                   │
│       │             plugin-sql      │                   │
│       ▼                             │                   │
│  use-offline-sync.ts                │                   │
│    - hydrate on cold start          │                   │
│    - cache on API success           │                   │
│    - drain write queue on reconnect │                   │
│    - periodic data_version check    │                   │
└─────────────────────────────────────────────────────────┘
```

**Key decisions:**
- `tauri-plugin-sql` provides JS API directly — no custom Rust commands needed
- JSON blob storage per entity type (tasks, domains) — simple, matches API shape
- `User.data_version` (already exists in backend) drives change detection
- Write queue is FIFO replay — server state wins after drain + resync

---

## SQLite Schema

```sql
-- Cached API responses (encrypted data stored as-is)
CREATE TABLE IF NOT EXISTS cache_entries (
  key    TEXT PRIMARY KEY,     -- 'tasks', 'domains', 'me', 'preferences'
  data   TEXT NOT NULL,        -- JSON response body
  data_version INTEGER,        -- user's data_version at cache time
  updated_at INTEGER NOT NULL  -- unix ms
);

-- Offline mutation queue (FIFO drain on reconnect)
CREATE TABLE IF NOT EXISTS write_queue (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  method     TEXT NOT NULL,    -- POST, PUT, DELETE
  url        TEXT NOT NULL,    -- e.g. '/api/v1/tasks/42/toggle-complete'
  body       TEXT,             -- JSON request body (null for DELETE)
  created_at INTEGER NOT NULL  -- unix ms
);
```

Cache keys: `tasks` (full task list from `?status=all`), `domains`, `me`, `preferences`.

---

## Changes

### 1. Backend: Add `data_version` to MeResponse

**File:** `app/routers/me.py`

Add `data_version: int` to `MeResponse` and return `user.data_version` in the response.
This is the only backend change — the `data_version` field already exists on `User` model
and is bumped by `app/services/data_version.py` after every user-initiated mutation.

### 2. Rust: Register `tauri-plugin-sql`

Minimal Rust changes — the plugin provides a JS API, no custom commands needed.

**`frontend/src-tauri/Cargo.toml`** — add dependency:
```toml
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
```

**`frontend/src-tauri/src/lib.rs`** — register plugin:
```rust
.plugin(tauri_plugin_sql::Builder::default().build())
```

**`frontend/src-tauri/capabilities/default.json`** — add permission:
```json
"permissions": ["core:default", "store:default", "notifications:default", "sql:default"]
```

### 3. Frontend: Install npm package

```bash
cd frontend && npm install @tauri-apps/plugin-sql
```

### 4. Frontend: `frontend/src/lib/tauri-cache.ts` — Cache Layer

SQLite wrapper with lazy database initialization (same pattern as `tauri-token-store.ts`).

**Exports:**
```typescript
// Database lifecycle
initCache(): Promise<void>            // CREATE TABLE IF NOT EXISTS (idempotent)

// Read cache (JSON blob per entity type)
getCachedData<T>(key: string): Promise<T | null>
setCachedData(key: string, data: unknown, dataVersion?: number): Promise<void>

// Data version tracking
getCachedDataVersion(): Promise<number | null>

// Write queue
addToWriteQueue(method: string, url: string, body?: unknown): Promise<void>
getPendingWrites(): Promise<WriteQueueEntry[]>
removePendingWrite(id: number): Promise<void>
getPendingWriteCount(): Promise<number>
clearWriteQueue(): Promise<void>
```

**Implementation pattern:**
```typescript
import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load('sqlite:whendoist-cache.db');
    await runMigrations(db);
  }
  return db;
}
```

### 5. Frontend: `frontend/src/hooks/use-offline-sync.ts` — Sync Orchestrator

Hook called from `_authenticated.tsx` (alongside `useNetworkStatus`, `useReminders`, etc.).
Only active when `isTauri` is true.

**Responsibilities:**

**a) Cold start hydration:**
- On mount: read cached tasks/domains from SQLite → `queryClient.setQueryData()` to
  pre-populate TanStack Query before network requests fire
- This eliminates the loading spinner when app starts offline

**b) Cache persistence (online):**
- After successful API fetches: write response data to SQLite cache
- Intercept via `useEffect` watching `tasksQuery.data` and `domainsQuery.data`
- Also cache the `me` response (contains `data_version`)

**c) Periodic sync check:**
- Every 2 minutes: fetch `/api/v1/me` → compare `data_version` with cached version
- If changed: invalidate TanStack queries → triggers refetch → cache updated
- If same: skip (avoid unnecessary bandwidth)

**d) Write queue drain (on reconnect):**
- Listen for `online` event
- Drain write queue entries FIFO: replay each request via axios
- After all drained: invalidate all queries → full resync → fresh cache
- Handle individual failures gracefully (log + skip, don't block remaining)

**Exposed state:**
```typescript
{
  isOfflineCacheReady: boolean,  // cache hydrated, ready to render
  pendingWrites: number,         // write queue depth (for UI indicator)
  lastSyncedAt: Date | null,     // when we last confirmed data_version match
}
```

### 6. Frontend: Modify `frontend/src/lib/api-client.ts` — Write Queue Integration

Change the offline guard (currently blocks all mutations) to queue for Tauri:

```typescript
// Current (line 46-54):
if (!navigator.onLine) {
  toast.error("No internet connection...");
  throw new NetworkError("Browser is offline");
}

// New:
if (!navigator.onLine) {
  if (isTauri && isWriteMethod(config.method)) {
    const { addToWriteQueue } = await import('./tauri-cache');
    await addToWriteQueue(config.method!, config.url!, config.data);
    // Throw special error so TanStack Query doesn't show error UI
    throw new OfflineQueuedError("Mutation queued offline");
  }
  toast.error("No internet connection...");
  throw new NetworkError("Browser is offline");
}
```

Add `OfflineQueuedError` class to `frontend/src/lib/errors.ts`.

In the response error handler, catch `OfflineQueuedError` silently (no error toast).

**Note on TanStack Query optimistic updates:** When `OfflineQueuedError` is thrown, any
per-mutation `onError` callback will rollback the optimistic update. This causes a brief
flicker (task shows completed → reverts to pending). The write queue ensures the mutation
eventually executes. This is acceptable for v1 — the data is never lost. UX polish
(preventing rollback for queued mutations) can be a fast follow-up.

### 7. Frontend: Modify `frontend/src/hooks/use-network-status.ts` — Reconnect Trigger

When `isTauri` and going back online, trigger write queue drain:

```typescript
const handleOnline = () => {
  if (wasOfflineRef.current) {
    wasOfflineRef.current = false;
    toast.success("Back online — syncing changes...", { id: "network-status" });
    // Write queue drain is handled by use-offline-sync.ts
    // which listens for the same 'online' event
  }
};
```

Update toast message to indicate syncing. The actual drain happens in `use-offline-sync.ts`.

### 8. Frontend: Wire into `_authenticated.tsx`

Add `useOfflineSync()` call alongside existing hooks:

```typescript
useNetworkStatus();
useReminders();
usePushNotifications();
useOfflineSync();  // ← new
```

---

## Files Modified

| File | Change |
|------|--------|
| `app/routers/me.py` | Add `data_version: int` to MeResponse |
| `frontend/src-tauri/Cargo.toml` | Add `tauri-plugin-sql` dep |
| `frontend/src-tauri/src/lib.rs` | Register SQL plugin |
| `frontend/src-tauri/capabilities/default.json` | Add `sql:default` permission |
| `frontend/package.json` | Add `@tauri-apps/plugin-sql` |
| **New:** `frontend/src/lib/tauri-cache.ts` | SQLite cache layer |
| **New:** `frontend/src/hooks/use-offline-sync.ts` | Sync orchestrator hook |
| `frontend/src/lib/api-client.ts` | Queue offline writes for Tauri |
| `frontend/src/lib/errors.ts` | Add `OfflineQueuedError` class |
| `frontend/src/hooks/use-network-status.ts` | Update reconnect toast |
| `frontend/src/routes/_authenticated.tsx` | Wire `useOfflineSync()` |
| `pyproject.toml` | Version bump |
| `uv.lock` | Lockfile sync |
| `CHANGELOG.md` | Version entry |

---

## What's NOT in Scope (v1)

- **TaskInstance caching**: Instances are date-ranged views of recurring tasks. Skipping
  simplifies schema significantly. Planner/calendar may show stale instance data offline.
- **Optimistic update preservation**: Offline mutations briefly flicker (rollback + requeue).
  The data is safe in the write queue. Polish is a follow-up.
- **Write queue dedup**: No dedup for v1. FIFO drain, server state wins after resync.
  The server handles idempotency for toggle-complete; updates overwrite.
- **Partial sync**: Full resync when `data_version` changes. At <1000 tasks this is fast.
- **Web offline support**: Cache is Tauri-only (SQLite via native plugin). Web users get
  the existing "no internet" toast.

---

## Encryption Compatibility

Cache stores ciphertext as-is — whatever the API returns goes into SQLite. When reading
from cache, data flows through the same `use-crypto.ts` decryption pipeline as fresh API
responses. If encryption is enabled but not unlocked, cached data appears encrypted (same
as fresh data) until the user enters their passphrase.

---

## Verification

1. **Read cache**: Launch app online → tasks load → kill app → turn off wifi →
   relaunch → tasks appear from cache (no loading spinner)
2. **Data version sync**: Change a task on web → app syncs within 2 min → shows update
3. **Write queue**: Go offline → complete a task → toast "Queued offline" →
   go online → task syncs to server → data refreshes
4. **Backend checks**: `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
5. **Frontend checks**: `cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build`
6. **Rust compile**: `cd frontend/src-tauri && cargo check`
7. **iOS sim**: `just tauri-ios-sim` → test offline scenario on simulator
