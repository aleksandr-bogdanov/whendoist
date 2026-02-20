---
version: v0.53.0
pr:
created: 2026-02-20
---

# Calendar Drag-and-Drop & Context Menus Upgrade

## Context

The legacy Jinja2/JS calendar had rich interactions: right-click context menus on all calendar cards (Unschedule, Complete, Edit, Delete for tasks; Skip, Complete, Edit Series for recurring instances), full drag-and-drop between task list, time slots, and anytime section, plus reliable in-calendar rescheduling. The React rewrite currently has:
- Minimal inline Done/Unsched buttons (toggle on click/right-click) instead of proper context menus
- No drag-to-anytime or drag-from-anytime
- Unreliable in-calendar rescheduling (collision detection gaps)

This plan brings the React calendar to feature parity with the legacy implementation. No backend changes needed — all API endpoints exist.

---

## Phase 1: Context Menus on Calendar Cards

Replace inline action toggles with proper Radix ContextMenu (same pattern as `task-item.tsx`). Left-click opens task editor; right-click opens context menu.

### 1a. `scheduled-task-card.tsx`

- Remove `showActions` state and inline Done/Unsched buttons
- Remove `onContextMenu` handler (Radix handles natively)
- Wrap card in `<ContextMenu>` / `<ContextMenuTrigger asChild>` / `<ContextMenuContent>`
- Simplify `onClick` — always calls `onClick?.()` (opens editor)
- Add `onEdit` prop (for Edit menu item — same as onClick)
- Add `handleDelete` (copy pattern from task-item.tsx: `useDeleteTaskApiV1TasksTaskIdDelete` + restore undo toast)
- Menu items: **Unschedule** | **Complete/Reopen** | **Edit** | separator | **Delete** (destructive)

### 1b. `InstanceCard` (in `day-column.tsx`)

- Remove `showActions` state and inline Done/Skip buttons
- Add `onTaskClick` prop (for left-click → opens parent task in editor)
- Add `onEditSeries` callback (for Edit Series menu item → looks up parent task by `instance.task_id`)
- Wrap in `<ContextMenu>` pattern
- Menu items: **Skip** (disabled if not pending) | **Complete** (disabled if not pending) | **Edit series**
- No Delete/Unschedule — instances are auto-generated from recurrence rules

### 1c. `day-column.tsx` prop threading

- Pass `onTaskClick` through to InstanceCard
- For InstanceCard's `onEditSeries`: look up parent task via `taskMap.get(String(instance.task_id))` and call `onTaskClick`
- Pass `onEdit` (same as `onClick`) to ScheduledTaskCard

**Files:** `scheduled-task-card.tsx`, `day-column.tsx`

---

## Phase 2: Anytime Drop Zone

Make the anytime section a dnd-kit droppable so tasks can be dragged there to schedule date-only.

### 2a. `calendar-panel.tsx`

- Add `useDroppable({ id: \`anytime-${displayDate}\`, data: { type: "anytime", dateStr: displayDate } })`
- Apply `setNodeRef` to the anytime wrapper div
- Add visual feedback: `isAnytimeOver && "bg-primary/10 border-primary/40"`

### 2b. `task-dnd-context.tsx` — new drop handler

Add handler BEFORE the `calendar-` check in `handleDragEnd`:

```
if (overId.startsWith("anytime-")) {
  PUT /api/v1/tasks/{id} with { scheduled_date: dateStr, scheduled_time: null }
  Toast "Scheduled for anytime" with undo (restores previous date+time)
}
```

### 2c. Collision detection update

In `customCollisionDetection`, add `anytime-` priority after checking `calendar-` hits:
```
const anytimeHit = pointerCollisions.find(c => String(c.id).startsWith("anytime-"));
if (anytimeHit) return [anytimeHit];
```

### 2d. DragState type update

Add `"anytime"` to `overType` union in DragState and `getOverType`.

**Files:** `calendar-panel.tsx`, `task-dnd-context.tsx`

---

## Phase 3: Draggable Anytime Tasks

Make anytime task pills draggable. Can drag to: calendar grid (schedule with time), task list (unschedule), or different day's anytime section.

### 3a. New component: `anytime-task-pill.tsx`

Extract from inline button in calendar-panel.tsx. Key detail: draggable ID = `anytime-task-${task.id}` (namespaced to avoid collision with task-item's `String(task.id)` and scheduled-task-card's `String(taskId)`).

```tsx
const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
  id: `anytime-task-${task.id}`,
  data: { type: "anytime-task", taskId: task.id },
});
```

### 3b. `calendar-panel.tsx` — swap in component

Replace inline `<button>` with `<AnytimeTaskPill>`. Also pass the full `tasks` array (not just `scheduledTasks`) to DayColumn via a new `allTasks` prop so the phantom card can resolve anytime task duration/title.

### 3c. `task-dnd-context.tsx` — handle `anytime-task-*` IDs

Update `findTask` and `handleDragEnd` ID parsing:
```
const activeIdStr = String(active.id);
let activeId: number;
if (activeIdStr.startsWith("anytime-task-")) {
  activeId = parseInt(activeIdStr.replace("anytime-task-", ""), 10);
} else {
  activeId = parseInt(activeIdStr, 10);
}
```

All existing drop handlers (calendar, anytime, task-list) work unchanged — they all use the parsed numeric `activeId`.

### 3d. `day-column.tsx` — phantom card for anytime drags

The phantom card preview looks up the dragged task by ID from the `tasks` prop. Since DayColumn currently only receives `scheduledTasks`, the phantom card won't find anytime tasks. Fix: accept a broader `allTasks` prop (or union of scheduled + anytime) for the phantom lookup.

**Files:** new `anytime-task-pill.tsx`, `calendar-panel.tsx`, `task-dnd-context.tsx`, `day-column.tsx`

---

## Phase 4: Fix Calendar-to-Calendar Reschedule

Improve reliability of in-calendar rescheduling and add undo support.

### 4a. Collision detection hardening

Update `customCollisionDetection` to also check `rectIntersection` for calendar hits:
```tsx
const rectCollisions = rectIntersection(args);
if (rectCollisions.length > 0) {
  const calendarHit = rectCollisions.find(c => String(c.id).startsWith("calendar-"));
  if (calendarHit) return [calendarHit];
  return rectCollisions;
}
```

### 4b. Reschedule with undo in `handleDragEnd`

Detect reschedule via `active.data.current?.type === "scheduled-task"`:
- Capture previous `scheduled_date` + `scheduled_time` before mutation
- Skip no-op if same time + same date
- Toast "Task rescheduled" with undo action restoring previous schedule

### 4c. Calendar drag already works technically

The scheduled-task-card already has `useDraggable`. The drop zone detects it. The time calculation works. The main improvements are: (a) more robust collision detection fallback, (b) differentiated "rescheduled" toast with undo vs "scheduled" toast, (c) no-op detection to avoid unnecessary API calls.

**Files:** `task-dnd-context.tsx`

---

## Implementation Order

**Phase 1 → Phase 4 → Phase 2 → Phase 3**

- Phase 1 is zero-risk, highest user impact (proper context menus)
- Phase 4 is a focused fix in one file (collision + undo)
- Phases 2 + 3 are closely related (anytime = new drop zone + new draggable)

Each phase is independently shippable and testable.

---

## Verification

After each phase:
1. `cd frontend && npx tsc --noEmit && npx biome check .` — type + lint
2. `cd frontend && npm run build` — production build
3. Manual testing:
   - **Phase 1:** Right-click scheduled task card → see Unschedule/Complete/Edit/Delete. Right-click instance card → see Skip/Complete/Edit series. Left-click opens editor. All actions work.
   - **Phase 4:** Drag scheduled task to new time slot → rescheduled. Drag to different day → rescheduled with new date. "Task rescheduled" toast with undo.
   - **Phase 2:** Drag unscheduled task from task list to anytime section → scheduled date-only. Visual highlight on hover.
   - **Phase 3:** Drag anytime pill to calendar grid → scheduled with time. Drag anytime pill to task list → unscheduled. Phantom preview appears during drag.

Backend checks (no changes expected, but verify):
```bash
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
```

---

## Files Summary

| File | Phases | Role |
|------|--------|------|
| `frontend/src/components/calendar/scheduled-task-card.tsx` | 1 | Radix ContextMenu, delete handler |
| `frontend/src/components/calendar/day-column.tsx` | 1, 3 | InstanceCard context menu, allTasks prop for phantom |
| `frontend/src/components/calendar/calendar-panel.tsx` | 2, 3 | Anytime droppable, AnytimeTaskPill, pass allTasks |
| `frontend/src/components/calendar/anytime-task-pill.tsx` | 3 | **New** — draggable anytime task pill |
| `frontend/src/components/task/task-dnd-context.tsx` | 2, 3, 4 | Anytime handler, ID parsing, collision, reschedule undo |
