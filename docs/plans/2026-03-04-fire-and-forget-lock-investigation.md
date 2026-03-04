# Fire-and-Forget Skips Per-User Lock — Investigation

---
created: 2026-03-04
---

> Investigation into the race condition where `_fire_and_forget_bulk_sync` in
> `tasks.py` and `instances.py` calls `bulk_sync()` without acquiring the
> per-user `asyncio.Lock` from `gcal_sync.py`.

---

## The Problem

Whendoist has **two code paths** that trigger a full Google Calendar bulk sync:

| Path | File | Lock? |
|------|------|-------|
| `_background_bulk_sync()` | `app/routers/gcal_sync.py:103` | Yes — acquires `_bulk_sync_locks[user_id]` |
| `_fire_and_forget_bulk_sync()` | `app/routers/tasks.py:132`, `app/routers/instances.py:62` | **No** |

The safe path (`_background_bulk_sync`) is only used by two GCal router endpoints:
- `POST /api/gcal-sync/enable` → initial sync after enabling
- `POST /api/gcal-sync/full-sync` → manual full re-sync

The unsafe path (`_fire_and_forget_bulk_sync`) is used by **six** task/instance
mutation endpoints — the ones users hit constantly:
- Create recurring task (`tasks.py:600`)
- Update recurring task (`tasks.py:700`)
- Batch update tasks / encryption toggle (`tasks.py:985`)
- Batch action — complete, schedule, move, delete (`tasks.py:1090`)
- Batch complete instances (`instances.py:309`)
- Batch past instances — complete/skip all past (`instances.py:346`)

The unsafe function is copy-pasted identically in both files:

```python
async def _fire_and_forget_bulk_sync(user_id: int) -> None:
    """Fire-and-forget: run a bulk sync to Google Calendar."""
    try:
        async with async_session_factory() as db:
            from app.services.gcal_sync import GCalSyncService
            sync_service = GCalSyncService(db, user_id)
            await sync_service.bulk_sync()       # ← no lock
            await db.commit()
    except Exception as e:
        logger.warning(f"GCal bulk sync failed for user {user_id}: {e}")
```

Compare with the safe version in `gcal_sync.py`:

```python
async def _background_bulk_sync(user_id: int, *, clear_calendar: bool = False) -> None:
    lock = _bulk_sync_locks.setdefault(user_id, asyncio.Lock())
    if lock.locked():
        logger.info(f"Bulk sync already running for user {user_id}, skipping")
        return
    async with lock:                              # ← lock acquired
        # ... sync logic with progress + cancellation ...
```

---

## Why It Matters

### What `bulk_sync()` does

`GCalSyncService.bulk_sync()` (`app/services/gcal_sync.py:449–792`) performs a
**full reconciliation** of all tasks/instances against Google Calendar:

1. **Read phase** — Fetches all syncable tasks, all non-skipped instances, and all
   existing `GoogleCalendarEventSync` records. Builds in-memory lookup dicts
   (`syncs_by_task`, `syncs_by_instance`).

2. **Write phase** — Loops through each task/instance, compares `sync_hash`, and
   creates/updates/deletes Google Calendar events via API calls.

3. **Cleanup phase** — Deletes orphaned sync records (events whose tasks no longer
   exist or are unscheduled).

Each `bulk_sync()` call opens its own DB session, reads the full state, then writes
back. Without a lock, two concurrent calls read **stale snapshots** of each other's
work.

### Concrete race conditions

**Race 1: Duplicate Google Calendar events**

```
T=0ms   User creates recurring task → fire-and-forget #1 starts
T=5ms   User immediately edits same task → fire-and-forget #2 starts
T=20ms  #1 reads sync records: no record for new instances → will CREATE
T=25ms  #2 reads sync records: no record for new instances → will CREATE
T=50ms  #1 creates event in Google Calendar, inserts sync record
T=55ms  #2 creates DUPLICATE event (didn't see #1's record at T=25ms)
Result: Two identical events in Google Calendar, one permanently orphaned
```

**Race 2: Orphan cleanup deletes live events**

```
T=0ms   fire-and-forget #1 starts, reads sync records
T=10ms  fire-and-forget #2 starts, reads sync records
T=30ms  #2 creates a new sync record for task X, flushes to DB
T=50ms  #1 reaches cleanup phase — its `valid_sync_ids` set doesn't include
        the record #2 just created (stale snapshot from T=0ms)
T=55ms  #1 deletes the Google Calendar event #2 just created
T=60ms  #1 deletes the sync record from DB
Result: Task X has no Google Calendar event, user sees nothing
```

**Race 3: Safe path and unsafe path overlap**

```
T=0ms   User clicks "Full Re-sync" → _background_bulk_sync acquires lock
T=5ms   User edits a recurring task → _fire_and_forget_bulk_sync starts (no lock)
T=???   Both are running bulk_sync() simultaneously on separate DB sessions
Result: Same duplicate/orphan issues as Race 1 and 2
```

### Severity assessment

| Factor | Assessment |
|--------|------------|
| **Likelihood** | Medium — requires two mutations within ~1 second, but batch operations and recurring task edits make this common |
| **Impact** | Medium-High — orphaned/duplicate events in Google Calendar, requiring manual cleanup or full re-sync |
| **Blast radius** | Per-user only (each user has their own sync records) |
| **Self-healing?** | Partial — a subsequent "Full Re-sync" clears orphans, but users don't know to do this |
| **Data loss?** | No permanent data loss — tasks are unaffected, only GCal mirror is inconsistent |

---

## Why Recurring Tasks Use Bulk Sync

Non-recurring tasks use single-event sync helpers (`_fire_and_forget_sync_task`,
`_fire_and_forget_unsync_task`) that sync just one event — these are fast and
conflict-free. But recurring tasks use `bulk_sync()` because:

1. A recurring task change (rule, time, title) affects **all materialized instances**
   — potentially dozens of calendar events
2. Rule changes trigger `regenerate_instances()` which may create/delete instances,
   making it impossible to know exactly which events to sync
3. `bulk_sync()` is the only method that reconciles the full set

This is why the 6 affected call sites all involve recurring tasks or batch operations.

---

## The Fix

### Approach: Reuse the existing lock from `gcal_sync.py`

The lock infrastructure already exists and works well. The fire-and-forget functions
just need to use it. Two options:

**Option A: Import and use the lock directly** (simplest)

Replace both copies of `_fire_and_forget_bulk_sync` with:

```python
async def _fire_and_forget_bulk_sync(user_id: int) -> None:
    """Fire-and-forget: run a bulk sync to Google Calendar, with per-user lock."""
    from app.routers.gcal_sync import _bulk_sync_locks

    lock = _bulk_sync_locks.setdefault(user_id, asyncio.Lock())
    if lock.locked():
        logger.info(f"Bulk sync already running for user {user_id}, skipping")
        return

    async with lock:
        try:
            async with async_session_factory() as db:
                from app.services.gcal_sync import GCalSyncService

                sync_service = GCalSyncService(db, user_id)
                await sync_service.bulk_sync()
                await db.commit()
        except Exception as e:
            logger.warning(f"GCal bulk sync failed for user {user_id}: {e}")
```

**Pros:** Minimal change, lock is shared with `_background_bulk_sync` so all sync
paths are mutually exclusive.

**Cons:** Cross-module import of a "private" variable (`_bulk_sync_locks`). Both
`tasks.py` and `instances.py` import from `gcal_sync.py`.

**Option B: Extract lock into a shared module** (cleaner)

Move the lock dict and helpers into a shared location (e.g. `app/services/gcal_lock.py`
or expose via `GCalSyncService` class methods):

```python
# app/services/gcal_lock.py
import asyncio
import logging

logger = logging.getLogger(__name__)

_bulk_sync_locks: dict[int, asyncio.Lock] = {}


def get_bulk_sync_lock(user_id: int) -> asyncio.Lock:
    return _bulk_sync_locks.setdefault(user_id, asyncio.Lock())


def is_sync_running(user_id: int) -> bool:
    lock = _bulk_sync_locks.get(user_id)
    return lock is not None and lock.locked()
```

Then all three files (`gcal_sync.py`, `tasks.py`, `instances.py`) import from
`gcal_lock.py`.

**Pros:** No cross-router imports, single source of truth for lock.

**Cons:** New file, slightly more refactoring.

### Recommendation: Option A

Option A is the right call for now. The `_bulk_sync_locks` dict is already the
single source of truth — we just need two more files to use it. Extracting to a
separate module is over-engineering for a dict and a helper function. If we add
more sync coordination later (e.g., cancellation from fire-and-forget), we can
extract then.

### DRY: Eliminate the copy-paste

Both `tasks.py` and `instances.py` have **identical** copies of three fire-and-forget
helpers (`_fire_and_forget_sync_instance`, `_fire_and_forget_bulk_sync`, and the
task-specific ones). The bulk sync one should be defined once and imported. Options:

1. Define in `tasks.py`, import in `instances.py` (quick but asymmetric)
2. Define in a shared `app/routers/_gcal_helpers.py` module (clean)
3. Define on `GCalSyncService` as a classmethod (wrong layer — service shouldn't
   know about asyncio.create_task patterns)

Recommendation: **Option 2** — a small `_gcal_helpers.py` module in the routers
package. It holds the fire-and-forget wrappers (which are router-level concerns:
they create their own DB sessions and handle errors for background tasks).

### Changes summary

| File | Change |
|------|--------|
| `app/routers/_gcal_helpers.py` | **New** — shared fire-and-forget helpers with lock |
| `app/routers/tasks.py` | Remove local `_fire_and_forget_bulk_sync`, import from helpers |
| `app/routers/instances.py` | Remove local `_fire_and_forget_bulk_sync`, import from helpers |
| `app/routers/gcal_sync.py` | Import `_bulk_sync_locks` from helpers (or keep as-is if Option A) |

### Edge cases to handle

1. **Lock cleanup** — `asyncio.Lock` objects in `_bulk_sync_locks` are never
   cleaned up. For a single-process app with ~hundreds of users, this is fine
   (each Lock is ~100 bytes). If we scale to thousands of concurrent users, add
   periodic cleanup of unlocked entries.

2. **Skip vs queue** — Current behavior: if lock is held, the sync is **skipped**
   entirely. This means a rapid create→edit sequence might skip the edit's sync.
   This is acceptable because the lock holder's sync will pick up all committed
   changes (it reads from DB). But if the lock holder started *before* the edit
   was committed, the edit's changes won't be synced until the next mutation or
   manual re-sync. A debounce-then-sync pattern would be more robust but is
   significantly more complex.

3. **Cross-process** — `asyncio.Lock` is per-process. If we scale to multiple
   workers (which is already flagged as needing Redis in the backlog), this lock
   won't help. But that's a separate concern tracked under "Redis rate limiting /
   Redis calendar cache" in POST-1.0-BACKLOG.md.

---

## Related Issues

- **POST-1.0-BACKLOG.md** line 57: This item
- **GCal Sync Audit** (`docs/plans/2026-02-09-gcal-sync-audit.md` line 48):
  "Unprotected bulk sync in tasks.py" — identified but deferred
- **GCal Sync Reliability Fixes** (`docs/plans/2026-03-01-gcal-sync-reliability-fixes.md`):
  Added `_fire_and_forget_bulk_sync` to `instances.py` (copied the bug)
- **Rapid toggle drops sync** (POST-1.0-BACKLOG.md line 28): Related but different —
  that's about the lock *correctly* skipping a second enable-sync; this is about
  the lock being *bypassed entirely*

---

*Source: Code audit of `app/routers/tasks.py`, `app/routers/instances.py`,
`app/routers/gcal_sync.py`, `app/services/gcal_sync.py`*
