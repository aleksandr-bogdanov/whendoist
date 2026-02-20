# In-Place Task Mutations (No More Page Reloads)

**Version:** v0.45.21
**Date:** 2026-02-12

## Problem

When editing a task (e.g. changing duration) and saving, the page fully reloaded and the task ended up at a new sorted position — losing scroll context. The save was already AJAX (`PUT /api/v1/tasks/{id}`) returning full task JSON, but the response was discarded and `window.location.reload()` fired. Same issue with task completion (re-fetched entire task list via HTMX) and drag-drop unschedule fallback.

## Solution

Eliminated all page reloads and full-list re-fetches after single-task operations. Instead: patch the one task element in the DOM, re-sort, scroll to it, highlight it.

## Architecture

### New Module: `static/js/task-mutations.js`

Central IIFE module exposed as `window.TaskMutations` with five public functions:

| Function | Purpose |
|---|---|
| `updateTaskInPlace(taskId, taskData)` | Patches DOM after edit — updates data attrs, text, classes, handles domain/schedule moves |
| `insertNewTask(taskId)` | Fetches `GET /api/v1/task-item/{id}` HTML, inserts into correct domain group, decrypts, inits drag |
| `moveTaskToCompleted(taskEl)` | Moves element to `#section-done`, updates counts |
| `moveTaskToActive(taskEl, domainId)` | Moves element back to domain group, updates counts |
| `scrollToAndHighlight(taskEl)` | Smooth scroll + `.just-updated` CSS pulse animation |

### New Endpoint: `GET /api/v1/task-item/{task_id}`

Returns server-rendered HTML fragment for one task (reuses `render_task_item` macro from `_task_list.html`). Includes recurrence info, subtask count, and encryption context.

### Modified Files

- **task-dialog.js** — `handleSubmit()` uses `updateTaskInPlace`/`insertNewTask` instead of reload
- **task-complete.js** — Completion uses `moveTaskToCompleted`/`moveTaskToActive` instead of `refreshTaskListFromServer()`; delete stops calling refresh; skip fetches updated task data; unschedule fallback uses `insertNewTask`
- **drag-drop.js** — Unschedule fallback uses `insertNewTask` instead of reload; new `initSingleTask()` export
- **dashboard.css** — `.just-updated` keyframe animation
- **`_task_list.html`** — Added `data-domain-id` attribute to task items

### Edge Cases

- Domain change: detected via `data-domain-id` comparison, task moved between groups
- Schedule/unschedule: uses existing `moveTaskToScheduledSection`/`moveTaskToUnscheduledSection` from drag-drop
- Task not in DOM: returns null, no crash
- Encryption: decrypts title after insert/patch
- Missing domain group: falls back to `refreshTaskListFromServer()`

## Fallback Strategy

All mutations fall back to either `refreshTaskListFromServer()` or `window.location.reload()` if `TaskMutations` is not available or an operation fails. This ensures robustness even if the new module fails to load.
