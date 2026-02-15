/**
 * Toast Notification System
 *
 * Provides typed toast notifications with stacking, actions, and backward compatibility.
 * Multiple toasts render simultaneously (max 3 visible), each with independent lifecycle.
 *
 * New API:
 *   Toast.show(message, { type, action, duration, id })
 *   Toast.undo(message, callback)
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
        success: { default: 3000, withAction: 5000 },
        info: { default: 4000, withAction: 8000 },
        warning: { default: 5000, withAction: 8000 },
        error: { default: 6000, withAction: null }  // persistent with action
    };

    const MAX_VISIBLE = 3;
    const UNDO_DURATION = 5000;

    // ========================================================================
    // State
    // ========================================================================

    let container = null;
    /** @type {Array<{id: string|null, element: HTMLElement, timeout: number|null, config: Object}>} */
    let activeToasts = [];
    let toastIdCounter = 0;

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
    // Display & Dismiss
    // ========================================================================

    /**
     * Display a toast notification. Stacks with existing toasts.
     * @param {Object} toast - Toast configuration
     */
    function displayToast(toast) {
        init();

        // Dedup by id: if same ID exists in activeToasts, update in place
        if (toast.id) {
            var existing = activeToasts.find(function(entry) {
                return entry.id === toast.id;
            });
            if (existing) {
                updateToast(existing, toast);
                return;
            }
        }

        // Cap at MAX_VISIBLE: dismiss oldest when limit reached
        if (activeToasts.length >= MAX_VISIBLE) {
            dismissToast(activeToasts[0]);
        }

        var internalId = '__toast_' + (++toastIdCounter);
        var entry = {
            id: toast.id || null,
            internalId: internalId,
            element: null,
            timeout: null,
            config: toast
        };

        var toastEl = createToastElement(toast, function() {
            dismissToast(entry);
        });
        entry.element = toastEl;
        container.appendChild(toastEl);

        // Trigger reflow for animation
        void toastEl.offsetWidth;
        toastEl.classList.add('visible');

        // Auto-dismiss
        var duration = getDuration(toast);
        if (duration) {
            entry.timeout = setTimeout(function() {
                dismissToast(entry);
            }, duration);
        }

        activeToasts.push(entry);
    }

    /**
     * Update an existing toast entry in place.
     * @param {Object} entry - Active toast entry
     * @param {Object} newConfig - New toast configuration
     */
    function updateToast(entry, newConfig) {
        var toastEl = entry.element;
        if (!toastEl) return;

        var messageEl = toastEl.querySelector('.toast-message');
        var iconEl = toastEl.querySelector('.toast-icon');

        if (messageEl) messageEl.textContent = newConfig.message;
        if (iconEl) iconEl.textContent = ICONS[newConfig.type] || ICONS.info;

        // Update type class
        toastEl.className = 'toast visible toast-' + newConfig.type;

        // Reset auto-dismiss timer
        if (entry.timeout) {
            clearTimeout(entry.timeout);
            entry.timeout = null;
        }

        var duration = getDuration(newConfig);
        if (duration) {
            entry.timeout = setTimeout(function() {
                dismissToast(entry);
            }, duration);
        }

        entry.config = newConfig;
    }

    /**
     * Create a toast DOM element.
     * @param {Object} toast - Toast configuration
     * @param {Function} dismissFn - Per-toast dismiss function
     * @returns {HTMLElement} Toast element
     */
    function createToastElement(toast, dismissFn) {
        var toastEl = document.createElement('div');
        toastEl.className = 'toast toast-' + toast.type;
        toastEl.setAttribute('role', 'status');
        toastEl.setAttribute('aria-live', toast.type === 'error' ? 'assertive' : 'polite');

        var icon = document.createElement('span');
        icon.className = 'toast-icon';
        icon.textContent = ICONS[toast.type] || ICONS.info;

        var message = document.createElement('span');
        message.className = 'toast-message';
        message.textContent = toast.message;

        var actions = document.createElement('div');
        actions.className = 'toast-actions';

        // Action button (if provided)
        if (toast.action) {
            var actionBtn = document.createElement('button');
            actionBtn.type = 'button';
            actionBtn.className = 'toast-action';
            actionBtn.textContent = toast.action.label;
            actionBtn.addEventListener('click', function() {
                if (toast.action.callback) {
                    toast.action.callback();
                }
                dismissFn();
            });
            actions.appendChild(actionBtn);
        }

        // Dismiss button
        var dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.className = 'toast-dismiss';
        dismissBtn.setAttribute('aria-label', 'Dismiss');
        dismissBtn.textContent = '✕';
        dismissBtn.addEventListener('click', dismissFn);
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

        var durations = DURATIONS[toast.type] || DURATIONS.info;
        return toast.action ? durations.withAction : durations.default;
    }

    /**
     * Dismiss a specific toast entry.
     * @param {Object} entry - The toast entry to dismiss
     */
    function dismissToast(entry) {
        if (!entry || !entry.element) return;

        // Remove from active list
        var idx = activeToasts.indexOf(entry);
        if (idx === -1) return; // Already dismissed
        activeToasts.splice(idx, 1);

        // Clear timeout
        if (entry.timeout) {
            clearTimeout(entry.timeout);
            entry.timeout = null;
        }

        var toastEl = entry.element;
        entry.element = null; // Prevent double-dismiss

        // Exit animation
        toastEl.classList.remove('visible');
        toastEl.classList.add('is-exiting');

        // Remove after animation
        setTimeout(function() {
            if (toastEl.parentNode) {
                toastEl.parentNode.removeChild(toastEl);
            }
        }, 200);
    }

    /**
     * Hide the most recent toast (backward compat for callers using Toast.hide()).
     */
    function hide() {
        if (activeToasts.length === 0) return;
        dismissToast(activeToasts[activeToasts.length - 1]);
    }

    /**
     * Clear all active toasts.
     */
    function clear() {
        // Dismiss all in reverse order (newest first)
        var toasts = activeToasts.slice();
        for (var i = toasts.length - 1; i >= 0; i--) {
            dismissToast(toasts[i]);
        }
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
        var options = {};

        // Backward compatibility handling
        if (typeof typeOrOptions === 'string') {
            // 2-arg: Toast.show(msg, 'error')
            // 3-arg: Toast.show(msg, 'error', { duration: 5000 })
            options = Object.assign({}, legacyOptions, { type: typeOrOptions });
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
        var toast = {
            id: options.id || null,
            message: message,
            type: options.type || 'success',
            action: options.action || null,
            duration: options.duration !== undefined ? options.duration : undefined
        };

        displayToast(toast);
    }

    /**
     * Show a success toast.
     * @param {string} message - The message to display
     * @param {Object} options - Options
     */
    function success(message, options) {
        options = options || {};
        show(message, Object.assign({}, options, { type: 'success' }));
    }

    /**
     * Show an error toast.
     * @param {string} message - The message to display
     * @param {Object} options - Options
     */
    function error(message, options) {
        options = options || {};
        show(message, Object.assign({}, options, { type: 'error' }));
    }

    /**
     * Show a warning toast.
     * @param {string} message - The message to display
     * @param {Object} options - Options
     */
    function warning(message, options) {
        options = options || {};
        show(message, Object.assign({}, options, { type: 'warning' }));
    }

    /**
     * Show an info toast.
     * @param {string} message - The message to display
     * @param {Object} options - Options
     */
    function info(message, options) {
        options = options || {};
        show(message, Object.assign({}, options, { type: 'info' }));
    }

    /**
     * Show an undo toast with standardized duration.
     * @param {string} message - The message to display
     * @param {Function} callback - The undo callback
     */
    function undo(message, callback) {
        show(message, {
            type: 'success',
            action: { label: 'Undo', callback: callback },
            duration: UNDO_DURATION
        });
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
        info,
        undo
    };
})();

// Make it globally available
window.Toast = Toast;
