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

    /**
     * Initialize task completion handlers.
     */
    async function init() {
        // Load user preferences
        await loadUserPreferences();

        // Use event delegation on document for all completion gutters
        document.addEventListener('click', handleGutterClick);
    }

    /**
     * Load user preferences from API.
     */
    async function loadUserPreferences() {
        try {
            const response = await fetch('/api/preferences');
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
        const isCompleted = taskEl.dataset.completed === '1';

        // Toggle completion
        toggleCompletion(taskEl, taskId, instanceId, !isCompleted);
    }

    /**
     * Toggle task completion state.
     * @param {HTMLElement} taskEl - The task element
     * @param {string} taskId - Task ID
     * @param {string|undefined} instanceId - Instance ID for recurring tasks
     * @param {boolean} shouldComplete - Whether to mark as completed
     */
    async function toggleCompletion(taskEl, taskId, instanceId, shouldComplete) {
        // Optimistic UI update
        taskEl.dataset.completed = shouldComplete ? '1' : '0';

        try {
            let url;
            let body = {};

            if (instanceId) {
                // Recurring task instance with known ID
                url = `/api/instances/${instanceId}/toggle-complete`;
            } else {
                // Regular task OR recurring task without known instance
                url = `/api/tasks/${taskId}/toggle-complete`;

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
                headers: {
                    'Content-Type': 'application/json',
                },
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
            showToast(data.completed ? 'Task completed' : 'Task reopened');

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
