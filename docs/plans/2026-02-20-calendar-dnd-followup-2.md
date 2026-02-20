---
version:
pr:
created: 2026-02-20
---

# Calendar DnD Followup Round 2

## Context

After v0.53.2 merged (PR #377), the user identified 5 more issues with the calendar
drag-and-drop system: toast messages need dates/times and task names, recurring tasks
need a "Skip" option in the task list, overdue tasks should be droppable onto date
group headers, and time slot drops are still inaccurate.

## Changes

### 1. Toast messages include date/time instead of "for anytime"

**File:** `frontend/src/lib/task-utils.ts`
- Add `formatScheduleTarget(dateStr, timeStr?)` utility
- Returns "Today", "Tomorrow at 2:30 PM", "Feb 25 at 10:00 AM", etc.
- Reuses existing `formatDate()` for the date part

**File:** `frontend/src/components/task/task-dnd-context.tsx`
- Anytime drop: `Scheduled "${name}" for ${formatScheduleTarget(date)}` (e.g., "for Today")
- Calendar drop: `Scheduled "${name}" for ${formatScheduleTarget(date, time)}`
- Reschedule: `Rescheduled "${name}" to ${formatScheduleTarget(date, time)}`

### 2. "Skip this one" in task list RMB menu for overdue recurring tasks

**File:** `frontend/src/components/task/scheduled-section.tsx`
- Fetch instances for overdue date range (single query, not N+1)
- Build `pendingInstanceMap: Map<taskId, InstanceResponse>` for overdue pending instances
- Pass `pendingInstance` prop to `TaskItem` in overdue groups

**File:** `frontend/src/components/task/task-item.tsx`
- Accept optional `pendingInstance?: InstanceResponse` prop
- Add `handleMenuSkip` with optimistic update + toast
- Add "Skip this one" item (with `SkipForward` icon) to context menu and dropdown, after Complete

### 3. Drag overdue tasks to date group headers to reschedule

**File:** `frontend/src/components/task/scheduled-section.tsx`
- Extract `DateGroupHeader` component wrapping `useDroppable({ id: "date-group-{date}" })`
- Visual highlight on drag-over (`bg-primary/10 ring-1 ring-primary/30`)
- Replace plain `<div>` headers in both overdue and upcoming groups

**File:** `frontend/src/components/task/task-dnd-context.tsx`
- Add `"date-group"` to `DragState.overType` union
- Add `date-group-` recognition in `customCollisionDetection` (priority: after anytime, before calendar)
- Add `date-group-` branch in `handleDragEnd`: schedule date-only (same as anytime but uses `formatScheduleTarget`)

### 4. Audit all toasts for task names

Files and specific changes:
- **task-dnd-context.tsx**: reparent toast → `Moved "${name}" as subtask of "${parent}"`
- **task-item.tsx**: complete/reopen → `Completed "${name}"` / `Reopened "${name}"`
- **scheduled-task-card.tsx**: complete/reopen → include `title` prop
- **day-column.tsx** InstanceCard: → `Completed instance of "${task_title}"` / `Skipped instance of "${task_title}"`
- **task-action-sheet.tsx**: complete/reopen + skip → include `task.title`
- **domain-group.tsx**: swipe complete → include task title
- **task-editor.tsx**: complete/reopen → include task title
- **dashboard.tsx**: keyboard toggle → resolve task name from `stateRef`

### 5. Fix calendar time slot drop accuracy

**Root cause hypothesis:** `activatorEvent.clientY + delta.y` may drift from actual pointer position during drag (e.g., if auto-scroll adjusts the container but dnd-kit's delta doesn't fully account for it).

**File:** `frontend/src/components/task/task-dnd-context.tsx`
- Add `lastPointerRef` tracking via `pointermove` event listener on document
- In calendar drop handler, use `lastPointerRef.current.y` instead of `clientY + delta.y`
- This gives the real pointer viewport position at drop time, bypassing any delta drift

## Implementation Order

1. Add `formatScheduleTarget` utility (Change 1)
2. Update DnD toast messages (Changes 1 + 4 toast audit)
3. Add date-group droppables in scheduled-section (Change 3)
4. Add date-group drop handler in task-dnd-context (Change 3)
5. Add skip menu item (Change 2)
6. Fix pointer tracking for time slot drops (Change 5)
7. Run checks: `tsc`, `biome check`, `npm run build`

## Verification

- Drag task to anytime zone → toast shows "Scheduled 'X' for Today"
- Drag task to calendar 2:30 PM → toast shows "Scheduled 'X' for Today at 2:30 PM"
- Right-click overdue recurring task → "Skip this one" appears and works
- Drag overdue task to "Tomorrow" header → task rescheduled with toast
- Complete a task → toast shows "Completed 'TaskName'"
- Drag to calendar time slot → correct time assigned (matches phantom preview)
