# Google Calendar Task Sync — Implementation Plan

Sync Whendoist scheduled tasks to a dedicated "Whendoist" calendar in the user's Google Calendar, similar to how Todoist does it.

---

## How Todoist Does It (Research)

- Creates a **dedicated "Todoist" calendar** in Google Calendar
- Tasks with date+time become timed events; date-only become all-day events
- Completed tasks: **checkmark prepended** to event title (event stays, not deleted)
- **One-way sync** (Todoist -> GCal). Two-way was deprecated due to reliability issues
- Field mapping: title->summary, description->description, date/time->start, duration->end
- Subtasks and comments are NOT synced
- Recurring tasks: mapped to Google Calendar RRULE when possible, individual events as fallback
- No special visual styling — differentiation comes from the separate calendar's color

---

## Architecture: One-Way Sync (Whendoist -> Google Calendar)

**Core idea**: When task sync is enabled, scheduled tasks appear as events in a dedicated "Whendoist" calendar. Changes in Whendoist propagate to Google Calendar. Changes in Google Calendar do NOT propagate back.

### What Gets Synced

| Task State | Google Calendar Result |
|---|---|
| Task with `scheduled_date` only (no time) | All-day event |
| Task with `scheduled_date` + `scheduled_time` | Timed event (start + duration) |
| Task with no `scheduled_date` | NOT synced (no calendar representation) |
| Subtask with scheduling | Synced like any other task (subtasks are full tasks in Whendoist) |
| Completed task | Checkmark `✓` prepended to title + color changed to Graphite |
| Recurring task | Each materialized TaskInstance synced as individual event |
| Encrypted task (E2E enabled) | NOT synced — sync toggle greyed out in UI with explanation |

---

## Implementation Phases

### Phase 0: Data Integrity Fix (Prerequisite)

**Problem**: `duration_minutes` is nullable. A task can have `scheduled_time` without `duration_minutes`. The dashboard silently defaults to 30min (`pages.py:230`). This is a data integrity gap.

**Fix**: Enforce that if `scheduled_time` is set, `duration_minutes` must also be set.

Files to modify:
- `app/routers/tasks.py` — Add Pydantic validator on `CreateTaskRequest` and `UpdateTaskRequest`: if `scheduled_time` is provided, `duration_minutes` is required
- `static/js/task-dialog.js` — Add client-side validation: when time is picked, require duration
- `static/js/plan-tasks.js` — When Plan My Day auto-schedules a task at a time, ensure duration is set (it already reads from `data-duration` which falls back to `DEFAULT_TASK_DURATION`)

For existing tasks with `scheduled_time` but no `duration_minutes`: run a one-time migration to set `duration_minutes = 30` where null.

---

### Phase 1: OAuth Scope Upgrade

**Current state**: `app/auth/google.py` uses `calendar.readonly` scope.

**Changes**:
- Add `https://www.googleapis.com/auth/calendar` scope (read-write) to the scope list
- This is opt-in: existing users keep working with readonly tokens
- When a user enables task sync, check if their token has the write scope
  - If not: redirect to Google OAuth with `prompt=consent` to get a new token with expanded scope
  - On callback: store new tokens, proceed with calendar creation
- Store scope status: add `gcal_write_scope: bool` field to `GoogleToken` model

Files to modify:
- `app/auth/google.py` — Add write scope constant, add re-auth flow
- `app/models.py` — Add `gcal_write_scope` to `GoogleToken`
- `app/routers/auth.py` — Handle scope upgrade callback

---

### Phase 2: Database Model Changes

**New model**: `GoogleCalendarEventSync` — maps Whendoist tasks to Google Calendar events.

```python
class GoogleCalendarEventSync(Base):
    __tablename__ = "google_calendar_event_syncs"

    id: Mapped[int]                          # PK
    user_id: Mapped[int]                     # FK -> User (multitenancy filter)
    task_id: Mapped[int | None]              # FK -> Task (for non-recurring tasks)
    task_instance_id: Mapped[int | None]     # FK -> TaskInstance (for recurring occurrences)
    google_event_id: Mapped[str]             # Google Calendar event ID
    sync_hash: Mapped[str]                   # Hash of synced fields to detect changes
    last_synced_at: Mapped[datetime]         # UTC
    created_at: Mapped[datetime]

    # Constraint: exactly one of task_id or task_instance_id must be set
    # Index on (user_id, task_id) and (user_id, task_instance_id)
```

**New fields on `UserPreferences`**:

```python
gcal_sync_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
gcal_sync_calendar_id: Mapped[str | None] = mapped_column(String, nullable=True)  # "Whendoist" calendar ID
gcal_sync_all_day: Mapped[bool] = mapped_column(Boolean, default=True)  # Sync date-only tasks
```

Files to modify:
- `app/models.py` — Add `GoogleCalendarEventSync` model, add fields to `UserPreferences`
- Create migration: `just migrate-new "add_gcal_sync_models"`

---

### Phase 3: Google Calendar Write Client

**Extend `app/services/gcal.py`** with write methods.

New methods on `GoogleCalendarClient`:

```python
async def create_calendar(self, name: str = "Whendoist") -> str:
    """Create a new calendar. Returns calendar_id."""

async def create_event(self, calendar_id: str, event: dict) -> str:
    """Create an event. Returns event_id."""

async def update_event(self, calendar_id: str, event_id: str, event: dict) -> None:
    """Update an existing event."""

async def delete_event(self, calendar_id: str, event_id: str) -> None:
    """Delete an event. Silently ignores 404/410 (already deleted)."""
```

**Event data builder** — maps task fields to Google Calendar event format:

```python
def build_event_data(task, is_completed: bool = False) -> dict:
    title = f"✓ {task.title}" if is_completed else task.title

    event = {
        "summary": title,
        "description": task.description or "",
    }

    if task.scheduled_time:
        # Timed event
        start_dt = datetime.combine(task.scheduled_date, task.scheduled_time)
        end_dt = start_dt + timedelta(minutes=task.duration_minutes)
        event["start"] = {"dateTime": start_dt.isoformat(), "timeZone": user_timezone}
        event["end"] = {"dateTime": end_dt.isoformat(), "timeZone": user_timezone}
    else:
        # All-day event
        event["start"] = {"date": task.scheduled_date.isoformat()}
        end_date = task.scheduled_date + timedelta(days=1)
        event["end"] = {"date": end_date.isoformat()}

    # Color by impact (or Graphite if completed)
    if is_completed:
        event["colorId"] = "8"   # Graphite
    else:
        event["colorId"] = {1: "11", 2: "6", 3: "5", 4: "2"}[task.impact]
        # P1=Tomato(11), P2=Tangerine(6), P3=Banana(5), P4=Sage(2)

    return event
```

Files to modify:
- `app/services/gcal.py` — Add write methods and event builder
- `app/constants.py` — Add `GCAL_SYNC_DEFAULT_CALENDAR_NAME`, `GCAL_EVENT_COLOR_MAP`, `GCAL_COMPLETED_COLOR_ID`

---

### Phase 4: Sync Service

**New file**: `app/services/gcal_sync.py`

Core operations:

```
sync_task(task_or_instance):
    1. Check gcal_sync_enabled → skip if disabled
    2. Check if task has scheduled_date → if not, unsync (delete event if exists) and return
    3. Check gcal_sync_all_day preference if task is date-only → skip if disabled
    4. Build event payload from task fields
    5. Compute sync_hash (hash of title + description + date + time + duration + impact + status)
    6. Look up GoogleCalendarEventSync record for this task/instance
       - Exists + hash matches → skip (already in sync)
       - Exists + hash differs → update_event in Google Calendar, update sync record
       - Doesn't exist → create_event, save new sync record
    7. Update sync_hash + last_synced_at

unsync_task(task_or_instance):
    1. Look up sync record
    2. If exists → delete_event from Google Calendar, delete sync record

mark_completed(task_or_instance):
    1. Calls sync_task internally (which will detect the status change via hash)
    2. Event title gets ✓ prefix, color changes to Graphite(8)

mark_uncompleted(task_or_instance):
    1. Calls sync_task internally (removes ✓, restores impact color)

bulk_sync(user):
    1. Fetch all scheduled tasks for user
    2. Fetch all existing sync records
    3. Diff: create missing, update changed, delete orphaned
    4. Throttle to respect Google Calendar API rate limits (100 req / 100s / user)
```

**Error handling**:
- 401/403 from Google → mark token as needing re-auth, disable sync temporarily
- 404/410 on update/delete → sync record is stale, delete it
- 429 rate limit → exponential backoff
- Network errors → log and retry on next mutation

Files to create:
- `app/services/gcal_sync.py`

---

### Phase 5: Integration Points (Trigger Sync on Mutations)

Wire sync calls into existing task operations using fire-and-forget `asyncio.create_task()`.

**In `app/services/task_service.py`** — after these operations:
- `create_task()` → `gcal_sync.sync_task(task)`
- `update_task()` → `gcal_sync.sync_task(task)` (or `unsync_task` if scheduled_date removed)
- `delete_task()` → `gcal_sync.unsync_task(task)`
- `complete_task()` → `gcal_sync.sync_task(task)` (detects completion via hash)
- `uncomplete_task()` → `gcal_sync.sync_task(task)` (detects uncompletion via hash)

**In `app/tasks/recurring.py`** — after instance materialization:
- For each new TaskInstance created → `gcal_sync.sync_task_instance(instance)`

**Implementation pattern**:
```python
async def create_task(self, ...):
    task = ...  # existing creation logic
    # Fire-and-forget sync (don't block the request)
    if user_prefs.gcal_sync_enabled:
        asyncio.create_task(gcal_sync.sync_task(task, user_id=self.user_id))
    return task
```

Sync failures must NEVER break task operations. Wrap in try/except, log errors.

Files to modify:
- `app/services/task_service.py` — Add sync triggers
- `app/tasks/recurring.py` — Add sync triggers for new instances

---

### Phase 6: API Endpoints

**New router**: `app/routers/v1/gcal_sync.py`

Endpoints:
- `POST /api/v1/gcal-sync/enable` — Enable sync. If write scope missing, return re-auth URL. If scope OK, create "Whendoist" calendar, run initial bulk sync.
- `POST /api/v1/gcal-sync/disable` — Disable sync. Optionally delete all synced events from Google Calendar.
- `POST /api/v1/gcal-sync/full-sync` — Manual re-sync everything (bulk_sync).
- `GET /api/v1/gcal-sync/status` — Returns: enabled, calendar_id, total synced count, last sync time, any errors.

Register in `app/routers/v1/__init__.py`.

Files to create:
- `app/routers/v1/gcal_sync.py`

Files to modify:
- `app/routers/v1/__init__.py` — Register new router

---

### Phase 7: Dashboard Deduplication

When Google Calendar events are fetched for the 15-day carousel, events from the "Whendoist" calendar should be **filtered out** to avoid showing both the native task and the synced event.

**In `app/routers/pages.py`** — when loading Google Calendar events:
- Check if event's `calendar_id` matches the user's `gcal_sync_calendar_id`
- If so, skip it (it's a mirror of a native task, already shown as a task)

This is a simple filter on the existing event loading logic.

Files to modify:
- `app/routers/pages.py` — Filter out Whendoist calendar events

---

### Phase 8: Settings UI

Add sync toggle to the preferences/settings page.

- Toggle: "Sync tasks to Google Calendar"
  - **Greyed out** when E2E encryption is enabled, with tooltip: "Sync requires unencrypted task titles"
  - When toggled ON: triggers re-auth flow if needed, then creates calendar + bulk sync
  - When toggled OFF: asks whether to delete synced events or leave them
- Sub-toggle: "Include date-only tasks as all-day events" (default: on)
- Status line: "Synced to: Whendoist calendar (N tasks)" or error message
- Button: "Re-sync all tasks"

Files to modify:
- `app/templates/` — Settings template (add sync toggle section)
- `static/js/` — Handle toggle interactions, re-auth redirect
- `app/routers/preferences.py` — Save sync preferences

---

## Field Mapping Reference

| Whendoist | Google Calendar | Notes |
|---|---|---|
| `task.title` | `event.summary` | Prepend `✓ ` when completed |
| `task.description` | `event.description` | Plain text |
| `scheduled_date + scheduled_time` | `event.start.dateTime` | With user's timezone |
| `scheduled_date` (no time) | `event.start.date` | All-day event |
| `duration_minutes` | `event.end` = start + duration | Required when time is set (Phase 0 fix) |
| `impact` P1-P4 | `event.colorId` | P1=Tomato(11), P2=Tangerine(6), P3=Banana(5), P4=Sage(2) |
| completed | `event.colorId` = Graphite(8) + `✓` prefix | Double visual signal |
| `domain.name` | (not synced) | Keep events clean |
| subtasks | Synced as individual events | Subtasks are full tasks in Whendoist |

---

## Recurring Tasks Strategy

Sync each **materialized TaskInstance** as an individual Google Calendar event (NOT as a Google Calendar recurring event with RRULE).

**Rationale**:
- Whendoist already materializes instances in a 60-day rolling window
- Avoids complex recurrence_rule -> RRULE conversion and edge cases
- Handles custom recurrence patterns Google Calendar can't express
- Each instance gets its own `GoogleCalendarEventSync` record via `task_instance_id`
- New instances created by the hourly background job get synced automatically

**Trade-off**: More events in Google Calendar, but simpler and more reliable.

---

## Encryption Constraint

When `encryption_enabled = True`, task titles are encrypted client-side. The server never sees plaintext. Syncing encrypted gibberish to Google Calendar is useless.

**Decision**: The "Sync to Google Calendar" toggle is **greyed out / disabled** in the UI when E2E encryption is enabled, with a clear explanation. No runtime checks needed in the sync service — the toggle can't be turned on.

---

## Scope Boundaries (What NOT to Build)

- **No two-way sync** — editing events in Google Calendar does NOT update Whendoist tasks. Todoist deprecated their two-way sync due to reliability issues.
- **No webhook listener** from Google Calendar — only needed for two-way sync.
- **No comment/attachment sync** — not relevant.
- **No domain name in events** — keep event titles clean.

---

## Constants to Add (`app/constants.py`)

```python
GCAL_SYNC_CALENDAR_NAME = "Whendoist"
GCAL_SYNC_DEFAULT_DURATION_MINUTES = 30  # Fallback (shouldn't be needed after Phase 0)
GCAL_COMPLETED_COLOR_ID = "8"  # Graphite
GCAL_IMPACT_COLOR_MAP = {
    1: "11",  # P1 Critical -> Tomato
    2: "6",   # P2 High -> Tangerine
    3: "5",   # P3 Medium -> Banana
    4: "2",   # P4 Low -> Sage
}
GCAL_SYNC_BATCH_RATE_LIMIT = 100  # Max requests per 100 seconds per user
```

---

## Implementation Order

1. **Phase 0**: Data integrity fix — enforce duration when time is set
2. **Phase 1**: OAuth scope upgrade with re-auth flow
3. **Phase 2**: Database models + migration
4. **Phase 3**: `gcal.py` write methods
5. **Phase 4**: `gcal_sync.py` sync service
6. **Phase 5**: Wire sync into task_service.py and recurring.py
7. **Phase 6**: API endpoints for enable/disable/status
8. **Phase 7**: Dashboard deduplication
9. **Phase 8**: Settings UI toggle
