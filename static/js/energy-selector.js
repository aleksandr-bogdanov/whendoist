/**
 * Energy Selector Module
 *
 * Controls task visibility based on user's current energy level.
 * Uses CSS-based filtering via body[data-energy-level] attribute.
 *
 * Energy Levels:
 *   0 (Show All):   All tasks visible, including those without clarity
 *   1 (Zombie):     Only @executable tasks visible
 *   2 (Normal):     @executable and @defined visible
 *   3 (Deep Focus): All tasks with clarity labels visible
 *
 * CSS filtering (in dashboard.css):
 *   body[data-energy-level="1"] .task-item[data-clarity="defined"] { display: none }
 *   body[data-energy-level="2"] .task-item[data-clarity="exploratory"] { display: none }
 *
 * Note: Not persisted - resets to Normal (level 2) on page load.
 *
 * @module EnergySelector
 */
(function() {
    'use strict';

    // Default energy level: Normal (shows executable + defined)
    const DEFAULT_ENERGY = 2;
    let currentEnergy = DEFAULT_ENERGY;

    /**
     * Initialize energy selector.
     * Attaches click handlers to energy buttons and applies initial state.
     */
    function init() {
        const selector = document.querySelector('.energy-selector');
        if (!selector) return;

        const buttons = selector.querySelectorAll('.energy-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const level = parseInt(btn.dataset.energy, 10);
                // Allow 0 (Show All) through 3 (Focus)
                if (level >= 0 && level <= 3) {
                    setEnergy(level);
                }
            });
        });

        // Apply initial state
        applyEnergyFilter();
    }

    /**
     * Set the current energy level and update UI.
     * @param {number} level - Energy level (0-3)
     */
    function setEnergy(level) {
        currentEnergy = level;

        // Update button states - remove active from all first
        document.querySelectorAll('.energy-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-pressed', 'false');
        });

        // Then add active to the selected button
        const activeBtn = document.querySelector(`.energy-btn[data-energy="${level}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.setAttribute('aria-pressed', 'true');
        }

        // Apply filter (CSS-based visibility only)
        applyEnergyFilter();
    }

    /**
     * Apply the current energy level to the body element.
     * This triggers CSS rules that show/hide tasks based on clarity.
     */
    function applyEnergyFilter() {
        document.body.dataset.energyLevel = currentEnergy;
        // Update task counts after CSS has been applied
        requestAnimationFrame(updateTaskCounts);
    }

    /**
     * Update task counts in domain headers to show visible/total.
     */
    function updateTaskCounts() {
        const projectGroups = document.querySelectorAll('.project-group');

        projectGroups.forEach(group => {
            const taskList = group.querySelector('.task-list');
            const countEl = group.querySelector('.task-count');
            if (!taskList || !countEl) return;

            const total = parseInt(countEl.dataset.total, 10) || 0;

            // Count visible tasks (not hidden by CSS and not scheduled)
            const tasks = taskList.querySelectorAll('.task-item:not(.scheduled)');
            let visible = 0;
            tasks.forEach(task => {
                const style = window.getComputedStyle(task);
                if (style.display !== 'none') {
                    visible++;
                }
            });

            // Update display: show "visible/total" if different, otherwise just total
            if (visible < total) {
                countEl.textContent = `${visible}/${total}`;
                countEl.classList.add('filtered');
            } else {
                countEl.textContent = total;
                countEl.classList.remove('filtered');
            }
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
