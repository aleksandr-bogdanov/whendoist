---
version:
pr:
created: 2026-03-02
---

# Multi-Select & Batch Operations — Design Plan

> Select multiple tasks on the calendar or task list, then drag, reschedule,
> complete, delete, or edit them as a single operation with one undo.

---

## 1. Selection Model

### How you select

| Action | Effect |
|--------|--------|
| **⌘+Click** (Mac) / **Ctrl+Click** (Win) on a task | Toggle that task in/out of selection |
| **Click** (no modifier) anywhere | Clear selection, behave normally (open detail panel, etc.) |
| **Escape** | Clear selection |
| **⌘+A** | Select all visible tasks in the current view |
| **Right-click** on a **selected** item | Open **batch context menu** |
| **Right-click** on an **unselected** item | Open **single-item context menu** (selection unchanged) |

### What can be selected

| Item type | Selectable? | Notes |
|-----------|-------------|-------|
| Scheduled tasks (calendar) | Yes | Both in time grid and anytime section |
| Anytime tasks (calendar) | Yes | Date shifts apply; time stays null |
| Recurring instances (calendar) | Yes | Uses instance-specific mutation APIs |
| Tasks (task list view) | Yes | Same ⌘+Click pattern |
| Subtasks (task list view) | Yes | Selected independently from parent |
| Google Calendar events | **No** | Read-only, not our data |

### Selection identity

Each selected item has a unique key:

- Tasks: `task-{id}`
- Instances: `instance-{id}`

This allows mixed selection of tasks and instances in the same batch.

### Selection scope

- **Calendar view** and **task view** share the same selection store
- Selecting a task in the task list that also appears on the calendar highlights
  it in both places (it's the same `task-{id}`)
- Navigating away (route change) clears selection

### Visual treatment

Selected items get:
- A **ring/border** in the accent color (`ring-2 ring-primary`)
- A subtle **background tint** (`bg-primary/10`)
- A small **checkmark badge** in the top-left corner of the card (calendar)
  or left edge of the row (task list)

Unselected items remain visually unchanged. The selection is purely additive —
there's no "dim everything else" treatment.

---

## 2. Floating Action Bar

When **≥ 1 item** is selected, a floating action bar appears at the bottom
center of the screen:

```
┌─────────────────────────────────────────────────────────────┐
│  ✕  │  3 selected  │  ✔ Complete  │  ⊘ Unschedule  │  ✎ Edit…  │  🗑 Delete  │
└─────────────────────────────────────────────────────────────┘
```

### Bar anatomy

| Element | Behavior |
|---------|----------|
| **✕ (close)** | Clears selection, dismisses bar |
| **"N selected"** | Count label; updates live as selection changes |
| **Complete** | Marks all selected tasks/instances as completed |
| **Unschedule** | Removes scheduled_date/time from all selected items |
| **Edit…** | Opens batch edit popover (see §5) |
| **Delete** | Deletes all selected tasks (with confirmation if > 3 items) |

### Behavior

- Animates in from bottom (slide up + fade) when selection count goes from 0 → ≥1
- Animates out (slide down + fade) when selection is cleared
- Positioned with `fixed` bottom-center, above any mobile nav bar
- Z-index above calendar content but below modals
- **Does not block interaction** — calendar/task list remains fully interactive
  underneath (the bar is compact, ~48px tall)
- Escape key clears selection AND dismisses bar

### Contextual actions

The bar adapts based on what's selected:

| Selection contains | "Complete" shows as | "Unschedule" shows as |
|-------------------|--------------------|-----------------------|
| All pending tasks | "Complete" | "Unschedule" (if any are scheduled) |
| All completed tasks | "Reopen" | — hidden — |
| Mix of pending + completed | "Complete" (applies to pending only) | "Unschedule" |
| Only instances | "Complete" | "Unschedule" |
| Only anytime (unscheduled) | "Complete" | — hidden — |

---

## 3. Batch Drag (Calendar)

### Starting a batch drag

1. Select multiple tasks via ⌘+Click
2. Mousedown + move on **any selected task** → starts a batch drag
3. If you drag an **unselected** task, only that single task moves (existing behavior)

### Drag overlay

During batch drag, the overlay shows:

```
┌──────────────────────────────┐
│  📋 Meeting prep     30m     │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│  + 2 more tasks              │
└──────────────────────────────┘
```

- Top item = the task being physically dragged (the anchor)
- Below it: "+ N more tasks" label
- Compact pill style, slightly wider than single-task overlay
- Subtle stacked-card shadow effect (offset shadows)

### Drop behavior: Relative spacing preserved

When you drop the batch, the **time delta** is computed from the anchor task,
and applied to all selected tasks:

**Example:** Tasks at Mon 9:00, Mon 11:00, Wed 14:00. You grab the 9:00 task
and drop it at Thu 13:00.

- Delta: +3 days, +4 hours
- Mon 9:00 → **Thu 13:00** (anchor, dropped here)
- Mon 11:00 → **Thu 15:00** (+3 days, +4 hours)
- Wed 14:00 → **Sat 18:00** (+3 days, +4 hours)

### Drop zones

| Drop target | Batch behavior |
|-------------|---------------|
| **Calendar time slot** | Apply time+day delta to all (as described above) |
| **Anytime section** | All become anytime for target date; relative day offsets preserved |
| **Date group header** (task view) | All move to that date; times preserved; no day offsets |

### Edge cases

- **Anytime tasks in batch**: Day delta applies; they stay anytime (no time to shift)
- **Drop would push task past midnight**: Wrap to next day (e.g., 23:00 + 3h = 02:00 next day)
- **Drop would create negative time**: Clamp to 00:00 of the computed day
- **Instance in batch**: Uses `scheduleInstance` API instead of `updateTask`

---

## 4. Batch Context Menu

Right-click on any **selected** item opens the batch context menu:

```
┌──────────────────────────────┐
│  ✔  Complete 3 tasks         │
│  ↩  Reopen                   │  (if any are completed)
│  ─────────────────────────── │
│  📅 Reschedule…              │  → date picker sub-menu
│  ⊘  Unschedule               │
│  ─────────────────────────── │
│  ✎  Edit…                    │  → opens batch edit popover
│  ─────────────────────────── │
│  🗑  Delete 3 tasks           │  (destructive)
└──────────────────────────────┘
```

### "Reschedule…" submenu

Opens an inline date picker (like the existing shadcn Calendar component):
- Pick a date → all selected items move to that date
- Times are preserved (only date changes)
- Anytime tasks move to the new date without time
- Relative day offsets are **not** preserved here (unlike drag) — all go to the
  picked date. This is intentional: "reschedule to Thursday" means "all on Thursday."

### Action counts

Each action label shows the count: "Complete 3 tasks", "Delete 3 tasks".
When the selection is mixed (tasks + instances), show "3 items" instead of "3 tasks".

---

## 5. Batch Edit Popover

Triggered from the action bar's "Edit…" button or the context menu's "Edit…" item.

```
┌───────────────────────────────────────┐
│  Edit 3 tasks                         │
│                                       │
│  Priority    [  —  ▾]                 │
│  Impact      [  —  ▾]                 │
│  Clarity     [  —  ▾]                 │
│  Duration    [  —    ]                │
│  Domain      [  —  ▾]                 │
│                                       │
│           [Cancel]  [Apply]           │
└───────────────────────────────────────┘
```

### How it works

- Each field starts in an **unset / no-change** state (shown as "—")
- Only fields you explicitly set are applied to the selected tasks
- Leaving a field as "—" means "don't change this field"
- **Apply** triggers one batch mutation per field that changed
- All applied changes are grouped into a **single undo toast**

### Fields available

| Field | Control | Values |
|-------|---------|--------|
| Priority | Dropdown | P1, P2, P3, P4 |
| Impact | Dropdown | 1–5 |
| Clarity | Dropdown | Clear, Fuzzy, Unknown |
| Duration | Text input | Minutes (e.g., "30m", "1h") |
| Domain | Dropdown | List of user's domains |

### Instance handling

When instances are in the selection, only applicable fields are shown.
Instance-specific fields (like skip/complete) are handled via the action bar
buttons, not the edit popover.

---

## 6. Batch Undo

### The pattern

Every batch operation produces a **single toast** with a **single undo button**:

```
┌─────────────────────────────────────────────┐
│  ✔  Completed 3 tasks            [Undo]    │
└─────────────────────────────────────────────┘
```

### How undo works

1. **Before** the batch mutation, capture the previous state of **every** affected
   item (snapshot from TanStack Query cache)
2. **Execute** all mutations (optimistic update for each)
3. **Show toast** with single undo action
4. If user clicks **Undo**:
   - Optimistically restore all items from the snapshot
   - Fire reverse mutations for each item
   - Invalidate queries on completion
5. Toast auto-dismisses after 10s (standard `TOAST_DURATION`)

### Toast ID

Use a unique batch toast ID: `batch-{operation}-{timestamp}` to prevent
duplicate toasts and allow programmatic dismissal.

### Error handling

- If **some** mutations in the batch fail, show a partial-failure toast:
  "Completed 2 of 3 tasks. 1 failed." with undo for the successful ones
- If **all** fail, restore full snapshot and show error toast

---

## 7. Task View Multi-Select

The same selection model extends to the task list view.

### Interaction

| Action | Effect |
|--------|--------|
| **⌘+Click** on task row | Toggle selection |
| **Click** on task row (no modifier) | Clear selection, open task detail |
| **⌘+Click** on checkbox | Toggle selection (NOT complete) — checkbox behavior changes |
| **Right-click** on selected row | Batch context menu |

### Visual treatment

Selected rows get:
- Left border accent (2px solid primary)
- Background tint (`bg-primary/5`)
- Selection state is visible even when scrolled (consistent highlight)

### Drag from task view

If multiple tasks are selected in the task list and you drag one:
- **Drop on calendar** → all selected tasks get scheduled to the drop time
  (with relative ordering: first selected at drop time, rest stacked with
  5-min gaps below, like plan-my-day placement)
- **Drop on another task** (reparent) → **blocked** — batch reparenting is
  too ambiguous, only single-task reparent works
- **Drop on task list gap** (reorder) → reserved for future manual ordering

### Shared selection

The action bar appears in **both** calendar and task view — it's a global
floating element. Selecting a task in the task list that has a calendar card
highlights it there too (and vice versa).

---

## 8. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **⌘+Click** / **Ctrl+Click** | Toggle item selection |
| **⌘+A** | Select all visible items in current view |
| **Escape** | Clear selection |
| **Delete** / **Backspace** (with selection) | Delete selected (with confirmation) |
| **⌘+Enter** (with selection) | Complete selected |

---

## 9. Edge Cases & Decisions

### Mixed tasks + instances

- Selection can contain both tasks and instances
- Each action dispatches the correct API per item type
- Toast labels use "items" when mixed, "tasks" when all tasks

### Recurring parent tasks

- Selecting a recurring parent's **instance** is fine (operates on the instance)
- Selecting the **parent task itself** (which appears in the task list) applies
  to the parent, not its instances
- Batch-completing a parent does NOT complete its instances — that's a separate
  action (existing "complete past instances" button)

### Selection during drag

- Starting a drag does NOT clear selection
- Dropping completes the batch move and clears selection (the tasks are now
  in their new positions — re-selecting would be unusual)
- If drag is cancelled (Escape during drag), selection is preserved

### Empty batch scenarios

- All selected tasks already completed → "Complete" button is disabled
- All selected tasks already unscheduled → "Unschedule" button is hidden
- Only 1 item selected → action bar still shows (it's useful even for 1)

### Calendar navigation during batch drag

- The existing auto-navigate (carousel shifts when dragging near edges) works
  for batch drag — the anchor task's position determines navigation
- Cross-day drops during navigation preserve the day delta calculation

### Conflict with Plan My Day

- Entering Plan My Day mode clears any active selection
- Selection is disabled while Plan My Day mode is active (they're mutually
  exclusive — Plan mode has its own selection UX)

---

## 10. Implementation Phases (Suggested)

### Phase 1: Selection Infrastructure
- Selection store (Zustand)
- ⌘+Click handlers on calendar cards and task list rows
- Visual selection treatment (ring, tint, badge)
- Escape to clear

### Phase 2: Floating Action Bar
- Action bar component with count display
- Complete / Delete batch actions
- Single batch undo toast

### Phase 3: Batch Drag (Calendar)
- Multi-drag with relative spacing
- Stacked drag overlay
- Drop handlers with delta calculation
- Cross-day offset preservation

### Phase 4: Batch Context Menu & Reschedule
- Right-click batch menu
- Reschedule date picker
- Unschedule batch action

### Phase 5: Batch Edit Popover
- Popover form with metadata fields
- Partial-apply logic (only changed fields)
- Batch mutation with grouped undo

### Phase 6: Task View Integration
- ⌘+Click in task list
- Drag from task list to calendar (batch scheduling)
- Shared selection state across views

---

## 11. Technical Architecture Notes

### Selection Store

```
store: useSelectionStore (Zustand)
├── selectedIds: Set<string>        // "task-123", "instance-456"
├── toggle(id)                      // ⌘+Click handler
├── clear()                         // Escape / navigation / click
├── selectAll(ids[])                // ⌘+A
├── isSelected(id) → boolean        // For rendering
├── selectedTasks() → TaskResponse[] // Resolved from query cache
├── selectedInstances() → InstanceResponse[]
└── count → number
```

### Batch mutation helper

A generic `executeBatch()` utility that:
1. Snapshots all affected items from cache
2. Applies optimistic updates
3. Fires mutations (parallel, with `Promise.allSettled`)
4. Shows single toast with undo
5. Handles partial failures

### DnD integration

- Modify `handleDragEnd` in `task-dnd-context.tsx` to check if the dragged
  item is in the selection set
- If yes: compute delta, apply to all selected items via `executeBatch()`
- If no: existing single-item behavior (unchanged)

### Event propagation

⌘+Click must NOT trigger:
- The existing `onClick` (open detail panel)
- dnd-kit's drag start (mousedown with movement)

This is handled by checking `event.metaKey || event.ctrlKey` in the click
handler and calling `event.stopPropagation()` + `selectionStore.toggle(id)`.
