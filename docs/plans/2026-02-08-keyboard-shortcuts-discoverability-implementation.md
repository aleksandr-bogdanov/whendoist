# Keyboard Shortcuts Discoverability: Implementation Plan

> Implements **Option 7** from [KEYBOARD-SHORTCUTS-DISCOVERABILITY-ASSESSMENT.md](./KEYBOARD-SHORTCUTS-DISCOVERABILITY-ASSESSMENT.md)
> Estimated effort: 3-4 hours

## Table of Contents

1. [Overview](#overview)
2. [Component 1: Footer Hint Bar](#component-1-footer-hint-bar)
3. [Component 2: Tooltip Enhancement](#component-2-tooltip-enhancement)
4. [Component 3: One-Time Toast](#component-3-one-time-toast)
5. [Mobile Considerations](#mobile-considerations)
6. [Accessibility Requirements](#accessibility-requirements)
7. [Dark Mode Support](#dark-mode-support)
8. [Testing Checklist](#testing-checklist)
9. [Edge Cases](#edge-cases)
10. [Files to Modify](#files-to-modify)

---

## Overview

Three components, implemented together in one PR:

| Component | Purpose | Persistence | Desktop | Mobile |
|-----------|---------|-------------|---------|--------|
| Footer hint bar | Teach `?` shortcut exists | Until dismissed | Yes | Hidden |
| Tooltip enhancement | Teach individual shortcuts | Always (hover) | Yes | N/A |
| One-time toast | Initial awareness on first visit | One-time | Yes | Hidden |

---

## Component 1: Footer Hint Bar

A slim bar at the bottom of the page showing "Press ? for keyboard shortcuts" with a dismiss button. Stored in `localStorage` so it never reappears after dismissal.

### HTML (in `base.html`, before closing `</body>`)

Add after the demo pill block, inside the `{% if user %}` context (only for logged-in users):

```html
<!-- Keyboard shortcuts hint (desktop only, dismissible) -->
<div class="shortcuts-hint" id="shortcuts-hint" role="complementary" aria-label="Keyboard shortcuts tip">
    <span class="shortcuts-hint__text">
        <kbd>?</kbd> Keyboard shortcuts
    </span>
    <button type="button"
            class="shortcuts-hint__dismiss"
            id="shortcuts-hint-dismiss"
            aria-label="Dismiss keyboard shortcuts hint">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
    </button>
</div>
<script>
(function() {
    var hint = document.getElementById('shortcuts-hint');
    if (!hint) return;

    // Don't show on mobile (no keyboard) or if already dismissed
    var isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (isMobile || localStorage.getItem('shortcuts-hint-dismissed')) {
        hint.remove();
        return;
    }

    // Show with entrance animation
    hint.classList.add('visible');

    // Dismiss button
    document.getElementById('shortcuts-hint-dismiss').addEventListener('click', function() {
        hint.classList.add('hiding');
        localStorage.setItem('shortcuts-hint-dismissed', '1');
        hint.addEventListener('animationend', function() {
            hint.remove();
        });
    });

    // Also dismiss when user opens shortcuts help (they discovered it)
    document.addEventListener('keydown', function onKey(e) {
        if (e.key === '?' && hint.parentNode) {
            localStorage.setItem('shortcuts-hint-dismissed', '1');
            hint.classList.add('hiding');
            hint.addEventListener('animationend', function() {
                hint.remove();
            });
            document.removeEventListener('keydown', onKey);
        }
    });
})();
</script>
```

### CSS (add to `static/css/components/shortcuts.css`)

```css
/* =============================================================================
   Keyboard Shortcuts Hint Bar
   ============================================================================= */

.shortcuts-hint {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: none;                        /* hidden by default, shown via .visible */
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--surface-2);
    border-top: 1px solid var(--border-color);
    font-size: 0.8125rem;
    color: var(--text-secondary);
    z-index: 100;
}

.shortcuts-hint.visible {
    display: flex;
    animation: hintSlideUp 0.3s ease-out;
}

.shortcuts-hint.hiding {
    animation: hintSlideDown 0.2s ease-in forwards;
}

@keyframes hintSlideUp {
    from { transform: translateY(100%); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
}

@keyframes hintSlideDown {
    from { transform: translateY(0);    opacity: 1; }
    to   { transform: translateY(100%); opacity: 0; }
}

.shortcuts-hint__text {
    display: flex;
    align-items: center;
    gap: 6px;
}

.shortcuts-hint__text kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    background: var(--surface-3, var(--bg-surface));
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-primary);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.shortcuts-hint__dismiss {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: var(--text-muted);
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
    line-height: 0;
}

.shortcuts-hint__dismiss:hover {
    color: var(--text-primary);
    background: var(--surface-3, rgba(0, 0, 0, 0.05));
}

/* Hide on mobile -- keyboard shortcuts not relevant on touch devices */
@media (hover: none) and (pointer: coarse) {
    .shortcuts-hint {
        display: none !important;
    }
}

/* Dark mode */
[data-theme="dark"] .shortcuts-hint {
    background: var(--surface-2);
    border-top-color: var(--border-color-dark, var(--border-color));
}

[data-theme="dark"] .shortcuts-hint__text kbd {
    background: var(--surface-3);
    border-color: var(--border-color-dark, var(--border-color));
}
```

---

## Component 2: Tooltip Enhancement

Add `data-shortcut` attributes to existing interactive elements so that `shortcuts.js` appends shortcut hints to their native tooltips.

### Buttons to Annotate

The `data-shortcut` infrastructure already exists in `shortcuts.js` (lines 274-281, 296-299). It auto-appends `(KEY)` to the element's `title` attribute on init.

#### In `dashboard.html`

Find the quick-add button and new-task button (if they exist as standalone buttons) and add:

```html
<!-- Quick add button -->
<button type="button" ... data-shortcut="q" title="Quick add task">
    ...
</button>

<!-- New task button (if exists) -->
<button type="button" ... data-shortcut="n" title="New task">
    ...
</button>
```

After shortcuts.js runs, these will display as:
- `"Quick add task (Q)"`
- `"New task (N)"`

#### In `base.html`

If there's a help or keyboard icon in the header (Option 4), add:

```html
<button type="button" data-shortcut="?" title="Keyboard shortcuts">
    ...
</button>
```

### Implementation Notes

- The existing `addShortcutTooltip()` function in shortcuts.js handles this automatically
- No new JS code needed -- just add `data-shortcut` and `title` attributes to HTML elements
- The tooltip text format is: `"{existing title} ({KEY})"`
- Works with native browser tooltips (no custom tooltip library needed)

---

## Component 3: One-Time Toast

Use the existing `window.Toast` system to show a one-time notification on first visit after shortcuts are available.

### JS (add to shortcuts.js `init()` function)

```javascript
// Inside the init() function, after the existing tooltip logic:

// One-time toast for keyboard shortcuts awareness
if (!localStorage.getItem('shortcuts-toast-shown')) {
    // Only show on desktop
    var isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (!isMobile && window.Toast) {
        // Slight delay so it doesn't compete with page load
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
```

### Behavior

- Fires once, 2 seconds after page load
- Shows for 8 seconds with a "Show" action button
- Clicking "Show" opens the keyboard shortcuts help modal
- Never shown again (localStorage flag)
- Desktop only (mobile users don't need keyboard shortcut hints)

---

## Mobile Considerations

| Aspect | Behavior |
|--------|----------|
| Footer hint bar | Hidden via CSS media query `(hover: none) and (pointer: coarse)` AND JS check |
| Toast notification | Skipped via JS `matchMedia` check |
| Tooltip enhancement | Native tooltips don't trigger on touch -- no action needed |
| Help modal | Still accessible via Settings > Appearance > "View Shortcuts" |
| Keyboard shortcuts | Only functional with external keyboard (iPad, Bluetooth keyboard) |

**Decision**: Keyboard shortcuts are inherently a desktop feature. All discoverability hints target desktop users. Mobile users who connect external keyboards can still access shortcuts via the `?` key or Settings.

---

## Accessibility Requirements

### Footer Hint Bar

| Requirement | Implementation |
|-------------|----------------|
| Screen reader announcement | `role="complementary"` + `aria-label="Keyboard shortcuts tip"` |
| Dismiss button | `aria-label="Dismiss keyboard shortcuts hint"` |
| Keyboard focusable | Dismiss button is a native `<button>` (auto-focusable) |
| Focus visible | Uses existing `:focus-visible` styles from app.css |
| Color contrast | Uses `--text-secondary` on `--surface-2` (meets WCAG AA) |

### Toast

| Requirement | Implementation |
|-------------|----------------|
| Screen reader | Toast system already uses `role="status"` with `aria-live="polite"` |
| Auto-dismiss timing | 8 seconds -- sufficient for screen reader users |
| Action button | Keyboard accessible via existing Toast infrastructure |

### Help Modal

| Requirement | Implementation |
|-------------|----------------|
| Already implemented | Modal has close button with `aria-label`, backdrop click, Escape key |
| Focus trap | Not currently implemented -- consider adding in Phase 2 |

---

## Dark Mode Support

The footer hint bar CSS includes `[data-theme="dark"]` overrides. Key tokens:

```css
/* Light mode (default) */
.shortcuts-hint {
    background: var(--surface-2);
    border-top: 1px solid var(--border-color);
    color: var(--text-secondary);
}

/* Dark mode automatically inherits via CSS custom properties */
/* --surface-2, --border-color, --text-secondary all adapt to dark theme */
/* Explicit overrides for kbd element background */
[data-theme="dark"] .shortcuts-hint__text kbd {
    background: var(--surface-3);
    border-color: var(--border-color-dark, var(--border-color));
}
```

Since Whendoist uses CSS custom properties for theming (defined in `tokens.css`), most elements adapt automatically. Only the `kbd` element needs an explicit dark mode override because it uses a specific background color.

---

## Testing Checklist

### Manual Testing

- [ ] **Footer hint bar appears** on first visit (desktop browser, logged in)
- [ ] **Footer hint bar is hidden** on mobile viewport (resize browser to < 640px)
- [ ] **Footer hint bar is hidden** on touch device (use Chrome DevTools device mode)
- [ ] **Dismiss button works**: click X, hint slides down, doesn't reappear on refresh
- [ ] **localStorage flag**: after dismiss, `localStorage.getItem('shortcuts-hint-dismissed')` === `'1'`
- [ ] **Pressing `?` dismisses hint**: press `?`, hint disappears, modal opens
- [ ] **Toast appears** on first visit (2s delay), auto-dismisses after 8s
- [ ] **Toast "Show" button** opens the keyboard shortcuts help modal
- [ ] **Toast doesn't reappear** on subsequent visits
- [ ] **Tooltips show shortcuts**: hover over Quick Add button, see `"Quick add task (Q)"`
- [ ] **Dark mode**: footer hint bar renders correctly in dark theme
- [ ] **Already-dismissed state**: clear localStorage, verify hint reappears

### Automated Testing (update `test_js_module_contract.py`)

```python
def test_shortcuts_module_exports():
    """Verify Shortcuts module public API hasn't changed."""
    expected_exports = {
        'register',
        'setContext',
        'openHelp',
        'closeHelp',
        'addTooltip',
    }
    # ... existing test logic
```

No new exports are added by this implementation, so the existing test should pass unchanged.

### Cross-Browser Testing

- [ ] Chrome (latest) -- primary target
- [ ] Safari (latest) -- iOS PWA users
- [ ] Firefox (latest) -- secondary
- [ ] Edge (latest) -- Chromium-based, should match Chrome

### Screen Reader Testing

- [ ] VoiceOver (macOS): footer hint bar is announced, dismiss button is labeled
- [ ] VoiceOver: toast notification is announced via `aria-live`

---

## Edge Cases

| Edge Case | Handling |
|-----------|----------|
| User has localStorage disabled | Hint bar shows every time (graceful degradation) |
| User clears localStorage | Hint bar and toast reappear (expected behavior) |
| Encryption unlock modal is open | Footer hint bar renders behind the modal (z-index 100 vs 9999) -- acceptable |
| Demo pill is showing | Demo pill is bottom-left (`position: fixed; bottom: 16px; left: 16px`); hint bar is full-width at `bottom: 0` -- they coexist without overlap |
| Settings page | Footer hint bar still shows (it's on all pages) -- this is fine |
| Page loaded in iframe | Edge case for embedding -- footer still works |
| RTL languages | `justify-content: center` handles RTL naturally |
| Very narrow desktop (< 400px) | Footer text wraps gracefully; kbd stays on same line as text |

---

## Files to Modify

| File | Changes | Lines Added |
|------|---------|:-----------:|
| `static/css/components/shortcuts.css` | Add footer hint bar styles | ~70 |
| `app/templates/base.html` | Add footer hint bar HTML + inline script | ~35 |
| `static/js/shortcuts.js` | Add one-time toast in `init()` | ~15 |
| `app/templates/dashboard.html` | Add `data-shortcut` attributes to buttons | ~2-4 |

**Total**: ~120 lines of new code across 4 files. No new files created.

---

## Implementation Order

1. **CSS first**: Add footer hint bar styles to `shortcuts.css`
2. **HTML second**: Add footer hint bar to `base.html`
3. **JS third**: Add toast logic to `shortcuts.js` `init()`
4. **Attributes last**: Add `data-shortcut` to dashboard buttons
5. **Test**: Run through the manual testing checklist
6. **PR**: Follow versioned PR workflow (bump version, uv lock, changelog)
