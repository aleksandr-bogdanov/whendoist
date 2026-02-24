# Recurring Tasks: Implementation Plan

**Date:** 2026-02-02
**Based on:** [RECURRING-TASKS-ANALYSIS.md](RECURRING-TASKS-ANALYSIS.md)

---

## Critical Context: Two Recurrence UIs

The codebase has **two separate recurrence UI implementations** that must both be addressed:

1. **Desktop dialog** — `static/js/task-dialog.js` (inline HTML + JS, lines 27-33 presets, 150-200 custom UI, 685-703 rule builder)
2. **Mobile sheet** — `static/js/recurrence-picker.js` (standalone module, used via `app/templates/tasks/_task_sheet.html:170-177`)

The desktop dialog is **more limited** than recurrence-picker.js:
- Desktop: daily/weekly/monthly only (no yearly in custom freq select, line 183-187)
- Desktop: no `day_of_month` input for monthly
- Desktop: `populateCustomRecurrence()` (line 987-1000) only restores freq, interval, days_of_week
- Mobile: has yearly, has day_of_month, has time input — but still no `week_of_month` or `month_of_year`

Both UIs share the same backend rule format and both can silently drop fields they don't support.

---

## Phase 1: Bug Fixes (Contradictions)

### 1.1 Fix `aria-pressed` for recurring tasks

**Issue:** `aria-pressed` checks `task.status` which is always `"pending"` for recurring tasks. The `is_completed` variable (which correctly considers instance completion) is computed on line 17 but not used for `aria-pressed`.

**File:** `app/templates/_task_list.html:33`

**Change:**
```html
<!-- BEFORE (line 33) -->
<button class="complete-gutter complete-gutter--hover" type="button" aria-label="Complete task" aria-pressed="{{ 'true' if task.status == 'completed' else 'false' }}">

<!-- AFTER -->
<button class="complete-gutter complete-gutter--hover" type="button" aria-label="Complete task" aria-pressed="{{ 'true' if is_completed else 'false' }}">
```

**Risk:** None. `is_completed` is already computed on line 17 and used for `data-completed` on line 23. This just aligns `aria-pressed` with the same source of truth.

**Dependencies:** None. Ships alone.

---

### 1.2 Prevent silent data loss when editing advanced recurrence rules

**Issue:** Editing a task with `week_of_month`, `month_of_year`, `day_of_month` (monthly in desktop dialog), or `yearly` frequency strips those fields on re-save because the UI can't represent them.

**Strategy:** Two-pronged defense:
1. **Preserve unknown fields** — when the UI can't fully represent a rule, carry forward the original rule's fields that the UI doesn't expose
2. **Extend the UI** — add the missing controls so users can see and edit all rule types

#### 1.2a Preserve unknown fields on save (safety net — do this first)

**File:** `static/js/task-dialog.js`

The `updateRecurrenceRule()` function (lines 685-703) builds a rule from scratch every time, discarding any fields it doesn't know about. Instead, it should merge onto the existing rule.

**Change to `updateRecurrenceRule()` (line 685-703):**
```javascript
// BEFORE
function updateRecurrenceRule() {
    const interval = parseInt(backdropEl.querySelector('#recurrence-interval').value, 10) || 1;
    const freq = backdropEl.querySelector('#recurrence-freq').value;

    const rule = {
        freq: freq,
        interval: interval
    };

    if (freq === 'weekly') {
        const days = Array.from(backdropEl.querySelectorAll('#recurrence-days .day-btn.is-active'))
            .map(btn => btn.dataset.day);
        if (days.length > 0) {
            rule.days_of_week = days;
        }
    }

    setRecurrenceRule(rule);
}

// AFTER
function updateRecurrenceRule() {
    const interval = parseInt(backdropEl.querySelector('#recurrence-interval').value, 10) || 1;
    const freq = backdropEl.querySelector('#recurrence-freq').value;

    // Start from existing rule to preserve fields the UI doesn't expose
    // (e.g., week_of_month, month_of_year, day_of_month for yearly)
    const base = currentRecurrenceRule || {};
    const rule = { ...base, freq, interval };

    // Clean up freq-specific fields when freq changes
    if (freq !== 'weekly') {
        delete rule.days_of_week;
    }
    if (freq !== 'monthly') {
        delete rule.day_of_month;
        delete rule.week_of_month;
    }
    if (freq !== 'yearly') {
        delete rule.month_of_year;
        // Keep day_of_month if yearly switches to monthly (it's valid in both)
        if (freq !== 'monthly') {
            delete rule.day_of_month;
        }
    }

    if (freq === 'weekly') {
        const days = Array.from(backdropEl.querySelectorAll('#recurrence-days .day-btn.is-active'))
            .map(btn => btn.dataset.day);
        if (days.length > 0) {
            rule.days_of_week = days;
        } else {
            delete rule.days_of_week;
        }
    }

    if (freq === 'monthly') {
        const dayInput = backdropEl.querySelector('#recurrence-day-of-month');
        if (dayInput) {
            const val = parseInt(dayInput.value, 10);
            if (val >= 1 && val <= 31) {
                rule.day_of_month = val;
            }
        }
    }

    setRecurrenceRule(rule);
}
```

**Same pattern for `recurrence-picker.js`** `getRule()` (lines 124-171): merge onto stored original rule instead of building from scratch.

**Change to `getRule()` in `recurrence-picker.js`:**
Add a `_originalRule` variable set by `setRule()`, and merge unknown fields:
```javascript
// At module scope
let _originalRule = null;

// In setRule():
_originalRule = rule ? { ...rule } : null;

// In getRule(), after building the rule object:
// Merge any fields from original rule that we don't expose in the UI
if (_originalRule) {
    if (_originalRule.week_of_month !== undefined && rule.freq === 'monthly' && !rule.day_of_month) {
        rule.week_of_month = _originalRule.week_of_month;
    }
    if (_originalRule.month_of_year !== undefined && rule.freq === 'yearly') {
        rule.month_of_year = _originalRule.month_of_year;
    }
}
```

**Risk:** Low. The merge is conservative — only carries forward fields that make sense for the current freq. Worst case: an unexpected field survives in the JSON, which the backend already ignores.

#### 1.2b Extend desktop dialog UI with missing controls

**File:** `static/js/task-dialog.js`

**Changes needed:**

1. **Add "yearly" to freq select** (line 183-187):
```html
<!-- BEFORE -->
<select id="recurrence-freq" class="input">
    <option value="daily">days</option>
    <option value="weekly">weeks</option>
    <option value="monthly">months</option>
</select>

<!-- AFTER -->
<select id="recurrence-freq" class="input">
    <option value="daily">days</option>
    <option value="weekly">weeks</option>
    <option value="monthly">months</option>
    <option value="yearly">years</option>
</select>
```

2. **Add day-of-month input for monthly** (after line 198, inside `#custom-recurrence`):
```html
<span class="subrow-label day-of-month-label" hidden>On day</span>
<div class="field-controls day-of-month-field" hidden>
    <input type="number" id="recurrence-day-of-month" class="input input-sm" value="1" min="1" max="31">
</div>
```

3. **Show/hide day-of-month vs days-of-week based on freq** — add to freq change listener (near line 645):
```javascript
backdropEl.querySelector('#recurrence-freq').addEventListener('change', () => {
    const freq = backdropEl.querySelector('#recurrence-freq').value;
    const daysRow = backdropEl.querySelector('#recurrence-days');
    const onLabel = backdropEl.querySelector('.subrow-label:nth-of-type(2)'); // "On" label for days
    const domLabel = backdropEl.querySelector('.day-of-month-label');
    const domField = backdropEl.querySelector('.day-of-month-field');

    // Show days-of-week row only for weekly
    daysRow.hidden = freq !== 'weekly';
    // Show "On" label only for weekly
    if (onLabel) onLabel.hidden = freq !== 'weekly';
    // Show day-of-month only for monthly
    if (domLabel) domLabel.hidden = freq !== 'monthly';
    if (domField) domField.hidden = freq !== 'monthly';

    updateRecurrenceRule();
});
```

4. **Extend `populateCustomRecurrence()`** (line 987-1000) to restore all fields:
```javascript
// BEFORE
function populateCustomRecurrence(rule) {
    if (rule.freq) {
        backdropEl.querySelector('#recurrence-freq').value = rule.freq;
    }
    if (rule.interval) {
        backdropEl.querySelector('#recurrence-interval').value = rule.interval;
    }
    if (rule.days_of_week) {
        backdropEl.querySelectorAll('#recurrence-days .day-btn').forEach(btn => {
            btn.classList.toggle('is-active', rule.days_of_week.includes(btn.dataset.day));
        });
    }
}

// AFTER
function populateCustomRecurrence(rule) {
    if (rule.freq) {
        backdropEl.querySelector('#recurrence-freq').value = rule.freq;
    }
    if (rule.interval) {
        backdropEl.querySelector('#recurrence-interval').value = rule.interval;
    }
    if (rule.days_of_week) {
        backdropEl.querySelectorAll('#recurrence-days .day-btn').forEach(btn => {
            btn.classList.toggle('is-active', rule.days_of_week.includes(btn.dataset.day));
        });
    }
    // Day of month for monthly
    const domInput = backdropEl.querySelector('#recurrence-day-of-month');
    if (domInput && rule.day_of_month) {
        domInput.value = rule.day_of_month;
    }
    // Show/hide freq-dependent rows
    const freq = rule.freq || 'daily';
    const daysRow = backdropEl.querySelector('#recurrence-days');
    const domLabel = backdropEl.querySelector('.day-of-month-label');
    const domField = backdropEl.querySelector('.day-of-month-field');
    if (daysRow) daysRow.hidden = freq !== 'weekly';
    if (domLabel) domLabel.hidden = freq !== 'monthly';
    if (domField) domField.hidden = freq !== 'monthly';
}
```

**Edge cases:**
- `week_of_month` (nth weekday monthly) — no new UI for this. The preserve-on-save safety net (1.2a) handles it. Adding "2nd Monday" UI is complex and rare enough to defer.
- `month_of_year` for yearly — the backend uses it but the UI doesn't expose "which month." Preserved by 1.2a. The yearly rule with `month_of_year` will at least not be destroyed.

**Dependencies:** 1.2a and 1.2b should ship together. 1.2a is the safety net; 1.2b extends the UI.

---

### 1.3 Fix completion toast for recurring tasks

**Issue:** `task-complete.js:157` shows "Task completed" for recurring task gutter clicks.

**File:** `static/js/task-complete.js:61-66, 157`

**Change:** The `taskEl` already has `data-is-recurring`. Read it and adjust the message.

```javascript
// BEFORE (line 60-66)
const taskId = taskEl.dataset.taskId;
const instanceId = taskEl.dataset.instanceId;
const isCompleted = taskEl.dataset.completed === '1';

// Toggle completion
toggleCompletion(taskEl, taskId, instanceId, !isCompleted);

// AFTER
const taskId = taskEl.dataset.taskId;
const instanceId = taskEl.dataset.instanceId;
const isRecurring = taskEl.dataset.isRecurring === 'true' || !!instanceId;
const isCompleted = taskEl.dataset.completed === '1';

// Toggle completion
toggleCompletion(taskEl, taskId, instanceId, !isCompleted, isRecurring);
```

```javascript
// BEFORE (line 76 signature)
async function toggleCompletion(taskEl, taskId, instanceId, shouldComplete) {

// AFTER
async function toggleCompletion(taskEl, taskId, instanceId, shouldComplete, isRecurring = false) {
```

```javascript
// BEFORE (line 157)
showToast(data.completed ? 'Task completed' : 'Task reopened');

// AFTER
if (isRecurring) {
    showToast(data.completed ? 'Done for today' : 'Reopened for today');
} else {
    showToast(data.completed ? 'Task completed' : 'Task reopened');
}
```

Note: the task-dialog's `handleComplete()` (line 1196-1200) already has the correct recurring-aware message. This fix is only for the gutter click path.

**Risk:** None. Purely cosmetic.

**Dependencies:** None. Ships alone.

---

## Phase 2: Quick UX Wins

### 2.1 Fix "Weekly" preset ambiguity

**Issue:** "Weekly" preset sends `{ freq: 'weekly', interval: 1 }` with no `days_of_week`. Backend defaults to whatever weekday `dtstart` falls on, which the user can't predict.

**Strategy:** When user selects "Weekly" preset, auto-select today's day of week.

**File:** `static/js/task-dialog.js`, the preset click handler at line 620-641.

**Change:**
```javascript
// BEFORE (line 634-635)
if (value && value !== '') {
    setRecurrenceRule({ freq: value, interval: 1 });

// AFTER
if (value && value !== '') {
    const rule = { freq: value, interval: 1 };
    // For "Weekly", default to today's day of week
    if (value === 'weekly') {
        const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
        rule.days_of_week = [dayMap[new Date().getDay()]];
    }
    setRecurrenceRule(rule);
```

**Same change in `recurrence-picker.js`** — the "Weekly" preset at line 16:
```javascript
// BEFORE
{ label: 'Weekly', value: { freq: 'weekly', interval: 1 } },

// Keep the preset as-is, but in getRule() when returning a preset value,
// inject today's day for weekly if no days specified:
// In getRule(), after line 138:
if (rule.freq === 'weekly' && !rule.days_of_week) {
    const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    rule.days_of_week = [dayMap[new Date().getDay()]];
}
return rule;
```

**Also update preview text** — both UIs already show day labels when `days_of_week` is present, so once the day is injected, the preview will automatically show "Every Mon" instead of "Every week."

**Edge case:** For existing tasks with `{ freq: 'weekly', interval: 1 }` and no `days_of_week`, loading them in the dialog will match the "Weekly" preset and won't auto-inject a day (the rule comes from the DB, not from a user click). This is fine — the user explicitly chose this pattern before.

**Risk:** Low. Only affects newly set "Weekly" presets. Existing rules are untouched.

**Dependencies:** None.

---

### 2.2 Fix task list completion visual mismatch

**Issue:** Task list shows next occurrence date (e.g., "Feb 04 — Wednesday") but the checkbox reflects today's instance completion. A user who completed today's Monday instance sees "Feb 04" with a checkmark — confusing.

**Strategy:** When today's instance is completed for a recurring task, show **today's date** (not next occurrence) with a completed visual. The "next occurrence" date should only show when today's instance is *not* completed.

**File:** `app/templates/_task_list.html:26, 45-50`

**Change to line 26 (data-scheduled-date):**
```html
<!-- BEFORE -->
data-scheduled-date="{{ (task_item.next_occurrence or task.scheduled_date).isoformat() if (task_item.next_occurrence or task.scheduled_date) else '' }}"

<!-- AFTER -->
{% if task.is_recurring and task_item.instance_completed_at %}
data-scheduled-date="{{ today.isoformat() }}"
{% else %}
data-scheduled-date="{{ (task_item.next_occurrence or task.scheduled_date).isoformat() if (task_item.next_occurrence or task.scheduled_date) else '' }}"
{% endif %}
```

**Change to lines 45-50 (visible date display):**
```html
<!-- BEFORE -->
{% if task_item.next_occurrence or task.scheduled_date %}
<span class="task-due">
    {% if task.is_recurring %}<span class="recurring-icon" title="Recurring task">↻</span>{% endif %}
    {{ (task_item.next_occurrence or task.scheduled_date).strftime('%b %d') }}
</span>
{% endif %}

<!-- AFTER -->
{% if task.is_recurring %}
<span class="task-due">
    <span class="recurring-icon" title="Recurring task">↻</span>
    {% if task_item.instance_completed_at %}
        Today ✓
    {% elif task_item.next_occurrence %}
        {{ task_item.next_occurrence.strftime('%b %d') }}
    {% elif task.scheduled_date %}
        {{ task.scheduled_date.strftime('%b %d') }}
    {% endif %}
</span>
{% elif task_item.next_occurrence or task.scheduled_date %}
<span class="task-due">
    {{ (task_item.next_occurrence or task.scheduled_date).strftime('%b %d') }}
</span>
{% endif %}
```

**Backend dependency:** The template needs access to `today`. Check if the dashboard page context already passes it.

**File:** `app/routers/pages.py` — the `render_dashboard` function already computes `today = get_user_today(timezone)` and passes it to the template context. Verify it's available in the `_task_list.html` partial. If not, it can be passed through the `group_tasks_by_domain` return data.

**Risk:** Low. Only changes the date label for recurring tasks with today's instance completed. No behavioral change.

**Dependencies:** None.

---

## Phase 3: Feature Gaps with Existing Backend Support

### 3.1 Add "Skip" action for recurring task instances

**Backend:** Already complete — `POST /api/v1/instances/{id}/skip` (instances.py:137-149), `RecurrenceService.skip_instance()`.

**UI Changes needed:**

#### 3.1a Task list: long-press or right-click context menu

**Approach:** Add a small context menu (or swipe action on mobile) that appears for recurring tasks, offering "Skip today's instance." This is simpler than adding a visible button to every task row.

**File:** `static/js/task-complete.js` — extend `handleGutterClick` or add a new handler.

**Proposed implementation:** On right-click of the complete-gutter button for recurring tasks, show a mini popup with "Skip" option:

```javascript
// Add to init():
document.addEventListener('contextmenu', handleGutterRightClick);

function handleGutterRightClick(e) {
    const gutter = e.target.closest('.complete-gutter');
    if (!gutter) return;

    const taskEl = gutter.closest('[data-task-id]');
    if (!taskEl) return;

    const instanceId = taskEl.dataset.instanceId;
    if (!instanceId) return; // Only for recurring instances

    e.preventDefault();
    showSkipMenu(e.clientX, e.clientY, taskEl, instanceId);
}

async function skipInstance(taskEl, instanceId) {
    const response = await fetch(`/api/v1/instances/${instanceId}/skip`, {
        method: 'POST',
        headers: window.getCSRFHeaders(),
    });

    if (response.ok) {
        taskEl.classList.add('skipped');
        taskEl.dataset.completed = '1'; // Treat as "done" visually
        showToast('Skipped for today');
    }
}
```

**CSS:** Add a `.skipped` class with distinct visual (e.g., strikethrough + muted, different from completed):
```css
.task-item.skipped { opacity: 0.4; text-decoration: line-through; }
```

#### 3.1b Mobile: add skip to mobile sheet actions

**File:** `app/templates/tasks/_task_sheet.html` — add a "Skip" button next to Complete for recurring tasks.

**Edge cases:**
- Skip only makes sense for instances with a known ID. If no instance ID on the task element, skip should be disabled/hidden.
- Skipping already-completed instance: the API should handle this (backend `skip_instance` sets status to "skipped" regardless of current state — verify this works for completed→skipped transition).

**Risk:** Low. New UI surface, no changes to existing completion flow.

**Dependencies:** None — backend already exists.

---

### 3.2 Wire up instance rescheduling via drag-and-drop

**Issue:** Dragging a recurring task instance to a different day clears the instance ID (drag-drop.js:785-788) and updates the parent task's `scheduled_date` via `PUT /api/v1/tasks/{id}`. This is wrong for recurring tasks — it should reschedule the specific instance.

**Backend:** Already complete — `PUT /api/v1/instances/{id}/schedule` (instances.py:152-165).

**File:** `static/js/drag-drop.js`, the drop handler around line 781-844.

**Change:**
```javascript
// BEFORE (line 781-819)
let effectiveInstanceId = instanceId;
let effectiveInstanceDate = instanceDate;
if (instanceId && instanceDate && instanceDate !== day) {
    effectiveInstanceId = '';
    effectiveInstanceDate = '';
}
// ... later:
const response = await fetch(`/api/v1/tasks/${taskId}`, {
    method: 'PUT',
    headers: window.getCSRFHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        duration_minutes: draggedDuration,
    }),
});

// AFTER
let effectiveInstanceId = instanceId;
let effectiveInstanceDate = instanceDate;
const isDroppingOnDifferentDay = instanceId && instanceDate && instanceDate !== day;

if (isDroppingOnDifferentDay) {
    // Reschedule the instance to the new day+time
    effectiveInstanceDate = day;
}

// Create visual element (same as before)
const element = createScheduledTaskElement(taskId, content, duration, hour, minutes, impact, completed, effectiveInstanceId, effectiveInstanceDate);
slot.appendChild(element);
wasDroppedSuccessfully = true;

// ... later, the API call:
if (effectiveInstanceId) {
    // Reschedule instance via instance API
    const scheduledDatetime = `${day}T${scheduledTime}`;
    const response = await fetch(`/api/v1/instances/${effectiveInstanceId}/schedule`, {
        method: 'PUT',
        headers: window.getCSRFHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ scheduled_datetime: scheduledDatetime }),
    });
    // ... error handling same pattern
} else {
    // Regular task: update task directly (existing code)
    const response = await fetch(`/api/v1/tasks/${taskId}`, {
        method: 'PUT',
        headers: window.getCSRFHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            scheduled_date: scheduledDate,
            scheduled_time: scheduledTime,
            duration_minutes: draggedDuration,
        }),
    });
    // ... error handling same pattern
}
```

**Edge cases:**
- Dragging to same day different time: `instanceDate === day`, so `isDroppingOnDifferentDay` is false. The instance ID is preserved and used — but currently the API call updates the parent Task, not the instance. This needs the same fix: if `effectiveInstanceId` exists, always use the instance schedule API.
- The instance schedule endpoint changes `scheduled_datetime` but not `instance_date`. If the user drags Monday's instance to Wednesday, the instance still has `instance_date = Monday` but `scheduled_datetime = Wednesday 10:00`. This is semantically odd. **Decision needed:** Should dragging an instance to a different day be allowed at all, or should it only allow time changes within the same day?

**Recommendation:** For now, only allow rescheduling within the same day (time changes). Keep the current behavior of clearing instance ID for cross-day drops. This avoids the `instance_date ≠ scheduled_datetime.date()` inconsistency. Cross-day rescheduling needs a backend change to also update `instance_date`.

**Risk:** Medium. Drag-drop is complex with overlaps, optimistic updates, and revert-on-failure. Thorough testing needed.

**Dependencies:** None — backend exists. But consider the same-day-only recommendation.

---

## Phase 4: New Features Needing Design Decisions

### 4.1 Recurrence bounds UI (start/end dates)

**Issue:** `recurrence_start` and `recurrence_end` fields exist on the Task model but no UI exposes them.

**Design options:**

**Option A: Add to recurrence picker area**
Add "Starts" and "Ends" date pickers below the recurrence preset/custom controls. Only visible when recurrence is set to something other than "None."

```
Repeat: [None] [Daily] [Weekly] [Monthly] [Custom]
Starts: [date picker, defaults to today]
Ends:   [Never ▾]  →  [date picker] | [After N occurrences]
```

**Option B: Use existing scheduled_date as recurrence_start**
When `is_recurring` is true, treat `scheduled_date` as `recurrence_start`. This avoids a new UI element but overloads the meaning of `scheduled_date`.

**Recommendation:** Option A — explicit is better. The `scheduled_date` field has its own meaning (when does the task show on the calendar), and conflating it with recurrence start creates confusion.

**Files to change:**
- `static/js/task-dialog.js` — add date inputs to the custom recurrence subrow
- `static/js/recurrence-picker.js` — add date inputs
- `app/templates/tasks/_task_sheet.html` — mobile equivalent
- Task create/update API already accepts `recurrence_start` and `recurrence_end` — no backend changes

**Backend note:** `recurrence_service.py:136-138` already handles `recurrence_start` correctly:
```python
start_date = task.recurrence_start or today
if start_date < today:
    start_date = today
```

**Risk:** Low backend risk (fields already exist). Medium frontend risk (date pickers add complexity).

**Dependencies:** Should ship after Phase 1.2 (extended recurrence UI) so the custom section is already expanded.

---

### 4.2 Batch completion for past instances

**Issue:** After being away for a week, a daily recurring task has 7 pending instances. No batch action exists.

**Design options:**

**Option A: "Complete all past" button**
Add a button in the task dialog for recurring tasks: "Complete past instances (N pending)." Calls a new batch endpoint.

**Option B: Auto-skip old instances**
During materialization, auto-mark instances older than N days as "skipped." This is opinionated but reduces clutter.

**Option C: On-demand cleanup prompt**
When loading the dashboard and pending instances exist for dates before today, show a banner: "You have N pending instances from past days. [Complete all] [Skip all] [Dismiss]"

**Recommendation:** Option A + C. The banner catches the user's attention on return, and the dialog button handles individual tasks.

**New backend endpoint:**

**File:** `app/routers/instances.py` — add batch endpoint:

```python
class BatchCompleteRequest(BaseModel):
    task_id: int
    before_date: date  # Complete all pending instances before this date

@router.post("/batch-complete", status_code=200)
async def batch_complete_instances(
    data: BatchCompleteRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Complete all pending instances for a task before a given date."""
    service = RecurrenceService(db, user.id)
    count = await service.batch_complete_instances(data.task_id, data.before_date)
    await db.commit()
    return {"completed_count": count}
```

**File:** `app/services/recurrence_service.py` — add method:

```python
async def batch_complete_instances(self, task_id: int, before_date: date) -> int:
    """Complete all pending instances for a task before a given date."""
    result = await self.db.execute(
        select(TaskInstance).where(
            TaskInstance.task_id == task_id,
            TaskInstance.user_id == self.user_id,
            TaskInstance.instance_date < before_date,
            TaskInstance.status == "pending",
        )
    )
    instances = list(result.scalars().all())
    now = datetime.now(UTC)
    for inst in instances:
        inst.status = "completed"
        inst.completed_at = now
    await self.db.flush()
    return len(instances)
```

**Risk:** Low. Batch update is a simple extension of existing patterns. The multitenancy filter (`user_id`) prevents cross-user access.

**Dependencies:** Should be after Phase 3.1 (skip UI) so that "Skip all" is also available.

---

### 4.3 Unify time handling (rule.time vs task.scheduled_time)

**Issue:** Two time sources exist. `recurrence_rule.time` overrides `task.scheduled_time` in materialization. The UI has both a task-level time picker and a recurrence-level time input (in recurrence-picker.js, not in the desktop dialog).

**Design options:**

**Option A: Remove rule.time, always use task.scheduled_time**
Simplest. When a task is recurring, its `scheduled_time` is used for all instances. The recurrence picker loses its time input. Existing `rule.time` values are migrated to `task.scheduled_time` in a one-time migration.

**Option B: Keep both, make precedence clear in UI**
Show the effective time in the recurrence preview. e.g., "Every day at 09:00 (from recurrence rule)" or "Every day at 10:00 (from task schedule)."

**Option C: Remove task.scheduled_time for recurring tasks**
When `is_recurring` is true, time comes exclusively from `recurrence_rule.time`. Hide the task-level time picker for recurring tasks.

**Recommendation:** Option A. Two time sources is unnecessary complexity. The task's `scheduled_time` is the canonical time. The recurrence rule defines *when* to repeat (frequency, days), not *what time* — that's the task's property.

**Migration:**

```python
# In a new Alembic migration:
# Move rule.time to task.scheduled_time where task.scheduled_time is NULL
op.execute("""
    UPDATE tasks
    SET scheduled_time = (recurrence_rule->>'time')::time
    WHERE is_recurring = true
      AND scheduled_time IS NULL
      AND recurrence_rule->>'time' IS NOT NULL
""")
# Then strip 'time' from all recurrence_rules
op.execute("""
    UPDATE tasks
    SET recurrence_rule = recurrence_rule - 'time'
    WHERE is_recurring = true
      AND recurrence_rule ? 'time'
""")
```

**Backend change** in `recurrence_service.py:146-152`: Remove the rule.time override logic. Always use `task.scheduled_time`.

**Frontend change:** Remove time input from `recurrence-picker.js` (lines 70-73, 134-138, 165-168, 285-287). The desktop dialog already doesn't have it (it's only in recurrence-picker.js).

**Risk:** Medium. Requires a data migration. Must verify no rules rely on `rule.time` being different from `task.scheduled_time` (they shouldn't — the UI doesn't let you set both independently in the desktop dialog).

**Dependencies:** Requires a migration. Should be done carefully after other phases.

---

## Ship Order Summary

| Phase | Issues | PRs | Risk |
|-------|--------|-----|------|
| 1.1 | aria-pressed fix | 1 small PR | None |
| 1.3 | Toast text fix | Same PR as 1.1 | None |
| 1.2 | Recurrence picker data loss + UI extension | 1 PR | Low |
| 2.1 | Weekly preset ambiguity | 1 PR | Low |
| 2.2 | Completion visual mismatch | 1 PR | Low |
| 3.1 | Skip UI | 1 PR | Low |
| 3.2 | Instance rescheduling drag-drop | 1 PR | Medium |
| 4.2 | Batch completion | 1 PR (backend + frontend) | Low |
| 4.1 | Recurrence bounds UI | 1 PR | Medium |
| 4.3 | Time unification | 1 PR (migration + code) | Medium |

**Phases 1.1 + 1.3** can be a single PR (two 1-line fixes).
**Phase 1.2** is the most important — prevents data loss.
**Phases 2.x** are independent and can ship in any order.
**Phases 3.x** are independent.
**Phase 4.3** should be last (requires migration and touches the most code).
