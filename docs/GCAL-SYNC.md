# Google Calendar Sync

One-way sync: Whendoist → Google Calendar. Changes in Whendoist propagate to a dedicated "Whendoist" calendar. Changes in Google Calendar do NOT propagate back.

---

## What Gets Synced

| Task Type | Has Time | Syncs to GCal |
|-----------|----------|---------------|
| One-off | No | ✅ All-day event |
| One-off | Yes | ✅ Timed event |
| Recurring | No | ❌ Stays in Whendoist |
| Recurring | Yes | ✅ Timed event |

**Why recurring without time don't sync:** Daily habits ("Sport machen", "Чтение книги") flood the calendar with 60+ all-day events each. Recurring tasks only sync when you commit them to a specific time slot. See [archive/2026-02-02-gcal-habits-clutter.md](archive/2026-02-02-gcal-habits-clutter.md) for the full analysis.

### Other rules

- Completed tasks: `✓` prepended to title + color changed to Graphite
- Encrypted tasks (E2E enabled): NOT synced — toggle greyed out in settings
- Subtasks: synced as individual events (subtasks are full tasks in Whendoist)
- Domain names, comments, attachments: NOT synced

---

## Sync Triggers

| Event | What happens |
|-------|-------------|
| Create one-off task | Fire-and-forget `sync_task()` |
| Create recurring task | Fire-and-forget `bulk_sync()` (syncs all instances) |
| Update one-off task | Fire-and-forget `sync_task()` |
| Update recurring task | Fire-and-forget `bulk_sync()` |
| Delete task | Fire-and-forget `unsync_task()` |
| Complete/uncomplete one-off | Fire-and-forget `sync_task()` |
| Complete/uncomplete instance | Fire-and-forget `sync_task_instance()` |
| Background materialization (hourly) | `bulk_sync()` for each user with new instances |

All sync triggers are fire-and-forget (`asyncio.create_task`). Failures never break task operations.

---

## Architecture

```
User action (create/update/delete/complete)
  → app/routers/tasks.py fires async sync
    → app/services/gcal_sync.py (GCalSyncService)
      → app/services/gcal.py (GoogleCalendarClient) → Google Calendar API

Background (hourly)
  → app/tasks/recurring.py materializes instances (60-day window)
    → bulk_sync() for users with new instances
```

### Key Components

| File | Role |
|------|------|
| `app/services/gcal_sync.py` | `GCalSyncService`: sync_task, sync_task_instance, bulk_sync, unsync |
| `app/services/gcal.py` | `GoogleCalendarClient`: CRUD for calendars and events, `build_event_data()`, `compute_sync_hash()` |
| `app/routers/gcal_sync.py` | API endpoints (enable/disable/status/full-sync), background sync orchestration, in-memory locks/progress/cancellation |
| `app/tasks/recurring.py` | Hourly instance materialization + bulk sync trigger |
| `app/routers/tasks.py` | Fire-and-forget sync triggers on task CRUD |

### Change Detection

`compute_sync_hash()` hashes: title, description, scheduled_date, scheduled_time, duration_minutes, impact, status. If the hash matches the stored `GoogleCalendarEventSync.sync_hash`, the event is skipped (already in sync).

### Rate Limiting

`_AdaptiveThrottle` adds 0.2s delay between API calls (~5 QPS). On rate limit 403 (`usageLimits` domain), adds 3s penalty and retries with exponential backoff (5s, 10s, 20s). Well under Google's 10 QPS per-user limit.

---

## Enable/Disable Flow

**Enable:**
1. `POST /api/v1/gcal-sync/enable`
2. `find_or_create_calendar("Whendoist")` — reuses existing, deletes duplicates
3. Returns immediately, fires `bulk_sync()` in background
4. UI polls `GET /status` every 1s for progress

**Disable:**
1. `POST /api/v1/gcal-sync/disable`
2. Signals cancellation to any running bulk sync
3. If user chose "delete events": deletes entire Whendoist calendar (1 API call)
4. Bulk-deletes all sync records

---

## Data Model

```python
# Tracks which tasks/instances are synced to which GCal events
class GoogleCalendarEventSync:
    user_id: int                    # Multitenancy
    task_id: int | None             # For one-off tasks
    task_instance_id: int | None    # For recurring task instances
    google_event_id: str            # GCal event ID
    sync_hash: str                  # Hash of synced fields
    last_synced_at: datetime
    # Constraint: exactly one of task_id or task_instance_id must be set

# On UserPreferences:
gcal_sync_enabled: bool
gcal_sync_calendar_id: str | None
gcal_sync_error: str | None         # Auto-set on calendar-level errors
```

---

## Known Limitations

1. **In-memory state** — Locks, progress, and cancellation are per-process. Acceptable for single-instance deployment.
2. **One-way only** — Google Calendar changes don't propagate back (by design, same as Todoist).
3. **Calendar deletion on disable** — Entire Whendoist calendar removed. Re-enable creates a fresh one.
4. **Recurring tasks use individual events** — Each `TaskInstance` is a separate GCal event, not an RRULE recurring event. Simpler but more API calls.

---

## History

| Version | Change |
|---------|--------|
| v0.31.0 | Initial GCal sync implementation |
| v0.31.2–v0.31.7 | Round 1 hardening: rate limiting, dedup, async sync, UI polling ([archived](archive/2026-02-02-gcal-sync-hardening-v1.md)) |
| v0.32.0–v0.32.3 | Round 2 hardening: calendar deletion, progress tracking, cancellation, 5x faster sync ([archived](archive/2026-02-02-gcal-sync-hardening.md)) |
| v0.32.5 | Recurring tasks without time don't sync ([analysis](archive/2026-02-02-gcal-habits-clutter.md)) |
| v0.32.6 | Materialization deferred to background task |
| v0.32.7 | Recurring task instances sync immediately on create/update |
