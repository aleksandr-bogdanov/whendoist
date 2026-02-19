/**
 * Haptic Feedback Engine
 * Provides consistent haptic feedback across mobile platforms.
 *
 * Uses the Vibration API with fallbacks and respects user preferences.
 */

const HapticEngine = {
    // Check if haptics are available
    get isSupported() {
        return 'vibrate' in navigator;
    },

    // Check if user hasn't disabled haptics
    get isEnabled() {
        // Respect reduced motion preference as a proxy for haptic preference
        if (window.DeviceCapabilities?.prefersReducedMotion) {
            return false;
        }
        // Check localStorage for user preference
        const pref = localStorage.getItem('haptics_enabled');
        return pref !== 'false'; // Default to enabled
    },

    // Haptic patterns (in milliseconds)
    patterns: {
        // Light feedback - selection, toggle
        light: [10],

        // Medium feedback - button press, action confirmation
        medium: [20],

        // Heavy feedback - important action completed
        heavy: [40],

        // Success - task completed, positive action
        success: [10, 50, 30],

        // Warning - destructive action about to happen
        warning: [30, 30, 30],

        // Error - action failed
        error: [50, 50, 50, 50],

        // Long press recognition
        longPress: [15],

        // Double pulse - selection confirmation
        double: [15, 50, 15],

        // Drag start
        dragStart: [10],

        // Drop - item placed
        drop: [20, 30, 40]
    },

    /**
     * Trigger haptic feedback with a named pattern
     * @param {string} pattern - Pattern name from this.patterns
     */
    trigger(pattern) {
        if (!this.isSupported || !this.isEnabled) {
            return false;
        }

        const vibrationPattern = this.patterns[pattern];
        if (!vibrationPattern) {
            console.warn(`HapticEngine: Unknown pattern "${pattern}"`);
            return false;
        }

        try {
            navigator.vibrate(vibrationPattern);
            return true;
        } catch (err) {
            // Vibration can fail on some devices
            console.warn('HapticEngine: Vibration failed', err);
            return false;
        }
    },

    /**
     * Custom vibration pattern
     * @param {number|number[]} pattern - Duration(s) in ms
     */
    custom(pattern) {
        if (!this.isSupported || !this.isEnabled) {
            return false;
        }

        try {
            navigator.vibrate(pattern);
            return true;
        } catch (err) {
            return false;
        }
    },

    /**
     * Stop any ongoing vibration
     */
    stop() {
        if (this.isSupported) {
            navigator.vibrate(0);
        }
    },

    /**
     * Enable/disable haptics
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        localStorage.setItem('haptics_enabled', enabled ? 'true' : 'false');
    }
};

// Auto-attach haptics to elements with data-haptic attribute
function initAutoHaptics() {
    document.addEventListener('click', (e) => {
        const hapticEl = e.target.closest('[data-haptic]');
        if (hapticEl) {
            const pattern = hapticEl.dataset.haptic || 'light';
            HapticEngine.trigger(pattern);
        }
    }, { passive: true });

    // Touch start for immediate feedback
    document.addEventListener('touchstart', (e) => {
        const hapticEl = e.target.closest('[data-haptic-touch]');
        if (hapticEl) {
            const pattern = hapticEl.dataset.hapticTouch || 'light';
            HapticEngine.trigger(pattern);
        }
    }, { passive: true });
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoHaptics);
} else {
    initAutoHaptics();
}

// Export for use in other modules
window.HapticEngine = HapticEngine;
