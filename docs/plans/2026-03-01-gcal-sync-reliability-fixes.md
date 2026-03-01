---
version:
pr:
created: 2026-03-01
---

# GCal Sync Reliability Fixes

## Context

Full re-sync produces outdated/missing events in Google Calendar. Investigation found 8 bugs across the sync pipeline, ranging from silent rate-limit failures to missing sync triggers.

## Fixes (by file)

### 1. `app/services/gcal.py` — Client & API fixes

**A. `clear_all_events()` — add throttling + proper error handling (Bug #1)**
- Add 0.2s delay between delete calls (match `GCAL_SYNC_BATCH_DELAY_SECONDS`)
- Change `except Exception` → log at warning level, track failure count
- Return tuple `(attempted, failed)` or just log failures visibly

**B. `GoogleCalendarClient` — mid-session token refresh (Bug #2)**
- Add `async def refresh_token_if_needed(self)` method:
  - Calls `_needs_refresh()`, if true → `_ensure_valid_token()` → update `self._client.headers["Authorization"]`
- Call it from bulk_sync periodically (every ~50 operations)

**C. `compute_sync_hash()` — remove `impact` param (Bug #7)**
- Remove `impact` from the hash since `build_event_data` doesn't use it for the event payload
- Update all call sites (sync_task, sync_task_instance, bulk_sync x2)

### 2. `app/services/gcal_sync.py` — Sync logic fixes

**A. Recurring instances without `scheduled_time` → all-day events (Bug #5)**
- In `sync_task_instance()`: remove the early return when `scheduled_time` is None; instead pass `None` to `build_event_data` which already handles all-day events
- In `bulk_sync()` instance loop: same — remove the `if not scheduled_time: continue`
- Use `instance.instance_date` as the date (already available)

**B. Skip syncing skipped instances (Bug #6)**
- In `bulk_sync()` instance query: add `TaskInstance.status != "skipped"`
- In `sync_task_instance()`: if `instance.status == "skipped"`, unsync and return

**C. Call `refresh_token_if_needed()` periodically (Bug #2)**
- After every 50 operations in bulk_sync, call `client.refresh_token_if_needed()`

### 3. `app/routers/instances.py` — Add sync triggers (Bug #3)

Add fire-and-forget GCal sync to all instance mutation endpoints:
- `complete_instance` → sync instance
- `uncomplete_instance` → sync instance
- `toggle_instance_complete` → sync instance
- `skip_instance` → unsync instance
- `unskip_instance` → sync instance
- `schedule_instance` → sync instance
- `batch_complete_instances` → bulk_sync
- `batch_past_instances` → bulk_sync

Define minimal `_fire_and_forget_sync_instance` and `_fire_and_forget_bulk_sync` helpers locally (mirror pattern from `tasks.py`).

### 4. `app/routers/tasks.py` — Batch update sync (Bug #8)

- Add `_fire_and_forget_bulk_sync(user.id)` call at end of `batch_update_tasks`

### 5. `app/models.py` + migration — Unique constraint (Bug #4)

- Add unique constraints: `UniqueConstraint("user_id", "task_id", name="uq_gcal_sync_user_task")` and `UniqueConstraint("user_id", "task_instance_id", name="uq_gcal_sync_user_instance")`
- These are partial (nullable columns) — PostgreSQL allows multiple NULLs in unique constraints by default, which is correct
- Migration: deduplicate existing rows first (keep newest by `last_synced_at`), then add constraints

### 6. Housekeeping

- Bump version → `0.55.64`
- `uv lock`
- Update CHANGELOG.md
- No new docs needed (bug fixes to existing feature)

## Verification

```bash
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```
