---
version: v0.45.97
pr: 305
created: 2026-02-17
---

# Fix Adjacent-Day Mirror Edge Cases

## Context

The bidirectional adjacent-day calendar mirroring (prev evening 21-23h, next morning 00-05h)
was polished for drag-and-drop scheduling in v0.45.84–v0.45.93. However, several operations
were not updated to account for mirrored (synced clone) elements:

- **Unscheduling** (both drag-to-outside and quick-action button)
- **Scheduling undo** (reschedule case for regular tasks)
- **Delete/restore via context menu**
- **Task dialog edits**

This causes ghost cards, wrong undo dates, and missing mirror sync after restore/undo.

## Bugs Found (11 total)

### A. Ghost Cards — Missing Clone Cleanup

**Bug 1:** `handleDragEnd` unschedule (drag-drop.js:901) — `element.remove()` only removes
the dragged element, not synced clones in adjacent-day slots of other calendars.

**Bug 2:** `unscheduleTask` (task-complete.js:935) — `calendarCard.remove()` only removes
the clicked card, not synced clones.

**Bug 3:** `handleAnytimeDrop` (drag-drop.js:1588-1592) — only removes `draggedElement`,
not synced copies when moving a mirrored task to the Anytime banner.

### B. Wrong Date for Adjacent-Day Tasks

**Bug 4:** `unscheduleTask` (task-complete.js:914) — captures `origScheduledDate` from
`dayCalendar.dataset.day` (today's date), not the task's actual date. For a task at
yesterday-22:00 in today's "previous evening" mirror, undo restores to today-22:00.

**Bug 5:** `handleDrop` origDay capture (drag-drop.js:1071) — same issue. When rescheduling
FROM an adjacent-day slot, `origDay` is wrong. Undo restores instance to wrong date.

### C. Missing Adjacent-Day Sync on Restore/Create

**Bug 6:** `undoUnschedule` (task-complete.js:1056) — places restored card only in main
hour-row (`:not(.adjacent-day)`), doesn't sync to adjacent-day mirrors.

**Bug 7:** `updateCalendarItem` (task-mutations.js:645) — same issue. Task dialog edits
only update the main calendar, not adjacent mirrors.

**Bug 8:** Instance reschedule undo (drag-drop.js:1203) — restored card not synced to
adjacent calendars.

### D. Missing Undo

**Bug 9:** `handleDragEnd` unschedule (drag-drop.js:897-948) — no `Toast.undo()` call.
Drag-to-outside-calendar has no undo, unlike every other operation.

### E. Wrong API for Recurring Instances

**Bug 10:** `handleDragEnd` unschedule (drag-drop.js:904-912) — always calls
`PUT /api/v1/tasks/{id}` with `scheduled_date: null`. For recurring instances, should call
`POST /api/v1/instances/{id}/skip` instead.

### F. Undo Doesn't Restore Original Position

**Bug 11:** Regular task reschedule undo (drag-drop.js:1219-1233) — always fully unschedules
(`scheduled_date: null`) instead of restoring to original time/date. The instance undo
correctly handles this (checks `origDay && origStartMins`), but the regular task path doesn't.

## Implementation Plan

### Step 1: Add `scheduledDate` to dynamically created calendar cards

Server-rendered cards already have `data-scheduled-date` (dashboard.html:232), but
`createScheduledTaskElement` and `createDateOnlyTaskElement` don't set it. Add a
`scheduledDate` parameter to both functions.

**File:** `static/js/drag-drop.js`

- `createScheduledTaskElement` (line 1413): Add `scheduledDate` param, set `el.dataset.scheduledDate = scheduledDate`
- `createDateOnlyTaskElement` (line 1669): Same
- Update ALL callers to pass `scheduledDate` (≈6 call sites in drag-drop.js, task-complete.js, task-mutations.js)

### Step 2: Extract three utility functions in drag-drop.js

Extract the patterns already in `handleDrop` (lines 1129-1152) into reusable functions:

```javascript
/**
 * Get the actual scheduled date for a calendar card, handling adjacent-day rows.
 * Priority: element.dataset.scheduledDate > hourRow.actualDate > dayCalendar.day
 */
function getCardActualDate(cardEl) {
    return cardEl.dataset.scheduledDate
        || cardEl.closest('.hour-row')?.dataset.actualDate
        || cardEl.closest('.day-calendar')?.dataset.day
        || '';
}

/**
 * Remove all calendar cards for a task and recalculate overlaps.
 * Returns array of affected day-calendars.
 */
function removeAllCardsForTask(taskId) {
    var affected = [];
    document.querySelectorAll(
        '.scheduled-task[data-task-id="' + taskId + '"], .date-only-task[data-task-id="' + taskId + '"]'
    ).forEach(function(el) {
        var cal = el.closest('.day-calendar');
        el.remove();
        if (cal && affected.indexOf(cal) === -1) affected.push(cal);
    });
    affected.forEach(function(cal) { recalculateOverlaps(cal); });
    return affected;
}

/**
 * Clone a card into all other hour-rows (main or adjacent) showing the same date+hour.
 */
function syncCardToAdjacentCalendars(element, day, hour) {
    var hourRow = element.closest('.hour-row');
    document.querySelectorAll('.hour-row[data-hour="' + hour + '"]').forEach(function(hr) {
        if (hr === hourRow) return;
        var isAdj = hr.classList.contains('adjacent-day');
        var hrDate = isAdj ? hr.dataset.actualDate : hr.closest('.day-calendar')?.dataset.day;
        if (hrDate !== day) return;
        var hrSlot = hr.querySelector('.hour-slot');
        if (!hrSlot) return;
        var clone = element.cloneNode(true);
        clone.addEventListener('dragstart', handleDragStart);
        clone.addEventListener('dragend', handleDragEnd);
        hrSlot.appendChild(clone);
        recalculateOverlaps(hr.closest('.day-calendar'));
    });
}
```

Expose via `window.DragDrop`: `getCardActualDate`, `removeAllCardsForTask`, `syncCardToAdjacentCalendars`.

### Step 3: Fix `handleDragEnd` unschedule (Bugs 1, 9, 10)

**File:** `static/js/drag-drop.js`, `handleDragEnd` function (line 878)

Current code at line 897-948 needs these fixes:

1. **Clone cleanup (Bug 1):** Replace `element.remove()` with `removeAllCardsForTask(taskId)`
2. **Recurring instance handling (Bug 10):** Check `element.dataset.instanceId`. If present,
   call `POST /api/v1/instances/{id}/skip` instead of `PUT /api/v1/tasks/{id}`
3. **Add undo toast (Bug 9):** Capture original state before removing. Show `Toast.undo()`
   that re-schedules (regular task) or un-skips (instance — call instance schedule API)

### Step 4: Fix `origDay` capture in `handleDrop` (Bug 5)

**File:** `static/js/drag-drop.js`, `handleDrop` function (line 1064-1076)

Replace:
```javascript
origDay = origDayCalendar?.dataset.day || '';
```
With:
```javascript
origDay = getCardActualDate(draggedElement);
```

Also, fix `origSlot` lookup to handle adjacent-day rows. Currently it searches
`:not(.adjacent-day)` which is wrong for tasks in adjacent-day slots. Should find the
slot matching the actual hour-row the element was in.

### Step 5: Fix regular task reschedule undo (Bug 11)

**File:** `static/js/drag-drop.js`, undo callback (line 1219-1233)

Add `origDay && origStartMins` check (same pattern as instance undo at line 1193):

```javascript
: function() {
    element.remove();
    removeAllCardsForTask(taskId);
    recalculateOverlaps(dayCalendar);
    if (origDay && origStartMins) {
        // Was rescheduled — restore to original position
        var sm = parseInt(origStartMins, 10);
        var oh = Math.floor(sm / 60);
        var om = sm % 60;
        var origTime = String(oh).padStart(2,'0') + ':' + String(om).padStart(2,'0') + ':00';
        var restoredCard = createScheduledTaskElement(
            taskId, content, duration, oh, om, impact, completed, '', '', origDay
        );
        if (origSlot) {
            origSlot.appendChild(restoredCard);
            syncCardToAdjacentCalendars(restoredCard, origDay, oh);
            recalculateOverlaps(origDayCalendar);
        }
        safeFetch('/api/v1/tasks/' + taskId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scheduled_date: origDay,
                scheduled_time: origTime,
                duration_minutes: draggedDuration,
            }),
        });
    } else {
        // Was freshly scheduled — unschedule
        safeFetch('/api/v1/tasks/' + taskId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scheduled_date: null, scheduled_time: null }),
        }).then(function() {
            if (window.TaskComplete && typeof TaskComplete.refreshTaskList === 'function') {
                TaskComplete.refreshTaskList();
            }
        });
    }
};
```

### Step 6: Fix instance reschedule undo adjacent sync (Bug 8)

**File:** `static/js/drag-drop.js`, instance undo callback (line 1199-1211)

After `origSlot.appendChild(restoredCard)`, add:
```javascript
syncCardToAdjacentCalendars(restoredCard, origDay, oh);
```

### Step 7: Fix `handleAnytimeDrop` clone cleanup (Bug 3)

**File:** `static/js/drag-drop.js`, `handleAnytimeDrop` (line 1588-1592)

Replace the manual `draggedElement.remove()` + single calendar recalculate with
`removeAllCardsForTask(taskId)`.

### Step 8: Fix `unscheduleTask` in task-complete.js (Bugs 2, 4)

**File:** `static/js/task-complete.js`, `unscheduleTask` function (line 883)

1. **Wrong date (Bug 4):** Replace line 914:
   ```javascript
   origScheduledDate = dayCalendar?.dataset.day || '';
   ```
   With:
   ```javascript
   origScheduledDate = DragDrop.getCardActualDate(calendarCard);
   ```

2. **Clone cleanup (Bug 2):** Replace line 935 `calendarCard.remove()` with:
   ```javascript
   DragDrop.removeAllCardsForTask(taskId);
   ```
   (This also handles overlap recalculation.)

### Step 9: Fix `undoUnschedule` adjacent sync (Bug 6)

**File:** `static/js/task-complete.js`, `undoUnschedule` function (line 1033)

After placing the new card (line 1059), add adjacent-day sync:
```javascript
if (slot) {
    slot.appendChild(newCard);
    DragDrop.syncCardToAdjacentCalendars(newCard, info.scheduledDate, info.hour);
}
```

### Step 10: Fix `updateCalendarItem` adjacent sync (Bug 7)

**File:** `static/js/task-mutations.js`, `updateCalendarItem` function (line 590)

After placing the new card (line 649), add adjacent-day sync:
```javascript
slot.appendChild(newCard);
DragDrop.syncCardToAdjacentCalendars(newCard, taskData.scheduled_date, hour);
```

Note: `removeAllCalendarCards` is already handled at line 592-600 via
`querySelectorAll('.scheduled-task[data-task-id="..."]').forEach(el.remove())`, but it
should also use the new utility for consistent overlap recalculation. Replace lines 592-611
with `DragDrop.removeAllCardsForTask(taskId)`.

### Step 11: Use `handleDrop`'s existing sync code via the new utility

**File:** `static/js/drag-drop.js`, `handleDrop` (lines 1129-1152)

Replace the inline sync logic with calls to the new utilities:
```javascript
removeAllCardsForTask(taskId);  // replaces lines 1132-1138
// Re-add the just-placed element (it was removed by removeAllCards)
slot.appendChild(element);
syncCardToAdjacentCalendars(element, day, hour);  // replaces lines 1140-1152
```

Wait — `removeAllCardsForTask` would also remove `element`. Need to handle this carefully.
Better approach: keep the element reference, call removeAllCardsForTask, then re-append
element + sync. Or: use the utility only for OTHER copies and keep the current element.

Refined approach for handleDrop:
```javascript
// 1. Remove stale copies (excluding the just-created element)
document.querySelectorAll('.scheduled-task[data-task-id="' + taskId + '"]').forEach(function(el) {
    if (el !== element) {
        var cal = el.closest('.day-calendar');
        el.remove();
        if (cal) recalculateOverlaps(cal);
    }
});
// 2. Sync to adjacent calendars
syncCardToAdjacentCalendars(element, day, hour);
```

This is essentially what exists now, just using the sync utility for step 2. Keep step 1
inline since it needs the `el !== element` guard. Only replace step 2.

## Files Modified

1. `static/js/drag-drop.js` — utility functions, handleDragEnd, handleDrop, handleAnytimeDrop, undo callbacks, createScheduledTaskElement, createDateOnlyTaskElement
2. `static/js/task-complete.js` — unscheduleTask, undoUnschedule
3. `static/js/task-mutations.js` — updateCalendarItem

## Verification

1. Run `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
2. Manual test matrix (in browser):
   - Schedule task at 22:00 today → verify mirror in tomorrow's prev-evening
   - Unschedule via quick-action button on the MIRROR copy → verify both copies removed, undo restores both
   - Drag mirror copy outside calendar → verify both copies removed, undo toast appears, undo restores both
   - Drag task from 22:00 to 14:00 → undo → verify restores to 22:00 (not fully unschedules)
   - Drag recurring instance from adjacent-day → verify skip API called (not task update)
   - Edit task time via dialog → verify adjacent mirror updates
   - Delete task via context menu → verify all mirror copies removed → undo restores all
   - Drag mirrored task to Anytime banner → verify all timed copies removed
3. Verify `test_js_module_contract.py` passes (new DragDrop exports)
