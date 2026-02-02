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

    // Active skip menu reference (for cleanup)
    let activeSkipMenu = null;

    /**
     * Initialize task completion handlers.
     */
    async function init() {
        // Load user preferences
        await loadUserPreferences();

        // Use event delegation on document for all completion gutters
        document.addEventListener('click', handleGutterClick);

        // Right-click context menu for recurring task gutters
        document.addEventListener('contextmenu', handleGutterRightClick);

        // Dismiss skip menu on click elsewhere
        document.addEventListener('click', dismissSkipMenu);
    }

    /**
     * Load user preferences from API.
     */
    async function loadUserPreferences() {
        try {
            const response = await fetch('/api/v1/preferences');
            if (response.ok) {
                userPrefs = await response.json();
            }
        } catch (e) {
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

            const response = await fetch(url, {
                method: 'POST',
                headers: window.getCSRFHeaders({
                    'Content-Type': 'application/json',
                }),
                body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
            });

            if (!response.ok) {
                throw new Error('Failed to toggle completion');
            }

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

            // Move task in left panel based on completion state (if preference enabled)
            if (taskEl.classList.contains('task-item') && userPrefs.completed_move_to_bottom) {
                if (data.completed) {
                    moveToBottomOfDomain(taskEl);
                } else {
                    moveToTopOfDomain(taskEl);
                }
            }

            // Show toast notification
            if (isRecurring) {
                showToast(data.completed ? 'Done for today' : 'Reopened for today');
            } else {
                showToast(data.completed ? 'Task completed' : 'Task reopened');
            }

        } catch (error) {
            console.error('Error toggling completion:', error);

            // Revert optimistic update on error
            taskEl.dataset.completed = shouldComplete ? '0' : '1';

            showToast('Failed to update task');
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

            // Move task-items in left panel (if preference enabled)
            if (el.classList.contains('task-item') && userPrefs.completed_move_to_bottom) {
                if (completed) {
                    moveToBottomOfDomain(el);
                } else {
                    moveToTopOfDomain(el);
                }
            }
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
    // SKIP INSTANCE (right-click context menu)
    // ==========================================================================

    /**
     * Handle right-click on completion gutter for recurring tasks.
     * Shows a context menu with "Skip" option.
     * @param {Event} e - contextmenu event
     */
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

    /**
     * Show skip context menu at given position.
     * @param {number} x - clientX
     * @param {number} y - clientY
     * @param {HTMLElement} taskEl - The task element
     * @param {string} instanceId - Instance ID
     */
    function showSkipMenu(x, y, taskEl, instanceId) {
        dismissSkipMenu();

        const menu = document.createElement('div');
        menu.className = 'skip-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        const skipBtn = document.createElement('button');
        skipBtn.className = 'skip-menu-item';
        skipBtn.innerHTML = '<span class="skip-icon">⏭</span> Skip this instance';
        skipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dismissSkipMenu();
            skipInstance(taskEl, instanceId);
        });

        menu.appendChild(skipBtn);
        document.body.appendChild(menu);
        activeSkipMenu = menu;

        // Adjust if overflowing viewport
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - rect.width - 8}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${window.innerHeight - rect.height - 8}px`;
        }
    }

    /**
     * Dismiss the active skip menu.
     */
    function dismissSkipMenu() {
        if (activeSkipMenu) {
            activeSkipMenu.remove();
            activeSkipMenu = null;
        }
    }

    /**
     * Skip a recurring task instance via API.
     * @param {HTMLElement} taskEl - The task element
     * @param {string} instanceId - Instance ID
     */
    async function skipInstance(taskEl, instanceId) {
        // Optimistic UI update
        taskEl.classList.add('skipped');
        taskEl.dataset.completed = '1';

        try {
            const response = await fetch(`/api/v1/instances/${instanceId}/skip`, {
                method: 'POST',
                headers: window.getCSRFHeaders(),
            });

            if (!response.ok) {
                throw new Error('Failed to skip instance');
            }

            // Sync across all representations of this instance
            document.querySelectorAll(`[data-instance-id="${instanceId}"]`).forEach(el => {
                if (el === taskEl) return;
                el.classList.add('skipped');
                el.dataset.completed = '1';
                applyCompletionClass(el, false); // Don't use completed style
            });

            // Move task to bottom if preference enabled
            if (taskEl.classList.contains('task-item') && userPrefs.completed_move_to_bottom) {
                moveToBottomOfDomain(taskEl);
            }

            showToast('Skipped for today');
        } catch (error) {
            console.error('Error skipping instance:', error);
            // Revert optimistic update
            taskEl.classList.remove('skipped');
            taskEl.dataset.completed = '0';
            showToast('Failed to skip instance');
        }
    }

    /**
     * Show a toast notification.
     * @param {string} message - Message to display
     */
    function showToast(message) {
        // Use existing Toast module
        if (typeof window.Toast !== 'undefined' && typeof window.Toast.show === 'function') {
            window.Toast.show(message, { showUndo: false });
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
