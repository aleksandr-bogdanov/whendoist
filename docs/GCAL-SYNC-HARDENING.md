# Google Calendar Sync — Hardening (v0.31.2 – v0.32.3)

Reliability and performance fixes for the GCal one-way sync, applied across two rounds of hardening after the initial v0.31.0 release.

For the original sync design, see [GCAL-SYNC-PLAN.md](GCAL-SYNC-PLAN.md).

---

## Round 1: v0.31.2 – v0.31.7

Addressed rate limiting, duplicate calendars/events, synchronous blocking, and UI feedback. Archived in detail at [archive/2026-02-02-gcal-sync-hardening-v1.md](archive/2026-02-02-gcal-sync-hardening-v1.md).

**Key changes:**

| Version | Fix |
|---------|-----|
| v0.31.2 | Circuit breaker — abort bulk sync on calendar-level 403/404, auto-disable with error message |
| v0.31.5 | Rate limit vs permission 403 detection, `_AdaptiveThrottle`, `find_or_create_calendar` dedup, per-user `asyncio.Lock`, background bulk sync |
| v0.31.6 | Non-blocking `/full-sync`, UI polling with live event count, auto-detect running sync on page load |
| v0.31.7 | Lock TOCTOU fix (`setdefault`), throttled orphan deletion, calendar reuse with `clear_all_events` |

---

## Round 2: v0.32.0 – v0.32.3

After round 1, production testing with ~384 events revealed three more issues.

### Problems

1. **Disable sync hangs** — `delete_all_synced_events()` looped through every sync record with a 1-second throttle delay per API call. With 384 records, the HTTP request took 6+ minutes and timed out. The frontend got no response, so the toggle stayed on.

2. **Enable sync blocks** — When re-enabling with an existing calendar, `clear_all_events()` ran synchronously in the enable handler, deleting hundreds of events one by one before returning a response.

3. **Progress stuck at 0** — The status endpoint counted `GoogleCalendarEventSync` rows in the database, but `bulk_sync()` only committed at the end. During the entire sync, the count was 0.

4. **Disable during sync doesn't stop it** — The background `asyncio.create_task` ran independently. Disabling sync set the DB flag, but the task's own session never re-read it.

5. **Bulk sync too slow** — 1-second throttle delay (~1 QPS) meant 384 events took ~6.5 minutes. Google allows ~10 QPS per user.

### Changes

#### v0.32.0 — Disable & Enable Performance

**Disable: delete calendar, not individual events**

Replaced the `delete_all_synced_events()` loop (384 API calls) with a single `client.delete_calendar(calendar_id)` call. Sync records are cleaned up in one bulk `DELETE` query. The disable endpoint now also clears `gcal_sync_calendar_id` for clean re-enable state.

```python
# app/routers/gcal_sync.py — disable endpoint
if data and data.delete_events and calendar_id:
    async with GoogleCalendarClient(db, google_token) as client:
        await client.delete_calendar(calendar_id)
    # Bulk delete sync records in one query
await db.execute(delete(GoogleCalendarEventSync).where(...))
prefs.gcal_sync_calendar_id = None
```

**Enable: clear stale events in background**

Moved `clear_all_events()` from the enable handler into `_background_bulk_sync()`. The enable endpoint now only calls `find_or_create_calendar()` (1-2 API calls) and returns immediately.

```python
# app/routers/gcal_sync.py
asyncio.create_task(_background_bulk_sync(user.id, clear_calendar=not created))
```

**Frontend error handling**

Added `alert()` and `location.reload()` for failed disable requests (previously silently failed).

#### v0.32.1 — Real-Time Progress & 5x Faster Sync

**In-memory progress tracking**

Module-level `_bulk_sync_progress: dict[int, dict]` updated via callback after every operation in `bulk_sync()`. The status endpoint reads from this when sync is running, falling back to DB count when idle.

```python
# app/services/gcal_sync.py — bulk_sync
def _report() -> None:
    if on_progress:
        on_progress(stats)

# Called after every stats increment (created, updated, skipped, deleted)
```

```python
# app/routers/gcal_sync.py — status endpoint
if syncing and progress:
    synced_count = sum(progress.get(k, 0) for k in ("created", "updated", "skipped"))
```

**Throttle reduced to 0.2s (~5 QPS)**

`GCAL_SYNC_BATCH_DELAY_SECONDS` changed from `1.0` to `0.2`. 384 events: ~80s instead of ~6.5 min. Still well under Google's 10 QPS limit, with adaptive backoff as safety net.

**Optimistic UI**

Toggle flips immediately on click. Shows "Enabling..."/"Disabling..." text while the API call runs. Polling interval reduced from 3s to 1s.

**Dead code removed**

`delete_all_synced_events()` removed from `GCalSyncService` — replaced by calendar-level deletion in the disable endpoint.

#### v0.32.2 — Cancellation on Disable

**In-memory cancellation signal**

```python
# app/routers/gcal_sync.py
_bulk_sync_cancelled: set[int] = set()

def _cancel_sync(user_id: int) -> None:
    _bulk_sync_cancelled.add(user_id)
```

The disable endpoint calls `_cancel_sync(user.id)`. The `bulk_sync()` method accepts an `is_cancelled` callback, checked at the start of each loop iteration (tasks, instances, orphans). On cancellation, it breaks out of the current loop, skips orphan deletion, and commits whatever was synced.

```python
# app/services/gcal_sync.py — bulk_sync loops
for task in tasks:
    if _check_cancelled():
        stats["cancelled"] = True
        break
    ...
```

The flag is cleaned up in a `finally` block after the background task completes.

#### v0.32.3 — Error Logging

Changed `logger.error(f"...{e}")` to `logger.exception(...)` for calendar deletion failures, since some exception types produced empty string representations.

---

## Current Architecture

```
User clicks "Enable Sync"
  -> POST /enable
    -> find_or_create_calendar() (reuses existing, deletes dupes)
    -> Save calendar_id, set enabled=true, commit
    -> asyncio.create_task(_background_bulk_sync(clear_calendar=True if reused))
    -> Return 200 immediately

_background_bulk_sync:
  -> Acquire per-user asyncio.Lock (skip if already locked)
  -> If clear_calendar: clear_all_events() in background
  -> Create independent DB session
  -> GCalSyncService.bulk_sync(on_progress, is_cancelled):
      -> Load all tasks + instances + existing sync records
      -> For each task/instance:
          -> Check is_cancelled() -> break if true
          -> Compute sync_hash
          -> skip / update / create via throttle.call() (0.2s delay)
          -> Report progress after each operation
      -> Delete orphaned sync records (skipped if cancelled)
  -> Commit
  -> Clean up progress + cancellation flags

User clicks "Disable Sync"
  -> POST /disable
    -> _cancel_sync(user.id)  -- signal background task to stop
    -> If delete_events: delete_calendar() (1 API call)
    -> Bulk delete sync records, clear calendar_id
    -> Return 200

UI Polling (1s interval)
  -> GET /status
    -> If sync running: return in-memory progress counts
    -> If idle: return DB count of sync records
```

---

## File Summary

| File | Key Components |
|------|---------------|
| `app/routers/gcal_sync.py` | `_bulk_sync_locks`, `_bulk_sync_progress`, `_bulk_sync_cancelled`, `_background_bulk_sync()`, enable/disable/status/full-sync endpoints |
| `app/services/gcal_sync.py` | `_AdaptiveThrottle`, `GCalSyncService.bulk_sync()` with `on_progress` and `is_cancelled` callbacks |
| `app/services/gcal.py` | `GoogleCalendarClient` (find/create/delete calendar, CRUD events), `build_event_data()`, `compute_sync_hash()` |
| `app/constants.py` | `GCAL_SYNC_BATCH_DELAY_SECONDS=0.2`, rate limit constants |
| `app/templates/settings.html` | Toggle with optimistic UI, 1s polling, auto-detect running sync |

---

## Known Limitations

1. **In-memory state** — Locks, progress, and cancellation are per-process. Acceptable for single-instance Railway deployment.
2. **No websocket push** — Polling at 1s interval. Adequate for the use case.
3. **One-way sync only** — Google Calendar changes don't propagate back (by design).
4. **Throttle resets per sync** — Each bulk sync starts at 0.2s base delay. Penalty only accumulates within a single run.
5. **Calendar deletion on disable** — If the user chose "delete events", the entire Whendoist calendar is removed. Re-enabling creates a fresh one (user loses any Google Calendar customization like color).
