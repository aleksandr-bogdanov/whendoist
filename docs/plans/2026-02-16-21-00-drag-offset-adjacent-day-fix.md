---
version:
pr:
created: 2026-02-16
---

# Fix: Drag offset clone reliability + adjacent-day duplication

## Context

v0.45.85 (PR #289) attempted to fix drag offset and add adjacent-day sync. Manual testing revealed:
1. **Drag offset still broken** — clone-based `setDragImage` fails silently: clone removed too early (`requestAnimationFrame`), height not set, CSS grid collapses outside its container context. Browser falls back to default drag image with wrong offset.
2. **Adjacent-day duplication** — rescheduling a task within adjacent-day area repeatedly creates new synced clones in the main calendar without removing previous ones. Undo callback also doesn't clean up synced clones.

---

## Fix 1: Drag offset clone reliability

**File:** `static/js/drag-drop.js` — `handleDragStart()` (lines 762-776)

Three changes to the clone:

1. **Set explicit height** — without it, the clone's grid layout collapses since CSS custom properties (`--col-clarity`, etc.) aren't defined on `<body>`
2. **Use `setTimeout(..., 0)` instead of `requestAnimationFrame`** — rAF fires before next paint, which is before some browsers finish capturing the drag image. `setTimeout(0)` defers to after the current event handler completes, giving the browser time to snapshot.
3. **Set `opacity: 0.99`** — ensures the clone is treated as visible for compositing. `z-index: -1` is fine for keeping it behind content, but some engines skip rendering of "invisible" layers.

```js
// Replace lines 762-776:
const rect = draggedElement.getBoundingClientRect();
const offsetX = e.clientX - rect.left;
const offsetY = e.clientY - rect.top;
const dragClone = draggedElement.cloneNode(true);
dragClone.style.position = 'fixed';
dragClone.style.top = '-1000px';       // off-screen (more reliable than z-index)
dragClone.style.left = '0';
dragClone.style.width = rect.width + 'px';
dragClone.style.height = rect.height + 'px';  // explicit height
dragClone.style.pointerEvents = 'none';
document.body.appendChild(dragClone);
e.dataTransfer.setDragImage(dragClone, offsetX, offsetY);
setTimeout(() => dragClone.remove(), 0);       // not rAF
```

Key insight: moving `top: -1000px` (off-screen) is more reliable than `z-index: -1` because the element is still rendered by the compositor but not visible to the user.

---

## Fix 2: Adjacent-day duplication

**File:** `static/js/drag-drop.js` — `handleDrop()`

### Problem
When rescheduling within adjacent-day area:
- Line 980: `draggedElement.remove()` removes the element from the adjacent area only
- Line 1043-1046: A new clone is appended to the main calendar
- **No code removes the previous clone** from the main calendar

### Solution
Before creating the adjacent-day sync clone, remove any existing `scheduled-task` for the same `taskId` from the target main calendar. This is a single cleanup line before the clone append.

**At line 1042** (before `mainSlot.appendChild(clone)`), add:
```js
// Remove any previous synced clone for this task in the main calendar
mainDayCal.querySelectorAll('.scheduled-task[data-task-id="' + taskId + '"]')
    .forEach(el => el.remove());
```

This handles all cases:
- First schedule: no existing elements, nothing removed
- Rescheduling within adjacent-day: removes previous clone
- Rescheduling from main to adjacent: removes the main calendar element (correct — the new clone replaces it)

### Undo callback cleanup
Both undo callbacks (lines 1087 and 1117) call `element.remove()` which only removes the element in the adjacent area. Add cleanup for the synced clone too.

After `element.remove()` in **both** undo callbacks, add:
```js
// Also remove synced clone from main calendar
document.querySelectorAll('.scheduled-task[data-task-id="' + taskId + '"]')
    .forEach(function(el) { if (el !== element) el.remove(); });
```

Wait — that's too aggressive. It would remove the task from ALL calendars. Better approach: only remove from the main calendar for the actual date.

Actually, the simplest correct approach: track whether we created a sync clone, and if so, remove it in undo. But that adds complexity.

**Simplest correct approach**: In undo, just remove all `scheduled-task[data-task-id="X"]` elements from the page, then re-add only at the restored position (for reschedule undo) or don't re-add (for fresh schedule undo). The API call handles the persistent state.

Let me refine:

**For the recurring instance undo** (line 1087):
```js
element.remove();
// Remove synced clone from main calendar if this was adjacent-day
document.querySelectorAll('.day-calendar:not([data-day="' + dayCalendar.dataset.day + '"]) .scheduled-task[data-task-id="' + taskId + '"]')
    .forEach(function(el) { el.remove(); });
recalculateOverlaps(dayCalendar);
```

**For the regular task undo** (line 1117):
```js
element.remove();
// Remove synced clone from main calendar if this was adjacent-day
document.querySelectorAll('.day-calendar:not([data-day="' + dayCalendar.dataset.day + '"]) .scheduled-task[data-task-id="' + taskId + '"]')
    .forEach(function(el) { el.remove(); });
recalculateOverlaps(dayCalendar);
```

Actually, even simpler — the undo should remove ALL copies of this task from the DOM (both adjacent and main), then restore only what's needed. Since `element.remove()` handles the drop target, we just need to also clean up any synced clone. The cleanest pattern:

**In undo callbacks, after `element.remove()`, add:**
```js
// Clean up any adjacent-day synced clone
var syncedClones = document.querySelectorAll('.scheduled-task[data-task-id="' + taskId + '"]');
syncedClones.forEach(function(el) { el.remove(); });
```

This removes ALL instances of the task. Then the restore logic (for reschedule undo) re-creates the element at the original position. For fresh-schedule undo, the task returns to the task list via `refreshTaskList()`. This is correct.

### Error callback cleanup (line 1134)
Same issue — `element.remove()` on line 1134 only removes the adjacent-area element. Add same cleanup after it.

---

## Files to modify

- `static/js/drag-drop.js` — all changes are in this single file

## Verification

1. Drag a task by its bottom edge — ghost should follow grab point
2. Drop task in "next morning" → move it to different time in "next morning" → switch to tomorrow → verify only 1 copy
3. Drop task in "next morning" → undo → verify task removed from both adjacent and main calendar
4. Drop task in "next morning" → switch to tomorrow → verify it appears
5. `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
