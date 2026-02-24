---
version:
pr:
created: 2026-02-24
---

# Task Panel UX Cleanup

Visual design and UX cohesion improvements for the task dashboard.

## Decisions Made

1. **Sort controls → column header row**: Move CLARITY/DURATION/IMPACT out of the toolbar into a dedicated sticky row that sits between the toolbar and the task list. This row uses the same CSS grid variables as task rows, guaranteeing pixel-perfect column alignment. Each label is clickable to sort (same `toggleSort` behavior).

2. **Remove second gradient separator**: Delete the gradient bar under the task panel header (`task-panel.tsx:149`). Keep only the one under the main navbar (`header.tsx:89`). Replace with a simple `border-b border-border/40` on the toolbar container (already has `border-b`, just remove the gradient div).

3. **Remove three colored dots**: Delete the clarity dots from `energy-selector.tsx` (lines 47-62). They duplicate the energy level toggle buttons right next to them.

4. **Remove "+ Quick" button**: Delete the Quick button from `task-panel.tsx` (lines 155-159). Remove the `onQuickAdd` prop from `TaskPanelProps` and all call sites. Thoughts page is the quick-add entry point.

5. **Section hierarchy — hairline + margin**: Add more top margin (`mt-6`) and a visible hairline separator before Scheduled, Completed, and Deleted sections. Currently they use `border-t border-border mt-2 pt-3` — increase to `mt-6 pt-4` for stronger visual separation from domain groups.

---

## Implementation Steps

### Step 1: Remove three colored dots from EnergySelector

**File:** `frontend/src/components/dashboard/energy-selector.tsx`

Delete lines 47-62 (the entire `{/* Clarity dots */}` block including the wrapper div and the `.map()` inside it). Also delete the unused `DOT_COLORS` constant on line 10.

**Before (lines 10, 47-62):**
```tsx
const DOT_COLORS = ["var(--autopilot-color)", "var(--normal-color)", "var(--brainstorm-color)"];
// ...
      {/* Clarity dots */}
      <div className="flex items-center gap-1">
        {DOT_COLORS.map((color, i) => (
          <div
            key={color}
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: color,
              opacity: i < energyLevel ? 1 : 0.12,
              transition: "opacity 0.2s",
            }}
          />
        ))}
      </div>
```

**After:** Delete `DOT_COLORS` constant entirely. Delete the entire `{/* Clarity dots */}` div block (lines 47-62). The component ends with `</div>` for the button container, then `</div>` for the outer wrapper.

---

### Step 2: Remove "+ Quick" button and `onQuickAdd` prop

**File 1:** `frontend/src/components/dashboard/task-panel.tsx`

A) Remove `onQuickAdd` from the `TaskPanelProps` interface (line 27):
```tsx
// DELETE this line:
  onQuickAdd?: () => void;
```

B) Remove `onQuickAdd` from destructuring (line 36):
```tsx
// Change from:
  onQuickAdd,
  onEditTask,
// To:
  onEditTask,
```

C) Delete the Quick button block (lines 154-160). Keep the wrapper div but only with New Task:
```tsx
// BEFORE (lines 154-167):
        <div className="flex items-center gap-1">
          {onQuickAdd && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onQuickAdd}>
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Quick</span>
            </Button>
          )}
          {onNewTask && (
            <Button variant="default" size="sm" className="h-7 text-xs gap-1" onClick={onNewTask}>
              <Plus className="h-3.5 w-3.5" />
              New Task
            </Button>
          )}
        </div>

// AFTER:
        {onNewTask && (
          <Button variant="default" size="sm" className="h-7 text-xs gap-1" onClick={onNewTask}>
            <Plus className="h-3.5 w-3.5" />
            New Task
          </Button>
        )}
```

**File 2:** `frontend/src/routes/_authenticated/dashboard.tsx`

Remove the `onQuickAdd` prop from the `<TaskPanel>` call at line 398:
```tsx
// DELETE this line:
              onQuickAdd={handleQuickAdd}
```

Check if `handleQuickAdd` is still used elsewhere in the file. If not, delete its definition too.

---

### Step 3: Remove second gradient separator from task panel header

**File:** `frontend/src/components/dashboard/task-panel.tsx`

Delete the gradient div at line 149:
```tsx
// DELETE this line:
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#167BFF] via-[#6D5EF6] to-[#A020C0] opacity-35" />
```

The toolbar container at line 146 already has `border-b` in its className, which provides a subtle 1px border. That's sufficient separation. If the existing `border-b` color feels too strong, soften it to `border-b border-border/40`. But try it first with the default `border-b` (which is already there) — it may look perfect once the gradient is gone.

---

### Step 4: Create column header row component and move sort controls

This is the main change. We're moving the `SortControls` from the toolbar into a new sticky column header row that sits between the toolbar and the scrollable task list.

**File 1: Rename** `frontend/src/components/dashboard/sort-controls.tsx` → keep the file but rewrite it as a column header row.

Replace the entire contents of `sort-controls.tsx` with:

```tsx
import { ArrowDown, ArrowUp } from "lucide-react";
import { announce } from "@/components/live-announcer";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

const SORT_OPTIONS = [
  { field: "clarity" as const, label: "Clarity", colVar: "--col-clarity" },
  { field: "duration" as const, label: "Duration", colVar: "--col-duration" },
  { field: "impact" as const, label: "Impact", colVar: "--col-impact" },
];

export function ColumnHeaders() {
  const { sortField, sortDirection, toggleSort } = useUIStore();

  return (
    <div className="hidden sm:flex items-center justify-end px-2 sm:px-4 lg:px-8 py-1 sticky top-0 z-10 bg-background/80 backdrop-blur-sm">
      {/* Spacer for task name area + rail + checkbox */}
      <div className="flex-1" />

      {/* Column headers aligned with task row metadata */}
      <div className="flex items-center gap-[var(--col-gap)] flex-shrink-0">
        {SORT_OPTIONS.map((opt) => {
          const isActive = sortField === opt.field;
          const Icon = sortDirection === "asc" ? ArrowUp : ArrowDown;
          return (
            <button
              key={opt.field}
              type="button"
              className={cn(
                "flex items-center justify-center gap-0.5 text-[0.625rem] font-medium tracking-[0.06em] uppercase transition-colors",
                isActive
                  ? "text-muted-foreground"
                  : "text-muted-foreground/40 hover:text-muted-foreground",
              )}
              style={{ width: `var(${opt.colVar})` }}
              onClick={() => {
                toggleSort(opt.field);
                const dir =
                  sortField === opt.field
                    ? sortDirection === "asc"
                      ? "descending"
                      : "ascending"
                    : "ascending";
                announce(`Sorted by ${opt.label.toLowerCase()} ${dir}`);
              }}
            >
              {opt.label}
              {isActive && <Icon className="h-2.5 w-2.5" />}
            </button>
          );
        })}
        {/* Spacer matching actions column (kebab menu) */}
        <span className="w-[var(--col-actions)]" />
      </div>
    </div>
  );
}
```

Key differences from old `SortControls`:
- Exported as `ColumnHeaders` (rename the export)
- Full-width row with `flex-1` spacer on left → column labels pushed to right, aligning with metadata
- Smaller font (`0.625rem` vs `0.6875rem`) and `font-medium` instead of `font-semibold` — these are subtle labels, not bold controls
- Active state uses `text-muted-foreground` (not `text-foreground`) — less prominent than before
- Smaller arrow icon (`h-2.5 w-2.5` vs `h-3 w-3`)
- `sticky top-0 z-10` with blurred background so it pins when scrolling
- Padding matches the scrollable area: `px-2 sm:px-4 lg:px-8` (check that `lg:px-8` matches — the scroll area has `sm:px-2 lg:px-4` plus inner `p-2 sm:p-4`, so total is roughly `px-4 sm:px-6 lg:px-8`; may need fine-tuning to perfectly align)

**IMPORTANT — padding alignment:** The column headers must have the exact same effective horizontal padding as task rows. Task rows live inside:
- Scroll area: `sm:px-2 lg:px-4` (line 173 of task-panel.tsx)
- Inner div: `p-2 sm:p-4` (line 177)

So total left padding on desktop ≈ `px-2 + p-4 = 24px` on sm, `px-4 + p-4 = 32px` on lg. The column header row sits OUTSIDE the scroll area (above it, in the flex column), so it needs to match: `px-4 sm:px-6 lg:px-8`. **Test this visually and adjust until the column header labels align perfectly with the metadata pills in task rows below.** This is the most critical detail of the whole change.

**File 2:** `frontend/src/components/dashboard/task-panel.tsx`

A) Update import: change `SortControls` to `ColumnHeaders`:
```tsx
// Change:
import { SortControls } from "./sort-controls";
// To:
import { ColumnHeaders } from "./sort-controls";
```

B) Remove `<SortControls />` from the toolbar (line 153):
```tsx
// DELETE this line from inside the toolbar div:
        <SortControls />
```

C) Add `<ColumnHeaders />` between the toolbar and the scrollable task list. The current structure is:

```tsx
    <div className="flex flex-col flex-1 min-h-0">
      {/* Panel header with controls */}
      <div data-task-panel-header ...>
        ...toolbar...
      </div>

      {/* Task list */}
      <div ref={pullRefreshRef} className="flex-1 min-h-0 flex flex-col relative">
        <div className="flex-1 min-h-0 overflow-y-auto relative sm:px-2 lg:px-4" data-task-scroll-area>
```

Insert `<ColumnHeaders />` inside the scroll area, BEFORE the `<StickyDomainHeader />`, so it scrolls with the content but sticks to top:

```tsx
      <div ref={pullRefreshRef} className="flex-1 min-h-0 flex flex-col relative">
        <div className="flex-1 min-h-0 overflow-y-auto relative sm:px-2 lg:px-4" data-task-scroll-area>
          <ColumnHeaders />
          <StickyDomainHeader />
          <div className="p-2 sm:p-4 pb-nav-safe md:pb-4 space-y-2">
```

Placing it inside `data-task-scroll-area` means it participates in the scroll container. The `sticky top-0` on the component itself will make it pin to the top of the scroll area when the user scrolls down.

The toolbar (line 144-168) now becomes just:
```tsx
      <div
        data-task-panel-header
        className="relative flex items-center gap-2 px-2 sm:px-4 py-2 border-b backdrop-blur-md bg-muted/30"
      >
        <EnergySelector />
        <div className="flex-1" />
        {onNewTask && (
          <Button variant="default" size="sm" className="h-7 text-xs gap-1" onClick={onNewTask}>
            <Plus className="h-3.5 w-3.5" />
            New Task
          </Button>
        )}
      </div>
```

Much cleaner: Energy on the left, New Task on the right, nothing else.

---

### Step 5: Increase section hierarchy separation

**Files:**
- `frontend/src/components/task/scheduled-section.tsx` (line 127)
- `frontend/src/components/task/completed-section.tsx` (line 62)
- `frontend/src/components/task/deleted-section.tsx` (line 69)

All three sections use the same trigger className pattern:
```tsx
"border-t border-border mt-2 pt-3",
```

Change to:
```tsx
"border-t border-border/50 mt-6 pt-4",
```

Changes:
- `mt-2` → `mt-6`: More breathing room above the separator (24px vs 8px)
- `pt-3` → `pt-4`: Slightly more padding below the rule
- `border-border` → `border-border/50`: Softer hairline (50% opacity)

This creates clear "chapter breaks" between structural sections without adding any new visual elements.

---

### Step 6: Verify and fine-tune

After all changes, run:
```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```

Then visually verify:
1. **Column alignment**: The header labels (Clarity, Duration, Impact) must align exactly with the metadata pills in task rows. If they don't, adjust the `px-*` padding values on the `ColumnHeaders` component until they match.
2. **Sticky behavior**: Scroll the task list — column headers should pin to the top of the scroll area with a subtle blur behind them.
3. **Toolbar cleanliness**: Energy selector on left, New Task button on right, nothing else.
4. **Section breaks**: Scheduled, Completed, Deleted should feel like distinct page sections, clearly separated from the domain task groups above.
5. **Mobile**: Column headers are hidden on mobile (`hidden sm:flex`). Toolbar should still look good with just Energy + New Task. Section breaks should feel proportional on small screens.

---

## Files Changed (Summary)

| File | Change |
|------|--------|
| `frontend/src/components/dashboard/energy-selector.tsx` | Remove `DOT_COLORS` constant and clarity dots block |
| `frontend/src/components/dashboard/task-panel.tsx` | Remove gradient div, remove `onQuickAdd` prop + Quick button, remove `<SortControls />` from toolbar, add `<ColumnHeaders />` in scroll area, update import |
| `frontend/src/components/dashboard/sort-controls.tsx` | Rewrite as `ColumnHeaders` — full-width sticky row with right-aligned column labels |
| `frontend/src/routes/_authenticated/dashboard.tsx` | Remove `onQuickAdd` prop from `<TaskPanel>`, delete `handleQuickAdd` if unused |
| `frontend/src/components/task/scheduled-section.tsx` | `mt-2 pt-3` → `mt-6 pt-4`, `border-border` → `border-border/50` |
| `frontend/src/components/task/completed-section.tsx` | Same spacing change |
| `frontend/src/components/task/deleted-section.tsx` | Same spacing change |
