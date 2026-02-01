/**
 * Device Detection Utility
 * Proper detection of device capabilities for touch/mouse interactions.
 *
 * CRITICAL: Never use `'ontouchstart' in window` alone - it's unreliable for:
 * - iPad with keyboard (has both touch AND mouse)
 * - Surface devices (hybrid)
 * - Chrome DevTools emulation
 *
 * Instead, detect interaction PREFERENCE, not just capability.
 */

const DeviceCapabilities = {
    // Primary input method detection using CSS media queries
    // This detects what the user PREFERS, not just what's available
    get prefersTouch() {
        return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    },

    // Raw capability detection (for fallback scenarios)
    get hasTouch() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    },

    // Mouse/trackpad capability
    get hasMouse() {
        return window.matchMedia('(hover: hover)').matches;
    },

    // Hybrid device detection (both touch and mouse) - e.g., Surface, iPad with keyboard
    get isHybrid() {
        return this.hasTouch && this.hasMouse;
    },

    // Mobile viewport (not just touch capability)
    get isMobileViewport() {
        return window.matchMedia('(max-width: 900px)').matches;
    },

    // Small phone viewport
    get isPhoneViewport() {
        return window.matchMedia('(max-width: 580px)').matches;
    },

    // iOS detection (for platform-specific behaviors)
    get isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    },

    // Android detection
    get isAndroid() {
        return /Android/.test(navigator.userAgent);
    },

    // PWA detection (running in standalone mode)
    get isPWA() {
        return window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true;
    },

    // Reduced motion preference
    get prefersReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    // Foldable device detection
    get isFoldable() {
        // Check for viewport segments (foldable devices)
        if (typeof CSS !== 'undefined' && CSS.supports) {
            return CSS.supports('(horizontal-viewport-segments: 2)') ||
                CSS.supports('(vertical-viewport-segments: 2)');
        }
        return false;
    },

    // Listen for capability changes (e.g., connecting mouse to tablet)
    onChange(callback) {
        const mediaQueries = [
            window.matchMedia('(hover: none)'),
            window.matchMedia('(max-width: 900px)'),
            window.matchMedia('(prefers-reduced-motion: reduce)')
        ];

        mediaQueries.forEach(mq => {
            mq.addEventListener('change', () => callback(this));
        });
    },

    // Get a summary of current capabilities
    getCapabilities() {
        return {
            prefersTouch: this.prefersTouch,
            hasTouch: this.hasTouch,
            hasMouse: this.hasMouse,
            isHybrid: this.isHybrid,
            isMobileViewport: this.isMobileViewport,
            isPhoneViewport: this.isPhoneViewport,
            isIOS: this.isIOS,
            isAndroid: this.isAndroid,
            isPWA: this.isPWA,
            prefersReducedMotion: this.prefersReducedMotion,
            isFoldable: this.isFoldable
        };
    }
};

// Apply CSS class to body based on device type
function applyDeviceClasses() {
    const body = document.body;

    body.classList.toggle('touch-device', DeviceCapabilities.prefersTouch);
    body.classList.toggle('mouse-device', !DeviceCapabilities.prefersTouch);
    body.classList.toggle('hybrid-device', DeviceCapabilities.isHybrid);
    body.classList.toggle('mobile-viewport', DeviceCapabilities.isMobileViewport);
    body.classList.toggle('phone-viewport', DeviceCapabilities.isPhoneViewport);
    body.classList.toggle('pwa-mode', DeviceCapabilities.isPWA);
    body.classList.toggle('ios-device', DeviceCapabilities.isIOS);
    body.classList.toggle('android-device', DeviceCapabilities.isAndroid);
    body.classList.toggle('reduced-motion', DeviceCapabilities.prefersReducedMotion);
}

// Apply on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyDeviceClasses);
} else {
    applyDeviceClasses();
}

// Re-apply on capability changes
DeviceCapabilities.onChange(applyDeviceClasses);

// Export for use in other modules
window.DeviceCapabilities = DeviceCapabilities;
