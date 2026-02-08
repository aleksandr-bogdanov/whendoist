# Toast Notification System

**Version:** v0.41.0
**Status:** ✅ Implemented
**Files:** `static/js/toast.js`, `static/css/components/loading.css`

---

## Overview

The toast system provides typed notifications with automatic queuing, customizable actions, and full backward compatibility. It fixes several critical bugs in the previous implementation:

1. **Silent 3-arg API bug** — `Toast.show(msg, 'error')` now works correctly
2. **Misused "Undo" button** — Generic action buttons with custom labels ("Retry", "Refresh", etc.)
3. **Toast stomping** — Queue prevents rapid toasts from overwriting each other
4. **No visual types** — Color-coded toasts (success, error, warning, info) with icons

---

## API Reference

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
| `Toast.success(msg, opts)` | success | 3s (6s with action) |
| `Toast.error(msg, opts)` | error | 6s (persistent with action) |
| `Toast.warning(msg, opts)` | warning | 5s (8s with action) |
| `Toast.info(msg, opts)` | info | 4s (8s with action) |

### Utility Methods

```javascript
Toast.hide();   // Dismiss current toast
Toast.clear();  // Clear current + queue
```

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

// 2-arg type pattern (FIXED — previously broken)
Toast.show('Connection lost', 'error');
// → { type: 'error' }

// 3-arg pattern (FIXED — previously broken)
Toast.show('Syncing...', 'info', { duration: 5000 });
// → { type: 'info', duration: 5000 }

// Simple message (no options)
Toast.show('Hello');
// → { type: 'success' }
```

**Migration:** No changes required for existing code. The new API is recommended for new code.

---

## Toast Types

| Type | Icon | Color | Use Case |
|------|------|-------|----------|
| `success` | ✓ | Purple (primary) | Successful operations, confirmations |
| `error` | ! | Red | Failures, errors requiring attention |
| `warning` | ⚠ | Amber | Warnings, non-critical issues |
| `info` | i | Blue | Informational messages, status updates |

---

## Queue Behavior

- **FIFO queue** — Toasts display in order received
- **Max queue size:** 5 toasts (oldest non-errors dropped)
- **Priority:** Errors jump to front of queue
- **Deduplication:** Same `id` updates existing toast in-place (or in queue)
- **One visible at a time** — Next toast shows after current dismisses

### Example: Rapid Operations

```javascript
// Delete 3 tasks rapidly
Toast.success('Task 1 deleted');  // Shows immediately
Toast.success('Task 2 deleted');  // Queued
Toast.success('Task 3 deleted');  // Queued

// Emergency error
Toast.error('Network error');  // Jumps to front, shows after Task 1
```

---

## Duration Rules

### Default Durations

| Type | No Action | With Action |
|------|-----------|-------------|
| Success | 3s | 6s |
| Info | 4s | 8s |
| Warning | 5s | 8s |
| Error | 6s | **Persistent** |

### Custom Duration

```javascript
// Short notification
Toast.success('Copied', { duration: 1500 });

// Never auto-dismiss (requires manual dismiss)
Toast.warning('Unsaved changes', { duration: 'persistent' });
```

**Rationale:** Errors with actions (e.g., "Retry") persist until user acts or dismisses. Other toasts auto-dismiss to avoid clutter.

---

## Action Buttons

Generic action buttons replace the old "Undo" button:

```javascript
// Undo action
Toast.success('Task deleted', {
    action: { label: 'Undo', callback: () => restoreTask() }
});

// Retry action
Toast.error('Failed to save', {
    action: { label: 'Retry', callback: () => saveTask() }
});

// Refresh page action
Toast.error('Session expired', {
    action: { label: 'Refresh Page', callback: () => location.reload() }
});

// Custom action
Toast.info('Update available', {
    action: { label: 'Install Now', callback: () => installUpdate() }
});
```

**Styling:** Action buttons are purple ghost buttons (matching brand), dismiss button is muted gray.

---

## Deduplication

Use `id` to prevent duplicate toasts or update existing ones:

```javascript
function startSync() {
    Toast.info('Syncing tasks...', { id: 'sync' });
}

function syncComplete() {
    Toast.success('Sync complete', { id: 'sync' });
    // Replaces "Syncing..." toast in-place
}

function syncError() {
    Toast.error('Sync failed', {
        id: 'sync',
        action: { label: 'Retry', callback: startSync }
    });
    // Replaces previous toast in-place
}
```

**Behavior:**
- If `id` matches current toast → update in-place (message, type, action)
- If `id` matches queued toast → replace in queue
- If no match → add to queue

---

## CSS Architecture

**Single source of truth:** `static/css/components/loading.css`

### Key Classes

```css
.toast-container    /* Fixed positioning at bottom-left */
.toast              /* Base toast (invisible by default) */
.toast.visible      /* Visible state (opacity + transform) */
.toast.is-exiting   /* Exit animation */

/* Type variants */
.toast-success      /* Purple icon */
.toast-error        /* Red icon */
.toast-warning      /* Amber icon */
.toast-info         /* Blue icon */

/* Content */
.toast-icon         /* Type icon (✓, !, ⚠, i) */
.toast-message      /* Message text */
.toast-actions      /* Button container */

/* Buttons */
.toast-action       /* Generic action button (purple ghost) */
.toast-dismiss      /* Dismiss button (✕) */
```

### Dark Mode

Dark mode styles are inline in `loading.css`:

```css
[data-theme="dark"] .toast {
    background: rgba(30, 41, 59, 0.95) !important;
    border-color: rgba(148, 163, 184, 0.15) !important;
}
```

---

## Integration Examples

### Error Handler

```javascript
// error-handler.js
function handleError(error, userMessage, options = {}) {
    if (error instanceof CSRFError) {
        Toast.error('Security token expired', {
            action: { label: 'Refresh Page', callback: () => location.reload() }
        });
    } else if (error instanceof NetworkError && options.retry) {
        Toast.error(userMessage, {
            action: { label: 'Retry', callback: options.retry }
        });
    } else {
        Toast.error(userMessage);
    }
}
```

### Network Status

```javascript
// Network online/offline
window.addEventListener('online', () => {
    Toast.success('Back online');
});

window.addEventListener('offline', () => {
    Toast.warning('No internet connection');
});
```

### Task Operations

```javascript
// Delete with undo
async function deleteTask(taskId) {
    const backup = await getTask(taskId);
    await api.delete(`/tasks/${taskId}`);

    Toast.success('Task deleted', {
        action: {
            label: 'Undo',
            callback: async () => {
                await api.post('/tasks', backup);
                Toast.success('Task restored');
            }
        }
    });
}

// Save with error handling
async function saveTask(task) {
    try {
        await api.put(`/tasks/${task.id}`, task);
        Toast.success('Task saved');
    } catch (error) {
        Toast.error('Failed to save task', {
            action: { label: 'Retry', callback: () => saveTask(task) }
        });
    }
}
```

---

## Implementation Details

### Queue Processing

1. **Enqueue** — Add toast to queue (or update if duplicate `id`)
2. **Priority** — Errors jump to front
3. **Size limit** — Drop oldest non-error if queue > 5
4. **Display** — If nothing showing, dequeue and display
5. **Dismiss** — On timeout or user action, hide with animation
6. **Next** — After exit animation completes, process next in queue

### In-Place Updates

When a toast with the same `id` arrives while one is visible:

1. Update message text
2. Update icon (if type changed)
3. Update type class (color)
4. Reset auto-dismiss timer
5. Keep same position (no exit/re-enter animation)

This creates a smooth "status update" UX for long-running operations.

---

## Testing

### Unit Tests

Contract tests verify exports (`tests/test_js_module_contract.py`):

```python
def test_exports_success_function(toast_js):
    assert re.search(r"return\s*\{[^}]*success", toast_js, re.DOTALL)

def test_supports_undo_callback(toast_js):
    assert "onUndo" in toast_js  # Backward compat
```

### Manual Testing

```bash
# In browser console
Toast.success('Success message');
Toast.error('Error message', { action: { label: 'Retry', callback: () => console.log('Retry') } });
Toast.warning('Warning message');
Toast.info('Info message');

# Test queue
for (let i = 0; i < 5; i++) {
    Toast.info(`Toast ${i + 1}`);
}

# Test deduplication
Toast.info('Loading...', { id: 'status' });
setTimeout(() => Toast.success('Done!', { id: 'status' }), 2000);
```

---

## Accessibility

- `role="status"` — Screen reader announcement
- `aria-live="polite"` (info/success/warning) — Non-intrusive
- `aria-live="assertive"` (error) — Immediate announcement
- `aria-label="Dismiss"` — Dismiss button label
- Focus management — Dismiss button is focusable
- Reduced motion — Respects `prefers-reduced-motion` (no animations)

---

## Performance

- **No DOM thrashing** — Single container, reused elements
- **Debounced animations** — CSS transitions, not JS
- **Memory efficient** — Max 6 toasts in memory (1 visible + 5 queued)
- **No polling** — Event-driven queue processing

---

## Future Enhancements

Potential improvements (not currently planned):

- **Position options** — Top-right, center, etc.
- **Stacking** — Multiple visible toasts
- **Progress bars** — For long operations
- **Rich content** — HTML in messages (sanitized)
- **Sound effects** — Audio feedback
- **Persistent history** — Notification center

---

## Migration Guide

### From Old API

| Old Pattern | New Pattern |
|-------------|-------------|
| `Toast.show(msg, { showUndo: false })` | `Toast.success(msg)` ✨ |
| `Toast.show(msg, { onUndo: fn })` | `Toast.success(msg, { action: { label: 'Undo', callback: fn } })` ✨ |
| `Toast.show(msg, 'error')` | `Toast.error(msg)` ✨ |

**Recommended:** Use new convenience methods for cleaner code, but old patterns work unchanged.

---

## Known Issues

None. All bugs from previous implementation are resolved:

- ✅ 3-arg API works correctly
- ✅ Action buttons have custom labels
- ✅ Toasts queue instead of stomping
- ✅ Visual types with color coding

---

## See Also

- **Error Handling:** `docs/ERROR-RECOVERY.md`
- **Design Tokens:** `static/css/tokens.css`
- **Loading States:** `static/css/components/loading.css`
