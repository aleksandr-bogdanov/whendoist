---
status: in_progress
version: v0.45.75
pr: null
created: 2026-02-16
---

# Fix: Skip recurring instance bugs (calendar + task list)

## Context

When right-clicking a recurring daily task in the calendar and choosing "Skip this one", two bugs occur:

1. **Task list doesn't advance to next occurrence** — The task-item in the scheduled task list gets crossed out for today instead of immediately showing tomorrow's date. Only after a full page refresh does it display correctly.
2. **Calendar still shows skipped instance after refresh** — The backend returns skipped instances to the calendar template, and the template renders them without any skipped styling, so the task appears as a normal pending task on today's calendar.

## Root Causes

### Bug 1: Task list stays crossed out
In `static/js/task-complete.js:748-764`, after skipping, the code fetches fresh task data from the JSON API (`GET /api/v1/tasks/{taskId}`) and calls `TaskMutations.updateTaskInPlace()`. However, `patchTaskElement()` only updates fields from the JSON response — which does NOT include `next_occurrence` or `next_instance_id` (those come from server-side rendering via `build_native_task_item()`). So the task-item's date label never updates.

### Bug 2: Skipped instance renders on calendar after refresh
In `app/routers/pages.py:258`, `get_instances_for_range()` is called with `status=None`, fetching ALL instances including skipped ones. The filter on lines 260-263 only removes completed instances outside the retention window. Skipped instances pass through and render in the template without any `.skipped` CSS class (the template only checks for `status == 'completed'`).

## Fix

### 1. Backend: Filter skipped instances from calendar (`app/routers/pages.py`)

Add a filter to exclude skipped instances from calendar rendering, right after the completed-retention check (line 263):

```python
# After: if is_completed and not TaskService.is_within_retention_window(...): continue
if instance.status == "skipped":
    continue
```

### 2. Frontend: Fetch server-rendered HTML instead of JSON (`static/js/task-complete.js`)

Replace lines 748-764 in `skipInstance()`. Instead of fetching `/api/v1/tasks/{taskId}` (JSON) and patching, fetch `/api/v1/task-item/{taskId}` (server-rendered HTML) and replace the element entirely. This gives us the correct `next_occurrence` date and `next_instance_id`.

```javascript
if (taskEl.classList.contains('task-item')) {
    var taskId = taskEl.dataset.taskId;
    setTimeout(function() {
        taskEl.classList.add('departing');
        setTimeout(async function() {
            try {
                var resp = await safeFetch('/api/v1/task-item/' + taskId);
                var html = await resp.text();
                var temp = document.createElement('div');
                temp.innerHTML = html.trim();
                var newEl = temp.querySelector('.task-item');
                if (newEl) {
                    taskEl.replaceWith(newEl);
                    if (window.DragDrop && typeof DragDrop.initSingleTask === 'function') {
                        DragDrop.initSingleTask(newEl);
                    }
                    if (window.TaskSort && typeof TaskSort.applySort === 'function') {
                        TaskSort.applySort();
                    }
                }
            } catch (e) {
                refreshTaskListFromServer();
            }
        }, 350);
    }, 250);
}
```

### 3. Frontend: Remove skipped calendar card after animation (`static/js/task-complete.js`)

After the cross-out animation, remove the calendar-item from the DOM so it doesn't linger:

```javascript
// After syncing across representations, remove calendar cards
document.querySelectorAll('.calendar-item[data-instance-id="' + instanceId + '"]').forEach(function(el) {
    setTimeout(function() {
        el.classList.add('departing');
        setTimeout(function() { el.remove(); }, 350);
    }, 600);
});
```

## Files to Modify

1. **`app/routers/pages.py`** (~line 263) — Add `if instance.status == "skipped": continue`
2. **`static/js/task-complete.js`** (~lines 748-764) — Replace JSON fetch with HTML partial fetch; add calendar card removal

## Verification

1. Create a recurring daily task scheduled at a specific time
2. Right-click the task on today's calendar → "Skip this one"
3. Verify: calendar card crosses out briefly then disappears
4. Verify: task-list item animates to show tomorrow's date immediately
5. Refresh the page
6. Verify: today's calendar does NOT show the skipped task
7. Verify: task list shows the task scheduled for tomorrow
8. Run: `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
