/**
 * Task List Options Module
 *
 * Handles the header controls for task list settings:
 *   - View chips: 📅 Sched, ✓ Done (toggle preferences), 🗑 (deleted view)
 *   - Gear panel: Keep visible for (1d/3d/7d), Hide recurring toggle
 *   - Settings panel action links: View all scheduled, View all completed
 *   - Back button: Return from special views to normal task list
 *   - Restore task: Restore deleted tasks
 *
 * Changes are applied instantly via API and HTMX partial refresh.
 *
 * @module TaskListOptions
 */
(function() {
    'use strict';

    let gearBtn;
    let settingsPanel;
    let currentView = 'normal'; // 'normal', 'deleted', 'scheduled', 'completed'

    /**
     * Initialize the options module.
     */
    function init() {
        gearBtn = document.getElementById('gear-btn');
        settingsPanel = document.getElementById('settings-panel');

        // Gear panel toggle
        if (gearBtn && settingsPanel) {
            gearBtn.addEventListener('click', togglePanel);
            document.addEventListener('click', handleOutsideClick);
        }

        // Section collapse/expand handlers (use event delegation for HTMX compatibility)
        const taskListScroll = document.getElementById('task-list-scroll');
        if (taskListScroll) {
            taskListScroll.addEventListener('toggle', (e) => {
                const sectionGroup = e.target.closest('.section-group');
                if (sectionGroup) {
                    const sectionId = sectionGroup.id;
                    if (sectionId === 'section-sched') {
                        savePreference('show_scheduled_in_list', sectionGroup.open);
                    } else if (sectionId === 'section-done') {
                        savePreference('show_completed_in_list', sectionGroup.open);
                    }
                }
            }, true);
        }

        // Trash button moved to settings panel
        const showDeletedBtn = document.getElementById('show-deleted-tasks-btn');
        if (showDeletedBtn) {
            showDeletedBtn.addEventListener('click', showDeletedTasks);
        }

        // Settings panel: toggle handler for hide_recurring
        if (settingsPanel) {
            settingsPanel.querySelectorAll('.option-toggle').forEach(toggle => {
                toggle.addEventListener('click', () => handleToggle(toggle));
            });
        }

        // Settings panel: segmented control handler for retention days
        if (settingsPanel) {
            settingsPanel.querySelectorAll('.seg-btn').forEach(btn => {
                btn.addEventListener('click', () => handleSegmentedClick(btn));
            });
        }

        // Settings panel action links
        const showScheduledBtn = document.getElementById('show-scheduled-tasks-btn');
        if (showScheduledBtn) {
            showScheduledBtn.addEventListener('click', showScheduledTasks);
        }

        const showCompletedBtn = document.getElementById('show-completed-tasks-btn');
        if (showCompletedBtn) {
            showCompletedBtn.addEventListener('click', showCompletedTasks);
        }

        // Delegated click handlers for restore/back buttons (loaded via HTMX)
        document.addEventListener('click', handleDelegatedClick);

        // Close panel on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isPanelOpen()) {
                closePanel();
            }
        });
    }

    // =========================================================================
    // Gear Panel
    // =========================================================================

    function isPanelOpen() {
        return settingsPanel && !settingsPanel.hidden;
    }

    function togglePanel() {
        if (isPanelOpen()) {
            closePanel();
        } else {
            openPanel();
        }
    }

    function openPanel() {
        settingsPanel.hidden = false;
        gearBtn.setAttribute('aria-expanded', 'true');
    }

    function closePanel() {
        settingsPanel.hidden = true;
        gearBtn.setAttribute('aria-expanded', 'false');
    }

    function handleOutsideClick(e) {
        if (!isPanelOpen()) return;
        if (!settingsPanel.contains(e.target) && !gearBtn.contains(e.target)) {
            closePanel();
        }
    }

    // =========================================================================
    // Settings Panel Controls
    // =========================================================================

    /**
     * Handle toggle switch click in settings panel.
     * @param {HTMLElement} toggle - Toggle button element
     */
    async function handleToggle(toggle) {
        const pref = toggle.dataset.pref;
        const newValue = !toggle.classList.contains('active');

        // Optimistic UI update
        toggle.classList.toggle('active', newValue);
        toggle.setAttribute('aria-pressed', newValue ? 'true' : 'false');

        const success = await savePreference(pref, newValue);

        if (success) {
            refreshTaskList();
        } else {
            // Revert on failure
            toggle.classList.toggle('active', !newValue);
            toggle.setAttribute('aria-pressed', !newValue ? 'true' : 'false');
        }
    }

    /**
     * Handle segmented control click in settings panel.
     * @param {HTMLElement} btn - Clicked segment button
     */
    async function handleSegmentedClick(btn) {
        const container = btn.closest('.sp-seg');
        const pref = container.dataset.pref;
        let value = btn.dataset.value;

        // Convert value types
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (!isNaN(value)) value = parseInt(value, 10);

        // Optimistic UI update
        container.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const success = await savePreference(pref, value);

        if (success) {
            refreshTaskList();
        }
    }

    // =========================================================================
    // Special Views
    // =========================================================================

    /**
     * Show deleted tasks view.
     * Flushes any pending deletions first so newly deleted tasks appear.
     */
    async function showDeletedTasks() {
        closePanel();
        currentView = 'deleted';

        setSpecialViewHeader(true);

        // Flush pending deletions so the server has them before we fetch
        const flushPromises = [];
        if (window.TaskComplete && typeof window.TaskComplete.flushPendingDeletion === 'function') {
            flushPromises.push(window.TaskComplete.flushPendingDeletion());
        }
        if (window.TaskDialog && typeof window.TaskDialog.flushPendingDeletion === 'function') {
            flushPromises.push(window.TaskDialog.flushPendingDeletion());
        }
        await Promise.all(flushPromises);

        const taskListScroll = document.getElementById('task-list-scroll');
        if (taskListScroll && window.htmx) {
            htmx.ajax('GET', '/api/v1/deleted-tasks', {
                target: '#task-list-scroll',
                swap: 'innerHTML'
            });
        }
    }

    /**
     * Show scheduled tasks view (from settings panel action link).
     */
    function showScheduledTasks() {
        closePanel();
        currentView = 'scheduled';

        setSpecialViewHeader(true);

        const taskListScroll = document.getElementById('task-list-scroll');
        if (taskListScroll && window.htmx) {
            htmx.ajax('GET', '/api/v1/scheduled-tasks', {
                target: '#task-list-scroll',
                swap: 'innerHTML'
            });
        }
    }

    /**
     * Show completed tasks view (from settings panel action link).
     */
    function showCompletedTasks() {
        closePanel();
        currentView = 'completed';

        setSpecialViewHeader(true);

        const taskListScroll = document.getElementById('task-list-scroll');
        if (taskListScroll && window.htmx) {
            htmx.ajax('GET', '/api/v1/completed-tasks', {
                target: '#task-list-scroll',
                swap: 'innerHTML'
            });
        }
    }

    /**
     * Return to normal tasks view.
     */
    function showNormalTasks() {
        currentView = 'normal';

        setSpecialViewHeader(false);
        refreshTaskList();
    }

    /**
     * Toggle header elements for special views (deleted/scheduled/completed).
     * @param {boolean} isSpecialView - Whether showing a special view
     */
    function setSpecialViewHeader(isSpecialView) {
        const energy = document.getElementById('header-energy');
        const backBtn = document.getElementById('header-back-btn');
        const viewCount = document.getElementById('header-view-count');
        const dateLabel = document.getElementById('header-date-label');

        if (energy) energy.hidden = isSpecialView;
        if (backBtn) backBtn.hidden = !isSpecialView;
        if (viewCount) viewCount.hidden = !isSpecialView;
        // Show date label in subviews by default; _deleted_tasks.html overrides to hide
        if (dateLabel) dateLabel.hidden = !isSpecialView;
    }

    // =========================================================================
    // Shared Utilities
    // =========================================================================

    /**
     * Refresh the task list using HTMX.
     */
    function refreshTaskList() {
        const taskListScroll = document.getElementById('task-list-scroll');
        if (taskListScroll && window.htmx) {
            htmx.ajax('GET', '/api/v1/task-list', {
                target: '#task-list-scroll',
                swap: 'innerHTML'
            }).then(() => {
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
     * Save a preference to the API.
     * @param {string} key - Preference key
     * @param {any} value - Preference value
     * @returns {Promise<boolean>} - Success status
     */
    async function savePreference(key, value) {
        try {
            const response = await safeFetch('/api/v1/preferences', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: value }),
            });

            return response.ok;
        } catch (e) {
            handleError(e, 'Failed to save preference', {
                component: 'task-list-options',
                action: 'savePreference'
            });
            return false;
        }
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

        // Grab task title before removal for the toast
        const textEl = taskEl.querySelector('.task-text');
        const taskTitle = textEl ? textEl.textContent.trim() : '';

        // Visual feedback - fade out
        taskEl.style.opacity = '0.5';
        taskEl.style.pointerEvents = 'none';

        try {
            const resp = await safeFetch(`/api/v1/tasks/${taskId}/restore`, {
                method: 'POST',
            });
            const taskData = await resp.json();

            // Animate removal
            taskEl.style.transition = 'all 0.3s ease';
            taskEl.style.transform = 'translateX(20px)';
            taskEl.style.opacity = '0';

            setTimeout(() => {
                taskEl.remove();

                // Update count in header
                const titleEl = document.getElementById('header-view-title');
                if (titleEl) {
                    const match = titleEl.textContent.match(/(\d+)/);
                    if (match) {
                        const newCount = parseInt(match[1], 10) - 1;
                        titleEl.textContent = `Deleted (${newCount})`;
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

                // Re-create calendar card if task was scheduled
                if (window.TaskMutations && typeof TaskMutations.updateCalendarItem === 'function') {
                    TaskMutations.updateCalendarItem(taskId, taskData);
                }

                const label = taskTitle ? '"' + taskTitle + '" restored' : 'Task restored';
                showToast(label);
            }, 300);

        } catch (error) {
            handleError(error, 'Failed to restore task', {
                component: 'task-list-options',
                action: 'restoreTask'
            });
            taskEl.style.opacity = '';
            taskEl.style.pointerEvents = '';
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
