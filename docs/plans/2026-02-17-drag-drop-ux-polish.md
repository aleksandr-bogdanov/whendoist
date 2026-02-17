---
version: v0.45.93
pr:
created: 2026-02-17
---

# Drag-and-Drop UX Polish

## Context

The drag-and-drop mechanics work correctly (grab offset, 15-min snap, optimistic drop with undo), but the visual experience is rough:
- Native browser ghost looks different across browsers and can't be styled
- Two overlapping purple indicators (drop-indicator + drag-highlight-overlay) create visual noise
- Trash bin uses an emoji that's barely recognizable
- No auto-scroll when dragging near edges
- No cross-day navigation during drag

This PR polishes all of these in one pass.

## Files to Modify

| File | Changes |
|------|---------|
| `static/js/drag-drop.js` | All 6 features |
| `static/css/components/drag-drop.css` | Phantom card, trash redesign, dark mode |
| `static/css/app.css` | Dark mode `--ghost-bg`/`--ghost-border` |

## Features

### 1. Custom Drag Overlay (replace native ghost)

Stay on HTML5 drag API. Suppress native ghost, render custom overlay.

**In `handleDragStart`:**
- `e.dataTransfer.setDragImage(1x1 transparent canvas, 0, 0)` — kills native ghost
- Create `div.drag-overlay` (fixed position, z-index 9999, pointer-events none)
- Clone source element, strip metadata columns, constrain width to `min(rect.width, 280)px`
- Position at `(clientX - grabOffsetX, clientY - grabOffsetY)`

**Document-level `drag` listener (in `init()`):**
- Move overlay to cursor-minus-offset on each frame
- Guard `clientX === 0` (browser quirk on final drag event)
- Toggle `body.over-calendar` when cursor is within calendar panel bounds

**In `handleDragEnd`:** Remove overlay, remove `body.over-calendar`.

Existing CSS: `.drag-overlay` rules (drag-drop.css lines 308-355) already handle compact styling and `body.over-calendar` morphing. Change `max-width` from 420px to 280px.

### 2. Merge Drop Indicator + Duration Highlight → Phantom Card

**Remove entirely:** `dragHighlightOverlay` state, `highlightDurationSlots()`, `removeDragHighlight()`, `.drag-highlight-overlay` CSS.

**Enhance `updateDropIndicator()`:**
- Set `className = 'drop-indicator impact-' + impact` (enables impact rail via `::before`)
- Show task title (dimmed) + time inside: `<span class="phantom-time">HH:MM</span><span class="phantom-title">Task name</span>`
- Match `.scheduled-task` appearance: 6px radius, `var(--rail-w)` left padding, dashed border

**CSS rewrite of `.drop-indicator`:**
- `border: 1px dashed var(--ghost-border)` (dashed = universal placeholder pattern)
- `border-radius: 6px` (matches scheduled-task, not 10px)
- `transition: top 80ms ease-out` (Feature 5 snap animation — free with this rewrite)
- Impact rail via `::before` pseudo-element (same pattern as `.scheduled-task::before`)
- Remove duplicate `.drop-indicator` rule block (lines 34-52)

### 3. Auto-scroll `.hour-grid` During Drag

New state: `autoScrollRAF`, `autoScrollGrid`, `autoScrollSpeed`.

**`updateAutoScroll(e)` called from `handleDragOver`:**
- Get `.hour-grid` from `e.target.closest('.hour-grid')`
- If cursor within 60px of grid top → scroll up (speed = `-(60-dist)/60 * 8` px/frame)
- If cursor within 60px of grid bottom → scroll down
- Otherwise speed = 0
- When speed != 0 and no rAF running → start `requestAnimationFrame(autoScrollLoop)`

**`stopAutoScroll()` called from `handleDragEnd` and `handleDrop`.**

### 4. Cross-day Horizontal Carousel Scroll During Drag

New state: `crossDayTimer`, `crossDayEdge`.

**`updateCrossDayScroll(e)` called from document-level `drag` handler** (same as Feature 1):
- If cursor within 60px of calendar panel left/right edge → set edge
- On edge change: clear old timer, start 500ms timeout
- On timeout: call `window.navigateToDay(getTargetDayIndex() ± 1)`, reset state
- If cursor leaves edge zone: clear timer

**`clearCrossDayTimer()` called from `handleDragEnd` and `handleDrop`.**

Uses existing `window.navigateToDay` and `window.getTargetDayIndex` from dashboard.html.

### 5. Snap Animation

Handled entirely by `transition: top 80ms ease-out` on `.drop-indicator` (part of Feature 2 CSS). Re-parenting between slots naturally resets the transition — only within-slot `top` changes animate.

### 6. Redesign Trash Bin

**JS:** Replace emoji with SVG:
```
'<svg class="trash-icon" width="20" height="20"><use href="/static/img/icons/ui-icons.svg#trash"/></svg>'
```

**CSS changes:**
- `.trash-icon`: Remove `font-size`, add `stroke: currentColor` for SVG
- `.trash-label`: Remove `display: none` — always visible
- `.trash-bin`: Subtle red tint default: `background: rgba(239, 68, 68, 0.04); border-color: rgba(239, 68, 68, 0.12)`
- `.trash-bin.drag-over .trash-label`: Remove `display: inline` (no longer needed), keep `font-weight: 700`

### 7. Dark Mode

**In `app.css`:** Add ghost token overrides (higher opacity for dark backgrounds):
```css
[data-theme="dark"] .drop-indicator { ... }  /* or override --ghost-bg/--ghost-border */
```

**In `drag-drop.css`:** Dark mode for `.phantom-time`, `.phantom-title`, `.trash-bin`.

## Implementation Order

1. Trash bin redesign (self-contained)
2. Phantom card (merge indicator + highlight, add impact rail, dashed border)
3. Custom drag overlay (setDragImage canvas, overlay clone, document drag handler)
4. Auto-scroll (rAF loop on hour-grid edges)
5. Cross-day scroll (timer on calendar panel edges, uses navigateToDay)
6. Dark mode pass
7. Run full checks

## Verification

1. Drag task from list to calendar → custom overlay follows grab point, phantom card at target
2. Phantom card shows task name + time, impact rail, dashed border, animates between snap positions
3. Drag near top/bottom of hour-grid → auto-scrolls vertically
4. Drag near left/right edge of calendar panel → navigates to prev/next day after 500ms
5. Drop on slot → schedules correctly (regression test)
6. Drag to trash → SVG icon with "Delete" label, red highlight on hover, delete + undo works
7. Dark mode → all indicators render correctly
8. `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
