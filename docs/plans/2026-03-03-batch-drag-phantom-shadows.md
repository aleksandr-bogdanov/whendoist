---
version:
pr:
created: 2026-03-03
---

# Batch Drag Phantom Shadows — Show all selected tasks during drag

## Problem

When batch-dragging multiple tasks on the calendar, only **one phantom card**
(the anchor task) is shown in the day column. The user cannot see where the
other selected tasks will land until after they drop. This is disorienting,
especially when tasks span multiple hours or even multiple days.

## Goal

During a batch drag over the calendar, render **phantom shadows for every
selected task**, positioned according to their relative spacing from the anchor.
This gives users a spatial preview of where all tasks will land before they
commit the drop.

### Visual result

Dragging 3 tasks (9:00, 11:00, 14:00) to 13:00 → the day column shows
three dashed phantom rectangles at 13:00, 15:00, 18:00, each with the
task's time label and correct height based on duration.

---

## Current Architecture

| Component | What it does today |
|---|---|
| `day-column.tsx` L228-298 | Tracks pointer, computes ONE `phantomOffset` / `phantomDuration` / `phantomTimeLabel` for the anchor task. Renders ONE phantom `<div>` at L413-423. |
| `task-dnd-context.tsx` L317-359 | `handleDragStart` — detects batch drag, sets `isBatchDrag` + `batchCount` in local `dragState`. |
| `task-dnd-context.tsx` L557-754 | `handleBatchDrop` — resolves all selected items from cache, computes `applyDelta()` per item. This math is what we need to **replicate at render time**. |
| `DndStateCtx` (L48-61) | Context only exposes `activeId` and `activeTask` — no batch info. |
| `selection-store.ts` | Has `selectedIds` set. `resolveSelection()` looks up full objects from query cache. |

**Key insight**: The delta math already exists in `handleBatchDrop` → `applyDelta()`.
We need to make the **same** calculation available during `onDragMove`, not just
on drop.

---

## Implementation Plan

### Step 1: Expose batch drag metadata via `DndStateCtx`

**File:** `task-dnd-context.tsx`

Expand `DndStateContextValue` to include batch-relevant fields:

```ts
interface DndStateContextValue {
  activeId: UniqueIdentifier | null;
  activeTask: TaskResponse | null;
  isBatchDrag: boolean;  // NEW
}
```

Update the context provider value (around L1580) to pass `dragState.isBatchDrag`.

**Why context and not a store?** The drag state is already managed via
`useState` inside `TaskDndContext` and scoped to the drag lifecycle. Adding
batch info to the existing context keeps it co-located and avoids a new store.

---

### Step 2: Compute phantom items for the full batch in `day-column.tsx`

**File:** `day-column.tsx`

Currently the `onDragMove` handler computes a single phantom for the anchor.
Replace the single `phantomOffset` / `phantomDuration` / `phantomTimeLabel`
state with an **array of phantom items**:

```ts
interface PhantomItem {
  offset: number;       // px position in the day column
  height: number;       // px height (from duration)
  timeLabel: string;    // e.g. "13:00"
  isAnchor: boolean;    // true for the primary dragged task
}

const [phantomItems, setPhantomItems] = useState<PhantomItem[]>([]);
```

#### Inside `onDragMove`:

1. Read `isBatchDrag` from context (via `useDndState()`).
2. If **not** a batch drag → compute exactly as today, but as a single-element
   array (backwards compatible).
3. If **is** a batch drag:
   a. Get `selectedIds` from `useSelectionStore.getState()`.
   b. Resolve selected items from the query cache (tasks + instances) — reuse
      the same lookup pattern as `handleBatchDrop` (lines 566-619).
   c. Identify the **anchor item** by matching `event.active.id`.
   d. Compute anchor's `snappedMinutes` (already done today).
   e. Compute `daysDelta` and `minutesDelta` from anchor's original
      time to the snapped drop time (same formula as L684-690).
   f. For each selected item, call `applyDelta(item, daysDelta, minutesDelta)`
      to get `{ date, time }`.
   g. Convert each item's new time to a pixel offset using the existing
      `(minutes / 60) * hourHeight` formula.
   h. **Filter to only items landing on this column's date** (prev, center,
      or next) — items that shift to a different day panel won't render here.
   i. Build `PhantomItem[]` with each item's offset, height (from
      `durationToHeight`), and time label.

#### Extracting `applyDelta` to a shared utility

`applyDelta` is currently a local function inside `handleBatchDrop`. Extract it
to a shared module (e.g., `frontend/src/lib/batch-drag-utils.ts`) so both
`task-dnd-context.tsx` (for the drop) and `day-column.tsx` (for the preview)
can use the same math. This ensures the preview matches the actual drop
result exactly.

The shared module would also export helpers already used in `handleBatchDrop`:
- `timeToMinutes(time: string): number`
- `minutesToTime(minutes: number): string`
- `daysBetween(from: string, to: string): number`
- `addDays(date: string, days: number): string`
- `applyDelta(item, daysDelta, minutesDelta): { date, time }`

(Some of these may already exist in `calendar-utils.ts` — check and reuse.)

---

### Step 3: Render multiple phantom cards

**File:** `day-column.tsx` (around L413-423)

Replace the single phantom `<div>` with a loop over `phantomItems`:

```tsx
{phantomItems.map((phantom, i) => (
  <div
    key={i}
    className={cn(
      "absolute left-0.5 right-0.5 rounded-md border border-dashed pointer-events-none z-20 flex items-center px-1.5 text-[10px] font-medium",
      phantom.isAnchor
        ? "bg-primary/15 border-primary/40 text-primary"
        : "bg-primary/10 border-primary/30 text-primary/70"
    )}
    style={{
      top: `${phantom.offset}px`,
      height: `${Math.max(phantom.height, 18)}px`,
    }}
  >
    {phantom.timeLabel}
  </div>
))}
```

**Visual distinction:** The anchor phantom keeps its current styling. Secondary
phantoms use a slightly more muted opacity (`bg-primary/10`, `border-primary/30`)
so the anchor remains visually dominant — the user knows which task they're
"holding."

---

### Step 4: Handle edge cases

| Edge case | Handling |
|---|---|
| **Items land on different days** | Each `day-column` only renders phantoms for items whose computed date matches its own date range (prev/center/next). Items shifting to other days simply won't appear in this column — they'll appear in the adjacent panel if visible. |
| **Anytime (unscheduled) tasks in batch** | Follow the same logic as `handleBatchDrop`: if anchor has no time (stack mode), show stacked phantoms with 5-min gaps. If anchor has time, anytime items get day shift only — no phantom rendered (they stay in the anytime section). |
| **Mixed task/instance batches** | `resolveSelection` already handles both types. Duration lookup: tasks from `allTasksLookup`, instances from the instances array. |
| **Lots of items (10+)** | The `onDragMove` fires on every pointer move. The computation (resolve + delta + filter) is O(N) where N = selection size. For reasonable batch sizes (<50), this is sub-millisecond. No throttle needed. For safety, we could cap rendering at ~20 phantoms. |
| **Cross-day wrapping** | `applyDelta` already handles midnight wrapping (time ≥ 1440 → next day). The phantom calculation reuses the same function, so this works automatically. |
| **Drag to anytime/date-group** | No calendar phantoms needed — these drop zones don't have time slots. Clear phantom items when `overType` is not `"calendar"`. |

---

### Step 5: Performance considerations

- **Memoize resolved batch items** on drag start (in a ref), not on every move.
  The selection set doesn't change during a drag. Resolving from cache once in
  `onDragStart` and storing in a ref avoids repeated cache lookups on every
  pointer move.
- **Only compute phantoms when `isOurZone`** (already the pattern today).
- **Skip re-render if phantom items haven't changed** — use a ref to compare
  previous phantom offsets and only call `setPhantomItems` when values differ.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/lib/batch-drag-utils.ts` | **NEW** — Extract `applyDelta`, `timeToMinutes`, `minutesToTime`, `daysBetween`, `addDays` from `task-dnd-context.tsx` |
| `frontend/src/components/task/task-dnd-context.tsx` | Expand `DndStateContextValue` with `isBatchDrag`. Import shared utils from `batch-drag-utils.ts`. Refactor `handleBatchDrop` to use shared utils. |
| `frontend/src/components/calendar/day-column.tsx` | Replace single phantom state with `PhantomItem[]`. In `onDragMove`, compute all phantom positions for batch drags. Render multiple phantom cards. |

---

## Not in scope

- **Phantoms in adjacent carousel panels** — if you drag 3 tasks and one wraps
  to the next day, that adjacent panel would need to independently compute its
  phantoms too. This works automatically if both panels run the same logic
  (they each have their own `day-column`), but only for visible panels.
- **Drag overlay changes** — the floating pill that follows the cursor stays
  as-is (anchor + "+N more" label). The phantoms in the calendar column serve
  a different purpose (positional preview vs. cursor feedback).
