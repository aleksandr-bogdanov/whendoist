/**
 * Energy Selector Module
 *
 * Controls task visibility based on user's current energy level.
 * Uses CSS-based filtering via body[data-energy-level] attribute.
 *
 * Energy Levels:
 *   1 (Zombie):     Only @executable tasks visible
 *   2 (Normal):     @executable and @defined visible
 *   3 (Deep Focus): All tasks with clarity labels visible
 *
 * CSS filtering (in dashboard.css):
 *   body[data-energy-level="1"] .task-item[data-clarity="defined"] { display: none }
 *   body[data-energy-level="2"] .task-item[data-clarity="exploratory"] { display: none }
 *
 * Supports both header energy selector and inline task list energy selector.
 * Both selectors stay in sync.
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
     * Attaches click handlers to energy pills in task list header.
     */
    function init() {
        // Attach handlers to inline energy selector (in task list header)
        const inlineEnergy = document.getElementById('header-energy-inline');
        if (inlineEnergy) {
            attachPillHandlers(inlineEnergy, '.energy-pill-inline');
        }

        // Apply initial state
        applyEnergyFilter();
    }

    /**
     * Attach click handlers to energy pills within a container.
     * @param {HTMLElement} container - Container element
     * @param {string} selector - CSS selector for pills
     */
    function attachPillHandlers(container, selector) {
        const pills = container.querySelectorAll(selector);
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                const level = parseInt(pill.dataset.energy, 10);
                if (level >= 1 && level <= 3) {
                    setEnergy(level);
                }
            });
        });
    }

    /**
     * Set the current energy level and update UI.
     * @param {number} level - Energy level (1-3)
     */
    function setEnergy(level) {
        currentEnergy = level;

        // Update energy pill states
        document.querySelectorAll('.energy-pill-inline').forEach(pill => {
            const pillLevel = parseInt(pill.dataset.energy, 10);
            const isActive = pillLevel === level;
            pill.classList.toggle('active', isActive);
            pill.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        // Apply filter (CSS-based visibility only)
        applyEnergyFilter();
    }

    /**
     * Apply the current energy level to the body element.
     * This triggers CSS rules that show/hide tasks based on clarity.
     */
    function applyEnergyFilter() {
        document.body.dataset.energyLevel = currentEnergy;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
