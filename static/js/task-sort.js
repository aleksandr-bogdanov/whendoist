/**
 * Task Sort Module
 *
 * Handles sorting of tasks within domain groups.
 *
 * Default sort: Clarity ASC (open→clear), Impact ASC (P1→P4), Duration ASC (short→long)
 *
 * Architecture:
 * - Section ordering is hardcoded (always group-at-bottom, sort-by-date)
 * - Column headers control the sort field/order within sections
 * - Both server and client use the same sorting rules
 *
 * @module TaskSort
 */
(function() {
    'use strict';

    // Sort configuration
    const CLARITY_ORDER = { open: 1, defined: 2, clear: 3, none: 4 };

    // Current sort state
    let currentSort = {
        field: 'clarity',
        order: 'asc'  // asc = open first, desc = clear first
    };

    // Hardcoded section preferences — always true (opinionated defaults)
    const SECTION_PREFS = {
        completed_move_to_bottom: true,
        completed_sort_by_date: true,
        scheduled_move_to_bottom: true,
        scheduled_sort_by_date: true,
    };

    /**
     * Initialize task sorting.
     */
    function init() {
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
        return task.dataset.completed === '1' ||
               task.classList.contains('completed');
    }

    /**
     * Check if a task element is scheduled (has a date).
     * @param {HTMLElement} task - Task element
     * @returns {boolean} - True if scheduled
     */
    function isTaskScheduled(task) {
        const scheduledDate = task.dataset.scheduledDate;
        return scheduledDate && scheduledDate !== '';
    }

    /**
     * Get the section order for a task.
     * Always: unscheduled(0) -> scheduled(1) -> completed(2)
     *
     * @param {HTMLElement} task - Task element
     * @returns {number} - Section order
     */
    function getTaskSection(task) {
        if (isTaskCompleted(task)) return 2;
        if (isTaskScheduled(task)) return 1;
        return 0;
    }

    /**
     * Compare two task items for sorting.
     * @param {HTMLElement} a - First task element
     * @param {HTMLElement} b - Second task element
     * @returns {number} - Comparison result
     */
    function compareTaskItems(a, b) {
        // First, maintain section order
        const sectionA = getTaskSection(a);
        const sectionB = getTaskSection(b);

        if (sectionA !== sectionB) {
            return sectionA - sectionB;
        }

        // Scheduled section: sort by date first (soonest first)
        if (isTaskScheduled(a) && isTaskScheduled(b)) {
            const dateA = a.dataset.scheduledDate || '9999-12-31';
            const dateB = b.dataset.scheduledDate || '9999-12-31';
            if (dateA !== dateB) {
                return dateA.localeCompare(dateB);
            }
        }

        // Completed section: sort by completion date first (most recent first)
        if (isTaskCompleted(a) && isTaskCompleted(b)) {
            const dateA = a.dataset.completedAt || '0000-00-00T00:00:00';
            const dateB = b.dataset.completedAt || '0000-00-00T00:00:00';
            if (dateA !== dateB) {
                return dateB.localeCompare(dateA);
            }
        }

        // Within section, apply normal sort by selected field
        const result = compareByField(a, b, currentSort.field);

        if (result !== 0) {
            return currentSort.order === 'asc' ? result : -result;
        }

        // Secondary sort cascade: Clarity → Impact → Duration
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
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
