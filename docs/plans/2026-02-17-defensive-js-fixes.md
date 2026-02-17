---
version:
pr:
created: 2026-02-17
---

# Defensive JS Fixes — Race Conditions & Null Guards

## Context
Code review of the v0.45.97 adjacent-day mirror changes found several race conditions
and missing null guards across drag-drop.js and task-complete.js. These are latent bugs
that can cause visual glitches or crashes under specific timing/DOM conditions.

## Bugs to Fix

### 1. Trash delete undo race (drag-drop.js) — HIGH
**Problem:** `handleTrashDrop` sets a 350ms `setTimeout` to remove elements from DOM.
If user clicks "Undo" before 350ms, `restoreTrashDelete` runs but then the pending
timeout fires and removes the just-restored elements.

**Fix:** Store the timeout ID. Clear it in both the undo callback and the error handler.

### 2. Completion undo timeout clobbering (task-complete.js) — MEDIUM
**Problem:** Module-level `pendingCompletionTimeout` / `pendingRefreshTimeout` variables
mean only the last completion's undo works. Completing Task A then Task B within 600ms
overwrites A's timeout IDs — undoing A cancels B's timeouts instead.

**Fix:** Replace with objects keyed by taskId: `pendingCompletionTimeouts[taskId]`.

### 3. `tasksContainer` null in handleAnytimeDrop (drag-drop.js) — MEDIUM
**Problem:** `banner.querySelector('.date-only-tasks')` can return null, then
`.appendChild()` throws.

**Fix:** Add null guard with early return.

### 4. `recalculateOverlaps` null arg in syncCardToAdjacentCalendars (drag-drop.js) — MEDIUM
**Problem:** `hr.closest('.day-calendar')` can return null, passed to
`recalculateOverlaps` which calls `.querySelectorAll()` on it — crash.

**Fix:** Guard with `var cal = hr.closest('.day-calendar'); if (cal) recalculateOverlaps(cal);`

### 5. skipInstance missing overlap recalc (task-complete.js) — LOW
**Problem:** After removing skipped calendar cards, `recalculateOverlaps` is not called
on the affected day-calendars, leaving stale overlap positioning.

**Fix:** Track affected day-calendars before removal, recalculate after.

### 6. JSDoc mismatch (drag-drop.js) — LOW
**Problem:** JSDoc for `createScheduledTaskElement` says 6th param is `clarity` but
it's actually `impact`. Also missing `completed` and `scheduledDate` params.

**Fix:** Update JSDoc to match actual signature.

## NOT bugs (verified)
- **skipInstance not removing mirrors:** `cloneNode(true)` copies `data-instance-id`,
  so the selector `.calendar-item[data-instance-id="..."]` finds all copies including mirrors.
- **Dead code `scheduledTasks`:** Guarded by `typeof`, harmless. Leave as-is.

## Files to Modify
- `static/js/drag-drop.js` — Bugs 1, 3, 4, 6
- `static/js/task-complete.js` — Bugs 2, 5

## Verification
```bash
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
```
