# Toast Notification System

**Version:** v0.45.67
**Status:** ✅ Implemented
**Files:** `static/js/toast.js`, `static/css/components/loading.css`

---

## Overview

The toast system provides typed notifications with stacking, customizable actions, and full backward compatibility. Multiple toasts display simultaneously (max 3), each with independent lifecycle.

Key features:
1. **Stacked toasts** — Multiple visible at once (max 3), oldest auto-dismissed when 4th arrives
2. **`Toast.undo()` convenience** — Standardized undo toasts with consistent 5s duration
3. **Consistent undo pattern** — All undo operations use immediate API + reverse (Pattern B)
4. **Deduplication** — Same `id` updates existing toast in-place
5. **Color-coded types** — success, error, warning, info with icons

---

## API Reference

### Undo API (Recommended for undo operations)

```javascript
// Standardized undo toast — 5s duration, success type, "Undo" button
Toast.undo('Task deleted', () => restoreTask());
Toast.undo('"Buy milk" unscheduled', () => rescheduleTask());
```

### New Preferred API

```javascript
// Basic usage
Toast.success('Task created');
Toast.error('Failed to save task');
Toast.warning('Network connection unstable');
Toast.info('New version available');

// With custom action button
Toast.error('Failed to save task', {
    action: {
        label: 'Retry',
        callback: () => saveTask()
    }
});

// With custom duration
Toast.success('Saved', { duration: 2000 });  // 2 seconds
Toast.error('Error', { duration: 'persistent' });  // Never auto-dismiss

// With deduplication ID
Toast.info('Syncing...', { id: 'sync-status' });
// Later update (same ID replaces in-place)
Toast.success('Sync complete', { id: 'sync-status' });
```

### Generic API

```javascript
Toast.show(message, options);

// Options:
{
    type: 'success' | 'error' | 'warning' | 'info',  // Default: 'success'
    action: { label: string, callback: function },   // Optional action button
    duration: number | 'persistent',                  // Auto-dismiss delay (ms)
    id: string                                        // Deduplication key
}
```

### Convenience Methods

| Method | Type | Default Duration |
|--------|------|------------------|
| `Toast.undo(msg, fn)` | success | **5s** (UNDO_DURATION) |
| `Toast.success(msg, opts)` | success | 3s (5s with action) |
| `Toast.error(msg, opts)` | error | 6s (persistent with action) |
| `Toast.warning(msg, opts)` | warning | 5s (8s with action) |
| `Toast.info(msg, opts)` | info | 4s (8s with action) |

### Utility Methods

```javascript
Toast.hide();   // Dismiss most recent toast
Toast.clear();  // Dismiss all active toasts
```

---

## Stacking Behavior

- **Max 3 visible** — When a 4th toast arrives, the oldest is auto-dismissed
- **Independent lifecycle** — Each toast has its own timeout and dismiss button
- **No queue** — Toasts show immediately, not sequentially
- **Deduplication** — Same `id` updates existing toast in-place (message, type, timer)
- **Bottom-up stacking** — New toasts appear at the bottom, CSS flexbox handles layout

### Example: Rapid Operations

```javascript
// Delete task A, then complete task B
Toast.undo('"Task A" deleted', undoDeleteA);   // Shows immediately
Toast.undo('Task B completed', undoCompleteB); // Shows below first toast
// Both toasts visible, both undo buttons work independently
```

### Example: Overflow

```javascript
// Delete 4 tasks rapidly
Toast.undo('"Task 1" deleted', undo1);  // Shows (slot 1)
Toast.undo('"Task 2" deleted', undo2);  // Shows (slot 2)
Toast.undo('"Task 3" deleted', undo3);  // Shows (slot 3)
Toast.undo('"Task 4" deleted', undo4);  // Task 1 auto-dismissed, Task 4 shows
```

---

## Undo Architecture

All undo operations follow **Pattern B: Immediate API + Reverse**.

| Operation | API Call | Undo Reversal |
|-----------|----------|---------------|
| Delete (menu/dialog/trash) | `DELETE /tasks/{id}` | `POST /tasks/{id}/restore` |
| Unschedule | `PUT /tasks/{id}` (null date/time) | `PUT /tasks/{id}` (original date/time) |
| Complete | `POST /tasks/{id}/toggle-complete` | `POST /tasks/{id}/toggle-complete` |
| Schedule (drag) | `PUT /tasks/{id}` (new date/time) | `PUT /tasks/{id}` (null or original) |
| Plan day | Multiple `PUT` calls | Multiple `PUT` calls (original states) |
| Restore | `POST /tasks/{id}/restore` | `DELETE /tasks/{id}` |

**Key principle:** API fires immediately. Undo calls the reverse API. No delayed timeouts, no lost actions on tab close.

---

## Backward Compatibility

All existing call patterns continue to work:

```javascript
// Legacy onUndo (converted to action internally)
Toast.show('Task deleted', {
    showUndo: true,
    onUndo: () => restoreTask()
});
// → { action: { label: 'Undo', callback: restoreTask } }

// 2-arg type pattern
Toast.show('Connection lost', 'error');
// → { type: 'error' }

// 3-arg pattern
Toast.show('Syncing...', 'info', { duration: 5000 });
// → { type: 'info', duration: 5000 }
```

**Migration:** No changes required for existing code. Use `Toast.undo()` for new undo toasts.

---

## Toast Types

| Type | Icon | Color | Use Case |
|------|------|-------|----------|
| `success` | ✓ | Purple (primary) | Successful operations, confirmations |
| `error` | ! | Red | Failures, errors requiring attention |
| `warning` | ⚠ | Amber | Warnings, non-critical issues |
| `info` | i | Blue | Informational messages, status updates |

---

## Duration Rules

### Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `UNDO_DURATION` | 5000ms | All undo toasts via `Toast.undo()` |
| `MAX_VISIBLE` | 3 | Maximum simultaneous toasts |

### Default Durations

| Type | No Action | With Action |
|------|-----------|-------------|
| Success | 3s | 5s |
| Info | 4s | 8s |
| Warning | 5s | 8s |
| Error | 6s | **Persistent** |

---

## CSS Architecture

**Single source of truth:** `static/css/components/loading.css`

The toast container uses `display: flex; flex-direction: column; gap: 8px;` which naturally supports stacking multiple `.toast.visible` children. The `is-exiting` animation works per-element. Mobile overrides (full-width, above tab bar) target `.toast-container` and `.toast` independently, so stacking works on mobile too.

### Key Classes

```css
.toast-container    /* Fixed positioning, flex column with gap */
.toast              /* Base toast (invisible by default) */
.toast.visible      /* Visible state (opacity + transform) */
.toast.is-exiting   /* Exit animation */

/* Type variants */
.toast-success, .toast-error, .toast-warning, .toast-info

/* Content */
.toast-icon, .toast-message, .toast-actions

/* Buttons */
.toast-action       /* Generic action button (purple ghost) */
.toast-dismiss      /* Dismiss button (✕) */
```

---

## Testing

### Unit Tests

Contract tests verify exports (`tests/test_js_module_contract.py`):

```python
def test_exports_undo_function(toast_js):
    assert re.search(r"return\s*\{[^}]*undo", toast_js, re.DOTALL)

def test_has_stacked_toasts(toast_js):
    assert "activeToasts" in toast_js

def test_has_max_visible_limit(toast_js):
    assert "MAX_VISIBLE" in toast_js
```

### Manual Testing

```bash
# In browser console

# Test stacking
Toast.undo('Deleted task A', () => console.log('Undo A'));
Toast.undo('Completed task B', () => console.log('Undo B'));
# Both visible, both undo buttons work

# Test max visible
for (let i = 1; i <= 4; i++) Toast.undo(`Task ${i}`, () => {});
# First toast auto-dismissed, 3 visible

# Test dedup
Toast.info('Loading...', { id: 'sync' });
setTimeout(() => Toast.success('Done!', { id: 'sync' }), 1000);
```

---

## Accessibility

- `role="status"` — Screen reader announcement
- `aria-live="polite"` (info/success/warning) — Non-intrusive
- `aria-live="assertive"` (error) — Immediate announcement
- `aria-label="Dismiss"` — Dismiss button label
- Reduced motion — Respects `prefers-reduced-motion` (no animations)

---

## See Also

- **Error Handling:** `docs/ERROR-RECOVERY.md`
- **Design Tokens:** `static/css/tokens.css`
- **Loading States:** `static/css/components/loading.css`
