/**
 * Gesture Discovery
 * Progressive disclosure of swipe and long-press gestures on mobile.
 *
 * Three layers:
 * a) First-visit animated swipe hint on the first task row
 * b) Permanent subtle right-edge peek affordance (CSS-only, see mobile.css)
 * c) Long-press tooltip toast shown once after first task tap
 */
(function() {
    'use strict';

    const HINT_SHOWN_KEY = 'gesture-hint-shown';
    const LONGPRESS_HINT_KEY = 'longpress-hint-shown';
    const HINT_DELAY_MS = 1500;
    const TOOLTIP_DISMISS_MS = 4000;

    /**
     * (a) Animated swipe hint on first visit.
     * Animates the first task row right then left, then shows a tooltip.
     */
    function showSwipeHint() {
        if (localStorage.getItem(HINT_SHOWN_KEY)) return;

        // Only on touch devices
        if (!window.DeviceCapabilities?.prefersTouch && !window.DeviceCapabilities?.hasTouch) return;

        const firstTask = document.querySelector('.task-item');
        if (!firstTask) return;

        setTimeout(() => {
            // Mark as shown immediately to prevent double-fire
            localStorage.setItem(HINT_SHOWN_KEY, '1');

            // Apply animation class
            firstTask.classList.add('gesture-hint-active');

            // Show tooltip after animation completes (2.4s)
            setTimeout(() => {
                showHintTooltip(firstTask);
            }, 2500);

            // Remove animation class after it ends
            firstTask.addEventListener('animationend', () => {
                firstTask.classList.remove('gesture-hint-active');
            }, { once: true });
        }, HINT_DELAY_MS);
    }

    /**
     * Show a tooltip below the first task explaining gestures.
     */
    function showHintTooltip(taskEl) {
        const tooltip = document.createElement('div');
        tooltip.className = 'gesture-hint-tooltip';
        tooltip.textContent = 'Swipe right to complete, left to schedule. Long-press for more.';

        // Position below the task
        const rect = taskEl.getBoundingClientRect();
        tooltip.style.top = (rect.bottom + 8) + 'px';
        tooltip.style.left = '16px';
        tooltip.style.right = '16px';

        document.body.appendChild(tooltip);

        // Force reflow then show
        void tooltip.offsetWidth;
        tooltip.classList.add('visible');

        // Dismiss after timeout or on any tap
        const dismiss = () => {
            tooltip.classList.remove('visible');
            setTimeout(() => tooltip.remove(), 200);
            document.removeEventListener('touchstart', dismiss);
        };

        setTimeout(dismiss, TOOLTIP_DISMISS_MS);
        document.addEventListener('touchstart', dismiss, { once: true, passive: true });
    }

    /**
     * (c) Long-press tooltip after first task tap.
     * Listens for the task edit dialog closing, then shows a one-time toast.
     */
    function setupLongPressHint() {
        if (localStorage.getItem(LONGPRESS_HINT_KEY)) return;

        // Only on touch devices
        if (!window.DeviceCapabilities?.prefersTouch && !window.DeviceCapabilities?.hasTouch) return;

        // Listen for task dialog open (click on a task item triggers edit dialog)
        // We detect this by watching for the dialog to close via htmx:afterSwap or a MutationObserver
        const handler = () => {
            if (localStorage.getItem(LONGPRESS_HINT_KEY)) return;
            localStorage.setItem(LONGPRESS_HINT_KEY, '1');

            // Small delay so the dialog close animation finishes
            setTimeout(() => {
                if (window.Toast) {
                    Toast.info('Tip: long-press any task for quick actions', { duration: 4000 });
                }
            }, 500);
        };

        // The task dialog uses htmx — listen for dialog close events
        document.body.addEventListener('task-dialog-closed', handler, { once: true });

        // Fallback: also listen for clicks on task items (the click opens the dialog)
        // Show the hint after a brief delay to let the dialog interaction happen
        const taskClickHandler = (e) => {
            const taskItem = e.target.closest('.task-item');
            if (!taskItem) return;
            if (localStorage.getItem(LONGPRESS_HINT_KEY)) return;

            // Wait for dialog to open and close cycle
            // Use a one-time listener for the next dialog close
            const dialogCloseWatcher = () => {
                localStorage.setItem(LONGPRESS_HINT_KEY, '1');
                document.removeEventListener('click', taskClickHandler);

                setTimeout(() => {
                    if (window.Toast) {
                        Toast.info('Tip: long-press any task for quick actions', { duration: 4000 });
                    }
                }, 500);
            };

            // Watch for the dialog backdrop/close button click
            const dialog = document.querySelector('.task-dialog, [data-task-dialog]');
            if (dialog) {
                // Dialog is already open from this click, wait for it to close
                const observer = new MutationObserver((mutations, obs) => {
                    if (!document.querySelector('.task-dialog, [data-task-dialog]')) {
                        obs.disconnect();
                        dialogCloseWatcher();
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
            } else {
                // Dialog will open shortly — wait for it, then for it to close
                const openObserver = new MutationObserver((mutations, obs) => {
                    const dlg = document.querySelector('.task-dialog, [data-task-dialog]');
                    if (dlg) {
                        obs.disconnect();
                        const closeObserver = new MutationObserver((mutations2, obs2) => {
                            if (!document.querySelector('.task-dialog, [data-task-dialog]')) {
                                obs2.disconnect();
                                dialogCloseWatcher();
                            }
                        });
                        closeObserver.observe(document.body, { childList: true, subtree: true });
                    }
                });
                openObserver.observe(document.body, { childList: true, subtree: true });
            }
        };

        document.addEventListener('click', taskClickHandler);
    }

    /**
     * Initialize gesture discovery on DOM ready.
     */
    function init() {
        showSwipeHint();
        setupLongPressHint();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
