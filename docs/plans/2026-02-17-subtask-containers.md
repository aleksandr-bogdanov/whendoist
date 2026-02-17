---
version:
pr: "PR1: #308 (v0.46.0), PR4: #309 (v0.46.1), PR2: #310 (v0.46.2), PR3: #311 (v0.46.3), PR5: #312 (v0.46.4)"
created: 2026-02-17
---

# Subtask Containers — Implementation Plan

Implement the three-level hierarchy described in `docs/SUBTASKS.md`:
**Domain → Parent (container) → Task (actionable work)**.

Five PRs, each independently shippable. Earlier PRs are prerequisites for later ones.

---

## PR 1: Backend Constraints & Data Integrity

**Goal:** Prevent invalid hierarchies before adding UI for creating them.

### 1a. Depth-1 validation in TaskService

**File:** `app/services/task_service.py`

In `create_task()` (after line 246), add:
```python
if parent_id:
    parent = await self.get_task(parent_id)
    if parent:
        # Depth-1: parent must itself be top-level
        if parent.parent_id is not None:
            raise ValueError("Subtasks cannot have subtasks")
        # Mutual exclusion: parent must not be recurring
        if parent.is_recurring:
            raise ValueError("Recurring tasks cannot have subtasks")
        domain_id = parent.domain_id
    else:
        parent_id = None  # unowned parent, ignore silently
```

In `update_task()` (around line 325), add guards:
- If setting `is_recurring=True`, verify task has no children
  (`select(func.count()).where(Task.parent_id == task_id)`)
- If task has `parent_id` (is a subtask), block setting `is_recurring=True`

### 1b. Pydantic-level validation

**File:** `app/routers/tasks.py`

No changes to pydantic models — the service layer handles validation and returns
appropriate HTTP errors. Add error handling in the route handler to catch
`ValueError` from service and return 422.

### 1c. Todoist import flattening

**File:** `app/services/todoist_import.py`

Current code preserves all nesting levels. We need to flatten to depth-1.

In `_import_tasks()` (around line 238):
1. First pass: identify which Todoist tasks are top-level parents
   (have children but no parent themselves).
2. Build a `root_parent_map: dict[str, str]` that maps every Todoist task ID
   to its root ancestor ID. Walk the parent chain for each task.
3. During import: if a task's parent is NOT a root ancestor (i.e., it's a grandchild),
   remap its `parent_id` to the root ancestor instead.

```python
# Build root ancestor map
def find_root(tid, parent_map):
    """Walk up to find the top-level ancestor."""
    visited = set()
    current = tid
    while parent_map.get(current) is not None:
        if current in visited:
            break  # cycle guard
        visited.add(current)
        current = parent_map[current]
    return current

todoist_parent_map = {t.id: t.parent_id for t in tasks if t.parent_id}
root_map = {tid: find_root(tid, todoist_parent_map) for tid in todoist_parent_map}
```

Then when mapping parent IDs (line 256-260):
```python
if task.parent_id:
    root_todoist_id = root_map.get(task.id, task.parent_id)
    local_parent_id = task_id_map.get(root_todoist_id)
```

Also strip recurrence from tasks that have children:
```python
tasks_with_children = {t.parent_id for t in tasks if t.parent_id}
if task.id in tasks_with_children:
    is_recurring = False
    recurrence_rule = None
```

Apply same logic to `_import_completed_tasks()`.

### 1d. Data migration for existing deep nesting

**File:** new alembic migration

Check if any existing tasks violate depth-1 (task where parent_id points to
a task that also has parent_id). If found, flatten them to the root ancestor.

```python
# In migration upgrade():
# Find tasks whose parent is also a subtask
op.execute("""
    UPDATE tasks t
    SET parent_id = grandparent.parent_id
    FROM tasks parent_task
    JOIN tasks grandparent ON parent_task.parent_id = grandparent.id
    WHERE t.parent_id = parent_task.id
      AND parent_task.parent_id IS NOT NULL
      AND grandparent.parent_id IS NULL
""")
# Repeat until no more grandchildren exist (handle 3+ levels)
```

Also strip recurrence from tasks that have children:
```python
op.execute("""
    UPDATE tasks SET is_recurring = false, recurrence_rule = NULL
    WHERE id IN (
        SELECT DISTINCT parent_id FROM tasks WHERE parent_id IS NOT NULL
    )
    AND is_recurring = true
""")
```

### 1e. Tests

**File:** `tests/test_task_service.py`

- `test_create_subtask_of_subtask_raises` — depth-1 enforcement
- `test_create_subtask_of_recurring_raises` — mutual exclusion
- `test_make_parent_recurring_raises` — mutual exclusion on update
- `test_make_subtask_recurring_raises` — subtask can't be recurring?
  (Actually wait — subtasks CAN be recurring per our design. Only parents can't.)

Correction: the constraint is:
- **Tasks with children** cannot be recurring (container can't recur)
- **Recurring tasks** cannot gain children (atomic work stays atomic)
- **Subtasks CAN be recurring** (a repeating piece of work inside a container)

So the tests:
- `test_create_subtask_of_subtask_raises` — depth-1
- `test_create_subtask_of_recurring_task_raises` — can't add child to recurring
- `test_update_parent_to_recurring_raises` — task with children can't become recurring
- `test_subtask_can_be_recurring` — subtask with is_recurring=True succeeds

**File:** `tests/test_todoist_import.py`

- `test_import_flattens_deep_nesting` — grandchildren become direct children
- `test_import_strips_parent_recurrence` — parents with children lose recurrence

---

## PR 2: Visual Nesting — Expand/Collapse

**Goal:** Parent tasks render as collapsible containers with subtasks nested below.

### 2a. Grouping service refactor

**File:** `app/services/task_grouping.py`

Change `group_tasks_by_domain()` to filter out subtasks from flat lists:

```python
for task in tasks:
    # Skip subtasks — they appear nested under their parent
    if task.parent_id is not None:
        continue
    # ... rest of routing logic (only top-level tasks)
```

Subtask data flows through `task_item["subtasks"]` (already built by
`build_native_task_item()` from eagerly-loaded relationships).

Update `subtask_count` to use `len(task.subtasks)` instead of the separate
`subtask_counts` dict — cleaner since we're eager-loading subtasks now.

### 2b. Page query changes

**File:** `app/routers/pages.py`

Change the dashboard task query (around line 172):
```python
tasks = await task_service.get_tasks(
    status=None,
    top_level_only=True,       # Changed: only top-level
    include_subtasks=True,     # Changed: eager-load children
    has_domain=True,
    exclude_statuses=["archived"],
)
```

Remove the `subtask_counts` computation (lines 181-184) — no longer needed
since counts come from `len(task.subtasks)`.

Pass subtask_counts=None (or remove param) from `group_tasks_by_domain()` call.

### 2c. Template changes

**File:** `app/templates/_task_list.html`

Inside `render_task_item()`, after the main task content, add a nested block
for subtasks:

```html
{% if task_item.subtask_count > 0 %}
<div class="subtask-container" data-parent-id="{{ task.id }}">
  <button class="expand-toggle" aria-expanded="true" aria-label="Toggle subtasks">
    <svg class="chevron-icon">...</svg>
    <span class="subtask-summary">{{ task_item.subtask_count }}</span>
  </button>
  <div class="subtask-list">
    {% for sub in task_item.subtasks %}
      {{ render_task_item(sub, today, encryption_enabled) }}
    {% endfor %}
    <div class="add-task-row" data-parent-id="{{ task.id }}">
      <span class="add-task-icon">+</span>
      <span class="add-task-text">Add subtask</span>
    </div>
  </div>
</div>
{% endif %}
```

Remove the `task-breadcrumb` rendering (parent name → arrow) — no longer
needed since subtasks are visually nested. Keep `data-parent-id` attribute
on subtask `.task-item` elements.

The expand toggle uses a simple chevron that rotates on collapse. State is
persisted in localStorage per parent task ID.

**Design decision — subtasks in flat sections:**
Subtasks do NOT appear in the flat Scheduled/Completed sections. They only
appear under their parent container. This keeps the hierarchy clean. The parent
container always stays in its domain section regardless of child states.

If this causes confusion (users can't see scheduled subtasks at a glance),
we add a "show subtasks in flat sections" toggle in a follow-up.

### 2d. CSS

**File:** `static/css/dashboard.css`

```css
/* Container parent — no scheduling indicators */
.task-item[data-subtask-count]:not([data-subtask-count="0"]) {
  /* Remove drag handle, scheduled date display */
}

/* Subtask container */
.subtask-container {
  margin-left: 0;
  border-left: 2px solid var(--border-subtle);
  padding-left: 12px;
}

/* Subtask items — slightly compact */
.subtask-container .task-item {
  /* Slightly smaller font, reduced padding */
}

/* Expand toggle */
.expand-toggle {
  /* Small button with chevron */
}
.expand-toggle .chevron-icon {
  transition: transform 0.15s ease;
}
.expand-toggle[aria-expanded="false"] .chevron-icon {
  transform: rotate(-90deg);
}
.expand-toggle[aria-expanded="false"] + .subtask-list {
  display: none;
}

/* Remove old breadcrumb styles (no longer needed) */
```

**File:** `static/css/mobile.css`

Override subtask container for mobile:
- Less indentation (8px instead of 12px)
- Thinner border-left
- Touch-friendly expand toggle (44px tap target)
- Remove the two-line breadcrumb layout (lines 901-924) — no longer needed

### 2e. JavaScript — expand/collapse

**File:** new small inline script or add to existing module

```javascript
// Expand/collapse toggle
document.addEventListener('click', function(e) {
  var toggle = e.target.closest('.expand-toggle');
  if (!toggle) return;
  var expanded = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!expanded));
  // Persist to localStorage
  var parentId = toggle.closest('.subtask-container').dataset.parentId;
  var state = JSON.parse(localStorage.getItem('subtask-collapsed') || '{}');
  state[parentId] = expanded; // true means now collapsed
  localStorage.setItem('subtask-collapsed', JSON.stringify(state));
});

// Restore state on page load
document.querySelectorAll('.expand-toggle').forEach(function(toggle) {
  var parentId = toggle.closest('.subtask-container').dataset.parentId;
  var state = JSON.parse(localStorage.getItem('subtask-collapsed') || '{}');
  if (state[parentId]) {
    toggle.setAttribute('aria-expanded', 'false');
  }
});
```

This is small enough to inline in the template or add to an existing module.
No new JS file needed.

### 2f. Update task-item endpoint

**File:** `app/routers/tasks.py` or `app/routers/task_editor.py`

The `/api/v1/task-item/{id}` endpoint returns a single rendered task item.
It's used by `TaskMutations.insertNewTask()`. Ensure it includes subtask
nesting when the task is a parent.

### 2g. Tests

- Update `test_js_module_contract.py` if any exports change
- Test grouping service: subtasks filtered from flat lists
- Test template rendering: parent containers include nested children

---

## PR 3: Create Subtask

**Goal:** Users can add subtasks to any non-recurring, unscheduled top-level task.

### 3a. "Add subtask" trigger

**File:** `app/templates/_task_list.html`

The `.add-task-row[data-parent-id]` added in PR 2 is the trigger. Clicking
it opens the task creation dialog with `parentId` context.

### 3b. Task dialog — parent context

**File:** `static/js/task-dialog.js`

In `openDialog()` (around line 549), accept `parentId` in options:
```javascript
function openDialog(taskId, options) {
  options = options || {};
  var parentId = options.parentId || null;
  // ... existing logic
}
```

Add click handler for `.add-task-row[data-parent-id]`:
```javascript
document.addEventListener('click', function(e) {
  var addRow = e.target.closest('.add-task-row[data-parent-id]');
  if (!addRow) return;
  var parentId = addRow.dataset.parentId;
  openDialog(null, { parentId: parentId });
});
```

When `parentId` is set:
- Add hidden input `<input type="hidden" name="parent_id" value="...">` to form
- Pre-fill domain from parent (readonly)
- Hide domain selector (inherited from parent)
- Show parent name as a breadcrumb header: "Subtask of: Kitchen Renovation"
- Keep all other fields (impact, clarity, duration, schedule, recurrence)

### 3c. Form submission with parent_id

**File:** `static/js/task-dialog.js`

In `handleSubmit()`, include `parent_id` in the POST payload:
```javascript
var payload = {
  title: title,
  parent_id: formData.get('parent_id') || null,
  // ... other fields
};
```

The API already accepts `parent_id` in `TaskCreate` (line 134 of tasks.py).
No backend changes needed for creation.

### 3d. DOM insertion under parent

**File:** `static/js/task-mutations.js`

Update `insertNewTask()` to handle subtasks:
```javascript
function insertNewTask(taskId) {
  // Fetch rendered HTML from server
  safeFetch('/api/v1/task-item/' + taskId).then(function(resp) {
    return resp.text();
  }).then(function(html) {
    var temp = document.createElement('div');
    temp.innerHTML = html;
    var newEl = temp.querySelector('.task-item');
    var parentId = newEl.dataset.parentId;

    if (parentId) {
      // Insert into parent's .subtask-list
      var container = document.querySelector(
        '.subtask-container[data-parent-id="' + parentId + '"]'
      );
      if (container) {
        var addRow = container.querySelector('.add-task-row');
        container.querySelector('.subtask-list').insertBefore(newEl, addRow);
      } else {
        // First subtask — need to create the container
        // Re-fetch the parent task-item to get the full container HTML
        // OR build it client-side
      }
      // Update parent's subtask count badge
      updateSubtaskCount(parentId);
    } else {
      // Existing top-level insertion logic
    }
  });
}
```

**Edge case — first subtask:** When adding the first subtask to a task that
has no children yet, the parent doesn't have a `.subtask-container`. Options:
1. Re-fetch the parent's HTML from server (includes new container) — simplest
2. Build container DOM client-side — more complex

Recommend option 1: after creating the first subtask, re-fetch the parent
task-item from `/api/v1/task-item/{parentId}` and replace it in the DOM.
This ensures server-rendered HTML is the source of truth.

### 3e. Validation UX

When user tries to add subtask to a recurring task, show a toast:
"Remove recurrence from this task before adding subtasks."

When user tries to add subtask to a task that already has a parent:
This shouldn't be possible — the "Add subtask" button only appears on
top-level tasks (no `data-parent-id` attribute).

### 3f. Convert existing task to subtask

This is the "indent" operation — take an existing top-level task and make it
a child of another task. **Deferred to PR 5 (Reparent).** PR 3 only handles
creating NEW subtasks.

### 3g. Tests

- Test creating subtask via API (already partially tested)
- Test that new subtask appears in parent's subtask-list
- Test validation: can't add subtask to recurring task
- Test validation: can't add sub-subtask
- Update `test_js_module_contract.py` if TaskMutations exports change

---

## PR 4: Completion Cascade

**Goal:** Completing a parent container marks all children as completed.

### 4a. Service layer cascade

**File:** `app/services/task_service.py`

In `complete_task()` or `toggle_task_completion()` (around line 361):

```python
async def toggle_task_completion(self, task_id: int) -> Task:
    task = await self.get_task(task_id)
    if not task:
        raise ValueError("Task not found")

    if task.status == "completed":
        # Uncomplete
        task.status = "pending"
        task.completed_at = None
    else:
        # Complete
        task.status = "completed"
        task.completed_at = datetime.now(UTC)
        # CASCADE: complete all children
        if task.subtasks:
            for subtask in task.subtasks:
                if subtask.status != "completed":
                    subtask.status = "completed"
                    subtask.completed_at = datetime.now(UTC)

    await self.db.flush()
    return task
```

Note: uncompleting a parent does NOT uncomplete children. The user explicitly
chose to complete each child; uncompleting the folder shouldn't undo that work.

### 4b. API response

**File:** `app/routers/tasks.py`

The toggle-complete endpoint should return information about cascaded children
so the JS can update the DOM:

```python
# Return task with updated subtasks
return TaskResponse.model_validate(task)  # includes subtasks
```

### 4c. JavaScript DOM cascade

**File:** `static/js/task-complete.js`

When completing a parent (detected by `subtaskCount > 0`):
1. Send the toggle-complete API call
2. On success, animate all child `.task-item` elements to completed state
3. Move the entire parent container (with children) to the completed section

```javascript
// After successful completion of parent
var subtaskEls = document.querySelectorAll(
  '[data-parent-id="' + taskId + '"]'
);
subtaskEls.forEach(function(el) {
  el.classList.add('completed');
  // Update data attributes
});
```

### 4d. Google Calendar unsync

When a parent is completed, any scheduled subtasks should unsync from
Google Calendar. Use the existing `_fire_and_forget_unsync_task()` for each
affected subtask.

### 4e. Tests

- `test_complete_parent_cascades_to_children`
- `test_uncomplete_parent_does_not_uncomplete_children`
- `test_complete_parent_unsyncs_scheduled_children`

---

## PR 5: Reparent & Promote

**Goal:** Move tasks between parents, promote subtasks to top-level, indent
top-level tasks under a sibling.

### 5a. Add parent_id to updatable fields

**File:** `app/services/task_service.py`

Add `parent_id` to `UPDATABLE_FIELDS` (line 304).

Add validation in `update_task()`:
```python
if "parent_id" in kwargs:
    new_parent_id = kwargs["parent_id"]
    if new_parent_id is not None:
        parent = await self.get_task(new_parent_id)
        if not parent:
            raise ValueError("Parent not found")
        if parent.parent_id is not None:
            raise ValueError("Cannot nest under a subtask")
        if parent.is_recurring:
            raise ValueError("Cannot nest under a recurring task")
        if parent.id == task_id:
            raise ValueError("Cannot be own parent")
        # Update domain to match new parent
        task.domain_id = parent.domain_id
    else:
        # Promoting to top-level — keep current domain
        pass
    task.parent_id = new_parent_id
    # Recalculate position within new parent
    task.position = await self._next_position(task.domain_id, new_parent_id)
```

### 5b. Pydantic model update

**File:** `app/routers/tasks.py`

Add `parent_id: int | None` to `TaskUpdate` model (around line 182).

### 5c. Promote action

**File:** `static/js/task-dialog.js` or context menu

Add a "Promote to task" button visible when editing a subtask.
Sends `PUT /api/v1/tasks/{id}` with `{ parent_id: null }`.

On success: move the `.task-item` from under the parent container to the
domain's top-level `.task-list`. Update the old parent's subtask count.

### 5d. Indent action

Add an "Make subtask of..." action on top-level tasks, or support drag-drop
onto another task to indent.

**Drag-drop approach (optional, complex):**
- When dragging a task over another task (not a calendar slot), show a
  "nest under" drop indicator
- On drop, send `PUT /api/v1/tasks/{id}` with `{ parent_id: targetId }`
- Move DOM element into target's `.subtask-container`

**Simpler approach for v1:**
- In task edit dialog, add a "Parent task" dropdown/picker
- User selects a parent → saves → task moves under it

Recommend the simpler approach first; drag-indent can come later.

### 5e. Tests

- `test_reparent_task_updates_domain`
- `test_promote_subtask_to_top_level`
- `test_reparent_to_subtask_raises` — can't nest under a subtask
- `test_reparent_to_self_raises`
- `test_reparent_to_recurring_raises`

---

## Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Subtasks in flat sections | No | Container is the source of truth; avoids dual rendering |
| Expand default state | Expanded | Users want to see tasks; collapse is for decluttering |
| State persistence | localStorage | No server round-trip; survives page reload |
| First-subtask edge case | Re-fetch parent HTML | Server is source of truth for container rendering |
| Uncomplete cascade | No (up only on complete) | Uncompleting folder ≠ undoing child work |
| Reparent approach (PR 5) | Edit dialog picker | Simpler than drag-indent; ships faster |
| Parent task fields when gaining children | Keep as-is | No stripping; UI hides irrelevant controls |
| Adding subtask to scheduled task | Block | "Unschedule first" — prevents data inconsistency |

## Files Changed (All PRs Combined)

### Python
| File | Changes |
|------|---------|
| `app/services/task_service.py` | Depth-1 validation, mutual exclusion, reparent, completion cascade |
| `app/services/task_grouping.py` | Filter subtasks from flat lists, simplify subtask_counts |
| `app/services/todoist_import.py` | Flatten deep nesting, strip parent recurrence |
| `app/routers/tasks.py` | Error handling for validation, parent_id in TaskUpdate |
| `app/routers/pages.py` | Change query to top_level_only=True, include_subtasks=True |
| `alembic/versions/...` | Data migration to flatten existing deep nesting |

### Templates
| File | Changes |
|------|---------|
| `app/templates/_task_list.html` | Nested subtask rendering, expand/collapse, add-subtask row |
| `app/templates/tasks/_task_form_content.html` | Parent context display, hide domain selector for subtasks |
| `app/templates/_task_item.html` | Include subtask container when rendering parent |

### CSS
| File | Changes |
|------|---------|
| `static/css/dashboard.css` | Subtask container, indent, expand toggle, remove breadcrumb styles |
| `static/css/mobile.css` | Mobile overrides for container, remove breadcrumb layout |

### JavaScript
| File | Changes |
|------|---------|
| `static/js/task-dialog.js` | Accept parentId option, add-subtask-row handler, parent context in form |
| `static/js/task-mutations.js` | Insert subtask under parent, update subtask counts |
| `static/js/task-complete.js` | Completion cascade DOM updates |
| `static/js/drag-drop.js` | Possibly: prevent dragging containers (already done) |
| `static/js/plan-tasks.js` | No changes needed (already skips parents) |
| `static/js/task-sort.js` | No changes needed |

### Tests
| File | Changes |
|------|---------|
| `tests/test_task_service.py` | Constraint tests, cascade tests, reparent tests |
| `tests/test_todoist_import.py` | Flattening tests, recurrence stripping tests |
| `tests/test_js_module_contract.py` | Update if any JS exports change |

## Open Questions (Decide During Implementation)

1. **Scheduled subtask visibility:** If a subtask is scheduled for today but
   its parent is collapsed, the user won't see it in the task list (only in
   calendar). Is that acceptable? If not, auto-expand parents that have
   today-scheduled children.

2. **Completed subtask visibility:** When all subtasks of a parent are completed
   but the parent isn't, should the parent show a visual indicator? A muted
   "all done" style? Or nothing?

3. **Empty containers:** If a parent has no pending subtasks (all completed or
   none created yet), should it look different from a regular task?
   Recommendation: show the expand toggle with "0 pending" or just the
   add-subtask row.

4. **Encryption:** Parent names in breadcrumbs are already handled (shows lock
   icon when encrypted). Subtask titles under containers use the same
   encryption/decryption flow as top-level tasks. No special handling needed.
