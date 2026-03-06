---
created: 2026-03-06
scope: v0.57.0 → v0.64.1
type: audit
---

# Audit 2: Data Integrity & API Correctness

Scope: All changes since commit 8af04e6 (v0.57.0) through v0.64.1.
Focus: data flow correctness, API contracts, database queries, sync logic.

---

## Critical Findings

_None._

---

## High Findings

### H1. Failed offline mutations silently discarded — data loss

**Files:** `frontend/src/hooks/use-offline-sync.ts:167-174`

When the write queue drains on reconnect, any mutation that fails (409 conflict, 400 validation,
transient 500) is removed from the queue permanently. The user sees a generic toast
"X offline changes couldn't sync" but the mutation data is gone forever.

```typescript
} catch (e) {
  console.warn(`[offline-sync] Failed to replay queued mutation: ...`, e);
  await removePendingWrite(entry.id);  // DATA LOSS: failed mutation discarded
  failed++;
}
```

**Impact:** User loses offline edits on any server error, including transient failures
that would succeed on retry.

---

## Medium Findings

### M1. No conflict detection in offline sync — last-write-wins

**Files:** `frontend/src/hooks/use-offline-sync.ts`, `frontend/src/lib/tauri-cache.ts`

The write queue stores raw HTTP requests (method, URL, body). When replayed, they hit the
server with potentially stale data. If a user edits a task offline and also edits it on
another device, the offline replay silently overwrites the other device's changes. No
merge, no conflict detection, no user prompt.

**Impact:** Silent data overwrites across devices.

### M2. Cache not cleared on 401/session expiry — cross-user data leak

**Files:** `frontend/src/lib/api-client.ts:166-172`, `frontend/src/components/layout/header.tsx:166-173`

The logout button calls `clearAllCache()`, but the 401 interceptor redirects to `/login`
without clearing the SQLite cache. If user A's session expires and user B logs in on the
same device, user B briefly sees user A's cached tasks/domains on cold start.

```typescript
// api-client.ts — 401 handler
if (isTauri) {
  import("./tauri-token-store").then(({ clearDeviceToken }) => clearDeviceToken());
  // clearAllCache() is NOT called here
}
window.location.href = "/login";
```

**Impact:** Brief cross-user data exposure on shared devices (Tauri only).

### M3. Push `reminder_sent_at` set even when ALL pushes fail

**Files:** `app/tasks/push_notifications.py:129-131`

After sending to all devices, `reminder_sent_at` is set unconditionally regardless of
whether any push succeeded. If all device pushes fail (network error, FCM outage),
the reminder is marked as sent and will never be retried.

**Impact:** Lost push reminders on transient delivery failures.

### M4. Recurring task instances do not get push reminders

**Files:** `app/tasks/push_notifications.py:53-71`, `app/services/task_service.py:699-712`

The push notification query and the local reminders endpoint both query only the `tasks`
table. `TaskInstance` has no `reminder_minutes_before` or `reminder_sent_at` fields.
Recurring tasks fire the reminder only for the parent task's date, not each instance.

**Impact:** Users with recurring tasks + reminders only get notified once (first occurrence).

### M5. Orval-generated types are stale (v0.57.1)

**Files:** `frontend/src/api/model/meResponse.ts`, all generated types

Generated types show OpenAPI spec version `0.57.1`. Backend is at v0.64.1. Missing fields:
- `MeResponse.data_version` (used by offline sync via inline type workaround)
- `TaskResponse.reminder_minutes_before`
- `PreferencesResponse.secondary_timezone`, `calendar_hour_height`

**Impact:** TypeScript type-checking is incomplete. No runtime bug (JS ignores extra
fields), but missing auto-complete and type safety. Fix: `cd frontend && npx orval`.

### M6. All task queries clobber same cache key

**Files:** `frontend/src/hooks/use-offline-sync.ts:248-269`

`persistToCache` matches query keys by `String(queryKey[0])` only, ignoring params.
All task queries (regardless of filter params) are cached under the single key `"tasks"`.
If multiple task list queries exist with different params, they overwrite each other.

**Impact:** Wrong cached data hydrated on cold start if multiple task list views exist.

### M7. No proactive cleanup of stale device tokens

**Files:** `app/routers/push_notifications.py`, `app/tasks/push_notifications.py:121-127`

There is no background job pruning device tokens with old `updated_at`. Tokens for
uninstalled apps persist until the push loop hits them and gets a 404/410. Tokens for
users who never trigger reminders accumulate indefinitely.

**Impact:** Stale token accumulation; wasted push attempts on first reminder.

---

## Low Findings

### L1. `fire_and_forget_unsync_task` does not trip circuit breaker

**Files:** `app/routers/_gcal_helpers.py:103-119`

Unlike the sync and sync-instance paths, the unsync path catches all exceptions with a
generic `logger.warning` and does NOT check for `CalendarGoneError` or add the user to
`_sync_disabled_users`. Unsyncs keep hitting Google's API after a 403 until process restart.

**Impact:** Unnecessary API calls to Google after token revocation.

### L2. Circuit breaker is process-local across workers

**Files:** `app/routers/_gcal_helpers.py:30`

`_sync_disabled_users` lives in process memory. Multi-worker deployments have separate sets.
The persistence fix (`_persist_sync_disable`) mitigates this — once `gcal_sync_enabled = False`
is committed, other workers see it on next prefs read. Window is small but nonzero.

**Impact:** Brief window of extra 403s across workers. Not a data integrity issue.

### L3. `reminder_sent_at` not reset on uncomplete

**Files:** `app/routers/tasks.py:587-594`, `app/services/task_service.py:554`

If a task is completed then uncompleted, `reminder_sent_at` remains set. The push will not
re-fire unless the user also changes the schedule (which triggers the reset logic).
Likely intentional but undocumented.

**Impact:** Missed reminder if user uncompletes a task without rescheduling.

### L4. No-token users get reminder marked as sent permanently

**Files:** `app/tasks/push_notifications.py:99-105`

Users with no registered device tokens still get `reminder_sent_at` set. If they register
a device shortly after, the reminder is already consumed.

**Impact:** Missed first reminder for newly registered devices.

### L5. Missing indexes on reminder columns

**Files:** `alembic/versions/20260304_205448_...py`, `alembic/versions/20260304_230255_...py`

`tasks.reminder_minutes_before` and `tasks.reminder_sent_at` have no indexes. The push
notification query filters on both. The existing `(user_id, scheduled_date)` composite
index may cover the primary path, but a dedicated index could help the reminder scanner.

**Impact:** Potentially slower reminder queries at scale.

### L6. GCal sync duplicate cleanup migration is not fully reversible

**Files:** `alembic/versions/20260301_035641_add_gcal_sync_unique_constraints.py:25-49`

The `upgrade()` deletes duplicate rows before adding unique constraints. The `downgrade()`
drops constraints but does not restore deleted duplicates. Acceptable since duplicates
were data corruption.

**Impact:** Migration downgrade loses cleaned-up duplicate data.

### L7. No cache TTL / expiry

**Files:** `frontend/src/lib/tauri-cache.ts`

`cache_entries.updated_at` exists but is never checked for expiry. Users who don't open
the app for weeks see potentially very stale data on cold start before network fetch.

**Impact:** UX issue — stale data briefly visible on cold start after long inactivity.

### L8. `data_version` bump silently skipped under lock contention

**Files:** `app/services/data_version.py:36-42`

On PostgreSQL, the bump uses a savepoint with 2-second timeout. If another transaction
holds the row lock, the bump is silently skipped (logged at `debug`). The client's
2-minute polling won't detect the mutation until the next successful bump.

**Impact:** Cache staleness window extended by up to 2 minutes. By design.

### L9. `_persist_sync_disable` failure logged at debug only

**Files:** `app/routers/_gcal_helpers.py:52`

If the dedicated session commit fails, sync auto-disable is not persisted. Logged at
`debug` level — could be `warning` for better observability.

**Impact:** Missed observability. Circuit breaker still works in-process.

---

## Informational / No Issue

| Area | Finding |
|------|---------|
| GCal auto-enable after OAuth | Idempotent with `useRef` guard. Wizard flow intentionally skips auto-enable. |
| GCal enable/disable race | Per-user `asyncio.Lock` prevents concurrent bulk syncs. Single-task syncs are safe (distinct task_ids). |
| Bulk sync atomicity | Non-atomic by design — periodic commits during token refresh act as save points. Correct for long-running operations. |
| `union_all` pattern | Consistently followed in all 5 analytics queries combining Task + TaskInstance. |
| Timezone handling | `RecurrenceService` correctly converts user-local to UTC. `get_user_today` has proper timezone fallback. |
| N+1 queries | No N+1 issues found. `ensure_instances_materialized` uses GROUP BY pre-filter. GCal sync pre-fetches tasks. |
| Global exception handler | Correctly returns generic `{"detail": "Internal server error"}` — no stack trace leaks. |
| OpenAPI docs in production | Disabled (`docs_url=None, redoc_url=None`). |
| v0.63.1 data_version lock fix | Savepoint + `SET LOCAL statement_timeout` is correct. Failure is isolated and harmless. |
| Migration reversibility | All 7 new migrations have proper `downgrade()` functions (except L6 data cleanup). |
| Migration indexes | `activity_log`, `device_tokens`, `feed_token` all properly indexed. |
| Batch update non-atomicity | Intentional, documented, idempotent. Commits every 25 items. |

---

## Summary by Severity

| Severity | Count | Key Themes |
|----------|-------|------------|
| Critical | 0 | — |
| High | 1 | Offline mutation data loss |
| Medium | 7 | Conflict detection, cross-user cache leak, push reliability, stale types |
| Low | 9 | Circuit breaker gaps, missing indexes, cache TTL, observability |
