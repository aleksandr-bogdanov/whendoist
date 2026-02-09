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

    const DEFAULT_DURATION = 30;
    const MAX_OVERLAP_COLUMNS = 3;
    const ZOOM_STEPS = [30, 40, 50, 60, 70, 80, 90, 100];
    const ZOOM_MIN = 30;
    const ZOOM_MAX = 100;
    const ZOOM_WHEEL_SCALE = 0.15;
    let currentHourHeight = 60;
    let targetZoomHeight = 60;
    let pendingZoomDelta = 0;
    let zoomRAF = null;

    /**
     * Get the current hour height from module state.
     * @returns {number} Height in pixels
     */
    function getHourHeight() {
        return currentHourHeight;
    }

    /**
     * Set the hour height and update CSS variable.
     * @param {number} height - Height in pixels
     */
    function setHourHeight(height) {
        currentHourHeight = height;
        const panel = document.querySelector('.calendar-panel');
        if (panel) {
            panel.style.setProperty('--cal-hour-height', height + 'px');
        }
    }

    // ==========================================================================
    // STATE
    // ==========================================================================

    let draggedElement = null;
    let draggedTaskId = null;
    let draggedDuration = DEFAULT_DURATION;
    let isDraggingScheduledTask = false;
    let isDraggingDateOnlyTask = false;
    let dropIndicator = null;
    let wasDroppedSuccessfully = false;
    let trashBin = null;

    // ==========================================================================
    // ANIMATED REORDERING
    // ==========================================================================

    /**
     * Move a task to its sorted position in the scheduled section.
     * Scheduled tasks are sorted by date (soonest first).
     * Uses FLIP animation for smooth transition.
     * @param {HTMLElement} taskEl - The task element to move
     */
    function moveTaskToScheduledSection(taskEl) {
        if (!taskEl) return;
        const taskList = taskEl.closest('.task-list');
        if (!taskList) return;

        // Get current position
        const firstRect = taskEl.getBoundingClientRect();

        // Get this task's scheduled date for sorting
        const taskDate = taskEl.dataset.scheduledDate || '9999-12-31';

        // Find the correct insertion point within the scheduled section
        // Order: unscheduled pending → scheduled pending (by date) → completed → add-task-row
        const tasks = Array.from(taskList.querySelectorAll('.task-item'));
        const addTaskRow = taskList.querySelector('.add-task-row');
        let insertBefore = null;
        let foundScheduledSection = false;

        for (const t of tasks) {
            if (t === taskEl) continue;

            const isCompleted = t.classList.contains('completed') ||
                               t.dataset.completed === '1';
            const isScheduled = t.dataset.scheduledDate && t.dataset.scheduledDate !== '';

            // Skip unscheduled tasks - we need to go past them
            if (!isScheduled && !isCompleted) continue;

            // Found a completed task - insert before it (scheduled goes before completed)
            if (isCompleted) {
                insertBefore = t;
                break;
            }

            // Found a scheduled task - compare dates
            foundScheduledSection = true;
            const otherDate = t.dataset.scheduledDate || '9999-12-31';

            // Insert before the first scheduled task with a later date
            if (taskDate < otherDate) {
                insertBefore = t;
                break;
            }
        }

        // Insert at correct position
        if (insertBefore) {
            taskList.insertBefore(taskEl, insertBefore);
        } else if (addTaskRow) {
            taskList.insertBefore(taskEl, addTaskRow);
        } else {
            taskList.appendChild(taskEl);
        }

        // Get new position and animate
        const lastRect = taskEl.getBoundingClientRect();
        const deltaY = firstRect.top - lastRect.top;

        if (Math.abs(deltaY) > 5) {
            taskEl.style.transition = 'none';
            taskEl.style.transform = `translateY(${deltaY}px)`;
            taskEl.offsetHeight; // Force reflow
            taskEl.style.transition = 'transform 0.25s ease-out';
            taskEl.style.transform = '';
            taskEl.addEventListener('transitionend', () => {
                taskEl.style.transition = '';
            }, { once: true });
        }
    }

    /**
     * Move a task back to its sorted position (unscheduled section).
     * Uses impact as sort key.
     * @param {HTMLElement} taskEl - The task element to move
     */
    function moveTaskToUnscheduledSection(taskEl) {
        if (!taskEl) return;
        const taskList = taskEl.closest('.task-list');
        if (!taskList) return;

        // Get current position
        const firstRect = taskEl.getBoundingClientRect();

        // Get this task's impact for sorting
        const taskImpact = parseInt(taskEl.dataset.impact || '4', 10);

        // Find insertion point: among non-scheduled, non-completed tasks, sorted by impact
        const tasks = Array.from(taskList.querySelectorAll('.task-item'));
        let insertBefore = null;

        for (const t of tasks) {
            if (t === taskEl) continue;
            // Skip scheduled and completed tasks
            if (t.classList.contains('scheduled') ||
                t.classList.contains('completed') ||
                t.dataset.completed === '1') {
                // Insert before first scheduled/completed
                insertBefore = t;
                break;
            }
            // Insert based on impact (lower number = higher priority)
            const otherImpact = parseInt(t.dataset.impact || '4', 10);
            if (taskImpact < otherImpact) {
                insertBefore = t;
                break;
            }
        }

        // Insert at correct position
        if (insertBefore) {
            taskList.insertBefore(taskEl, insertBefore);
        } else {
            // If nothing found, put at end of unscheduled section
            const firstScheduled = taskList.querySelector('.task-item.scheduled');
            if (firstScheduled) {
                taskList.insertBefore(taskEl, firstScheduled);
            } else {
                taskList.appendChild(taskEl);
            }
        }

        // Get new position and animate
        const lastRect = taskEl.getBoundingClientRect();
        const deltaY = firstRect.top - lastRect.top;

        if (Math.abs(deltaY) > 5) {
            taskEl.style.transition = 'none';
            taskEl.style.transform = `translateY(${deltaY}px)`;
            taskEl.offsetHeight; // Force reflow
            taskEl.style.transition = 'transform 0.25s ease-out';
            taskEl.style.transform = '';
            taskEl.addEventListener('transitionend', () => {
                taskEl.style.transition = '';
            }, { once: true });
        }
    }

    /**
     * Update task item's scheduled date display.
     * @param {HTMLElement} taskEl - The task element
     * @param {string|null} dateStr - ISO date string (YYYY-MM-DD) or null to remove
     */
    function updateTaskScheduledDate(taskEl, dateStr) {
        if (!taskEl) return;

        // Update data attribute
        taskEl.dataset.scheduledDate = dateStr || '';

        const taskContent = taskEl.querySelector('.task-content');
        if (!taskContent) return;

        let taskDue = taskContent.querySelector('.task-due');

        if (dateStr) {
            // Format date as "Jan 06" (with leading zero to match backend)
            const date = new Date(dateStr + 'T00:00:00');
            const formatted = date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

            if (taskDue) {
                // Update existing element (preserve recurring icon if present)
                const recurringIcon = taskDue.querySelector('.recurring-icon');
                taskDue.textContent = formatted;
                if (recurringIcon) {
                    taskDue.prepend(recurringIcon);
                }
            } else {
                // Create new element
                taskDue = document.createElement('span');
                taskDue.className = 'task-due';
                taskDue.textContent = formatted;
                taskContent.appendChild(taskDue);
            }
        } else {
            // Remove date display (but keep if task is recurring)
            const isRecurring = taskEl.dataset.isRecurring === 'true';
            if (taskDue && !isRecurring) {
                taskDue.remove();
            }
        }
    }

    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================

    /**
     * Initialize drag and drop functionality.
     */
    function init() {
        const tasks = document.querySelectorAll('.task-item[draggable="true"]');
        const scheduledFromDb = document.querySelectorAll('.scheduled-task.from-db');
        const dateOnlyTasks = document.querySelectorAll('.date-only-task[draggable="true"]');
        const slots = document.querySelectorAll('.hour-slot[data-droppable="true"]');

        log.info(`Initializing: ${tasks.length} tasks, ${scheduledFromDb.length} scheduled, ${dateOnlyTasks.length} date-only, ${slots.length} slots`);

        // Attach task drag handlers
        tasks.forEach(task => {
            task.addEventListener('dragstart', handleDragStart);
            task.addEventListener('dragend', handleDragEnd);
        });

        // Attach drag handlers to scheduled tasks from DB (for rescheduling/unscheduling)
        scheduledFromDb.forEach(task => {
            task.draggable = true;
            task.addEventListener('dragstart', handleDragStart);
            task.addEventListener('dragend', handleDragEnd);
        });

        // Attach drag handlers to date-only tasks in banner
        dateOnlyTasks.forEach(task => {
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

        // Attach Anytime banner drop handlers
        const anytimeBanners = document.querySelectorAll('.date-only-banner[data-droppable="anytime"]');
        anytimeBanners.forEach(banner => {
            banner.addEventListener('dragover', handleAnytimeDragOver);
            banner.addEventListener('dragenter', handleAnytimeDragEnter);
            banner.addEventListener('dragleave', handleAnytimeDragLeave);
            banner.addEventListener('drop', handleAnytimeDrop);
        });

        // Initial overlap calculation for pre-existing events
        document.querySelectorAll('.day-calendar').forEach(cal => {
            if (cal.querySelectorAll('[data-start-mins]').length > 0) {
                recalculateOverlaps(cal);
            }
        });

        // Create trash bin
        createTrashBin();

        // Initialize zoom
        initZoom();
    }

    // ==========================================================================
    // ZOOM CONTROLS
    // ==========================================================================

    let zoomSaveTimeout = null;

    /**
     * Initialize zoom controls: read saved height, set up buttons and Ctrl+scroll.
     */
    function initZoom() {
        const panel = document.querySelector('.calendar-panel');
        if (!panel) return;

        // Read initial hour height from data attribute (server-rendered)
        const savedHeight = parseInt(panel.dataset.hourHeight, 10);
        if (savedHeight && savedHeight >= ZOOM_MIN && savedHeight <= ZOOM_MAX) {
            setHourHeight(savedHeight);
            targetZoomHeight = savedHeight;
        } else {
            setHourHeight(60);
            targetZoomHeight = 60;
        }

        // Recalculate positions for server-rendered events
        recalcAllScheduledPositions();

        // Zoom button click handlers (discrete steps)
        document.querySelectorAll('.zoom-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                // Cancel any pending wheel zoom
                pendingZoomDelta = 0;
                if (zoomRAF) { cancelAnimationFrame(zoomRAF); zoomRAF = null; }

                const direction = btn.dataset.zoom;
                var newHeight;

                if (direction === 'in') {
                    newHeight = ZOOM_STEPS.find(function(s) { return s > currentHourHeight; });
                } else {
                    for (var i = ZOOM_STEPS.length - 1; i >= 0; i--) {
                        if (ZOOM_STEPS[i] < currentHourHeight) { newHeight = ZOOM_STEPS[i]; break; }
                    }
                }

                if (newHeight && newHeight !== currentHourHeight) {
                    targetZoomHeight = newHeight;
                    applyZoom(newHeight);
                }
            });
        });

        // Ctrl+scroll (also handles trackpad pinch on macOS)
        // Continuous zoom: accumulate deltaY between frames, apply once per rAF
        panel.addEventListener('wheel', (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();

            pendingZoomDelta += e.deltaY;

            if (!zoomRAF) {
                zoomRAF = requestAnimationFrame(function() {
                    targetZoomHeight = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX,
                        targetZoomHeight - pendingZoomDelta * ZOOM_WHEEL_SCALE));
                    pendingZoomDelta = 0;
                    zoomRAF = null;

                    var rounded = Math.round(targetZoomHeight);
                    if (rounded !== currentHourHeight) {
                        applyZoom(rounded);
                    }
                });
            }
        }, { passive: false });
    }

    /**
     * Apply a new zoom level: update CSS, recalculate positions, persist.
     * Preserves scroll center point so the same time stays in view.
     * @param {number} newHeight - New hour height in pixels
     */
    function applyZoom(newHeight) {
        var oldHeight = currentHourHeight;

        // Capture center time for each hour-grid before zoom
        var grids = document.querySelectorAll('.hour-grid');
        var centerTimes = [];
        grids.forEach(function(grid) {
            var viewportH = grid.clientHeight;
            var centerTimeMins = (grid.scrollTop + viewportH / 2) / oldHeight * 60;
            centerTimes.push({ grid: grid, centerTimeMins: centerTimeMins, viewportH: viewportH });
        });

        setHourHeight(newHeight);
        recalcAllScheduledPositions();

        // Restore scroll so the same time stays centered
        centerTimes.forEach(function(entry) {
            entry.grid.scrollTop = (entry.centerTimeMins / 60 * newHeight) - entry.viewportH / 2;
        });

        // Debounced save to server (snap to nearest ZOOM_STEP for clean persistence)
        if (zoomSaveTimeout) clearTimeout(zoomSaveTimeout);
        zoomSaveTimeout = setTimeout(() => {
            var snapped = ZOOM_STEPS.reduce(function(prev, curr) {
                return Math.abs(curr - currentHourHeight) < Math.abs(prev - currentHourHeight) ? curr : prev;
            });
            safeFetch('/api/v1/preferences', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ calendar_hour_height: snapped }),
            }).catch(err => log.warn('Failed to save zoom preference:', err));
        }, 500);
    }

    /**
     * Recalculate top and height for all positioned calendar items.
     */
    function recalcAllScheduledPositions() {
        const hourHeight = getHourHeight();
        document.querySelectorAll('.scheduled-task[data-start-mins], .calendar-event[data-start-mins]').forEach(el => {
            const startMins = parseInt(el.dataset.startMins, 10);
            const endMins = parseInt(el.dataset.endMins, 10);
            if (isNaN(startMins) || isNaN(endMins)) return;

            const durationMins = endMins - startMins;
            const hourInSlot = startMins % 60;
            el.style.top = (hourInSlot / 60) * hourHeight + 'px';
            el.style.height = (durationMins / 60) * hourHeight + 'px';
        });

        // Also update the now-line position
        const nowLine = document.querySelector('.now-line');
        if (nowLine) {
            const todayGrid = document.querySelector('#today-calendar .hour-grid');
            if (todayGrid) {
                const now = new Date();
                const h = now.getHours();
                const m = now.getMinutes();
                const hourRow = todayGrid.querySelector(`.hour-row[data-hour="${h}"]:not(.adjacent-day)`);
                if (hourRow) {
                    nowLine.style.top = `${hourRow.offsetTop + (m / 60 * hourHeight)}px`;
                }
            }
        }
    }

    // ==========================================================================
    // TRASH BIN
    // ==========================================================================

    function createTrashBin() {
        trashBin = document.createElement('div');
        trashBin.className = 'trash-bin';
        trashBin.innerHTML = '<span class="trash-icon">🗑️</span><span class="trash-label">Delete</span>';
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
        // Only remove if leaving the trash bin entirely (not moving to child element)
        if (!trashBin.contains(e.relatedTarget)) {
            trashBin.classList.remove('drag-over');
        }
    }

    // Track pending deletion for undo
    let pendingDeletion = null;
    let deletionTimeout = null;
    const DELETION_DELAY = 2000; // 2 seconds to undo

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

        const { taskId, content } = taskData;
        if (!taskId) return;

        // Check for subtasks and confirm cascade delete
        const taskEl = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
        const subtaskCount = parseInt(taskEl?.dataset.subtaskCount || '0', 10);
        if (subtaskCount > 0) {
            const confirmed = confirm(
                `This task has ${subtaskCount} subtask${subtaskCount > 1 ? 's' : ''}. Deleting it will also delete all subtasks. Continue?`
            );
            if (!confirmed) return;
        }

        wasDroppedSuccessfully = true; // Prevent unschedule logic

        // Cancel any pending deletion
        cancelPendingDeletion();

        // Animate task elements out, then remove from DOM
        const taskElements = document.querySelectorAll(`[data-task-id="${taskId}"]`);
        const removedElements = [];

        // Capture parent/sibling info and start animation
        taskElements.forEach(el => {
            const parent = el.parentElement;
            const nextSibling = el.nextSibling;
            const dayCalendar = el.closest('.day-calendar');
            removedElements.push({ el, parent, nextSibling, dayCalendar });
            if (el.classList.contains('task-item')) {
                el.classList.add('departing');
            }
        });

        // Store for undo
        pendingDeletion = { taskId, removedElements, removed: false };

        // Show toast with undo
        const taskTitle = content || 'Task';
        const displayTitle = taskTitle.length > 30 ? taskTitle.substring(0, 30) + '...' : taskTitle;

        if (window.Toast) {
            Toast.show(`"${displayTitle}" deleted`, {
                onUndo: () => undoDelete()
            });
        }

        // Remove from DOM after animation completes, then schedule API deletion
        setTimeout(() => {
            if (!pendingDeletion || pendingDeletion.taskId !== taskId) return;
            pendingDeletion.removed = true;
            taskElements.forEach(el => {
                const dayCalendar = el.closest('.day-calendar');
                el.remove();
                if (dayCalendar) recalculateOverlaps(dayCalendar);
            });
        }, 350);

        // Schedule actual deletion after delay
        deletionTimeout = setTimeout(() => executeDelete(taskId), DELETION_DELAY);
    }

    /**
     * Undo the pending deletion - restore UI elements.
     */
    function undoDelete() {
        if (!pendingDeletion) return;

        const { removedElements, removed } = pendingDeletion;

        // Cancel the scheduled deletion
        if (deletionTimeout) {
            clearTimeout(deletionTimeout);
            deletionTimeout = null;
        }

        if (removed) {
            // Elements already removed from DOM — re-insert them
            removedElements.forEach(({ el, parent, nextSibling, dayCalendar }) => {
                if (parent) {
                    el.classList.remove('departing');
                    if (nextSibling && nextSibling.parentNode === parent) {
                        parent.insertBefore(el, nextSibling);
                    } else {
                        parent.appendChild(el);
                    }
                    if (dayCalendar) recalculateOverlaps(dayCalendar);
                }
            });
        } else {
            // Still animating — just remove the departing class
            removedElements.forEach(({ el }) => {
                el.classList.remove('departing');
            });
        }

        pendingDeletion = null;
        log.info('Deletion undone');
    }

    /**
     * Execute the actual deletion after delay.
     */
    async function executeDelete(taskId) {
        if (!pendingDeletion || pendingDeletion.taskId !== taskId) return;

        const { removedElements } = pendingDeletion;
        pendingDeletion = null;
        deletionTimeout = null;

        const restoreElements = () => {
            removedElements.forEach(({ el, parent, nextSibling, dayCalendar }) => {
                if (parent) {
                    if (nextSibling && nextSibling.parentNode === parent) {
                        parent.insertBefore(el, nextSibling);
                    } else {
                        parent.appendChild(el);
                    }
                    if (dayCalendar) recalculateOverlaps(dayCalendar);
                }
            });
        };

        try {
            await safeFetch(`/api/v1/tasks/${taskId}`, {
                method: 'DELETE'
            });
            log.info(`Deleted task ${taskId}`);
        } catch (error) {
            log.error(`Failed to delete task ${taskId}:`, error);
            restoreElements();
            handleError(error, 'Failed to delete task', {
                component: 'drag-drop',
                action: 'executeDeleteNow',
                retry: () => executeDelete(taskId)
            });
        }
    }

    /**
     * Cancel any pending deletion (used when starting a new drag).
     */
    function cancelPendingDeletion() {
        if (deletionTimeout) {
            clearTimeout(deletionTimeout);
            deletionTimeout = null;
        }
        // If there was a pending deletion, execute it immediately
        if (pendingDeletion) {
            executeDelete(pendingDeletion.taskId);
        }
    }

    // ==========================================================================
    // DRAG HANDLERS
    // ==========================================================================

    function handleDragStart(e) {
        draggedElement = e.target.closest('.task-item, .scheduled-task, .date-only-task');
        if (!draggedElement) return;

        // Prevent dragging task-items that are already scheduled
        if (draggedElement.classList.contains('task-item') && draggedElement.classList.contains('scheduled')) {
            e.preventDefault();
            return;
        }

        // Prevent dragging parent tasks (schedule subtasks instead)
        if (draggedElement.classList.contains('task-item')) {
            const subtaskCount = parseInt(draggedElement.dataset.subtaskCount || '0', 10);
            if (subtaskCount > 0) {
                e.preventDefault();
                return;
            }
        }

        isDraggingScheduledTask = draggedElement.classList.contains('scheduled-task');
        isDraggingDateOnlyTask = draggedElement.classList.contains('date-only-task');
        draggedTaskId = draggedElement.dataset.taskId;
        wasDroppedSuccessfully = false; // Reset flag

        // Get content - for scheduled/date-only tasks, exclude the occurrence-day span text
        const textElement = draggedElement.querySelector('.task-text, .scheduled-task-text, .date-only-task-text');
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
        const impact = draggedElement.dataset.impact || '4';
        const completed = draggedElement.dataset.completed || '0';
        const instanceId = draggedElement.dataset.instanceId || '';
        const instanceDate = draggedElement.dataset.instanceDate || '';

        draggedDuration = parseInt(duration, 10) || DEFAULT_DURATION;

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({
            taskId: draggedTaskId,
            content: content.trim(),
            duration,
            clarity,
            impact,
            completed,
            isScheduled: isDraggingScheduledTask,
            isDateOnly: isDraggingDateOnlyTask,
            instanceId,
            instanceDate,
        }));

        // Add body class to freeze hover states
        document.body.classList.add('is-dragging');

        // Delay style changes until after browser captures drag image
        setTimeout(() => {
            if (draggedElement) {
                draggedElement.classList.add('dragging');
                // Hide scheduled/date-only tasks to prevent double display
                if (isDraggingScheduledTask || isDraggingDateOnlyTask) {
                    draggedElement.style.visibility = 'hidden';
                }
            }
        }, 0);

        // Show trash bin when dragging
        showTrashBin();

        // Show Anytime dropzone hint when dragging any task
        document.querySelectorAll('.date-only-banner').forEach(banner => {
            banner.classList.add('drop-hint');
        });

        log.debug(`Drag start: ${draggedTaskId}, ${draggedDuration}min`);
    }

    /**
     * Handle drag end - unschedule if a scheduled task was dropped outside calendar
     */
    async function handleDragEnd(e) {
        const taskId = draggedTaskId;
        const element = draggedElement;
        const wasScheduledTask = element?.classList.contains('scheduled-task');
        const wasDateOnlyTask = element?.classList.contains('date-only-task');
        const shouldUnschedule = !wasDroppedSuccessfully && wasScheduledTask && taskId && element;

        if (element) {
            element.classList.remove('dragging');
            // Only reset inline styles if we're NOT about to remove the element
            // For date-only tasks that were successfully dropped, they'll be removed by handleDrop
            if (!shouldUnschedule && !(wasDateOnlyTask && wasDroppedSuccessfully)) {
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
                await safeFetch(`/api/v1/tasks/${taskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        scheduled_date: null,
                        scheduled_time: null,
                    }),
                });

                // Recalculate overlaps after removal
                if (dayCalendar) recalculateOverlaps(dayCalendar);
                // Check if task exists in task list
                const taskInList = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
                if (taskInList) {
                    // Remove scheduled styling, date, and animate back to position
                    taskInList.classList.remove('scheduled');
                    updateTaskScheduledDate(taskInList, null);
                    moveTaskToUnscheduledSection(taskInList);
                } else {
                    // Task doesn't exist in task list (was DB-scheduled), need to reload
                    window.location.reload();
                }
            } catch (error) {
                log.error('Failed to unschedule task:', error);
                // Restore element on failure
                if (parent) {
                    parent.appendChild(element);
                    element.style.visibility = '';
                }
                if (dayCalendar) recalculateOverlaps(dayCalendar);
                handleError(error, 'Failed to unschedule task', {
                    component: 'drag-drop',
                    action: 'handleDragToTrash'
                });
            }
        }

        // Reset state
        draggedElement = null;
        draggedTaskId = null;
        isDraggingScheduledTask = false;
        isDraggingDateOnlyTask = false;
        wasDroppedSuccessfully = false;
        removeDropIndicator();
        removeDragHighlight();
        hideTrashBin();

        // Remove body drag class
        document.body.classList.remove('is-dragging');

        // Clean up dropzone hints
        document.querySelectorAll('.date-only-banner.drop-hint').forEach(b => b.classList.remove('drop-hint'));
        document.querySelectorAll('.hour-slot.drag-over').forEach(s => s.classList.remove('drag-over'));
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const slot = e.target.closest('.hour-slot');
        if (!slot) return;

        const { quarterIndex, minutes, hour } = calculateDropPosition(e, slot);
        updateDropIndicator(slot, hour, minutes);
        highlightDurationSlots(slot, minutes);
    }

    function handleDragEnter(e) {
        e.preventDefault();
        // Duration highlight is handled by handleDragOver
    }

    function handleDragLeave(e) {
        const slot = e.target.closest('.hour-slot');
        const relatedSlot = e.relatedTarget?.closest('.hour-slot');
        if (slot && slot !== relatedSlot) {
            removeDragHighlight();
            removeDropIndicator();
        }
    }

    async function handleDrop(e) {
        e.preventDefault();

        // Check network status before creating calendar elements
        if (typeof isNetworkOnline === 'function' && !isNetworkOnline()) {
            if (window.Toast && typeof Toast.warning === 'function') {
                Toast.warning("You're offline — changes won't be saved until you reconnect.");
            }
            return;
        }

        const slot = e.target.closest('.hour-slot');
        if (!slot) return;

        slot.classList.remove('drag-over');
        removeDropIndicator();
        removeDragHighlight();

        let taskData;
        try {
            taskData = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch {
            log.error('Invalid drag data');
            return;
        }

        const { taskId, content, duration, clarity, impact, completed, instanceId, instanceDate } = taskData;
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

        // Remove the date-only task from banner when dropped on a time slot
        if (draggedElement?.classList.contains('date-only-task')) {
            draggedElement.remove();
        } else {
            // When dragging from task panel, also remove any corresponding Anytime task
            const anytimeTask = document.querySelector(`.date-only-task[data-task-id="${taskId}"]`);
            if (anytimeTask) {
                anytimeTask.remove();
            }
        }

        // For recurring tasks, only use instance ID if the target day matches the instance date
        // Otherwise, clear the instance ID to prevent using the wrong instance
        let effectiveInstanceId = instanceId;
        let effectiveInstanceDate = instanceDate;
        if (instanceId && instanceDate && instanceDate !== day) {
            // Dropping on a different day than the instance - clear instance to use task toggle
            effectiveInstanceId = '';
            effectiveInstanceDate = '';
        }

        // Create and place scheduled task immediately for visual feedback
        const element = createScheduledTaskElement(taskId, content, duration, hour, minutes, impact, completed, effectiveInstanceId, effectiveInstanceDate);
        slot.appendChild(element);
        wasDroppedSuccessfully = true; // Mark successful drop

        // Mark original task in task list and animate out, then refresh
        const original = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
        if (original) {
            original.classList.add('scheduled');
            updateTaskScheduledDate(original, day);
            setTimeout(function() {
                original.classList.add('departing');
                setTimeout(function() {
                    if (window.TaskComplete && typeof window.TaskComplete.refreshTaskList === 'function') {
                        window.TaskComplete.refreshTaskList();
                    }
                }, 350);
            }, 150);
        }

        recalculateOverlaps(dayCalendar);

        // Save to API immediately
        const scheduledDate = day;
        const scheduledTime = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

        try {
            let response;

            if (effectiveInstanceId) {
                // Recurring instance: reschedule via instance API (same-day time change)
                const scheduledDatetime = `${day}T${scheduledTime}`;
                response = await safeFetch(`/api/v1/instances/${effectiveInstanceId}/schedule`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scheduled_datetime: scheduledDatetime }),
                });
            } else {
                // Regular task (or cross-day instance drop): update task directly
                response = await safeFetch(`/api/v1/tasks/${taskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        scheduled_date: scheduledDate,
                        scheduled_time: scheduledTime,
                        duration_minutes: draggedDuration,
                    }),
                });
            }

            log.info(`Scheduled ${effectiveInstanceId ? 'instance ' + effectiveInstanceId : 'task ' + taskId} at ${day} ${hour}:${String(minutes).padStart(2, '0')}`);
            // No reload needed - optimistic update is sufficient
        } catch (error) {
            log.error(`Failed to schedule ${effectiveInstanceId ? 'instance' : 'task'} ${taskId}:`, error);
            // Remove the optimistic element on failure
            element.remove();
            if (original) {
                original.classList.remove('scheduled');
                moveTaskToUnscheduledSection(original);
            }
            recalculateOverlaps(dayCalendar);
            handleError(error, 'Failed to schedule task', {
                component: 'drag-drop',
                action: 'handleDropOnCalendarGrid'
            });
        }
    }

    // ==========================================================================
    // DURATION-AWARE DRAG HIGHLIGHT
    // ==========================================================================

    let dragHighlightOverlay = null;

    /**
     * Show a duration-aware highlight overlay at the current drop position.
     * @param {HTMLElement} slot - Current hour slot
     * @param {number} dropMinutes - Minutes offset within the slot (0, 15, 30, 45)
     */
    function highlightDurationSlots(slot, dropMinutes) {
        const hourHeight = getHourHeight();
        const topPx = (dropMinutes / 60) * hourHeight;
        const heightPx = (draggedDuration / 60) * hourHeight;

        if (!dragHighlightOverlay) {
            dragHighlightOverlay = document.createElement('div');
            dragHighlightOverlay.className = 'drag-highlight-overlay';
        }

        dragHighlightOverlay.style.top = `${topPx}px`;
        dragHighlightOverlay.style.height = `${heightPx}px`;

        if (dragHighlightOverlay.parentElement !== slot) {
            removeDragHighlight();
            slot.appendChild(dragHighlightOverlay);
        }
    }

    /**
     * Remove the drag highlight overlay.
     */
    function removeDragHighlight() {
        if (dragHighlightOverlay && dragHighlightOverlay.parentElement) {
            dragHighlightOverlay.remove();
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
    function createScheduledTaskElement(taskId, content, duration, hour, minutes = 0, impact = '4', completed = '0', instanceId = '', instanceDate = '') {
        const durationMins = parseInt(duration, 10) || DEFAULT_DURATION;
        const startMins = hour * 60 + minutes;
        const endMins = startMins + durationMins;
        const hourHeight = getHourHeight();
        const heightPx = (durationMins / 60) * hourHeight;
        const topPx = (minutes / 60) * hourHeight;
        const isCompleted = completed === '1';

        const el = document.createElement('div');
        el.className = `scheduled-task calendar-item impact-${impact}`;
        el.dataset.taskId = taskId;
        el.dataset.duration = durationMins;
        el.dataset.impact = impact;
        el.dataset.startMins = startMins;
        el.dataset.endMins = endMins;
        el.dataset.completed = completed;
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

        const quickAction = instanceId
            ? '<button class="calendar-quick-action" data-action="skip" type="button" aria-label="Skip this occurrence" title="Skip"><svg width="14" height="14"><use href="/static/img/icons/ui-icons.svg#skip-forward"/></svg></button>'
            : '<button class="calendar-quick-action" data-action="unschedule" type="button" aria-label="Unschedule" title="Unschedule"><svg width="14" height="14"><use href="/static/img/icons/ui-icons.svg#upload"/></svg></button>';

        el.innerHTML = `
            <button class="complete-gutter complete-gutter--always" type="button" aria-label="Complete task" aria-pressed="${isCompleted}">
                <span class="complete-bar"></span>
                <span class="complete-check" aria-hidden="true">✓</span>
            </button>
            <div class="scheduled-task-left">
                <span class="scheduled-task-time">${timeStr}</span>
                ${durationStr ? `<span class="scheduled-task-duration">${durationStr}</span>` : ''}
            </div>
            <span class="scheduled-task-text">${escapeHtml(content)}${occurrenceBadge}</span>
            ${quickAction}
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
    // ANYTIME BANNER HANDLERS
    // ==========================================================================

    function handleAnytimeDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    function handleAnytimeDragEnter(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }

    function handleAnytimeDragLeave(e) {
        // Only remove if leaving the banner entirely
        if (!e.currentTarget.contains(e.relatedTarget)) {
            e.currentTarget.classList.remove('drag-over');
        }
    }

    async function handleAnytimeDrop(e) {
        e.preventDefault();
        const banner = e.currentTarget;
        banner.classList.remove('drag-over');

        let taskData;
        try {
            taskData = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch {
            log.error('Invalid drag data for Anytime');
            return;
        }

        const { taskId, content, duration, clarity, impact, completed, isScheduled, isDateOnly } = taskData;
        if (!taskId) return;

        const day = banner.dataset.day;
        if (!day) {
            log.error('No day on Anytime banner');
            return;
        }

        wasDroppedSuccessfully = true;

        // Remove existing scheduled task element if rescheduling from calendar
        if (draggedElement?.classList.contains('scheduled-task')) {
            const oldCalendar = draggedElement.closest('.day-calendar');
            draggedElement.remove();
            if (oldCalendar) recalculateOverlaps(oldCalendar);
        }

        // Don't add duplicate if already a date-only task being moved to same banner
        if (draggedElement?.classList.contains('date-only-task')) {
            const sourceBanner = draggedElement.closest('.date-only-banner');
            if (sourceBanner === banner) {
                // Same banner, just restore visibility
                draggedElement.style.visibility = '';
                return;
            }
            // Moving to different day's banner - remove from old
            draggedElement.remove();
        }

        // Create date-only task element in the banner
        const tasksContainer = banner.querySelector('.date-only-tasks');
        const el = createDateOnlyTaskElement(taskId, content, duration, clarity, impact, completed);
        tasksContainer.appendChild(el);

        // Mark original task in task list and animate out, then refresh
        const original = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
        if (original) {
            original.classList.add('scheduled');
            updateTaskScheduledDate(original, day);
            setTimeout(function() {
                original.classList.add('departing');
                setTimeout(function() {
                    if (window.TaskComplete && typeof window.TaskComplete.refreshTaskList === 'function') {
                        window.TaskComplete.refreshTaskList();
                    }
                }, 350);
            }, 150);
        }

        // Save to API - scheduled_date only, no scheduled_time
        try {
            await safeFetch(`/api/v1/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scheduled_date: day,
                    scheduled_time: null,
                }),
            });

            log.info(`Scheduled ${taskId} for ${day} (anytime)`);
        } catch (error) {
            log.error(`Failed to schedule task ${taskId} to Anytime:`, error);
            el.remove();
            if (original) {
                original.classList.remove('scheduled');
                moveTaskToUnscheduledSection(original);
            }
            handleError(error, 'Failed to schedule task', {
                component: 'drag-drop',
                action: 'handleDropOnAnytimeBanner'
            });
        }
    }

    /**
     * Create a date-only task element for the Anytime banner.
     */
    function createDateOnlyTaskElement(taskId, content, duration, clarity, impact, completed = '0') {
        const durationMins = parseInt(duration, 10) || 0;
        const impactVal = impact || '4';
        const isCompleted = completed === '1';

        const el = document.createElement('div');
        el.className = `date-only-task calendar-item impact-${impactVal} clarity-${clarity || 'none'}`;
        el.dataset.taskId = taskId;
        el.dataset.duration = durationMins;
        el.dataset.clarity = clarity || 'none';
        el.dataset.impact = impactVal;
        el.dataset.completed = completed;
        el.draggable = true;

        let durationHtml = '';
        if (durationMins > 0) {
            const durationStr = durationMins >= 60
                ? `${Math.floor(durationMins / 60)}h${durationMins % 60 ? (durationMins % 60) + 'm' : ''}`
                : `${durationMins}m`;
            durationHtml = `<span class="date-only-task-duration">${durationStr}</span>`;
        }

        el.innerHTML = `
            <button class="complete-gutter complete-gutter--always" type="button" aria-label="Complete task" aria-pressed="${isCompleted}">
                <span class="complete-bar"></span>
                <span class="complete-check" aria-hidden="true">✓</span>
            </button>
            ${durationHtml}
            <span class="date-only-task-text">${escapeHtml(content)}</span>
            <button class="calendar-quick-action" data-action="unschedule" type="button" aria-label="Unschedule" title="Unschedule"><svg width="14" height="14"><use href="/static/img/icons/ui-icons.svg#upload"/></svg></button>
        `;

        el.addEventListener('dragstart', handleDragStart);
        el.addEventListener('dragend', handleDragEnd);

        return el;
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
    window.moveTaskToScheduledSection = moveTaskToScheduledSection;
    window.moveTaskToUnscheduledSection = moveTaskToUnscheduledSection;
    window.updateTaskScheduledDate = updateTaskScheduledDate;

    window.DragDrop = {
        init,
        getHourHeight,
    };

    document.addEventListener('DOMContentLoaded', init);

})();
