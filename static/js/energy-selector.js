/**
 * Energy Selector Module
 *
 * Controls task visibility based on user's current energy level.
 * Uses CSS-based filtering via body[data-energy-level] attribute.
 *
 * Energy Levels:
 *   1 (Zombie):     Only autopilot tasks visible
 *   2 (Normal):     autopilot and normal visible (brainstorm hidden)
 *   3 (Deep Focus): All tasks visible
 *
 * CSS filtering (in dashboard.css):
 *   body[data-energy-level="1"] .task-item[data-clarity="normal"] { display: none }
 *   body[data-energy-level="1"] .task-item[data-clarity="brainstorm"] { display: none }
 *   body[data-energy-level="2"] .task-item[data-clarity="brainstorm"] { display: none }
 *
 * Uses panel header energy selector (.header-energy) with compact pill buttons.
 *
 * Note: Not persisted - resets to Normal (level 2) on page load.
 *
 * @module EnergySelector
 */
(function() {
    'use strict';

    // Default energy level: Normal (shows autopilot + normal)
    const DEFAULT_ENERGY = 2;
    let currentEnergy = DEFAULT_ENERGY;

    /**
     * Initialize energy selector.
     * Attaches click handlers to energy pills in panel header.
     */
    function init() {
        // Attach handlers to panel header energy selector
        const headerEnergy = document.getElementById('header-energy');
        if (headerEnergy) {
            attachPillHandlers(headerEnergy, '.energy-pill');
        }

        // Apply initial state
        applyEnergyFilter();
        updateClarityDots(currentEnergy);
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
     * Update clarity indicator dots based on energy level.
     * @param {number} level - Energy level (1-3)
     */
    function updateClarityDots(level) {
        const dots = document.getElementById('clarity-dots');
        if (!dots) return;
        const [blue, purple, magenta] = dots.children;
        blue.classList.remove('off');
        purple.classList.toggle('off', level < 2);
        magenta.classList.toggle('off', level < 3);
    }

    /**
     * Set the current energy level and update UI.
     * @param {number} level - Energy level (1-3)
     */
    function setEnergy(level) {
        currentEnergy = level;

        // Update energy pill states in panel header
        const headerEnergy = document.getElementById('header-energy');
        if (headerEnergy) {
            headerEnergy.querySelectorAll('.energy-pill').forEach(pill => {
                const pillLevel = parseInt(pill.dataset.energy, 10);
                const isActive = pillLevel === level;
                pill.classList.toggle('active', isActive);
                pill.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });
        }

        // Update clarity indicator dots
        updateClarityDots(level);

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
