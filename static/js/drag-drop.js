/**
 * Drag and Drop Module for Task Scheduling
 *
 * @module DragDrop
 * @description Enables dragging tasks from the task list to calendar time slots.
 *
 * Features:
 * - Drag tasks from task list to calendar
 * - 15-minute interval snapping
 * - Reschedule by dragging scheduled tasks
 * - Remove by dragging out of calendar
 * - Overlap detection and side-by-side display
 * - Commit scheduled tasks to Todoist API
 */
(function () {
    'use strict';

    // ==========================================================================
    // CONFIGURATION
    // ==========================================================================

    const DEBUG = false;
    const LOG_PREFIX = '[DragDrop]';

    const log = {
        info: (...args) => console.log(LOG_PREFIX, ...args),
        debug: (...args) => DEBUG && console.debug(LOG_PREFIX, ...args),
        warn: (...args) => console.warn(LOG_PREFIX, ...args),
        error: (...args) => console.error(LOG_PREFIX, ...args),
        group: (label) => DEBUG && console.group(`${LOG_PREFIX} ${label}`),
        groupEnd: () => DEBUG && console.groupEnd(),
    };

    // ==========================================================================
    // CONSTANTS
    // ==========================================================================

    const HOUR_HEIGHT_PX_DESKTOP = 60;
    const HOUR_HEIGHT_PX_MOBILE = 40;
    const DEFAULT_DURATION = 30;
    const MAX_OVERLAP_COLUMNS = 3;

    /**
     * Get the current hour height based on screen size.
     * Matches CSS media query: (max-width: 900px), (orientation: portrait)
     * @returns {number} Height in pixels
     */
    function getHourHeight() {
        const isMobile = window.matchMedia('(max-width: 900px), (orientation: portrait)').matches;
        return isMobile ? HOUR_HEIGHT_PX_MOBILE : HOUR_HEIGHT_PX_DESKTOP;
    }

    // ==========================================================================
    // STATE
    // ==========================================================================

    /** @type {Map<string, {day: string, hour: number, minutes: number, element: HTMLElement}>} */
    const scheduledTasks = new Map();

    let draggedElement = null;
    let draggedTaskId = null;
    let draggedDuration = DEFAULT_DURATION;
    let isDraggingScheduledTask = false;
    let dropIndicator = null;

    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================

    /**
     * Initialize drag and drop functionality.
     */
    function init() {
        const tasks = document.querySelectorAll('.task-item[draggable="true"]');
        const slots = document.querySelectorAll('.hour-slot[data-droppable="true"]');

        log.info(`Initializing: ${tasks.length} tasks, ${slots.length} slots`);

        // Attach task drag handlers
        tasks.forEach(task => {
            task.addEventListener('dragstart', handleDragStart);
            task.addEventListener('dragend', handleDragEnd);
        });

        // Attach slot drop handlers
        slots.forEach(slot => {
            slot.addEventListener('dragover', handleDragOver);
            slot.addEventListener('dragenter', handleDragEnter);
            slot.addEventListener('dragleave', handleDragLeave);
            slot.addEventListener('drop', handleDrop);
        });

        // Commit/discard buttons
        document.getElementById('commit-btn')?.addEventListener('click', commitToTodoist);
        document.getElementById('discard-btn')?.addEventListener('click', discardAll);

        // Initial overlap calculation for pre-existing events
        document.querySelectorAll('.day-calendar').forEach(cal => {
            if (cal.querySelectorAll('[data-start-mins]').length > 0) {
                recalculateOverlaps(cal);
            }
        });

        updateCommitBar();
    }

    // ==========================================================================
    // DRAG HANDLERS
    // ==========================================================================

    function handleDragStart(e) {
        draggedElement = e.target.closest('.task-item, .scheduled-task');
        if (!draggedElement) return;

        isDraggingScheduledTask = draggedElement.classList.contains('scheduled-task');
        draggedTaskId = draggedElement.dataset.taskId;

        const content = draggedElement.querySelector('.task-text, .scheduled-task-text')?.textContent || '';
        const duration = draggedElement.dataset.duration || '';
        const clarity = draggedElement.dataset.clarity || 'none';

        draggedDuration = parseInt(duration, 10) || DEFAULT_DURATION;

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({
            taskId: draggedTaskId,
            content: content.trim(),
            duration,
            clarity,
            isScheduled: isDraggingScheduledTask,
        }));

        requestAnimationFrame(() => draggedElement.classList.add('dragging'));
        log.debug(`Drag start: ${draggedTaskId}, ${draggedDuration}min`);
    }

    function handleDragEnd(e) {
        // Check if scheduled task was dragged out of calendar
        if (isDraggingScheduledTask && draggedTaskId) {
            const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
            if (!dropTarget?.closest('.hour-slot[data-droppable="true"]')) {
                removeScheduledTask(draggedTaskId);
            }
        }

        if (draggedElement) {
            draggedElement.classList.remove('dragging');
        }

        // Reset state
        draggedElement = null;
        draggedTaskId = null;
        isDraggingScheduledTask = false;
        removeDropIndicator();

        document.querySelectorAll('.hour-slot.drag-over').forEach(s => s.classList.remove('drag-over'));
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const slot = e.target.closest('.hour-slot');
        if (!slot) return;

        const { quarterIndex, minutes, hour } = calculateDropPosition(e, slot);
        updateDropIndicator(slot, hour, minutes);
    }

    function handleDragEnter(e) {
        e.preventDefault();
        e.target.closest('.hour-slot')?.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        const slot = e.target.closest('.hour-slot');
        const relatedSlot = e.relatedTarget?.closest('.hour-slot');
        if (slot && slot !== relatedSlot) {
            slot.classList.remove('drag-over');
            removeDropIndicator();
        }
    }

    function handleDrop(e) {
        e.preventDefault();

        const slot = e.target.closest('.hour-slot');
        if (!slot) return;

        slot.classList.remove('drag-over');
        removeDropIndicator();

        let taskData;
        try {
            taskData = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch {
            log.error('Invalid drag data');
            return;
        }

        const { taskId, content, duration, clarity } = taskData;
        if (!taskId) return;

        const hourRow = slot.closest('.hour-row');
        const dayCalendar = slot.closest('.day-calendar');
        const hour = parseInt(hourRow?.dataset.hour, 10);
        const day = dayCalendar?.dataset.day;

        if (isNaN(hour) || !day) {
            log.error('Invalid drop location');
            return;
        }

        const { minutes } = calculateDropPosition(e, slot);

        // Remove from previous position if rescheduling
        if (scheduledTasks.has(taskId)) {
            scheduledTasks.get(taskId).element.remove();
            scheduledTasks.delete(taskId);
        }

        // Create and place scheduled task
        const element = createScheduledTaskElement(taskId, content, duration, hour, minutes, clarity);
        slot.appendChild(element);

        scheduledTasks.set(taskId, { day, hour, minutes, element });
        log.info(`Scheduled ${taskId} at ${day} ${hour}:${String(minutes).padStart(2, '0')}`);

        // Mark original task
        const original = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
        if (original) original.classList.add('scheduled');

        recalculateOverlaps(dayCalendar);
        updateCommitBar();
    }

    // ==========================================================================
    // DROP INDICATOR
    // ==========================================================================

    function calculateDropPosition(e, slot) {
        const slotRect = slot.getBoundingClientRect();
        const dropY = e.clientY - slotRect.top;
        const quarterIndex = Math.min(Math.floor((dropY / slotRect.height) * 4), 3);
        const minutes = quarterIndex * 15;
        const hour = parseInt(slot.closest('.hour-row')?.dataset.hour, 10);
        return { quarterIndex, minutes, hour };
    }

    function updateDropIndicator(slot, hour, minutes) {
        if (!dropIndicator) {
            dropIndicator = document.createElement('div');
            dropIndicator.className = 'drop-indicator';
        }

        const hourHeight = getHourHeight();
        const topPx = (minutes / 60) * hourHeight;
        const heightPx = (draggedDuration / 60) * hourHeight;

        dropIndicator.style.top = `${topPx}px`;
        dropIndicator.style.height = `${heightPx}px`;
        dropIndicator.textContent = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

        if (dropIndicator.parentElement !== slot) {
            slot.appendChild(dropIndicator);
        }
    }

    function removeDropIndicator() {
        dropIndicator?.remove();
    }

    // ==========================================================================
    // SCHEDULED TASK ELEMENT
    // ==========================================================================

    /**
     * Create a scheduled task element for the calendar.
     * @param {string} taskId - Task ID
     * @param {string} content - Task content
     * @param {string|number} duration - Duration in minutes
     * @param {number} hour - Hour (0-23)
     * @param {number} minutes - Minutes (0, 15, 30, 45)
     * @param {string} clarity - Clarity level
     * @returns {HTMLElement} Scheduled task element
     */
    function createScheduledTaskElement(taskId, content, duration, hour, minutes = 0, clarity = 'none') {
        const durationMins = parseInt(duration, 10) || DEFAULT_DURATION;
        const startMins = hour * 60 + minutes;
        const endMins = startMins + durationMins;
        const hourHeight = getHourHeight();
        const heightPx = (durationMins / 60) * hourHeight;
        const topPx = (minutes / 60) * hourHeight;

        const el = document.createElement('div');
        el.className = `scheduled-task clarity-${clarity}`;
        el.dataset.taskId = taskId;
        el.dataset.duration = durationMins;
        el.dataset.clarity = clarity;
        el.dataset.startMins = startMins;
        el.dataset.endMins = endMins;
        el.draggable = true;
        el.style.height = `${heightPx}px`;
        el.style.top = `${topPx}px`;

        // Duration class for CSS styling
        if (durationMins < 30) el.classList.add('duration-short');
        else if (durationMins < 60) el.classList.add('duration-medium');
        else el.classList.add('duration-long');

        const timeStr = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        const durationStr = durationMins >= 30 ? formatDuration(durationMins) : '';

        el.innerHTML = `
            <div class="scheduled-task-left">
                <span class="scheduled-task-time">${timeStr}</span>
                ${durationStr ? `<span class="scheduled-task-duration">${durationStr}</span>` : ''}
            </div>
            <span class="scheduled-task-text">${escapeHtml(content)}</span>
        `;

        el.addEventListener('dragstart', handleDragStart);
        el.addEventListener('dragend', handleDragEnd);

        return el;
    }

    // ==========================================================================
    // TASK MANAGEMENT
    // ==========================================================================

    function removeScheduledTask(taskId) {
        const data = scheduledTasks.get(taskId);
        if (!data) return;

        const dayCalendar = data.element.closest('.day-calendar');
        data.element.remove();
        scheduledTasks.delete(taskId);

        const original = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
        if (original) original.classList.remove('scheduled');

        if (dayCalendar) recalculateOverlaps(dayCalendar);
        updateCommitBar();

        log.debug(`Removed scheduled task ${taskId}`);
    }

    function discardAll() {
        if (scheduledTasks.size === 0) return;

        log.info(`Discarding ${scheduledTasks.size} tasks`);
        const calendars = new Set();

        scheduledTasks.forEach(({ element }, taskId) => {
            const cal = element.closest('.day-calendar');
            if (cal) calendars.add(cal);
            element.remove();

            const original = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
            if (original) original.classList.remove('scheduled');
        });

        scheduledTasks.clear();
        calendars.forEach(cal => recalculateOverlaps(cal));
        updateCommitBar();
    }

    // ==========================================================================
    // COMMIT TO TODOIST
    // ==========================================================================

    async function commitToTodoist() {
        if (scheduledTasks.size === 0) return;

        const btn = document.getElementById('commit-btn');
        const textEl = btn?.querySelector('.commit-btn-text');
        const loadingEl = btn?.querySelector('.commit-btn-loading');

        // Prepare payload
        const tasks = [];
        scheduledTasks.forEach(({ day, hour, minutes, element }, taskId) => {
            const duration = parseInt(element.dataset.duration, 10) || DEFAULT_DURATION;
            const dueDateTime = `${day}T${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
            tasks.push({ task_id: taskId, due_datetime: dueDateTime, duration_minutes: duration });
        });

        // Loading state
        if (btn) btn.disabled = true;
        if (textEl) textEl.style.display = 'none';
        if (loadingEl) loadingEl.style.display = 'inline';
        btn?.classList.remove('success', 'error');

        try {
            const response = await fetch('/api/tasks/commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tasks }),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();
            log.info(`Commit: ${result.success_count} succeeded, ${result.failure_count} failed`);

            if (result.failure_count === 0) {
                scheduledTasks.clear();
                if (textEl) textEl.textContent = `${result.success_count} committed!`;
                btn?.classList.add('success');
                if (loadingEl) loadingEl.style.display = 'none';
                if (textEl) textEl.style.display = 'inline';

                setTimeout(() => {
                    window.location = window.location.href + '?t=' + Date.now();
                }, 1500);
            } else {
                handleCommitErrors(result, btn, textEl);
            }
        } catch (error) {
            log.error('Commit failed:', error);
            if (textEl) textEl.textContent = 'Commit failed';
            btn?.classList.add('error');
            resetCommitButton(btn, textEl, loadingEl);
        }
    }

    function handleCommitErrors(result, btn, textEl) {
        const failed = result.results.filter(r => !r.success);
        log.error('Failed tasks:', failed);

        if (textEl) {
            textEl.textContent = `${result.failure_count} failed`;
            textEl.style.display = 'inline';
        }
        btn?.classList.add('error');

        // Remove successful tasks
        result.results.filter(r => r.success).forEach(r => removeScheduledTask(r.task_id));

        setTimeout(() => {
            if (textEl) textEl.textContent = 'Commit';
            btn?.classList.remove('error');
            if (btn) btn.disabled = false;
            updateCommitBar();
        }, 3000);
    }

    function resetCommitButton(btn, textEl, loadingEl) {
        setTimeout(() => {
            if (textEl) textEl.textContent = 'Commit';
            btn?.classList.remove('error');
            if (btn) btn.disabled = false;
            if (loadingEl) loadingEl.style.display = 'none';
            if (textEl) textEl.style.display = 'inline';
        }, 3000);
    }

    // ==========================================================================
    // OVERLAP DETECTION
    // ==========================================================================

    /**
     * Recalculate overlapping events and apply side-by-side positioning.
     * @param {HTMLElement} dayCalendar - Day calendar container
     */
    function recalculateOverlaps(dayCalendar) {
        const events = Array.from(
            dayCalendar.querySelectorAll('.calendar-event[data-start-mins], .scheduled-task[data-start-mins]')
        );

        // Clear existing styles
        events.forEach(el => {
            el.style.left = '';
            el.style.right = '';
            el.style.width = '';
            el.classList.remove('overlapping');
        });

        if (events.length < 2) return;

        // Sort by start time
        events.sort((a, b) => parseInt(a.dataset.startMins) - parseInt(b.dataset.startMins));

        // Find overlapping groups
        const groups = [];
        let currentGroup = [events[0]];

        for (let i = 1; i < events.length; i++) {
            const currStart = parseInt(events[i].dataset.startMins);
            const overlaps = currentGroup.some(e => currStart < parseInt(e.dataset.endMins));

            if (overlaps) {
                currentGroup.push(events[i]);
            } else {
                if (currentGroup.length > 1) groups.push(currentGroup);
                currentGroup = [events[i]];
            }
        }
        if (currentGroup.length > 1) groups.push(currentGroup);

        // Apply positioning
        groups.forEach(group => {
            const cols = Math.min(group.length, MAX_OVERLAP_COLUMNS);
            const widthPct = 100 / cols;

            group.slice(0, MAX_OVERLAP_COLUMNS).forEach((el, idx) => {
                el.style.width = `${widthPct}%`;
                el.style.left = `${idx * widthPct}%`;
                el.style.right = 'auto';
                el.classList.add('overlapping');
            });
        });

        log.debug(`${dayCalendar.dataset.day}: ${groups.length} overlap groups`);
    }

    // ==========================================================================
    // UI HELPERS
    // ==========================================================================

    function updateCommitBar() {
        const bar = document.getElementById('commit-bar');
        const countEl = document.getElementById('scheduled-count');
        const count = scheduledTasks.size;

        if (bar) bar.style.display = count > 0 ? 'flex' : 'none';
        if (countEl) countEl.textContent = count;
    }

    function formatDuration(mins) {
        if (mins >= 60) {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return m > 0 ? `${h}h${m}m` : `${h}h`;
        }
        return `${mins}m`;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==========================================================================
    // EXPORTS
    // ==========================================================================

    // Expose functions needed by plan-tasks.js
    window.scheduledTasks = scheduledTasks;
    window.createScheduledTaskElement = createScheduledTaskElement;
    window.recalculateOverlaps = recalculateOverlaps;
    window.updateCommitBar = updateCommitBar;

    document.addEventListener('DOMContentLoaded', init);

})();
