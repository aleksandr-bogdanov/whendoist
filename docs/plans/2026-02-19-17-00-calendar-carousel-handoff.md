---
version: v0.51.6
pr: 365, 366, 367
created: 2026-02-19
---

# Handoff: Calendar Carousel Swipe Day Navigation

## Context

The user requested that the React calendar's day navigation match the legacy Jinja2 carousel behavior exactly: dragging/swiping physically moves visible content left/right with real-time visual feedback, then snaps to the target day. The previous React implementation just jumped instantly with no visual feedback.

**Legacy reference:** `app/templates/dashboard.html` lines 672-731, `static/css/dashboard.css` lines 2460-2489.

## What Was Completed

### PR #365 — v0.51.4 (merged)
Branch: `feat/calendar-carousel-swipe`

Initial implementation using a **transform-based** 3-panel carousel (`translateX` + CSS transitions). Created `use-carousel.ts` hook with pointer drag, touch swipe, trackpad wheel handling, and a phase state machine (`idle → dragging → animating → idle`).

### PR #366 — v0.51.5 (merged)
Branch: `fix/carousel-stuck-swipe`

Fixed the carousel getting stuck after 1-2 swipes. Root cause: reliance on `transitionend` event which doesn't always fire. Replaced with `setTimeout` fallback. Also moved touch listeners to native `addEventListener` and allowed wheel to interrupt running animations.

### PR #367 — v0.51.6 (merged)
Branch: `fix/carousel-native-scroll-snap`

**Complete rewrite** — abandoned the transform-based approach in favor of **native CSS `scroll-snap`**, which is what the legacy uses. The transform approach had a fundamentally fragile state machine (phase transitions, CSS transition timing, reset-after-navigation cycle). Native scroll-snap delegates all the hard work to the browser.

**Final architecture:**
```
scrollRef (overflow-y: auto, overflow-x: hidden)  ← vertical scroll
  └─ flex row (height: totalHeight)
      ├─ Time ruler (w-12, flex-shrink-0)
      └─ Carousel (overflow-x: auto, scroll-snap-type: x mandatory)
          ├─ DayColumn (prevDate)     33.333% / scroll-snap-align: start
          ├─ DayColumn (centerDate)   33.333% / scroll-snap-align: start
          └─ DayColumn (nextDate)     33.333% / scroll-snap-align: start
```

**How it works:**
- **Touch**: 100% browser-native scroll + snap. Zero JS touch handling.
- **Desktop pointer drag**: `pointerdown/move/up` directly sets `carousel.scrollLeft` (like legacy). Disables `scroll-snap-type` during drag, restores on release. Browser handles snap animation.
- **Trackpad**: Native horizontal scroll flows to carousel. Snap handles it automatically.
- **Detection**: Debounced scroll event (80ms) detects when snap settles on a new panel, calls `onNavigate`.
- **Recenter**: After `calendarCenterDate` updates, `useLayoutEffect` calls `scrollToCenter()` which sets `scrollLeft` to center panel with `scrollBehavior: auto` (instant, no animation). A double-rAF `isProgrammatic` guard prevents the scroll listener from re-triggering navigation.

**Hook is ~90 lines** (was ~300 in the transform version). No state machine, no timeouts, no React state for offset/animation.

## Decisions Made

1. **Native scroll-snap over transform-based carousel**: The transform approach required managing CSS transitions, React state for offset/phase, timeout-based animation commits, and a reset-after-navigation cycle — all of which proved fragile. Scroll-snap delegates animation to the browser and is what the legacy uses.

2. **Nested scroll containers are OK**: The outer container scrolls vertically, the carousel scrolls horizontally. These are orthogonal axes so browsers handle them well. `-webkit-overflow-scrolling: touch` and `overscroll-behavior-x: contain` help on iOS.

3. **Droppable ID namespacing**: With 3 DayColumn panels, dnd-kit droppable zones overlap. Fixed by adding `panelId` prop (`"prev" | "center" | "next"`) and namespacing IDs: `calendar-${panelId}-${dateStr}`. The `task-dnd-context.tsx` was updated to extract dates from `over.data.current.dateStr` instead of parsing the ID string.

4. **Data fetch range widened**: From `centerDate ± 1` to `centerDate ± 2` to cover the extended timelines of all 3 carousel panels.

5. **Carousel disabled during dnd-kit drag**: Tracked via `useDndMonitor` → `setIsDndDragging(true)` → passed as `disabled` to the hook.

## Files Changed (Across All 3 PRs)

### New Files
- `frontend/src/hooks/use-carousel.ts` — scroll-snap carousel hook (~90 lines)
- `docs/plans/2026-02-19-16-00-calendar-carousel-swipe.md` — original plan (documents transform approach; superseded by scroll-snap)

### Modified Files
- `frontend/src/components/calendar/calendar-panel.tsx` — renders 3 DayColumn panels in scroll-snap carousel, Ctrl+wheel zoom preserved, horizontal wheel now handled natively
- `frontend/src/components/calendar/day-column.tsx` — `panelId` prop, namespaced droppable IDs
- `frontend/src/components/task/task-dnd-context.tsx` — date extraction from `over.data.current.dateStr`

## Current State

- **Branch**: `master` (all 3 PRs merged)
- **Version**: `0.51.6`
- **Working tree**: 2 uncommitted items (pre-existing, NOT related to carousel work):
  - `frontend/src/components/task/task-item.tsx` — subtask column alignment (clarity/duration/impact grid-aligned with parent task columns using CSS vars)
  - `docs/plans/2026-02-19-15-00-visual-parity-followup-handoff.md` — untracked handoff doc from previous session
- **All checks pass**: tsc, biome, build (439 backend tests pass)

## What Remains / Known Issues

1. **Mobile testing needed**: The scroll-snap carousel should work well on iOS/Android (it's how the legacy works), but it hasn't been tested on a real device yet. Key concerns:
   - Diagonal swipe conflict between vertical scroll (outer) and horizontal scroll (carousel)
   - iOS PWA viewport behavior (see `CLAUDE.md` rule #8)
   - dnd-kit touch sensor (250ms delay) vs carousel swipe — should not conflict since the carousel uses native scroll, not JS touch handlers

2. **Scroll position after button navigation**: When the user clicks prev/next/today buttons, `goToPrev`/`goToNext` call `setCalendarCenterDate` directly. The `useLayoutEffect` calls `scrollToCenter()` to recenter. This works but there's no smooth slide animation for button clicks (just instant jump). The user may want button clicks to also animate.

3. **Plan file outdated**: `docs/plans/2026-02-19-16-00-calendar-carousel-swipe.md` documents the original transform-based approach. The actual shipped implementation uses scroll-snap. Consider updating or adding a note.

4. **Uncommitted task-item.tsx changes**: Subtask row grid alignment — uses CSS custom properties (`--col-gap`, `--col-clarity`, `--col-duration`, `--col-impact`, `--col-actions`) to align subtask metadata columns with parent task columns. This is unrelated to the carousel work and should be committed separately.

## Key Files for Reference

- **Carousel hook**: `frontend/src/hooks/use-carousel.ts` (~90 lines, very readable)
- **Calendar panel**: `frontend/src/components/calendar/calendar-panel.tsx` (scroll-snap container setup at lines ~310-350)
- **Day column**: `frontend/src/components/calendar/day-column.tsx` (panelId prop, droppable IDs)
- **DnD context**: `frontend/src/components/task/task-dnd-context.tsx` (date extraction at line ~155)
- **Legacy reference**: `app/templates/dashboard.html` lines 672-731 (pointer-drag carousel JS)
- **Legacy CSS**: `static/css/dashboard.css` lines 2460-2489 (scroll-snap CSS)
