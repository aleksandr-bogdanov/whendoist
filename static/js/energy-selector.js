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
     * Attaches click handlers to energy pills in header and applies initial state.
     */
    function init() {
        const headerEnergy = document.getElementById('header-energy');
        if (!headerEnergy) return;

        const pills = headerEnergy.querySelectorAll('.energy-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                const level = parseInt(pill.dataset.energy, 10);
                if (level >= 1 && level <= 3) {
                    setEnergy(level);
                }
            });
        });

        // Apply initial state
        applyEnergyFilter();
    }

    /**
     * Set the current energy level and update UI.
     * @param {number} level - Energy level (1-3)
     */
    function setEnergy(level) {
        currentEnergy = level;

        // Update pill states - remove active from all first
        document.querySelectorAll('.energy-pill').forEach(pill => {
            pill.classList.remove('active');
            pill.setAttribute('aria-pressed', 'false');
        });

        // Then add active to the selected pill
        const activePill = document.querySelector(`.energy-pill[data-energy="${level}"]`);
        if (activePill) {
            activePill.classList.add('active');
            activePill.setAttribute('aria-pressed', 'true');
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
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
