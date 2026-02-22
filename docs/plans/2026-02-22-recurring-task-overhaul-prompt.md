---
version:
pr:
created: 2026-02-22
---

# Recurring Task System — Complete Overhaul Prompt

> **How to use:** Paste this entire document as a prompt to Claude with `think hardest`.
> It contains the full current state, every known bug, and the desired behavior spec.

---

## Context

Whendoist is a task scheduling app (FastAPI + React SPA). It has a recurring task
system built on a **parent task + materialized instances** model. The system is
broken in multiple ways — duplicates on the calendar, invisible tasks in the task
list, timezone bugs, race conditions, and dead code. This prompt describes
everything so you can fix it once and for all.

---

## Current Architecture

### Data Model

**Task** (parent — the "template"):
- `is_recurring: bool` — marks this as a recurring series
- `recurrence_rule: dict` — e.g. `{"freq": "daily", "interval": 4}`
- `recurrence_start: date` — when the series begins
- `recurrence_end: date | None` — when it stops (null = forever)
- `scheduled_date: date` — auto-synced with `recurrence_start`
- `scheduled_time: time | None` — time of day for each occurrence
- Has `instances` relationship (one-to-many, cascade delete)

**TaskInstance** (one per occurrence date):
- `task_id` → FK to parent Task
- `instance_date: date` — the specific occurrence
- `scheduled_datetime: datetime | None` — full datetime if parent has a time
- `status: pending | completed | skipped`
- `completed_at: datetime | None`
- Unique constraint: `(task_id, instance_date)`
- Does NOT have its own title/description/impact — reads from parent via relationship

### Instance Lifecycle

1. **On task creation** (`POST /tasks` with `is_recurring=true`): `materialize_instances()` generates instances for the next 60 days using `dateutil.rrule`
2. **On task update** (`PUT /tasks/{id}`): if `recurrence_rule`, `scheduled_time`, `recurrence_start`, or `recurrence_end` changed → `regenerate_instances()` deletes future pending instances and re-materializes
3. **Background job** (hourly): extends the 60-day window as time passes, cleans up completed/skipped instances older than 90 days
4. **On-demand**: `get_or_create_instance_for_date()` creates an instance if one doesn't exist (for toggle-complete)

### Frontend Data Flow

The React dashboard has two panels side by side:
- **Left: Task Panel** — shows Pending tasks (grouped by domain), Scheduled section, Completed section
- **Right: Calendar Panel** — day view with time grid, Google Calendar events, scheduled tasks, and recurring instances

---

## Every Known Bug (numbered for reference)

### Bug 1: Recurring tasks are invisible in the task panel

**Where:** `frontend/src/lib/task-utils.ts` — `categorizeTasks()` line ~222

```typescript
// This skips ALL recurring tasks from pending, scheduled, and completed buckets
if (task.is_recurring) continue;
```

Recurring parent tasks never appear in any task panel section. They're only visible through their instances on the calendar. Users cannot see their recurring tasks in a list.

### Bug 2: Calendar only fetches pending instances

**Where:** `frontend/src/components/calendar/calendar-panel.tsx` line ~97

The `useListInstances` call doesn't pass `status`, so the API defaults to `status="pending"`. When a user completes an instance on the calendar:
1. Optimistic update shows it as completed (briefly)
2. Query invalidation fires
3. Refetch returns only pending instances
4. The completed instance vanishes from the calendar

Non-recurring completed tasks DO stay visible (fetched via `status=all` on the tasks endpoint). This inconsistency is confusing.

### Bug 3: Timezone bug in instance materialization

**Where:** `app/services/recurrence_service.py` line ~175

```python
datetime.combine(occ_date, default_time, tzinfo=UTC)
```

If a user in `America/New_York` schedules a task at 9:00 AM, the instance stores `9:00 UTC`. The frontend interprets this as local time, displaying it at the wrong hour. The user's timezone (available as `self.timezone` in RecurrenceService) is not used.

### Bug 4: Scheduled Section has dead recurring task code

**Where:** `frontend/src/components/task/scheduled-section.tsx` lines ~27-113

The component has elaborate logic to fetch instances, map them to tasks, and handle overdue recurring instances. But since `categorizeTasks()` strips recurring tasks before they reach this component, none of this code ever executes. It's dead weight that creates confusion about the design intent.

### Bug 5: `today_instance_completed` is unreliable in list responses

**Where:** `app/routers/tasks.py` `_task_to_response()`, `app/services/task_service.py` `get_tasks()`

`get_tasks()` doesn't eagerly load `Task.instances`. The response builder checks `hasattr(task, "instances")` which fails in async SQLAlchemy (MissingGreenlet), so `today_instance_completed` is always `None` for list responses. Only single-task `GET /tasks/{id}` populates it correctly.

### Bug 6: Instances without time default to 9 AM on calendar

**Where:** `frontend/src/lib/calendar-utils.ts` line ~468

```typescript
const startHour = inst.scheduled_datetime
  ? new Date(inst.scheduled_datetime).getHours() + new Date(inst.scheduled_datetime).getMinutes() / 60
  : 9; // Default to 9 AM
```

Recurring tasks without a scheduled_time are placed at 9 AM on the calendar instead of appearing in the "anytime" row. Non-recurring date-only tasks correctly go to "anytime." This is inconsistent.

### Bug 7: Anytime section excludes recurring instances entirely

**Where:** `frontend/src/components/calendar/calendar-panel.tsx` lines ~119-125

Anytime tasks filter: `!t.is_recurring`. Instances are processed separately through `calculateExtendedOverlaps` and always placed on the time grid (defaulting to 9 AM per Bug 6). There's no path for a time-less recurring instance to appear in "anytime."

### Bug 8: `rollback()` in materialization breaks the session

**Where:** `app/services/recurrence_service.py` lines ~179-186

```python
except IntegrityError:
    await self.db.rollback()  # Rolls back ENTIRE transaction, not just this insert
    continue
```

This should use a savepoint (`begin_nested()`) instead of a full rollback, which destroys all previously created instances in the same call.

### Bug 9: Stale instances survive regeneration

**Where:** `app/services/recurrence_service.py` `regenerate_instances()` line ~196

```python
# Only deletes: future + pending
TaskInstance.instance_date >= get_user_today(self.timezone),
TaskInstance.status == "pending",
```

Completed/skipped instances from old schedules remain even if the new recurrence rule doesn't include those dates. Pending past instances also survive (e.g., instance for Feb 20 that's still pending when regeneration runs on Feb 23).

### Bug 10: Double flash on task creation

**User report:** "I created a recurring task, set time to 3 AM. Two events appeared in the calendar — one at a default time, then the correct one at 3 AM. After 10 seconds and a refresh, only one remained."

**Root cause (likely):** The `POST /tasks` response triggers an optimistic cache update (or invalidation) showing the parent task on the calendar. Then `materialize_instances()` runs, and when those instances load, the instance also appears → brief duplicate. The parent task has `scheduled_date + scheduled_time` set, and until the `!is_recurring` filter kicks in on refetch, both render.

This is a race between:
1. Task creation response → parent task appears in `allStatusTasks` cache
2. Instance materialization → instance appears in `instances` cache
3. Frontend filter `!is_recurring` eventually hides the parent — but not instantly

---

## Desired Behavior (The Spec)

### Principle: A recurring task's parent is a template. Only instances are "real."

The parent task defines WHAT repeats and HOW. Instances define WHEN. The parent should never appear on the calendar or in task lists — it's metadata, not an actionable item.

### Task Panel (Left Side)

1. **Recurring tasks MUST appear in the Scheduled section** — not as the parent, but represented by their next pending instance. Show: task title, next instance date, recurrence icon, recurrence summary (e.g., "Every 4 days").

2. **Overdue recurring instances** (pending instances with `instance_date < today`) should appear with an overdue indicator, just like non-recurring overdue tasks.

3. **Completing from the task panel** should complete the nearest pending instance (today's if it exists, otherwise the earliest pending one). After completion, the next instance becomes the "active" one shown in the Scheduled section.

4. **Skipping** should be available from the task panel context menu.

5. **Recurring tasks should NOT appear in the Pending (unscheduled) section** — they are always scheduled by definition.

### Calendar (Right Side)

6. **Only instances render on the calendar, never the parent task.** The `!is_recurring` filter on tasks is correct — keep it.

7. **Completed instances should remain visible on the calendar** (with completed styling, same as non-recurring completed tasks). Pass `status=null` (or `"all"`) when fetching instances for the calendar.

8. **Skipped instances should NOT appear on the calendar** (same as current behavior).

9. **Instances without a time** (`scheduled_datetime` is null) should appear in the **Anytime** row, not at a hardcoded 9 AM.

10. **Drag-to-reschedule** on the calendar should update that single instance's `scheduled_datetime`, not the parent. (This already works via `PUT /instances/{id}/schedule`.)

11. **No duplicate flash on creation.** After creating a recurring task, only instances should appear. The parent task should never briefly render on the calendar.

### Task Editor

12. **Editing the parent resets the series.** Changing `recurrence_rule`, `scheduled_time`, `recurrence_start`, or `recurrence_end` regenerates all future pending instances. This is the current behavior and it's correct.

13. **Changing `scheduled_date` should sync `recurrence_start`** and trigger regeneration. (Fixed in v0.54.35, verify it works.)

### Instance Materialization (Backend)

14. **Fix the timezone bug.** When creating `scheduled_datetime`, convert the user's `scheduled_time` (which is in their local timezone) to UTC properly:
    ```python
    local_dt = datetime.combine(occ_date, default_time)
    user_tz = ZoneInfo(self.timezone)
    aware_dt = local_dt.replace(tzinfo=user_tz)
    utc_dt = aware_dt.astimezone(UTC)
    ```

15. **Fix the rollback bug.** Use `begin_nested()` (savepoint) instead of full `rollback()` when catching IntegrityError during materialization.

16. **Regeneration should also delete pending PAST instances** from the old schedule, not just future ones. When a user changes the recurrence rule, stale pending instances from the past should be cleaned up (but completed/skipped should stay as history).

17. **`today_instance_completed` should work in list responses.** Either eagerly load instances in `get_tasks()`, or compute it with a separate efficient query (e.g., `EXISTS` subquery).

### Data Integrity

18. **The parent task's `scheduled_date` / `scheduled_time` are metadata only.** They should never directly cause the parent to appear in calendar queries or task list scheduled sections. Only instances should be query targets for display.

19. **When disabling recurrence** (`is_recurring` set to false): delete all instances and let the task behave like a normal task. The `scheduled_date` stays so it still appears in the Scheduled section. (This already works.)

---

## Files to Modify

### Backend
- `app/services/recurrence_service.py` — timezone fix (Bug 3), savepoint fix (Bug 8), past-instance cleanup in regeneration (Bug 9)
- `app/services/task_service.py` — eager-load instances in `get_tasks()` or add subquery for `today_instance_completed` (Bug 5)
- `app/routers/tasks.py` — verify `_task_to_response()` correctly populates `today_instance_completed`
- `app/routers/instances.py` — no changes needed, but verify `status` parameter works with `null`/`"all"`

### Frontend
- `frontend/src/lib/task-utils.ts` — `categorizeTasks()` needs to handle recurring tasks: put them in `scheduled` bucket represented by their next instance (Bug 1)
- `frontend/src/components/task/scheduled-section.tsx` — revive or rewrite the recurring task display logic (Bug 4). Show recurring tasks with their next instance date + recurrence info
- `frontend/src/components/calendar/calendar-panel.tsx` — fetch instances with `status=null` or `"all"` so completed ones stay visible (Bug 2). Handle time-less instances in anytime section (Bug 7)
- `frontend/src/lib/calendar-utils.ts` — remove 9 AM default for instances without time; instead flag them for anytime display (Bug 6)
- `frontend/src/components/calendar/day-column.tsx` — handle anytime recurring instances

### Tests
- Add a test for `regenerate_instances` that verifies past pending instances are cleaned up
- Add a test for timezone-aware `scheduled_datetime` creation
- Add a test for `today_instance_completed` in list responses

---

## Constraints

- **Don't break non-recurring tasks.** They should continue to work exactly as they do now.
- **Don't add per-instance editing.** All edits go through the parent task. This is a design choice, not a bug.
- **Keep the materialization approach.** The parent+instance model is sound; the bugs are in the implementation details and the frontend integration, not the architecture.
- **Run `cd frontend && npx tsc --noEmit && npx biome check . && npm run build` and `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test` before committing.**
- **Only write tests that run in CI automatically** — no E2E/Playwright tests.
