---
version:
pr:
created: 2026-03-03
---

# Fix batch actions for recurring tasks + add Reschedule to FAB

## Context

After the multi-select feature was built (v0.55.94–v0.56.4), several batch operations broke for recurring tasks:

1. **Batch Complete toggles parent task instead of instance** — When a recurring task is selected from the task list (`task-{id}`), `batchToggleComplete` calls `toggleTaskComplete` on the parent. The single-item handler correctly routes through `completeInstance` for the pending instance, but the batch handler doesn't.

2. **No optimistic updates for instance batch ops** — `executeInstanceBatch` fires mutations in background but doesn't update the cache, so there's no visual feedback until the API responds.

3. **Batch Unschedule breaks recurring tasks** — Calls `updateTask(taskId, { scheduled_date: null })` on recurring parents, but their schedule is intrinsic to recurrence. The single-item context menu correctly hides Unschedule for recurring tasks.

4. **Context menu shows single-item menu when multi-selection is active** — `isMultiSelected ? <BatchContextMenuItems /> : contextMenuItems` only checks if the RIGHT-CLICKED item is in the selection. Right-clicking a non-selected item while others are selected shows single-item menu (e.g., "Edit" opens normal edit instead of FAB edit).

5. **Reschedule missing from FAB** — Only available in the RMB context menu.

## Plan

### 1. Add optimistic updates to `executeInstanceBatch` (`batch-mutations.ts`)

Currently `executeInstanceBatch` has no `applyOptimistic` step. Add one:

- Before firing mutations, query all instance caches with `queryClient.getQueriesData` using the base instance key
- Save snapshots for undo
- Apply optimistic changes to all matching instance query caches via `queryClient.setQueriesData`
- On undo, restore all snapshots

**Interface change**: Add optional `applyOptimistic` callback param to `executeInstanceBatch`.

Update callers:
- `batchToggleCompleteInstances`: set `status: "completed"` / `"pending"` optimistically
- `batchSkipInstances`: set `status: "skipped"` optimistically
- `batchUnscheduleInstances`: set `scheduled_datetime: null` optimistically
- `batchRescheduleInstances`: set `scheduled_datetime` optimistically

### 2. Fix batch Complete handler for recurring tasks (`floating-action-bar.tsx`, `batch-context-menu.tsx`)

In `handleComplete`, after resolving `tasks` and `instances`:

1. Split `tasks` into `nonRecurringTasks` and `recurringTasks` (by `task.is_recurring`)
2. For `recurringTasks`, look up their pending instances from the instance cache (same approach as `scheduled-section.tsx`'s `pendingInstanceMap` — query `getListInstancesApiV1InstancesGetQueryKey()`, find earliest pending instance per `task_id`)
3. Route `nonRecurringTasks` → `batchToggleComplete`
4. Route found pending instances → `batchToggleCompleteInstances`
5. Any recurring tasks with no pending instance → skip silently

Create shared helper: `findPendingInstancesForTasks(queryClient, tasks)` → `InstanceResponse[]` in `batch-mutations.ts`

### 3. Fix batch Unschedule for recurring tasks (`floating-action-bar.tsx`, `batch-context-menu.tsx`)

In `handleUnschedule`:
- Filter recurring tasks OUT of the task targets (their schedule is part of recurrence)
- For recurring tasks, their instances can still be unscheduled — find scheduled instances in the selection's instances array and route through `batchUnscheduleInstances`

### 4. Add Reschedule to FAB (`floating-action-bar.tsx`)

Add a `Popover` with a `Calendar` date picker (same pattern as the batch edit popover):

- New state: `const [rescheduleOpen, setRescheduleOpen] = useState(false)`
- New handler: `handleReschedule(date)` — same logic as in `batch-context-menu.tsx`
- Place between Unschedule and Edit buttons
- Import `CalendarDays` icon and `Calendar` component
- Show only when `!allCompleted`

### 5. Fix context menu switching in task/calendar components

Change the condition from `isMultiSelected` to `hasAnySelection`:

```tsx
const hasAnySelection = useSelectionStore((s) => s.selectedIds.size > 0);
// ...
{(isMultiSelected || hasAnySelection) ? <BatchContextMenuItems /> : contextMenuItems}
```

This ensures the batch context menu shows whenever ANY items are selected, regardless of whether the right-clicked item is in the selection.

**Files to update:**
- `frontend/src/components/task/task-item.tsx` (line 968)
- `frontend/src/components/calendar/scheduled-task-card.tsx` (line 284)
- `frontend/src/components/calendar/anytime-task-pill.tsx` (line 213)
- `frontend/src/components/calendar/anytime-instance-pill.tsx` (line 195)
- `frontend/src/components/calendar/day-column.tsx` (line 777)

## Files to modify

| File | Changes |
|------|---------|
| `frontend/src/lib/batch-mutations.ts` | Optimistic updates for `executeInstanceBatch`; add `findPendingInstancesForTasks` helper |
| `frontend/src/components/batch/floating-action-bar.tsx` | Add Reschedule popover; fix Complete for recurring; fix Unschedule for recurring |
| `frontend/src/components/batch/batch-context-menu.tsx` | Fix Complete for recurring; fix Unschedule for recurring |
| `frontend/src/components/task/task-item.tsx` | Context menu: `hasAnySelection` check |
| `frontend/src/components/calendar/scheduled-task-card.tsx` | Context menu: `hasAnySelection` check |
| `frontend/src/components/calendar/anytime-task-pill.tsx` | Context menu: `hasAnySelection` check |
| `frontend/src/components/calendar/anytime-instance-pill.tsx` | Context menu: `hasAnySelection` check |
| `frontend/src/components/calendar/day-column.tsx` | Context menu: `hasAnySelection` check |

## Verification

1. **Batch Complete recurring**: Select a recurring task with pending instance → Complete via FAB → instance should complete (not parent), status highlights immediately
2. **Mass Complete via ⌘+A**: ⌘+A → Complete → all tasks and instances complete, instant visual feedback
3. **Undo**: Click Undo on the toast → all revert
4. **Batch Unschedule**: Mixed selection of recurring + non-recurring → only non-recurring get unscheduled
5. **Reschedule from FAB**: Select tasks → click Reschedule → calendar picker appears → pick date → all rescheduled
6. **Context menu Edit**: Select multiple tasks → right-click ANY task → batch menu shows → Edit opens FAB edit popover
7. **RMB Complete on calendar instances**: Right-click a calendar instance pill → Complete works
8. **TypeScript/Biome**: `cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check .`
