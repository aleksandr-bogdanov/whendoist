---
version: null
pr: null
created: 2026-03-04
---

# Offline Write Queue — Deep Investigation

Research into implementing an IndexedDB-backed mutation queue with sync-on-reconnect
for Whendoist's React SPA.

> Builds on the [v1.0 gate investigation](2026-02-09-pwa-offline-investigation.md)
> which decided: **warn-only for v1.0, defer queue to v1.1+.** This document is the
> v1.1 follow-up — a detailed architecture and implementation plan.

---

## What Changed Since the v1.0 Investigation

The Feb 9 investigation evaluated the offline queue against the **legacy vanilla JS
frontend** (Jinja2 templates, imperative DOM manipulation, hand-rolled fetch calls).
Since then, the entire frontend was rewritten as a React SPA:

| Dimension | Feb 9 (legacy) | Now (React SPA) |
|-----------|----------------|-----------------|
| Data layer | Manual fetch + DOM updates | TanStack Query v5 with query cache |
| Mutations | Imperative fetch → DOM patch | Orval-generated hooks + `executeBatch()` |
| Optimistic updates | Manual DOM toggle + revert | `queryClient.setQueryData()` + snapshot rollback |
| Offline guard | Per-handler `navigator.onLine` check | Single Axios request interceptor |
| Undo | None (complete had "Retry") | Toast-based reverse mutations for all ops |
| State | Scattered across DOM + closures | Zustand stores + TanStack Query cache |
| Encryption | Not implemented | AES-256-GCM at TanStack Query boundary |

**Why this matters:** TanStack Query v5 has built-in primitives for offline mutation
support (`networkMode`, `MutationCache` persistence, `onlineManager`). The effort
estimate drops significantly because we're working *with* the framework instead of
building from scratch.

---

## Current Offline Behavior

When a user goes offline today:

```
User action (e.g. complete task)
  → Optimistic update applies to TanStack Query cache (instant UI feedback)
  → Mutation fires via Axios
  → Axios request interceptor detects !navigator.onLine
  → Throws NetworkError immediately (never hits network)
  → Mutation fails → optimistic update rolls back
  → User sees: task checkbox flickers, error toast appears
  → useNetworkStatus() shows persistent "No internet connection" toast
```

**Result:** No data loss, but every action fails visibly and requires manual retry
after reconnection. This is frustrating for PWA users on intermittent mobile
connections (subway, airplane mode toggle, spotty WiFi).

---

## What Is an Offline Write Queue?

An offline write queue intercepts mutations that would fail due to no connectivity,
stores them durably (IndexedDB), and replays them automatically when the connection
is restored. Combined with optimistic updates (which we already have), the user
experience becomes:

```
User action (e.g. complete task)
  → Optimistic update applies (instant UI feedback) — SAME AS TODAY
  → Mutation serialized and stored in IndexedDB queue
  → UI shows subtle "pending sync" indicator (e.g. cloud icon with arrow)
  → User continues working, queuing more mutations
  → ...time passes, user reconnects...
  → Queue drains automatically: mutations replay in order
  → On success: invalidate queries to reconcile with server
  → On conflict: surface to user (rare for single-user app)
```

The key insight: **we already do the hard part** (optimistic updates). The queue just
makes them survive network failures and page reloads.

---

## Why Whendoist Needs This

### 1. PWA Is a First-Class Target

Whendoist is an installable PWA with iOS standalone mode, app shortcuts, and a
service worker. Users install it on their phone and use it like a native app.
Native apps don't show "no internet connection" on every tap — they queue locally
and sync when possible.

### 2. The Most Common Offline Actions Are Simple

The mutations users perform most often are also the easiest to queue:

| Action | Frequency | Queue complexity | Conflict risk |
|--------|-----------|-----------------|---------------|
| Complete task | Very high | Low (idempotent) | Very low |
| Skip instance | High | Low (idempotent) | Very low |
| Reschedule task/instance | High | Low (last-write-wins) | Low |
| Quick-add task | Medium | Medium (temp ID) | None |
| Edit task fields | Medium | Low (last-write-wins) | Low |
| Delete task | Low | Low (idempotent) | Very low |
| Create domain | Very low | Medium (temp ID) | None |
| Batch operations | Low | Medium (N mutations) | Low |

80%+ of offline mutations are complete/skip/reschedule — all idempotent or
last-write-wins operations with near-zero conflict risk.

### 3. Single-User Simplifies Everything

Whendoist has no collaboration features. Every task belongs to exactly one user.
This eliminates the hardest class of offline sync problems:

- **No write-write conflicts** from concurrent users editing the same task
- **No need for CRDTs** or operational transforms
- **No merge resolution UI** needed (just last-write-wins)
- **Server state only changes via this client** (plus GCal sync, which is additive)

The only realistic conflict: user edits a task on phone (offline), then edits the
same task on laptop (online) before the phone syncs. Last-write-wins is acceptable
here — it's the same user making both changes.

### 4. Existing Architecture Is 80% Ready

| Requirement | Status |
|-------------|--------|
| Optimistic updates | Done — `executeBatch()` + `setQueryData()` |
| Rollback on failure | Done — snapshot-based in `executeBatch()` |
| Undo support | Done — toast-based reverse mutations |
| Network detection | Done — `useNetworkStatus()` + Axios interceptor |
| Error classification | Done — `NetworkError.recoverable = true` |
| Idempotent backend | Mostly — toggle endpoints need attention |

---

## Architecture Design

### Layer Diagram

```
┌─────────────────────────────────────────────────┐
│                   React UI                       │
│  (components call mutation hooks as usual)       │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│            TanStack Query Mutations              │
│  networkMode: 'offlineFirst'                     │
│  (mutations fire even when offline)              │
│  MutationCache persisted to IndexedDB            │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              Axios + Queue Interceptor            │
│  Online:  → send request normally                │
│  Offline: → serialize to IndexedDB queue         │
│           → return optimistic response           │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              Sync Engine (on reconnect)           │
│  Drains queue in FIFO order                      │
│  Acquires fresh CSRF token first                 │
│  Handles: success, 404 (deleted), 409 (conflict) │
│  Invalidates queries after drain completes       │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              IndexedDB (via idb-keyval)           │
│  Store: offline_mutations                        │
│  Store: optimistic_cache (optional Phase 2)      │
└─────────────────────────────────────────────────┘
```

### Key Design Decision: TanStack Query-Native vs Custom Queue

**Option A: TanStack Query `networkMode: 'offlineFirst'` + Persisted Mutations**

TanStack Query v5 supports pausing mutations when offline and resuming when online.
Combined with `@tanstack/query-persist-client-plugin`, the mutation cache survives
page reloads.

Pros:
- Zero custom queue code — framework handles ordering, retry, dedup
- Integrates directly with existing `useMutation` hooks
- `onlineManager` already tracks connectivity
- Community-maintained, battle-tested

Cons:
- Persisted mutations require **serializable** mutation functions (no closures)
- Our orval-generated hooks use closures extensively
- `mutationFn` must be re-attachable after deserialization (TQ provides `resumeMutations()`)
- Less control over dedup, merge, and conflict resolution

**Option B: Custom IndexedDB Queue Layer**

Build a queue that sits in the Axios interceptor layer. When offline, serialize the
raw HTTP request (method, URL, body, headers) to IndexedDB. On reconnect, replay
requests in order.

Pros:
- Full control over dedup rules, merge logic, conflict handling
- Works at HTTP level — transparent to TanStack Query
- Can implement the dedup rules from the v1.0 investigation
- Simpler mental model: queue is just a list of HTTP requests

Cons:
- More custom code to maintain
- Must handle CSRF token refresh, auth expiry, request ordering
- Doesn't benefit from TanStack Query's retry/backoff logic

**Recommendation: Option A (TanStack Query-native) with a thin custom layer for
dedup/merge.**

TQ's `networkMode: 'offlineFirst'` handles 90% of the work. We add a small
`MutationMeta` system to tag mutations with entity type/ID, enabling dedup rules
(e.g., "if two updates to the same task are queued, keep only the latest").

### IndexedDB Schema

Using `idb-keyval` (2.5 KB, zero-config) for the persistence layer:

```typescript
// Mutation queue entry (stored via TanStack Query persistence)
interface PersistedMutation {
  mutationKey: string[];          // e.g. ["task", "complete", "123"]
  state: MutationState;           // TQ internal state
  meta: {
    entityType: "task" | "instance" | "domain";
    entityId: number | string;    // Server ID or temp UUID
    operationType: "create" | "update" | "delete" | "complete" | "skip" | "schedule";
    timestamp: number;
    // For creates: map temp → server ID after sync
    tempId?: string;
  };
}

// Optimistic cache snapshot (Phase 2)
interface CacheSnapshot {
  queryKey: string;
  data: unknown;                  // Serialized query data
  updatedAt: number;
}
```

### Dedup & Merge Rules

When a new mutation is queued, check existing queue for conflicts:

| Existing | New | Resolution |
|----------|-----|------------|
| complete(task-1) | complete(task-1) | Cancel both (toggle) |
| update(task-1, {title: A}) | update(task-1, {title: B}) | Keep new only |
| create(temp-1, {...}) | update(temp-1, {title: B}) | Merge into single create |
| create(temp-1, {...}) | delete(temp-1) | Remove both |
| delete(task-1) | any(task-1) | Delete wins, remove new |
| skip(instance-1) | unskip(instance-1) | Cancel both |
| schedule(task-1, dateA) | schedule(task-1, dateB) | Keep new only |

These rules prevent the queue from growing unboundedly during long offline periods
and ensure idempotent replay.

### CSRF Token Handling

CSRF tokens expire. Queued mutations can't use stale tokens.

**Solution:** Before draining the queue, the sync engine:
1. Clears the cached CSRF token (`csrfToken = null`)
2. Fetches a fresh token via `GET /api/v1/csrf`
3. Injects the fresh token into all queued requests

This is a one-line change in the Axios interceptor — already implemented for the
403-retry logic.

### Temp ID Resolution (Task/Domain Creation)

Creating entities offline requires temporary IDs so that subsequent mutations can
reference them (e.g., create task → reschedule task).

**Strategy:**
1. Generate UUID v4 client-side: `const tempId = crypto.randomUUID()`
2. Store in optimistic cache with negative numeric ID (to distinguish from server IDs)
3. On sync, server returns real ID in response
4. Scan remaining queue entries: replace `tempId` references with server ID
5. Update TanStack Query cache: swap temp ID for real ID

**Scope limitation:** Only task and domain creation need temp IDs. Instance creation
is server-only (materialization). Subtask creation references parent by ID — parent
must be created first (queue ordering handles this).

---

## Challenges & Mitigations

### 1. Encryption Interaction

**Risk:** Encrypted task titles in IndexedDB become unreadable if the encryption key
changes (user changes passphrase or disables/re-enables encryption).

**Mitigation:** Mutations are queued *after* encryption. The queue stores the
already-encrypted payload (ciphertext). On replay, the server receives the same
ciphertext it would have received online. The encryption key is irrelevant at sync
time — the payload is opaque bytes.

**Edge case:** User disables encryption while offline mutations are queued. The queued
mutations contain encrypted payloads, but the server now expects plaintext. **Resolution:**
Block encryption toggle when queue is non-empty. Show: "Sync pending changes before
changing encryption settings."

### 2. Browser Storage Eviction

**Risk:** Safari evicts IndexedDB data after 7 days of inactivity (non-PWA) or under
storage pressure. Queued mutations could be silently lost.

**Mitigation:**
- Request persistent storage: `navigator.storage.persist()` — prevents eviction on
  Chrome/Edge. Safari ignores this but PWA standalone mode gets more lenient treatment.
- Show queue size in UI: "3 changes pending sync" — user awareness
- On queue loss detection (empty queue after reload when we expected entries), show
  warning: "Some offline changes may have been lost. Please verify your tasks."

**Reality check:** For a single-user task app, the queue is tiny (rarely >50 entries).
Storage pressure eviction targets large caches, not small key-value stores.

### 3. Toggle Endpoints vs Absolute State

**Risk:** `toggle-complete` is not idempotent. If the server state changed between
queue time and sync time, toggle produces the wrong result.

**Mitigation:** Convert toggle calls to absolute calls at queue time:
- User completes task → queue `POST /tasks/{id}/complete` (not toggle)
- User uncompletes task → queue `POST /tasks/{id}/uncomplete`
- Same for instances: use `complete`/`skip`/`unskip` instead of `toggle-complete`

This requires the mutation layer to know the intended state, not just "toggle."
The optimistic update logic already knows this (it checks `completed_at` to decide
the next state), so this is a small refactor.

### 4. Auth Session Expiry

**Risk:** User stays offline for hours/days. Session cookie expires. Queue replay
gets 401 on every request.

**Mitigation:**
- On first 401 during queue drain: pause queue, redirect to login (existing behavior)
- After re-authentication: queue drain resumes automatically (entries persist in IDB)
- Queue entries don't store auth tokens — cookies are handled by the browser

### 5. Stale Optimistic UI After Reload

**Risk:** User makes changes offline, closes app, reopens. TanStack Query cache is
empty (in-memory only). Optimistic updates are lost. UI shows stale server data even
though queue has pending mutations.

**Mitigation (Phase 2):** Persist the TanStack Query cache to IndexedDB using
`@tanstack/query-persist-client-plugin`. On reload, hydrate from persisted cache
(which includes optimistic updates), then drain queue in background.

**Phase 1 alternative:** On reload with non-empty queue, show banner: "You have
pending changes from your last session. Syncing now..." and drain immediately.
UI will jump once server responds and queries invalidate — acceptable for Phase 1.

### 6. Undo While Offline

**Risk:** User completes a task offline (queued), then hits "Undo" (also offline).
Both the original and reverse mutations are in the queue.

**Mitigation:** This is exactly what dedup rules solve. The dedup engine sees
`complete(task-1)` followed by `uncomplete(task-1)` and cancels both — the task
never changed on the server. Zero network requests on reconnect.

### 7. Background Sync API

The Background Sync API (`SyncManager.register()`) would allow queue drain even when
the app tab is closed. However:
- **Safari/iOS:** Not supported (our primary PWA target)
- **Firefox:** Not supported
- **Chrome/Edge:** Supported

**Decision:** Don't depend on Background Sync. Drain queue on app foreground (page
visibility change + online event). If Background Sync is available, register it as
a bonus — but the primary sync path is in-app.

---

## Phased Implementation Plan

### Phase 1: Core Queue (~5–6 days)

**Goal:** Mutations survive offline periods within a single session. No page-reload
persistence yet.

| Task | Days | Details |
|------|------|---------|
| Add `idb-keyval` dependency | 0.1 | ~2.5 KB, zero-config IndexedDB wrapper |
| Configure TQ `networkMode: 'offlineFirst'` | 0.5 | Global default for all mutations |
| Replace toggle endpoints with absolute | 1 | `complete`/`uncomplete` instead of `toggle-complete` |
| Build mutation meta system | 0.5 | Tag mutations with entity/operation for dedup |
| Build dedup engine | 1 | Scan queue on enqueue, apply merge rules |
| Modify Axios offline interceptor | 0.5 | Queue instead of reject when offline |
| Build sync engine (drain on reconnect) | 1 | FIFO drain, fresh CSRF, error handling |
| UI: pending sync indicator | 0.5 | Badge/icon showing queue depth |
| Block encryption toggle when queue non-empty | 0.2 | Guard in settings page |
| Manual testing + edge cases | 1 | Offline/online cycling, rapid mutations |

**Lines of code estimate:** ~600–800 new, ~200 modified

**New files:**
- `frontend/src/lib/offline-queue.ts` — queue manager, dedup engine, sync engine
- `frontend/src/hooks/use-offline-queue.ts` — React hook for queue state/UI
- `frontend/src/components/layout/sync-indicator.tsx` — pending sync badge

**Modified files:**
- `frontend/src/lib/api-client.ts` — replace offline guard with queue interceptor
- `frontend/src/lib/query-client.ts` — set `networkMode: 'offlineFirst'`
- `frontend/src/lib/batch-mutations.ts` — use absolute endpoints, add mutation meta
- `frontend/src/routes/_authenticated/settings.lazy.tsx` — guard encryption toggle
- `frontend/src/hooks/use-network-status.ts` — trigger queue drain on reconnect

### Phase 2: Persistence Across Reloads (~3–4 days)

**Goal:** Queued mutations and optimistic cache survive page close/refresh.

| Task | Days | Details |
|------|------|---------|
| Add `@tanstack/query-persist-client-plugin` | 0.2 | Official TQ persistence plugin |
| Persist mutation cache to IndexedDB | 1 | Serialize/deserialize mutation state |
| Persist query cache to IndexedDB | 1 | Optimistic UI survives reload |
| Rehydration logic on app startup | 0.5 | Load cache → show UI → drain queue |
| Request `navigator.storage.persist()` | 0.2 | Prevent storage eviction |
| Handle queue loss detection | 0.5 | Warn if persisted queue disappeared |
| Testing (reload scenarios) | 1 | Close-while-offline, force-kill, etc. |

**Lines of code estimate:** ~300–400 new, ~100 modified

### Phase 3: Robustness & Polish (~2–3 days)

**Goal:** Production-grade edge case handling.

| Task | Days | Details |
|------|------|---------|
| Conflict resolution for 404/409/410 | 0.5 | Task deleted on another device |
| Retry with exponential backoff | 0.5 | For transient server errors during drain |
| Queue size limit (prevent unbounded growth) | 0.3 | Cap at ~500 entries, warn user |
| "Discard pending changes" escape hatch | 0.5 | Manual queue clear in settings |
| Background Sync registration (Chrome bonus) | 0.5 | Best-effort, non-critical path |
| Analytics: track queue depth and sync latency | 0.3 | Sentry breadcrumbs |
| Testing (long offline periods, large queues) | 1 | Stress testing |

**Lines of code estimate:** ~200–300 new

### Total Estimate

| Phase | Days | New LOC | Modified LOC |
|-------|------|---------|-------------|
| Phase 1: Core queue | 5–6 | ~700 | ~200 |
| Phase 2: Persistence | 3–4 | ~350 | ~100 |
| Phase 3: Robustness | 2–3 | ~250 | ~50 |
| **Total** | **10–13** | **~1,300** | **~350** |

vs. the Feb 9 estimate of **14 days / 1,090 lines** — slightly more code but fewer
days because TanStack Query handles the hard parts (retry, pause/resume, cache
management).

---

## Prerequisites

1. **JS test infrastructure** — The dedup engine and sync engine have complex logic
   that demands automated tests. Vitest should be set up with CI integration before
   starting Phase 1. (Listed as a separate backlog item: "JS test infrastructure")

2. **Encryption system stable** — No pending changes to the encryption toggle flow
   or key derivation. The queue's encryption guard depends on the current architecture.

3. **Toggle → absolute endpoint refactor** — Can be done as a standalone PR before
   the queue work. This makes all task/instance mutations idempotent, which is
   valuable independent of offline support.

---

## What This Does NOT Cover

- **Offline reads** (serving cached task list when offline) — out of scope; requires
  service worker caching strategy for API responses, separate investigation
- **Real-time sync** (WebSocket push from server) — out of scope; v2.0 feature
- **Multi-device conflict resolution** — not needed until collaboration features (v3.0)
- **Offline instance materialization** — recurring instances are server-generated;
  the client can't materialize new ones offline. Users see existing instances but
  can't see future ones until reconnected.

---

## Open Questions

1. **Should Phase 1 include persistence (Phase 2)?** If users frequently close the
   PWA while offline, in-session-only queuing has limited value. But Phase 1 without
   persistence is still useful for intermittent connectivity (subway, elevator).

2. **Queue drain: immediate or user-triggered?** Automatic drain on reconnect is
   seamless but surprising if the user forgot what they did offline. A "Sync now"
   button gives control but adds friction. **Recommendation:** auto-drain with a
   toast showing what was synced ("Synced 3 changes").

3. **Should we persist the full TanStack Query cache (Phase 2)?** This gives instant
   UI on reload but adds complexity (stale data, cache invalidation on login/logout).
   Alternative: only persist the mutation queue, accept a loading state on reload.

4. **Maximum offline duration to support?** 1 hour (commute) vs 1 day (flight) vs
   1 week (vacation without internet) affects queue size limits and staleness
   tolerance. **Recommendation:** target 1 day; warn at 100+ queued mutations.

---

*Source: codebase exploration of `frontend/src/lib/api-client.ts`, `batch-mutations.ts`,
`query-client.ts`, `hooks/use-network-status.ts`, `hooks/use-crypto.ts`,
`stores/`, TanStack Query v5 docs, and the
[v1.0 gate investigation](2026-02-09-pwa-offline-investigation.md).*
