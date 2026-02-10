/**
 * Mobile Bottom Sheet Component
 * Provides iOS/Android-style bottom sheets that slide up from the bottom.
 *
 * Features:
 * - Swipe to dismiss
 * - Backdrop tap to close
 * - Snap points (partial, full)
 * - Safe area handling
 * - Focus trapping for accessibility
 */

class BottomSheet {
    constructor(options = {}) {
        this.options = {
            content: options.content || '',
            title: options.title || '',
            showHandle: options.showHandle !== false,
            snapPoints: options.snapPoints || ['auto', 'full'],
            initialSnap: options.initialSnap || 'auto',
            closeOnBackdrop: options.closeOnBackdrop !== false,
            closeOnSwipe: options.closeOnSwipe !== false,
            onOpen: options.onOpen || null,
            onClose: options.onClose || null,
            trapFocus: options.trapFocus !== false
        };

        this.element = null;
        this.backdrop = null;
        this.contentEl = null;
        this.isOpen = false;
        this.currentSnap = this.options.initialSnap;
        this.dragState = null;

        this._create();
    }

    _create() {
        // Create backdrop
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'sheet-backdrop';
        this.backdrop.setAttribute('aria-hidden', 'true');

        // Create sheet
        this.element = document.createElement('div');
        this.element.className = 'bottom-sheet';
        this.element.setAttribute('role', 'dialog');
        this.element.setAttribute('aria-modal', 'true');
        this.element.setAttribute('aria-hidden', 'true');

        let innerHTML = '';

        // Handle for swipe indication
        if (this.options.showHandle) {
            innerHTML += '<div class="sheet-handle"><span class="sheet-handle-bar"></span></div>';
        }

        // Optional title
        if (this.options.title) {
            innerHTML += `<div class="sheet-header"><h3 class="sheet-title">${this.options.title}</h3></div>`;
        }

        // Content area
        innerHTML += `<div class="sheet-content">${this.options.content}</div>`;

        this.element.innerHTML = innerHTML;
        this.contentEl = this.element.querySelector('.sheet-content');

        // Append to body
        document.body.appendChild(this.backdrop);
        document.body.appendChild(this.element);

        // Event listeners
        this._attachEvents();
    }

    _attachEvents() {
        // Backdrop click
        if (this.options.closeOnBackdrop) {
            this.backdrop.addEventListener('click', () => this.close());
        }

        // Swipe to dismiss
        if (this.options.closeOnSwipe) {
            this._attachSwipe();
        }

        // Escape key
        this._escHandler = (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        };
        document.addEventListener('keydown', this._escHandler);
    }

    _attachSwipe() {
        const handle = this.element.querySelector('.sheet-handle') || this.element;

        let startY = 0;
        let currentY = 0;
        let startHeight = 0;

        handle.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            startHeight = this.element.offsetHeight;
            this.element.style.transition = 'none';
            this.dragState = 'active';
        }, { passive: true });

        handle.addEventListener('touchmove', (e) => {
            if (this.dragState !== 'active') return;

            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;

            // Only allow dragging down (positive deltaY)
            if (deltaY > 0) {
                this.element.style.transform = `translateY(${deltaY}px)`;
                // Fade backdrop as sheet is dragged
                const progress = Math.min(deltaY / 200, 1);
                this.backdrop.style.opacity = 1 - progress;
            }
        }, { passive: true });

        handle.addEventListener('touchend', () => {
            if (this.dragState !== 'active') return;
            this.dragState = null;

            const deltaY = currentY - startY;
            this.element.style.transition = '';

            // If dragged more than 100px or more than 30% of height, close
            if (deltaY > 100 || deltaY > startHeight * 0.3) {
                this.close();
            } else {
                // Snap back
                this.element.style.transform = '';
                this.backdrop.style.opacity = '';
            }
        }, { passive: true });
    }

    open() {
        if (this.isOpen) return;
        this.isOpen = true;

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
        document.body.classList.add('sheet-open');

        // Show elements
        this.backdrop.classList.add('visible');
        this.element.classList.add('visible');
        this.element.setAttribute('aria-hidden', 'false');
        this.backdrop.setAttribute('aria-hidden', 'false');

        // Haptic feedback
        if (window.HapticEngine) {
            window.HapticEngine.trigger('light');
        }

        // Focus first focusable element
        if (this.options.trapFocus) {
            requestAnimationFrame(() => {
                const focusable = this.element.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (focusable) focusable.focus();
            });
        }

        // Callback
        if (this.options.onOpen) {
            this.options.onOpen(this);
        }
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;

        // Hide elements with animation
        this.backdrop.classList.remove('visible');
        this.element.classList.remove('visible');
        this.element.setAttribute('aria-hidden', 'true');
        this.backdrop.setAttribute('aria-hidden', 'true');

        // Restore body scroll after animation
        setTimeout(() => {
            if (!document.querySelector('.bottom-sheet.visible')) {
                document.body.style.overflow = '';
                document.body.classList.remove('sheet-open');
            }
        }, 300);

        // Callback
        if (this.options.onClose) {
            this.options.onClose(this);
        }
    }

    destroy() {
        this.close();
        document.removeEventListener('keydown', this._escHandler);
        this.element.remove();
        this.backdrop.remove();
    }

    setContent(content) {
        this.contentEl.innerHTML = content;
    }

    // Static factory method
    static open(content, options = {}) {
        const sheet = new BottomSheet({ ...options, content });
        sheet.open();
        return sheet;
    }
}

/**
 * Task Action Sheet
 * Specialized bottom sheet for task actions (edit, complete, schedule, delete)
 */
class TaskActionSheet {
    constructor() {
        this.sheet = null;
        this.currentTask = null;
        this._create();
    }

    _create() {
        const content = `
            <div class="sheet-header">
                <span class="sheet-task-title"></span>
            </div>
            <div class="action-sheet-actions">
                <button class="sheet-action" data-action="edit">
                    <span class="action-icon">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </span>
                    <span class="action-label">Edit</span>
                </button>
                <button class="sheet-action" data-action="complete">
                    <span class="action-icon">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </span>
                    <span class="action-label">Complete</span>
                </button>
                <button class="sheet-action" data-action="schedule">
                    <span class="action-icon">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                    </span>
                    <span class="action-label">Schedule</span>
                </button>
                <button class="sheet-action sheet-action--skip" data-action="skip" hidden>
                    <span class="action-icon">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="5 4 15 12 5 20 5 4"/>
                            <line x1="19" y1="5" x2="19" y2="19"/>
                        </svg>
                    </span>
                    <span class="action-label">Skip instance</span>
                </button>
                <button class="sheet-action sheet-action--danger" data-action="delete">
                    <span class="action-icon">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </span>
                    <span class="action-label">Delete</span>
                </button>
            </div>
            <button class="sheet-cancel">Cancel</button>
        `;

        this.sheet = new BottomSheet({
            content,
            showHandle: true,
            onClose: () => {
                this.currentTask = null;
            }
        });

        // Event listeners for actions
        this.sheet.element.querySelector('.sheet-cancel').addEventListener('click', () => {
            this.close();
        });

        this.sheet.element.querySelectorAll('.sheet-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this._handleAction(e.currentTarget.dataset.action);
            });
        });
    }

    open(taskElement) {
        this.currentTask = taskElement;
        const title = taskElement.querySelector('.task-text')?.textContent ||
                      taskElement.dataset.taskTitle || 'Task';
        this.sheet.element.querySelector('.sheet-task-title').textContent = title;

        // Check if task is already completed
        const isCompleted = taskElement.classList.contains('completed-today') ||
                           taskElement.classList.contains('completed-older');
        const completeBtn = this.sheet.element.querySelector('[data-action="complete"]');
        if (completeBtn) {
            completeBtn.querySelector('.action-label').textContent = isCompleted ? 'Uncomplete' : 'Complete';
        }

        // Show skip button only for recurring task instances
        const skipBtn = this.sheet.element.querySelector('[data-action="skip"]');
        if (skipBtn) {
            const instanceId = taskElement.dataset.instanceId;
            skipBtn.hidden = !instanceId;
        }

        this.sheet.open();
    }

    close() {
        this.sheet.close();
    }

    _handleAction(action) {
        if (!this.currentTask) return;

        const taskId = this.currentTask.dataset.taskId;

        switch (action) {
            case 'edit':
                // Trigger task dialog
                if (window.TaskDialog) {
                    window.TaskDialog.open(taskId);
                }
                break;

            case 'complete':
                // Toggle completion
                if (window.TaskComplete && window.TaskComplete.toggle) {
                    var instanceId = this.currentTask.dataset.instanceId || null;
                    var isCompleted = this.currentTask.dataset.completed === '1';
                    var isRecurring = this.currentTask.dataset.isRecurring === 'true';
                    window.TaskComplete.toggle(this.currentTask, taskId, instanceId, \!isCompleted, isRecurring);
                }
                break;

            case 'schedule':
                // Switch to schedule view
                const scheduleTab = document.querySelector('.mobile-tab[data-view="schedule"]');
                if (scheduleTab) {
                    scheduleTab.click();
                    // Highlight task for scheduling
                    this.currentTask.classList.add('scheduling');
                }
                break;

            case 'skip':
                this._skipInstance(taskId);
                break;

            case 'delete':
                this._deleteTask(taskId);
                break;
        }

        this.close();
    }

    async _skipInstance(taskId) {
        // Check network status before optimistic update
        if (typeof isNetworkOnline === 'function' && !isNetworkOnline()) {
            if (window.Toast && typeof Toast.warning === 'function') {
                Toast.warning("You're offline — changes won't be saved until you reconnect.");
            }
            return;
        }

        const instanceId = this.currentTask?.dataset.instanceId;
        if (!instanceId) return;

        const taskEl = this.currentTask;

        // Optimistic UI update
        taskEl.classList.add('skipped');
        taskEl.dataset.completed = '1';

        try {
            await safeFetch(`/api/v1/instances/${instanceId}/skip`, {
                method: 'POST',
            });

            // Sync across all representations of this instance
            document.querySelectorAll(`[data-instance-id="${instanceId}"]`).forEach(el => {
                el.classList.add('skipped');
                el.dataset.completed = '1';
            });

            if (window.Toast) {
                Toast.success('Skipped for today');
            }
        } catch (err) {
            // Revert optimistic update
            taskEl.classList.remove('skipped');
            taskEl.dataset.completed = '0';
            handleError(err, 'Failed to skip instance', {
                component: 'mobile-sheet',
                action: 'skipInstance'
            });
        }
    }

    async _deleteTask(taskId) {
        const taskTitle = this.currentTask.querySelector('.task-text')?.textContent || 'Task';

        // Check for subtasks and confirm cascade delete
        const subtaskCount = parseInt(this.currentTask.dataset.subtaskCount || '0', 10);
        if (subtaskCount > 0) {
            const confirmed = confirm(
                `This task has ${subtaskCount} subtask${subtaskCount > 1 ? 's' : ''}. Deleting it will also delete all subtasks. Continue?`
            );
            if (!confirmed) return;
        }

        // Haptic warning
        if (window.HapticEngine) {
            window.HapticEngine.trigger('warning');
        }

        try {
            await safeFetch(`/api/v1/tasks/${taskId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
            });

            // Remove from DOM
            this.currentTask.remove();

            if (window.Toast) {
                Toast.info(`Deleted "${taskTitle}"`, { duration: 5000 });
            }
        } catch (err) {
            handleError(err, 'Failed to delete task', {
                component: 'mobile-sheet',
                action: 'deleteTask'
            });
        }
    }
}

// Global instance
let taskActionSheet = null;

function getTaskActionSheet() {
    if (!taskActionSheet) {
        taskActionSheet = new TaskActionSheet();
    }
    return taskActionSheet;
}

// Export
window.BottomSheet = BottomSheet;
window.TaskActionSheet = TaskActionSheet;
window.getTaskActionSheet = getTaskActionSheet;
