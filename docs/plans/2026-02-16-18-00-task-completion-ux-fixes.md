---
version: v0.45.81
pr: 283
created: 2026-02-16
---

# Fix task completion UX, context menu, toast durations, and calendar sync

## Context

Four related frontend UX issues affecting task completion workflow:

1. Completing a scheduled task (from calendar or list) only shows a checkbox animation — the task-item doesn't move to the Completed section until page reload
2. Right-click context menu has no "Complete task" / "Reopen task" options
3. Toast notification timeouts are too short (especially undo — 5s is not enough)
4. Changing duration of a completed task removes it from the calendar until reload

## Files to modify

| File | Changes |
|------|---------|
| `static/js/task-complete.js` | Issues 1 & 2 |
| `static/js/toast.js` | Issue 3 |
| `static/js/task-mutations.js` | Issue 4 |

No test contract changes needed (`tests/test_js_module_contract.py` checks export names, not values).

---

## Issue 1: Task completion doesn't move card to Completed section

**Root cause**: In `task-complete.js:207`, the move logic only fires when the clicked element is a `.task-item`:
```javascript
if (taskEl.classList.contains('task-item') && window.TaskMutations) { ... }
```
When completing from a **calendar card** (`.scheduled-task`), the corresponding `.task-item` gets a visual update via `syncTaskCompletionState()` but never moves.

Secondary issue: `pendingCompletionTimeout` is a single module variable — rapid completions overwrite each other.

**Fix**:

1. Convert `pendingCompletionTimeout` / `pendingRefreshTimeout` (line 21-22) from single vars to `Map<taskId, timeoutId>`
2. Extract move logic into `scheduleTaskMove(taskItemEl, completed, taskId, ...)` helper
3. Add `cancelPendingMove(taskId)` helper for undo and re-completion
4. In `toggleCompletion()` after the sync call, resolve the `.task-item` element (either the clicked element or found by `data-task-id` selector) and call `scheduleTaskMove` on it
5. Update undo callback to use `cancelPendingMove(taskId)` and find the task-item regardless of completion source

## Issue 2: Context menu missing Complete/Reopen

**Root cause**: `showActionsMenu()` (line 496) only has Skip, Unschedule, Edit, Delete.

**Fix**:

1. Add `isCompleted: taskEl.dataset.completed === '1'` to `buildMenuOpts()` (line 416)
2. Add Complete/Reopen menu item in `showActionsMenu()` before the Edit option:
   - Icon: `✅` for complete, `↩️` for reopen
   - Label: "Complete task" / "Reopen task" (for recurring: "Complete this one" / "Reopen this one")
   - Action: calls existing `toggleCompletion(taskEl, opts.taskId, opts.instanceId, !opts.isCompleted, opts.isRecurring)`

## Issue 3: Toast timeouts too short

**Root cause**: Durations in `toast.js:36-44` are short (undo = 5s).

**Fix** — update constants:

| Type | Default (old → new) | With Action (old → new) |
|------|---------------------|-------------------------|
| success | 3000 → 4000 | 5000 → 8000 |
| info | 4000 → 5000 | 8000 → 10000 |
| warning | 5000 → 6000 | 8000 → 10000 |
| error | 6000 → 8000 | null (persistent) |
| **UNDO_DURATION** | **5000 → 10000** | |

## Issue 4: Completed task disappears from calendar on duration edit

**Root cause**: `updateCalendarItem()` in `task-mutations.js:626` skips card creation for completed tasks:
```javascript
taskData.status !== 'completed' && taskData.status !== 'archived'
```
But the server (`pages.py:222`) includes completed tasks within the retention window.

**Fix**: Remove `status !== 'completed'` from the condition (keep `!== 'archived'`). The `completed` data attribute is already passed to the new card (line 645), applying correct dimmed styling.

Note: `moveTaskToCompleted()` still removes calendar cards during the completion flow — that's intentional UX feedback for the completion action itself. This fix only addresses the **edit** path.

---

## Implementation order

1. Toast durations (simplest, zero risk)
2. Calendar completed task fix (one-line condition change)
3. Context menu Complete/Reopen (self-contained addition)
4. Completion move from calendar (most complex — refactors timeout tracking)

## Verification

1. `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
2. Manual testing:
   - Schedule a task, complete it from calendar card → verify task-item moves to Completed section
   - Right-click a pending task → verify "Complete task" appears and works
   - Right-click a completed task → verify "Reopen task" appears and works
   - Complete a task → verify undo toast stays visible ~10s
   - Edit a completed task's duration → verify calendar card persists
