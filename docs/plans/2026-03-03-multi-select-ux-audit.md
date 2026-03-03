---
version: v0.56.12
pr: 620
created: 2026-03-03
---

# Multi-Select UX Audit — Findings

> Audit of the multi-select & batch operations feature (v0.55.90–v0.56.0).
> Focused on UX corner cases, interaction conflicts, and state consistency.
> See [design plan](2026-03-02-multi-select-batch-operations.md) and
> [completion plan](2026-03-02-multi-select-completion.md).

---

## Critical

### 1. Escape clears selection AND closes popover simultaneously

**Component:** `selection-store.ts` (global Escape listener)

The global `document.addEventListener("keydown")` in the selection store fires
on the same keystroke as Radix's internal Escape handler for popovers, dialogs,
and context menus. When the user presses Escape to dismiss the batch edit popover,
both fire: the popover closes AND the entire selection clears. The user loses
their selection when they only intended to close the popover.

Same collision exists with Plan My Day's Escape handler in `calendar-panel.tsx`.

**Fix:** Check whether any Radix overlay is open (e.g., `document.querySelector('[data-state="open"][data-radix-popper-content-wrapper]')`)
and skip the `clear()` if so. Alternatively, use `e.defaultPrevented` since
Radix calls `preventDefault()` on Escape for its overlays.

---

### 2. Mixed task+instance batch produces TWO separate toasts

**Component:** `floating-action-bar.tsx` (handleComplete, handleUnschedule)

When the selection contains both tasks and instances, `handleComplete` calls
`batchToggleComplete()` AND `batchToggleCompleteInstances()` as two independent
operations (via `Promise.all`). Each produces its own toast with its own Undo button.

The user sees two toasts and must click Undo on BOTH to fully revert the operation.
If they only undo one, the state is partially reverted.

**Fix:** Merge the two batch calls into a single composite operation that
produces one toast with one Undo button that reverses both task and instance
mutations. Alternatively, create a `batchToggleCompleteAll(queryClient, tasks, instances, completing)`
helper that handles both types internally and emits a single toast.

---

### 3. Command palette uses completely different code path

**Component:** `palette-batch-actions.tsx`

The palette batch actions use a raw `fetch("/api/v1/tasks/batch-action")` call
instead of the per-task mutation pattern from `batch-mutations.ts`. This means:

1. **No optimistic updates** — UI waits for API response
2. **No undo** — toast says "N tasks updated" with no Undo button
3. **Only invalidates `dashboardTasksKey()`** — misses instance queries
4. **"Edit…" dispatches `open-batch-edit`** but the popover is anchored to the
   FloatingActionBar which may not be visible if the palette is covering it

**Fix:** Refactor palette batch actions to call the same `batchToggleComplete`,
`batchDelete`, `batchReschedule`, etc. from `batch-mutations.ts`. Get undo for free.

---

## Major

### 4. Batch edit fires no-op mutations on pre-filled fields

**Component:** `batch-edit-popover.tsx`

When all selected tasks share the same value for a field (e.g., all impact=3),
the field is pre-filled with "3" on mount. The `hasChanges` check evaluates
`impact !== UNSET`, which is true since it was pre-filled. Clicking Apply without
touching anything fires N unnecessary API calls and shows "Edited 3 tasks".

**Fix:** Track which fields the user has explicitly interacted with (via
`onValueChange` callbacks), and only include those in the final `fields` object.

---

### 5. Keyboard shortcuts ignore instances

**Component:** `dashboard.tsx` (Delete, Backspace, ⌘+Enter handlers)

The Delete/Backspace and ⌘+Enter keyboard handlers only resolve tasks from
`stateRef.current.tasks` using `taskSelectionId`. Selected instances are silently
ignored. The floating action bar handles this correctly via `resolveSelection`.

**Fix:** Use `resolveSelection()` in the keyboard handlers and dispatch the
appropriate batch mutations for both tasks and instances.

---

### 6. Invisible filtered tasks still in selection

**Component:** `selection-store.ts`, `floating-action-bar.tsx`

When the user applies an energy filter, hidden tasks remain in the selection.
`resolveSelection` resolves from the full TanStack Query cache, not the filtered
view. The action bar count says "5 selected" but only 3 are visible. The user
can batch-delete tasks they can't see.

**Fix:** Clear selection when energy filter changes, or prune the selection to
only currently-visible items, or resolve from the filtered task list.

---

### 7. Batch-delete parent tasks doesn't warn about subtask cascade

**Component:** `floating-action-bar.tsx`

The Delete button in the floating action bar has no confirmation dialog at all.
The keyboard shortcut confirms for >3 items, but the FAB does not. When parent
tasks with subtasks are batch-deleted, the subtask cascade is silent — the toast
says "Deleted 5 tasks" when 6 subtasks were also removed.

**Fix:** Add confirmation when the batch includes parent tasks with subtasks.
At minimum, surface the subtask count in the toast: "Deleted 5 tasks and 6 subtasks".

---

### 8. Right-click on unselected task shows batch menu

**Component:** `task-item.tsx`

When any selection exists (`hasAnySelection` is true), right-clicking on an
**unselected** task shows the batch context menu instead of the single-item menu.
The design plan (§1) says: "Right-click on an unselected item opens single-item
context menu (selection unchanged)."

**Fix:** Check `isMultiSelected` (whether THIS specific item is in the selection)
instead of `hasAnySelection` when deciding which context menu to render.

---

### 9. Shift+Click range can't cross parent/subtask boundary

**Component:** `task-item.tsx`

Subtasks have their own `orderedIds` list (containing only siblings within the
same parent). Parent tasks have a separate list (top-level tasks only). Shift+Click
range selection between a parent and its subtask, or subtasks across different
parents, is impossible because the ordered ID lists are disjoint.

**Fix:** Build a single flat ordered list that includes both parent tasks and
their visible subtasks in display order. Pass this unified list as `orderedIds`
to both `TaskItem` and subtask items.

---

### 10. Backward wrap past midnight clamps to 00:00

**Component:** `batch-drag-utils.ts`

When batch-dragging tasks backward in time, negative minutes are clamped to 00:00
of the computed day instead of wrapping to the previous day. Forward wrap past
midnight correctly adds extra days.

Example: Task at 01:00. Delta = -2h. Expected: 23:00 previous day. Actual: 00:00 same day.

**Fix:** Mirror the forward wrap: `while (newMinutes < 0) { newMinutes += 1440; extraDays--; }`.

---

### 11. Action bar count uses selectedIds.size, not resolved count

**Component:** `floating-action-bar.tsx`

If a selected task is deleted by a background refetch, `selectedIds.size` stays
at the old count but `resolveSelection` returns fewer items. The bar says
"5 selected" while only 4 are operable. Toast says "Completed 4 tasks".

**Fix:** Use `tasks.length + instances.length` for the display count, or prune
unresolvable IDs from the selection after each resolution.

---

### 12. Undo restores full cache snapshot, not per-task values

**Component:** `batch-mutations.ts`

The undo callback restores the entire `dashboardTasksKey()` cache snapshot taken
before the batch. If the cache was invalidated between the operation and the undo
click (refetch, other mutation), restoring the old snapshot reverts unrelated changes.

**Fix:** Have the undo fire specific per-task mutations to restore each task's
original field values instead of restoring the full cache snapshot.

---

## Minor

### 13. Batch drag overlay says "tasks" when instances are included

**Component:** `task-drag-overlay.tsx`

The overlay label always says "+ N more tasks" even when instances are in the batch.

**Fix:** Use "items" when the selection contains both tasks and instances.

---

### 14. Selection persists across route changes

**Component:** `selection-store.ts`

The design plan says "Navigating away (route change) clears selection." No
route-change listener exists. Stale selection persists on other pages.

**Fix:** Add a TanStack Router navigation event listener that calls `clear()`.

---

### 15. Lasso has no auto-scroll

**Component:** `lasso-selection.tsx`

The lasso pointer capture prevents normal scrolling. Users can only lasso tasks
visible in the viewport. Day columns are 2000+px tall with ~600px visible.

**Fix:** Add auto-scroll logic when pointer approaches top/bottom edge of the
scroll container, matching the existing dnd-kit auto-scroll behavior.

---

### 16. Batch-dropping 20 tasks overflows past midnight

**Component:** `day-column.tsx`

Stacking 20 tasks with default 30m duration + 5-min gaps = 700 minutes (11h 40m).
Starting at 14:00, tasks pile up past midnight and clamp to 23:59.

**Fix:** Cap stack mode or warn when total exceeds remaining day hours.

---

### 17. Multi-select ring overridden by just-updated pulse

**Component:** `task-item.tsx`

When `isMultiSelected` and `isJustUpdated` are both true (after batch-editing a
selected task), `ring-2 ring-primary/30 animate-pulse` overwrites the stronger
`ring-2 ring-primary` selection ring in the className.

**Fix:** Skip `isJustUpdated` ring when `isMultiSelected` is true.

---

### 18. Shift+Click cross-view fallback doesn't indicate anchor change

**Component:** `selection-store.ts`

Shift+Click across views (task list → calendar) falls back to toggle. But it
silently updates `lastClickedId`, so the next same-view Shift+Click uses this
new anchor. No visual feedback indicates the anchor changed.

**Fix:** Consider a subtle visual indicator on the anchor task.

---

### 19. Action bar buttons have no aria-label or title

**Component:** `floating-action-bar.tsx`

On mobile, text labels are hidden (`hidden sm:inline`). Icon-only buttons have
no `aria-label` or `title`. Screen readers can't identify button purpose.

**Fix:** Add `aria-label={label}` and `title={label}` to `ActionButton`.

---

### 20. Lasso hit-tests DOM rects on every mouse move

**Component:** `lasso-selection.tsx`

Every pointer move event queries all `[data-selection-id]` elements and calls
`getBoundingClientRect()` on each. With 200 cards, this forces layout reflow
on every frame and triggers Zustand state updates that cascade re-renders.

**Fix:** Throttle to `requestAnimationFrame`, cache card positions at lasso start.

---

### 21. Context menu dismissal via synthetic Escape can double-clear

**Component:** `batch-context-menu.tsx`

`dismissContextMenu()` dispatches a synthetic `KeyboardEvent("Escape")` which
also triggers the global selection-clear handler. The double-clear is harmless
now but fragile if other Escape handlers are added.

**Fix:** Use Radix's programmatic close API instead of synthetic Escape dispatch.

---

### 22. Subtask resolution synthesizes completed_at from timestamp

**Component:** `selection-store.ts` (resolveSelection)

When resolving subtasks from the cache, `completed_at` is synthesized as
`new Date().toISOString()` for completed subtasks instead of using the real
server value. If undo fires, it restores this incorrect timestamp.

**Fix:** Use the actual `completed_at` from the subtask data in the cache.
