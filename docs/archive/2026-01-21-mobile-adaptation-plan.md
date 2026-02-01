# Whendoist Mobile Adaptation Plan

> Comprehensive plan for adapting Whendoist to deliver a native-quality mobile experience.

**Version:** 3.0
**Created:** 2026-01-21
**Updated:** 2026-01-21
**Status:** Planning

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Assessment](#current-state-assessment)
3. [Mobile Design Philosophy](#mobile-design-philosophy)
4. [Page-by-Page Adaptation](#page-by-page-adaptation)
5. [Core Component Patterns](#core-component-patterns)
6. [Gesture System](#gesture-system)
7. [Technical Infrastructure](#technical-infrastructure)
8. [Accessibility Requirements](#accessibility-requirements)
9. [Platform-Specific Behaviors](#platform-specific-behaviors)
10. [Security Considerations](#security-considerations)
11. [Progressive Enhancement](#progressive-enhancement)
12. [Push Notifications](#push-notifications)
13. [Platform Extensions](#platform-extensions)
14. [Real-Time Updates](#real-time-updates)
15. [Network Resilience](#network-resilience)
16. [Implementation Phases](#implementation-phases)
17. [Empty States & Error States](#empty-states--error-states)
18. [Mobile Analytics](#mobile-analytics)
19. [Testing Strategy](#testing-strategy)
20. [Success Metrics](#success-metrics)
21. [Appendix](#appendix)

---

## Executive Summary

### What We Have

Whendoist has **solid foundational mobile responsiveness**:
- Mobile-first CSS architecture with breakpoints at 580px, 600px, 768px, 900px
- PWA manifest with icons, shortcuts, and standalone display mode
- Touch event handling (swipe, drag-drop) in wizard and calendar
- Safe area support for notched devices (iPhone, Android gesture nav)
- Virtual keyboard detection that hides navigation

### What's Missing

| Gap | Impact | Priority |
|-----|--------|----------|
| **Service Worker** | No offline support, no caching | Critical |
| **Push Notifications** | No task reminders, due date alerts | Critical |
| **Progressive Enhancement** | App broken without JS | Critical |
| **Deep Linking** | Can't share task URLs | Critical |
| **Bottom Sheet Modals** | Centered modals awkward on phones | High |
| **Touch-Optimized Calendar** | 40px hour slots too small for drag | High |
| **Gesture Conflict Resolution** | Swipe vs scroll ambiguity | High |
| **Offline Conflict Resolution** | No strategy for sync conflicts | High |
| **Cache Versioning** | App update breaks offline cache | High |
| **Network Quality Detection** | No adaptive behavior for slow connections | High |
| **Real-Time Updates** | No live sync between devices | High |
| **Encryption + Offline** | Key loss = data inaccessible | High |
| **Gesture Navigation** | Only wizard has swipe; no app-wide gestures | Medium |
| **Mobile Task Actions** | Edit/complete require precise taps | Medium |
| **App Lifecycle Management** | No handling for background/resume | Medium |
| **iOS Input Zoom Prevention** | Font-size < 16px triggers zoom | Medium |
| **Share Target** | Can't share TO Whendoist from other apps | Medium |
| **Widgets** | No home screen presence | Medium |
| **Foldable Devices** | Samsung Fold, Pixel Fold unsupported | Medium |
| **Empty/Error States** | No mobile-specific error handling | Medium |
| **Accessibility Alternatives** | Gestures inaccessible to some users | Medium |
| **Landscape Tablet Mode** | No optimization for landscape orientation | Medium |
| **Haptic Feedback** | Touch interactions lack physical feedback | Low |
| **Pull-to-Refresh** | No native refresh pattern | Low |
| **Gesture Onboarding** | Users won't discover swipe actions | Low |

### Guiding Principle

**"Mobile-first doesn't mean mobile-compromise."**

The goal is not to shrink the desktop app but to reimagine interactions for touch, small screens, and on-the-go usage. Tasks page is the critical path—most mobile users will primarily schedule tasks.

---

## Current State Assessment

### Breakpoint Architecture

| Breakpoint | Target | Current Behavior |
|------------|--------|------------------|
| `< 580px` | Small phones | Abbreviated labels, narrower columns |
| `< 768px` | Large phones | Touch-friendly 44px targets, FAB enlargement |
| `< 900px` | Tablets/phones | Stacked layout (tasks above calendar), hamburger nav |
| `900px+` | Desktop | Side-by-side layout, full navigation |

### Page-Level Responsiveness

| Page | Mobile Ready | Key Gaps |
|------|--------------|----------|
| **Tasks** | 70% | Calendar drag fiddly, no swipe-to-complete |
| **Thoughts** | 90% | Simple list, works well |
| **Analytics** | 80% | Charts stack nicely, some cramped at 600px |
| **Settings** | 85% | Expandable sections work, action buttons always visible |
| **Wizard** | 95% | Reference implementation—excellent touch patterns |

### PWA Status

```
✅ Manifest configured (display: standalone)
✅ Icons for all sizes (maskable + any)
✅ Theme color set (#6D5EF6)
✅ Apple-specific meta tags
✅ Safe area handling
❌ Service worker (offline not supported)
❌ Background sync
❌ Push notifications
```

---

## Mobile Design Philosophy

### 1. Thumb-Zone Ergonomics

On mobile, the bottom 40% of the screen is the "thumb zone" (easy to reach). Primary actions should live here.

```
┌─────────────────────────┐
│                         │  ← Hard to reach
│      Reading Zone       │  ← Content displays here
│                         │
├─────────────────────────┤
│    Natural Touch Zone   │  ← Easy to reach
│  ┌─────────────────────┐│
│  │   Primary Actions   ││  ← FAB, bottom nav, sheets
│  └─────────────────────┘│
└─────────────────────────┘
```

**Implication:** Task actions (edit, complete, delete) should be accessible via bottom sheet, not top-right buttons.

### 2. Gesture Vocabulary

| Gesture | Action | Example |
|---------|--------|---------|
| **Tap** | Select/Open | Open task detail |
| **Long Press** | Context menu | Task actions sheet |
| **Swipe Left** | Delete/Archive | Delete task (with undo) |
| **Swipe Right** | Complete | Mark task complete |
| **Pull Down** | Refresh | Reload tasks |
| **Drag** | Reorder/Schedule | Drag task to calendar |

### 3. Progressive Disclosure

Don't show everything at once. Use:
- **Collapsed defaults** with expand on tap
- **Bottom sheets** for task details (not modals)
- **Inline expansion** for task editing

### 4. Offline-First Mindset

Mobile users switch contexts constantly. The app should:
- Cache task data for instant display
- Queue changes when offline
- Sync when connection returns
- Show clear offline indicators

---

## Page-by-Page Adaptation

### 4.1 Tasks Page (Critical Path)

The Tasks page is where mobile users spend 80%+ of their time. It requires the most significant rework.

#### Current Layout (Mobile)

```
┌─────────────────────────┐
│ Header (40px)           │
├─────────────────────────┤
│                         │
│   Task List (3fr)       │
│   - Domain groups       │
│   - Scrollable          │
│                         │
├─────────────────────────┤
│   Calendar (2fr)        │
│   - Hour grid           │
│   - Stacked below       │
│                         │
└─────────────────────────┘
```

#### Problems

1. **Calendar is secondary but always visible** — Takes 40% of screen even when user is browsing tasks
2. **Drag-to-calendar is fiddly** — 40px hour slots are too small for precise placement
3. **No quick-complete gesture** — Must tap into task, then tap Complete button
4. **No quick-reschedule** — Must drag to calendar (hard on small screens)

#### Proposed: Tab-Based Layout

Replace stacked layout with tabs for cleaner separation:

```
┌─────────────────────────┐
│ Header (40px)           │
├─────────────────────────┤
│ [ Tasks ] [ Schedule ]  │  ← Segmented control
├─────────────────────────┤
│                         │
│   Full-height panel     │
│   (selected view)       │
│                         │
│                         │
│                         │
├─────────────────────────┤
│ [+] Add Task (FAB)      │
└─────────────────────────┘
```

**Benefits:**
- Full screen for each view
- Clear mental model (list vs. schedule)
- "Plan My Day" becomes tab switch + time selection

#### Implementation Details

**A. Segmented Tab Control**

```html
<div class="mobile-tabs">
    <button class="mobile-tab active" data-view="tasks">
        <span class="tab-icon">📋</span>
        <span class="tab-label">Tasks</span>
        <span class="tab-badge">12</span>  <!-- Unscheduled count -->
    </button>
    <button class="mobile-tab" data-view="schedule">
        <span class="tab-icon">📅</span>
        <span class="tab-label">Schedule</span>
    </button>
</div>
```

```css
.mobile-tabs {
    display: none;  /* Hidden on desktop */
    position: sticky;
    top: 40px;  /* Below header */
    z-index: 20;
    background: var(--bg-panel);
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-subtle);
}

@media (max-width: 900px) {
    .mobile-tabs {
        display: flex;
        gap: 8px;
    }

    .tasks-layout {
        display: block;  /* Single column */
    }

    .tasks-panel,
    .calendar-panel {
        display: none;  /* Hidden by default */
    }

    .tasks-panel.active,
    .calendar-panel.active {
        display: flex;
        height: calc(100vh - 40px - 52px - env(safe-area-inset-bottom));
    }
}

.mobile-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 36px;
    border-radius: 8px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    transition: all 0.15s ease;
}

.mobile-tab.active {
    background: var(--bg-surface);
    border-color: var(--border-default);
    color: var(--text-primary);
}

.tab-badge {
    background: var(--primary);
    color: white;
    font-size: 0.6rem;
    padding: 2px 6px;
    border-radius: 10px;
}
```

**B. Swipe-to-Complete/Delete**

Add swipe actions to task rows using the gesture system (see [Section 6: Gesture System](#gesture-system)):

```javascript
// In a new file: static/js/task-swipe.js
class TaskSwipeHandler {
    constructor() {
        this.gestureHandler = new SwipeGestureHandler({
            threshold: 100,
            maxSwipe: 120,
            velocityThreshold: 0.5
        });
        this.init();
    }

    init() {
        // Use proper detection - see Section 6.1
        if (!DeviceCapabilities.prefersTouch && !DeviceCapabilities.hasTouch) return;

        // Attach to existing and dynamically added tasks
        this.attachToAll();

        // Re-attach after HTMX swaps
        document.body.addEventListener('htmx:afterSwap', () => {
            this.attachToAll();
        });
    }

    attachToAll() {
        document.querySelectorAll('.task-item:not([data-swipe-attached])').forEach(task => {
            this.attachSwipe(task);
            task.dataset.swipeAttached = 'true';
        });
    }

    attachSwipe(task) {
        let deltaX = 0;

        task.addEventListener('touchstart', (e) => {
            if (!this.gestureHandler.onTouchStart(e, task)) return;
            task.style.transition = 'none';
        }, { passive: true });

        task.addEventListener('touchmove', (e) => {
            const result = this.gestureHandler.onTouchMove(e);

            if (result.action === 'swipe') {
                deltaX = result.deltaX;
                task.style.transform = `translateX(${deltaX}px)`;

                // Show action indicators based on progress
                task.classList.toggle('swipe-complete', deltaX > 50);
                task.classList.toggle('swipe-delete', deltaX < -50);
            }
        }, { passive: false }); // Need to preventDefault for horizontal swipe

        task.addEventListener('touchend', async () => {
            const result = this.gestureHandler.onTouchEnd(deltaX);
            task.style.transition = 'transform 0.2s ease';

            if (result.action === 'swipe-right') {
                await this.completeTask(task);
            } else if (result.action === 'swipe-left') {
                await this.deleteTask(task);
            }

            // Reset
            task.style.transform = '';
            task.classList.remove('swipe-complete', 'swipe-delete');
            deltaX = 0;
        }, { passive: true });
    }

    async completeTask(task) {
        const taskId = task.dataset.taskId;

        // Haptic feedback
        HapticEngine.trigger('success');

        // Optimistic UI update
        task.classList.add('completing');

        try {
            await fetch(`/api/tasks/${taskId}/complete`, { method: 'POST' });
            // Let HTMX handle the UI update
        } catch (err) {
            // Queue for offline sync if network fails
            if (!navigator.onLine) {
                OfflineQueue.add({
                    url: `/api/tasks/${taskId}/complete`,
                    method: 'POST',
                    type: 'complete',
                    taskId
                });
                Toast.show('Saved offline — will sync when online', 'info');
            } else {
                task.classList.remove('completing');
                Toast.show('Failed to complete task', 'error');
            }
        }
    }

    async deleteTask(task) {
        const taskId = task.dataset.taskId;
        const taskTitle = task.querySelector('.task-text')?.textContent;

        // Haptic feedback - double pulse for destructive action
        HapticEngine.trigger('warning');

        // Optimistic UI with undo
        task.classList.add('deleting');
        task.style.height = task.offsetHeight + 'px';

        // Animate out
        requestAnimationFrame(() => {
            task.style.height = '0';
            task.style.opacity = '0';
            task.style.marginBottom = '0';
        });

        // Show undo toast
        const undoToast = Toast.show(`Deleted "${taskTitle}"`, 'info', {
            duration: 5000,
            action: {
                label: 'Undo',
                callback: () => this.undoDelete(task, taskId)
            }
        });

        // Actually delete after toast expires (or immediately if no undo)
        setTimeout(async () => {
            if (task.classList.contains('deleting')) {
                try {
                    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
                    task.remove();
                } catch (err) {
                    if (!navigator.onLine) {
                        OfflineQueue.add({
                            url: `/api/tasks/${taskId}`,
                            method: 'DELETE',
                            type: 'delete',
                            taskId
                        });
                    }
                }
            }
        }, 5000);
    }

    undoDelete(task, taskId) {
        task.classList.remove('deleting');
        task.style.height = '';
        task.style.opacity = '';
        task.style.marginBottom = '';
    }
}
```

CSS for swipe indicators:

```css
.task-item {
    position: relative;
}

.task-item::before,
.task-item::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    width: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s ease;
}

/* Complete indicator (swipe right) */
.task-item::before {
    left: -80px;
    background: linear-gradient(90deg, var(--primary-tint), transparent);
}

.task-item.swipe-complete::before {
    opacity: 1;
    content: "✓";
    color: var(--primary);
    font-size: 1.5rem;
}

/* Delete indicator (swipe left) */
.task-item::after {
    right: -80px;
    background: linear-gradient(-90deg, rgba(220, 38, 38, 0.1), transparent);
}

.task-item.swipe-delete::after {
    opacity: 1;
    content: "🗑";
    font-size: 1.25rem;
}
```

**C. Long-Press Task Actions Sheet**

Replace context menu with bottom sheet:

```javascript
// In task-sheet.js (or new mobile-sheet.js)
class TaskActionsSheet {
    constructor() {
        this.sheet = null;
        this.currentTask = null;
        this.init();
    }

    init() {
        // Create sheet element
        this.sheet = document.createElement('div');
        this.sheet.className = 'action-sheet';
        this.sheet.innerHTML = `
            <div class="action-sheet-backdrop"></div>
            <div class="action-sheet-content">
                <div class="action-sheet-header">
                    <span class="sheet-task-title"></span>
                </div>
                <div class="action-sheet-actions">
                    <button class="sheet-action" data-action="edit">
                        <span class="action-icon">✏️</span>
                        <span class="action-label">Edit</span>
                    </button>
                    <button class="sheet-action" data-action="complete">
                        <span class="action-icon">✓</span>
                        <span class="action-label">Complete</span>
                    </button>
                    <button class="sheet-action" data-action="schedule">
                        <span class="action-icon">📅</span>
                        <span class="action-label">Schedule</span>
                    </button>
                    <button class="sheet-action sheet-action--danger" data-action="delete">
                        <span class="action-icon">🗑</span>
                        <span class="action-label">Delete</span>
                    </button>
                </div>
                <button class="sheet-cancel">Cancel</button>
            </div>
        `;
        document.body.appendChild(this.sheet);

        // Event listeners
        this.sheet.querySelector('.action-sheet-backdrop').addEventListener('click', () => this.close());
        this.sheet.querySelector('.sheet-cancel').addEventListener('click', () => this.close());
        this.sheet.querySelectorAll('.sheet-action').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleAction(e.currentTarget.dataset.action));
        });
    }

    open(taskElement) {
        this.currentTask = taskElement;
        const title = taskElement.querySelector('.task-text').textContent;
        this.sheet.querySelector('.sheet-task-title').textContent = title;

        // Haptic
        if ('vibrate' in navigator) navigator.vibrate(10);

        this.sheet.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    close() {
        this.sheet.classList.remove('open');
        document.body.style.overflow = '';
        this.currentTask = null;
    }

    handleAction(action) {
        if (!this.currentTask) return;

        switch (action) {
            case 'edit':
                TaskDialog.open(this.currentTask.dataset.taskId);
                break;
            case 'complete':
                // Complete API
                break;
            case 'schedule':
                // Switch to schedule tab, highlight task for drag
                break;
            case 'delete':
                // Delete API with confirmation
                break;
        }

        this.close();
    }
}
```

```css
.action-sheet {
    position: fixed;
    inset: 0;
    z-index: 1100;
    display: flex;
    align-items: flex-end;
    visibility: hidden;
    opacity: 0;
    transition: visibility 0s 0.3s, opacity 0.3s ease;
}

.action-sheet.open {
    visibility: visible;
    opacity: 1;
    transition: visibility 0s, opacity 0.3s ease;
}

.action-sheet-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(2px);
}

.action-sheet-content {
    position: relative;
    width: 100%;
    background: var(--bg-surface);
    border-radius: 16px 16px 0 0;
    padding: 12px 16px;
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
    transform: translateY(100%);
    transition: transform 0.3s ease;
}

.action-sheet.open .action-sheet-content {
    transform: translateY(0);
}

.action-sheet-header {
    text-align: center;
    padding: 8px 0 16px;
    border-bottom: 1px solid var(--border-subtle);
    margin-bottom: 8px;
}

.sheet-task-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
}

.action-sheet-actions {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 16px;
}

.sheet-action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 16px 8px;
    background: var(--bg-panel);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.sheet-action:active {
    background: var(--interactive-pressed);
    transform: scale(0.95);
}

.action-icon {
    font-size: 1.5rem;
}

.action-label {
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--text-secondary);
}

.sheet-action--danger .action-label {
    color: var(--danger);
}

.sheet-cancel {
    width: 100%;
    height: 48px;
    background: var(--bg-panel);
    border: 1px solid var(--border-default);
    border-radius: 12px;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    cursor: pointer;
}
```

**D. Calendar Touch Improvements**

The 40px mobile hour slots are too cramped. Improve with:

1. **Quarter-hour snapping indicators**
2. **Enlarged drop zones while dragging**
3. **Tap-to-schedule mode**

```css
/* Expand hour slots while dragging */
body.is-dragging .hour-row {
    min-height: 60px;  /* Expand from 40px */
    transition: min-height 0.2s ease;
}

/* Visual quarter-hour guides */
.hour-slot {
    background: repeating-linear-gradient(
        to bottom,
        transparent 0px,
        transparent 9px,
        var(--border-subtle) 9px,
        var(--border-subtle) 10px
    );
}

/* Drop zone enlargement indicator */
.hour-slot.drag-hover-zone {
    background: var(--drop-bg);
    min-height: 80px;  /* Generous target */
}
```

**E. Tap-to-Schedule Flow (Mobile)**

Detailed UX for scheduling via tap instead of drag:

```
┌─────────────────────────────────────────┐
│  [Tap-to-Schedule Flow]                 │
│                                         │
│  1. User taps task row                  │
│     └─→ Task highlights, toolbar shows  │
│                                         │
│  2. User taps "Schedule" in toolbar     │
│     └─→ Switch to Schedule tab          │
│     └─→ Banner: "Tap a time to schedule"│
│                                         │
│  3. Calendar shows expanded time slots  │
│     ┌─────────────────────────────────┐ │
│     │ ░░░░░░░ 9:00 AM ░░░░░░░░░░░░░░░│ │
│     │ ─ ─ ─ ─ 9:15 ─ ─ ─ ─ ─ ─ ─ ─ ─│ │
│     │ ─ ─ ─ ─ 9:30 ─ ─ ─ ─ ─ ─ ─ ─ ─│ │
│     │ ─ ─ ─ ─ 9:45 ─ ─ ─ ─ ─ ─ ─ ─ ─│ │
│     │ ░░░░░░░ 10:00 AM ░░░░░░░░░░░░░░│ │
│     └─────────────────────────────────┘ │
│                                         │
│  4. User taps time slot (e.g., 9:30)    │
│     └─→ Bottom sheet opens:             │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │  Schedule "Review proposal"         ││
│  │                                     ││
│  │  📅 Today at 9:30 AM               ││
│  │                                     ││
│  │  Duration: [15m] [30m•] [1h] [2h]  ││
│  │                                     ││
│  │  ┌─────────────────────────────┐   ││
│  │  │       Schedule Task         │   ││
│  │  └─────────────────────────────┘   ││
│  │                                     ││
│  │  [Cancel]                          ││
│  └─────────────────────────────────────┘│
│                                         │
│  5. User confirms                       │
│     └─→ Task appears on calendar        │
│     └─→ Toast: "Scheduled for 9:30 AM" │
│     └─→ Return to Tasks tab            │
└─────────────────────────────────────────┘
```

**Implementation:**

```javascript
// In plan-tasks.js - add tap-to-schedule mode
class TapToSchedule {
    constructor() {
        this.selectedTask = null;
        this.active = false;
    }

    selectTask(taskElement) {
        // Deselect previous
        document.querySelector('.task-item.scheduling')?.classList.remove('scheduling');

        this.selectedTask = taskElement;
        taskElement.classList.add('scheduling');

        // Show schedule action
        this.showTaskToolbar(taskElement);
    }

    showTaskToolbar(taskElement) {
        const toolbar = document.createElement('div');
        toolbar.className = 'task-scheduling-toolbar';
        toolbar.innerHTML = `
            <button class="toolbar-btn" data-action="schedule">
                <span>📅</span> Schedule
            </button>
            <button class="toolbar-btn" data-action="cancel">
                Cancel
            </button>
        `;

        taskElement.appendChild(toolbar);

        toolbar.querySelector('[data-action="schedule"]').addEventListener('click', () => {
            this.enterScheduleMode();
        });

        toolbar.querySelector('[data-action="cancel"]').addEventListener('click', () => {
            this.cancel();
        });
    }

    enterScheduleMode() {
        this.active = true;
        document.body.classList.add('tap-to-schedule-mode');

        // Switch to schedule tab
        const scheduleTab = document.querySelector('.mobile-tab[data-view="schedule"]');
        scheduleTab?.click();

        // Show instruction banner
        this.showBanner('Tap a time slot to schedule');

        // Make time slots tappable
        document.querySelectorAll('.hour-slot').forEach(slot => {
            slot.classList.add('schedulable');
            slot.addEventListener('click', (e) => this.onSlotTap(e), { once: true });
        });
    }

    onSlotTap(e) {
        const slot = e.currentTarget;
        const time = slot.dataset.time;

        // Show confirmation sheet
        this.showScheduleSheet(time);
    }

    showScheduleSheet(time) {
        const taskTitle = this.selectedTask.querySelector('.task-text').textContent;
        const taskDuration = this.selectedTask.dataset.duration || 30;

        const sheet = new BottomSheet({
            content: `
                <div class="schedule-confirm">
                    <h3>Schedule "${taskTitle}"</h3>
                    <p class="schedule-time">📅 Today at ${this.formatTime(time)}</p>

                    <div class="duration-picker">
                        <span class="picker-label">Duration:</span>
                        <div class="duration-options">
                            <button class="duration-btn ${taskDuration == 15 ? 'active' : ''}" data-duration="15">15m</button>
                            <button class="duration-btn ${taskDuration == 30 ? 'active' : ''}" data-duration="30">30m</button>
                            <button class="duration-btn ${taskDuration == 60 ? 'active' : ''}" data-duration="60">1h</button>
                            <button class="duration-btn ${taskDuration == 120 ? 'active' : ''}" data-duration="120">2h</button>
                        </div>
                    </div>

                    <button class="btn-primary schedule-confirm-btn">Schedule Task</button>
                    <button class="btn-secondary" data-action="cancel">Cancel</button>
                </div>
            `,
            onClose: () => this.cancel()
        });

        sheet.element.querySelector('.schedule-confirm-btn').addEventListener('click', async () => {
            const duration = sheet.element.querySelector('.duration-btn.active').dataset.duration;
            await this.scheduleTask(time, parseInt(duration));
            sheet.close();
        });

        // Duration button selection
        sheet.element.querySelectorAll('.duration-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                sheet.element.querySelector('.duration-btn.active')?.classList.remove('active');
                btn.classList.add('active');
            });
        });
    }

    async scheduleTask(time, duration) {
        const taskId = this.selectedTask.dataset.taskId;

        try {
            await fetch(`/api/tasks/${taskId}/schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ time, duration })
            });

            HapticEngine.trigger('success');
            Toast.show(`Scheduled for ${this.formatTime(time)}`, 'success');

            // Return to tasks tab
            document.querySelector('.mobile-tab[data-view="tasks"]')?.click();
        } catch (err) {
            Toast.show('Failed to schedule', 'error');
        }

        this.cancel();
    }

    cancel() {
        this.active = false;
        this.selectedTask?.classList.remove('scheduling');
        this.selectedTask?.querySelector('.task-scheduling-toolbar')?.remove();
        this.selectedTask = null;
        document.body.classList.remove('tap-to-schedule-mode');
        this.removeBanner();

        document.querySelectorAll('.hour-slot.schedulable').forEach(slot => {
            slot.classList.remove('schedulable');
        });
    }

    formatTime(time) {
        // Convert 24h to 12h format
        const [hours, minutes] = time.split(':');
        const h = parseInt(hours);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${minutes} ${ampm}`;
    }

    showBanner(message) {
        const banner = document.createElement('div');
        banner.className = 'schedule-mode-banner';
        banner.textContent = message;
        document.querySelector('.calendar-panel')?.prepend(banner);
    }

    removeBanner() {
        document.querySelector('.schedule-mode-banner')?.remove();
    }
}
```

```css
/* Tap-to-schedule mode styles */
body.tap-to-schedule-mode .hour-slot.schedulable {
    cursor: pointer;
    position: relative;
}

body.tap-to-schedule-mode .hour-slot.schedulable::after {
    content: "Tap to schedule";
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.65rem;
    color: var(--text-muted);
    opacity: 0;
    transition: opacity 0.15s;
}

body.tap-to-schedule-mode .hour-slot.schedulable:hover::after,
body.tap-to-schedule-mode .hour-slot.schedulable:focus::after {
    opacity: 1;
}

/* Expanded time slots in schedule mode */
body.tap-to-schedule-mode .hour-slot {
    min-height: 60px;
}

/* Show 15-min divisions */
body.tap-to-schedule-mode .hour-slot {
    display: grid;
    grid-template-rows: repeat(4, 1fr);
}

body.tap-to-schedule-mode .quarter-slot {
    border-top: 1px dashed var(--border-subtle);
    padding: 4px 8px;
    font-size: 0.6rem;
    color: var(--text-muted);
}

.schedule-mode-banner {
    background: var(--primary-tint);
    color: var(--primary);
    padding: 8px 16px;
    text-align: center;
    font-size: 0.75rem;
    font-weight: 600;
    border-bottom: 1px solid var(--primary);
}

.task-scheduling-toolbar {
    display: flex;
    gap: 8px;
    padding: 8px;
    background: var(--bg-elevated);
    border-top: 1px solid var(--border-subtle);
    margin-top: 8px;
}

.schedule-confirm {
    text-align: center;
}

.schedule-time {
    font-size: 1rem;
    color: var(--text-primary);
    margin: 12px 0;
}

.duration-picker {
    margin: 16px 0;
}

.duration-options {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: 8px;
}

.duration-btn {
    padding: 8px 16px;
    border: 1px solid var(--border-default);
    border-radius: 8px;
    background: var(--bg-surface);
    font-size: 0.875rem;
}

.duration-btn.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
}
```

### 4.2 Thoughts Page

The Thoughts page is already simple and works well on mobile. Minor improvements:

| Enhancement | Description |
|------------|-------------|
| **Pull-to-refresh** | Natural mobile pattern |
| **Swipe-to-delete** | Same pattern as tasks |
| **Inline promote** | Swipe right to promote to task |

### 4.3 Analytics Page

Charts need careful handling on small screens.

#### Current Issues
- Charts cramped at 600px
- Heatmap unreadable on phones
- Stats row wastes horizontal space

#### Solutions

**A. Horizontal Scroll for Heatmap**

```css
.heatmap-container {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 8px;  /* Scrollbar space */
}

.heatmap-grid {
    min-width: 600px;  /* Don't compress */
}
```

**B. Collapsible Chart Sections**

```html
<details class="analytics-section" open>
    <summary class="section-header">
        <span>Daily Completions</span>
        <span class="chevron">▼</span>
    </summary>
    <div class="section-content">
        <!-- Chart here -->
    </div>
</details>
```

**C. Stats as Horizontal Scroll**

```css
@media (max-width: 600px) {
    .stats-row {
        display: flex;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        gap: 12px;
        padding: 0 16px;
        margin: 0 -16px;
    }

    .stat-card {
        flex: 0 0 auto;
        width: 140px;
        scroll-snap-align: start;
    }
}
```

### 4.4 Settings Page

Settings already works reasonably well. Improvements:

| Enhancement | Description |
|------------|-------------|
| **Search** | Quick filter for settings (as page grows) |
| **Haptic toggles** | Feedback when toggling switches |
| **Contextual actions** | Floating "Save" when changes pending |

---

## Core Component Patterns

### 5.1 Bottom Sheet Modal

Replace centered modals with bottom sheets on mobile.

**Trigger conditions:**
- Screen width < 600px
- OR device prefers touch (proper detection)

**Implementation:** Create a wrapper that switches between modal styles:

```javascript
// modal-adaptive.js
class AdaptiveModal {
    static open(content, options = {}) {
        // Use proper touch detection (see Section 6.1)
        const isMobile = window.matchMedia('(max-width: 600px)').matches
            || DeviceCapabilities.prefersTouch;

        if (isMobile && !options.forceCenter) {
            return BottomSheet.open(content, options);
        } else {
            return CenteredModal.open(content, options);
        }
    }
}
```

> **Note:** Never use `'ontouchstart' in window` for this check. See [Section 6.1: Touch Detection](#61-touch-detection-critical) for proper approach.

### 5.2 Unified Touch Feedback

Create consistent touch feedback across all interactive elements:

```css
/* Base touch feedback */
[data-touch-feedback] {
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.1s ease, background 0.15s ease;
}

[data-touch-feedback]:active {
    transform: scale(0.97);
    background: var(--interactive-pressed);
}
```

```javascript
// Haptic via JS with fallback
document.querySelectorAll('[data-haptic]').forEach(el => {
    el.addEventListener('click', () => {
        const pattern = el.dataset.haptic || 'light';
        HapticEngine.trigger(pattern);
    });
});
```

---

## Gesture System

### 6.1 Touch Detection (CRITICAL)

**Never use `'ontouchstart' in window`** — it's unreliable for:
- iPad with keyboard (has both touch AND mouse)
- Surface devices (hybrid)
- Chrome DevTools emulation

**Correct approach:** Detect interaction preference, not capability:

```css
/* Target devices that PREFER touch */
@media (hover: none) and (pointer: coarse) {
    /* Mobile touch styles */
}

/* Target devices with precise pointer (mouse/trackpad) */
@media (hover: hover) and (pointer: fine) {
    /* Desktop hover styles */
}
```

```javascript
// In a new file: static/js/device-detection.js
const DeviceCapabilities = {
    // Primary input method detection
    prefersTouch: window.matchMedia('(hover: none) and (pointer: coarse)').matches,
    hasTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    hasMouse: window.matchMedia('(hover: hover)').matches,

    // Hybrid device detection (both touch and mouse)
    isHybrid() {
        return this.hasTouch && this.hasMouse;
    },

    // Responsive to changes (e.g., connecting mouse to tablet)
    onChange(callback) {
        const mq = window.matchMedia('(hover: none)');
        mq.addEventListener('change', () => {
            this.prefersTouch = mq.matches;
            callback(this);
        });
    }
};
```

### 6.2 Gesture-Scroll Conflict Resolution

Swipe gestures conflict with horizontal scrolling (charts, stats, heatmaps).

**Disambiguation Strategy:**

| Signal | Interpretation |
|--------|----------------|
| Touch starts in `[data-no-swipe]` element | Disable swipe, allow scroll |
| Touch starts in `.overflow-x-auto` container | Disable swipe, allow scroll |
| Vertical movement > horizontal in first 50ms | Vertical scroll, cancel swipe |
| Horizontal movement > 10px while inside scrollable | Scroll, not swipe |

**Implementation:**

```javascript
class SwipeGestureHandler {
    constructor(options = {}) {
        this.threshold = options.threshold || 100;
        this.velocityThreshold = options.velocityThreshold || 0.5;
        this.maxSwipe = options.maxSwipe || 120;
        this.swipeDisabled = false;
        this.isVerticalScroll = false;
    }

    onTouchStart(e, element) {
        // Check for swipe-blocking containers
        const noSwipeParent = e.target.closest('[data-no-swipe], .overflow-x-auto, .heatmap-container, .stats-row');
        if (noSwipeParent) {
            this.swipeDisabled = true;
            return false;
        }

        // Check for interactive elements
        if (e.target.closest('button, input, select, a, [role="button"]')) {
            this.swipeDisabled = true;
            return false;
        }

        this.swipeDisabled = false;
        this.isVerticalScroll = false;
        this.startX = e.touches[0].clientX;
        this.startY = e.touches[0].clientY;
        this.startTime = Date.now();

        return true;
    }

    onTouchMove(e) {
        if (this.swipeDisabled) return { action: 'none' };

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = currentX - this.startX;
        const deltaY = currentY - this.startY;

        // First 50ms: determine gesture direction
        if (Date.now() - this.startTime < 50) {
            if (Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
                this.isVerticalScroll = true;
            }
        }

        if (this.isVerticalScroll) {
            return { action: 'scroll' };
        }

        // Horizontal swipe detected
        if (Math.abs(deltaX) > 10) {
            e.preventDefault(); // Prevent scroll
        }

        const clampedDelta = Math.max(-this.maxSwipe, Math.min(this.maxSwipe, deltaX));
        return {
            action: 'swipe',
            deltaX: clampedDelta,
            progress: Math.abs(clampedDelta) / this.threshold
        };
    }

    onTouchEnd(deltaX) {
        if (this.swipeDisabled || this.isVerticalScroll) {
            return { action: 'none' };
        }

        const deltaTime = Date.now() - this.startTime;
        const velocity = Math.abs(deltaX) / deltaTime;
        const triggered = Math.abs(deltaX) > this.threshold || velocity > this.velocityThreshold;

        if (triggered) {
            return {
                action: deltaX > 0 ? 'swipe-right' : 'swipe-left',
                velocity
            };
        }

        return { action: 'cancel' };
    }
}
```

### 6.3 Long-Press Timing

Different platforms have different long-press expectations:

| Platform | Default Long-Press | Our Target |
|----------|-------------------|------------|
| iOS | ~500ms | 400ms |
| Android | ~400ms | 400ms |
| Web default | None | 400ms |

```javascript
const LONG_PRESS_DURATION = 400; // ms

class LongPressHandler {
    attach(element, callback) {
        let timer = null;
        let triggered = false;

        element.addEventListener('touchstart', (e) => {
            triggered = false;
            timer = setTimeout(() => {
                triggered = true;
                callback(e);
                // Haptic feedback
                if ('vibrate' in navigator) navigator.vibrate(10);
            }, LONG_PRESS_DURATION);
        }, { passive: true });

        element.addEventListener('touchmove', () => {
            clearTimeout(timer);
        }, { passive: true });

        element.addEventListener('touchend', (e) => {
            clearTimeout(timer);
            if (triggered) {
                e.preventDefault(); // Prevent click after long-press
            }
        });

        // Prevent context menu on long-press
        element.addEventListener('contextmenu', (e) => {
            if (DeviceCapabilities.prefersTouch) {
                e.preventDefault();
            }
        });
    }
}
```

### 6.4 Gesture Onboarding (Coachmarks)

New mobile users won't discover swipe gestures. Show coachmarks on first visit:

```javascript
// In static/js/gesture-onboarding.js
class GestureOnboarding {
    constructor() {
        this.shown = localStorage.getItem('gestureOnboardingShown') === 'true';
    }

    showIfNeeded() {
        if (this.shown || !DeviceCapabilities.prefersTouch) return;

        // Wait for first task to render
        const firstTask = document.querySelector('.task-item');
        if (!firstTask) return;

        this.showCoachmark(firstTask);
        localStorage.setItem('gestureOnboardingShown', 'true');
        this.shown = true;
    }

    showCoachmark(taskElement) {
        const coachmark = document.createElement('div');
        coachmark.className = 'gesture-coachmark';
        coachmark.innerHTML = `
            <div class="coachmark-content">
                <div class="coachmark-gesture">
                    <span class="gesture-arrow left">←</span>
                    <span class="gesture-label">Swipe to complete</span>
                    <span class="gesture-icon">✓</span>
                </div>
                <div class="coachmark-gesture">
                    <span class="gesture-icon">🗑</span>
                    <span class="gesture-label">Swipe to delete</span>
                    <span class="gesture-arrow right">→</span>
                </div>
                <div class="coachmark-hint">Long press for more options</div>
                <button class="coachmark-dismiss">Got it</button>
            </div>
        `;

        // Position relative to first task
        const rect = taskElement.getBoundingClientRect();
        coachmark.style.top = `${rect.bottom + 8}px`;

        document.body.appendChild(coachmark);

        coachmark.querySelector('.coachmark-dismiss').addEventListener('click', () => {
            coachmark.remove();
        });

        // Auto-dismiss after 5 seconds
        setTimeout(() => coachmark.remove(), 5000);
    }
}
```

```css
.gesture-coachmark {
    position: fixed;
    left: 16px;
    right: 16px;
    z-index: 1200;
    background: var(--bg-elevated);
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    animation: coachmark-appear 0.3s ease;
}

@keyframes coachmark-appear {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
}

.coachmark-gesture {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 8px 0;
}

.gesture-arrow {
    font-size: 1.5rem;
    color: var(--primary);
    animation: gesture-pulse 1s ease infinite;
}

.gesture-arrow.left { animation-direction: reverse; }

@keyframes gesture-pulse {
    0%, 100% { transform: translateX(0); opacity: 1; }
    50% { transform: translateX(8px); opacity: 0.5; }
}

.coachmark-hint {
    text-align: center;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 8px;
}

.coachmark-dismiss {
    width: 100%;
    margin-top: 12px;
    padding: 10px;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
}
```

### 5.3 Pull-to-Refresh

Implement native-feeling pull-to-refresh:

```javascript
class PullToRefresh {
    constructor(container, onRefresh) {
        this.container = container;
        this.onRefresh = onRefresh;
        this.threshold = 80;
        this.init();
    }

    init() {
        // Use proper touch detection (see Section 6.1)
        if (!DeviceCapabilities.hasTouch) return;

        let startY, pulling = false;
        const indicator = this.createIndicator();

        this.container.addEventListener('touchstart', (e) => {
            if (this.container.scrollTop === 0) {
                startY = e.touches[0].clientY;
            }
        }, { passive: true });

        this.container.addEventListener('touchmove', (e) => {
            if (startY === undefined) return;

            const deltaY = e.touches[0].clientY - startY;
            if (deltaY > 0 && this.container.scrollTop === 0) {
                pulling = true;
                const progress = Math.min(1, deltaY / this.threshold);
                indicator.style.transform = `translateY(${deltaY * 0.5}px)`;
                indicator.style.opacity = progress;

                if (deltaY > this.threshold) {
                    indicator.classList.add('ready');
                }
            }
        }, { passive: true });

        this.container.addEventListener('touchend', async () => {
            if (pulling && indicator.classList.contains('ready')) {
                indicator.classList.add('refreshing');
                await this.onRefresh();
            }
            // Reset
            indicator.style.transform = '';
            indicator.style.opacity = '0';
            indicator.classList.remove('ready', 'refreshing');
            startY = undefined;
            pulling = false;
        }, { passive: true });
    }

    createIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'pull-indicator';
        indicator.innerHTML = '<div class="pull-spinner"></div>';
        this.container.prepend(indicator);
        return indicator;
    }
}
```

---

## Technical Infrastructure

### 7.1 Service Worker

**Priority: HIGH** — Required for offline support and better perceived performance.

#### Caching Strategy

| Resource Type | Strategy | TTL |
|---------------|----------|-----|
| App shell (HTML) | Cache-first, network fallback | Until new deploy |
| CSS/JS | Cache-first | Version-based |
| API `/api/tasks` | Network-first, cache fallback | 5 min |
| API `/api/calendar` | Network-first | 15 min |
| Images | Cache-first | 1 week |

#### Implementation

```javascript
// static/sw.js
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `whendoist-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `whendoist-dynamic-${CACHE_VERSION}`;

const STATIC_ASSETS = [
    '/',
    '/dashboard',
    '/thoughts',
    '/static/css/tokens.css',
    '/static/css/app.css',
    '/static/css/dashboard.css',
    '/static/js/drag-drop.js',
    // ... etc
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('fetch', (e) => {
    const { request } = e;
    const url = new URL(request.url);

    // API requests: network-first
    if (url.pathname.startsWith('/api/')) {
        e.respondWith(
            fetch(request)
                .then(res => {
                    const clone = res.clone();
                    caches.open(DYNAMIC_CACHE)
                        .then(cache => cache.put(request, clone));
                    return res;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Static assets: cache-first
    e.respondWith(
        caches.match(request)
            .then(cached => cached || fetch(request))
    );
});
```

Registration in `base.html`:

```javascript
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.error('SW registration failed:', err));
    });
}
```

### 7.2 Offline Queue with Conflict Resolution

**Critical:** Offline changes can conflict with server state. We need a conflict resolution strategy.

#### Conflict Scenarios

| Scenario | Resolution Strategy |
|----------|---------------------|
| Edit offline, same task edited online | **Last-write-wins** with notification |
| Edit offline, task deleted online | Discard offline edit, notify user |
| Complete offline, task deleted online | Discard, notify user |
| Delete offline, task edited online | **Offline wins** (delete persists) |
| Complete offline, already completed online | No-op (already done) |
| Reschedule offline, rescheduled online | **Last-write-wins** with notification |

#### Implementation

```javascript
// static/js/offline-queue.js
class OfflineQueue {
    static DB_NAME = 'whendoist-offline';
    static STORE_NAME = 'pending-operations';
    static db = null;

    static async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                    store.createIndex('taskId', 'taskId', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    static async add(operation) {
        await this.init();

        const op = {
            id: crypto.randomUUID(),
            ...operation,
            timestamp: Date.now(),
            retryCount: 0,
            status: 'pending' // pending, syncing, failed, conflict
        };

        const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
        await tx.objectStore(this.STORE_NAME).add(op);

        // Update sync indicator
        this.updateSyncBadge();

        return op.id;
    }

    static async sync() {
        if (!navigator.onLine) return { synced: 0, failed: 0, conflicts: 0 };

        await this.init();
        const operations = await this.getAll();

        if (operations.length === 0) return { synced: 0, failed: 0, conflicts: 0 };

        Toast.show(`Syncing ${operations.length} changes...`, 'info', { duration: 2000 });

        let synced = 0, failed = 0, conflicts = 0;

        // Sort by timestamp (oldest first)
        operations.sort((a, b) => a.timestamp - b.timestamp);

        for (const op of operations) {
            try {
                await this.markSyncing(op.id);

                const result = await this.executeOperation(op);

                if (result.conflict) {
                    conflicts++;
                    await this.handleConflict(op, result);
                } else {
                    synced++;
                    await this.remove(op.id);
                }
            } catch (err) {
                failed++;
                await this.markFailed(op.id, err.message);

                // Retry logic: max 3 retries
                if (op.retryCount < 3) {
                    await this.incrementRetry(op.id);
                }
            }
        }

        this.updateSyncBadge();

        // Show summary
        if (conflicts > 0) {
            Toast.show(`Synced with ${conflicts} conflict(s)`, 'warning', {
                duration: 5000,
                action: { label: 'Review', callback: () => this.showConflictDialog() }
            });
        } else if (failed > 0) {
            Toast.show(`${synced} synced, ${failed} failed`, 'error');
        } else if (synced > 0) {
            Toast.show(`${synced} changes synced`, 'success');
        }

        return { synced, failed, conflicts };
    }

    static async executeOperation(op) {
        // First, check if resource still exists and get server version
        if (op.taskId) {
            const serverTask = await this.fetchServerTask(op.taskId);

            if (!serverTask) {
                // Task was deleted on server
                if (op.type === 'delete') {
                    return { success: true }; // Already deleted, no-op
                }
                return {
                    conflict: true,
                    type: 'deleted_on_server',
                    message: `Task was deleted while you were offline`
                };
            }

            // Check for edit conflicts
            if (op.type === 'edit' && serverTask.updated_at > op.timestamp) {
                return {
                    conflict: true,
                    type: 'edited_on_server',
                    serverVersion: serverTask,
                    localVersion: op.body,
                    message: `Task was modified since your offline edit`
                };
            }
        }

        // Execute the operation
        const response = await fetch(op.url, {
            method: op.method,
            headers: {
                'Content-Type': 'application/json',
                ...op.headers
            },
            body: op.body ? JSON.stringify(op.body) : undefined
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return { success: true };
    }

    static async fetchServerTask(taskId) {
        try {
            const response = await fetch(`/api/tasks/${taskId}`);
            if (response.status === 404) return null;
            return await response.json();
        } catch {
            return null;
        }
    }

    static async handleConflict(op, result) {
        // Store conflict for user review
        await this.markConflict(op.id, result);

        // For non-critical conflicts, auto-resolve with last-write-wins
        if (result.type === 'edited_on_server' && op.type === 'edit') {
            // Our offline edit is newer intention, apply it
            const resolved = await fetch(op.url, {
                method: op.method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(op.body)
            });

            if (resolved.ok) {
                await this.remove(op.id);
                return;
            }
        }

        // For delete conflicts, offline delete wins (destructive action intentional)
        if (result.type === 'edited_on_server' && op.type === 'delete') {
            await fetch(op.url, { method: 'DELETE' });
            await this.remove(op.id);
            return;
        }

        // Unresolvable: keep in queue for manual review
    }

    static updateSyncBadge() {
        this.getAll().then(ops => {
            const pending = ops.filter(o => o.status === 'pending').length;
            const badge = document.querySelector('.sync-badge');

            if (badge) {
                badge.textContent = pending;
                badge.hidden = pending === 0;
            }

            // Also update any sync indicators
            document.body.classList.toggle('has-pending-sync', pending > 0);
        });
    }

    static showConflictDialog() {
        // Open a modal showing conflicts for manual resolution
        // Implementation depends on your modal system
    }

    // IndexedDB helpers
    static async getAll() {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.STORE_NAME, 'readonly');
            const request = tx.objectStore(this.STORE_NAME).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    static async remove(id) {
        const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
        await tx.objectStore(this.STORE_NAME).delete(id);
    }

    static async markSyncing(id) {
        await this.updateStatus(id, 'syncing');
    }

    static async markFailed(id, error) {
        await this.updateStatus(id, 'failed', { error });
    }

    static async markConflict(id, conflictInfo) {
        await this.updateStatus(id, 'conflict', { conflictInfo });
    }

    static async incrementRetry(id) {
        const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
        const store = tx.objectStore(this.STORE_NAME);
        const op = await store.get(id);
        op.retryCount++;
        await store.put(op);
    }

    static async updateStatus(id, status, extra = {}) {
        const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
        const store = tx.objectStore(this.STORE_NAME);
        const op = await new Promise(r => {
            const req = store.get(id);
            req.onsuccess = () => r(req.result);
        });
        await store.put({ ...op, status, ...extra });
    }
}

// Auto-sync when online
window.addEventListener('online', () => {
    OfflineQueue.sync();
});

// Sync on page visibility (app resume)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
        OfflineQueue.sync();
    }
});
```

#### Sync Status Indicator

Show pending sync count in the header:

```html
<span class="sync-indicator">
    <svg class="sync-icon" viewBox="0 0 24 24">...</svg>
    <span class="sync-badge" hidden>0</span>
</span>
```

```css
.sync-indicator {
    position: relative;
    opacity: 0;
    transition: opacity 0.2s;
}

body.has-pending-sync .sync-indicator {
    opacity: 1;
}

body.has-pending-sync .sync-icon {
    animation: sync-pulse 2s ease infinite;
}

@keyframes sync-pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
}

.sync-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    background: var(--warning);
    color: white;
    font-size: 0.6rem;
    font-weight: 700;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
}
```

### 7.3 App Lifecycle Management

Mobile apps get backgrounded constantly. Handle these events properly:

| Event | Detection | Action |
|-------|-----------|--------|
| Screen locked | `visibilitychange` → hidden | Save form drafts, pause timers |
| App backgrounded | `visibilitychange` → hidden | Save scroll position, save state |
| App resumed (< 5min) | `visibilitychange` → visible | Restore state, soft refresh |
| App resumed (> 5min) | `visibilitychange` → visible | Full refresh, sync queue |
| Tab killed by OS | N/A (no event) | Restore from localStorage on load |
| Network change | `online`/`offline` events | Sync queue, update indicators |

```javascript
// static/js/app-lifecycle.js
class AppLifecycle {
    static STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    static lastActiveTime = Date.now();
    static savedState = {};

    static init() {
        // Track when app was last active
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.onBackground();
            } else {
                this.onResume();
            }
        });

        // Network changes
        window.addEventListener('online', () => this.onOnline());
        window.addEventListener('offline', () => this.onOffline());

        // Before unload - save critical state
        window.addEventListener('beforeunload', () => this.saveState());

        // On load - restore state
        this.restoreState();
    }

    static onBackground() {
        this.lastActiveTime = Date.now();
        this.saveState();

        // Pause any running timers (e.g., auto-refresh)
        if (window.refreshTimer) clearInterval(window.refreshTimer);
    }

    static onResume() {
        const timeSinceActive = Date.now() - this.lastActiveTime;
        const isStale = timeSinceActive > this.STALE_THRESHOLD;

        // Always sync offline queue
        if (navigator.onLine) {
            OfflineQueue.sync();
        }

        // Check session validity
        this.checkSession();

        if (isStale) {
            // Full refresh - data is likely stale
            this.refreshData();
            Toast.show('Refreshing...', 'info', { duration: 1500 });
        } else {
            // Soft refresh - just check for updates
            this.softRefresh();
        }

        // Resume auto-refresh timer
        this.startAutoRefresh();
    }

    static onOnline() {
        document.body.classList.remove('is-offline');
        OfflineQueue.sync();
        Toast.show('Back online', 'success', { duration: 2000 });
    }

    static onOffline() {
        document.body.classList.add('is-offline');
        Toast.show('You\'re offline — changes will sync when connected', 'warning', {
            duration: 3000
        });
    }

    static saveState() {
        const state = {
            scrollPositions: this.getScrollPositions(),
            formDrafts: this.getFormDrafts(),
            activeTab: document.querySelector('.mobile-tab.active')?.dataset.view,
            expandedDomains: [...document.querySelectorAll('.domain-group.expanded')]
                .map(el => el.dataset.domainId),
            timestamp: Date.now()
        };

        localStorage.setItem('whendoist_app_state', JSON.stringify(state));
    }

    static restoreState() {
        try {
            const saved = localStorage.getItem('whendoist_app_state');
            if (!saved) return;

            const state = JSON.parse(saved);

            // Only restore if state is less than 30 minutes old
            if (Date.now() - state.timestamp > 30 * 60 * 1000) {
                localStorage.removeItem('whendoist_app_state');
                return;
            }

            // Restore scroll positions
            requestAnimationFrame(() => {
                this.restoreScrollPositions(state.scrollPositions);
            });

            // Restore expanded domains
            state.expandedDomains?.forEach(id => {
                const group = document.querySelector(`.domain-group[data-domain-id="${id}"]`);
                group?.classList.add('expanded');
            });

            // Restore active tab (mobile)
            if (state.activeTab && DeviceCapabilities.prefersTouch) {
                const tab = document.querySelector(`.mobile-tab[data-view="${state.activeTab}"]`);
                tab?.click();
            }

        } catch (e) {
            console.error('Failed to restore app state:', e);
        }
    }

    static getScrollPositions() {
        const positions = {};
        document.querySelectorAll('[data-scroll-persist]').forEach(el => {
            positions[el.dataset.scrollPersist] = {
                top: el.scrollTop,
                left: el.scrollLeft
            };
        });
        return positions;
    }

    static restoreScrollPositions(positions) {
        if (!positions) return;
        Object.entries(positions).forEach(([key, pos]) => {
            const el = document.querySelector(`[data-scroll-persist="${key}"]`);
            if (el) {
                el.scrollTop = pos.top;
                el.scrollLeft = pos.left;
            }
        });
    }

    static getFormDrafts() {
        // Save any in-progress form data
        const drafts = {};
        document.querySelectorAll('input[data-draft], textarea[data-draft]').forEach(el => {
            if (el.value) {
                drafts[el.dataset.draft] = el.value;
            }
        });
        return drafts;
    }

    static async checkSession() {
        try {
            const response = await fetch('/api/auth/check', { method: 'HEAD' });
            if (response.status === 401) {
                window.location.href = '/login?reason=session_expired';
            }
        } catch {
            // Network error, will retry on next resume
        }
    }

    static async refreshData() {
        // Trigger HTMX refresh of main content
        const mainContent = document.querySelector('[hx-get]');
        if (mainContent) {
            htmx.trigger(mainContent, 'refresh');
        }
    }

    static softRefresh() {
        // Check for updates without full reload
        // Could use Server-Sent Events or polling
    }

    static startAutoRefresh() {
        // Refresh every 2 minutes when app is visible
        window.refreshTimer = setInterval(() => {
            if (document.visibilityState === 'visible' && navigator.onLine) {
                this.softRefresh();
            }
        }, 2 * 60 * 1000);
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => AppLifecycle.init());
```

#### Offline Indicator UI

```css
/* Offline state indicator */
body.is-offline::before {
    content: "You're offline";
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 28px;
    background: var(--warning);
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

body.is-offline .header {
    top: 28px; /* Shift header down */
}

body.is-offline .main-content {
    margin-top: 28px;
}
```

### 7.4 Viewport Management

Handle iOS Safari's dynamic viewport:

```css
/* Use dvh for true viewport height */
.tasks-layout {
    height: 100dvh;
    height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
}

/* Fallback for older browsers */
@supports not (height: 100dvh) {
    .tasks-layout {
        height: calc(var(--vh, 1vh) * 100);
    }
}
```

```javascript
// Set --vh custom property for iOS Safari
function setVH() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}
setVH();
window.addEventListener('resize', setVH);
```

### 7.5 iOS Input Zoom Prevention (CRITICAL)

**iOS Safari automatically zooms the viewport when focusing on inputs with `font-size < 16px`.** This is jarring and breaks layout.

**Solution:** Ensure all inputs have at least 16px font on mobile:

```css
:root {
    --input-font-size: 16px; /* iOS zoom prevention */
}

/* Can be smaller on non-iOS/devices with hover (desktop) */
@media (hover: hover) and (pointer: fine) {
    :root {
        --input-font-size: 14px;
    }
}

input,
textarea,
select {
    font-size: var(--input-font-size);
}

/* Bottom sheet inputs specifically */
.action-sheet input,
.bottom-sheet input,
.task-dialog input {
    font-size: 16px !important; /* Force 16px on all touch devices */
}
```

**Alternative:** Disable zoom entirely (not recommended, hurts accessibility):
```html
<!-- DON'T do this -->
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
```

### 7.6 Haptic Feedback Engine

Consistent haptic feedback across the app:

```javascript
// static/js/haptics.js
const HapticEngine = {
    // Check if haptics are available
    available: 'vibrate' in navigator,

    // Predefined patterns
    patterns: {
        light: [10],              // Quick tap
        medium: [20],             // Standard feedback
        heavy: [30],              // Strong feedback
        success: [10, 50, 10],    // Double tap
        warning: [20, 100, 20],   // Alert pattern
        error: [50, 100, 50, 100, 50], // Triple pulse
        selection: [5]            // Subtle selection
    },

    trigger(type = 'light') {
        if (!this.available) return;

        // Respect user preference
        if (localStorage.getItem('haptics_disabled') === 'true') return;

        const pattern = this.patterns[type] || this.patterns.light;
        navigator.vibrate(pattern);
    },

    // Disable haptics (user preference)
    disable() {
        localStorage.setItem('haptics_disabled', 'true');
    },

    enable() {
        localStorage.removeItem('haptics_disabled');
    }
};
```

### 7.7 Performance Optimizations

| Optimization | Description |
|--------------|-------------|
| **Lazy load charts** | Load ApexCharts only on Analytics page |
| **Pagination over virtual scroll** | "Load More" button for task lists > 50 items (simpler than virtual scroll with HTMX) |
| **Image optimization** | WebP with fallbacks, lazy loading |
| **Critical CSS** | Inline above-fold styles |
| **Preconnect** | Google Fonts, API domain |

> **Note on Virtual Scrolling:** Originally proposed virtual scrolling for 100+ tasks, but this conflicts with HTMX's partial DOM updates and variable-height rows (tasks with descriptions). Pagination with "Load More" is simpler and works with existing architecture.

---

## Accessibility Requirements

Gestures must have accessible alternatives. Mobile accessibility is not optional.

### 8.1 Gesture Alternatives

| Gesture | Primary Use | Accessible Alternative |
|---------|-------------|------------------------|
| Swipe right | Complete task | Double-tap opens action sheet → "Complete" |
| Swipe left | Delete task | Double-tap opens action sheet → "Delete" |
| Long-press | Open action sheet | Also: VoiceOver "Actions" rotor |
| Drag to calendar | Schedule task | Tap-to-schedule mode (Section 4.1.E) |
| Pull-to-refresh | Reload data | "Refresh" button in header (always visible) |

### 8.2 Screen Reader Support

```javascript
// Announce dynamic changes
function announceToScreenReader(message, priority = 'polite') {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', priority);
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;

    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 1000);
}

// Usage
announceToScreenReader('Task completed');
announceToScreenReader('3 tasks scheduled', 'assertive');
```

```css
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}
```

### 8.3 VoiceOver Custom Actions

For iOS VoiceOver users, add custom actions to task rows:

```javascript
// Add to task-item elements
taskElement.setAttribute('role', 'listitem');
taskElement.setAttribute('aria-label', `${taskTitle}, ${taskStatus}`);

// Custom actions via aria
const actions = document.createElement('div');
actions.setAttribute('role', 'group');
actions.setAttribute('aria-label', 'Task actions');
actions.innerHTML = `
    <button class="sr-only" aria-label="Complete task">Complete</button>
    <button class="sr-only" aria-label="Edit task">Edit</button>
    <button class="sr-only" aria-label="Delete task">Delete</button>
    <button class="sr-only" aria-label="Schedule task">Schedule</button>
`;
taskElement.appendChild(actions);
```

### 8.4 Focus Trapping in Bottom Sheets

When a bottom sheet opens, focus must be trapped inside:

```javascript
class FocusTrap {
    constructor(container) {
        this.container = container;
        this.focusableElements = container.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        this.firstElement = this.focusableElements[0];
        this.lastElement = this.focusableElements[this.focusableElements.length - 1];
        this.previouslyFocused = document.activeElement;
    }

    activate() {
        this.container.addEventListener('keydown', this.handleKeyDown.bind(this));
        this.firstElement?.focus();
    }

    deactivate() {
        this.container.removeEventListener('keydown', this.handleKeyDown.bind(this));
        this.previouslyFocused?.focus();
    }

    handleKeyDown(e) {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) {
            if (document.activeElement === this.firstElement) {
                e.preventDefault();
                this.lastElement.focus();
            }
        } else {
            if (document.activeElement === this.lastElement) {
                e.preventDefault();
                this.firstElement.focus();
            }
        }
    }
}

// In BottomSheet class
open() {
    // ... existing open logic
    this.focusTrap = new FocusTrap(this.element);
    this.focusTrap.activate();

    // Also trap via aria
    document.querySelector('main').setAttribute('aria-hidden', 'true');
}

close() {
    this.focusTrap?.deactivate();
    document.querySelector('main').removeAttribute('aria-hidden');
    // ... existing close logic
}
```

### 8.5 Reduced Motion Support

Respect user's motion preferences:

```css
@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }

    /* Specific overrides for critical animations */
    .action-sheet-content {
        transition: none;
        transform: none;
    }

    .task-item {
        transition: none;
    }

    .gesture-coachmark {
        animation: none;
    }
}
```

```javascript
// In JS, check before animating
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion) {
    element.animate([
        { transform: 'translateX(0)' },
        { transform: 'translateX(100px)' }
    ], { duration: 200 });
} else {
    // Instant state change
    element.style.transform = 'translateX(100px)';
}
```

---

## Platform-Specific Behaviors

Different platforms have different expectations. Handle these explicitly.

### 9.1 iOS-Specific

| Behavior | Issue | Solution |
|----------|-------|----------|
| **100vh bug** | Safari's 100vh includes address bar | Use `100dvh` or `--vh` variable |
| **Input zoom** | Inputs < 16px trigger viewport zoom | All inputs 16px minimum |
| **Rubber band scroll** | Pull-to-refresh conflicts | Check `scrollTop === 0` before activating |
| **Safe areas** | Notch/home indicator | `env(safe-area-inset-*)` |
| **Add to Home Screen** | No automatic prompt | Show custom install banner |
| **Haptics** | Different API (Taptic) | Use standard `vibrate()`, works on iOS 16.4+ |

```css
/* iOS Safari address bar color */
:root {
    --ios-theme-color: #6D5EF6;
}

/* In <head> */
<meta name="theme-color" content="#6D5EF6">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

```javascript
// iOS install banner (no automatic prompt)
class IOSInstallBanner {
    static show() {
        // Only show on iOS Safari, not in standalone mode
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
        const dismissed = localStorage.getItem('ios_install_dismissed');

        if (isIOS && !isStandalone && !dismissed) {
            this.render();
        }
    }

    static render() {
        const banner = document.createElement('div');
        banner.className = 'ios-install-banner';
        banner.innerHTML = `
            <div class="install-content">
                <img src="/static/img/app-icon-64.png" alt="Whendoist" class="install-icon">
                <div class="install-text">
                    <strong>Add Whendoist to Home Screen</strong>
                    <span>Tap <span class="share-icon">⬆️</span> then "Add to Home Screen"</span>
                </div>
                <button class="install-dismiss" aria-label="Dismiss">✕</button>
            </div>
        `;

        banner.querySelector('.install-dismiss').addEventListener('click', () => {
            banner.remove();
            localStorage.setItem('ios_install_dismissed', 'true');
        });

        document.body.prepend(banner);
    }
}
```

### 9.2 Android-Specific

| Behavior | Issue | Solution |
|----------|-------|----------|
| **Back button** | Hardware/gesture back in PWA | Handle `popstate` event |
| **Install prompt** | Automatic `beforeinstallprompt` | Defer and show custom UI |
| **Address bar** | Chrome shows/hides dynamically | Use `100dvh`, handle resize |
| **Haptics** | Standard `vibrate()` | Works natively |

```javascript
// Handle Android back button in PWA
window.addEventListener('popstate', (e) => {
    // If a modal/sheet is open, close it instead of navigating
    const openSheet = document.querySelector('.action-sheet.open, .bottom-sheet.open');
    if (openSheet) {
        e.preventDefault();
        // Close the sheet
        openSheet.classList.remove('open');
        // Push state back to prevent actual navigation
        history.pushState(null, '', window.location.href);
    }
});

// Push initial state on page load
if (window.matchMedia('(display-mode: standalone)').matches) {
    history.pushState(null, '', window.location.href);
}
```

```javascript
// Deferred install prompt (Android)
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // Show custom install button
    document.querySelector('.install-button')?.classList.remove('hidden');
});

function showInstallPrompt() {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((result) => {
        if (result.outcome === 'accepted') {
            console.log('PWA installed');
        }
        deferredPrompt = null;
    });
}
```

### 9.3 Cross-Platform Considerations

| Feature | iOS Behavior | Android Behavior | Solution |
|---------|--------------|------------------|----------|
| Date/time inputs | Native picker | Native picker | Use native `<input type="date">` |
| File upload | Camera + Files | Camera + Files | Accept attribute: `accept="image/*"` |
| Keyboard | Done/Go button | Enter key | Use `enterkeyhint` attribute |
| Copy/paste | Long-press | Long-press | Works natively |
| Text selection | Magnifier | Handles | Works natively |

```html
<!-- Keyboard hints -->
<input type="text" enterkeyhint="search" placeholder="Search tasks...">
<input type="text" enterkeyhint="done" placeholder="Task title">
<input type="text" enterkeyhint="next" placeholder="First name">
```

---

## Security Considerations

### 10.1 Offline Cache & Encryption

Whendoist has E2E encryption. The offline cache must respect this.

**Problem:** Service Worker and IndexedDB store data in plaintext by default.

**Solution:** Don't cache sensitive data when encryption is enabled.

```javascript
// In sw.js
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Check if encryption is enabled (passed via cookie or header)
    const encryptionEnabled = e.request.headers.get('X-Encryption-Enabled') === 'true';

    // Never cache task content when encryption is enabled
    if (encryptionEnabled && url.pathname.startsWith('/api/tasks')) {
        // Network-only for encrypted content
        e.respondWith(fetch(e.request));
        return;
    }

    // Normal caching for non-sensitive routes
    // ... existing cache logic
});
```

**For IndexedDB offline queue:**

```javascript
// Store only task IDs and operation types, not content
OfflineQueue.add({
    type: 'complete',
    taskId: task.id,
    // DON'T store: title, description (encrypted fields)
    timestamp: Date.now()
});
```

### 10.2 Session Security on Mobile

Mobile sessions face unique risks:

| Risk | Mitigation |
|------|------------|
| Device theft | Short session timeout (4 hours), require re-auth |
| Shared device | Clear sessionStorage on logout |
| Screenshot | Don't show sensitive data in app switcher |
| Background exposure | Blur content when backgrounded |

```javascript
// Blur content in app switcher (iOS)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        document.body.classList.add('app-hidden');
    } else {
        document.body.classList.remove('app-hidden');
    }
});
```

```css
body.app-hidden .tasks-panel,
body.app-hidden .calendar-panel {
    filter: blur(20px);
}
```

### 10.3 Biometric Unlock (Future)

For encrypted data, allow biometric unlock instead of passphrase:

```javascript
// Check WebAuthn support with PRF (already in passkey.js)
// This is already implemented for passkey unlock
// Consider adding Face ID/Touch ID prompt on app resume
```

### 10.4 Encryption + Offline Edge Cases (CRITICAL)

When encryption is enabled, offline behavior introduces complex edge cases that must be handled gracefully.

#### Problem Scenarios

| Scenario | Issue | Impact |
|----------|-------|--------|
| Key in sessionStorage + OS kills app | Key lost, data locked | User must re-enter passphrase |
| Create task offline with encryption | Can't encrypt without key | Task stored unencrypted? |
| View cached encrypted tasks offline | Need key to decrypt | Blank titles shown? |
| Passkey PRF + offline | PRF requires network for assertion | Can't unlock |

#### Architecture Decision

**Encryption key persistence for PWA:**

```javascript
// Option 1: IndexedDB with encryption (RECOMMENDED)
// Store encrypted key in IndexedDB, encrypt with device-bound secret
class EncryptedKeyStore {
    static DB_NAME = 'whendoist-keystore';
    static STORE_NAME = 'keys';

    static async storeKey(masterKey, passphrase) {
        // Derive a wrapper key from passphrase + device fingerprint
        const deviceId = await this.getDeviceFingerprint();
        const wrapperKey = await this.deriveWrapperKey(passphrase, deviceId);

        // Wrap the master key
        const wrappedKey = await crypto.subtle.wrapKey(
            'raw',
            masterKey,
            wrapperKey,
            { name: 'AES-GCM', iv: crypto.getRandomValues(new Uint8Array(12)) }
        );

        // Store in IndexedDB
        const db = await this.openDB();
        await db.put(this.STORE_NAME, {
            id: 'master',
            wrappedKey,
            iv,
            timestamp: Date.now()
        });
    }

    static async getDeviceFingerprint() {
        // Use stable device characteristics (screen, timezone, etc.)
        // This isn't security - just adds friction to key extraction
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Whendoist', 2, 2);
        return await crypto.subtle.digest('SHA-256',
            new TextEncoder().encode(canvas.toDataURL() + screen.width + screen.height)
        );
    }
}
```

**Option 2: Don't persist key (SIMPLER)**

```javascript
// Accept that app kill = re-auth required
// Show friendly unlock screen on resume

class EncryptionManager {
    static isKeyAvailable() {
        return sessionStorage.getItem('encryption_key') !== null;
    }

    static showUnlockPrompt() {
        // Show modal: "Enter your passphrase to unlock your tasks"
        // Or: "Use passkey to unlock"
    }

    static async handleOfflineWithoutKey() {
        // Show encrypted tasks with placeholder text
        // "🔒 Encrypted - unlock to view"
    }
}
```

#### Offline Task Creation with Encryption

When creating a task offline with encryption enabled:

```javascript
class OfflineTaskCreation {
    static async createTask(taskData) {
        const hasKey = EncryptionManager.isKeyAvailable();

        if (hasKey) {
            // Encrypt before queuing
            const encryptedData = {
                ...taskData,
                title: await Crypto.encryptField(taskData.title),
                description: await Crypto.encryptField(taskData.description),
                _encrypted: true
            };
            await OfflineQueue.add({
                type: 'create',
                body: encryptedData
            });
        } else {
            // Queue creation but mark as needs-encryption
            // Encrypt on sync when key is available
            await OfflineQueue.add({
                type: 'create',
                body: taskData,
                _needsEncryption: true
            });

            Toast.show('Task saved - will be encrypted when you unlock', 'info');
        }
    }
}

// On sync, handle needs-encryption items
class OfflineQueue {
    static async executeOperation(op) {
        if (op._needsEncryption && EncryptionManager.isKeyAvailable()) {
            op.body.title = await Crypto.encryptField(op.body.title);
            op.body.description = await Crypto.encryptField(op.body.description);
            delete op._needsEncryption;
        }

        // ... existing sync logic
    }
}
```

#### Displaying Encrypted Tasks Offline

```javascript
class OfflineTaskDisplay {
    static async renderTask(task) {
        if (!task._encrypted) {
            return this.renderPlaintext(task);
        }

        if (EncryptionManager.isKeyAvailable()) {
            const decryptedTitle = await Crypto.decryptField(task.title);
            return this.renderDecrypted(task, decryptedTitle);
        }

        // No key available - show locked state
        return `
            <div class="task-item task-locked">
                <span class="lock-icon">🔒</span>
                <span class="locked-text">Encrypted task</span>
                <button class="unlock-btn" onclick="EncryptionManager.showUnlockPrompt()">
                    Unlock
                </button>
            </div>
        `;
    }
}
```

```css
.task-locked {
    background: var(--bg-panel);
    border: 1px dashed var(--border-default);
}

.locked-text {
    color: var(--text-muted);
    font-style: italic;
}

.unlock-btn {
    margin-left: auto;
    padding: 4px 12px;
    background: var(--primary-tint);
    color: var(--primary);
    border: none;
    border-radius: 6px;
    font-size: 0.75rem;
}
```

#### Token Expiry While Offline

Google OAuth tokens expire (typically 1 hour). Handle gracefully:

```javascript
class TokenManager {
    static TOKEN_BUFFER = 5 * 60 * 1000; // Refresh 5 min before expiry

    static async ensureValidToken() {
        const expiry = localStorage.getItem('google_token_expiry');
        const expiryTime = parseInt(expiry, 10);

        if (Date.now() > expiryTime - this.TOKEN_BUFFER) {
            if (navigator.onLine) {
                await this.refreshToken();
            } else {
                // Token will be stale when we come online
                this.markTokenStale();
            }
        }
    }

    static markTokenStale() {
        localStorage.setItem('google_token_stale', 'true');
    }

    static async handleStaleTokenOnResume() {
        if (localStorage.getItem('google_token_stale') === 'true') {
            // Try silent refresh first
            try {
                await this.refreshToken();
                localStorage.removeItem('google_token_stale');
            } catch (err) {
                // Need user interaction for re-auth
                Toast.show('Please reconnect your Google Calendar', 'warning', {
                    action: {
                        label: 'Reconnect',
                        callback: () => window.location.href = '/auth/google'
                    }
                });
            }
        }
    }
}

// Check token validity on app resume
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        TokenManager.handleStaleTokenOnResume();
    }
});
```

---

## Progressive Enhancement

**CRITICAL:** The app must function without JavaScript for core operations.

### 11.1 Philosophy

Mobile networks are unreliable. JavaScript fails to load. The core user journey must work with HTML forms:

```
CORE JOURNEY (must work without JS):
1. View task list ✓ (server-rendered HTML)
2. View task details ✓ (server-rendered)
3. Mark task complete ✓ (form POST)
4. Create new task ✓ (form POST)
5. Edit task ✓ (form POST)
6. Delete task ✓ (form POST with confirmation page)

ENHANCED JOURNEY (requires JS):
- Swipe gestures
- Drag-to-calendar
- Inline editing
- Optimistic UI updates
- Offline support
```

### 11.2 Implementation Pattern

```html
<!-- Task completion: works without JS via form, enhanced with JS -->
<form action="/api/tasks/{{ task.id }}/complete" method="POST" class="complete-form">
    <input type="hidden" name="_method" value="POST">
    <button type="submit" class="complete-btn" data-task-id="{{ task.id }}">
        ✓ Complete
    </button>
</form>

<script>
// Progressive enhancement: intercept form for async submission
document.querySelectorAll('.complete-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const taskId = form.querySelector('[data-task-id]').dataset.taskId;

        // Optimistic UI
        form.closest('.task-item').classList.add('completing');

        try {
            await fetch(form.action, { method: 'POST' });
            // HTMX will handle the DOM update
        } catch (err) {
            if (!navigator.onLine) {
                OfflineQueue.add({ url: form.action, method: 'POST' });
                Toast.show('Saved offline', 'info');
            } else {
                // Fallback: submit form normally
                form.submit();
            }
        }
    });
});
</script>
```

### 11.3 NoScript Fallback

```html
<noscript>
    <style>
        /* Hide JS-only features */
        .swipe-indicator,
        .gesture-coachmark,
        .fab-add-task,
        .offline-indicator,
        .mobile-tabs { display: none !important; }

        /* Show form-based alternatives */
        .noscript-actions { display: block !important; }
    </style>

    <div class="noscript-banner">
        <p>For the best experience, enable JavaScript.
           Core features work without it.</p>
    </div>
</noscript>

<!-- Form-based task actions (hidden when JS available) -->
<div class="noscript-actions" style="display: none;">
    <a href="/tasks/{{ task.id }}/edit">Edit</a>
    <form action="/tasks/{{ task.id }}/complete" method="POST" style="display: inline;">
        <button type="submit">Complete</button>
    </form>
</div>
```

### 11.4 Feature Detection

```javascript
// Detect capabilities and adjust UI accordingly
const Features = {
    serviceWorker: 'serviceWorker' in navigator,
    indexedDB: 'indexedDB' in window,
    webCrypto: 'crypto' in window && 'subtle' in crypto,
    vibration: 'vibrate' in navigator,
    share: 'share' in navigator,

    check() {
        // Disable features that require missing APIs
        if (!this.serviceWorker) {
            document.body.classList.add('no-offline');
        }
        if (!this.webCrypto) {
            document.body.classList.add('no-encryption');
            // Hide encryption settings
            document.querySelector('.encryption-panel')?.remove();
        }
    }
};

Features.check();
```

---

## Push Notifications

**CRITICAL:** Task reminders are essential for a task management app.

### 12.1 Notification Types

| Type | Trigger | Priority | Sound |
|------|---------|----------|-------|
| **Task Due** | 15 min before due time | High | Default |
| **Task Overdue** | At due time if not complete | High | Urgent |
| **Daily Planning** | Configurable morning time | Medium | Gentle |
| **Weekly Review** | Sunday evening | Low | Gentle |
| **Sync Conflict** | When conflict detected | Medium | Default |

### 12.2 Permission Strategy

**Never ask on first visit.** Wait for user intent:

```javascript
class NotificationPermission {
    static PROMPTS_KEY = 'notification_prompt_count';
    static MAX_PROMPTS = 3;

    static async shouldPrompt() {
        // Don't prompt if already granted/denied
        if (Notification.permission !== 'default') return false;

        // Don't prompt more than 3 times
        const promptCount = parseInt(localStorage.getItem(this.PROMPTS_KEY) || '0');
        if (promptCount >= this.MAX_PROMPTS) return false;

        return true;
    }

    static async promptAtRightMoment() {
        // Prompt after user creates their 3rd task
        // Or when they set a due date/time
        // Or when they enable reminders in settings
    }

    static async requestWithContext(reason) {
        if (!await this.shouldPrompt()) return;

        // Show custom UI explaining WHY
        const sheet = new BottomSheet({
            content: `
                <div class="notification-prompt">
                    <h3>🔔 Get Reminded</h3>
                    <p>${reason}</p>
                    <button class="btn-primary" id="enable-notifications">
                        Enable Notifications
                    </button>
                    <button class="btn-secondary" id="maybe-later">
                        Maybe Later
                    </button>
                </div>
            `
        });

        sheet.element.querySelector('#enable-notifications').onclick = async () => {
            const result = await Notification.requestPermission();
            if (result === 'granted') {
                await this.registerPushSubscription();
            }
            sheet.close();
        };

        localStorage.setItem(this.PROMPTS_KEY,
            (parseInt(localStorage.getItem(this.PROMPTS_KEY) || '0') + 1).toString()
        );
    }
}
```

### 12.3 Service Worker Push Handler

```javascript
// In sw.js
self.addEventListener('push', (event) => {
    const data = event.data?.json() || {};

    const options = {
        body: data.body || 'You have a task reminder',
        icon: '/static/img/app-icon-192.png',
        badge: '/static/img/badge-72.png',
        tag: data.tag || 'whendoist-notification',
        renotify: true,
        requireInteraction: data.priority === 'high',
        actions: getActionsForType(data.type),
        data: {
            url: data.url || '/dashboard',
            taskId: data.taskId
        }
    };

    // Vibration pattern based on priority
    if (data.priority === 'high') {
        options.vibrate = [200, 100, 200];
    }

    event.waitUntil(
        self.registration.showNotification(data.title || 'Whendoist', options)
    );
});

function getActionsForType(type) {
    switch (type) {
        case 'task_due':
            return [
                { action: 'complete', title: '✓ Done', icon: '/static/img/check.png' },
                { action: 'snooze', title: '⏰ +15min', icon: '/static/img/snooze.png' }
            ];
        case 'daily_planning':
            return [
                { action: 'plan', title: 'Plan Day', icon: '/static/img/calendar.png' }
            ];
        default:
            return [];
    }
}

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const action = event.action;
    const data = event.notification.data;

    if (action === 'complete' && data.taskId) {
        // Complete task in background
        event.waitUntil(
            fetch(`/api/tasks/${data.taskId}/complete`, { method: 'POST' })
        );
    } else if (action === 'snooze' && data.taskId) {
        // Snooze for 15 minutes
        event.waitUntil(
            fetch(`/api/tasks/${data.taskId}/snooze`, {
                method: 'POST',
                body: JSON.stringify({ minutes: 15 })
            })
        );
    } else {
        // Open the app
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then(windowClients => {
                // Focus existing window or open new
                for (const client of windowClients) {
                    if (client.url.includes('/dashboard') && 'focus' in client) {
                        return client.focus();
                    }
                }
                return clients.openWindow(data.url || '/dashboard');
            })
        );
    }
});
```

### 12.4 Backend Push Service

```python
# app/services/push_service.py
from pywebpush import webpush
from datetime import datetime, timedelta

class PushService:
    async def send_task_reminder(self, user_id: int, task: Task):
        subscriptions = await self.get_user_subscriptions(user_id)

        payload = {
            'type': 'task_due',
            'title': f'⏰ {task.title}',
            'body': f'Due in 15 minutes',
            'taskId': str(task.id),
            'url': f'/dashboard?task={task.id}',
            'priority': 'high',
            'tag': f'task-{task.id}'
        }

        for sub in subscriptions:
            try:
                webpush(
                    subscription_info=sub.subscription_info,
                    data=json.dumps(payload),
                    vapid_private_key=settings.VAPID_PRIVATE_KEY,
                    vapid_claims={'sub': 'mailto:' + settings.VAPID_EMAIL}
                )
            except WebPushException as e:
                if e.response.status_code == 410:
                    # Subscription expired, remove it
                    await self.remove_subscription(sub.id)

    async def schedule_reminders(self, task: Task):
        """Schedule push notification for task with due time."""
        if not task.scheduled_time:
            return

        reminder_time = task.scheduled_time - timedelta(minutes=15)

        # Use task queue (Celery, APScheduler, etc.)
        await scheduler.enqueue_at(
            reminder_time,
            'send_task_reminder',
            user_id=task.user_id,
            task_id=task.id
        )
```

### 12.5 Quiet Hours

```javascript
// Settings panel for notification preferences
const NotificationPreferences = {
    defaults: {
        enabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        taskReminders: true,
        dailyPlanning: true,
        dailyPlanningTime: '08:00'
    },

    isQuietHours() {
        const prefs = this.get();
        if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const [startH, startM] = prefs.quietHoursStart.split(':').map(Number);
        const [endH, endM] = prefs.quietHoursEnd.split(':').map(Number);

        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        if (startMinutes < endMinutes) {
            return currentMinutes >= startMinutes && currentMinutes < endMinutes;
        } else {
            // Crosses midnight
            return currentMinutes >= startMinutes || currentMinutes < endMinutes;
        }
    }
};
```

---

## Platform Extensions

### 13.1 Deep Linking (CRITICAL)

Enable sharing specific tasks and proper app navigation.

#### Universal Links (iOS) / App Links (Android)

```json
// .well-known/apple-app-site-association
{
    "applinks": {
        "apps": [],
        "details": [{
            "appID": "TEAM_ID.com.whendoist.app",
            "paths": [
                "/tasks/*",
                "/dashboard",
                "/thoughts"
            ]
        }]
    },
    "webcredentials": {
        "apps": ["TEAM_ID.com.whendoist.app"]
    }
}
```

```json
// .well-known/assetlinks.json (Android)
[{
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
        "namespace": "android_app",
        "package_name": "com.whendoist.app",
        "sha256_cert_fingerprints": ["..."]
    }
}]
```

#### PWA Deep Link Handling

```javascript
// Handle deep links in PWA
class DeepLinkHandler {
    static init() {
        // Handle initial URL
        this.handleUrl(window.location.href);

        // Handle navigation within PWA
        window.addEventListener('popstate', () => {
            this.handleUrl(window.location.href);
        });
    }

    static handleUrl(url) {
        const parsed = new URL(url);
        const path = parsed.pathname;

        // Task deep link: /tasks/123
        const taskMatch = path.match(/^\/tasks\/(\d+)$/);
        if (taskMatch) {
            const taskId = taskMatch[1];
            TaskDialog.open(taskId);
            return;
        }

        // Dashboard with task highlight: /dashboard?task=123
        const taskParam = parsed.searchParams.get('task');
        if (taskParam) {
            this.highlightTask(taskParam);
            return;
        }
    }

    static highlightTask(taskId) {
        requestAnimationFrame(() => {
            const task = document.querySelector(`[data-task-id="${taskId}"]`);
            if (task) {
                task.scrollIntoView({ behavior: 'smooth', block: 'center' });
                task.classList.add('highlighted');
                setTimeout(() => task.classList.remove('highlighted'), 2000);
            }
        });
    }
}

// Generate shareable task URL
function getTaskShareUrl(taskId) {
    return `${window.location.origin}/tasks/${taskId}`;
}
```

#### Custom URL Scheme (Fallback)

```html
<!-- In manifest.json -->
{
    "protocol_handlers": [{
        "protocol": "web+whendoist",
        "url": "/handle-protocol?url=%s"
    }]
}
```

```javascript
// Handle custom protocol
// URL: web+whendoist://task/123
class ProtocolHandler {
    static handle(protocolUrl) {
        const url = new URL(protocolUrl);
        const path = url.pathname;

        if (path.startsWith('//task/')) {
            const taskId = path.replace('//task/', '');
            TaskDialog.open(taskId);
        }
    }
}
```

### 13.2 Share Target (Receive Shares)

Allow users to share content TO Whendoist from other apps.

```json
// In manifest.json
{
    "share_target": {
        "action": "/api/share-target",
        "method": "POST",
        "enctype": "multipart/form-data",
        "params": {
            "title": "title",
            "text": "text",
            "url": "url"
        }
    }
}
```

```python
# app/routers/share.py
@router.post("/api/share-target")
async def handle_share_target(
    title: str = Form(None),
    text: str = Form(None),
    url: str = Form(None),
    user: User = Depends(get_current_user)
):
    # Create task from shared content
    task_title = title or text or url or "Shared item"
    task_description = ""

    if url:
        task_description = f"Source: {url}\n\n"
    if text and text != title:
        task_description += text

    task = await task_service.create_task(
        user_id=user.id,
        title=task_title[:100],  # Truncate if too long
        description=task_description,
        domain_id=user.default_domain_id
    )

    # Redirect to dashboard with new task highlighted
    return RedirectResponse(f"/dashboard?task={task.id}&shared=true")
```

```javascript
// Show confirmation after share
if (new URLSearchParams(location.search).get('shared') === 'true') {
    Toast.show('Task created from share!', 'success');
    // Clean up URL
    history.replaceState(null, '', '/dashboard');
}
```

### 13.3 Web Share API (Share FROM App)

```javascript
async function shareTask(task) {
    const shareData = {
        title: task.title,
        text: task.description || `Task: ${task.title}`,
        url: getTaskShareUrl(task.id)
    };

    if (navigator.canShare?.(shareData)) {
        try {
            await navigator.share(shareData);
            MobileAnalytics.track('task_shared', { task_id: task.id });
        } catch (err) {
            if (err.name !== 'AbortError') {
                // Fallback to copy link
                await navigator.clipboard.writeText(shareData.url);
                Toast.show('Link copied!', 'success');
            }
        }
    } else {
        // Fallback for browsers without Web Share
        await navigator.clipboard.writeText(shareData.url);
        Toast.show('Link copied!', 'success');
    }
}
```

### 13.4 Home Screen Widgets

#### iOS Widget (via Shortcuts)

Create Siri Shortcuts that surface in iOS widgets:

```javascript
// Define shortcut actions
const ShortcutActions = {
    async addTask(title) {
        return fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
    },

    async getTodayCount() {
        const response = await fetch('/api/tasks/today/count');
        return response.json();
    }
};

// Expose via x-callback-url
// whendoist://x-callback-url/add-task?title=...
```

```html
<!-- Add to Home Screen shortcut -->
<link rel="apple-touch-icon" href="/static/img/shortcut-add.png"
      data-shortcut-name="Add Task"
      data-shortcut-url="/quick-add">
```

#### Android Widget (TWA/PWA)

For Android PWA, create a simple "Add Task" widget:

```json
// In manifest.json - shortcuts appear on long-press of app icon
{
    "shortcuts": [
        {
            "name": "Add Task",
            "short_name": "Add",
            "description": "Quickly add a new task",
            "url": "/quick-add?source=shortcut",
            "icons": [{ "src": "/static/img/shortcut-add-96.png", "sizes": "96x96" }]
        },
        {
            "name": "Today's Tasks",
            "short_name": "Today",
            "description": "View today's tasks",
            "url": "/dashboard?filter=today",
            "icons": [{ "src": "/static/img/shortcut-today-96.png", "sizes": "96x96" }]
        },
        {
            "name": "Quick Thought",
            "short_name": "Thought",
            "description": "Capture a quick thought",
            "url": "/thoughts?quick=true",
            "icons": [{ "src": "/static/img/shortcut-thought-96.png", "sizes": "96x96" }]
        }
    ]
}
```

### 13.5 Foldable Device Support

```css
/* Detect foldable displays */
@media (horizontal-viewport-segments: 2) {
    /* Device is spanning two screens (e.g., Surface Duo unfolded) */
    .tasks-layout {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: env(viewport-segment-left 1 0, 0); /* Gap at the fold */
    }

    .tasks-panel {
        grid-column: 1;
    }

    .calendar-panel {
        grid-column: 2;
    }
}

@media (vertical-viewport-segments: 2) {
    /* Flipped foldable (rare) */
    .tasks-layout {
        grid-template-rows: 1fr 1fr;
    }
}

/* Samsung Fold specific - detect aspect ratio change */
@media (min-aspect-ratio: 1/1) and (max-width: 900px) {
    /* Square-ish viewport on inner screen */
    .tasks-layout {
        display: grid;
        grid-template-columns: 1fr 1fr;
    }
}
```

```javascript
// Detect fold state changes
class FoldableHandler {
    static init() {
        if (!('visualViewport' in window)) return;

        // Screen segments API (experimental)
        if ('getWindowSegments' in window) {
            this.handleSegments();
        }

        // Fallback: detect significant viewport changes
        let lastWidth = window.innerWidth;
        window.visualViewport.addEventListener('resize', () => {
            const newWidth = window.visualViewport.width;
            const widthChange = Math.abs(newWidth - lastWidth) / lastWidth;

            // > 40% width change suggests fold/unfold
            if (widthChange > 0.4) {
                this.onFoldStateChange(newWidth > lastWidth ? 'unfolded' : 'folded');
            }
            lastWidth = newWidth;
        });
    }

    static onFoldStateChange(state) {
        document.body.dataset.foldState = state;

        if (state === 'unfolded') {
            // Show both panels side-by-side
            document.querySelector('.mobile-tabs')?.classList.add('hidden');
            document.querySelector('.tasks-panel')?.classList.add('active');
            document.querySelector('.calendar-panel')?.classList.add('active');
        } else {
            // Revert to tabbed layout
            document.querySelector('.mobile-tabs')?.classList.remove('hidden');
        }
    }
}
```

---

## Real-Time Updates

### 14.1 Architecture Decision

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **Polling** | Simple, works everywhere | Battery drain, latency | No |
| **SSE** | Unidirectional, simple, auto-reconnect | Limited browser connections | **Yes** for MVP |
| **WebSocket** | Bidirectional, low latency | Complex, connection management | Later |

### 14.2 Server-Sent Events Implementation

```python
# app/routers/events.py
from sse_starlette.sse import EventSourceResponse
from asyncio import Queue

# User -> Queue mapping
user_connections: dict[int, list[Queue]] = {}

@router.get("/api/events")
async def event_stream(user: User = Depends(get_current_user)):
    queue = Queue()

    if user.id not in user_connections:
        user_connections[user.id] = []
    user_connections[user.id].append(queue)

    async def event_generator():
        try:
            while True:
                event = await queue.get()
                yield {
                    "event": event["type"],
                    "data": json.dumps(event["data"])
                }
        except asyncio.CancelledError:
            user_connections[user.id].remove(queue)

    return EventSourceResponse(event_generator())

# Broadcast to user's connections
async def broadcast_to_user(user_id: int, event_type: str, data: dict):
    if user_id not in user_connections:
        return

    for queue in user_connections[user_id]:
        await queue.put({"type": event_type, "data": data})

# Usage in task service
async def complete_task(task_id: int, user_id: int):
    task = await update_task_status(task_id, "completed")

    # Broadcast to all user's devices
    await broadcast_to_user(user_id, "task_completed", {
        "task_id": task_id,
        "completed_at": task.completed_at.isoformat()
    })
```

```javascript
// static/js/realtime.js
class RealtimeSync {
    constructor() {
        this.eventSource = null;
        this.reconnectAttempts = 0;
        this.maxReconnectDelay = 30000;
    }

    connect() {
        if (this.eventSource) return;

        this.eventSource = new EventSource('/api/events');

        this.eventSource.onopen = () => {
            console.log('SSE connected');
            this.reconnectAttempts = 0;
        };

        this.eventSource.onerror = () => {
            this.eventSource.close();
            this.eventSource = null;
            this.scheduleReconnect();
        };

        // Handle specific event types
        this.eventSource.addEventListener('task_completed', (e) => {
            const data = JSON.parse(e.data);
            this.handleTaskCompleted(data);
        });

        this.eventSource.addEventListener('task_created', (e) => {
            const data = JSON.parse(e.data);
            this.handleTaskCreated(data);
        });

        this.eventSource.addEventListener('task_updated', (e) => {
            const data = JSON.parse(e.data);
            this.handleTaskUpdated(data);
        });

        this.eventSource.addEventListener('sync_required', (e) => {
            // Full refresh needed (e.g., bulk import)
            location.reload();
        });
    }

    scheduleReconnect() {
        const delay = Math.min(
            1000 * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectDelay
        );
        this.reconnectAttempts++;

        setTimeout(() => {
            if (navigator.onLine) {
                this.connect();
            }
        }, delay);
    }

    handleTaskCompleted(data) {
        const taskEl = document.querySelector(`[data-task-id="${data.task_id}"]`);
        if (taskEl && !taskEl.classList.contains('completed-today')) {
            taskEl.classList.add('completed-today');
            announceToScreenReader('Task completed on another device');
        }
    }

    handleTaskCreated(data) {
        // Trigger HTMX refresh of task list
        htmx.trigger(document.querySelector('.tasks-panel'), 'refresh');
    }

    handleTaskUpdated(data) {
        // Update specific task element if visible
        htmx.ajax('GET', `/partials/task/${data.task_id}`, {
            target: `[data-task-id="${data.task_id}"]`,
            swap: 'outerHTML'
        });
    }

    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }
}

// Initialize
const realtime = new RealtimeSync();

// Connect when online and visible
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
        realtime.connect();
    } else if (document.visibilityState === 'hidden') {
        realtime.disconnect(); // Save battery when backgrounded
    }
});

window.addEventListener('online', () => realtime.connect());
window.addEventListener('offline', () => realtime.disconnect());
```

### 14.3 Conflict Resolution with Real-Time

When offline changes sync while real-time updates arrive:

```javascript
class ConflictResolver {
    static pendingChanges = new Map(); // taskId -> local change

    static registerLocalChange(taskId, change) {
        this.pendingChanges.set(taskId, {
            ...change,
            timestamp: Date.now()
        });
    }

    static handleServerUpdate(taskId, serverData) {
        const localChange = this.pendingChanges.get(taskId);

        if (!localChange) {
            // No conflict, apply server update
            return { action: 'apply', data: serverData };
        }

        // We have a pending local change
        if (serverData.updated_at > localChange.timestamp) {
            // Server is newer, but we have pending changes
            // Show conflict UI
            return {
                action: 'conflict',
                local: localChange,
                server: serverData
            };
        }

        // Local change is newer (pending sync)
        // Ignore server update, our sync will overwrite
        return { action: 'ignore' };
    }
}
```

---

## Network Resilience

### 15.1 Network Quality Detection

```javascript
// static/js/network-aware.js
const NetworkAware = {
    // Get effective connection type
    getEffectiveType() {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        return conn?.effectiveType || '4g';
    },

    // Get downlink speed in Mbps
    getDownlink() {
        const conn = navigator.connection;
        return conn?.downlink || 10; // Default to reasonable speed
    },

    // Is user in data saver mode?
    isDataSaver() {
        return navigator.connection?.saveData === true;
    },

    // Should we preload resources?
    shouldPreload() {
        const type = this.getEffectiveType();
        return (type === '4g' || type === '3g') && !this.isDataSaver();
    },

    // Should we reduce data usage?
    shouldReduceData() {
        const type = this.getEffectiveType();
        return type === '2g' || type === 'slow-2g' || this.isDataSaver();
    },

    // Should we simplify animations?
    shouldReduceAnimations() {
        const type = this.getEffectiveType();
        return type === '2g' || type === 'slow-2g';
    },

    // Initialize listeners
    init() {
        if (!navigator.connection) return;

        navigator.connection.addEventListener('change', () => {
            this.onNetworkChange();
        });

        this.applyNetworkOptimizations();
    },

    onNetworkChange() {
        console.log('Network changed:', this.getEffectiveType());
        this.applyNetworkOptimizations();
    },

    applyNetworkOptimizations() {
        const body = document.body;

        // Add data attributes for CSS targeting
        body.dataset.networkType = this.getEffectiveType();
        body.dataset.dataSaver = this.isDataSaver();

        if (this.shouldReduceData()) {
            body.classList.add('reduce-data');
            // Disable auto-loading images
            document.querySelectorAll('img[data-src]').forEach(img => {
                img.removeAttribute('loading');
            });
        } else {
            body.classList.remove('reduce-data');
        }

        if (this.shouldReduceAnimations()) {
            body.classList.add('reduce-animations');
        } else {
            body.classList.remove('reduce-animations');
        }
    }
};

NetworkAware.init();
```

```css
/* Reduce data usage on slow connections */
body.reduce-data img:not(.critical) {
    display: none;
}

body.reduce-data .avatar {
    background: var(--bg-panel);
}

body.reduce-data .chart-container {
    display: none;
}

body.reduce-data .chart-fallback {
    display: block;
}

/* Reduce animations on slow connections */
body.reduce-animations *,
body.reduce-animations *::before,
body.reduce-animations *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
}
```

### 15.2 Cache Versioning (CRITICAL)

Handle app updates when offline cache has stale schema.

```javascript
// static/js/cache-version.js
const CacheVersion = {
    CURRENT_VERSION: '3.0.0',
    SCHEMA_VERSION: 2, // Increment when IndexedDB schema changes

    async check() {
        const stored = localStorage.getItem('app_version');
        const storedSchema = parseInt(localStorage.getItem('schema_version') || '1');

        if (!stored) {
            // First install
            this.save();
            return { action: 'fresh' };
        }

        if (stored !== this.CURRENT_VERSION) {
            // App updated
            console.log(`App updated: ${stored} → ${this.CURRENT_VERSION}`);

            if (storedSchema < this.SCHEMA_VERSION) {
                // Breaking schema change - need migration
                return {
                    action: 'migrate',
                    from: storedSchema,
                    to: this.SCHEMA_VERSION
                };
            }

            // Non-breaking update - just clear caches
            return { action: 'clear_cache' };
        }

        return { action: 'none' };
    },

    async handleUpdate(result) {
        switch (result.action) {
            case 'migrate':
                await this.migrateSchema(result.from, result.to);
                break;

            case 'clear_cache':
                await this.clearCaches();
                break;
        }

        this.save();
    },

    async migrateSchema(from, to) {
        console.log(`Migrating schema: ${from} → ${to}`);

        // Define migrations
        const migrations = {
            // Schema 1 → 2: Add 'priority' field to offline queue
            '1_to_2': async () => {
                const db = await this.openDB();
                const tx = db.transaction('pending-operations', 'readwrite');
                const store = tx.objectStore('pending-operations');

                const all = await store.getAll();
                for (const item of all) {
                    item.priority = item.type === 'delete' ? 'low' : 'normal';
                    await store.put(item);
                }
            }
        };

        // Run each migration in sequence
        for (let v = from; v < to; v++) {
            const key = `${v}_to_${v + 1}`;
            if (migrations[key]) {
                await migrations[key]();
            }
        }

        Toast.show('App updated! Optimizing your data...', 'info');
    },

    async clearCaches() {
        if ('caches' in window) {
            const names = await caches.keys();
            await Promise.all(names.map(name => caches.delete(name)));
        }

        // Re-register service worker to rebuild cache
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            await reg?.update();
        }
    },

    save() {
        localStorage.setItem('app_version', this.CURRENT_VERSION);
        localStorage.setItem('schema_version', this.SCHEMA_VERSION.toString());
    },

    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('whendoist-offline', this.SCHEMA_VERSION);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
};

// Check on load
(async () => {
    const result = await CacheVersion.check();
    if (result.action !== 'none') {
        await CacheVersion.handleUpdate(result);
    }
})();
```

### 15.3 Offline Queue Rate Limiting

Prevent overwhelming the server when coming online with many queued items:

```javascript
// Enhance OfflineQueue with rate limiting
class OfflineQueue {
    static BATCH_SIZE = 10;
    static BATCH_DELAY = 1000; // 1 second between batches

    static async sync() {
        if (!navigator.onLine) return { synced: 0, failed: 0, conflicts: 0 };

        await this.init();
        const operations = await this.getAll();

        if (operations.length === 0) return { synced: 0, failed: 0, conflicts: 0 };

        // Sort by priority: creates first, then updates, then deletes
        const priorityOrder = { create: 0, update: 1, complete: 2, delete: 3 };
        operations.sort((a, b) => {
            const priorityDiff = (priorityOrder[a.type] || 99) - (priorityOrder[b.type] || 99);
            if (priorityDiff !== 0) return priorityDiff;
            return a.timestamp - b.timestamp;
        });

        Toast.show(`Syncing ${operations.length} changes...`, 'info', { duration: 2000 });

        let synced = 0, failed = 0, conflicts = 0;

        // Process in batches
        for (let i = 0; i < operations.length; i += this.BATCH_SIZE) {
            const batch = operations.slice(i, i + this.BATCH_SIZE);

            const results = await Promise.allSettled(
                batch.map(op => this.executeWithRetry(op))
            );

            for (let j = 0; j < results.length; j++) {
                const result = results[j];
                if (result.status === 'fulfilled') {
                    if (result.value.conflict) {
                        conflicts++;
                    } else {
                        synced++;
                        await this.remove(batch[j].id);
                    }
                } else {
                    failed++;
                }
            }

            // Rate limit: wait between batches
            if (i + this.BATCH_SIZE < operations.length) {
                await new Promise(r => setTimeout(r, this.BATCH_DELAY));
            }
        }

        this.updateSyncBadge();

        // Show summary
        if (conflicts > 0) {
            Toast.show(`Synced with ${conflicts} conflict(s)`, 'warning', {
                duration: 5000,
                action: { label: 'Review', callback: () => this.showConflictDialog() }
            });
        } else if (failed > 0) {
            Toast.show(`${synced} synced, ${failed} failed`, 'error');
        } else if (synced > 0) {
            Toast.show(`${synced} changes synced`, 'success');
        }

        return { synced, failed, conflicts };
    }

    static async executeWithRetry(op, attempts = 3) {
        for (let i = 0; i < attempts; i++) {
            try {
                return await this.executeOperation(op);
            } catch (err) {
                if (i === attempts - 1) throw err;

                // Exponential backoff
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
            }
        }
    }
}
```

### 15.4 Skeleton Screens

Show content placeholders during loading for better perceived performance:

```html
<!-- Skeleton template for task list -->
<template id="task-skeleton">
    <div class="task-skeleton">
        <div class="skeleton-rail"></div>
        <div class="skeleton-content">
            <div class="skeleton-line skeleton-title"></div>
            <div class="skeleton-line skeleton-meta"></div>
        </div>
    </div>
</template>
```

```css
.task-skeleton {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    gap: 12px;
}

.skeleton-rail {
    width: 3px;
    height: 24px;
    background: var(--border-subtle);
    border-radius: 2px;
}

.skeleton-line {
    height: 12px;
    background: linear-gradient(
        90deg,
        var(--bg-panel) 25%,
        var(--bg-surface) 50%,
        var(--bg-panel) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.5s infinite;
    border-radius: 4px;
}

.skeleton-title {
    width: 60%;
    margin-bottom: 8px;
}

.skeleton-meta {
    width: 30%;
}

@keyframes skeleton-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
    .skeleton-line {
        animation: none;
        background: var(--bg-panel);
    }
}
```

```javascript
// Show skeleton while loading
class SkeletonLoader {
    static show(container, count = 5) {
        const template = document.getElementById('task-skeleton');
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < count; i++) {
            fragment.appendChild(template.content.cloneNode(true));
        }

        container.innerHTML = '';
        container.appendChild(fragment);
    }

    static hide(container) {
        container.querySelectorAll('.task-skeleton').forEach(el => el.remove());
    }
}

// Usage with HTMX
document.body.addEventListener('htmx:beforeRequest', (e) => {
    if (e.target.classList.contains('tasks-panel')) {
        SkeletonLoader.show(e.target, 8);
    }
});
```

---

## Implementation Phases

### Phase 0: Measurement (1 sprint)

**Goal:** Establish baselines before making changes.

| Task | Tool | Output |
|------|------|--------|
| Lighthouse mobile audit | Chrome DevTools | Baseline scores |
| Record mobile session metrics | Analytics | Session duration, bounce rate |
| Test current touch targets | Manual audit | List of undersized targets |
| Document current gesture conflicts | Manual testing | Conflict inventory |
| Set up mobile error tracking | Sentry/similar | Error dashboard |

**Exit criteria:** Documented baseline metrics for all success metrics.

### Phase 1: Foundation (2 sprints)

**Goal:** Core infrastructure without breaking existing functionality.

| Task | Files | Complexity |
|------|-------|------------|
| Service worker (basic caching) | `sw.js`, `base.html` | Medium |
| Cache versioning system | `cache-version.js` | Medium |
| iOS input zoom prevention | `app.css` | Low |
| Touch detection refactor | `device-detection.js` | Low |
| Network quality detection | `network-aware.js` | Low |
| Tab-based mobile layout for Tasks | `dashboard.css`, `dashboard.html` | Medium |
| Bottom sheet component | `mobile-sheet.js`, `mobile-sheet.css` | Medium |
| Task dialog as bottom sheet on mobile | `task-dialog.js`, `dialog.css` | Low |
| Dynamic viewport height fix | `app.css`, inline script | Low |
| App lifecycle management | `app-lifecycle.js` | Medium |
| Progressive enhancement for forms | Templates, JS | Medium |
| Skeleton loading screens | `skeleton.css`, templates | Low |

**Testing focus:** Desktop unchanged, PWA installability, iOS/Android install banners, no-JS fallback.

### Phase 2: Core Mobile UX (2 sprints)

**Goal:** Essential mobile interactions.

| Task | Files | Complexity |
|------|-------|------------|
| Swipe-to-complete/delete with conflict handling | `task-swipe.js`, `dashboard.css` | High |
| Long-press action sheet | `task-sheet.js` | Medium |
| Gesture onboarding coachmarks | `gesture-onboarding.js` | Low |
| Accessibility alternatives (double-tap) | `task-accessibility.js` | Medium |
| Haptic feedback system | `haptics.js` | Low |
| Orientation change handling during drag | `drag-drop.js` | Medium |

**Testing focus:** Gesture conflicts (scroll vs swipe), accidental triggers, screen reader testing.

### Phase 3: Offline & Sync (2 sprints)

**Goal:** Reliable offline experience.

| Task | Files | Complexity |
|------|-------|------------|
| Offline queue with conflict resolution | `offline-queue.js` | High |
| Offline queue rate limiting | `offline-queue.js` | Medium |
| Sync status indicators | `app.css`, header | Low |
| Offline indicator UI | `app.css`, `base.html` | Low |
| Pull-to-refresh (with iOS handling) | `pull-refresh.js` | Medium |
| App resume refresh | `app-lifecycle.js` | Low |
| Encryption + offline edge cases | `crypto.js`, `offline-queue.js` | High |
| Token expiry handling while offline | `token-manager.js` | Medium |

**Testing focus:** Conflict scenarios, sync reliability, offline → online transitions, encrypted data handling.

### Phase 4: Calendar UX (2 sprints)

**Goal:** Usable scheduling on phones.

| Task | Files | Complexity |
|------|-------|------------|
| Tap-to-schedule mode | `tap-to-schedule.js` | High |
| Schedule confirmation bottom sheet | Component | Medium |
| Enlarged drop zones during drag | `drag-drop.js`, `dashboard.css` | Medium |
| Calendar navigation gestures | `calendar.js` | Low |

**Testing focus:** Scheduling accuracy, 15-min precision, edge cases (cross-day).

### Phase 5: Polish & Accessibility (2 sprints)

**Goal:** Production-ready mobile experience.

| Task | Files | Complexity |
|------|-------|------------|
| Empty states design | Templates, CSS | Low |
| Error states design | Templates, CSS | Low |
| VoiceOver/TalkBack testing | Various | Medium |
| Focus trapping in all modals | All modal components | Medium |
| Reduced motion support | CSS, JS | Low |
| Analytics mobile optimization | `analytics.css` | Low |
| Landscape tablet layout | `dashboard.css` | Medium |
| Security: blur on background | `app.css` | Low |
| Foldable device support | `dashboard.css`, `foldable.js` | Medium |

**Testing focus:** Full accessibility audit, device matrix testing, foldable device testing.

### Phase 6: Real-Time & Notifications (2 sprints)

**Goal:** Live sync and push notifications.

| Task | Files | Complexity |
|------|-------|------------|
| Server-Sent Events backend | `app/routers/events.py` | Medium |
| SSE client with reconnection | `realtime.js` | Medium |
| Real-time + offline conflict resolution | `conflict-resolver.js` | High |
| Push notification service (backend) | `push_service.py` | High |
| Service worker push handler | `sw.js` | Medium |
| Notification permission UX | `notification-permission.js` | Medium |
| Quiet hours implementation | Settings, backend | Low |
| Task reminder scheduling | Backend scheduler | High |

**Testing focus:** Multi-device sync, notification delivery, battery impact.

### Phase 7: Platform Extensions (2 sprints)

**Goal:** Deep platform integration.

| Task | Files | Complexity |
|------|-------|------------|
| Deep linking (Universal/App Links) | `.well-known/*`, routing | Medium |
| Custom URL scheme handling | `protocol-handler.js` | Low |
| Web Share Target (receive shares) | `manifest.json`, backend | Medium |
| Web Share API (share from app) | Task actions | Low |
| App shortcuts (PWA) | `manifest.json` | Low |
| iOS install banner | `ios-install.js` | Low |
| Android deferred install prompt | `install-prompt.js` | Low |

**Testing focus:** Deep links from various sources, share flow, install conversion.

### Phase Summary

| Phase | Duration | Key Deliverables | Dependencies |
|-------|----------|------------------|--------------|
| **0** | 1 sprint | Baseline metrics | None |
| **1** | 2 sprints | Service worker, cache versioning, progressive enhancement | Phase 0 |
| **2** | 2 sprints | Gestures, haptics, accessibility | Phase 1 |
| **3** | 2 sprints | Offline queue, encryption handling, rate limiting | Phase 1 |
| **4** | 2 sprints | Tap-to-schedule, calendar gestures | Phase 2 |
| **5** | 2 sprints | Polish, accessibility audit, foldables | Phases 2-4 |
| **6** | 2 sprints | SSE, push notifications | Phase 3 |
| **7** | 2 sprints | Deep links, share target, widgets | Phase 5 |

**Total:** ~15 sprints (30 weeks at 2-week sprints)

---

## Empty States & Error States

### 17.1 Empty States

Mobile users encounter empty states frequently. Design them thoughtfully.

```
┌─────────────────────────────────────┐
│                                     │
│              📋                     │
│                                     │
│       No tasks for today           │
│                                     │
│   Tap + to add your first task     │
│                                     │
│         [ + Add Task ]             │
│                                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│                                     │
│              📡                     │
│                                     │
│        You're offline              │
│                                     │
│    Your tasks will appear when     │
│         you reconnect              │
│                                     │
│         [ Try Again ]              │
│                                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│                                     │
│              🔍                     │
│                                     │
│      No tasks match filter         │
│                                     │
│    Try a different energy mode     │
│      or clear your filters         │
│                                     │
│       [ Clear Filters ]            │
│                                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│                                     │
│              📅                     │
│                                     │
│    No events for this day          │
│                                     │
│     Drag a task here to            │
│     schedule it                    │
│                                     │
└─────────────────────────────────────┘
```

### 17.2 Error States

```javascript
// Error state component
class ErrorState {
    static show(container, { title, message, action, actionLabel }) {
        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <h3 class="error-title">${title}</h3>
                <p class="error-message">${message}</p>
                ${action ? `<button class="error-action" onclick="${action}">${actionLabel}</button>` : ''}
            </div>
        `;
    }
}

// Usage
ErrorState.show(taskList, {
    title: 'Failed to load tasks',
    message: 'Check your connection and try again',
    action: 'location.reload()',
    actionLabel: 'Retry'
});
```

```css
.error-state,
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    text-align: center;
    min-height: 200px;
}

.error-icon,
.empty-icon {
    font-size: 3rem;
    margin-bottom: 16px;
}

.error-title,
.empty-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 8px;
}

.error-message,
.empty-message {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin: 0 0 24px;
    max-width: 280px;
}

.error-action,
.empty-action {
    padding: 12px 24px;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
}

.error-state .error-icon {
    color: var(--danger);
}
```

---

## Mobile Analytics

Track mobile-specific metrics to understand user behavior and catch issues.

### 18.1 Events to Track

| Event | Properties | Purpose |
|-------|------------|---------|
| `gesture_swipe_complete` | `task_id`, `duration_ms` | Measure swipe adoption |
| `gesture_swipe_delete` | `task_id`, `undone: boolean` | Track undo usage |
| `gesture_long_press` | `task_id` | Action sheet usage |
| `tap_to_schedule_started` | `task_id` | Scheduling flow entry |
| `tap_to_schedule_completed` | `task_id`, `time`, `duration` | Scheduling success |
| `tap_to_schedule_cancelled` | `task_id`, `step` | Drop-off analysis |
| `offline_queue_item_added` | `operation_type` | Offline usage |
| `offline_sync_completed` | `items_synced`, `conflicts` | Sync health |
| `pwa_installed` | `platform` | Install tracking |
| `app_resumed` | `background_duration_ms` | Lifecycle tracking |
| `error_displayed` | `error_type`, `page` | Error monitoring |

### 18.2 Implementation

```javascript
// static/js/mobile-analytics.js
const MobileAnalytics = {
    track(event, properties = {}) {
        // Add common mobile context
        const context = {
            ...properties,
            platform: this.getPlatform(),
            is_pwa: window.matchMedia('(display-mode: standalone)').matches,
            is_offline: !navigator.onLine,
            viewport_width: window.innerWidth,
            viewport_height: window.innerHeight,
            touch_device: DeviceCapabilities.prefersTouch
        };

        // Send to your analytics service
        // Example: Plausible, PostHog, Mixpanel, etc.
        if (window.plausible) {
            window.plausible(event, { props: context });
        }

        // Also log to console in development
        if (window.WHENDOIST?.debug) {
            console.log('📊 Analytics:', event, context);
        }
    },

    getPlatform() {
        const ua = navigator.userAgent;
        if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
        if (/Android/.test(ua)) return 'android';
        return 'other';
    },

    // Convenience methods
    trackGesture(type, taskId, extra = {}) {
        this.track(`gesture_${type}`, { task_id: taskId, ...extra });
    },

    trackSchedule(action, taskId, extra = {}) {
        this.track(`tap_to_schedule_${action}`, { task_id: taskId, ...extra });
    },

    trackOffline(action, extra = {}) {
        this.track(`offline_${action}`, extra);
    },

    trackError(type, page, extra = {}) {
        this.track('error_displayed', { error_type: type, page, ...extra });
    }
};
```

### 18.3 Dashboards to Create

| Dashboard | Metrics |
|-----------|---------|
| **Mobile Overview** | Sessions, DAU, session duration, bounce rate (mobile vs desktop) |
| **Gesture Adoption** | Swipe complete %, swipe delete %, long-press usage |
| **Scheduling Flow** | Tap-to-schedule conversion funnel |
| **Offline Health** | Offline queue size, sync success rate, conflict rate |
| **PWA Health** | Install rate, standalone sessions, return rate |
| **Error Rates** | Mobile error rate by type, page, platform |
| **Push Notifications** | Opt-in rate, delivery rate, engagement rate, unsubscribe rate |
| **Real-Time Sync** | SSE connection uptime, sync latency, conflict rate |
| **Deep Links** | Deep link resolution rate, share target usage |

---

## Testing Strategy

### 19.1 Device Matrix

| Category | Devices |
|----------|---------|
| **iOS** | iPhone SE (small), iPhone 14 (standard), iPhone 15 Pro Max (large), iPad |
| **Android** | Pixel 7 (stock), Samsung Galaxy S23 (One UI), budget phone (performance) |
| **Tablets** | iPad Air, Android tablet |
| **Foldables** | Samsung Galaxy Fold, Surface Duo (emulator) |

### 19.2 Test Scenarios

#### Tasks Page
- [ ] Load tasks list with 100+ items
- [ ] Swipe right to complete task (verify haptic)
- [ ] Swipe left to delete task (verify undo toast)
- [ ] Attempt swipe in scrollable area (should scroll, not swipe)
- [ ] Long-press for action sheet (400ms timing)
- [ ] Double-tap opens action sheet (accessibility)
- [ ] Action sheet focus trap works
- [ ] Drag task to calendar
- [ ] Tap-to-schedule flow (full funnel)
- [ ] Switch between Tasks/Schedule tabs
- [ ] FAB creates new task
- [ ] Pull-to-refresh updates list
- [ ] Gesture coachmarks appear on first visit

#### Offline & Sync
- [ ] Offline: view cached tasks
- [ ] Offline: complete task (queued, badge shows)
- [ ] Offline: edit task (queued)
- [ ] Offline: delete task (queued)
- [ ] Return online: sync queued changes
- [ ] Sync conflict: task edited offline + online (last-write-wins)
- [ ] Sync conflict: task deleted on server (graceful handling)
- [ ] Sync status indicator shows pending count
- [ ] Offline indicator bar appears when disconnected

#### Calendar
- [ ] Scroll to current time on load
- [ ] Drag task to specific time slot
- [ ] Tap-to-schedule: select task → schedule tab → tap time → confirm sheet
- [ ] 15-minute precision in tap-to-schedule
- [ ] Duration selector works (15m/30m/1h/2h)
- [ ] Reschedule by dragging scheduled task
- [ ] Delete by dragging to trash
- [ ] Adjacent day hours work correctly
- [ ] Plan My Day flow

#### App Lifecycle
- [ ] Background app for 2 minutes → resume (soft refresh)
- [ ] Background app for 10 minutes → resume (full refresh)
- [ ] Scroll position preserved across background
- [ ] Form drafts preserved across background
- [ ] Session check on resume (re-auth if expired)

#### Accessibility
- [ ] VoiceOver: navigate task list
- [ ] VoiceOver: complete task via rotor actions
- [ ] TalkBack: same tests
- [ ] Reduced motion: animations disabled
- [ ] Screen reader announcements for dynamic changes
- [ ] Focus returns to trigger after sheet closes

#### Cross-cutting
- [ ] iOS: Input zoom doesn't trigger (16px fonts)
- [ ] iOS: Install banner appears (non-standalone)
- [ ] iOS: Safe area padding on notched devices
- [ ] Android: Back button closes sheets
- [ ] Android: Install prompt can be deferred
- [ ] Keyboard appears/disappears correctly
- [ ] Content blurs when app backgrounded (security)
- [ ] Landscape orientation works
- [ ] PWA launches in standalone mode
- [ ] Deep links work

#### Push Notifications (Phase 6)
- [ ] Permission prompt appears at appropriate moment (not first visit)
- [ ] Custom permission UI shows before browser prompt
- [ ] Notification delivered when task due (15 min before)
- [ ] Notification action: Complete task from notification
- [ ] Notification action: Snooze task (+15 min)
- [ ] Tapping notification opens app to correct task
- [ ] Quiet hours respected (no notifications during quiet hours)
- [ ] Daily planning notification at configured time
- [ ] Notification settings in Settings page work

#### Real-Time Sync (Phase 6)
- [ ] SSE connection established on page load
- [ ] Task completed on device A shows on device B immediately
- [ ] Task created on device A appears on device B
- [ ] SSE reconnects after network interruption
- [ ] SSE disconnects when app backgrounded (battery saving)
- [ ] Conflict: offline change + real-time update handled correctly

#### Deep Linking (Phase 7)
- [ ] `/tasks/123` opens specific task dialog
- [ ] `/dashboard?task=123` highlights task in list
- [ ] Deep link works from external app (email, SMS)
- [ ] Deep link works when app not running (cold start)
- [ ] Custom URL scheme `web+whendoist://` works
- [ ] Universal Links verified on iOS
- [ ] App Links verified on Android

#### Share Target (Phase 7)
- [ ] Share URL from browser → creates task with URL in description
- [ ] Share text from another app → creates task with text as title
- [ ] Share from Notes app → task created successfully
- [ ] After share, redirects to dashboard with new task highlighted
- [ ] Share button on task → opens share sheet
- [ ] Copy link works as fallback on non-supporting browsers

#### Progressive Enhancement
- [ ] Task list loads without JavaScript (server-rendered)
- [ ] Complete task works via form POST (no JS)
- [ ] Create task works via form submission (no JS)
- [ ] NoScript message displays when JS disabled
- [ ] Feature detection hides unsupported features gracefully

#### Encryption + Offline
- [ ] Create task offline with encryption enabled (queued)
- [ ] View encrypted tasks offline with key in session
- [ ] View encrypted tasks offline without key (locked placeholder shown)
- [ ] Unlock prompt appears after OS kills app
- [ ] Sync encrypted tasks after coming online
- [ ] Token expiry while offline handled gracefully

#### Cache Versioning
- [ ] App update detected on page load
- [ ] Schema migration runs for breaking changes
- [ ] Cache cleared for non-breaking updates
- [ ] User notified of update completion
- [ ] Stale cache doesn't break functionality

#### Foldable Devices
- [ ] Samsung Fold: unfold shows side-by-side layout
- [ ] Samsung Fold: fold reverts to tabbed layout
- [ ] Surface Duo: spanning both screens works
- [ ] Orientation change during drag doesn't break UI

#### Network Quality
- [ ] Slow connection (2G): animations reduced
- [ ] Data saver mode: images not auto-loaded
- [ ] Network type change: optimizations applied dynamically
- [ ] Fast connection (4G/WiFi): full experience enabled

### 19.3 Performance Budgets

| Metric | Target | Current | Tool |
|--------|--------|---------|------|
| First Contentful Paint | < 1.5s | TBD | Lighthouse |
| Largest Contentful Paint | < 2.5s | TBD | Lighthouse |
| Time to Interactive | < 3.5s | TBD | Lighthouse |
| Total Blocking Time | < 200ms | TBD | Lighthouse |
| Cumulative Layout Shift | < 0.1 | TBD | Lighthouse |
| JS Bundle Size | < 100KB | TBD | Webpack analyzer |
| CSS Size | < 50KB | TBD | Build stats |

### 19.4 Automated Testing

| Test Type | Tool | Coverage |
|-----------|------|----------|
| Unit tests | Vitest/Jest | Gesture handlers, offline queue logic |
| Component tests | Testing Library | Bottom sheet, action sheet |
| E2E (desktop) | Playwright | Full user flows |
| E2E (mobile emulation) | Playwright | Touch gestures, viewport sizes |
| Visual regression | Percy/Chromatic | UI consistency across devices |
| Accessibility | axe-core | WCAG 2.1 AA compliance |

```javascript
// Example Playwright mobile test
test('swipe to complete task on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE

    await page.goto('/dashboard');

    const task = page.locator('.task-item').first();

    // Simulate swipe right
    const box = await task.boundingBox();
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    // Verify completion
    await expect(task).toHaveClass(/completing/);
});
```

---

## Success Metrics

### 20.1 Quantitative Metrics

| Category | Metric | Baseline | Target | Measurement |
|----------|--------|----------|--------|-------------|
| **Engagement** | Mobile session duration | TBD | +20% | Analytics |
| | Tasks completed on mobile | TBD | +30% | Analytics |
| | Mobile DAU/MAU ratio | TBD | +15% | Analytics |
| **Adoption** | PWA installs (total) | 0 | 500+ | Analytics |
| | PWA install rate | 0% | 5% | Installs/visitors |
| | Swipe gesture adoption | 0% | 60% | Analytics events |
| | Tap-to-schedule adoption | 0% | 40% | Analytics events |
| | Push notification opt-in | 0% | 40% | Permission grants |
| | Share target usage | 0 | 100+/week | Analytics events |
| **Quality** | Mobile bounce rate | TBD | -15% | Analytics |
| | Lighthouse mobile score | TBD | > 90 | Lighthouse CI |
| | Mobile error rate | TBD | < 0.5% | Error tracking |
| | Offline sync success rate | N/A | > 95% | Analytics |
| | Real-time sync latency | N/A | < 500ms | SSE metrics |
| | Cache hit rate | N/A | > 80% | SW metrics |
| **Performance** | Mobile FCP | TBD | < 1.5s | Lighthouse |
| | Mobile LCP | TBD | < 2.5s | Lighthouse |
| | Time to Interactive | TBD | < 3.5s | Lighthouse |
| **Notifications** | Reminder delivery rate | N/A | > 95% | Push analytics |
| | Notification engagement | N/A | > 30% | Click-through rate |
| | Unsubscribe rate | N/A | < 5% | Analytics |

### 20.2 Qualitative Metrics

| Signal | Measurement Method |
|--------|-------------------|
| "Feels native" | User interviews, NPS survey |
| No touch target complaints | Support tickets, feedback |
| Gesture discovery | Coachmark dismissal rate |
| Offline confidence | User feedback on sync reliability |
| Scheduling ease | Task funnel completion rate |
| Notification value | "Notifications helpful?" survey |
| Cross-device sync | "Same data everywhere?" survey |

### 20.3 Success Criteria by Phase

| Phase | Success Criteria |
|-------|------------------|
| **Phase 0** | Baseline metrics documented for all targets |
| **Phase 1** | PWA installable, Lighthouse > 80, no desktop regressions, progressive enhancement works |
| **Phase 2** | 30% of mobile users use swipe gestures within 2 weeks |
| **Phase 3** | Offline sync success > 90%, < 5% conflict rate, encrypted data handles offline correctly |
| **Phase 4** | Tap-to-schedule used for 20% of mobile scheduling |
| **Phase 5** | WCAG 2.1 AA compliance, Lighthouse > 90, foldable devices work |
| **Phase 6** | SSE connection stable, push notification opt-in > 20%, reminder delivery > 90% |
| **Phase 7** | Deep links resolve correctly, share target creates valid tasks, app shortcuts work |

---

## Appendix

### A. Breakpoint Quick Reference

```css
/* Phone (portrait) */
@media (max-width: 580px) { }

/* Phone/Small tablet */
@media (max-width: 768px) { }

/* Tablet/Large phone */
@media (max-width: 900px) { }

/* Desktop */
@media (min-width: 901px) { }

/* Landscape phones */
@media (max-height: 500px) and (orientation: landscape) { }

/* Touch devices */
@media (hover: none) and (pointer: coarse) { }

/* High-DPI screens */
@media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) { }
```

### B. CSS Variables for Mobile

```css
:root {
    /* Touch targets */
    --touch-target-min: 44px;
    --touch-target-comfortable: 48px;

    /* Mobile spacing */
    --mobile-padding: 16px;
    --mobile-gap: 12px;

    /* Animation durations (respect reduced motion) */
    --duration-sheet: 300ms;
    --duration-swipe: 200ms;
}

@media (prefers-reduced-motion: reduce) {
    :root {
        --duration-sheet: 0ms;
        --duration-swipe: 0ms;
    }
}
```

### C. Related Files

| File | Purpose |
|------|---------|
| `static/css/wizard.css` | Reference for mobile-first patterns |
| `static/js/wizard.js` | Reference for touch handling |
| `static/manifest.json` | PWA configuration |
| `app/templates/base.html` | Meta tags, safe areas |

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-21 | 3.0 | **Critical gaps addressed:** Added Progressive Enhancement (Section 11) for no-JS fallback. Added Push Notifications (Section 12) with permission UX, quiet hours, and task reminders. Added Platform Extensions (Section 13) covering deep linking, share targets, Web Share API, PWA shortcuts, and foldable device support. Added Real-Time Updates (Section 14) with SSE architecture and conflict resolution. Added Network Resilience (Section 15) covering network quality detection, cache versioning with migrations, offline queue rate limiting, and skeleton screens. Added Encryption + Offline edge cases (Section 10.4) covering key persistence, token expiry, and offline task creation with encryption. Updated Implementation Phases with Phase 6 (Real-Time & Notifications) and Phase 7 (Platform Extensions). Expanded "What's Missing" table with critical gaps. Total plan now covers 21 sections. |
| 2026-01-21 | 2.0 | Major revision: Added gesture conflict resolution, offline sync with conflict handling, app lifecycle management, tap-to-schedule wireframes, accessibility requirements, empty/error states, platform-specific behaviors, security considerations, mobile analytics, Phase 0 measurement, comprehensive testing scenarios. Fixed touch detection patterns throughout (replaced `ontouchstart` checks with proper media queries). |
| 2026-01-21 | 1.0 | Initial plan created |
