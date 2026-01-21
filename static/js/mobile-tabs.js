/**
 * Mobile Tabs Controller
 * Manages the Tasks/Schedule tab switcher on mobile devices.
 *
 * Features:
 * - Tab switching between task list and calendar views
 * - Badge updates for unscheduled task count
 * - State persistence
 * - Swipe navigation between tabs
 */

class MobileTabs {
    constructor() {
        this.container = null;
        this.tasksPanel = null;
        this.calendarPanel = null;
        this.activeTab = 'tasks';
        this.init();
    }

    init() {
        // Only initialize on mobile
        if (!window.matchMedia('(max-width: 900px)').matches) {
            return;
        }

        this.container = document.querySelector('.mobile-tabs');
        this.tasksPanel = document.querySelector('.tasks-panel');
        this.calendarPanel = document.querySelector('.calendar-panel');

        if (!this.container || !this.tasksPanel || !this.calendarPanel) {
            return;
        }

        // Set initial state
        this.switchTo(this.activeTab);

        // Tab click handlers
        this.container.querySelectorAll('.mobile-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const view = tab.dataset.view;
                this.switchTo(view);
            });
        });

        // Update badge on task changes
        this.updateBadge();
        document.body.addEventListener('htmx:afterSwap', () => {
            this.updateBadge();
        });

        // Handle viewport changes
        window.matchMedia('(max-width: 900px)').addEventListener('change', (e) => {
            if (e.matches) {
                this.switchTo(this.activeTab);
            } else {
                // Desktop: show both panels
                this.tasksPanel?.classList.remove('mobile-active');
                this.calendarPanel?.classList.remove('mobile-active');
            }
        });
    }

    switchTo(view) {
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

        // Haptic feedback
        if (window.HapticEngine) {
            window.HapticEngine.trigger('light');
        }
    }

    updateBadge() {
        const badge = this.container?.querySelector('.tab-badge');
        if (!badge) return;

        // Count unscheduled tasks
        const unscheduledCount = document.querySelectorAll('.task-item:not(.scheduled):not(.completed-today):not(.completed-older)').length;
        badge.textContent = unscheduledCount.toString();
        badge.hidden = unscheduledCount === 0;
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
