/**
 * Task Sort Module
 *
 * Handles sorting of tasks within domain groups.
 *
 * Default sort: Clarity ASC (exploratory→executable), Impact ASC (P1→P4), Duration ASC (short→long)
 *
 * Architecture:
 * - Preferences are the single source of truth for section ordering
 * - Column headers control the sort field/order within sections
 * - Both server and client use the same sorting rules
 *
 * @module TaskSort
 */
(function() {
    'use strict';

    // Sort configuration
    const CLARITY_ORDER = { exploratory: 1, defined: 2, executable: 3, none: 4 };

    // Current sort state
    let currentSort = {
        field: 'clarity',
        order: 'asc'  // asc = exploratory first, desc = executable first
    };

    // User preferences - single source of truth for section ordering
    // Updated via updatePreference() when Options menu changes settings
    let userPrefs = {
        completed_move_to_bottom: true,
        completed_sort_by_date: true,
        scheduled_move_to_bottom: true,
        scheduled_sort_by_date: true,
    };

    /**
     * Initialize task sorting.
     */
    async function init() {
        // Load user preferences first
        await loadUserPreferences();

        const sortButtons = document.querySelectorAll('.header-sort');
        if (!sortButtons.length) return;

        sortButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const field = btn.dataset.sort;
                handleSortClick(field, btn);
            });
        });

        // Apply default sort on page load
        applySort();
    }

    /**
     * Load user preferences from API.
     */
    async function loadUserPreferences() {
        try {
            const response = await fetch('/api/preferences');
            if (response.ok) {
                const prefs = await response.json();
                // Only update the preferences we care about for sorting
                userPrefs.completed_move_to_bottom = prefs.completed_move_to_bottom ?? true;
                userPrefs.completed_sort_by_date = prefs.completed_sort_by_date ?? true;
                userPrefs.scheduled_move_to_bottom = prefs.scheduled_move_to_bottom ?? true;
                userPrefs.scheduled_sort_by_date = prefs.scheduled_sort_by_date ?? true;
            }
        } catch (e) {
            console.warn('Failed to load user preferences, using defaults');
        }
    }

    /**
     * Update a single preference value.
     * Called by task-list-options.js when user changes a setting.
     * @param {string} key - Preference key
     * @param {any} value - New value
     */
    function updatePreference(key, value) {
        if (key in userPrefs) {
            userPrefs[key] = value;
        }
    }

    /**
     * Get current preference values (for debugging/testing).
     * @returns {object} Current preferences
     */
    function getPreferences() {
        return { ...userPrefs };
    }

    /**
     * Handle click on sort button.
     * @param {string} field - The field to sort by (duration, impact, clarity)
     * @param {HTMLElement} btn - The clicked button
     */
    function handleSortClick(field, btn) {
        const wasActive = btn.classList.contains('active');

        // If clicking same field, toggle order; otherwise, set to asc
        if (field === currentSort.field) {
            currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.field = field;
            currentSort.order = 'asc';
        }

        // Update button states
        document.querySelectorAll('.header-sort').forEach(b => {
            b.classList.remove('active');
            b.removeAttribute('data-order');
            b.querySelector('.sort-icon').textContent = '';
        });

        btn.classList.add('active');
        btn.dataset.order = currentSort.order;
        btn.querySelector('.sort-icon').textContent = currentSort.order === 'asc' ? '↑' : '↓';

        applySort();
    }

    /**
     * Apply current sort to all domain groups.
     */
    function applySort() {
        const groups = document.querySelectorAll('.project-group');

        groups.forEach(group => {
            const taskList = group.querySelector('.task-list');
            if (!taskList) return;

            // Collect all task items
            const tasks = Array.from(taskList.querySelectorAll('.task-item'));

            // Sort tasks
            tasks.sort((a, b) => compareTaskItems(a, b));

            // Rebuild the list (preserve add-task-row)
            const addTaskRow = taskList.querySelector('.add-task-row');
            const fragment = document.createDocumentFragment();
            tasks.forEach(task => fragment.appendChild(task));

            // Clear and repopulate task list
            taskList.innerHTML = '';
            taskList.appendChild(fragment);

            // Re-add the add-task-row at the end
            if (addTaskRow) {
                taskList.appendChild(addTaskRow);
            }
        });
    }

    /**
     * Check if a task element is completed.
     * @param {HTMLElement} task - Task element
     * @returns {boolean} - True if completed
     */
    function isTaskCompleted(task) {
        // Check data-completed attribute or completed class
        return task.dataset.completed === '1' ||
               task.classList.contains('completed');
    }

    /**
     * Check if a task element is scheduled (has a date).
     * @param {HTMLElement} task - Task element
     * @returns {boolean} - True if scheduled
     */
    function isTaskScheduled(task) {
        // Check data-scheduled-date attribute
        const scheduledDate = task.dataset.scheduledDate;
        return scheduledDate && scheduledDate !== '';
    }

    /**
     * Get the section order for a task based on user preferences.
     *
     * Section order depends on preferences:
     * - scheduled_move_to_bottom=true, completed_move_to_bottom=true: 0=unscheduled, 1=scheduled, 2=completed
     * - scheduled_move_to_bottom=false, completed_move_to_bottom=true: 0=all pending (mixed), 1=completed
     * - scheduled_move_to_bottom=true, completed_move_to_bottom=false: 0=unscheduled+completed_unscheduled, 1=scheduled+completed_scheduled
     * - scheduled_move_to_bottom=false, completed_move_to_bottom=false: 0=all (fully interleaved)
     *
     * @param {HTMLElement} task - Task element
     * @returns {number} - Section order
     */
    function getTaskSection(task) {
        const isCompleted = isTaskCompleted(task);
        const isScheduled = isTaskScheduled(task);
        const completedToBottom = userPrefs.completed_move_to_bottom;
        const scheduledToBottom = userPrefs.scheduled_move_to_bottom;

        if (completedToBottom && scheduledToBottom) {
            // unscheduled(0) -> scheduled(1) -> completed(2)
            if (isCompleted) return 2;
            if (isScheduled) return 1;
            return 0;
        } else if (completedToBottom && !scheduledToBottom) {
            // all pending interleaved(0) -> completed(1)
            if (isCompleted) return 1;
            return 0;
        } else if (!completedToBottom && scheduledToBottom) {
            // unscheduled+completed_unscheduled(0) -> scheduled+completed_scheduled(1)
            if (isScheduled) return 1;
            return 0;
        } else {
            // All tasks interleaved (no sections)
            return 0;
        }
    }

    /**
     * Compare two task items for sorting.
     * Respects user preferences for section ordering.
     * Within each section, applies the selected sort criteria.
     * When scheduled tasks are in their own section (Bottom), they sort by date first.
     * When "In place", scheduled tasks sort like normal tasks by the selected field.
     * @param {HTMLElement} a - First task element
     * @param {HTMLElement} b - Second task element
     * @returns {number} - Comparison result
     */
    function compareTaskItems(a, b) {
        // First, maintain section order based on user preferences
        const sectionA = getTaskSection(a);
        const sectionB = getTaskSection(b);

        if (sectionA !== sectionB) {
            return sectionA - sectionB;
        }

        // When scheduled tasks are grouped at bottom AND sort by date is enabled,
        // sort by date first (soonest first), then by selected criteria
        const scheduledToBottom = userPrefs.scheduled_move_to_bottom;
        const scheduledSortByDate = userPrefs.scheduled_sort_by_date;
        if (scheduledToBottom && scheduledSortByDate && isTaskScheduled(a) && isTaskScheduled(b)) {
            const dateA = a.dataset.scheduledDate || '9999-12-31';
            const dateB = b.dataset.scheduledDate || '9999-12-31';
            if (dateA !== dateB) {
                return dateA.localeCompare(dateB);  // Ascending date order
            }
            // Same date, fall through to normal sort
        }

        // When completed tasks are grouped at bottom AND sort by date is enabled,
        // sort by completion date first (most recent first), then by selected criteria
        const completedToBottom = userPrefs.completed_move_to_bottom;
        const completedSortByDate = userPrefs.completed_sort_by_date;
        if (completedToBottom && completedSortByDate && isTaskCompleted(a) && isTaskCompleted(b)) {
            const dateA = a.dataset.completedAt || '0000-00-00T00:00:00';
            const dateB = b.dataset.completedAt || '0000-00-00T00:00:00';
            if (dateA !== dateB) {
                return dateB.localeCompare(dateA);  // Descending (most recent first)
            }
            // Same date, fall through to normal sort
        }

        // Within section, apply normal sort by selected field
        const result = compareByField(a, b, currentSort.field);

        if (result !== 0) {
            return currentSort.order === 'asc' ? result : -result;
        }

        // Secondary sort: if primary field is equal, apply default cascade
        // Clarity → Impact → Duration
        if (currentSort.field !== 'clarity') {
            const clarityResult = compareByField(a, b, 'clarity');
            if (clarityResult !== 0) return clarityResult;
        }

        if (currentSort.field !== 'impact') {
            const impactResult = compareByField(a, b, 'impact');
            if (impactResult !== 0) return impactResult;
        }

        if (currentSort.field !== 'duration') {
            const durationResult = compareByField(a, b, 'duration');
            if (durationResult !== 0) return durationResult;
        }

        return 0;
    }

    /**
     * Compare two tasks by a specific field.
     * @param {HTMLElement} a - First task element
     * @param {HTMLElement} b - Second task element
     * @param {string} field - Field to compare
     * @returns {number} - Comparison result (positive if a > b)
     */
    function compareByField(a, b, field) {
        switch (field) {
            case 'clarity': {
                const clarityA = a.dataset.clarity || 'none';
                const clarityB = b.dataset.clarity || 'none';
                return (CLARITY_ORDER[clarityA] || 4) - (CLARITY_ORDER[clarityB] || 4);
            }
            case 'impact': {
                // Get impact from the meta-impact span text (P1, P2, P3, P4)
                const impactA = getImpactValue(a);
                const impactB = getImpactValue(b);
                return impactA - impactB;
            }
            case 'duration': {
                const durationA = parseInt(a.dataset.duration, 10) || 999;
                const durationB = parseInt(b.dataset.duration, 10) || 999;
                return durationA - durationB;
            }
            default:
                return 0;
        }
    }

    /**
     * Extract impact value from task element.
     * @param {HTMLElement} task - Task element
     * @returns {number} - Impact value (1-4)
     */
    function getImpactValue(task) {
        const impactEl = task.querySelector('.meta-impact');
        if (!impactEl) return 4;

        const text = impactEl.textContent.trim();
        const match = text.match(/P(\d)/);
        return match ? parseInt(match[1], 10) : 4;
    }

    // Expose API for other modules
    window.TaskSort = {
        applySort,
        updatePreference,
        getPreferences,
        reloadPreferences: loadUserPreferences,
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
