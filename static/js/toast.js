/**
 * Toast Notification Module
 *
 * Provides toast notifications with optional undo functionality.
 * Used for task deletion feedback with ability to restore.
 *
 * @module Toast
 */
const Toast = (function() {
    'use strict';

    let container = null;
    let currentToast = null;
    let undoCallback = null;
    let dismissTimeout = null;

    const DISMISS_DELAY = 5000; // 5 seconds

    /**
     * Initialize the toast container.
     */
    function init() {
        if (container) return;

        container = document.createElement('div');
        container.className = 'toast-container';
        container.innerHTML = `
            <div class="toast" id="toast">
                <span class="toast-message"></span>
                <div class="toast-actions">
                    <button type="button" class="toast-undo">Undo</button>
                    <button type="button" class="toast-dismiss">✕</button>
                </div>
            </div>
        `;
        document.body.appendChild(container);

        currentToast = container.querySelector('.toast');

        // Event listeners
        container.querySelector('.toast-undo').addEventListener('click', handleUndo);
        container.querySelector('.toast-dismiss').addEventListener('click', hide);
    }

    /**
     * Show a toast notification.
     * @param {string} message - The message to display
     * @param {Object} options - Options object
     * @param {Function} options.onUndo - Callback when undo is clicked
     * @param {boolean} options.showUndo - Whether to show undo button (default: true)
     */
    function show(message, options = {}) {
        init();

        // Clear any existing timeout
        if (dismissTimeout) {
            clearTimeout(dismissTimeout);
        }

        const messageEl = container.querySelector('.toast-message');
        const undoBtn = container.querySelector('.toast-undo');

        messageEl.textContent = message;
        undoCallback = options.onUndo || null;

        // Show/hide undo button
        if (options.showUndo !== false && undoCallback) {
            undoBtn.style.display = '';  // Let CSS handle display (inline-flex)
        } else {
            undoBtn.style.display = 'none';
        }

        // Show toast
        currentToast.classList.add('visible');

        // Auto-dismiss after delay
        dismissTimeout = setTimeout(hide, DISMISS_DELAY);
    }

    /**
     * Hide the toast notification.
     */
    function hide() {
        if (!currentToast) return;

        currentToast.classList.remove('visible');
        undoCallback = null;

        if (dismissTimeout) {
            clearTimeout(dismissTimeout);
            dismissTimeout = null;
        }
    }

    /**
     * Handle undo button click.
     */
    function handleUndo() {
        if (undoCallback) {
            undoCallback();
        }
        hide();
    }

    return {
        show,
        hide
    };
})();

// Make it globally available
window.Toast = Toast;
