# v1.0 Blockers: Implementation Plan

> **Created:** February 2026
> **Goal:** Ship polished error recovery + keyboard shortcuts for v1.0
> **Effort:** ~5 days (2-3 days error recovery, 2 days shortcuts)
> **Blockers:** #3 Error Recovery UX, #6 Keyboard Shortcuts Reference

---

## Overview

This document provides a detailed implementation plan for the two remaining v1.0 blockers identified in the [V1-ROADMAP-AUDIT.md](V1-ROADMAP-AUDIT.md).

### Success Criteria

**Error Recovery (#3):**
- ✅ All fetch() calls use safeFetch() or have equivalent error handling
- ✅ Global error boundary catches unhandled JS exceptions
- ✅ Network offline/online detection with user feedback
- ✅ Rate limit errors (429) show helpful messages
- ✅ All errors log to Sentry + show user-friendly Toast

**Keyboard Shortcuts (#6):**
- ✅ `?` opens shortcut reference modal
- ✅ All existing shortcuts documented
- ✅ Tooltips show shortcuts on hover
- ✅ Help page lists all shortcuts
- ✅ Extensible system for adding future shortcuts

---

## Part 1: Error Recovery Polish

**Estimated Effort:** 2-3 days

### Current State Analysis

**What exists:**
- `static/js/error-handler.js` with `safeFetch()`, `handleError()`, `getCSRFHeaders()`
- Toast notification system in `static/js/toast.js`
- Sentry backend integration for server errors
- CSRF token handling

**What's missing:**
- **Consistency:** Only ~40% of fetch() calls use safeFetch()
- **Network status:** No offline detection
- **Error boundaries:** Unhandled JS exceptions don't get caught
- **Rate limits:** 429 errors not handled gracefully
- **User guidance:** Errors don't suggest fixes

**Files to modify:** 21 JS files, ~38 fetch() calls

---

### Phase 1: Audit & Inventory (2 hours)

Create a comprehensive list of all fetch() calls and their error handling status.

#### Step 1.1: Generate Audit Report

```bash
# Create audit directory
mkdir -p docs/audits

# Find all fetch() calls with context
grep -rn "fetch(" static/js --include="*.js" \
  -B 5 -A 15 > docs/audits/fetch-calls-audit.txt

# Count by file
grep -r "fetch(" static/js --include="*.js" -c | \
  sort -t: -k2 -rn > docs/audits/fetch-calls-by-file.txt
```

#### Step 1.2: Categorize Each Fetch Call

For each of the 38 fetch() calls, document:

| File | Line | Method | Error Handling | Priority | Notes |
|------|------|--------|----------------|----------|-------|
| task-dialog.js | 816 | GET /domains | try/catch, no toast | High | User-facing |
| task-dialog.js | 968 | GET /tasks/:id | try/catch, throws | High | Critical path |
| wizard.js | 323 | POST /wizard/complete | try/catch, console.error | Medium | One-time use |
| ... | ... | ... | ... | ... | ... |

**Priority levels:**
- **High:** User-facing, core workflows (task CRUD, scheduling, domain management)
- **Medium:** Secondary features (analytics, settings updates)
- **Low:** One-time flows (wizard, onboarding)

---

### Phase 2: Enhance Error Handler (4 hours)

Upgrade `static/js/error-handler.js` to handle all error scenarios.

#### Step 2.1: Add Network Status Detection

```javascript
// In error-handler.js, add after existing code:

// ==========================================================================
// Network Status Detection
// ==========================================================================

let isOnline = navigator.onLine;
let offlineToastShown = false;

function setupNetworkMonitoring() {
    window.addEventListener('online', () => {
        isOnline = true;
        offlineToastShown = false;

        if (window.Toast) {
            Toast.show('Back online', { showUndo: false });
        }

        // Trigger event for other modules to retry failed requests
        window.dispatchEvent(new CustomEvent('network:online'));
    });

    window.addEventListener('offline', () => {
        isOnline = false;

        if (window.Toast && !offlineToastShown) {
            Toast.show('No internet connection', { showUndo: false });
            offlineToastShown = true;
        }

        window.dispatchEvent(new CustomEvent('network:offline'));
    });
}

function isNetworkOnline() {
    return isOnline;
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupNetworkMonitoring);
} else {
    setupNetworkMonitoring();
}

// Export
window.isNetworkOnline = isNetworkOnline;
```

#### Step 2.2: Add Enhanced safeFetch with Network Check

```javascript
// Replace existing safeFetch() in error-handler.js:

async function safeFetch(url, options = {}) {
    // Check network status first
    if (!isNetworkOnline()) {
        throw new NetworkError('No internet connection. Please check your network.');
    }

    // Add CSRF token to headers for state-changing methods
    const method = (options.method || 'GET').toUpperCase();
    const needsCSRF = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

    if (needsCSRF) {
        const token = getCSRFToken();
        if (token) {
            options.headers = {
                ...options.headers,
                'X-CSRF-Token': token
            };
        }
    }

    let response;

    try {
        response = await fetch(url, options);
    } catch (error) {
        // Network errors (CORS, connection refused, timeout)
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new NetworkError('Connection failed. Please check your internet.');
        }
        throw error;
    }

    // Handle HTTP error status codes
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        switch (response.status) {
            case 400:
                throw new ValidationError(
                    errorData.detail || 'Invalid request. Please check your input.',
                    errorData
                );

            case 401:
                // Unauthorized - redirect to login
                window.location.href = '/login?expired=true';
                throw new AuthError('Session expired. Redirecting to login...');

            case 403:
                // Could be CSRF error
                if (errorData.detail && errorData.detail.includes('CSRF')) {
                    throw new CSRFError('Security token expired. Please refresh the page.');
                }
                throw new AuthError(errorData.detail || 'Access denied.');

            case 404:
                throw new NotFoundError(errorData.detail || 'Resource not found.');

            case 429:
                // Rate limit - extract retry time if available
                const retryAfter = response.headers.get('Retry-After');
                const waitTime = retryAfter ? `${retryAfter}s` : 'a moment';
                throw new RateLimitError(
                    `Too many requests. Please wait ${waitTime} and try again.`,
                    { retryAfter }
                );

            case 500:
            case 502:
            case 503:
            case 504:
                throw new ServerError(
                    errorData.detail || 'Server error. Our team has been notified.'
                );

            default:
                throw new HTTPError(
                    `HTTP ${response.status}: ${response.statusText}`,
                    response.status
                );
        }
    }

    return response;
}

// Custom error classes for better error handling
class NetworkError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NetworkError';
        this.userFriendly = true;
    }
}

class ValidationError extends Error {
    constructor(message, details) {
        super(message);
        this.name = 'ValidationError';
        this.details = details;
        this.userFriendly = true;
    }
}

class AuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthError';
        this.userFriendly = true;
    }
}

class CSRFError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CSRFError';
        this.userFriendly = true;
        this.recoverable = true;
    }
}

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotFoundError';
        this.userFriendly = true;
    }
}

class RateLimitError extends Error {
    constructor(message, details) {
        super(message);
        this.name = 'RateLimitError';
        this.details = details;
        this.userFriendly = true;
        this.recoverable = true;
    }
}

class ServerError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ServerError';
        this.userFriendly = true;
    }
}

class HTTPError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'HTTPError';
        this.status = status;
        this.userFriendly = false;
    }
}

// Export error classes
window.NetworkError = NetworkError;
window.ValidationError = ValidationError;
window.CSRFError = CSRFError;
window.RateLimitError = RateLimitError;
```

#### Step 2.3: Enhance handleError with Recovery Actions

```javascript
// Replace handleError() in error-handler.js:

function handleError(error, userMessage, options = {}) {
    // Log technical details for debugging
    console.error('[Whendoist Error]', error);

    // Send to Sentry if available (for production monitoring)
    if (window.Sentry && typeof Sentry.captureException === 'function') {
        Sentry.captureException(error, {
            tags: {
                component: options.component || 'unknown',
                action: options.action || 'unknown'
            }
        });
    }

    // Determine message and recovery action
    let message = userMessage;
    let recoveryAction = null;

    if (!message && error.userFriendly) {
        message = error.message;
    } else if (!message) {
        message = 'Something went wrong';
    }

    // Add recovery actions for specific errors
    if (error instanceof CSRFError) {
        recoveryAction = {
            label: 'Refresh Page',
            callback: () => window.location.reload()
        };
    } else if (error instanceof RateLimitError && error.details?.retryAfter) {
        const seconds = parseInt(error.details.retryAfter, 10);
        if (seconds && seconds < 60) {
            // Auto-retry for short delays
            recoveryAction = {
                label: `Retry in ${seconds}s`,
                callback: options.retry,
                countdown: seconds
            };
        }
    } else if (error instanceof NetworkError && options.retry) {
        recoveryAction = {
            label: 'Retry',
            callback: options.retry
        };
    }

    // Show toast notification
    if (window.Toast && typeof Toast.show === 'function') {
        if (recoveryAction) {
            Toast.show(message, {
                showUndo: true,
                onUndo: recoveryAction.callback
            });
        } else {
            Toast.show(message, { showUndo: false });
        }
    } else {
        // Fallback to console warning if Toast not available
        console.warn('[User Message]', message);
    }
}
```

#### Step 2.4: Add Global Error Boundary

```javascript
// Add to error-handler.js:

// ==========================================================================
// Global Error Boundary
// ==========================================================================

function setupGlobalErrorHandling() {
    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        console.error('[Unhandled Promise Rejection]', event.reason);

        // Prevent default browser behavior (console error)
        event.preventDefault();

        // Handle the error
        handleError(
            event.reason,
            'An unexpected error occurred',
            { component: 'global', action: 'unhandledRejection' }
        );
    });

    // Catch unhandled JavaScript errors
    window.addEventListener('error', (event) => {
        // Don't handle script loading errors (those are usually ad blockers)
        if (event.filename && event.filename.includes('http')) {
            return;
        }

        console.error('[Unhandled Error]', event.error);

        handleError(
            event.error || new Error(event.message),
            'An unexpected error occurred',
            { component: 'global', action: 'unhandledError' }
        );
    });
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupGlobalErrorHandling);
} else {
    setupGlobalErrorHandling();
}
```

---

### Phase 3: Migration Strategy (8-12 hours)

Systematically migrate all fetch() calls to use safeFetch() or wrap with proper error handling.

#### Step 3.1: Migration Template

For each file with fetch() calls, follow this pattern:

**Before (task-dialog.js:816):**
```javascript
async function loadDomains() {
    try {
        const response = await fetch('/api/v1/domains');
        if (response.ok) {
            domains = await response.json();

            // Decrypt domain names if encryption is enabled
            if (Crypto.canCrypto()) {
                for (const domain of domains) {
                    domain.name = await Crypto.decryptField(domain.name);
                }
            }
        }
    } catch (error) {
        console.error('Failed to load domains:', error);
    }
}
```

**After:**
```javascript
async function loadDomains() {
    try {
        const response = await safeFetch('/api/v1/domains');
        domains = await response.json();

        // Decrypt domain names if encryption is enabled
        if (Crypto.canCrypto()) {
            for (const domain of domains) {
                domain.name = await Crypto.decryptField(domain.name);
            }
        }
    } catch (error) {
        handleError(error, 'Failed to load domains', {
            component: 'task-dialog',
            action: 'loadDomains',
            retry: loadDomains  // Allow retry
        });
    }
}
```

#### Step 3.2: File-by-File Migration Plan

Prioritize by user impact (High → Medium → Low):

**Week 1, Day 1-2: High Priority (Core Workflows)**

1. `task-dialog.js` - Task CRUD operations
   - Lines: 816 (loadDomains), 968 (loadTask), 1044 (saveTask)
   - ~3 fetch() calls
   - Test: Create/edit/delete tasks, verify errors show toast

2. `drag-drop.js` - Scheduling operations
   - Lines: (find with grep)
   - ~2-3 fetch() calls
   - Test: Drag tasks, verify network errors

3. `task-complete.js` - Task completion
   - Lines: (find with grep)
   - ~2 fetch() calls
   - Test: Complete tasks, verify errors

4. `plan-tasks.js` - Auto-scheduling
   - Lines: (find with grep)
   - ~3-4 fetch() calls
   - Test: Plan tasks, verify errors

**Week 1, Day 2-3: Medium Priority (Secondary Features)**

5. `task-list-options.js` - Settings panel actions
6. `mobile-sheet.js` - Mobile task editing
7. `task-swipe.js` - Swipe actions
8. `wizard.js` - Onboarding (already has some error handling)

**Week 1, Day 3: Low Priority (Edge Cases)**

9. `passkey.js` - WebAuthn flows
10. Other files with minimal fetch() usage

#### Step 3.3: Testing Checklist Per File

For each migrated file, test:

- [ ] **Success case:** Normal operation works
- [ ] **Network offline:** Disconnect network, verify "No internet" toast
- [ ] **Server error (500):** Mock server error, verify user message
- [ ] **Rate limit (429):** Spam endpoint, verify rate limit message
- [ ] **CSRF expired:** Wait 1hr, submit form, verify CSRF error
- [ ] **Validation error (400):** Submit invalid data, verify validation message
- [ ] **Not found (404):** Request nonexistent resource, verify 404 message

---

### Phase 4: Testing & Validation (4 hours)

#### Step 4.1: Manual Testing Scenarios

Create a test script (`docs/testing/error-recovery-manual-test.md`):

```markdown
# Error Recovery Manual Test Script

## Setup
- [ ] Fresh browser session (clear cache/cookies)
- [ ] Dev tools open (Console + Network tabs)
- [ ] Sentry dashboard open (check error capture)

## Test 1: Network Offline
1. Open Tasks page
2. Disconnect network (Dev Tools → Network → Offline)
3. Try to create a task
4. **Expected:** "No internet connection" toast appears
5. Reconnect network
6. **Expected:** "Back online" toast appears
7. Retry task creation
8. **Expected:** Task created successfully

## Test 2: Rate Limiting
1. Open Settings page
2. Click "Download Backup" 6 times rapidly
3. **Expected:** 6th click shows "Too many requests, wait X seconds"
4. Wait for countdown
5. **Expected:** Retry button becomes available

## Test 3: CSRF Token Expiry
1. Open Tasks page
2. Wait 1 hour (or manually expire CSRF cookie)
3. Create a task
4. **Expected:** "Security token expired. Please refresh the page."
5. Click "Refresh Page"
6. **Expected:** Page reloads, new CSRF token issued

## Test 4: Server Error (500)
1. Temporarily break backend (e.g., comment out a route)
2. Trigger broken endpoint
3. **Expected:** "Server error. Our team has been notified."
4. Check Sentry dashboard
5. **Expected:** Error logged with stack trace

## Test 5: Validation Error (400)
1. Open task dialog
2. Try to create task with invalid data (e.g., duration: "invalid")
3. **Expected:** "Invalid request. Please check your input."

## Test 6: Unhandled Promise Rejection
1. Open Console
2. Run: `Promise.reject(new Error('Test unhandled rejection'))`
3. **Expected:** Toast shows "An unexpected error occurred"
4. **Expected:** Error logged to Sentry

## Test 7: Unhandled JavaScript Error
1. Open Console
2. Run: `throw new Error('Test unhandled error')`
3. **Expected:** Toast shows "An unexpected error occurred"
4. **Expected:** Error logged to Sentry
```

#### Step 4.2: Automated Testing (Optional)

Add integration tests for error scenarios:

```python
# tests/test_error_recovery.py

import pytest
from fastapi.testclient import TestClient


def test_rate_limit_returns_429(client: TestClient, authed_headers):
    """Test that rate limiting returns 429 with Retry-After header."""
    # Spam backup export endpoint
    for _ in range(6):
        response = client.get("/api/v1/backup/export", headers=authed_headers)

    assert response.status_code == 429
    assert "Retry-After" in response.headers


def test_csrf_validation_fails_without_token(client: TestClient, authed_headers):
    """Test that POST without CSRF token returns 403."""
    # Remove CSRF token from headers
    headers = {k: v for k, v in authed_headers.items() if k != "X-CSRF-Token"}

    response = client.post("/api/v1/tasks", json={"title": "Test"}, headers=headers)
    assert response.status_code == 403
    assert "CSRF" in response.json()["detail"]


def test_validation_error_returns_400(client: TestClient, authed_headers):
    """Test that invalid data returns 400 with details."""
    response = client.post(
        "/api/v1/tasks",
        json={"title": "Test", "duration_minutes": "invalid"},
        headers=authed_headers
    )
    assert response.status_code == 422  # FastAPI validation error
```

---

### Phase 5: Documentation (2 hours)

#### Step 5.1: Update Error Handler JSDoc

Add comprehensive documentation to `static/js/error-handler.js`:

```javascript
/**
 * Error Handler Utility
 *
 * Standardizes error handling across the application with:
 * - Automatic CSRF token injection
 * - Network status monitoring
 * - User-friendly error messages
 * - Sentry integration for production monitoring
 * - Recovery actions (retry, refresh)
 *
 * @module ErrorHandler
 * @version 0.41.0
 *
 * @example
 * // Basic usage with safeFetch
 * try {
 *     const response = await safeFetch('/api/v1/tasks', {
 *         method: 'POST',
 *         headers: { 'Content-Type': 'application/json' },
 *         body: JSON.stringify({ title: 'New Task' })
 *     });
 *     const task = await response.json();
 * } catch (error) {
 *     handleError(error, 'Failed to create task', {
 *         component: 'task-dialog',
 *         action: 'createTask',
 *         retry: () => createTask()
 *     });
 * }
 *
 * @example
 * // Check network status before expensive operation
 * if (!isNetworkOnline()) {
 *     Toast.show('No internet connection', { showUndo: false });
 *     return;
 * }
 */
```

#### Step 5.2: Add Error Handling Guide

Create `docs/ERROR-HANDLING.md`:

```markdown
# Error Handling Guide

## For Developers

### When to use safeFetch()

**Always use `safeFetch()` instead of `fetch()` for API calls.**

safeFetch() automatically:
- Adds CSRF token for POST/PUT/DELETE/PATCH
- Checks network connectivity
- Throws typed errors (NetworkError, ValidationError, etc.)
- Handles common HTTP status codes (401, 403, 429, 500)

### Error Handling Pattern

```javascript
async function myAPICall() {
    try {
        const response = await safeFetch('/api/v1/endpoint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    } catch (error) {
        handleError(error, 'User-friendly message', {
            component: 'my-module',
            action: 'myAPICall',
            retry: () => myAPICall()  // Optional: allow retry
        });
    }
}
```

### Error Types

| Error Class | When Thrown | User Message | Recoverable |
|-------------|-------------|--------------|-------------|
| `NetworkError` | No internet, connection refused | "No internet connection" | Yes (retry) |
| `ValidationError` | 400 Bad Request | "Invalid request. Check your input." | No |
| `AuthError` | 401 Unauthorized | "Session expired. Redirecting..." | No |
| `CSRFError` | 403 CSRF failure | "Security token expired. Refresh page." | Yes (refresh) |
| `RateLimitError` | 429 Too Many Requests | "Too many requests. Wait 30s." | Yes (countdown) |
| `ServerError` | 500, 502, 503, 504 | "Server error. Team notified." | No |

### Testing Error Scenarios

See [Error Recovery Manual Test Script](testing/error-recovery-manual-test.md) for testing checklist.
```

---

### Phase 6: Rollout Plan (1 hour)

#### Step 6.1: Staged Deployment

1. **PR 1: Error Handler Enhancement** (merge first)
   - Enhanced safeFetch() with network check + typed errors
   - Network status monitoring
   - Global error boundary
   - No breaking changes (existing code still works)

2. **PR 2-4: Migration (by priority)**
   - PR 2: High priority files (task-dialog, drag-drop, task-complete, plan-tasks)
   - PR 3: Medium priority files (settings, mobile, wizard)
   - PR 4: Low priority files (passkey, edge cases)

3. **PR 5: Documentation**
   - Error handling guide
   - Manual test script
   - Updated JSDoc

#### Step 6.2: Monitoring Plan

After each deployment, monitor:

- **Sentry errors:** Check for new error types or spikes
- **User reports:** Watch for "errors not showing" or "confusing messages"
- **Console logs:** Check for unhandled errors in production

---

## Part 2: Keyboard Shortcuts Reference

**Estimated Effort:** 2 days

### Current State Analysis

**Existing shortcuts (undocumented):**
- `q` - Quick add task dialog (when not in input)
- `n` - New task editor
- `Escape` - Close dialogs/sheets/panels
- `Enter` - Submit forms in wizard

**Missing:**
- No shortcut reference (users can't discover shortcuts)
- No tooltips showing shortcuts
- No help documentation
- Not extensible (hardcoded in individual files)

---

### Architecture Design

We need a centralized keyboard shortcut system that's:
1. **Declarative** - shortcuts defined in one place
2. **Context-aware** - different shortcuts for different pages
3. **Discoverable** - help modal + tooltips
4. **Extensible** - easy to add new shortcuts

#### Proposed Architecture

```
static/js/shortcuts.js (new)
├─ Shortcut registry (centralized definitions)
├─ Context management (global vs page-specific)
├─ Event handler (keydown listener)
├─ Help modal renderer
└─ Tooltip integration

Modified files:
├─ task-dialog.js (migrate 'q' shortcut)
├─ task-sheet.js (migrate 'n' shortcut)
├─ plan-tasks.js (migrate 'Escape' shortcut)
├─ mobile-sheet.js (migrate 'Escape' shortcut)
└─ base.html (load shortcuts.js, add help modal)
```

---

### Phase 1: Create Shortcut System (6 hours)

#### Step 1.1: Create shortcuts.js

```javascript
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
```

#### Step 1.2: Add Shortcut CSS

Create `static/css/components/shortcuts.css`:

```css
/* Keyboard Shortcut Help Modal */

.shortcut-help-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10000;
    display: none;
}

.shortcut-help-modal.visible {
    display: flex;
    align-items: center;
    justify-content: center;
}

.shortcut-help-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
}

.shortcut-help-panel {
    position: relative;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    background: var(--surface-1);
    border-radius: 12px;
    box-shadow: var(--shadow-elevation-high);
    display: flex;
    flex-direction: column;
    animation: slideUp 0.2s ease-out;
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.shortcut-help-header {
    padding: 24px 24px 16px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.shortcut-help-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
}

.shortcut-help-close {
    background: none;
    border: none;
    padding: 8px;
    cursor: pointer;
    color: var(--text-muted);
    transition: color 0.2s;
    border-radius: 6px;
}

.shortcut-help-close:hover {
    color: var(--text-primary);
    background: var(--surface-2);
}

.shortcut-help-content {
    padding: 24px;
    overflow-y: auto;
}

.shortcut-category {
    margin-bottom: 32px;
}

.shortcut-category:last-child {
    margin-bottom: 0;
}

.shortcut-category-title {
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin: 0 0 12px 0;
}

.shortcut-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-radius: 6px;
    transition: background 0.15s;
}

.shortcut-row:hover {
    background: var(--surface-2);
}

.shortcut-description {
    color: var(--text-primary);
    font-size: 0.9375rem;
}

.shortcut-key {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--surface-2);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-family: var(--font-mono, monospace);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

/* Dark mode */
[data-theme="dark"] .shortcut-key {
    background: var(--surface-3);
    border-color: var(--border-color-dark);
}

/* Mobile responsive */
@media (max-width: 640px) {
    .shortcut-help-panel {
        width: 100%;
        max-width: none;
        max-height: 100vh;
        border-radius: 0;
    }

    .shortcut-help-header {
        padding: 20px 20px 12px;
    }

    .shortcut-help-content {
        padding: 20px;
    }
}
```

---

### Phase 2: Migrate Existing Shortcuts (3 hours)

#### Step 2.1: Remove Hardcoded Shortcuts

**task-dialog.js** - Remove lines 605-611:
```javascript
// REMOVE THIS:
document.addEventListener('keydown', (e) => {
    if (e.key === 'q' && !e.target.matches('input, textarea, select') && !isOpen()) {
        open();
    }
    if (e.key === 'Escape' && isOpen()) {
        close();
    }
});
```

**task-sheet.js** - Remove lines 186-190:
```javascript
// REMOVE THIS:
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
        close();
    }
});
```

**Verify removal:** Shortcuts should still work via `shortcuts.js`.

#### Step 2.2: Add data-shortcut Attributes

Update HTML templates to show shortcuts in tooltips:

**base.html** (or wherever quick add button is):
```html
<!-- Before -->
<button onclick="TaskDialog.open()">+ Quick Add</button>

<!-- After -->
<button onclick="TaskDialog.open()" data-shortcut="q" title="Quick add task">
    + Quick Add
</button>
```

---

### Phase 3: Add Help Documentation (2 hours)

#### Step 3.1: Update base.html

Load shortcuts.js and add CSS:

```html
<!-- In <head> -->
<link rel="stylesheet" href="/static/css/components/shortcuts.css">

<!-- Before closing </body> -->
<script src="/static/js/shortcuts.js"></script>
```

#### Step 3.2: Add Help Link in Settings

In `app/templates/settings.html`, add a new panel:

```html
<!-- In GENERAL Section -->
<div class="settings-panel">
    <div class="settings-panel__hd">
        <div class="panel-hd-left">
            <p class="panel-title">Keyboard Shortcuts</p>
            <p class="panel-desc">View all available keyboard shortcuts</p>
        </div>
    </div>
    <div class="settings-panel__bd">
        <div class="settings-row">
            <div class="backup-info">
                <span class="pref-label">Shortcut Reference</span>
                <span class="pref-desc">Press <kbd>?</kbd> anywhere to view shortcuts</span>
            </div>
            <div class="settings-row__right">
                <button type="button" class="btn-sm btn-sm--ghost" onclick="Shortcuts.openHelp()">
                    View Shortcuts
                </button>
            </div>
        </div>
    </div>
</div>
```

#### Step 3.3: Update JS Module Contract Test

Add shortcuts.js to the test:

```python
# In tests/test_js_module_contract.py

def test_shortcuts_module_exports():
    """Verify Shortcuts module exports expected API."""
    assert js_modules["shortcuts"] == {
        "register",
        "setContext",
        "openHelp",
        "closeHelp",
        "addTooltip"
    }
```

---

### Phase 4: Future Extensibility (Future Work)

Design for future shortcuts (v1.1+):

#### Navigation Shortcuts (Vim-style)
```javascript
// Add to shortcuts.tasks in shortcuts.js:
{
    key: 'j',
    description: 'Next task',
    category: 'Navigation',
    excludeInputs: true,
    handler: () => TaskList.selectNext()
},
{
    key: 'k',
    description: 'Previous task',
    category: 'Navigation',
    excludeInputs: true,
    handler: () => TaskList.selectPrevious()
}
```

#### Action Shortcuts
```javascript
{
    key: 'c',
    description: 'Complete selected task',
    category: 'Actions',
    excludeInputs: true,
    handler: () => TaskList.completeSelected()
},
{
    key: 'd',
    description: 'Delete selected task',
    category: 'Actions',
    excludeInputs: true,
    handler: () => TaskList.deleteSelected()
}
```

#### View Switching
```javascript
{
    key: '1',
    description: 'Switch to Tasks view',
    category: 'Navigation',
    ctrl: true,
    handler: () => window.location.href = '/'
}
```

---

## Testing Strategy

### Error Recovery Testing

**Manual tests (see Phase 4.1):**
- [ ] Network offline/online
- [ ] Rate limiting
- [ ] CSRF expiry
- [ ] Server errors (500)
- [ ] Validation errors (400)
- [ ] Unhandled promise rejections
- [ ] Unhandled JS errors

**Automated tests:**
```bash
# Run integration tests
just test tests/test_error_recovery.py
```

### Keyboard Shortcuts Testing

**Manual tests:**
1. Press `?` → Help modal opens
2. Press `Escape` → Help modal closes
3. Press `q` (not in input) → Quick add opens
4. Press `q` (in input) → Types "q" (no dialog)
5. Press `n` → Task sheet opens
6. Press `Escape` (in dialog) → Dialog closes
7. Hover buttons with `data-shortcut` → Tooltip shows shortcut
8. Visit Settings → "View Shortcuts" button works

**Automated tests:**
```python
# In tests/test_js_module_contract.py

def test_shortcuts_module_exists():
    """Verify shortcuts.js loads and exports API."""
    # (already covered in Step 3.3)
```

---

## Rollout Plan

### Week 1: Error Recovery

**Day 1-2:**
- [ ] Enhance error-handler.js (Phase 2)
- [ ] Create migration audit (Phase 1)
- [ ] Migrate high-priority files (Phase 3.2)

**Day 3:**
- [ ] Migrate medium-priority files
- [ ] Manual testing (Phase 4.1)
- [ ] Documentation (Phase 5)

### Week 2: Keyboard Shortcuts

**Day 1:**
- [ ] Create shortcuts.js (Phase 1.1)
- [ ] Add shortcuts CSS (Phase 1.2)
- [ ] Migrate existing shortcuts (Phase 2)

**Day 2:**
- [ ] Add help documentation (Phase 3)
- [ ] Manual testing
- [ ] Create PR

### Pull Request Strategy

**PR #1: Error Handler Enhancement**
- Title: `v0.41.0/feat: Enhanced error recovery with network monitoring`
- Files: `static/js/error-handler.js`, `docs/ERROR-HANDLING.md`
- Size: ~300 LOC

**PR #2-4: Error Recovery Migration**
- Title: `v0.41.1/refactor: Migrate [high/medium/low] priority files to safeFetch()`
- Files: ~7-10 JS files per PR
- Size: ~500 LOC per PR

**PR #5: Keyboard Shortcuts**
- Title: `v0.42.0/feat: Keyboard shortcuts reference with help modal`
- Files: `static/js/shortcuts.js`, `static/css/components/shortcuts.css`, templates
- Size: ~400 LOC

---

## Success Metrics

### Error Recovery

**Quantitative:**
- [ ] 100% of fetch() calls use safeFetch() or equivalent
- [ ] 0 unhandled promise rejections in production (Sentry)
- [ ] < 5 "confusing error message" user reports per month

**Qualitative:**
- [ ] Errors feel polite and actionable
- [ ] Users know what went wrong and what to do
- [ ] Network errors don't feel like "app is broken"

### Keyboard Shortcuts

**Quantitative:**
- [ ] All existing shortcuts documented in help modal
- [ ] 100% of shortcut buttons have tooltips
- [ ] Help modal opens in < 100ms

**Qualitative:**
- [ ] Power users discover shortcuts organically
- [ ] Help modal feels native (not bolted-on)
- [ ] Shortcuts are memorable and intuitive

---

## Post-v1.0 Improvements

### Error Recovery
- [ ] Offline mode: Cache tasks for read-only access
- [ ] Retry queue: Auto-retry failed requests when back online
- [ ] Error analytics: Track most common errors in Sentry
- [ ] Progressive degradation: Gracefully disable features when backend unavailable

### Keyboard Shortcuts
- [ ] Customizable bindings (user can rebind shortcuts)
- [ ] Chord shortcuts (e.g., `g h` for "go home")
- [ ] Command palette (`Ctrl+K` for fuzzy search + actions)
- [ ] Vim mode (comprehensive j/k navigation)

---

*Last updated: February 2026*
