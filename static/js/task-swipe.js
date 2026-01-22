/**
 * Task Swipe Handler
 * Enables swipe-to-complete and swipe-to-delete gestures on task items.
 *
 * Gestures:
 * - Swipe right: Complete task
 * - Swipe left: Delete task (with undo)
 *
 * Features:
 * - Conflict resolution with scroll
 * - Visual feedback during swipe
 * - Haptic feedback
 * - Undo for destructive actions
 */

class SwipeGestureHandler {
    constructor(options = {}) {
        this.threshold = options.threshold || 100;
        this.velocityThreshold = options.velocityThreshold || 0.5;
        this.maxSwipe = options.maxSwipe || 120;
        this.swipeDisabled = false;
        this.isVerticalScroll = false;
        this.startX = 0;
        this.startY = 0;
        this.startTime = 0;
    }

    onTouchStart(e, element) {
        // CRITICAL: Ignore multi-touch (pinch-to-zoom)
        if (e.touches.length > 1) {
            this.swipeDisabled = true;
            return false;
        }

        // Check for swipe-blocking containers
        const noSwipeParent = e.target.closest('[data-no-swipe], .overflow-x-auto, .heatmap-container, .stats-row');
        if (noSwipeParent) {
            this.swipeDisabled = true;
            return false;
        }

        // Check for interactive elements
        if (e.target.closest('button, input, select, a, [role="button"], .task-checkbox')) {
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

        // Cancel if multi-touch detected (pinch-to-zoom)
        if (e.touches.length > 1) {
            this.swipeDisabled = true;
            return { action: 'none' };
        }

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

        // Horizontal swipe detected - only prevent default if significant movement
        if (Math.abs(deltaX) > 10) {
            e.preventDefault();
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
        // Only enable on touch devices
        if (!window.DeviceCapabilities?.prefersTouch && !window.DeviceCapabilities?.hasTouch) {
            return;
        }

        // Attach to existing tasks
        this.attachToAll();

        // Re-attach after HTMX swaps
        document.body.addEventListener('htmx:afterSwap', () => {
            this.attachToAll();
        });

        // Re-attach after DOM changes
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    this.attachToAll();
                    break;
                }
            }
        });

        const taskList = document.querySelector('.task-list-container');
        if (taskList) {
            observer.observe(taskList, { childList: true, subtree: true });
        }
    }

    attachToAll() {
        document.querySelectorAll('.task-item:not([data-swipe-attached])').forEach(task => {
            this.attachSwipe(task);
            task.dataset.swipeAttached = 'true';
        });
    }

    attachSwipe(task) {
        let deltaX = 0;
        let isActive = false;

        // Add swipe indicator elements if not present
        if (!task.querySelector('.swipe-indicator')) {
            const completeIndicator = document.createElement('div');
            completeIndicator.className = 'swipe-indicator swipe-indicator--complete';
            const deleteIndicator = document.createElement('div');
            deleteIndicator.className = 'swipe-indicator swipe-indicator--delete';
            task.appendChild(completeIndicator);
            task.appendChild(deleteIndicator);
        }

        task.addEventListener('touchstart', (e) => {
            if (!this.gestureHandler.onTouchStart(e, task)) return;
            isActive = true;
            task.style.transition = 'none';
            document.body.classList.add('is-swiping');
        }, { passive: true });

        task.addEventListener('touchmove', (e) => {
            if (!isActive) return;

            const result = this.gestureHandler.onTouchMove(e);

            if (result.action === 'swipe') {
                deltaX = result.deltaX;
                task.style.transform = `translateX(${deltaX}px)`;

                // Update visual feedback classes
                task.classList.remove('swiping-left', 'swiping-right', 'swipe-complete', 'swipe-delete');

                if (deltaX > 50) {
                    task.classList.add('swiping-right');
                    if (result.progress >= 1) {
                        task.classList.add('swipe-complete');
                    }
                } else if (deltaX < -50) {
                    task.classList.add('swiping-left');
                    if (result.progress >= 1) {
                        task.classList.add('swipe-delete');
                    }
                }
            }
        }, { passive: false });

        task.addEventListener('touchend', async () => {
            if (!isActive) return;
            isActive = false;

            const result = this.gestureHandler.onTouchEnd(deltaX);
            task.style.transition = 'transform 0.2s ease';
            document.body.classList.remove('is-swiping');

            if (result.action === 'swipe-right') {
                await this.completeTask(task);
            } else if (result.action === 'swipe-left') {
                await this.deleteTask(task);
            }

            // Reset
            task.style.transform = '';
            task.classList.remove('swiping-left', 'swiping-right', 'swipe-complete', 'swipe-delete');
            deltaX = 0;
        }, { passive: true });

        task.addEventListener('touchcancel', () => {
            if (!isActive) return;
            isActive = false;
            task.style.transition = 'transform 0.2s ease';
            task.style.transform = '';
            task.classList.remove('swiping-left', 'swiping-right', 'swipe-complete', 'swipe-delete');
            document.body.classList.remove('is-swiping');
            deltaX = 0;
        }, { passive: true });
    }

    async completeTask(task) {
        const taskId = task.dataset.taskId;
        const isCompleted = task.classList.contains('completed-today') ||
                           task.classList.contains('completed-older');

        // Haptic feedback
        if (window.HapticEngine) {
            window.HapticEngine.trigger('success');
        }

        // Optimistic UI update
        task.classList.add('completing');

        try {
            // Toggle completion
            if (window.TaskComplete) {
                await window.TaskComplete.toggle(taskId, task);
            } else {
                // Fallback to direct API call
                const endpoint = isCompleted
                    ? `/api/v1/tasks/${taskId}/uncomplete`
                    : `/api/v1/tasks/${taskId}/complete`;

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: window.getCSRFHeaders(),
                });

                if (response.ok) {
                    // Reload task list
                    const taskList = document.querySelector('[hx-get*="/dashboard"]');
                    if (taskList && window.htmx) {
                        window.htmx.trigger(taskList, 'refresh');
                    }
                }
            }
        } catch (err) {
            console.error('Failed to complete task:', err);
            task.classList.remove('completing');

            if (window.Toast) {
                window.Toast.show('Failed to complete task', 'error');
            }
        }
    }

    async deleteTask(task) {
        const taskId = task.dataset.taskId;
        const taskTitle = task.querySelector('.task-text')?.textContent || 'Task';

        // Haptic feedback - warning for destructive action
        if (window.HapticEngine) {
            window.HapticEngine.trigger('warning');
        }

        // Store original state for undo
        const originalHTML = task.outerHTML;
        const originalParent = task.parentElement;
        const originalNextSibling = task.nextSibling;

        // Optimistic UI update
        task.classList.add('deleting');
        const originalHeight = task.offsetHeight;
        task.style.height = originalHeight + 'px';

        // Animate out
        requestAnimationFrame(() => {
            task.style.height = '0';
            task.style.opacity = '0';
            task.style.marginBottom = '0';
            task.style.paddingTop = '0';
            task.style.paddingBottom = '0';
        });

        // Show undo toast
        let undone = false;
        if (window.Toast) {
            window.Toast.show(`Deleted "${taskTitle}"`, 'info', {
                duration: 5000,
                action: {
                    label: 'Undo',
                    callback: () => {
                        undone = true;
                        this.undoDelete(task, originalHTML, originalParent, originalNextSibling);
                    }
                }
            });
        }

        // Actually delete after delay (for undo opportunity)
        setTimeout(async () => {
            if (undone) return;

            try {
                const response = await fetch(`/api/v1/tasks/${taskId}`, {
                    method: 'DELETE',
                    headers: window.getCSRFHeaders({ 'Content-Type': 'application/json' }),
                });

                if (response.ok) {
                    task.remove();
                } else {
                    // Restore on failure
                    this.undoDelete(task, originalHTML, originalParent, originalNextSibling);
                    if (window.Toast) {
                        window.Toast.show('Failed to delete task', 'error');
                    }
                }
            } catch (err) {
                console.error('Failed to delete task:', err);
                this.undoDelete(task, originalHTML, originalParent, originalNextSibling);
            }
        }, 5000);
    }

    undoDelete(task, originalHTML, originalParent, originalNextSibling) {
        // Restore the task
        task.classList.remove('deleting');
        task.style.height = '';
        task.style.opacity = '';
        task.style.marginBottom = '';
        task.style.paddingTop = '';
        task.style.paddingBottom = '';

        // If task was removed, re-insert it
        if (!document.body.contains(task) && originalParent) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = originalHTML;
            const restoredTask = tempDiv.firstElementChild;

            if (originalNextSibling) {
                originalParent.insertBefore(restoredTask, originalNextSibling);
            } else {
                originalParent.appendChild(restoredTask);
            }

            // Re-attach swipe handlers
            this.attachSwipe(restoredTask);
            restoredTask.dataset.swipeAttached = 'true';
        }

        if (window.Toast) {
            window.Toast.show('Task restored', 'success');
        }
    }
}

// Long Press Handler for context menu
class LongPressHandler {
    constructor(options = {}) {
        this.duration = options.duration || 400;
        this.onLongPress = options.onLongPress || null;
    }

    attach(element) {
        let timer = null;
        let triggered = false;
        let startX = 0;
        let startY = 0;

        element.addEventListener('touchstart', (e) => {
            triggered = false;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;

            timer = setTimeout(() => {
                triggered = true;

                // Haptic feedback
                if (window.HapticEngine) {
                    window.HapticEngine.trigger('longPress');
                }

                if (this.onLongPress) {
                    this.onLongPress(element, e);
                }
            }, this.duration);
        }, { passive: true });

        element.addEventListener('touchmove', (e) => {
            // Cancel if moved more than 10px
            const deltaX = Math.abs(e.touches[0].clientX - startX);
            const deltaY = Math.abs(e.touches[0].clientY - startY);
            if (deltaX > 10 || deltaY > 10) {
                clearTimeout(timer);
            }
        }, { passive: true });

        element.addEventListener('touchend', (e) => {
            clearTimeout(timer);
            if (triggered) {
                e.preventDefault(); // Prevent click after long-press
            }
        });

        element.addEventListener('touchcancel', () => {
            clearTimeout(timer);
        }, { passive: true });

        // Prevent context menu on touch devices
        element.addEventListener('contextmenu', (e) => {
            if (window.DeviceCapabilities?.prefersTouch) {
                e.preventDefault();
            }
        });
    }
}

// Initialize task swipe handler
let taskSwipeHandler = null;

function initTaskSwipe() {
    if (taskSwipeHandler) return;
    taskSwipeHandler = new TaskSwipeHandler();

    // Also attach long-press handlers for action sheet
    const longPress = new LongPressHandler({
        onLongPress: (element) => {
            const actionSheet = window.getTaskActionSheet?.();
            if (actionSheet) {
                actionSheet.open(element);
            }
        }
    });

    document.querySelectorAll('.task-item').forEach(task => {
        longPress.attach(task);
    });

    // Attach to new tasks
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1 && node.classList?.contains('task-item')) {
                    longPress.attach(node);
                }
            });
        }
    });

    const taskList = document.querySelector('.task-list-container');
    if (taskList) {
        observer.observe(taskList, { childList: true, subtree: true });
    }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTaskSwipe);
} else {
    initTaskSwipe();
}

// Export
window.TaskSwipeHandler = TaskSwipeHandler;
window.SwipeGestureHandler = SwipeGestureHandler;
window.LongPressHandler = LongPressHandler;
