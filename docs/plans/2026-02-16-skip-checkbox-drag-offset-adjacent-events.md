---
version:
pr:
created: 2026-02-16
---

# Fix: Skip checkbox loss, drag offset, adjacent-day events

## Context

Three UI bugs reported:
1. Moving a recurring task from Anytime banner to a timed slot and back loses the "skip this one" button until reload
2. Drag preview always shows as if grabbed by the head, regardless of where on the task you clicked
3. Today's calendar doesn't show tomorrow's Google Calendar events in the adjacent "next morning" hours (00:00-05:59)

---

## Bug 1: Skip button lost after Anytime → Timed → Anytime

**Root cause:** `createDateOnlyTaskElement()` (drag-drop.js:1455) doesn't accept `instanceId`/`instanceDate` parameters and always creates an "unschedule" button. When a recurring task moves from Anytime → timed slot, `createScheduledTaskElement()` correctly preserves instance data (line 1221-1227) and shows the "skip" button (line 1245). But when dragging back to Anytime, `handleAnytimeDrop()` (line 1362) doesn't extract instance data from `taskData`, and the new date-only element lacks `data-instance-id` and the skip button.

**Files to modify:** `static/js/drag-drop.js`

**Changes:**

1. **`handleAnytimeDrop()` (line 1362):** Add `instanceId`, `instanceDate` to destructuring:
   ```js
   const { taskId, content, duration, clarity, impact, completed, isScheduled, isDateOnly, instanceId, instanceDate } = taskData;
   ```

2. **`handleAnytimeDrop()` (line 1394):** Pass instance data to `createDateOnlyTaskElement`:
   ```js
   const el = createDateOnlyTaskElement(taskId, content, duration, clarity, impact, completed, instanceId, instanceDate);
   ```

3. **`createDateOnlyTaskElement()` (line 1455):** Add `instanceId` and `instanceDate` params:
   ```js
   function createDateOnlyTaskElement(taskId, content, duration, clarity, impact, completed = '0', instanceId = '', instanceDate = '') {
   ```

4. **Inside `createDateOnlyTaskElement()`:** After setting existing dataset props, add instance data:
   ```js
   if (instanceId) {
       el.dataset.instanceId = instanceId;
       el.dataset.isRecurring = 'true';
   }
   if (instanceDate) {
       el.dataset.instanceDate = instanceDate;
   }
   ```

5. **Quick-action button (line 1484):** Use skip button when instanceId present (mirror `createScheduledTaskElement` pattern at line 1245):
   ```js
   const quickAction = instanceId
       ? '<button class="calendar-quick-action" data-action="skip" ...>skip icon</button>'
       : '<button class="calendar-quick-action" data-action="unschedule" ...>unschedule icon</button>';
   ```

---

## Bug 2: Drag preview offset

**Root cause:** `handleDragStart()` (drag-drop.js:705) never calls `e.dataTransfer.setDragImage()`. The browser captures the element as the drag image with a default offset, making it appear as if grabbed by the head.

**File to modify:** `static/js/drag-drop.js`

**Changes:**

1. **In `handleDragStart()`, before `setTimeout` (around line 764):** Calculate offset and set drag image:
   ```js
   const rect = draggedElement.getBoundingClientRect();
   const offsetX = e.clientX - rect.left;
   const offsetY = e.clientY - rect.top;
   e.dataTransfer.setDragImage(draggedElement, offsetX, offsetY);
   ```

---

## Bug 3: Adjacent-day hours don't render events

**Root cause:** The "next morning" (dashboard.html:282-289) and "previous evening" (dashboard.html:201-208) adjacent-day sections render empty `hour-slot` divs. Events/tasks are only rendered in the main 0-23 hour loop (line 215-275). Data IS fetched from Google Calendar but the adjacent sections don't use it.

**Files to modify:**
- `app/routers/pages.py` — pass `events_by_date` and `scheduled_tasks_by_date` to template
- `app/templates/dashboard.html` — render events in adjacent-day sections

**Changes:**

### pages.py (around line 385, template context)
Add two new template variables:
```python
"events_by_date": events_by_date,       # from line ~363
"scheduled_tasks_by_date": scheduled_tasks_by_date,
```

Note: `events_by_date` is built at line 363-366 but only used locally. Need to ensure it's defined even when Google Calendar is not connected (default to `{}`). Currently it's only defined inside the `if google_token:` block, so initialize it before:
```python
events_by_date = {}   # before the google_token block
```

### dashboard.html — Previous evening hours (lines 201-208)
Render events from previous day for hours 21-23, mirroring the main hour loop pattern:
```html
{% for hour in range(21, 24) %}
<div class="hour-row adjacent-day prev-day" data-hour="{{ hour }}" data-actual-date="{{ prev_day.isoformat() }}">
    <span class="hour-label">{{ '%02d' % hour }}:00</span>
    <div class="hour-slot" data-droppable="true">
        {# Google Calendar events from previous day #}
        {% for event in events_by_date.get(prev_day, []) if not event.all_day and event.start.hour == hour %}
        ... render event (same template as main loop lines 220-236) ...
        {% endfor %}
        {# Scheduled native tasks from previous day #}
        {% for scheduled in scheduled_tasks_by_date.get(prev_day, []) if scheduled.start.hour == hour %}
        ... render scheduled task (same template as main loop lines 238-272) ...
        {% endfor %}
    </div>
</div>
{% endfor %}
```

### dashboard.html — Next morning hours (lines 282-289)
Same pattern for next day, hours 0-5:
```html
{% for hour in range(0, 6) %}
<div class="hour-row adjacent-day next-day" data-hour="{{ hour }}" data-actual-date="{{ next_day.isoformat() }}">
    <span class="hour-label">{{ '%02d' % hour }}:00</span>
    <div class="hour-slot" data-droppable="true">
        {% for event in events_by_date.get(next_day, []) if not event.all_day and event.start.hour == hour %}
        ... render event ...
        {% endfor %}
        {% for scheduled in scheduled_tasks_by_date.get(next_day, []) if scheduled.start.hour == hour %}
        ... render scheduled task ...
        {% endfor %}
    </div>
</div>
{% endfor %}
```

To avoid duplicating the event/task rendering HTML, extract Jinja2 macros for `render_calendar_event` and `render_scheduled_task`, then call them from both the main loop and adjacent-day sections.

---

## Verification

1. **Bug 1:** Create a recurring task scheduled for today. Drag from Anytime banner → timed slot → back to Anytime. Verify the "skip" button appears on the date-only task (not "unschedule"). Verify the context menu also shows "Skip this one".

2. **Bug 2:** Drag a task by its bottom edge. Verify the drag preview shows the cursor at the bottom of the ghost, not the top.

3. **Bug 3:** Have a Google Calendar event at 02:00 AM tomorrow. Open today's calendar and scroll to the "next morning" section. Verify the event appears at the 02:00 slot.

4. Run full checks: `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
