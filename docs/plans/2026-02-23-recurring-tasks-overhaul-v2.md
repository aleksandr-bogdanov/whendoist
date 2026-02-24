---
version:
pr:
created: 2026-02-23
---

# Recurring Tasks Overhaul

## Context

The recurring task system (parent task + materialized instances) is architecturally sound but has 6 active bugs making it unusable: recurring tasks are invisible in the task panel, completed instances vanish from the calendar, timezone handling is wrong, time-less instances appear at 9 AM instead of anytime, and stale instances survive regeneration.

4 of the 10 originally reported bugs are **already fixed** (Bug 4: ScheduledSection code just needs Bug 1 fix to revive it; Bug 5: instances already eagerly loaded; Bug 8: already uses savepoints; Bug 10: `!is_recurring` filters prevent double-flash).

## Plan

### Phase 1: Backend (3 changes in 2 files)

**1.1 Fix timezone bug (Bug 3)** — `app/services/recurrence_service.py`

Add `_to_utc_datetime(self, occ_date, local_time)` helper that converts user-local time to UTC via `ZoneInfo(self.timezone)`. Replace the broken `datetime.combine(occ_date, default_time, tzinfo=UTC)` at line 176 (`materialize_instances`) and line 499 (`get_or_create_instance_for_date`).

**1.2 Fix stale instances in regeneration (Bug 9)** — `app/services/recurrence_service.py`

- Change `regenerate_instances()` to delete ALL pending instances (remove `instance_date >= today` filter)
- Add `from_date` parameter to `materialize_instances()` so regeneration starts from today (prevents recreating past pending instances)

**1.3 Add "all" status to instances endpoint (Bug 2 backend)** — `app/routers/instances.py`

Handle `status == "all"` → pass `None` to service, matching the tasks endpoint pattern at `app/routers/tasks.py:359`.

### Phase 2: Frontend (4 files + 1 new component)

**2.1 categorizeTasks includes recurring tasks (Bug 1)** — `frontend/src/lib/task-utils.ts`

Line 242-243: Replace `if (task.is_recurring) continue;` with `scheduled.push(task); continue;`. This revives the existing ScheduledSection recurring task handling (instance fetching, pendingInstanceMap, overdue detection).

**2.2 Calendar fetches all statuses (Bug 2 frontend)** — `frontend/src/components/calendar/calendar-panel.tsx`

Line 97-100: Add `status: "all"` to the `useListInstancesApiV1InstancesGet` params. Completed instances now stay visible on calendar with existing opacity styling.

**2.3 Skip time-less instances from overlap calculation (Bug 6)** — `frontend/src/lib/calendar-utils.ts`

In `calculateOverlaps()` (line ~298) and `calculateExtendedOverlaps()` (line ~453): add `if (!inst.scheduled_datetime) continue;` to skip time-less instances. Remove the 9 AM fallback branches entirely.

**2.4 Show time-less instances in Anytime section (Bug 7)** — `frontend/src/components/calendar/calendar-panel.tsx`

- Add `anytimeInstances` memo filtering `safeInstances` for display date + no `scheduled_datetime` + not skipped
- Pass `anytimeInstances` and `allTasks` to `AnytimeSection`
- Render `AnytimeInstancePill` for each instance alongside existing `AnytimeTaskPill`

**2.5 Create AnytimeInstancePill** — NEW `frontend/src/components/calendar/anytime-instance-pill.tsx`

Pill component modeled after `AnytimeTaskPill` but simpler:
- Shows `↻ {task_title}` with impact color border
- Click → open task editor for parent (via `onTaskClick`)
- Context menu: Complete/Uncomplete, Skip/Unskip, Edit Series
- No draggable (instances are tied to their date)
- Completed/skipped instances: `opacity-50` + `line-through`
- Uses instance mutation hooks from `@/api/queries/instances/instances`

### Phase 3: Tests

**New file:** `tests/test_recurrence_service.py` (unit tests with SQLite fixture)

1. `test_timezone_aware_scheduled_datetime` — verify 9 AM ET → 14:00 UTC
2. `test_regenerate_deletes_past_pending` — verify past pending instances are cleaned up
3. `test_regenerate_preserves_completed` — verify completed instances survive regeneration

### Phase 4: Verification

```bash
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
cd frontend && npx tsc --noEmit && npx biome check . && npm run build
```

## Files Modified

| File | Changes |
|------|---------|
| `app/services/recurrence_service.py` | `_to_utc_datetime` helper, `from_date` param, regeneration fix |
| `app/routers/instances.py` | Handle `status="all"` |
| `frontend/src/lib/task-utils.ts` | Put recurring in `scheduled` bucket |
| `frontend/src/components/calendar/calendar-panel.tsx` | `status: "all"`, anytime instances |
| `frontend/src/lib/calendar-utils.ts` | Skip time-less instances, remove 9 AM fallback |
| `frontend/src/components/calendar/anytime-instance-pill.tsx` | NEW — anytime instance pill |
| `tests/test_recurrence_service.py` | NEW — timezone + regeneration tests |
