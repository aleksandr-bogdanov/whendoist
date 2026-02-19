---
version:
pr:
created: 2026-02-19
---

# Calendar Redesign: Legacy-Style Extended Day View

## Context

The current React calendar shows 3 narrow day columns side-by-side (6AM-11PM each). The legacy Jinja2 version showed a single wide column spanning 9PM previous day through 5PM next day with day separators and background differentiation. The user wants to bring back those legacy visuals and behaviors, plus make the logo larger and adopt the legacy's smooth continuous zoom.

## Changes Overview

1. **Single-day extended timeline** (44 hours: prev 21:00 → next 17:00)
2. **Day separators** ("START OF FRIDAY" / "END OF FRIDAY" pills)
3. **Adjacent-day background tinting** (dimmed for prev evening / next morning)
4. **Redesigned Anytime section** (banner above time grid)
5. **Smooth continuous zoom** (legacy behavior, not step-based)
6. **Larger logo** in header
7. Remove multi-column layout and adjacent clones

---

## Step 1: `calendar-utils.ts` — Foundation

**File:** `frontend/src/lib/calendar-utils.ts`

### New constants
```
PREV_DAY_START_HOUR = 21   // 9PM previous day
PREV_DAY_HOURS = 3         // 21:00-23:59
CURRENT_DAY_HOURS = 24     // 00:00-23:59
NEXT_DAY_END_HOUR = 17     // 5PM next day
NEXT_DAY_HOURS = 17        // 00:00-16:59
EXTENDED_TOTAL_HOURS = 44  // 3 + 24 + 17
```

### New functions
- `extendedTimeToOffset(hour, minutes, section: 'prev'|'current'|'next', hourHeight)` → pixel offset on 44h timeline
- `extendedOffsetToTime(offsetY, hourHeight, centerDate)` → `{ dateStr, hour, minutes }` with 15-min snap
- `getSectionBoundaries(hourHeight)` → `{ prevEnd, currentStart, currentEnd, nextStart }` pixel boundaries
- `getExtendedHourLabels(hourHeight)` → array of `{ hour, section, offset, label, isAdjacentDay }` for all 44 hours
- `calculateExtendedOverlaps(events, tasks, instances, centerDate, hourHeight)` → `PositionedItem[]` across all 3 dates unified

### Add to PositionedItem
- `daySection?: 'prev' | 'current' | 'next'` field

### Remove
- `getAdjacentDayItems()` function
- `LATE_EVENING_HOUR`, `EARLY_MORNING_HOUR` constants

### Keep (used by plan-mode)
- Old `DAY_START_HOUR`, `TOTAL_HOURS`, `timeToOffset`, `offsetToTime` — mark deprecated or keep for plan-mode

---

## Step 2: `day-column.tsx` — Extended 3-Section Layout

**File:** `frontend/src/components/calendar/day-column.tsx`

Major rewrite. New component renders a single continuous 44-hour column with:

### Background regions
- **Prev evening** (0 → prevEnd): `bg-muted/30` dimmed
- **Current day** (currentStart → currentEnd): `bg-background` normal
- **Next morning** (nextStart → end): `bg-muted/30` dimmed

### Day separator pills
Two separators at `currentStart` and `currentEnd` offsets:
```
─────── START OF FRIDAY ───────
─────── END OF FRIDAY ─────────
```
Pill style: `rounded-full text-[11px] font-semibold tracking-[0.10em] uppercase text-muted-foreground bg-background border border-border/40`, centered on a horizontal rule line.

### Hour grid lines
44 lines. Adjacent-section lines use `border-border/20`, main-day lines use `border-border/40`. Half-hour subdivisions at `border-border/20`.

### Hour labels
Left ruler shows all 44 labels. Adjacent labels: italic + 70% opacity. Format: "9PM", "10PM", "12AM", "8AM", etc.

### Positioned items
Use `calculateExtendedOverlaps` output. Items in adjacent sections get `opacity-60`.

### Droppable zones
Three stacked droppable zones (`calendar-{prevDate}`, `calendar-{centerDate}`, `calendar-{nextDate}`) covering their respective pixel ranges. This keeps `task-dnd-context.tsx` unchanged.

### Current time indicator
Red dot + line at `extendedTimeToOffset(now.getHours(), now.getMinutes(), 'current', hourHeight)` when centerDate is today.

### Total height
`EXTENDED_TOTAL_HOURS * hourHeight` (44 * 60 = 2640px default)

---

## Step 3: `calendar-panel.tsx` — Single Column Container

**File:** `frontend/src/components/calendar/calendar-panel.tsx`

### Remove
- `dates` array (3-day range)
- Three-column day header row with weekday/date labels
- Multi-column `dates.map()` rendering multiple `DayColumn`s
- Inline anytime rendering in day headers

### Add
- **Anytime banner** between header and scroll area (see Step 4)
- **"Today" button** in header (shows when centerDate !== today)
- Single `ExtendedDayColumn` replacing the 3-column flex

### Update
- **Data fetching** range: `addDays(centerDate, -1)` to `addDays(centerDate, 2)` for full coverage
- **Scroll-to-now**: offset = `PREV_DAY_HOURS * hourHeight + now.getHours() * hourHeight`
- **Time ruler**: 44 labels using `getExtendedHourLabels()`
- **Header**: keep date display + prev/next arrows + Plan My Day button + zoom controls

### Keep
- Swipe gestures (day navigation still makes sense)
- Zoom button controls
- Plan My Day dialog
- Keyboard navigation

---

## Step 4: Anytime Section

New `AnytimeSection` component inside `calendar-panel.tsx`.

- Rendered above the scrollable time grid, below the nav header
- Only shows when there are anytime tasks for the center date
- "ANYTIME" label on left (small, uppercase, muted)
- Tasks as horizontal wrapping pills with impact-color left border
- Max height ~82px, scrollable overflow
- Filter: `scheduled_date === centerDate && !scheduled_time && status !== 'completed'`

---

## Step 5: Smooth Continuous Zoom

**Files:** `calendar-panel.tsx`, `calendar-utils.ts`

### Legacy behavior
The old version uses `ZOOM_WHEEL_SCALE = 0.20` for continuous smooth scaling:
```js
targetZoomHeight -= pendingZoomDelta * ZOOM_WHEEL_SCALE;  // continuous
```
Then snaps to nearest `ZOOM_STEP` only when persisting to server.

### Current behavior (to replace)
Steps discretely between ZOOM_STEPS on each threshold (10px delta).

### New behavior
- Track a `targetZoomRef` (continuous float)
- On Ctrl+wheel: `target -= deltaY * 0.20`, clamped to [30, 100]
- Apply `Math.round(target)` as hourHeight immediately (smooth)
- On save (debounced 500ms): snap to nearest ZOOM_STEP for persistence
- Button +/- still step through ZOOM_STEPS discretely

---

## Step 6: Logo Size

**File:** `frontend/src/components/layout/header.tsx`

Change WIcon from `h-[22px] w-[24px]` to `h-[28px] w-[30px]`.

---

## Step 7: Cleanup

- Remove adjacent clone rendering from old day-column.tsx
- Remove `getAdjacentDayItems` from calendar-utils.ts
- Remove three-column flex layout from calendar-panel.tsx
- Keep old `timeToOffset`/`offsetToTime` for plan-mode.tsx compatibility

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/lib/calendar-utils.ts` | New constants, extended positioning, overlap calc |
| `frontend/src/components/calendar/day-column.tsx` | Full rewrite: 3-section extended layout |
| `frontend/src/components/calendar/calendar-panel.tsx` | Single column, anytime banner, smooth zoom |
| `frontend/src/components/calendar/calendar-event.tsx` | Add optional opacity for adjacent items |
| `frontend/src/components/calendar/scheduled-task-card.tsx` | Add optional opacity for adjacent items |
| `frontend/src/components/layout/header.tsx` | Larger logo |

**No changes needed:** `task-dnd-context.tsx` (three stacked droppables reuse existing logic), `plan-mode.tsx`, stores, API hooks.

---

## Verification

1. `cd frontend && npx tsc --noEmit` — no type errors
2. `cd frontend && npx biome check .` — no lint errors
3. `cd frontend && npm run build` — successful build
4. Visual check: calendar shows 9PM-5PM extended view with separators, dimmed adjacent sections, anytime banner, smooth zoom
5. Drag-and-drop: scheduling tasks onto any section assigns correct date/time
6. Day navigation: prev/next arrows shift center date, scroll-to-now works
7. Mobile: single column still works, swipe gestures functional
