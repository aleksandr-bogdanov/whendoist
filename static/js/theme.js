/**
 * Theme Management
 * Handles light/dark mode with system preference support
 */

const Theme = (function() {
    const STORAGE_KEY = 'whendoist-theme';
    const THEMES = ['light', 'dark', 'system'];

    /**
     * Get the user's stored theme preference
     * @returns {string|null} 'light', 'dark', 'system', or null if not set
     */
    function getStoredPreference() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return THEMES.includes(stored) ? stored : null;
        } catch (e) {
            // localStorage may not be available (private mode, etc.)
            return null;
        }
    }

    /**
     * Get the system's preferred color scheme
     * @returns {string} 'light' or 'dark'
     */
    function getSystemPreference() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    /**
     * Get the effective theme (resolved from preference)
     * @param {string} preference - 'light', 'dark', or 'system'
     * @returns {string} 'light' or 'dark'
     */
    function resolveTheme(preference) {
        if (preference === 'system' || !preference) {
            return getSystemPreference();
        }
        return preference;
    }

    /**
     * Apply theme to the document
     * @param {string} theme - 'light' or 'dark'
     */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);

        // Update meta theme-color for mobile browsers
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            // Purple brand color for light, dark surface for dark
            metaThemeColor.content = theme === 'dark' ? '#1E293B' : '#6D5EF6';
        }

        // Dispatch event for components that need to react (e.g., ApexCharts)
        window.dispatchEvent(new CustomEvent('themechange', {
            detail: { theme }
        }));
    }

    /**
     * Set the theme preference
     * @param {string} preference - 'light', 'dark', or 'system'
     */
    function setPreference(preference) {
        if (!THEMES.includes(preference)) {
            console.warn('Invalid theme preference:', preference);
            return;
        }

        try {
            localStorage.setItem(STORAGE_KEY, preference);
        } catch (e) {
            // localStorage may not be available
        }

        const effectiveTheme = resolveTheme(preference);
        applyTheme(effectiveTheme);
    }

    /**
     * Toggle between light and dark (ignores system)
     */
    function toggle() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        setPreference(next);
    }

    /**
     * Get current preference
     * @returns {string} 'light', 'dark', or 'system'
     */
    function getPreference() {
        return getStoredPreference() || 'system';
    }

    /**
     * Get current effective theme
     * @returns {string} 'light' or 'dark'
     */
    function getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    }

    /**
     * Initialize theme on page load
     * Should be called as early as possible (in <head>)
     */
    function init() {
        const preference = getStoredPreference() || 'system';
        const effectiveTheme = resolveTheme(preference);
        applyTheme(effectiveTheme);

        // Listen for system preference changes
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', (e) => {
                // Only update if user prefers system theme
                const currentPref = getStoredPreference();
                if (currentPref === 'system' || !currentPref) {
                    applyTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
    }

    // Public API
    return {
        init,
        setPreference,
        getPreference,
        getCurrentTheme,
        toggle,
        THEMES
    };
})();

// Auto-initialize if script is in <head>
// This prevents flash of wrong theme
if (document.readyState === 'loading') {
    Theme.init();
} else {
    // DOM already loaded, init immediately
    Theme.init();
}
