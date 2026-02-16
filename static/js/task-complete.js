/**
 * Task Completion Module
 *
 * Handles task completion toggle via gutter click.
 * Supports both regular tasks and recurring task instances.
 *
 * @module TaskComplete
 */
(function() {
    'use strict';

    // User preferences (loaded on init)
    let userPrefs = {
        completed_move_to_bottom: true,  // Default
    };

    // Active actions menu reference (for cleanup)
    let activeActionsMenu = null;

    // Pending completion animation timeouts (for undo cancellation)
    let pendingCompletionTimeout = null;
    let pendingRefreshTimeout = null;

    /**
     * Initialize task completion handlers.
     */
    async function init() {
        // Load user preferences
        await loadUserPreferences();

        // Use event delegation on document for all completion gutters
        document.addEventListener('click', handleGutterClick);

        // Kebab button for task actions (task list items)
        document.addEventListener('click', handleKebabClick);

        // Quick-action buttons on calendar cards (skip / unschedule)
        document.addEventListener('click', handleQuickActionClick);

        // Right-click context menu for tasks
        document.addEventListener('contextmenu', handleGutterRightClick);

        // Dismiss actions menu on click elsewhere
        document.addEventListener('click', dismissActionsMenu);
    }

    /**
     * Load user preferences from API.
     */
    async function loadUserPreferences() {
        try {
            const response = await safeFetch('/api/v1/preferences');
            userPrefs = await response.json();
        } catch (error) {
            // Silent failure - use defaults
            console.warn('Failed to load user preferences, using defaults');
        }
    }

    /**
     * Handle click on completion gutter.
     * @param {Event} e - Click event
     */
    function handleGutterClick(e) {
        const gutter = e.target.closest('.complete-gutter');
        if (!gutter) return;

        // Stop propagation to prevent task edit dialog from opening
        e.preventDefault();
        e.stopPropagation();

        // Remove focus from button to prevent highlight lingering
        gutter.blur();

        // Find the parent task element
        const taskEl = gutter.closest('[data-task-id]');
        if (!taskEl) return;

        const taskId = taskEl.dataset.taskId;
        const instanceId = taskEl.dataset.instanceId;
        const isRecurring = taskEl.dataset.isRecurring === 'true' || !!instanceId;
        const isCompleted = taskEl.dataset.completed === '1';

        // Toggle completion
        toggleCompletion(taskEl, taskId, instanceId, !isCompleted, isRecurring);
    }

    /**
     * Toggle task completion state.
     * @param {HTMLElement} taskEl - The task element
     * @param {string} taskId - Task ID
     * @param {string|undefined} instanceId - Instance ID for recurring tasks
     * @param {boolean} shouldComplete - Whether to mark as completed
     */
    async function toggleCompletion(taskEl, taskId, instanceId, shouldComplete, isRecurring = false) {
        // Check network status before optimistic update
        if (typeof isNetworkOnline === 'function' && !isNetworkOnline()) {
            if (window.Toast && typeof Toast.warning === 'function') {
                Toast.warning("You're offline — changes won't be saved until you reconnect.");
            }
            return;
        }

        // Optimistic UI update
        taskEl.dataset.completed = shouldComplete ? '1' : '0';

        try {
            let url;
            let body = {};

            if (instanceId) {
                // Recurring task instance with known ID
                url = `/api/v1/instances/${instanceId}/toggle-complete`;
            } else {
                // Regular task OR recurring task without known instance
                url = `/api/v1/tasks/${taskId}/toggle-complete`;

                // For calendar items, get the target date from the parent calendar
                const calendarEl = taskEl.closest('.day-calendar');
                if (calendarEl) {
                    // Check if this is in an adjacent day section
                    const hourRow = taskEl.closest('.hour-row');
                    const actualDate = hourRow?.dataset.actualDate;
                    const calendarDate = calendarEl.dataset.day;
                    const targetDate = actualDate || calendarDate;

                    if (targetDate) {
                        body.target_date = targetDate;
                    }
                }
            }

            const response = await safeFetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
            });

            const data = await response.json();

            // Update UI based on server response
            taskEl.dataset.completed = data.completed ? '1' : '0';

            // Update aria-pressed on the gutter button
            const gutterBtn = taskEl.querySelector('.complete-gutter');
            if (gutterBtn) {
                gutterBtn.setAttribute('aria-pressed', data.completed ? 'true' : 'false');
            }

            // Add pop animation to checkbox
            const checkEl = taskEl.querySelector('.complete-check');
            if (checkEl) {
                checkEl.classList.remove('pop');
                // Force reflow to restart animation
                checkEl.offsetHeight;
                checkEl.classList.add('pop');
                // Remove class after animation completes
                setTimeout(() => checkEl.classList.remove('pop'), 300);
            }

            // Apply visual aging class for completed tasks
            applyCompletionClass(taskEl, data.completed);

            // Also update the corresponding task in other locations
            // (e.g., if task appears in both list and calendar)
            syncTaskCompletionState(taskId, instanceId, data.completed, taskEl);

            // Build undo callback for completions (not reopenings)
            // Find the task-list counterpart (may be the same as taskEl)
            var listItemForUndo = taskEl.classList.contains('task-item')
                ? taskEl
                : document.querySelector('.task-item[data-task-id="' + taskId + '"]');
            var undoCallback = null;
            if (data.completed && listItemForUndo) {
                undoCallback = function() {
                    // Cancel pending animation/refresh
                    if (pendingCompletionTimeout) {
                        clearTimeout(pendingCompletionTimeout);
                        pendingCompletionTimeout = null;
                    }
                    if (pendingRefreshTimeout) {
                        clearTimeout(pendingRefreshTimeout);
                        pendingRefreshTimeout = null;
                    }
                    // Restore task visually
                    listItemForUndo.classList.remove('departing');
                    // Re-toggle via API to reverse
                    toggleCompletion(taskEl, taskId, instanceId, false, isRecurring);
                };
            }

            // Extract task title for toast
            var toastTitle = '';
            if (listItemForUndo) {
                var titleEl = listItemForUndo.querySelector('.task-text');
                if (titleEl) toastTitle = titleEl.textContent.trim();
            }
            if (!toastTitle) {
                var calTitleEl = taskEl.querySelector('.scheduled-task-text') || taskEl.querySelector('.date-only-task-text');
                if (calTitleEl) {
                    var cloned = calTitleEl.cloneNode(true);
                    var occSpan = cloned.querySelector('.occurrence-day');
                    if (occSpan) occSpan.remove();
                    toastTitle = cloned.textContent.trim();
                }
            }
            if (toastTitle && toastTitle.length > 40) {
                toastTitle = toastTitle.substring(0, 40) + '\u2026';
            }

            // Show toast notification
            if (isRecurring) {
                var dateLabel = getDateLabel(taskEl);
                var recurMsg = toastTitle
                    ? (data.completed ? '\u201c' + toastTitle + '\u201d done for ' + dateLabel : '\u201c' + toastTitle + '\u201d reopened for ' + dateLabel)
                    : (data.completed ? 'Done for ' + dateLabel : 'Reopened for ' + dateLabel);
                if (undoCallback) {
                    Toast.undo(recurMsg, undoCallback);
                } else {
                    Toast.show(recurMsg);
                }
            } else {
                var msg = toastTitle
                    ? (data.completed ? '\u201c' + toastTitle + '\u201d completed' : '\u201c' + toastTitle + '\u201d reopened')
                    : (data.completed ? 'Task completed' : 'Task reopened');
                if (undoCallback) {
                    Toast.undo(msg, undoCallback);
                } else {
                    Toast.show(msg);
                }
            }

            // Move task between sections (domain <-> completed)
            // Always target the task-list item, even when completing from a calendar card
            if (window.TaskMutations) {
                var listEl = taskEl.classList.contains('task-item')
                    ? taskEl
                    : document.querySelector('.task-item[data-task-id="' + taskId + '"]');
                if (listEl) {
                    pendingCompletionTimeout = setTimeout(function() {
                        listEl.classList.add('departing');
                        pendingRefreshTimeout = setTimeout(function() {
                            listEl.classList.remove('departing');
                            if (data.completed) {
                                TaskMutations.moveTaskToCompleted(listEl);
                            } else {
                                // Ensure completion styling is fully cleared before move
                                listEl.classList.remove('completed');
                                listEl.dataset.completed = '0';
                                var domainId = listEl.dataset.domainId || '';
                                TaskMutations.moveTaskToActive(listEl, domainId);
                            }
                            if (window.TaskSort && typeof TaskSort.applySort === 'function') {
                                TaskSort.applySort();
                            }
                            TaskMutations.scrollToAndHighlight(listEl);
                        }, 350);
                    }, 250);
                }
            }

        } catch (error) {
            // Revert optimistic update on error
            taskEl.dataset.completed = shouldComplete ? '0' : '1';

            handleError(error, 'Failed to update task', {
                component: 'task-complete',
                action: 'toggleCompletion',
                retry: () => toggleCompletion(taskEl, taskId, instanceId, shouldComplete, isRecurring)
            });
        }
    }

    /**
     * Sync completion state across all instances of a task in the UI.
     * @param {string} taskId - Task ID
     * @param {string|undefined} instanceId - Instance ID for recurring tasks
     * @param {boolean} completed - Completion state
     * @param {HTMLElement} sourceEl - The element that triggered the change (to skip)
     */
    function syncTaskCompletionState(taskId, instanceId, completed, sourceEl) {
        const selector = instanceId
            ? `[data-instance-id="${instanceId}"]`
            : `[data-task-id="${taskId}"]:not([data-instance-id])`;

        document.querySelectorAll(selector).forEach(el => {
            if (el === sourceEl) return; // Skip the source element

            el.dataset.completed = completed ? '1' : '0';

            // Update aria-pressed
            const gutterBtn = el.querySelector('.complete-gutter');
            if (gutterBtn) {
                gutterBtn.setAttribute('aria-pressed', completed ? 'true' : 'false');
            }

            // Add pop animation
            const checkEl = el.querySelector('.complete-check');
            if (checkEl) {
                checkEl.classList.remove('pop');
                checkEl.offsetHeight;
                checkEl.classList.add('pop');
                setTimeout(() => checkEl.classList.remove('pop'), 300);
            }

            // Apply visual aging class
            applyCompletionClass(el, completed);
        });
    }

    /**
     * Apply completed class for visual styling.
     * @param {HTMLElement} taskEl - The task element
     * @param {boolean} completed - Whether task is completed
     */
    function applyCompletionClass(taskEl, completed) {
        if (completed) {
            taskEl.classList.add('completed');
        } else {
            taskEl.classList.remove('completed');
        }
    }

    /**
     * Move a completed task to the bottom of its domain group with smooth animation.
     * @param {HTMLElement} taskEl - The task element to move
     */
    function moveToBottomOfDomain(taskEl) {
        const taskList = taskEl.closest('.task-list');
        if (!taskList) return;

        // Find the add-task-row (should be at the end)
        const addTaskRow = taskList.querySelector('.add-task-row');

        // Get current position
        const startRect = taskEl.getBoundingClientRect();

        // Move in DOM first (no visual change yet due to FLIP)
        if (addTaskRow) {
            taskList.insertBefore(taskEl, addTaskRow);
        } else {
            taskList.appendChild(taskEl);
        }

        // Get final position
        const endRect = taskEl.getBoundingClientRect();

        // Calculate the difference
        const deltaY = startRect.top - endRect.top;

        if (Math.abs(deltaY) < 5) return; // No significant move needed

        // Apply inverse transform to start from original position
        taskEl.style.transform = `translateY(${deltaY}px)`;
        taskEl.style.transition = 'none';

        // Force reflow
        taskEl.offsetHeight;

        // Animate to final position
        taskEl.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease';
        taskEl.style.transform = 'translateY(0)';

        // Clean up after animation
        taskEl.addEventListener('transitionend', function cleanup(e) {
            if (e.propertyName === 'transform') {
                taskEl.style.transition = '';
                taskEl.style.transform = '';
                taskEl.removeEventListener('transitionend', cleanup);
            }
        });
    }

    /**
     * Move an uncompleted task back to the top of pending tasks in its domain.
     * @param {HTMLElement} taskEl - The task element to move
     */
    function moveToTopOfDomain(taskEl) {
        const taskList = taskEl.closest('.task-list');
        if (!taskList) return;

        // Find the first completed task or add-task-row
        const allTasks = Array.from(taskList.querySelectorAll('.task-item'));
        const firstCompletedIndex = allTasks.findIndex(t => t.dataset.completed === '1' && t !== taskEl);

        // Determine where to insert (before first completed, or at start if none completed)
        let insertBefore = null;
        if (firstCompletedIndex > 0) {
            insertBefore = allTasks[firstCompletedIndex];
        } else {
            // Insert at the beginning of the task list
            insertBefore = taskList.firstElementChild;
        }

        // If already in the right position, skip animation
        if (insertBefore === taskEl || insertBefore === taskEl.nextElementSibling) {
            return;
        }

        // Get current position
        const startRect = taskEl.getBoundingClientRect();

        // Move in DOM
        taskList.insertBefore(taskEl, insertBefore);

        // Get final position
        const endRect = taskEl.getBoundingClientRect();

        // Calculate the difference
        const deltaY = startRect.top - endRect.top;

        if (Math.abs(deltaY) < 5) return; // No significant move needed

        // Apply inverse transform to start from original position
        taskEl.style.transform = `translateY(${deltaY}px)`;
        taskEl.style.transition = 'none';

        // Force reflow
        taskEl.offsetHeight;

        // Animate to final position
        taskEl.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease';
        taskEl.style.transform = 'translateY(0)';

        // Clean up after animation
        taskEl.addEventListener('transitionend', function cleanup(e) {
            if (e.propertyName === 'transform') {
                taskEl.style.transition = '';
                taskEl.style.transform = '';
                taskEl.removeEventListener('transitionend', cleanup);
            }
        });
    }

    // ==========================================================================
    // TASK ACTIONS MENU (kebab + right-click context menu)
    // ==========================================================================

    /**
     * Build options object from a task element's dataset.
     * @param {HTMLElement} taskEl - The task element
     * @returns {Object} opts
     */
    function buildMenuOpts(taskEl) {
        return {
            taskId: taskEl.dataset.taskId,
            instanceId: taskEl.dataset.instanceId || null,
            isRecurring: taskEl.dataset.isRecurring === 'true' || !!taskEl.dataset.instanceId,
            isScheduled: !!taskEl.dataset.scheduledDate || taskEl.classList.contains('calendar-item'),
            isCalendarCard: taskEl.classList.contains('calendar-item'),
            isCompleted: taskEl.dataset.completed === '1',
            subtaskCount: parseInt(taskEl.dataset.subtaskCount || '0', 10),
        };
    }

    /**
     * Handle kebab button click for task actions.
     * @param {Event} e - Click event
     */
    function handleKebabClick(e) {
        const kebab = e.target.closest('.kebab-btn');
        if (!kebab) return;

        e.preventDefault();
        e.stopPropagation();

        const taskEl = kebab.closest('[data-task-id]');
        if (!taskEl) return;

        const rect = kebab.getBoundingClientRect();
        showActionsMenu(rect.left, rect.bottom + 4, taskEl, buildMenuOpts(taskEl));
    }

    /**
     * Handle click on calendar quick-action button (skip / unschedule).
     * @param {Event} e - Click event
     */
    function handleQuickActionClick(e) {
        var btn = e.target.closest('.calendar-quick-action');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        var taskEl = btn.closest('[data-task-id]');
        if (!taskEl) return;

        var action = btn.dataset.action;
        if (action === 'skip' && taskEl.dataset.instanceId) {
            skipInstance(taskEl, taskEl.dataset.instanceId);
        } else if (action === 'unschedule') {
            unscheduleTask(taskEl, taskEl.dataset.taskId);
        }
    }

    /**
     * Handle right-click on task card.
     * Shows a context menu with actions.
     * @param {Event} e - contextmenu event
     */
    function handleGutterRightClick(e) {
        const taskEl = e.target.closest('[data-task-id]');
        if (!taskEl) return;

        // Only show for task items and calendar cards
        if (!taskEl.classList.contains('task-item') && !taskEl.classList.contains('calendar-item')) return;

        e.preventDefault();
        showActionsMenu(e.clientX, e.clientY, taskEl, buildMenuOpts(taskEl));
    }

    /**
     * Create a menu item button.
     * @param {string} icon - Emoji icon
     * @param {string} label - Button label
     * @param {string} [extraClass] - Additional CSS class
     * @returns {HTMLButtonElement}
     */
    function createMenuItem(icon, label, extraClass) {
        var btn = document.createElement('button');
        btn.className = 'actions-menu-item' + (extraClass ? ' ' + extraClass : '');
        btn.innerHTML = '<span class="actions-menu-icon">' + icon + '</span> ' + label;
        return btn;
    }

    /**
     * Show actions context menu at given position.
     * @param {number} x - clientX
     * @param {number} y - clientY
     * @param {HTMLElement} taskEl - The task element
     * @param {Object} opts - Menu options
     */
    function showActionsMenu(x, y, taskEl, opts) {
        dismissActionsMenu();

        var menu = document.createElement('div');
        menu.className = 'actions-menu';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        // Skip this one (recurring with instance only)
        if (opts.instanceId) {
            var skipBtn = createMenuItem('⏭', 'Skip this one');
            skipBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                dismissActionsMenu();
                skipInstance(taskEl, opts.instanceId);
            });
            menu.appendChild(skipBtn);
        }

        // Unschedule (non-recurring scheduled tasks — calendar cards or task-list items)
        if (!opts.isRecurring && (opts.isCalendarCard || opts.isScheduled)) {
            var unschedBtn = createMenuItem('📤', 'Unschedule');
            unschedBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                dismissActionsMenu();
                unscheduleTask(taskEl, opts.taskId);
            });
            menu.appendChild(unschedBtn);
        }

        // Complete / Reopen
        var completeLabel = opts.isCompleted ? 'Reopen' : 'Complete';
        var completeIcon = opts.isCompleted ? '↩️' : '✓';
        var completeBtn = createMenuItem(completeIcon, completeLabel);
        completeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            dismissActionsMenu();
            toggleCompletion(taskEl, opts.taskId, opts.instanceId, !opts.isCompleted, opts.isRecurring);
        });
        menu.appendChild(completeBtn);

        // Edit task / Edit series
        var editLabel = opts.isRecurring ? 'Edit series' : 'Edit task';
        var editBtn = createMenuItem('✏️', editLabel);
        editBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            dismissActionsMenu();
            if (window.TaskDialog && typeof TaskDialog.open === 'function') {
                TaskDialog.open(parseInt(opts.taskId, 10));
            }
        });
        menu.appendChild(editBtn);

        // Separator before danger zone
        var sep = document.createElement('div');
        sep.className = 'actions-menu-separator';
        menu.appendChild(sep);

        // Delete / Delete series
        var deleteLabel = opts.isRecurring ? 'Delete series' : 'Delete';
        var deleteBtn = createMenuItem('🗑', deleteLabel, 'actions-menu-item--danger');
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            dismissActionsMenu();
            deleteTaskFromMenu(taskEl, opts.taskId, opts.subtaskCount);
        });
        menu.appendChild(deleteBtn);

        document.body.appendChild(menu);
        activeActionsMenu = menu;

        // Adjust if overflowing viewport
        var rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
        }
    }

    /**
     * Dismiss the active actions menu.
     * When called as an event handler, skips dismiss if click was on a kebab
     * button or inside the menu itself (those have their own handlers).
     */
    function dismissActionsMenu(e) {
        if (activeActionsMenu) {
            if (e && e.type === 'click' && e.target.closest && (e.target.closest('.kebab-btn') || e.target.closest('.actions-menu'))) return;
            activeActionsMenu.remove();
            activeActionsMenu = null;
        }
    }

    // ==========================================================================
    // DELETE TASK (immediate API + undo via restore)
    // ==========================================================================

    /**
     * Delete a task from the actions menu with undo support.
     * Calls DELETE API immediately; undo calls POST /restore.
     * @param {HTMLElement} taskEl - The task element
     * @param {string} taskId - Task ID
     * @param {number} subtaskCount - Number of subtasks
     */
    async function deleteTaskFromMenu(taskEl, taskId, subtaskCount) {
        // Check network status
        if (typeof isNetworkOnline === 'function' && !isNetworkOnline()) {
            if (window.Toast && typeof Toast.warning === 'function') {
                Toast.warning("You're offline — changes won't be saved until you reconnect.");
            }
            return;
        }

        // Subtask cascade warning
        if (subtaskCount > 0) {
            var confirmed = confirm(
                'This task has ' + subtaskCount + ' subtask' + (subtaskCount > 1 ? 's' : '') +
                '. Deleting it will also delete all subtasks. Continue?'
            );
            if (!confirmed) return;
        }

        // Gather all elements for this task (task-item + calendar cards + subtasks)
        var taskElements = document.querySelectorAll('[data-task-id="' + taskId + '"]');
        var subtaskElements = document.querySelectorAll('[data-parent-id="' + taskId + '"]');
        var removedElements = [];

        // Capture position info and start departing animation
        taskElements.forEach(function(el) {
            var parent = el.parentElement;
            var nextSibling = el.nextSibling;
            removedElements.push({ el: el, parent: parent, nextSibling: nextSibling });
            if (el.classList.contains('task-item')) {
                el.classList.add('departing');
            }
        });
        subtaskElements.forEach(function(el) {
            var parent = el.parentElement;
            var nextSibling = el.nextSibling;
            removedElements.push({ el: el, parent: parent, nextSibling: nextSibling });
            if (el.classList.contains('task-item')) {
                el.classList.add('departing');
            }
        });

        // Get task title for toast
        var taskTitle = taskEl.querySelector('.task-text')?.textContent || 'Task';

        // Remove elements from DOM after animation
        setTimeout(function() {
            removedElements.forEach(function(item) {
                item.el.remove();
            });
        }, 350);

        // Call DELETE API immediately
        try {
            await safeFetch('/api/v1/tasks/' + taskId, {
                method: 'DELETE'
            });

            // Update section counts
            removedElements.forEach(function(item) {
                var section = item.parent ? item.parent.closest('.project-group') || item.parent.closest('.section-group') : null;
                if (section && window.TaskMutations) {
                    var countEl = section.querySelector('.task-count') || section.querySelector('.section-count');
                    if (countEl) {
                        countEl.textContent = section.querySelectorAll('.task-item').length;
                    }
                }
            });

            // Show toast with undo (undo calls restore API)
            Toast.undo('"' + taskTitle + '" deleted', function() {
                restoreDeletedTask(taskId, removedElements);
            });
        } catch (error) {
            // Restore elements on failure
            removedElements.forEach(function(item) {
                if (item.parent) {
                    item.el.classList.remove('departing');
                    if (item.nextSibling && item.nextSibling.parentNode === item.parent) {
                        item.parent.insertBefore(item.el, item.nextSibling);
                    } else {
                        item.parent.appendChild(item.el);
                    }
                }
            });
            handleError(error, 'Failed to delete task', {
                component: 'task-complete',
                action: 'deleteTaskFromMenu'
            });
        }
    }

    /**
     * Restore a deleted task via API and re-insert DOM elements.
     * @param {string} taskId - Task ID
     * @param {Array} removedElements - Captured DOM element info for re-insertion
     */
    async function restoreDeletedTask(taskId, removedElements) {
        try {
            await safeFetch('/api/v1/tasks/' + taskId + '/restore', {
                method: 'POST'
            });
            // Re-insert DOM elements
            removedElements.forEach(function(item) {
                if (item.parent) {
                    item.el.classList.remove('departing');
                    if (item.nextSibling && item.nextSibling.parentNode === item.parent) {
                        item.parent.insertBefore(item.el, item.nextSibling);
                    } else {
                        item.parent.appendChild(item.el);
                    }
                }
            });
        } catch (error) {
            handleError(error, 'Failed to restore task', {
                component: 'task-complete',
                action: 'restoreDeletedTask'
            });
        }
    }

    // ==========================================================================
    // SKIP INSTANCE
    // ==========================================================================

    /**
     * Skip a recurring task instance via API.
     * @param {HTMLElement} taskEl - The task element
     * @param {string} instanceId - Instance ID
     */
    async function skipInstance(taskEl, instanceId) {
        // Check network status before optimistic update
        if (typeof isNetworkOnline === 'function' && !isNetworkOnline()) {
            if (window.Toast && typeof Toast.warning === 'function') {
                Toast.warning("You're offline — changes won't be saved until you reconnect.");
            }
            return;
        }

        // Optimistic UI update
        taskEl.classList.add('skipped');
        taskEl.dataset.completed = '1';

        try {
            await safeFetch('/api/v1/instances/' + instanceId + '/skip', {
                method: 'POST'
            });

            // Sync across all representations of this instance
            document.querySelectorAll('[data-instance-id="' + instanceId + '"]').forEach(function(el) {
                if (el === taskEl) return;
                el.classList.add('skipped');
                el.dataset.completed = '1';
                applyCompletionClass(el, false);
            });

            Toast.show('Skipped for ' + getDateLabel(taskEl));

            // Update task in-place with next occurrence via server-rendered HTML
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

            // Remove skipped calendar cards after animation
            document.querySelectorAll('.calendar-item[data-instance-id="' + instanceId + '"]').forEach(function(el) {
                setTimeout(function() {
                    el.classList.add('departing');
                    setTimeout(function() { el.remove(); }, 350);
                }, 600);
            });
        } catch (error) {
            // Revert optimistic update
            taskEl.classList.remove('skipped');
            taskEl.dataset.completed = '0';
            handleError(error, 'Failed to skip instance', {
                component: 'task-complete',
                action: 'skipInstance',
                retry: function() { skipInstance(taskEl, instanceId); }
            });
        }
    }

    // ==========================================================================
    // UNSCHEDULE TASK (immediate API + undo via reschedule)
    // ==========================================================================

    /**
     * Unschedule a task from the calendar.
     * Calls PUT API immediately; undo re-schedules via PUT.
     * @param {HTMLElement} taskEl - The calendar card element
     * @param {string} taskId - Task ID
     */
    async function unscheduleTask(taskEl, taskId) {
        if (typeof isNetworkOnline === 'function' && !isNetworkOnline()) {
            if (window.Toast && typeof Toast.warning === 'function') {
                Toast.warning("You're offline — changes won't be saved until you reconnect.");
            }
            return;
        }

        // Determine whether taskEl is a calendar card or a task-list item
        var isCalendarCard = taskEl.classList.contains('calendar-item');
        var calendarCard = isCalendarCard
            ? taskEl
            : document.querySelector('.scheduled-task[data-task-id="' + taskId + '"], .date-only-task[data-task-id="' + taskId + '"]');
        var taskInList = isCalendarCard
            ? document.querySelector('.task-item[data-task-id="' + taskId + '"]')
            : taskEl;

        // Capture original state from calendar card (has time info) or task-list item
        var origScheduledDate = '';
        var origStartMins = '';
        var origDuration = '30';
        var origImpact = '4';
        var origCompleted = '0';
        var origTitle = '';
        var origHour = 0;
        var origMinutes = 0;
        var origScheduledTime = '';
        var dayCalendar = null;

        if (calendarCard) {
            dayCalendar = calendarCard.closest('.day-calendar');
            origScheduledDate = dayCalendar?.dataset.day || '';
            origStartMins = calendarCard.dataset.startMins || '';
            origDuration = calendarCard.dataset.duration || '30';
            origImpact = calendarCard.dataset.impact || '4';
            origCompleted = calendarCard.dataset.completed || '0';
            // Get title from calendar card
            var textEl = calendarCard.querySelector('.scheduled-task-text');
            if (textEl) {
                var clone = textEl.cloneNode(true);
                var occSpan = clone.querySelector('.occurrence-day');
                if (occSpan) occSpan.remove();
                origTitle = clone.textContent.trim();
            }
            if (origStartMins) {
                var sm = parseInt(origStartMins, 10);
                origHour = Math.floor(sm / 60);
                origMinutes = sm % 60;
            }
            origScheduledTime = String(origHour).padStart(2, '0') + ':' + String(origMinutes).padStart(2, '0') + ':00';

            // Remove calendar card from DOM
            calendarCard.remove();
            if (dayCalendar && typeof recalculateOverlaps === 'function') {
                recalculateOverlaps(dayCalendar);
            }
        }

        // Fall back to task-list item for missing info
        if (!origScheduledDate && taskInList) {
            origScheduledDate = taskInList.dataset.scheduledDate || '';
        }
        if (!origTitle && taskInList) {
            var taskTextEl = taskInList.querySelector('.task-text');
            if (taskTextEl) origTitle = taskTextEl.textContent.trim();
        }
        if (taskInList) {
            origDuration = calendarCard ? origDuration : (taskInList.dataset.duration || '30');
            origImpact = calendarCard ? origImpact : (taskInList.dataset.impact || '4');
            origCompleted = calendarCard ? origCompleted : (taskInList.dataset.completed || '0');
        }

        // Update task list item (move to unscheduled, don't remove)
        if (taskInList) {
            var inScheduledSection = !!taskInList.closest('#section-sched');
            if (inScheduledSection && window.TaskMutations) {
                TaskMutations.moveFromScheduledToDomain(taskInList);
            } else {
                taskInList.classList.remove('scheduled');
                if (typeof updateTaskScheduledDate === 'function') {
                    updateTaskScheduledDate(taskInList, null);
                }
                if (typeof moveTaskToUnscheduledSection === 'function') {
                    moveTaskToUnscheduledSection(taskInList);
                }
            }
        }

        // Capture undo data in closure
        var undoData = {
            taskId: taskId,
            scheduledDate: origScheduledDate,
            scheduledTime: origScheduledTime,
            hour: origHour,
            minutes: origMinutes,
            duration: origDuration,
            impact: origImpact,
            completed: origCompleted,
            title: origTitle,
            dayCalendar: dayCalendar,
        };

        // Call API immediately
        try {
            await safeFetch('/api/v1/tasks/' + taskId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scheduled_date: null, scheduled_time: null }),
            });

            // If no task in list, insert it now (DB-only scheduled task)
            var taskInListCheck = document.querySelector('.task-item[data-task-id="' + taskId + '"]');
            if (!taskInListCheck && window.TaskMutations) {
                await TaskMutations.insertNewTask(taskId);
            }

            // Show toast with undo
            var toastMsg = origTitle ? ('"' + origTitle + '" unscheduled') : 'Task unscheduled';
            Toast.undo(toastMsg, function() { undoUnschedule(undoData); });
        } catch (error) {
            // Restore calendar card on failure
            if (undoData.scheduledDate && undoData.scheduledTime &&
                window.DragDrop && typeof DragDrop.createScheduledTaskElement === 'function') {
                var newCard = DragDrop.createScheduledTaskElement(
                    undoData.taskId, undoData.title, undoData.duration,
                    undoData.hour, undoData.minutes, undoData.impact, undoData.completed
                );
                var dayCal = undoData.dayCalendar || document.querySelector('.day-calendar[data-day="' + undoData.scheduledDate + '"]');
                if (dayCal) {
                    var hourRow = dayCal.querySelector('.hour-row[data-hour="' + undoData.hour + '"]:not(.adjacent-day)');
                    if (hourRow) {
                        var slot = hourRow.querySelector('.hour-slot');
                        if (slot) slot.appendChild(newCard);
                    }
                    if (typeof recalculateOverlaps === 'function') {
                        recalculateOverlaps(dayCal);
                    }
                }
            }
            handleError(error, 'Failed to unschedule task', {
                component: 'task-complete',
                action: 'unscheduleTask'
            });
        }
    }

    /**
     * Undo an unschedule — re-schedule the task via API and restore the calendar card.
     * @param {Object} info - Captured original state
     */
    async function undoUnschedule(info) {
        try {
            // Re-schedule via API
            await safeFetch('/api/v1/tasks/' + info.taskId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scheduled_date: info.scheduledDate,
                    scheduled_time: info.scheduledTime,
                }),
            });

            // Recreate the calendar card
            if (info.scheduledDate && info.scheduledTime &&
                window.DragDrop && typeof DragDrop.createScheduledTaskElement === 'function') {

                var newCard = DragDrop.createScheduledTaskElement(
                    info.taskId, info.title, info.duration,
                    info.hour, info.minutes, info.impact, info.completed
                );

                var dayCal = info.dayCalendar || document.querySelector('.day-calendar[data-day="' + info.scheduledDate + '"]');
                if (dayCal) {
                    var hourRow = dayCal.querySelector('.hour-row[data-hour="' + info.hour + '"]:not(.adjacent-day)');
                    if (hourRow) {
                        var slot = hourRow.querySelector('.hour-slot');
                        if (slot) slot.appendChild(newCard);
                    }
                    if (typeof recalculateOverlaps === 'function') {
                        recalculateOverlaps(dayCal);
                    }
                }
            }

            // Restore task list item to scheduled state
            var taskInList = document.querySelector('.task-item[data-task-id="' + info.taskId + '"]');
            if (taskInList) {
                taskInList.classList.add('scheduled');
                if (typeof updateTaskScheduledDate === 'function') {
                    updateTaskScheduledDate(taskInList, info.scheduledDate);
                }
                if (typeof moveTaskToScheduledSection === 'function') {
                    moveTaskToScheduledSection(taskInList);
                }
            }
        } catch (error) {
            handleError(error, 'Failed to reschedule task', {
                component: 'task-complete',
                action: 'undoUnschedule'
            });
        }
    }

    /**
     * Refresh the task list from the server so tasks move between sections.
     */
    function refreshTaskListFromServer() {
        var taskListScroll = document.getElementById('task-list-scroll');
        if (taskListScroll && window.htmx) {
            window.htmx.ajax('GET', '/api/v1/task-list', {
                target: '#task-list-scroll',
                swap: 'innerHTML'
            }).then(function() {
                if (window.DragDrop && typeof window.DragDrop.init === 'function') {
                    window.DragDrop.init();
                }
                if (window.TaskComplete && typeof window.TaskComplete.init === 'function') {
                    window.TaskComplete.init();
                }
                if (window.EnergySelector && typeof window.EnergySelector.applyFilter === 'function') {
                    window.EnergySelector.applyFilter();
                }
            });
        }
    }

    /**
     * Get a human-readable date label for a task element.
     * Returns "today" if the date matches today, otherwise "Mon, Feb 10" format.
     * @param {HTMLElement} taskEl - The task element
     * @returns {string} Date label
     */
    function getDateLabel(taskEl) {
        // Priority chain for finding the date
        var dateStr = taskEl.dataset.instanceDate
            || taskEl.closest('.hour-row')?.dataset.actualDate
            || taskEl.closest('.day-calendar')?.dataset.day
            || taskEl.dataset.scheduledDate
            || '';

        if (!dateStr) return 'today';

        var today = new Date();
        var todayStr = today.getFullYear() + '-' +
            String(today.getMonth() + 1).padStart(2, '0') + '-' +
            String(today.getDate()).padStart(2, '0');

        if (dateStr === todayStr) return 'today';

        var d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    // Expose public API
    window.TaskComplete = {
        init: init,
        refreshTaskList: refreshTaskListFromServer,
        toggle: toggleCompletion,
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
