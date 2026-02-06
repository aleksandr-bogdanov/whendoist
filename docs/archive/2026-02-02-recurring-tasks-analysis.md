# Recurring Tasks: System Architecture Analysis

**Date:** 2026-02-02
**Scope:** Full-stack analysis of recurring task handling — models, services, API, UI, GCal sync

## 1. Architecture Overview

The system uses a **materialized instance pattern**:

```
Task (is_recurring=true, recurrence_rule={...})
  └── TaskInstance (one per occurrence date, 60-day rolling window)
       └── GoogleCalendarEventSync (one per synced instance)
```

**Backend** (`app/services/recurrence_service.py`) uses `dateutil.rrule` to generate dates, creates `TaskInstance` rows in a 60-day window, and a background loop refreshes them hourly. **Frontend** (vanilla JS + Jinja2 templates) renders tasks with instance metadata and routes completion clicks to instance-specific endpoints.

The design is fundamentally sound. The contradictions and gaps are at the edges.

---

## 2. Contradictions

### 2.1 `aria-pressed` vs `data-completed` for recurring tasks

**File:** `app/templates/_task_list.html:33` vs `:23`

```html
<!-- Line 23: Correct - considers instance completion -->
data-completed="{{ '1' if is_completed else '0' }}"

<!-- Line 33: Wrong - only checks task.status, never "completed" for recurring -->
aria-pressed="{{ 'true' if task.status == 'completed' else 'false' }}"
```

For a recurring task, `task.status` is always `"pending"` (the parent task never completes). So `aria-pressed` is always `"false"` even when today's instance is completed and the checkbox is visually checked. Screen readers will report the wrong state.

**Severity:** Accessibility bug.

### 2.2 Recurrence picker capabilities vs backend capabilities

| Feature | Backend (`recurrence_service.py:94-110`) | Frontend (`recurrence-picker.js`) |
|---|---|---|
| Daily | Yes | Yes |
| Weekly + days | Yes | Yes |
| Monthly by day-of-month | Yes | Yes |
| Monthly by nth weekday (e.g., "2nd Monday") | Yes (`:98-103`) | **No** |
| Yearly with month + day | Yes (`:106-110`) | **No** (only `freq: yearly, interval: N`) |

The backend supports `week_of_month` + `days_of_week` for monthly, and `month_of_year` + `day_of_month` for yearly. The frontend has no UI for either. These rules can't be created through the UI but could exist via direct API calls or future imports.

If such a rule exists (e.g., from a Todoist import), `setRule()` in `recurrence-picker.js:173-225` falls back to "Custom" but:
- The yearly rule would show as "Custom" with `freq=yearly` and `interval=N`, **silently dropping** `month_of_year` and `day_of_month` on re-save
- The nth-weekday monthly rule would show as "Custom" with `freq=monthly` but `week_of_month` has no input field, so it's **silently dropped** on re-save

**Severity:** Data loss on edit. Editing a yearly or nth-weekday rule through the UI strips fields the UI doesn't support.

### 2.3 Completion toast says "Task completed" not "Instance completed"

**File:** `static/js/task-complete.js:157`

```javascript
showToast(data.completed ? 'Task completed' : 'Task reopened');
```

Same message for both recurring and non-recurring tasks. For a recurring task, only today's instance is completed, not the task.

**Severity:** UX confusion, minor.

---

## 3. Gaps

### 3.1 No UI for skipping instances

**Backend:** `RecurrenceService.skip_instance()` at `:294-310`, API at `POST /instances/{id}/skip`.

**Frontend:** No button, gesture, or menu option to skip. The status `"skipped"` is fully supported in the data model and API but invisible to users.

### 3.2 No UI for recurrence_start / recurrence_end

**Backend:** `Task.recurrence_start` and `Task.recurrence_end` fields exist, with full logic in `materialize_instances()` at `:136-143`.

**Frontend:** Neither field appears in the task dialog or recurrence picker. Users cannot set "repeat until March 15" or "start repeating next Monday."

### 3.3 No UI for instance rescheduling

**Backend:** `RecurrenceService.schedule_instance()` at `:312-332`, API at `PUT /instances/{id}/schedule`.

**Frontend:** The drag-drop code at `drag-drop.js:783-789` explicitly **clears** the instance ID when dropping on a different day. The rescheduling capability exists in the API but isn't wired up.

### 3.4 "Weekly" preset is ambiguous

**Frontend:** `recurrence-picker.js:16` — `{ freq: 'weekly', interval: 1 }` with no `days_of_week`. Backend defaults to repeating on the same weekday as `dtstart`. The preview text shows "Every week" with no day indication.

### 3.5 Task list shows next occurrence but checks today's completion

**Files:** `app/routers/pages.py:176-189`, `app/templates/_task_list.html:17,26`

- **Date shown:** `task_item.next_occurrence` (next pending instance)
- **Completion check:** `task_item.instance_completed_at` (today's instance only)

Scenario: User completes today (Monday). Next occurrence is Wednesday. Task list shows "Feb 04" with a checked checkbox — visual mismatch between the date shown and the completion state.

### 3.6 Recurring task without time shows on calendar but not in GCal

Documented and intentional (prevents habit clutter in GCal), but creates a discrepancy for users who rely on GCal as their primary view.

### 3.7 No "complete all past instances" mechanism

When a user returns after a week, 7 pending instances exist per daily task. No batch completion. Each must be completed individually. Past instances are invisible in the task panel.

### 3.8 Recurring task in task list is not draggable

`_task_list.html:32` — tasks with `scheduled_date` are non-draggable. Recurring tasks typically have one, making them stuck.

### 3.9 `time` in recurrence_rule vs `scheduled_time` on Task

Two sources of time: `task.recurrence_rule.time` and `task.scheduled_time`. Backend resolves rule time over task time (`recurrence_service.py:146-152`). The UI has both pickers, and the task's time field becomes misleading when overridden.

---

## 4. Summary Matrix

| Issue | Type | Severity | Affects |
|---|---|---|---|
| 2.1 `aria-pressed` wrong for recurring | Contradiction | Medium | Accessibility |
| 2.2 Recurrence fields silently dropped on edit | Contradiction | High | Data integrity |
| 2.3 Toast says "Task" not "Instance" | Contradiction | Low | UX clarity |
| 3.1 No skip UI | Gap | Medium | Daily habits workflow |
| 3.2 No recurrence_start/end UI | Gap | Medium | Feature completeness |
| 3.3 No instance rescheduling UI | Gap | Medium | Calendar flexibility |
| 3.4 "Weekly" preset day ambiguity | Gap | Medium | User confusion |
| 3.5 Next occurrence vs today's completion | Gap | Medium | Visual accuracy |
| 3.7 No batch completion for past instances | Gap | Medium | Return-from-absence UX |
| 3.9 Dual time sources (rule vs task) | Gap | Low | Mental model |
| 3.8 Recurring not draggable | Gap | Low | Calendar interaction |
