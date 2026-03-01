---
version: v0.55.62
pr: 555
created: 2026-03-01
---

# Fix: GCal full re-sync doesn't actually re-sync + silent error swallowing

## Context

GCal sync shows "211 tasks synced" with no errors, but events in Google Calendar
are outdated/missing. Two root causes:

1. **Full re-sync is a no-op for unchanged tasks.** `POST /full-sync` calls
   `bulk_sync()` which checks sync record hashes. If the hash matches (task fields
   unchanged), the event is skipped — never verifying it actually exists in GCal.
   Compare with `POST /enable`, which deletes all sync records first, then recreates
   everything from scratch.

2. **Fire-and-forget sync errors are invisible.** Non-CalendarGone/TokenRefresh
   errors in `_fire_and_forget_sync_task()` are logged at `debug` level
   (`tasks.py:61`), making failures invisible in production.

## Changes

### 1. Make full-sync actually re-sync (`app/routers/gcal_sync.py`)

The `full_sync` endpoint should clear all sync records before running bulk_sync,
matching what the enable endpoint does. This ensures all events are recreated fresh.

```python
# full_sync endpoint (line 342-361)
# Add: delete all sync records + pass clear_calendar=True
await db.execute(
    delete(GoogleCalendarEventSync).where(
        GoogleCalendarEventSync.user_id == user.id,
    )
)
await db.commit()
asyncio.create_task(_background_bulk_sync(user.id, clear_calendar=True))
```

### 2. Promote fire-and-forget error logging (`app/routers/tasks.py`)

Change `logger.debug` → `logger.warning` in all fire-and-forget functions so
sync failures are visible in production logs:

- `_fire_and_forget_sync_task` (line 61)
- `_fire_and_forget_unsync_task` (line 77)
- `_fire_and_forget_sync_instance` (line 108)
- `_fire_and_forget_bulk_sync` (line 121)

## Files to modify

- `app/routers/gcal_sync.py` — full_sync endpoint
- `app/routers/tasks.py` — fire-and-forget error logging

## Verification

1. `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
2. Manual: enable sync → see events → click "Re-sync" → events recreated fresh
