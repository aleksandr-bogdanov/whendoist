/**
 * Task List Options Module
 *
 * Handles the options menu for task list settings.
 * Settings include:
 *   - Show completed in list (toggle)
 *   - Keep visible for (1/3/7 days)
 *   - Position in list (move to bottom / keep in place)
 *   - Hide recurring after completing today (toggle)
 *   - Show deleted tasks (view switch)
 *
 * Changes are applied instantly via API and HTMX partial refresh.
 *
 * @module TaskListOptions
 */
(function() {
    'use strict';

    let optionsBtn;
    let optionsMenu;
    let currentView = 'normal'; // 'normal', 'deleted', 'scheduled'

    /**
     * Initialize the options menu.
     */
    function init() {
        optionsBtn = document.getElementById('header-actions-btn');
        optionsMenu = document.getElementById('task-list-options-menu');

        if (!optionsBtn || !optionsMenu) return;

        // Toggle menu on button click
        optionsBtn.addEventListener('click', toggleMenu);

        // Close menu when clicking outside
        document.addEventListener('click', handleOutsideClick);

        // Handle toggle switches
        optionsMenu.querySelectorAll('.option-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => handleToggle(toggle));
        });

        // Handle segmented controls
        optionsMenu.querySelectorAll('.seg-btn').forEach(btn => {
            btn.addEventListener('click', () => handleSegmentedClick(btn));
        });

        // Handle "Show deleted tasks" button
        const showDeletedBtn = document.getElementById('show-deleted-tasks-btn');
        if (showDeletedBtn) {
            showDeletedBtn.addEventListener('click', showDeletedTasks);
        }

        // Handle "Show scheduled tasks" button
        const showScheduledBtn = document.getElementById('show-scheduled-tasks-btn');
        if (showScheduledBtn) {
            showScheduledBtn.addEventListener('click', showScheduledTasks);
        }

        // Handle "Show completed tasks" button
        const showCompletedBtn = document.getElementById('show-completed-tasks-btn');
        if (showCompletedBtn) {
            showCompletedBtn.addEventListener('click', showCompletedTasks);
        }

        // Use event delegation for restore/back buttons (since they're loaded via HTMX)
        document.addEventListener('click', handleDelegatedClick);

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isMenuOpen()) {
                closeMenu();
            }
        });
    }

    /**
     * Check if menu is open.
     * @returns {boolean}
     */
    function isMenuOpen() {
        return !optionsMenu.hidden;
    }

    /**
     * Toggle the options menu.
     */
    function toggleMenu() {
        if (isMenuOpen()) {
            closeMenu();
        } else {
            openMenu();
        }
    }

    /**
     * Open the options menu.
     */
    function openMenu() {
        optionsMenu.hidden = false;
        optionsBtn.setAttribute('aria-expanded', 'true');
    }

    /**
     * Close the options menu.
     */
    function closeMenu() {
        optionsMenu.hidden = true;
        optionsBtn.setAttribute('aria-expanded', 'false');
    }

    /**
     * Handle clicks outside the menu to close it.
     * @param {Event} e - Click event
     */
    function handleOutsideClick(e) {
        if (!isMenuOpen()) return;

        // Check if click is outside both menu and button
        if (!optionsMenu.contains(e.target) && !optionsBtn.contains(e.target)) {
            closeMenu();
        }
    }

    /**
     * Refresh the task list using HTMX.
     */
    function refreshTaskList() {
        const taskListScroll = document.getElementById('task-list-scroll');
        if (taskListScroll && window.htmx) {
            htmx.ajax('GET', '/api/task-list', {
                target: '#task-list-scroll',
                swap: 'innerHTML'
            }).then(() => {
                // Re-initialize drag-drop handlers after content swap
                if (window.DragDrop && typeof window.DragDrop.init === 'function') {
                    window.DragDrop.init();
                }
                // Re-initialize task completion handlers
                if (window.TaskComplete && typeof window.TaskComplete.init === 'function') {
                    window.TaskComplete.init();
                }
                // Re-initialize energy filter
                if (window.EnergySelector && typeof window.EnergySelector.applyFilter === 'function') {
                    window.EnergySelector.applyFilter();
                }
            });
        }
    }

    /**
     * Handle toggle switch click.
     * @param {HTMLElement} toggle - Toggle button element
     */
    async function handleToggle(toggle) {
        const pref = toggle.dataset.pref;
        const newValue = !toggle.classList.contains('active');

        // Optimistic UI update
        toggle.classList.toggle('active', newValue);
        toggle.setAttribute('aria-pressed', newValue ? 'true' : 'false');

        // Handle conditional visibility (data-controls attribute)
        const controlsId = toggle.dataset.controls;
        if (controlsId) {
            const controlledEl = document.getElementById(controlsId);
            if (controlledEl) {
                controlledEl.hidden = !newValue;
            }
        }

        // Save preference
        const success = await savePreference(pref, newValue);

        if (success) {
            // Refresh task list via HTMX
            refreshTaskList();
        } else {
            // Revert on failure
            toggle.classList.toggle('active', !newValue);
            toggle.setAttribute('aria-pressed', !newValue ? 'true' : 'false');
            // Revert visibility
            if (controlsId) {
                const controlledEl = document.getElementById(controlsId);
                if (controlledEl) {
                    controlledEl.hidden = newValue;
                }
            }
        }
    }

    /**
     * Handle segmented control click.
     * @param {HTMLElement} btn - Clicked segment button
     */
    async function handleSegmentedClick(btn) {
        const container = btn.closest('.option-segmented');
        const pref = container.dataset.pref;
        let value = btn.dataset.value;

        // Convert value types
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (!isNaN(value)) value = parseInt(value, 10);

        // Optimistic UI update
        container.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Save preference
        const success = await savePreference(pref, value);

        if (success) {
            // Refresh task list via HTMX
            refreshTaskList();
        }
    }

    /**
     * Save a preference to the API.
     * @param {string} key - Preference key
     * @param {any} value - Preference value
     * @returns {Promise<boolean>} - Success status
     */
    async function savePreference(key, value) {
        try {
            const response = await fetch('/api/preferences', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ [key]: value }),
            });

            if (response.ok) {
                // Keep TaskSort's preferences in sync
                // This ensures column header clicks use the updated values
                if (window.TaskSort && typeof window.TaskSort.updatePreference === 'function') {
                    window.TaskSort.updatePreference(key, value);
                }
            }

            return response.ok;
        } catch (e) {
            console.error('Failed to save preference:', e);
            return false;
        }
    }

    /**
     * Show deleted tasks view.
     */
    function showDeletedTasks() {
        closeMenu();
        currentView = 'deleted';

        // Toggle header elements
        setSpecialViewHeader(true);

        const taskListScroll = document.getElementById('task-list-scroll');
        if (taskListScroll && window.htmx) {
            htmx.ajax('GET', '/api/deleted-tasks', {
                target: '#task-list-scroll',
                swap: 'innerHTML'
            });
        }
    }

    /**
     * Show scheduled tasks view.
     */
    function showScheduledTasks() {
        closeMenu();
        currentView = 'scheduled';

        // Toggle header elements
        setSpecialViewHeader(true);

        const taskListScroll = document.getElementById('task-list-scroll');
        if (taskListScroll && window.htmx) {
            htmx.ajax('GET', '/api/scheduled-tasks', {
                target: '#task-list-scroll',
                swap: 'innerHTML'
            });
        }
    }

    /**
     * Show completed tasks view.
     */
    function showCompletedTasks() {
        closeMenu();
        currentView = 'completed';

        // Toggle header elements
        setSpecialViewHeader(true);

        const taskListScroll = document.getElementById('task-list-scroll');
        if (taskListScroll && window.htmx) {
            htmx.ajax('GET', '/api/completed-tasks', {
                target: '#task-list-scroll',
                swap: 'innerHTML'
            });
        }
    }

    /**
     * Show normal tasks view.
     */
    function showNormalTasks() {
        currentView = 'normal';

        // Toggle header elements
        setSpecialViewHeader(false);

        refreshTaskList();
    }

    /**
     * Toggle header elements for special views (deleted/scheduled).
     * @param {boolean} isSpecialView - Whether showing a special view
     */
    function setSpecialViewHeader(isSpecialView) {
        const taskLabel = document.getElementById('header-task-label');
        const backBtn = document.getElementById('header-back-btn');
        const viewCount = document.getElementById('header-view-count');
        const energySelector = document.getElementById('header-energy-inline');

        if (taskLabel) taskLabel.hidden = isSpecialView;
        if (backBtn) backBtn.hidden = !isSpecialView;
        if (viewCount) viewCount.hidden = !isSpecialView;
        if (energySelector) energySelector.hidden = isSpecialView;
    }

    /**
     * Handle delegated clicks for dynamically loaded elements.
     * @param {Event} e - Click event
     */
    function handleDelegatedClick(e) {
        // Back to tasks button (header)
        const backBtn = e.target.closest('#header-back-btn');
        if (backBtn) {
            e.preventDefault();
            showNormalTasks();
            return;
        }

        // Restore task button
        const restoreBtn = e.target.closest('.restore-gutter');
        if (restoreBtn) {
            e.preventDefault();
            e.stopPropagation();
            const taskEl = restoreBtn.closest('[data-task-id]');
            if (taskEl) {
                restoreTask(taskEl);
            }
            return;
        }
    }

    /**
     * Restore a deleted task.
     * @param {HTMLElement} taskEl - The task element
     */
    async function restoreTask(taskEl) {
        const taskId = taskEl.dataset.taskId;
        if (!taskId) return;

        // Visual feedback - fade out
        taskEl.style.opacity = '0.5';
        taskEl.style.pointerEvents = 'none';

        try {
            const response = await fetch(`/api/tasks/${taskId}/restore`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error('Failed to restore task');
            }

            // Animate removal
            taskEl.style.transition = 'all 0.3s ease';
            taskEl.style.transform = 'translateX(20px)';
            taskEl.style.opacity = '0';

            setTimeout(() => {
                taskEl.remove();

                // Update count in header
                const countEl = document.getElementById('header-view-count');
                if (countEl) {
                    const match = countEl.textContent.match(/(\d+)/);
                    if (match) {
                        const newCount = parseInt(match[1], 10) - 1;
                        countEl.textContent = `${newCount} deleted`;
                    }
                }

                // Check if any tasks remain in the group
                const group = taskEl.closest('.project-group');
                if (group) {
                    const remainingTasks = group.querySelectorAll('.task-item');
                    if (remainingTasks.length === 0) {
                        group.remove();
                    }
                }

                // Show toast
                showToast('Task restored');
            }, 300);

        } catch (error) {
            console.error('Error restoring task:', error);
            // Revert visual feedback
            taskEl.style.opacity = '';
            taskEl.style.pointerEvents = '';
            showToast('Failed to restore task');
        }
    }

    /**
     * Show a toast notification.
     * @param {string} message - Message to display
     */
    function showToast(message) {
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
