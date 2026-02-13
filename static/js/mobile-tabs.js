/**
 * Mobile Tabs Controller
 * Manages the Tasks/Schedule tab switcher on mobile devices.
 *
 * Features:
 * - Tab switching between task list and calendar views
 * - State persistence
 * - Swipe navigation between tabs
 */

class MobileTabs {
    constructor() {
        this.container = null;
        this.tasksPanel = null;
        this.calendarPanel = null;
        this.activeTab = 'tasks';
        this.initialized = false;
        this._calendarScrolled = false;
        this.init();
    }

    init() {
        // Get DOM elements (always, not just on mobile)
        this.container = document.querySelector('.mobile-tabs');
        this.tasksPanel = document.querySelector('.tasks-panel');
        this.calendarPanel = document.querySelector('.calendar-panel');

        if (!this.container || !this.tasksPanel || !this.calendarPanel) {
            return;
        }

        // Always attach click handlers (they're no-op on desktop since tabs are hidden)
        this.container.querySelectorAll('.mobile-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const view = tab.dataset.view;
                this.switchTo(view);
            });
        });

        // Embedded FAB — triggers same add-task dialog as the standalone FAB
        const fabBtn = this.container.querySelector('.mobile-tab-add');
        if (fabBtn) {
            fabBtn.addEventListener('click', () => {
                if (window.TaskDialog && typeof window.TaskDialog.open === 'function') {
                    window.TaskDialog.open();
                }
            });
        }

        // Handle viewport changes - always listen
        window.matchMedia('(max-width: 900px)').addEventListener('change', (e) => {
            if (e.matches) {
                // Switched to mobile - activate current tab
                this.switchTo(this.activeTab);
            } else {
                // Desktop: show both panels
                this.tasksPanel?.classList.remove('mobile-active');
                this.calendarPanel?.classList.remove('mobile-active');
            }
        });

        // Initialize mobile state if currently on mobile
        if (window.matchMedia('(max-width: 900px)').matches) {
            this.switchTo(this.activeTab);
        }

        this.initialized = true;
    }

    switchTo(view) {
        // Save scroll position of outgoing panel
        if (this.activeTab === 'tasks') {
            var scrollEl = this.tasksPanel;
            if (scrollEl) this._tasksScrollTop = scrollEl.scrollTop;
        } else if (this.activeTab === 'schedule') {
            var scrollEl = this.calendarPanel?.querySelector('.calendar-carousel');
            if (scrollEl) this._calendarScrollTop = scrollEl.scrollTop;
        }

        this.activeTab = view;

        // Update tab states
        this.container?.querySelectorAll('.mobile-tab').forEach(tab => {
            const isActive = tab.dataset.view === view;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        // Update panel visibility
        if (view === 'tasks') {
            this.tasksPanel?.classList.add('mobile-active');
            this.calendarPanel?.classList.remove('mobile-active');
        } else {
            this.tasksPanel?.classList.remove('mobile-active');
            this.calendarPanel?.classList.add('mobile-active');
        }

        // Restore scroll position of incoming panel (or scroll to now on first calendar view)
        var self = this;
        requestAnimationFrame(() => {
            if (view === 'tasks') {
                var scrollEl = self.tasksPanel;
                if (scrollEl) scrollEl.scrollTop = self._tasksScrollTop || 0;
            } else if (view === 'schedule') {
                if (!self._calendarScrolled && window.scrollCalendarToNow) {
                    window.scrollCalendarToNow();
                    self._calendarScrolled = true;
                } else {
                    var scrollEl = self.calendarPanel?.querySelector('.calendar-carousel');
                    if (scrollEl) scrollEl.scrollTop = self._calendarScrollTop || 0;
                }
            }
        });

        // Haptic feedback
        if (window.HapticEngine) {
            window.HapticEngine.trigger('light');
        }
    }

    getActiveTab() {
        return this.activeTab;
    }
}

// Initialize
let mobileTabs = null;

function initMobileTabs() {
    if (mobileTabs) return mobileTabs;
    mobileTabs = new MobileTabs();
    return mobileTabs;
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileTabs);
} else {
    initMobileTabs();
}

// Export
window.MobileTabs = MobileTabs;
window.getMobileTabs = () => mobileTabs;
