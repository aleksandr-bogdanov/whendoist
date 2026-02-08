/**
 * Keyboard Shortcuts System
 *
 * Centralized keyboard shortcut management with:
 * - Declarative shortcut definitions
 * - Context-aware handlers (global vs page-specific)
 * - Help modal with shortcut reference
 * - Tooltip integration
 *
 * @module Shortcuts
 * @version 0.41.0
 */
(function() {
    'use strict';

    // ==========================================================================
    // Shortcut Registry
    // ==========================================================================

    const shortcuts = {
        // Global shortcuts (work everywhere)
        global: [
            {
                key: '?',
                description: 'Show keyboard shortcuts',
                category: 'Help',
                handler: () => openShortcutHelp()
            },
            {
                key: 'q',
                description: 'Quick add task',
                category: 'Tasks',
                excludeInputs: true,  // Don't trigger when in input field
                handler: () => {
                    if (window.TaskDialog && typeof TaskDialog.open === 'function') {
                        TaskDialog.open();
                    }
                }
            },
            {
                key: 'n',
                description: 'New task (opens editor)',
                category: 'Tasks',
                excludeInputs: true,
                handler: () => {
                    if (window.TaskSheet && typeof TaskSheet.open === 'function') {
                        TaskSheet.open();
                    }
                }
            },
            {
                key: 'Escape',
                description: 'Close dialog/panel',
                category: 'Navigation',
                handler: (e) => {
                    // Let individual modules handle their own Escape logic
                    // This is just for documentation
                }
            }
        ],

        // Page-specific shortcuts (only on certain pages)
        tasks: [
            // Future: j/k for next/prev task
            // Future: c for complete, d for delete, e for edit
        ],

        calendar: [
            // Future: arrow keys for navigation
            // Future: t for today
        ],

        analytics: [
            // Future: date range shortcuts
        ]
    };

    // Current context (determined by page)
    let currentContext = 'global';

    // ==========================================================================
    // Event Handling
    // ==========================================================================

    function handleKeyDown(event) {
        // Determine if we're in an input field
        const inInput = event.target.matches('input, textarea, select, [contenteditable="true"]');

        // Get shortcuts for current context
        const contextShortcuts = [
            ...(shortcuts.global || []),
            ...(shortcuts[currentContext] || [])
        ];

        // Find matching shortcut
        for (const shortcut of contextShortcuts) {
            if (shortcut.key === event.key) {
                // Check if shortcut should be excluded when in input
                if (shortcut.excludeInputs && inInput) {
                    continue;
                }

                // Check for modifier requirements
                if (shortcut.ctrl && !event.ctrlKey) continue;
                if (shortcut.alt && !event.altKey) continue;
                if (shortcut.shift && !event.shiftKey) continue;
                if (shortcut.meta && !event.metaKey) continue;

                // Prevent default browser behavior
                if (shortcut.preventDefault !== false) {
                    event.preventDefault();
                }

                // Execute handler
                if (shortcut.handler) {
                    shortcut.handler(event);
                }

                break;
            }
        }
    }

    // ==========================================================================
    // Help Modal
    // ==========================================================================

    let helpModal = null;

    function openShortcutHelp() {
        if (!helpModal) {
            createHelpModal();
        }

        helpModal.classList.add('visible');
        document.body.style.overflow = 'hidden';
    }

    function closeShortcutHelp() {
        if (!helpModal) return;

        helpModal.classList.remove('visible');
        document.body.style.overflow = '';
    }

    function createHelpModal() {
        helpModal = document.createElement('div');
        helpModal.className = 'shortcut-help-modal';
        helpModal.innerHTML = `
            <div class="shortcut-help-backdrop" onclick="Shortcuts.closeHelp()"></div>
            <div class="shortcut-help-panel">
                <div class="shortcut-help-header">
                    <h2>Keyboard Shortcuts</h2>
                    <button type="button" class="shortcut-help-close" onclick="Shortcuts.closeHelp()" aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div class="shortcut-help-content">
                    ${renderShortcutList()}
                </div>
            </div>
        `;
        document.body.appendChild(helpModal);

        // Close on Escape
        helpModal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeShortcutHelp();
            }
        });
    }

    function renderShortcutList() {
        const allShortcuts = [
            ...(shortcuts.global || []),
            ...(shortcuts[currentContext] || [])
        ];

        // Group by category
        const categories = {};
        for (const shortcut of allShortcuts) {
            const cat = shortcut.category || 'General';
            if (!categories[cat]) {
                categories[cat] = [];
            }
            categories[cat].push(shortcut);
        }

        // Render each category
        let html = '';
        for (const [category, items] of Object.entries(categories)) {
            html += `
                <div class="shortcut-category">
                    <h3 class="shortcut-category-title">${category}</h3>
                    <div class="shortcut-list">
                        ${items.map(renderShortcutRow).join('')}
                    </div>
                </div>
            `;
        }

        return html;
    }

    function renderShortcutRow(shortcut) {
        const keyDisplay = formatKey(shortcut.key, {
            ctrl: shortcut.ctrl,
            alt: shortcut.alt,
            shift: shortcut.shift,
            meta: shortcut.meta
        });

        return `
            <div class="shortcut-row">
                <span class="shortcut-description">${shortcut.description}</span>
                <kbd class="shortcut-key">${keyDisplay}</kbd>
            </div>
        `;
    }

    function formatKey(key, modifiers = {}) {
        const parts = [];

        if (modifiers.ctrl) parts.push('Ctrl');
        if (modifiers.alt) parts.push('Alt');
        if (modifiers.shift) parts.push('Shift');
        if (modifiers.meta) parts.push('⌘');

        // Format special keys
        const keyNames = {
            'Escape': 'Esc',
            'ArrowUp': '↑',
            'ArrowDown': '↓',
            'ArrowLeft': '←',
            'ArrowRight': '→',
            ' ': 'Space'
        };

        parts.push(keyNames[key] || key.toUpperCase());

        return parts.join(' + ');
    }

    // ==========================================================================
    // Context Management
    // ==========================================================================

    function setContext(context) {
        currentContext = context;
    }

    function detectContext() {
        // Auto-detect context from page URL
        const path = window.location.pathname;

        if (path === '/' || path === '/tasks') {
            setContext('tasks');
        } else if (path === '/calendar') {
            setContext('calendar');
        } else if (path === '/analytics') {
            setContext('analytics');
        } else {
            setContext('global');
        }
    }

    // ==========================================================================
    // Tooltip Integration
    // ==========================================================================

    function addShortcutTooltip(element, shortcutKey) {
        const existing = element.getAttribute('title') || '';
        const shortcutText = ` (${formatKey(shortcutKey)})`;

        if (!existing.includes(shortcutText)) {
            element.setAttribute('title', existing + shortcutText);
        }
    }

    // ==========================================================================
    // Initialization
    // ==========================================================================

    function init() {
        // Detect current context
        detectContext();

        // Register global keydown handler
        document.addEventListener('keydown', handleKeyDown);

        // Auto-add tooltips to buttons with shortcuts
        // Example: <button data-shortcut="q">Quick Add</button>
        document.querySelectorAll('[data-shortcut]').forEach(el => {
            const key = el.getAttribute('data-shortcut');
            addShortcutTooltip(el, key);
        });

        // One-time toast for keyboard shortcuts awareness
        if (!localStorage.getItem('shortcuts-toast-shown')) {
            var isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
            if (!isMobile && window.Toast) {
                setTimeout(function() {
                    window.Toast.show('Press ? to view keyboard shortcuts', 'info', {
                        duration: 8000,
                        action: {
                            label: 'Show',
                            callback: function() {
                                openShortcutHelp();
                            }
                        }
                    });
                    localStorage.setItem('shortcuts-toast-shown', '1');
                }, 2000);
            }
        }
    }

    // Initialize on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ==========================================================================
    // Public API
    // ==========================================================================

    window.Shortcuts = {
        register: (context, shortcut) => {
            if (!shortcuts[context]) {
                shortcuts[context] = [];
            }
            shortcuts[context].push(shortcut);
        },
        setContext,
        openHelp: openShortcutHelp,
        closeHelp: closeShortcutHelp,
        addTooltip: addShortcutTooltip
    };

})();
