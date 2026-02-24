# Google Calendar Sync — Hardening Changes (v0.31.2 – v0.31.7)

This document describes all changes made to the GCal sync system between v0.31.2 and v0.31.7 to fix reliability, rate limiting, deduplication, and UX issues discovered after the initial v0.31.0 release.

---

## Problem Statement

After deploying the initial GCal sync (v0.31.0), production logs revealed:

1. **Enable/disable loop** — Bulk sync hit 403 errors and auto-disabled sync immediately. The user saw success, then an error banner, and had to re-enable repeatedly.
2. **All 403s treated as permission loss** — Google returns 403 for both rate limits (`usageLimits` domain) and actual permission errors. The circuit breaker couldn't distinguish them.
3. **Massive rate limiting** — ~376 tasks synced with no delay, hitting Google's per-user quota instantly. The API returned hundreds of 403s.
4. **Duplicate calendars** — Each re-enable created a new "Whendoist" calendar instead of reusing the existing one. After several attempts, 5+ calendars existed.
5. **Duplicate events** — Old sync records pointed to stale calendar IDs, so re-syncs created duplicates instead of updating.
6. **Synchronous bulk sync** — The enable and re-sync endpoints blocked the HTTP response for minutes while syncing hundreds of tasks. Users clicked multiple times, spawning concurrent syncs.
7. **No progress indication** — No way for the user to know a sync was running or how far along it was.

---

## Changes by Version

### v0.31.2 — Circuit Breaker

**Files:** `app/services/gcal_sync.py`

- Bulk sync now catches calendar-level errors (403/404/410) at the top of the loop and aborts immediately instead of retrying hundreds of tasks one by one.
- On abort: auto-disables sync, clears the stale calendar ID, records an error message in `prefs.gcal_sync_error`.
- Settings page shows an error banner when `sync_error` is set, telling the user to re-enable.
- Re-enable always created a fresh calendar (later changed in v0.31.5).

### v0.31.5 — Rate Limit Detection, Adaptive Throttle, Calendar Dedup

**Files:** `app/services/gcal_sync.py`, `app/services/gcal.py`, `app/routers/gcal_sync.py`, `app/constants.py`, `app/templates/settings.html`

This was the largest change. It addressed rate limiting, duplicate calendars, concurrent syncs, and UI responsiveness.

#### 1. Rate Limit vs Permission 403 Detection

Google's 403 response body contains an `errors` array. Rate limits have `"domain": "usageLimits"`. Permission errors have `"domain": "calendar"` or similar.

```python
# app/services/gcal_sync.py

def _is_rate_limit_error(e: Exception) -> bool:
    """Check if an exception is a Google API rate limit (403 with rateLimitExceeded)."""
    if isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 403:
        try:
            body = e.response.json()
            errors = body.get("error", {}).get("errors", [])
            return any(err.get("domain") == "usageLimits" for err in errors)
        except Exception:
            pass
    return False
```

The existing `_is_calendar_error()` was updated to exclude rate limit 403s:

```python
def _is_calendar_error(e: Exception) -> bool:
    if isinstance(e, httpx.HTTPStatusError):
        if e.response.status_code in (404, 410):
            return True
        if e.response.status_code == 403:
            return not _is_rate_limit_error(e)  # <-- key change
    return False
```

**Impact:** Rate limit 403s are now retried with backoff instead of permanently disabling sync.

#### 2. Adaptive Throttle

Replaced a simple `asyncio.sleep(0.15)` between API calls with an `_AdaptiveThrottle` class that adjusts dynamically:

```python
# app/services/gcal_sync.py

class _AdaptiveThrottle:
    def __init__(self) -> None:
        self.delay = GCAL_SYNC_BATCH_DELAY_SECONDS  # 1.0s

    async def call[T](self, fn, *args, **kwargs) -> T:
        await asyncio.sleep(self.delay)
        for attempt in range(GCAL_SYNC_RATE_LIMIT_MAX_RETRIES + 1):
            try:
                return await fn(*args, **kwargs)
            except httpx.HTTPStatusError as e:
                if _is_rate_limit_error(e) and attempt < GCAL_SYNC_RATE_LIMIT_MAX_RETRIES:
                    self.delay += GCAL_SYNC_RATE_LIMIT_PENALTY_SECONDS  # +3s
                    backoff = GCAL_SYNC_RATE_LIMIT_BACKOFF_BASE * (2 ** attempt)  # 5s, 10s, 20s
                    await asyncio.sleep(backoff)
                    continue
                raise
        raise RuntimeError("Unreachable")
```

All bulk sync API calls go through `throttle.call(client.create_event, ...)` instead of calling the client directly.

Constants in `app/constants.py`:

| Constant | Value | Purpose |
|---|---|---|
| `GCAL_SYNC_BATCH_DELAY_SECONDS` | `1.0` | Base delay between every API call (~1 QPS) |
| `GCAL_SYNC_RATE_LIMIT_MAX_RETRIES` | `3` | Max retries per call when rate-limited |
| `GCAL_SYNC_RATE_LIMIT_BACKOFF_BASE` | `5.0` | Exponential backoff base (5s, 10s, 20s) |
| `GCAL_SYNC_RATE_LIMIT_PENALTY_SECONDS` | `3.0` | Added to base delay on each rate limit hit (permanent for batch) |

**Behavior:** A batch of 376 tasks starts at ~1 QPS. If rate-limited at task 200, delay increases to 4s and the failing call retries after 5s. If hit again, delay becomes 7s with 10s retry. The throttle never resets within a single bulk sync — it only gets slower.

#### 3. Calendar Deduplication (`find_or_create_calendar`)

New method on `GoogleCalendarClient` that replaces `create_calendar` in the enable flow:

```python
# app/services/gcal.py

async def find_or_create_calendar(self, name: str = "Whendoist") -> tuple[str, bool]:
    calendars = await self.list_calendars()
    matches = [c for c in calendars if c.summary == name and not c.primary]
    if matches:
        calendar_id = matches[0].id
        for dup in matches[1:]:
            try:
                await self.delete_calendar(dup.id)
            except Exception:
                logger.warning(f"Failed to delete duplicate calendar {dup.id}")
        return calendar_id, False  # Reused existing
    calendar_id = await self.create_calendar(name)
    return calendar_id, True  # Created new
```

Also added `delete_calendar()` which silently ignores 404/410 (already deleted).

**Impact:** Re-enabling sync no longer creates duplicate calendars. Existing duplicates are auto-cleaned.

#### 4. Sync Record Preservation

Previously, re-enabling cleared ALL sync records. Now records are only cleared when the calendar ID actually changes (i.e., old calendar was deleted and a new one was created):

```python
# app/routers/gcal_sync.py — enable endpoint

if prefs.gcal_sync_calendar_id and prefs.gcal_sync_calendar_id != calendar_id:
    await db.execute(delete(GoogleCalendarEventSync).where(...))
```

**Impact:** Re-enabling with the same calendar reuses existing sync records. The bulk sync then detects unchanged events via `sync_hash` and skips them, preventing duplicate creation.

#### 5. Per-User Sync Lock

A module-level `dict[int, asyncio.Lock]` prevents concurrent bulk syncs for the same user:

```python
# app/routers/gcal_sync.py

_bulk_sync_locks: dict[int, asyncio.Lock] = {}

async def _background_bulk_sync(user_id: int) -> None:
    if user_id not in _bulk_sync_locks:
        _bulk_sync_locks[user_id] = asyncio.Lock()
    lock = _bulk_sync_locks[user_id]
    if lock.locked():
        logger.info(f"Bulk sync already running for user {user_id}, skipping")
        return
    async with lock:
        async with async_session_factory() as db:
            sync_service = GCalSyncService(db, user_id)
            stats = await sync_service.bulk_sync()
            await db.commit()
```

**Impact:** Double-clicking enable or re-sync no longer spawns duplicate syncs.

#### 6. Background Bulk Sync (Enable Endpoint)

The enable endpoint now returns immediately after creating/finding the calendar. Bulk sync runs in the background via `asyncio.create_task`:

```python
# app/routers/gcal_sync.py — enable endpoint

asyncio.create_task(_background_bulk_sync(user.id))
return SyncEnableResponse(success=True, message="Sync enabled. Syncing tasks in background...")
```

The background task creates its own database session (`async_session_factory()`) so it doesn't depend on the request's session lifecycle.

### v0.31.6 — Fully Async Full-Sync + UI Polling

**Files:** `app/routers/gcal_sync.py`, `app/templates/settings.html`

#### 1. Non-Blocking Full-Sync Endpoint

The `/full-sync` endpoint was still synchronous — it blocked the HTTP response until all tasks were synced. Changed to fire a background task:

```python
# app/routers/gcal_sync.py — full-sync endpoint

if _is_sync_running(user.id):
    return BulkSyncResponse(success=True, error="Sync already in progress.")
asyncio.create_task(_background_bulk_sync(user.id))
return BulkSyncResponse(success=True)
```

#### 2. Sync Status Polling

The status endpoint now reports whether a sync is running:

```python
# app/routers/gcal_sync.py — status endpoint

syncing=_is_sync_running(user.id),
```

`_is_sync_running` checks if the user's lock exists and is currently held.

#### 3. UI Re-Sync Progress

The re-sync button now shows live progress by polling the status endpoint every 3 seconds:

```javascript
// app/templates/settings.html

async function resyncAllTasks() {
    btn.disabled = true;
    btn.textContent = 'Syncing...';
    await fetch('/api/v1/gcal-sync/full-sync', { method: 'POST', ... });
    _pollSyncStatus(btn);
}

function _pollSyncStatus(btn) {
    const poll = setInterval(async () => {
        const data = await (await fetch('/api/v1/gcal-sync/status')).json();
        btn.textContent = `Syncing... (${data.synced_count} events)`;
        if (!data.syncing) {
            clearInterval(poll);
            if (data.sync_error) location.reload();
            else {
                btn.textContent = `Done (${data.synced_count} events)`;
                setTimeout(() => { btn.textContent = 'Re-sync'; btn.disabled = false; }, 3000);
            }
        }
    }, 3000);
}
```

#### 4. Auto-Detect Running Sync on Page Load

If the user navigates to settings while a sync is already running, the page auto-detects it:

```javascript
(async function checkSyncOnLoad() {
    const btn = document.getElementById('btn-resync');
    if (!btn) return;
    const data = await (await fetch('/api/v1/gcal-sync/status')).json();
    if (data.syncing) {
        btn.disabled = true;
        btn.textContent = `Syncing... (${data.synced_count} events)`;
        _pollSyncStatus(btn);
    }
})();
```

---

## File Summary

| File | Changes |
|---|---|
| `app/services/gcal_sync.py` | `_is_rate_limit_error()`, `_AdaptiveThrottle` class, updated `_is_calendar_error()` to exclude rate limits, circuit breaker abort in `bulk_sync()` |
| `app/services/gcal.py` | `find_or_create_calendar()`, `delete_calendar()` |
| `app/routers/gcal_sync.py` | `_bulk_sync_locks`, `_is_sync_running()`, `_background_bulk_sync()`, enable/full-sync fire background tasks, status endpoint includes `syncing` |
| `app/constants.py` | `GCAL_SYNC_BATCH_DELAY_SECONDS=1.0`, `GCAL_SYNC_RATE_LIMIT_MAX_RETRIES=3`, `GCAL_SYNC_RATE_LIMIT_BACKOFF_BASE=5.0`, `GCAL_SYNC_RATE_LIMIT_PENALTY_SECONDS=3.0` |
| `app/templates/settings.html` | Re-sync polls status, shows live event count, auto-detects running sync on page load, enable button disabled during operation |

---

## Architecture After Changes

```
User clicks "Enable Sync"
  → POST /enable
    → find_or_create_calendar() (reuses existing, deletes dupes)
    → Save calendar_id, set enabled=true, commit
    → asyncio.create_task(_background_bulk_sync)
    → Return 200 immediately

_background_bulk_sync:
  → Acquire per-user asyncio.Lock (skip if already locked)
  → Create independent DB session
  → GCalSyncService.bulk_sync():
      → Load all tasks + instances + existing sync records
      → For each task:
          → Compute sync_hash
          → If hash matches existing record → skip
          → If record exists but hash differs → update event via throttle.call()
          → If no record → create event via throttle.call()
      → Delete orphaned sync records (tasks removed/unscheduled)
      → On calendar-level 403/404 → abort, auto-disable, set sync_error
      → On rate limit 403 → adaptive throttle slows down + retries
  → Commit

User clicks "Re-sync"
  → POST /full-sync
    → Check _is_sync_running → if yes, return "already in progress"
    → asyncio.create_task(_background_bulk_sync)
    → Return 200 immediately
  → UI polls GET /status every 3s
    → Shows "Syncing... (N events)" on re-sync button
    → When syncing=false → shows "Done (N events)" for 3s → resets button

Settings page load
  → GET /status
    → If syncing=true → start polling automatically
```

### v0.31.7 — Hardening Fixes

**Files:** `app/services/gcal_sync.py`, `app/services/gcal.py`, `app/routers/gcal_sync.py`, `app/constants.py`, `app/templates/settings.html`

#### 1. Lock Race Condition Fix

The per-user lock dict init had a TOCTOU race — two concurrent calls could each create a different `asyncio.Lock()` for the same user. Fixed with `setdefault`:

```python
# Before (TOCTOU):
if user_id not in _bulk_sync_locks:
    _bulk_sync_locks[user_id] = asyncio.Lock()
lock = _bulk_sync_locks[user_id]

# After (atomic):
lock = _bulk_sync_locks.setdefault(user_id, asyncio.Lock())
```

#### 2. Throttled Orphan Deletion

Orphan event deletion in `bulk_sync()` and `delete_all_synced_events()` now uses the `_AdaptiveThrottle` to avoid triggering rate limits during cleanup of large event sets.

#### 3. Calendar Reuse with Event Cleanup

When re-enabling sync and an existing "Whendoist" calendar is found, all events in that calendar are now cleared via `clear_all_events()` before bulk sync recreates them. Sync records are always cleared on enable (not just when calendar ID changes). This prevents orphan events that could accumulate from previous interrupted syncs.

New method `GoogleCalendarClient.clear_all_events(calendar_id)` fetches all event IDs via pagination and deletes each one.

#### 4. UI Duration Clarification

The settings page now states that sync may take up to 10 minutes depending on the number of tasks, both in the panel description and the re-sync row.

#### 5. Dead Constant Removed

`GCAL_SYNC_BATCH_RATE_LIMIT = 100` was defined in `app/constants.py` but never referenced. Removed.

---

## Known Limitations

1. **In-memory lock** — `_bulk_sync_locks` is per-process. If running multiple server instances, each instance has its own lock. This is acceptable for single-instance Railway deployment.
2. **No websocket push** — Status polling uses HTTP (3s interval). A websocket would be more efficient but adds complexity for minimal gain.
3. **One-way sync only** — Changes made in Google Calendar (moving, deleting events) do not propagate back to Whendoist. This is by design (same as Todoist).
4. **Throttle does not persist** — The adaptive delay resets on each bulk sync. If every sync hits rate limits, the first ~100 calls will always be at 1 QPS before the penalty kicks in.
