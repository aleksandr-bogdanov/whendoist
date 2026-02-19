---
version: v0.51.4
pr:
created: 2026-02-19
---

# Calendar Carousel: Smooth Swipe Day Navigation

## Context

The React calendar renders a single DayColumn and navigates via instant jumps (no visual feedback). The legacy Jinja2 calendar uses a horizontal CSS scroll-snap carousel where dragging physically moves visible content left/right, providing tactile feedback. This plan replicates that experience in React using a transform-based 3-panel carousel.

**Why transform-based instead of CSS scroll-snap**: The current layout has a single vertical scroll container wrapping both the time ruler and day column. Adding a horizontally-scrollable carousel inside this creates nested scroll containers that cause diagonal-swipe conflicts on touch. Transform-based animation avoids this entirely — one vertical scroll container, horizontal movement via `translateX()`.

## Files to Modify

| File | Action | Summary |
|------|--------|---------|
| `frontend/src/hooks/use-carousel.ts` | CREATE | Carousel gesture hook (pointer drag, touch, wheel) |
| `frontend/src/components/calendar/calendar-panel.tsx` | MODIFY | Render 3 DayColumn panels in carousel, wire hook, remove old gesture code |
| `frontend/src/components/calendar/day-column.tsx` | MODIFY | Add `panelId` prop, namespace droppable IDs |
| `frontend/src/components/task/task-dnd-context.tsx` | MODIFY | Extract date from `over.data.current.dateStr` instead of parsing ID string |

## Architecture

### Layout Structure

```
scrollRef (overflow-y: auto, overflow-x: hidden)  ← single vertical scroll
  └─ flex row (height: totalHeight)
      ├─ Time ruler (w-12, flex-shrink-0)          ← stays fixed horizontally
      └─ Carousel container (flex-1, overflow: hidden)
          └─ Carousel track (width: 300%, translateX)
              ├─ DayColumn (prevDate)    33.333%
              ├─ DayColumn (centerDate)  33.333%   ← visible at rest
              └─ DayColumn (nextDate)    33.333%
```

At rest: `translateX(-33.333%)` shows center panel. During drag: `offsetPercent` follows pointer in real-time (no transition). On release: CSS transition snaps to target panel over 300ms.

### `useCarousel` Hook

```typescript
interface UseCarouselOptions {
  onNavigate: (direction: 'prev' | 'next') => void;
  containerRef: RefObject<HTMLDivElement>;
  disabled?: boolean;  // true during dnd-kit drag-to-schedule
}

interface UseCarouselReturn {
  offsetPercent: number;     // drives translateX
  isDragging: boolean;       // suppress transition during drag
  isAnimating: boolean;      // snap animation in progress
  handlers: {                // bind to carousel container
    onPointerDown, onTouchStart, onTouchMove, onTouchEnd
  };
  resetToCenter: () => void; // call after navigation commit
  applyWheelDelta: (deltaX: number) => void; // for trackpad horizontal swipe
}
```

State machine: `idle → dragging → animating → idle`

- **Dragging**: `offsetPercent` follows input, no CSS transition
- **Animating**: `offsetPercent` snaps to -33.333/0/+33.333, CSS transition 300ms
- **transitionend**: if navigated, calls `onNavigate()`, which updates `calendarCenterDate`
- React re-renders with new dates → `useLayoutEffect` calls `resetToCenter()` (instant, no transition)

### Gesture Handling

**Desktop pointer drag** (mouse/pen):
- `pointerdown` on carousel → record start position
- `pointermove` on document → 8px dead zone, axis lock (vertical = abort), then `offsetPercent` follows `dx / containerWidth * 33.333`
- `pointerup` → if |dx| > 25% width: animate to target; else snap back
- Skip touch events, buttons, draggable elements

**Touch swipe**:
- `touchstart` → record start
- `touchmove` → axis lock after dead zone; if horizontal, `preventDefault()` + move carousel
- `touchend` → velocity + distance check → navigate or snap back
- Does NOT conflict with dnd-kit TouchSensor (250ms delay activation)

**Trackpad horizontal wheel**:
- Accumulate `deltaX` into carousel offset for visual feedback
- Debounce 200ms: if accumulated > 25% width → navigate, else snap back
- `Ctrl+wheel` zoom is handled first (unchanged)

**Button clicks** (prev/next/today):
- Call `setCalendarCenterDate` directly (no carousel animation)
- The `useLayoutEffect` reset keeps carousel centered

### DnD-Kit Droppable ID Conflict

With 3 DayColumns, each registering 3 droppable zones, IDs overlap. Fix:

1. **day-column.tsx**: Add `panelId` prop (`"prev" | "center" | "next"`), change droppable IDs to `calendar-${panelId}-${dateStr}`
2. **task-dnd-context.tsx**: The `startsWith("calendar-")` checks still work. Change date extraction (line 155) from `overId.replace("calendar-", "")` to `over.data.current?.dateStr` (already available in the `data` prop passed to `useDroppable`)

### Carousel Disabled During DnD

When a task is being dragged to schedule, the carousel must not respond to pointer movement. Track dnd state with `useDndMonitor` and pass `disabled: true` to the carousel hook.

## Implementation Steps

1. **Create `use-carousel.ts`** — pointer drag, touch, wheel, animation state, reset
2. **Update `day-column.tsx`** — add `panelId` prop, namespace droppable IDs
3. **Update `task-dnd-context.tsx`** — use `over.data.current.dateStr` for date extraction
4. **Refactor `calendar-panel.tsx`**:
   - Import and use `useCarousel`
   - Render 3 `<DayColumn>` panels in carousel track
   - Wire carousel handlers + feed wheel deltaX to hook
   - Remove: `useDrag` from @use-gesture, pointer-drag document listeners, swipe accumulator
   - Keep: Ctrl+wheel zoom, dnd-kit auto-scroll, scroll position save/restore
   - Add `useLayoutEffect` for post-navigation reset
   - Disable carousel during dnd drags

## Verification

1. `cd frontend && npx tsc --noEmit && npx biome check .` — type/lint checks
2. `cd frontend && npm run build` — production build succeeds
3. Manual testing:
   - Desktop: drag day column left/right → panels move in real-time → release navigates or snaps back
   - Desktop: trackpad two-finger horizontal swipe → visual feedback → navigate
   - Desktop: Ctrl+wheel → zoom still works
   - Mobile: touch swipe → visual feedback → navigate
   - Drag task to calendar → schedules correctly (no carousel interference)
   - Prev/Next buttons → instant navigation
   - Vertical scroll position preserved across navigation
   - Current time scroll-to-view on load
