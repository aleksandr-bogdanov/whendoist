---
version: v0.55.97, v0.55.98
pr: 590, 591
created: 2026-03-02
---

# Multi-Select Completion — Implementation Plan

> Closes all remaining gaps from the [design plan](2026-03-02-multi-select-batch-operations.md).
> Two PRs: instance support + polish, then advanced selection methods.

---

## PR 1: Instance support, polish & command palette

**Scope:** Make the existing multi-select feature complete — instances work everywhere,
visual polish, command palette expansion. No new interaction patterns.

### 1a. Instance support in FAB & batch operations

**Problem:** `floating-action-bar.tsx` line 33 skips instance IDs with a "deferred"
comment. `batch-mutations.ts` only accepts `TaskResponse[]`.

**Changes:**

- **`selection-store.ts`** — Add `selectedTasks()` and `selectedInstances()` computed
  helpers that resolve IDs from TanStack Query cache (tasks from `dashboardTasksKey()`,
  instances from the instance list query key).

- **`batch-mutations.ts`** — Add instance-specific batch operations:
  - `batchToggleCompleteInstances(queryClient, instances, completing)` — calls
    `completeInstance` / `uncompleteInstance` per item
  - `batchDeleteInstances()` — not applicable (instances can't be deleted, only skipped)
  - `batchSkipInstances(queryClient, instances)` — calls `skipInstance` per item
  - `batchUnscheduleInstances(queryClient, instances)` — calls `scheduleInstance`
    with null datetime

- **`floating-action-bar.tsx`** — Resolve both tasks and instances from `selectedIds`.
  Wire handlers to dispatch to the correct batch function based on item type.
  - Complete button: `batchToggleComplete()` for tasks + `batchToggleCompleteInstances()` for instances
  - Unschedule button: same split
  - Delete button: tasks only (instances show "Skip" instead when all selected are instances)
  - Add "Skip" button: visible when selection contains instances

- **`batch-context-menu.tsx`** — Same dispatch logic. "Skip N instances" item when
  instances are in the selection. Counts show "N items" when mixed.

- **`batch-edit-popover.tsx`** — Instances don't support impact/clarity/duration/domain
  edits (those are on the parent task). When selection is instances-only, show a message
  "Instance fields are inherited from the parent task — edit the series instead."
  When mixed, apply edits to tasks only and note "Applied to N tasks (M instances skipped)."

### 1b. Batch drag overlay for instances

**Problem:** When an instance is the batch drag anchor, the overlay may not render
the `BatchDragOverlay` component.

**Changes:**

- **`task-dnd-context.tsx`** — In the `DragOverlay` render, check `isBatchDrag` for
  both `activeTask` AND `activeInstance` paths. Render `BatchDragOverlay` in both cases,
  with the anchor label coming from the instance's parent task title.

### 1c. ⌘+A feedback

**Changes:**

- **`dashboard.tsx`** (keyboard handler for ⌘+A) — After `selectAll()`, show a brief
  non-interactive toast: `toast("Selected {count} tasks", { duration: 2000 })`.
  Use `TOAST_DURATION_SHORT` or a 2-second explicit duration (this is a notification,
  not an undo action).

### 1d. Batch edit "mixed values" indicator

**Problem:** All fields start as "—" (unset). When selected tasks have different values
for a field, "—" is ambiguous — does it mean "no value" or "values differ"?

**Changes:**

- **`batch-edit-popover.tsx`** — On mount / selection change, compute the intersection
  of values for each field across selected tasks:
  - If all tasks share the same value → pre-fill the field with that value
  - If tasks have different values → show placeholder "Mixed" (distinct from "—")
  - If all tasks have no value → show "—" (unset)

  The "Mixed" state still means "no change" — user must explicitly pick a value to apply it.

### 1e. Popover viewport awareness

**Changes:**

- **`floating-action-bar.tsx`** — Change the `PopoverContent` from `side="top"` to
  `side="top" avoidCollisions sideOffset={8}`. Radix Popover supports `avoidCollisions`
  natively — it will flip to bottom if there's not enough space above. This is a
  one-line change.

### 1f. Command palette batch expansion

**Current state:** `palette-batch-actions.tsx` already has: Complete, Today, Tomorrow,
Move domain, Delete.

**Changes:**

- **`palette-batch-actions.tsx`** — Add:
  - **Unschedule** — `batchUnschedule()` for selected tasks
  - **Reschedule to date…** — Opens a date picker dialog (reuse the calendar component
    from `batch-context-menu.tsx`'s reschedule submenu)
  - **Edit…** — Programmatically trigger the batch edit popover (dispatch the same
    custom event used by the context menu's "Edit…" item)
  - **Skip** (conditional) — Only when selection contains instances

---

## PR 2: Shift+Click range selection & calendar lasso

**Scope:** Two new selection methods — both are additive to the existing ⌘+Click model.

### 2a. Shift+Click range selection

**Concept:** Click item A, then Shift+Click item B → selects A, B, and everything
between them. Standard desktop convention (Finder, Excel, Gmail).

**Requires tracking "last clicked" item** to compute the range.

**Changes:**

- **`selection-store.ts`** — Add:
  - `lastClickedId: string | null` — updated on every `toggle()` call
  - `selectRange(fromId, toId, orderedIds)` — selects all IDs between from/to
    in the provided ordering

- **Calendar (scheduled-task-card, anytime-task-pill, anytime-instance-pill):**
  - On `Shift+Click`: get the ordered list of item IDs visible in the current day column
    (from the data already passed to `day-column.tsx`), call `selectRange(lastClickedId, thisId, orderedIds)`
  - Ordering: by scheduled time (top to bottom), then anytime section order

- **Task list (task-item.tsx):**
  - On `Shift+Click`: get the ordered list of visible task IDs from the flattened
    task list (respecting current sort/filter/grouping), call `selectRange()`
  - The ordering comes from the `groups` prop passed through `TaskList` → `DomainGroup` → `TaskItem`

- **Cross-view range:** Shift+Click does NOT work across calendar and task list.
  Range is computed within the view where the click happens. If `lastClickedId`
  is from a different view, treat Shift+Click as a regular ⌘+Click (toggle only).

**Keyboard modifier priority:**
| Modifier | Behavior |
|----------|----------|
| ⌘+Click | Toggle single item |
| Shift+Click | Range select (from last clicked to this) |
| ⌘+Shift+Click | Add range to existing selection (don't clear) |

### 2b. Calendar lasso / drag-select

**Concept:** Click+drag on empty calendar space to draw a selection rectangle.
All tasks whose cards intersect the rectangle get selected.

**This is the most complex addition.** It requires:
1. Detecting mousedown on empty space (not on a task card)
2. Tracking mouse movement to draw a rectangle
3. Hit-testing the rectangle against positioned task cards
4. Adding intersecting tasks to the selection

**Changes:**

- **New component: `frontend/src/components/calendar/lasso-selection.tsx`**

  A transparent overlay rendered inside `day-column.tsx` that:
  - Activates on mousedown on the column background (not on a card/event)
  - Tracks mousemove to draw a semi-transparent selection rectangle
  - On mouseup, queries all task card DOM elements within the column using
    `getBoundingClientRect()`, checks intersection with the lasso rect
  - Adds intersecting items to `selectionStore`
  - Supports ⌘+lasso to add to existing selection (without ⌘, clears first)

- **`day-column.tsx`** — Render `<LassoSelection>` as a child of the time grid area.
  Pass down the column's date and the list of task/instance IDs rendered in this column
  (for mapping DOM elements back to selection IDs).

- **Visual treatment:**
  - Rectangle: `border border-primary bg-primary/10` with dashed border
  - Items inside the rectangle get the selection highlight in real-time (as you drag)
  - Cursor changes to `crosshair` when hovering empty space

- **Conflict avoidance:**
  - Lasso only activates on empty space — clicking on a task card still triggers
    the existing click/drag behavior
  - Lasso is disabled during Plan My Day mode
  - Lasso is disabled during an active dnd-kit drag

- **Cross-column lasso:**
  - For v1: lasso works within a single day column only
  - The rectangle doesn't span across days (carousel scroll makes this complex)
  - Future: could extend to multi-column lasso

---

## File impact summary

### PR 1 (8–10 files)
```
stores/selection-store.ts          — selectedTasks/Instances helpers
lib/batch-mutations.ts             — instance batch operations
components/batch/floating-action-bar.tsx — instance dispatch, ⌘+A toast
components/batch/batch-edit-popover.tsx  — mixed values, instance message
components/batch/batch-context-menu.tsx  — instance-aware menu items
components/task/task-dnd-context.tsx     — instance batch drag overlay
components/search/palette-batch-actions.tsx — new commands
routes/_authenticated/dashboard.tsx — ⌘+A toast
```

### PR 2 (6–8 files)
```
stores/selection-store.ts          — lastClickedId, selectRange()
components/calendar/lasso-selection.tsx  — NEW: lasso overlay component
components/calendar/day-column.tsx      — render lasso, pass item IDs
components/calendar/scheduled-task-card.tsx — Shift+Click handler
components/calendar/anytime-task-pill.tsx   — Shift+Click handler
components/calendar/anytime-instance-pill.tsx — Shift+Click handler
components/task/task-item.tsx              — Shift+Click handler
```
