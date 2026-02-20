---
version: v0.53.1
pr: 375
created: 2026-02-20
---

# Calendar Drag-and-Drop & Context Menus — Handoff

## Context

PR #375 (v0.53.0) was merged adding context menus on calendar cards, anytime drop zone, draggable anytime pills, and reschedule undo. However, the user found **6 critical bugs** during testing that need to be fixed in a follow-up PR.

---

## What Was Completed (PR #375)

1. **Context menus** on `ScheduledTaskCard` (Unschedule, Complete/Reopen, Edit, Delete) and `InstanceCard` (Skip, Complete, Edit series) using Radix ContextMenu
2. **Anytime drop zone** — `AnytimeSection` component in `calendar-panel.tsx` with `useDroppable` ID `anytime-drop-{dateStr}`
3. **Draggable anytime pills** — new `anytime-task-pill.tsx` with `useDraggable` ID `anytime-task-{taskId}`
4. **Reschedule undo** — differentiated "Task rescheduled" toast with Undo when dragging calendar cards
5. **Collision detection hardening** — priority: `anytime-drop-` → `calendar-` → `task-list-` → other, with rect-intersection fallback

---

## Bugs Found During Testing (6 issues)

### Bug 1: No undo on "Task scheduled" toast
- **Severity:** Critical
- **Where:** `task-dnd-context.tsx` — calendar drop handler (~line 297)
- **Problem:** When dragging a task from the task list to a calendar time slot, the toast says "Task scheduled" but has no Undo action. Only reschedule (re-dropping an already scheduled task) shows undo.
- **Fix:** Add undo action to the initial schedule toast too, capturing `prevDate=null, prevTime=null` as the undo state. Also ensure rapid successive operations don't break undo — each undo closure must capture the correct previous state at the moment of the drag, not a stale reference.

### Bug 2: Carousel scrolls wildly when starting to drag from task list
- **Severity:** Critical
- **Where:** `calendar-panel.tsx` and `use-carousel.ts`
- **Problem:** When the user starts dragging a task from the task list, the calendar carousel starts auto-scrolling at enormous speed, jumping to different days. The carousel's `isDndDragging` flag is set on `onDragStart`, but the carousel scroll-snap may have already been triggered by the pointer movement before dnd-kit's drag activation (8px distance threshold). The carousel's pointer-drag handler fires first, interpreting the horizontal component of the drag as a carousel swipe.
- **Root cause:** The carousel's `pointerdown` → `pointermove` → scroll handler runs before dnd-kit activates (requires 8px movement). During those first 8px, the carousel interprets motion as a carousel drag.
- **Fix:** Either (a) disable carousel pointer-drag entirely when pointer starts over the task list area, or (b) add a guard that checks if a dnd-kit drag is about to activate before carousel starts scrolling.

### Bug 3: Drop zones are too selective / hard to hit
- **Severity:** Critical
- **Where:** `day-column.tsx` — droppable zone setup (lines 77-88) + collision detection
- **Problem:** When dragging a task to the calendar, it's very hard to find a valid drop zone. The three stacked droppable zones (prev/current/next day sections) use `pointerWithin` collision detection, which requires the pointer to be precisely inside the zone rect. Since the zones are invisible `div`s positioned absolutely within a scroll container, their viewport rects shift as the user scrolls, causing unreliable detection.
- **Fix:** Consider using a single full-column droppable zone instead of 3 stacked ones, and compute which date section (prev/current/next) from the pointer Y offset and section boundaries.

### Bug 4: Calendar breaks after drag — stuck between two days
- **Severity:** High
- **Where:** `calendar-panel.tsx` carousel recentering + `use-carousel.ts`
- **Problem:** After a drag operation, the carousel gets stuck between two panels (scroll-snap doesn't re-center). The carousel's `scrollToCenter()` is called in a `useLayoutEffect` on `calendarCenterDate` change, but if the date didn't change (drag to same day), it doesn't recenter. The carousel may have been scrolled off-center during the drag.
- **Fix:** Call `carousel.scrollToCenter()` when `isDndDragging` transitions from `true` to `false` (i.e., on drag end), regardless of whether the date changed.

### Bug 5: Can only drag task by clicking task title area
- **Severity:** Medium
- **Where:** `task-item.tsx` lines 315-320
- **Problem:** The drag handle is an `absolute inset-0` div with `{...attributes} {...listeners}`, but interactive elements on top (checkbox, title button, kebab menu) have `relative z-10` which blocks the drag overlay underneath. The user expects to be able to grab anywhere on the task row header (not just the narrow gaps between interactive elements).
- **Fix:** The drag listeners should be on the outer wrapper, not a background overlay. Alternatively, make the drag handle area larger or use a dedicated drag handle icon. The current approach of putting a z-0 overlay behind z-10 interactive elements means the drag handle only works in the tiny gaps between those elements.

### Bug 6: Right-click context menu not working on calendar cards
- **Severity:** High
- **Where:** `scheduled-task-card.tsx` and `day-column.tsx` InstanceCard
- **Problem:** Despite implementing Radix ContextMenu, right-click doesn't show the menu. The card element has dnd-kit `{...listeners} {...attributes}` which attach `onPointerDown` handlers. These may be interfering with Radix ContextMenuTrigger's event handling. The `asChild` pattern merges both sets of event handlers, but dnd-kit's pointer sensor may be capturing and preventing the contextmenu event.
- **Fix:** Investigate the interaction between dnd-kit's PointerSensor listeners and Radix ContextMenuTrigger. May need to split: use the outer ContextMenuTrigger div for right-click, and an inner drag-handle element for dnd-kit listeners (separate the two interaction surfaces).

---

## Key Files

| File | Role |
|------|------|
| `frontend/src/components/task/task-dnd-context.tsx` | Central DnD orchestration — collision detection, all drop handlers, ID parsing |
| `frontend/src/components/calendar/calendar-panel.tsx` | Calendar layout, carousel, anytime section droppable |
| `frontend/src/components/calendar/day-column.tsx` | Day column with 3 stacked droppable zones, phantom card, InstanceCard |
| `frontend/src/components/calendar/scheduled-task-card.tsx` | Draggable scheduled task card with ContextMenu |
| `frontend/src/components/calendar/anytime-task-pill.tsx` | Draggable anytime task pill |
| `frontend/src/components/task/task-item.tsx` | Task list item with drag handle overlay |
| `frontend/src/hooks/use-carousel.ts` | Scroll-snap carousel hook (conflicts with drag) |
| `frontend/src/lib/calendar-utils.ts` | Time calculations, overlap detection, `offsetToTime()` |
| `frontend/src/stores/ui-store.ts` | Zustand store with `calendarHourHeight`, `calendarCenterDate` |

## Drag/Drop ID Scheme

| Source | ID Format | Type |
|--------|-----------|------|
| Task list items | `String(task.id)` e.g. `"123"` | `"task"` |
| Anytime pills | `anytime-task-{id}` e.g. `"anytime-task-123"` | `"anytime-task"` |
| Scheduled task cards | `String(taskId)` e.g. `"123"` | `"scheduled-task"` |
| Anytime drop zone | `anytime-drop-{dateStr}` | droppable |
| Calendar zones (3 per column) | `calendar-{panelId}-{dateStr}` | droppable |
| Task list zone | `task-list-{sectionId}` | droppable (referenced but may not exist) |

## Collision Detection Priority (task-dnd-context.tsx)

1. `pointerWithin`: `anytime-drop-` → `calendar-` → `task-list-` → other
2. `rectIntersection`: `calendar-` priority
3. `closestCenter`: last resort

## API Endpoints (all exist, no backend changes needed)

- `PUT /api/v1/tasks/{id}` — schedule/reschedule/unschedule (`scheduled_date`, `scheduled_time`)
- `DELETE /api/v1/tasks/{id}` — delete task
- `POST /api/v1/tasks/{id}/toggle-complete` — complete/reopen
- `POST /api/v1/tasks/{id}/restore` — restore deleted task
- `POST /api/v1/instances/{id}/skip` — skip recurring instance
- `POST /api/v1/instances/{id}/toggle-complete` — complete recurring instance

## Sensors Config

```
PointerSensor: { distance: 8 }        // 8px threshold for mouse
TouchSensor: { delay: 250, tolerance: 5 }  // 250ms for touch
```
