---
version:
pr:
created: 2026-03-02
---

# Plan My Day: Selection Mode Rewrite

## Context

The current "Plan My Day" opens a dialog that tries to auto-schedule ALL unscheduled tasks
into a hardcoded 8am–8pm window. With 8 tasks and 12 free hours, it schedules everything —
which is useless. The legacy vanilla JS version worked better: user drags on the calendar to
select a specific time range, then tasks are bin-packed only into that range. This gives the
user control over how much of their day gets filled.

## Approach

Replace the dialog with an interactive selection mode on the calendar grid, matching the
legacy behavior.

### UX Flow

1. Click **Plan My Day** → button changes to **Cancel**, crosshair cursor on calendar
2. Drag on calendar grid to select time range (snapped to 15-min intervals, current day only)
3. Overlay shows selected range with time labels + **Plan Tasks** button
4. Click **Plan Tasks** → immediate bin-packing + API calls + undo toast
5. Escape / Cancel / date navigation exits selection mode

### Files to Modify

#### 1. `frontend/src/lib/calendar-utils.ts` — Algorithm

- Update `planTasks()` signature to accept:
  - `rangeStartMinutes` / `rangeEndMinutes` (replaces hardcoded 8am–8pm)
  - `scheduledTasks: TaskResponse[]` — already-scheduled tasks count as occupied
  - `instances: InstanceResponse[]` — recurring instances count as occupied
- Build occupied ranges from events + tasks + instances (current code only uses events)

#### 2. `frontend/src/components/calendar/day-column.tsx` — Selection UI

New props: `isPlanMode`, `planSelection`, `onPlanSelectionChange`, `onPlanExecute`

- **Cursor**: `cursor-crosshair` when `isPlanMode`
- **Pointer handlers** (`onPointerDown/Move/Up` with `setPointerCapture`):
  - Convert pixel offset → current-day minutes using existing coordinate math
  - Clamp to 0–1440, snap to 15-min intervals
  - Support bidirectional drag (up or down from anchor)
- **Selection overlay**: Absolute-positioned div with `bg-primary/10`, time labels, "Plan Tasks" button
- **Touch**: `touchAction: "none"` when in plan mode to prevent scroll interference
- **Disable dnd**: `pointer-events-none` on the task items layer during plan mode

#### 3. `frontend/src/components/calendar/calendar-panel.tsx` — Orchestration

- Replace dialog state (`planModeOpen`) with selection state (`isPlanMode`, `planSelection`)
- Button toggles between "Plan My Day" / "Cancel"
- Disable carousel during plan mode (same pattern as dnd: `disabled: isDndDragging || isPlanMode`)
- Escape key exits plan mode
- Date navigation auto-exits plan mode
- **`handlePlanExecute` callback**:
  1. Filter eligible tasks (unscheduled, pending, no parent, energy-matched)
  2. Run `planTasks()` with user-selected range
  3. Optimistic cache update
  4. Exit plan mode immediately (don't wait for API)
  5. Fire API calls (`Promise.allSettled`)
  6. Undo toast with snapshot-based restore

#### 4. `frontend/src/components/calendar/plan-mode.tsx` — Delete

No longer needed. Remove file and its import from calendar-panel.

## Verification

1. `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — type check
2. `cd frontend && npx biome check .` — lint
3. `cd frontend && npm run build` — production build
4. Manual: click Plan My Day → drag on calendar → verify overlay + "Plan Tasks" button →
   execute → verify tasks appear on calendar → click Undo → verify tasks restored
5. Manual: verify drag-to-schedule (dnd) still works when NOT in plan mode
6. Manual: verify carousel swipe still works when NOT in plan mode
7. Manual: verify Ctrl+wheel zoom works during plan mode
