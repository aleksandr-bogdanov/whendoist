/**
 * Task Sort Module
 *
 * Handles sorting of tasks within domain groups.
 *
 * Default sort: Clarity ASC (exploratory→executable), Impact ASC (P1→P4), Duration ASC (short→long)
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
        // Check data-completed attribute or completion age class
        return task.dataset.completed === '1' ||
               task.classList.contains('completed-today') ||
               task.classList.contains('completed-older');
    }

    /**
     * Compare two task items for sorting.
     * Completed tasks always sort to the bottom, regardless of other sort criteria.
     * @param {HTMLElement} a - First task element
     * @param {HTMLElement} b - Second task element
     * @returns {number} - Comparison result
     */
    function compareTaskItems(a, b) {
        // ALWAYS put completed tasks at the bottom
        const aCompleted = isTaskCompleted(a);
        const bCompleted = isTaskCompleted(b);

        if (aCompleted && !bCompleted) return 1;  // a goes after b
        if (!aCompleted && bCompleted) return -1; // a goes before b

        // Both are completed or both are pending - apply normal sort
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

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
