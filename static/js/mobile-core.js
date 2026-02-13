/**
 * Mobile Core Utilities
 * Core mobile functionality: viewport height, pull-to-refresh, gesture onboarding.
 */

// =============================================================================
// Dynamic Viewport Height
// =============================================================================
// Mobile browsers have dynamic address bars that change the viewport height.
// This creates a CSS custom property that reflects the actual viewport height.

function updateViewportHeight() {
    // Get the actual viewport height
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
}

// Update on load
updateViewportHeight();

// Update on resize (debounced)
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(updateViewportHeight, 100);
});

// Update on orientation change
window.addEventListener('orientationchange', () => {
    // Delay to let browser settle
    setTimeout(updateViewportHeight, 100);
});

// =============================================================================
// Keyboard Detection
// =============================================================================
// Detect virtual keyboard on mobile to adjust UI

function setupKeyboardDetection() {
    if (!window.DeviceCapabilities?.prefersTouch) return;

    let initialHeight = window.innerHeight;

    window.addEventListener('resize', () => {
        const currentHeight = window.innerHeight;
        const heightDiff = initialHeight - currentHeight;

        // If height decreased significantly, keyboard is likely open
        if (heightDiff > 150) {
            document.body.classList.add('keyboard-open');
        } else {
            document.body.classList.remove('keyboard-open');
        }
    });

    // Also detect focus on inputs
    document.addEventListener('focusin', (e) => {
        if (e.target.matches('input, textarea, select')) {
            document.body.classList.add('has-input-focus');
        }
    });

    document.addEventListener('focusout', () => {
        document.body.classList.remove('has-input-focus');
    });
}

// =============================================================================
// Pull to Refresh
// =============================================================================

class PullToRefresh {
    constructor(options = {}) {
        this.threshold = options.threshold || 80;
        this.maxPull = options.maxPull || 120;
        this.onRefresh = options.onRefresh || null;
        this.container = options.container || document.querySelector('.tasks-panel');

        this.indicator = null;
        this.startY = 0;
        this.currentY = 0;
        this.isPulling = false;
        this.isRefreshing = false;
        this._rafId = null;

        this.init();
    }

    init() {
        // Only enable on touch devices
        if (!window.DeviceCapabilities?.prefersTouch) return;

        // Create indicator element
        this.createIndicator();

        // Attach touch handlers
        this.attachHandlers();
    }

    createIndicator() {
        this.indicator = document.createElement('div');
        this.indicator.className = 'pull-to-refresh';
        this.indicator.innerHTML = `
            <div class="ptr-spinner"></div>
            <span class="ptr-text">Pull to refresh</span>
        `;
        document.body.appendChild(this.indicator);
    }

    attachHandlers() {
        if (!this.container) return;

        this.container.addEventListener('touchstart', (e) => {
            // Only activate if at top of scroll container
            if (this.container.scrollTop > 5 || this.isRefreshing) return;

            this.startY = e.touches[0].clientY;
            this.isPulling = true;
        }, { passive: true });

        // Non-passive so we can preventDefault when pulling
        this.container.addEventListener('touchmove', (e) => {
            if (!this.isPulling || this.isRefreshing) return;

            this.currentY = e.touches[0].clientY;
            const deltaY = this.currentY - this.startY;

            // Only pull down — abandon if user scrolls up
            if (deltaY < 0) {
                this.isPulling = false;
                this.hide();
                return;
            }

            // Abandon if container scrolled away from top
            if (this.container.scrollTop > 0) {
                this.isPulling = false;
                this.hide();
                return;
            }

            // Prevent native overscroll while we handle the gesture
            e.preventDefault();

            // Rubber-band dampening for natural feel
            const progress = Math.min(deltaY / this.threshold, 1);
            const pullAmount = this.maxPull * (1 - Math.exp(-deltaY / this.maxPull));

            // Batch DOM updates in rAF
            if (this._rafId) cancelAnimationFrame(this._rafId);
            this._rafId = requestAnimationFrame(() => {
                this.indicator.classList.add('visible', 'dragging');
                this.indicator.style.transform = `translateX(-50%) translateY(${12 + pullAmount * 0.3}px)`;

                // Update text based on progress
                const text = this.indicator.querySelector('.ptr-text');
                text.textContent = progress >= 1 ? 'Release to refresh' : 'Pull to refresh';

                // Rotate spinner based on progress
                const spinner = this.indicator.querySelector('.ptr-spinner');
                spinner.style.transform = `rotate(${progress * 180}deg)`;
            });
        }, { passive: false });

        this.container.addEventListener('touchend', async () => {
            if (!this.isPulling) return;
            this.isPulling = false;

            const deltaY = this.currentY - this.startY;

            if (deltaY >= this.threshold) {
                // Trigger refresh
                await this.refresh();
            } else {
                // Hide indicator
                this.hide();
            }
        }, { passive: true });

        this.container.addEventListener('touchcancel', () => {
            this.isPulling = false;
            this.hide();
        }, { passive: true });
    }

    async refresh() {
        this.isRefreshing = true;
        this.indicator.classList.remove('dragging');
        this.indicator.classList.add('refreshing');
        this.indicator.querySelector('.ptr-text').textContent = 'Refreshing...';
        this.indicator.style.transform = 'translateX(-50%) translateY(12px)';

        // Haptic feedback
        if (window.HapticEngine) {
            window.HapticEngine.trigger('medium');
        }

        const refreshStart = Date.now();

        try {
            if (this.onRefresh) {
                await this.onRefresh();
            } else {
                // Default: trigger HTMX refresh and wait for completion
                const taskList = document.querySelector('[hx-get*="/dashboard"]');
                if (taskList && window.htmx) {
                    window.htmx.trigger(taskList, 'refresh');

                    // Wait for HTMX to settle, with a 5s safety timeout
                    await Promise.race([
                        new Promise(resolve => {
                            taskList.addEventListener('htmx:afterSettle', resolve, { once: true });
                        }),
                        new Promise(resolve => setTimeout(resolve, 5000)),
                    ]);
                } else {
                    // Fallback: reload page
                    window.location.reload();
                    return; // page will reload, no need to hide
                }
            }

            // Ensure spinner shows for at least 400ms
            const elapsed = Date.now() - refreshStart;
            if (elapsed < 400) {
                await new Promise(resolve => setTimeout(resolve, 400 - elapsed));
            }
        } finally {
            this.hide();
            this.isRefreshing = false;
        }
    }

    hide() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this.indicator.classList.remove('dragging');
        this.indicator.classList.remove('visible', 'refreshing');
        this.indicator.style.transform = '';
    }
}

// =============================================================================
// Gesture Onboarding
// =============================================================================

class GestureOnboarding {
    constructor() {
        this.storageKey = 'whendoist_gesture_onboarding_shown';
        this.shown = localStorage.getItem(this.storageKey) === 'true';
    }

    showIfNeeded() {
        // Only show on touch devices that haven't seen it
        if (this.shown || !window.DeviceCapabilities?.prefersTouch) return;

        // Wait for tasks to render
        setTimeout(() => {
            const firstTask = document.querySelector('.task-item');
            if (!firstTask) return;

            this.show(firstTask);
        }, 1000);
    }

    show(taskElement) {
        const coachmark = document.createElement('div');
        coachmark.className = 'gesture-coachmark';
        coachmark.innerHTML = `
            <div class="coachmark-content">
                <div class="coachmark-gesture">
                    <span class="gesture-icon">✓</span>
                    <span class="gesture-label">Swipe right to complete</span>
                    <span class="gesture-arrow right">→</span>
                </div>
                <div class="coachmark-gesture">
                    <span class="gesture-arrow left">←</span>
                    <span class="gesture-label">Swipe left to delete</span>
                    <span class="gesture-icon" style="filter: grayscale(1);">🗑️</span>
                </div>
                <div class="coachmark-hint">Long press for more options</div>
                <button class="coachmark-dismiss">Got it</button>
            </div>
        `;

        // Position below first task
        const rect = taskElement.getBoundingClientRect();
        coachmark.style.top = `${rect.bottom + 12}px`;

        document.body.appendChild(coachmark);

        // Mark as shown
        localStorage.setItem(this.storageKey, 'true');
        this.shown = true;

        // Dismiss handlers
        coachmark.querySelector('.coachmark-dismiss').addEventListener('click', () => {
            this.dismiss(coachmark);
        });

        // Auto-dismiss after 8 seconds
        setTimeout(() => {
            this.dismiss(coachmark);
        }, 8000);

        // Haptic feedback
        if (window.HapticEngine) {
            window.HapticEngine.trigger('light');
        }
    }

    dismiss(coachmark) {
        if (!coachmark || !document.body.contains(coachmark)) return;

        coachmark.style.opacity = '0';
        coachmark.style.transform = 'translateY(-10px)';
        setTimeout(() => coachmark.remove(), 300);
    }

    reset() {
        localStorage.removeItem(this.storageKey);
        this.shown = false;
    }
}

// =============================================================================
// App Lifecycle Management
// =============================================================================

class AppLifecycle {
    constructor() {
        this.lastActive = Date.now();
        this.refreshThreshold = 5 * 60 * 1000; // 5 minutes
        this.init();
    }

    init() {
        // Track when app becomes visible/hidden
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.onResume();
            } else {
                this.onPause();
            }
        });

        // PWA-specific: handle beforeinstallprompt
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent default to allow custom install UI
            e.preventDefault();
            window.deferredInstallPrompt = e;
        });
    }

    onPause() {
        this.lastActive = Date.now();
    }

    onResume() {
        const elapsed = Date.now() - this.lastActive;

        // If app was inactive for more than threshold, refresh data
        if (elapsed > this.refreshThreshold) {
            this.refreshData();
        }
    }

    async refreshData() {
        // Trigger HTMX refresh if available
        const taskList = document.querySelector('[hx-get*="/dashboard"]');
        if (taskList && window.htmx) {
            window.htmx.trigger(taskList, 'refresh');
        }
    }
}

// =============================================================================
// Network Status
// =============================================================================

class NetworkStatus {
    constructor() {
        this.isOnline = navigator.onLine;
        this.init();
    }

    init() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            document.body.classList.remove('offline');
            // Toast is handled by error-handler.js to avoid duplicates

            // Clear API cache in service worker
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_API_CACHE' });
            }

            // Screen reader announcement
            var announcer = document.getElementById('a11y-announcer');
            if (announcer) announcer.textContent = 'Back online. Your connection has been restored.';
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            document.body.classList.add('offline');
            // Toast is handled by error-handler.js to avoid duplicates

            // Screen reader announcement
            var announcer = document.getElementById('a11y-announcer');
            if (announcer) announcer.textContent = 'You are offline. Changes will not be saved.';
        });

        // Set initial state
        document.body.classList.toggle('offline', !this.isOnline);
    }
}

// =============================================================================
// Initialize All Mobile Features
// =============================================================================

function initMobileCore() {
    // Setup keyboard detection
    setupKeyboardDetection();

    // Pull to refresh
    const pullToRefresh = new PullToRefresh();

    // Gesture onboarding
    const gestureOnboarding = new GestureOnboarding();
    gestureOnboarding.showIfNeeded();

    // App lifecycle
    const appLifecycle = new AppLifecycle();

    // Network status
    const networkStatus = new NetworkStatus();

    // Export instances
    window.PullToRefresh = pullToRefresh;
    window.GestureOnboarding = gestureOnboarding;
    window.AppLifecycle = appLifecycle;
    window.NetworkStatus = networkStatus;
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileCore);
} else {
    initMobileCore();
}

// Export classes
window.PullToRefreshClass = PullToRefresh;
window.GestureOnboardingClass = GestureOnboarding;
window.AppLifecycleClass = AppLifecycle;
window.NetworkStatusClass = NetworkStatus;
