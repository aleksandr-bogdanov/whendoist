/**
 * Toast Notification System
 *
 * Provides typed toast notifications with queuing, actions, and backward compatibility.
 * Supports success, error, warning, and info toasts with customizable durations and actions.
 *
 * New API:
 *   Toast.show(message, { type, action, duration, id })
 *   Toast.success(message, options)
 *   Toast.error(message, options)
 *   Toast.warning(message, options)
 *   Toast.info(message, options)
 *
 * Backward compatible with legacy API:
 *   Toast.show(message, { showUndo, onUndo })
 *   Toast.show(message, 'error')  // type as string
 *   Toast.show(message, 'info', { duration: 5000 })  // 3-arg pattern
 *
 * @module Toast
 */
const Toast = (function() {
    'use strict';

    // ========================================================================
    // Constants
    // ========================================================================

    const ICONS = {
        success: '✓',
        error: '!',
        warning: '⚠',
        info: 'i'
    };

    const DURATIONS = {
        success: { default: 3000, withAction: 2500 },
        info: { default: 4000, withAction: 8000 },
        warning: { default: 5000, withAction: 8000 },
        error: { default: 6000, withAction: null }  // persistent with action
    };

    const PRIORITY = {
        error: 4,
        warning: 3,
        info: 2,
        success: 1
    };

    const MAX_QUEUE_SIZE = 5;

    // ========================================================================
    // State
    // ========================================================================

    let container = null;
    let queue = [];
    let currentToast = null;
    let dismissTimeout = null;

    // ========================================================================
    // Initialization
    // ========================================================================

    /**
     * Initialize the toast container.
     */
    function init() {
        if (container) return;

        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    // ========================================================================
    // Queue Management
    // ========================================================================

    /**
     * Add a toast to the queue and process it.
     * @param {Object} toast - Toast configuration
     */
    function enqueue(toast) {
        init();

        // Check for duplicate ID and update in-place if found
        if (toast.id && currentToast && currentToast.id === toast.id) {
            updateCurrentToast(toast);
            return;
        }

        // Check if same ID is in queue
        const queueIndex = queue.findIndex(t => t.id && t.id === toast.id);
        if (queueIndex !== -1) {
            queue[queueIndex] = toast;
            return;
        }

        // Priority queue: errors jump to front
        if (toast.type === 'error' && queue.length > 0) {
            queue.unshift(toast);
        } else {
            queue.push(toast);
        }

        // Enforce max queue size (drop oldest non-errors)
        if (queue.length > MAX_QUEUE_SIZE) {
            const nonErrorIndex = queue.findIndex(t => t.type !== 'error');
            if (nonErrorIndex !== -1) {
                queue.splice(nonErrorIndex, 1);
            }
        }

        // Process queue if nothing is showing
        if (!currentToast) {
            processQueue();
        }
    }

    /**
     * Process the next toast in the queue.
     */
    function processQueue() {
        if (queue.length === 0) {
            currentToast = null;
            return;
        }

        const toast = queue.shift();
        currentToast = toast;
        displayToast(toast);
    }

    /**
     * Update the currently displayed toast.
     * @param {Object} toast - New toast configuration
     */
    function updateCurrentToast(toast) {
        if (!currentToast) return;

        // Update message and type
        const toastEl = container.querySelector('.toast');
        if (!toastEl) return;

        const messageEl = toastEl.querySelector('.toast-message');
        const iconEl = toastEl.querySelector('.toast-icon');

        if (messageEl) messageEl.textContent = toast.message;
        if (iconEl) iconEl.textContent = ICONS[toast.type] || ICONS.info;

        // Update type class
        toastEl.className = `toast visible toast-${toast.type}`;

        // Reset auto-dismiss timer
        if (dismissTimeout) {
            clearTimeout(dismissTimeout);
            dismissTimeout = null;
        }

        const duration = getDuration(toast);
        if (duration) {
            dismissTimeout = setTimeout(() => hide(), duration);
        }

        // Update current toast state
        currentToast = toast;
    }

    // ========================================================================
    // Display & Dismiss
    // ========================================================================

    /**
     * Display a toast notification.
     * @param {Object} toast - Toast configuration
     */
    function displayToast(toast) {
        const toastEl = createToastElement(toast);
        container.innerHTML = '';
        container.appendChild(toastEl);

        // Trigger reflow for animation
        void toastEl.offsetWidth;
        toastEl.classList.add('visible');

        // Auto-dismiss
        const duration = getDuration(toast);
        if (duration) {
            dismissTimeout = setTimeout(() => hide(), duration);
        }
    }

    /**
     * Create a toast DOM element.
     * @param {Object} toast - Toast configuration
     * @returns {HTMLElement} Toast element
     */
    function createToastElement(toast) {
        const toastEl = document.createElement('div');
        toastEl.className = `toast toast-${toast.type}`;
        toastEl.setAttribute('role', 'status');
        toastEl.setAttribute('aria-live', toast.type === 'error' ? 'assertive' : 'polite');

        const icon = document.createElement('span');
        icon.className = 'toast-icon';
        icon.textContent = ICONS[toast.type] || ICONS.info;

        const message = document.createElement('span');
        message.className = 'toast-message';
        message.textContent = toast.message;

        const actions = document.createElement('div');
        actions.className = 'toast-actions';

        // Action button (if provided)
        if (toast.action) {
            const actionBtn = document.createElement('button');
            actionBtn.type = 'button';
            actionBtn.className = 'toast-action';
            actionBtn.textContent = toast.action.label;
            actionBtn.addEventListener('click', () => {
                if (toast.action.callback) {
                    toast.action.callback();
                }
                hide();
            });
            actions.appendChild(actionBtn);
        }

        // Dismiss button
        const dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.className = 'toast-dismiss';
        dismissBtn.setAttribute('aria-label', 'Dismiss');
        dismissBtn.textContent = '✕';
        dismissBtn.addEventListener('click', hide);
        actions.appendChild(dismissBtn);

        toastEl.appendChild(icon);
        toastEl.appendChild(message);
        toastEl.appendChild(actions);

        return toastEl;
    }

    /**
     * Get duration for a toast based on type and action.
     * @param {Object} toast - Toast configuration
     * @returns {number|null} Duration in ms, or null for persistent
     */
    function getDuration(toast) {
        if (toast.duration === 'persistent') return null;
        if (typeof toast.duration === 'number') return toast.duration;

        const durations = DURATIONS[toast.type] || DURATIONS.info;
        return toast.action ? durations.withAction : durations.default;
    }

    /**
     * Hide the current toast.
     */
    function hide() {
        const toastEl = container?.querySelector('.toast.visible');
        if (!toastEl) return;

        // Clear timeout
        if (dismissTimeout) {
            clearTimeout(dismissTimeout);
            dismissTimeout = null;
        }

        // Exit animation
        toastEl.classList.remove('visible');
        toastEl.classList.add('is-exiting');

        // Remove after animation
        setTimeout(() => {
            if (toastEl.parentNode) {
                toastEl.parentNode.removeChild(toastEl);
            }
            processQueue();
        }, 200);
    }

    /**
     * Clear all toasts (current + queue).
     */
    function clear() {
        queue = [];
        hide();
    }

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Show a toast notification.
     * @param {string} message - The message to display
     * @param {Object|string} typeOrOptions - Type string or options object (backward compat)
     * @param {Object} legacyOptions - Legacy 3-arg pattern options
     */
    function show(message, typeOrOptions, legacyOptions) {
        let options = {};

        // Backward compatibility handling
        if (typeof typeOrOptions === 'string') {
            // 2-arg: Toast.show(msg, 'error')
            // 3-arg: Toast.show(msg, 'error', { duration: 5000 })
            options = { ...legacyOptions, type: typeOrOptions };
        } else if (typeOrOptions && typeof typeOrOptions === 'object') {
            // Standard options object
            options = typeOrOptions;
        }

        // Legacy onUndo → action conversion
        if (options.onUndo) {
            options.action = {
                label: 'Undo',
                callback: options.onUndo
            };
            delete options.onUndo;
        }

        // Build toast config
        const toast = {
            id: options.id || null,
            message: message,
            type: options.type || 'success',
            action: options.action || null,
            duration: options.duration !== undefined ? options.duration : undefined
        };

        enqueue(toast);
    }

    /**
     * Show a success toast.
     * @param {string} message - The message to display
     * @param {Object} options - Options
     */
    function success(message, options = {}) {
        show(message, { ...options, type: 'success' });
    }

    /**
     * Show an error toast.
     * @param {string} message - The message to display
     * @param {Object} options - Options
     */
    function error(message, options = {}) {
        show(message, { ...options, type: 'error' });
    }

    /**
     * Show a warning toast.
     * @param {string} message - The message to display
     * @param {Object} options - Options
     */
    function warning(message, options = {}) {
        show(message, { ...options, type: 'warning' });
    }

    /**
     * Show an info toast.
     * @param {string} message - The message to display
     * @param {Object} options - Options
     */
    function info(message, options = {}) {
        show(message, { ...options, type: 'info' });
    }

    // ========================================================================
    // Exports
    // ========================================================================

    return {
        show,
        hide,
        clear,
        success,
        error,
        warning,
        info
    };
})();

// Make it globally available
window.Toast = Toast;
