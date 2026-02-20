# Calendar Drag-and-Drop: dnd-kit in Nested Scroll Containers

Evergreen reference for drag-and-drop between the task list and the calendar carousel.
Documents the bugs found, failed approaches, and the patterns that work.

**Stack:** dnd-kit v6.3.1 + React, 5-panel scroll-snap carousel + vertical scroll.

---

## Architecture Overview

The calendar has nested scroll containers:

```
CalendarPanel
├── scrollRef          (overflow-y: auto — vertical time scroll)
│   └── carouselRef    (overflow-x: auto, scroll-snap — 5-panel carousel)
│       └── DayColumn  (44-hour timeline, positioned task cards)
└── overlayDropRef     (absolute inset-0, pointer-events-none, z-5)
```

The task panel is a sibling of the calendar:

```
TaskDndContext (DndContext wrapper)
├── TaskPanel (task list with draggable TaskItems)
└── CalendarPanel (calendar with draggable ScheduledTaskCards)
```

---

## Bug 1: Droppables Inside Scroll Containers Don't Work

### Problem

dnd-kit's `useDroppable` measures element rects via `getBoundingClientRect()` and wraps
them in a `Rect` class with getters that adjust for scroll changes in ancestor elements.
When a droppable sits inside **two** nested scroll containers (carouselRef + scrollRef),
the scroll-adjustment math breaks — `pointerWithin` collision detection never finds the
droppable even though the pointer is visually over it.

### Failed Approaches

1. **`getBoundingClientRect()` fallback loop** — manually measured every droppable rect
   in the collision detection function. Too slow, unreliable, and the coordinates still
   didn't match dnd-kit's internal tracking.

2. **`_realPointer` tracker** — installed a `pointermove` listener to capture the real
   pointer position for collision detection. The listener fired, but the real issue was
   in dnd-kit's droppable rect measurement, not the pointer coordinates.

### Solution: Overlay Droppable Outside Scroll Containers

Place a single large droppable (`calendar-overlay-${date}`) **outside** the scroll
containers as a sibling of `scrollRef`. Since it's not inside any nested scrollers,
dnd-kit measures its rect correctly.

```tsx
{/* CalendarPanel structure */}
<div className="relative flex-1 min-h-0">
  <div ref={scrollRef} className="absolute inset-0 overflow-y-auto">
    {/* carousel + DayColumns inside */}
  </div>
  {/* Drop overlay — OUTSIDE scroll containers */}
  <div ref={setOverlayDropRef} className="absolute inset-0 pointer-events-none z-[5]" />
</div>
```

The overlay droppable carries data for time calculation:

```tsx
useDroppable({
  id: `calendar-overlay-${displayDate}`,
  data: {
    type: "calendar-overlay",
    centerDate, prevDate, nextDate,
    boundaries: getSectionBoundaries(hourHeight),
    getScrollTop: () => scrollRef.current?.scrollTop ?? 0,
    getCalendarRect: () => scrollRef.current?.getBoundingClientRect() ?? null,
  },
});
```

The drop handler uses `getScrollTop()` + `getCalendarRect()` to compute the absolute
Y offset in the timeline, then determines which day section and time slot the pointer
is over.

**Key insight:** This mirrors the anytime section, which already worked because its
`useDroppable` was never inside the scroll containers.

---

## Bug 2: Duplicate Draggable IDs

### Problem

A scheduled task appears in **two** places simultaneously:

1. `ScheduledSection` → `TaskItem` with `useDraggable({ id: String(taskId) })`
2. Calendar → `ScheduledTaskCard` with `useDraggable({ id: String(taskId) })`

Same ID registered twice. dnd-kit picks the **wrong node** for `activeNodeRect`
measurement — e.g., uses the task panel's `TaskItem` (left side of screen) when the
user drags the calendar's `ScheduledTaskCard`. This causes:

- **DragOverlay appears at wrong position** (measured from task panel node)
- **Phantom card doesn't show** (collision detection confused)
- **Drop still works** (the drop handler uses pointer position, not node rect)

### Solution: Prefix Draggable IDs

Each draggable source gets a unique prefix:

| Component | ID Pattern | Data type |
|-----------|-----------|-----------|
| `TaskItem` | `"42"` | `{ type: "task" }` |
| `ScheduledTaskCard` | `"scheduled-task-42"` | `{ type: "scheduled-task" }` |
| `AnytimeTaskPill` | `"anytime-task-42"` | `{ type: "anytime-task" }` |

`parseTaskId()` strips any prefix to get the numeric ID for API calls.

---

## Bug 3: DragOverlay Position Drift in Scroll Containers

### Problem

`DragOverlay` renders with `position: fixed; top: initialRect.top; left: initialRect.left`
where `initialRect` is the active node's rect captured at drag start. The modifier receives
`activeNodeRect` which may differ from `initialRect` if the rect was re-measured.

For elements inside scroll containers, the overlay position can drift away from the pointer
as the user scrolls during the drag.

### Solution: Algebraic Cancellation

The modifier computes `currentPointerPosition - grabOffset - activeNodeRect`, and
`PositionedOverlay` adds `activeNodeRect` back. The drift cancels out:

```
visual.left = activeNodeRect.left + (currentPointerX - activeNodeRect.left - offsetX)
            = currentPointerX - offsetX   ← independent of activeNodeRect!
```

---

## Bug 4: DragOverlay Card Is Narrower Than the Original

### Problem

The `TaskDragOverlay` component is a compact card (`max-w-xs` = 320px). The original
draggable might be much wider (calendar cards span the full column, ~650px). If the
grab offset is captured in absolute pixels, the pointer ends up past the overlay's
right edge when dragging wide calendar cards.

### Failed Approach

`style={{ width: "auto", height: "auto" }}` on `<DragOverlay>` to make the wrapper
match the content size. This caused the overlay to **stop rendering entirely** for
calendar-to-calendar drags (likely a dnd-kit internal issue with auto-sized wrappers).

### Solution: Proportional Grab Offset via Content Ref

1. Capture the grab position as a **ratio** of the original card dimensions
2. Wrap `TaskDragOverlay` in a `<div ref={overlayContentRef}>`
3. In the modifier, read `overlayContentRef.current.offsetWidth` for the actual
   content width (not the wrapper width which matches the original card)
4. Apply the ratio to the content dimensions

```tsx
// Capture once (first modifier call)
grabRatio.x = (pointerX - cardLeft) / cardWidth;   // e.g., 0.5

// Apply each frame
offsetX = grabRatio.x * contentRef.offsetWidth;     // 0.5 * 250 = 125px
// Pointer stays at 50% of the visible overlay regardless of size difference
```

---

## Bug 5: Phantom Card Position Uses Wrong Coordinates

### Problem

DayColumn computed the pointer Y for the phantom card preview using:

```tsx
const pointerY = activatorEvent.clientY + event.delta.y;
const offsetY = pointerY - columnRef.getBoundingClientRect().top;
```

`event.delta` is `scrollAdjustedTranslate` from dnd-kit, which includes a scroll offset
correction. But `getBoundingClientRect().top` **already accounts for scroll** (it returns
viewport-relative coordinates). The scroll offset was counted twice, placing the phantom
card hours away from the actual pointer position.

### Solution: Track Real Pointer Position

Use a `pointermove` listener to track the actual pointer position, bypassing dnd-kit's
delta entirely:

```tsx
const lastPointerRef = useRef({ x: 0, y: 0 });
useEffect(() => {
  const handler = (e: PointerEvent) => {
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  };
  document.addEventListener("pointermove", handler);
  return () => document.removeEventListener("pointermove", handler);
}, []);

// In onDragMove:
const offsetY = lastPointerRef.current.y - columnRect.top;
```

This pattern is also used in `task-dnd-context.tsx` for the drop time calculation.

---

## Bug 6: `onDragOver` Only Fires on Target Change

### Problem

With a single large overlay droppable covering the entire calendar body, `onDragOver`
fires **once** when the pointer enters the zone — not on every move. The phantom card
appeared at a fixed position instead of following the cursor.

### Solution

Use `onDragMove` (fires on every pointer movement) instead of `onDragOver` for both
the phantom card position and the auto-scroll logic.

---

## Rules for Calendar DnD

1. **Never put `useDroppable` inside nested scroll containers** — place it as a sibling
2. **Always prefix draggable IDs** when a task can appear in multiple components
3. **Never use `event.delta` with `getBoundingClientRect()`** — the scroll adjustment
   double-counts. Use a `pointermove` listener instead.
4. **Never use `style={{ width/height: "auto" }}` on `<DragOverlay>`** — it can prevent
   rendering. Use a content ref to measure actual dimensions.
5. **Use `onDragMove` not `onDragOver`** when you need continuous position updates
   with a single large droppable zone.
6. **Use proportional (ratio-based) grab offsets** when the overlay is a different size
   than the original draggable element.
