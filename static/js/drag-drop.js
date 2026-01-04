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

    let draggedElement = null;
    let draggedTaskId = null;
    let draggedDuration = DEFAULT_DURATION;
    let isDraggingScheduledTask = false;
    let dropIndicator = null;
    let wasDroppedSuccessfully = false;
    let trashBin = null;

    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================

    /**
     * Initialize drag and drop functionality.
     */
    function init() {
        const tasks = document.querySelectorAll('.task-item[draggable="true"]');
        const scheduledFromDb = document.querySelectorAll('.scheduled-task.from-db');
        const slots = document.querySelectorAll('.hour-slot[data-droppable="true"]');

        log.info(`Initializing: ${tasks.length} tasks, ${scheduledFromDb.length} scheduled, ${slots.length} slots`);

        // Attach task drag handlers
        tasks.forEach(task => {
            task.addEventListener('dragstart', handleDragStart);
            task.addEventListener('dragend', handleDragEnd);
        });

        // Attach drag handlers to scheduled tasks from DB (for rescheduling/unscheduling)
        scheduledFromDb.forEach(task => {
            task.draggable = true;
            task.addEventListener('dragstart', handleDragStart);
            task.addEventListener('dragend', handleDragEnd); // Same handler now
        });

        // Attach slot drop handlers
        slots.forEach(slot => {
            slot.addEventListener('dragover', handleDragOver);
            slot.addEventListener('dragenter', handleDragEnter);
            slot.addEventListener('dragleave', handleDragLeave);
            slot.addEventListener('drop', handleDrop);
        });

        // Initial overlap calculation for pre-existing events
        document.querySelectorAll('.day-calendar').forEach(cal => {
            if (cal.querySelectorAll('[data-start-mins]').length > 0) {
                recalculateOverlaps(cal);
            }
        });

        // Create trash bin
        createTrashBin();
    }

    // ==========================================================================
    // TRASH BIN
    // ==========================================================================

    function createTrashBin() {
        trashBin = document.createElement('div');
        trashBin.className = 'trash-bin';
        trashBin.innerHTML = '🗑️';
        trashBin.style.display = 'none';
        document.body.appendChild(trashBin);

        // Trash bin event handlers
        trashBin.addEventListener('dragover', handleTrashDragOver);
        trashBin.addEventListener('dragenter', handleTrashDragEnter);
        trashBin.addEventListener('dragleave', handleTrashDragLeave);
        trashBin.addEventListener('drop', handleTrashDrop);
    }

    function showTrashBin() {
        if (trashBin) {
            trashBin.style.display = 'flex';
            // Animate in
            requestAnimationFrame(() => {
                trashBin.classList.add('visible');
            });
        }
    }

    function hideTrashBin() {
        if (trashBin) {
            trashBin.classList.remove('visible', 'drag-over');
            // Wait for animation then hide
            setTimeout(() => {
                if (trashBin && !trashBin.classList.contains('visible')) {
                    trashBin.style.display = 'none';
                }
            }, 200);
        }
    }

    function handleTrashDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    function handleTrashDragEnter(e) {
        e.preventDefault();
        trashBin.classList.add('drag-over');
    }

    function handleTrashDragLeave(e) {
        trashBin.classList.remove('drag-over');
    }

    async function handleTrashDrop(e) {
        e.preventDefault();
        trashBin.classList.remove('drag-over');

        let taskData;
        try {
            taskData = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch {
            log.error('Invalid drag data for trash');
            return;
        }

        const { taskId } = taskData;
        if (!taskId) return;

        wasDroppedSuccessfully = true; // Prevent unschedule logic

        // Remove all task elements from UI immediately
        const taskElements = document.querySelectorAll(`[data-task-id="${taskId}"]`);
        const removedElements = [];
        taskElements.forEach(el => {
            const parent = el.parentElement;
            const dayCalendar = el.closest('.day-calendar');
            removedElements.push({ el, parent, dayCalendar });
            el.remove();
            if (dayCalendar) recalculateOverlaps(dayCalendar);
        });

        // Delete via API
        try {
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                log.info(`Deleted task ${taskId}`);
            } else {
                log.error(`Failed to delete task ${taskId}`);
                // Restore elements on failure
                removedElements.forEach(({ el, parent, dayCalendar }) => {
                    if (parent) {
                        parent.appendChild(el);
                        if (dayCalendar) recalculateOverlaps(dayCalendar);
                    }
                });
                alert('Failed to delete task');
            }
        } catch (err) {
            log.error(`Failed to delete task ${taskId}:`, err);
            // Restore elements on failure
            removedElements.forEach(({ el, parent, dayCalendar }) => {
                if (parent) {
                    parent.appendChild(el);
                    if (dayCalendar) recalculateOverlaps(dayCalendar);
                }
            });
            alert('Failed to delete task. Please try again.');
        }
    }

    // ==========================================================================
    // DRAG HANDLERS
    // ==========================================================================

    function handleDragStart(e) {
        draggedElement = e.target.closest('.task-item, .scheduled-task');
        if (!draggedElement) return;

        // Prevent dragging task-items that are already scheduled
        if (draggedElement.classList.contains('task-item') && draggedElement.classList.contains('scheduled')) {
            e.preventDefault();
            return;
        }

        isDraggingScheduledTask = draggedElement.classList.contains('scheduled-task');
        draggedTaskId = draggedElement.dataset.taskId;
        wasDroppedSuccessfully = false; // Reset flag

        // Get content - for scheduled tasks, exclude the occurrence-day span text
        const textElement = draggedElement.querySelector('.task-text, .scheduled-task-text');
        let content = '';
        if (textElement) {
            // Clone and remove occurrence-day span to get clean text
            const clone = textElement.cloneNode(true);
            const occSpan = clone.querySelector('.occurrence-day');
            if (occSpan) occSpan.remove();
            content = clone.textContent.trim();
        }
        const duration = draggedElement.dataset.duration || '';
        const clarity = draggedElement.dataset.clarity || 'none';
        const instanceId = draggedElement.dataset.instanceId || '';
        const instanceDate = draggedElement.dataset.instanceDate || '';

        draggedDuration = parseInt(duration, 10) || DEFAULT_DURATION;

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({
            taskId: draggedTaskId,
            content: content.trim(),
            duration,
            clarity,
            isScheduled: isDraggingScheduledTask,
            instanceId,
            instanceDate,
        }));

        // Delay style changes until after browser captures drag image
        setTimeout(() => {
            if (draggedElement) {
                draggedElement.classList.add('dragging');
                if (isDraggingScheduledTask) {
                    draggedElement.style.visibility = 'hidden';
                }
            }
        }, 0);

        // Show trash bin when dragging
        showTrashBin();

        log.debug(`Drag start: ${draggedTaskId}, ${draggedDuration}min`);
    }

    /**
     * Handle drag end - unschedule if a scheduled task was dropped outside calendar
     */
    async function handleDragEnd(e) {
        const taskId = draggedTaskId;
        const element = draggedElement;
        const wasScheduledTask = element?.classList.contains('scheduled-task');
        const shouldUnschedule = !wasDroppedSuccessfully && wasScheduledTask && taskId && element;

        if (element) {
            element.classList.remove('dragging');
            // Only reset inline styles if we're NOT about to remove the element
            if (!shouldUnschedule) {
                element.style.visibility = '';
                element.style.opacity = '';
                element.style.pointerEvents = '';
            }
        }

        // Unschedule if a scheduled task was dropped outside calendar
        if (shouldUnschedule) {
            // Element is still hidden from drag, now remove from DOM (no flash)
            const parent = element.parentElement;
            const dayCalendar = element.closest('.day-calendar');
            element.remove();

            // Unschedule via API
            try {
                const response = await fetch(`/api/tasks/${taskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        scheduled_date: null,
                        scheduled_time: null,
                    }),
                });

                if (response.ok) {
                    // Recalculate overlaps after removal
                    if (dayCalendar) recalculateOverlaps(dayCalendar);
                    // Check if task exists in task list
                    const taskInList = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
                    if (taskInList) {
                        // Just remove the scheduled styling
                        taskInList.classList.remove('scheduled');
                    } else {
                        // Task doesn't exist in task list (was DB-scheduled), need to reload
                        window.location.reload();
                    }
                } else {
                    log.error('Failed to unschedule task');
                    // Restore element on failure
                    if (parent) {
                        parent.appendChild(element);
                        element.style.visibility = '';
                    }
                    if (dayCalendar) recalculateOverlaps(dayCalendar);
                }
            } catch (err) {
                log.error('Failed to unschedule task:', err);
                // Restore element on failure
                if (parent) {
                    parent.appendChild(element);
                    element.style.visibility = '';
                }
                if (dayCalendar) recalculateOverlaps(dayCalendar);
            }
        }

        // Reset state
        draggedElement = null;
        draggedTaskId = null;
        isDraggingScheduledTask = false;
        wasDroppedSuccessfully = false;
        removeDropIndicator();
        hideTrashBin();

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

    async function handleDrop(e) {
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

        const { taskId, content, duration, clarity, instanceId, instanceDate } = taskData;
        if (!taskId) return;

        const hourRow = slot.closest('.hour-row');
        const dayCalendar = slot.closest('.day-calendar');
        const hour = parseInt(hourRow?.dataset.hour, 10);
        // Use actual-date for adjacent day hours, otherwise use the day calendar's date
        const day = hourRow?.dataset.actualDate || dayCalendar?.dataset.day;

        if (isNaN(hour) || !day) {
            log.error('Invalid drop location');
            return;
        }

        const { minutes } = calculateDropPosition(e, slot);

        // Remove the dragged element if it's a scheduled task being rescheduled
        if (draggedElement?.classList.contains('scheduled-task')) {
            const oldCalendar = draggedElement.closest('.day-calendar');
            draggedElement.remove();
            if (oldCalendar && oldCalendar !== dayCalendar) {
                recalculateOverlaps(oldCalendar);
            }
        }

        // Create and place scheduled task immediately for visual feedback
        const element = createScheduledTaskElement(taskId, content, duration, hour, minutes, clarity, instanceId, instanceDate);
        slot.appendChild(element);
        wasDroppedSuccessfully = true; // Mark successful drop

        // Mark original task in task list
        const original = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
        if (original) original.classList.add('scheduled');

        recalculateOverlaps(dayCalendar);

        // Save to API immediately
        const scheduledDate = day;
        const scheduledTime = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

        try {
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scheduled_date: scheduledDate,
                    scheduled_time: scheduledTime,
                }),
            });

            if (response.ok) {
                log.info(`Scheduled ${taskId} at ${day} ${hour}:${String(minutes).padStart(2, '0')}`);
                // No reload needed - optimistic update is sufficient
            } else {
                log.error(`Failed to schedule task ${taskId}`);
                // Remove the optimistic element on failure
                element.remove();
                if (original) original.classList.remove('scheduled');
                recalculateOverlaps(dayCalendar);
                alert('Failed to schedule task. Please try again.');
            }
        } catch (error) {
            log.error(`Failed to schedule task ${taskId}:`, error);
            element.remove();
            if (original) original.classList.remove('scheduled');
            recalculateOverlaps(dayCalendar);
            alert('Failed to schedule task. Please try again.');
        }
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
     * @param {string} instanceId - Instance ID (for recurring tasks)
     * @param {string} instanceDate - Instance date ISO string (for recurring tasks)
     * @returns {HTMLElement} Scheduled task element
     */
    function createScheduledTaskElement(taskId, content, duration, hour, minutes = 0, clarity = 'none', instanceId = '', instanceDate = '') {
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

        // Add instance data for recurring tasks
        if (instanceId) {
            el.dataset.instanceId = instanceId;
            el.classList.add('recurring-instance');
        }
        if (instanceDate) {
            el.dataset.instanceDate = instanceDate;
        }

        // Duration class for CSS styling
        if (durationMins < 30) el.classList.add('duration-short');
        else if (durationMins < 60) el.classList.add('duration-medium');
        else el.classList.add('duration-long');

        const timeStr = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        const durationStr = durationMins >= 30 ? formatDuration(durationMins) : '';

        // Format occurrence day for recurring instances
        let occurrenceBadge = '';
        if (instanceDate) {
            const occDate = new Date(instanceDate);
            const dayName = occDate.toLocaleDateString('en-US', { weekday: 'short' });
            occurrenceBadge = `<span class="occurrence-day">${dayName}</span>`;
        }

        el.innerHTML = `
            <div class="scheduled-task-left">
                <span class="scheduled-task-time">${timeStr}</span>
                ${durationStr ? `<span class="scheduled-task-duration">${durationStr}</span>` : ''}
            </div>
            <span class="scheduled-task-text">${escapeHtml(content)}${occurrenceBadge}</span>
        `;

        el.addEventListener('dragstart', handleDragStart);
        el.addEventListener('dragend', handleDragEnd);

        return el;
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

    // Expose functions needed by other modules
    window.createScheduledTaskElement = createScheduledTaskElement;
    window.recalculateOverlaps = recalculateOverlaps;

    document.addEventListener('DOMContentLoaded', init);

})();
