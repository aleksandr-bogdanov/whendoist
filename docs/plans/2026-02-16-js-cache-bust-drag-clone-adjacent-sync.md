---
version:
pr: 289
created: 2026-02-16
---

# Fix: JS cache busting, drag offset clone, adjacent-day sync

## Context

Follow-up to v0.45.84 (PR #288). Manual testing revealed:
1. **Bugs 1 & 2 not working** — JS files lack cache-busting `?v=` params (CSS has them), so browsers serve stale `drag-drop.js` after deploy
2. **Drag offset still wrong** — `setDragImage(sameElement)` is unreliable across browsers; need clone-based approach
3. **Adjacent-day task disappears** — dropping a task into today's "next morning" area saves correctly but the task doesn't appear in tomorrow's main calendar until reload

---

## Fix 1: JS cache busting

**Files:** `app/templates/base.html`, `app/templates/dashboard.html`

Add `?v={{ app_version|default('') }}` to all `<script src="/static/js/...">` tags (our own JS, not vendor).

**base.html** (lines 107-116): toast.js, error-handler.js, shortcuts.js, crypto.js, passkey.js, device-detection.js, haptics.js, mobile-sheet.js, mobile-core.js

**dashboard.html** (lines 325-338): task-mutations.js, recurrence-picker.js, task-dialog.js, energy-selector.js, task-list-options.js, task-sort.js, task-complete.js, drag-drop.js, plan-tasks.js, mobile-tabs.js, sticky-domain.js, task-swipe.js, gesture-discovery.js

Also check `thoughts.html`, `analytics.html`, `settings.html` for any JS tags.

---

## Fix 2: Drag offset — clone approach

**File:** `static/js/drag-drop.js` — `handleDragStart()` (~line 762)

Replace current `setDragImage(draggedElement, ...)` with clone-based approach:

```js
const rect = draggedElement.getBoundingClientRect();
const offsetX = e.clientX - rect.left;
const offsetY = e.clientY - rect.top;
const dragClone = draggedElement.cloneNode(true);
dragClone.style.position = 'fixed';
dragClone.style.top = '0';
dragClone.style.left = '0';
dragClone.style.width = rect.width + 'px';
dragClone.style.zIndex = '-1';
dragClone.style.pointerEvents = 'none';
document.body.appendChild(dragClone);
e.dataTransfer.setDragImage(dragClone, offsetX, offsetY);
requestAnimationFrame(() => dragClone.remove());
```

The clone is off-screen (z-index -1), used only for the drag image capture, and removed on next frame.

---

## Fix 3: Adjacent-day sync

**File:** `static/js/drag-drop.js` — `handleDrop()` (~line 999)

After `slot.appendChild(element)`, check if the drop target is an adjacent-day row. If so, also clone the element into the corresponding main day's calendar:

```js
// Sync adjacent-day drop to the actual day's main calendar
if (hourRow?.classList.contains('adjacent-day')) {
    const actualDate = hourRow.dataset.actualDate;
    const mainDayCal = document.querySelector(`.day-calendar[data-day="${actualDate}"]`);
    if (mainDayCal) {
        const mainHourRow = mainDayCal.querySelector(
            `.hour-row[data-hour="${hour}"]:not(.adjacent-day)`
        );
        const mainSlot = mainHourRow?.querySelector('.hour-slot');
        if (mainSlot) {
            const clone = element.cloneNode(true);
            clone.addEventListener('dragstart', handleDragStart);
            clone.addEventListener('dragend', handleDragEnd);
            mainSlot.appendChild(clone);
            recalculateOverlaps(mainDayCal);
        }
    }
}
```

Also handle the reverse: when a task is dropped on a main calendar hour that also appears in an adjacent section of a neighboring day, sync to the adjacent section. Only needed for hours 0-5 (visible in previous day's "next morning") and 21-23 (visible in next day's "previous evening"):

```js
// Sync main drop to adjacent sections of neighboring calendars
if (!hourRow?.classList.contains('adjacent-day')) {
    if (hour >= 0 && hour <= 5) {
        // This hour appears in previous day's "next morning"
        const prevDate = /* day - 1 */;
        const prevDayCal = document.querySelector(`.day-calendar[data-day="${prevDate}"]`);
        if (prevDayCal) {
            const adjRow = prevDayCal.querySelector(
                `.hour-row.adjacent-day.next-day[data-hour="${hour}"][data-actual-date="${day}"]`
            );
            // clone into adjRow's slot
        }
    }
    if (hour >= 21 && hour <= 23) {
        // This hour appears in next day's "previous evening"
        // similar pattern
    }
}
```

This is more complex. **Simpler approach**: only sync adjacent→main (the common case). Reverse sync (main→adjacent) is rare and not worth the complexity.

---

## Verification

1. Deploy, hard refresh, verify drag-drop.js URL has `?v=` param
2. Bug 1: Drag recurring instance from timed → Anytime → verify skip button
3. Bug 2: Drag task by bottom edge → verify ghost follows grab point
4. Bug 3: Drop task in "next morning" area → scroll to tomorrow → verify it appears
5. `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
