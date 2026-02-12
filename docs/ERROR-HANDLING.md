# Error Handling Guide

> **Updated:** February 2026
> **Purpose:** Production-ready error handling for all API calls

---

## For Developers

### When to use safeFetch()

**Always use `safeFetch()` instead of `fetch()` for API calls.**

`safeFetch()` automatically:
- Adds CSRF token for POST/PUT/DELETE/PATCH
- Checks network connectivity before making requests
- Throws typed errors (NetworkError, ValidationError, etc.)
- Handles common HTTP status codes (401, 403, 429, 500)
- Redirects to login on 401 Unauthorized

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

**Key points:**
- **No more `window.getCSRFHeaders()`** - `safeFetch()` adds CSRF automatically
- **No more `if (response.ok)`** - `safeFetch()` throws on error
- **Always use `handleError()`** - provides consistent user feedback and Sentry logging
- **Add retry callbacks** when user might want to retry (network errors, rate limits)

### Error Types

| Error Class | When Thrown | User Message | Recoverable |
|-------------|-------------|--------------|-------------|
| `NetworkError` | No internet, connection refused | "No internet connection" | Yes (retry) |
| `ValidationError` | 400 Bad Request | "Invalid request. Check your input." | No |
| `AuthError` | 401 Unauthorized | "Session expired. Redirecting..." | No |
| `CSRFError` | 403 CSRF failure | "Security token expired. Refresh page." | Yes (refresh) |
| `NotFoundError` | 404 Not Found | "Resource not found." | No |
| `RateLimitError` | 429 Too Many Requests | "Too many requests. Wait 30s." | Yes (countdown) |
| `ServerError` | 500, 502, 503, 504 | "Server error. Team notified." | No |

### Network Status Detection

Check if the user is online before expensive operations:

```javascript
if (!isNetworkOnline()) {
    Toast.show('No internet connection', { showUndo: false });
    return;
}
```

The system also listens for `network:online` and `network:offline` events:

```javascript
window.addEventListener('network:online', () => {
    // Retry failed requests
});
```

---

## Migration Checklist

When migrating existing code to use `safeFetch()`:

1. **Replace `fetch()` with `safeFetch()`**
2. **Remove `window.getCSRFHeaders()`** - automatic now
3. **Remove `if (response.ok)` checks** - `safeFetch()` throws on error
4. **Replace console.error + alert/toast with `handleError()`**
5. **Add retry callback** if operation should be retryable
6. **Test**: Network offline, then online (should show toasts)

### Before/After Example

**Before:**
```javascript
async function loadDomains() {
    try {
        const response = await fetch('/api/v1/domains');
        if (response.ok) {
            domains = await response.json();
            updateDomainSelect();
        }
    } catch (err) {
        console.error('Failed to load domains:', err);
    }
}
```

**After:**
```javascript
async function loadDomains() {
    try {
        const response = await safeFetch('/api/v1/domains');
        domains = await response.json();
        updateDomainSelect();
    } catch (error) {
        handleError(error, 'Failed to load domains', {
            component: 'task-dialog',
            action: 'loadDomains',
            retry: loadDomains
        });
    }
}
```

---

## Global Error Boundary

The error handler automatically catches:
- **Unhandled promise rejections** - shows toast + logs to Sentry
- **Unhandled JavaScript errors** - shows toast + logs to Sentry

No additional setup required - it's initialized on page load.

---

## Testing Error Scenarios

### Manual Testing

1. **Network Offline**
   - Open Tasks page
   - Disconnect network (Dev Tools → Network → Offline)
   - Try to create a task
   - **Expected:** "No internet connection" toast appears
   - Reconnect network
   - **Expected:** "Back online" toast appears

2. **Rate Limiting**
   - Spam an endpoint rapidly (6+ times)
   - **Expected:** "Too many requests, wait X seconds" toast

3. **CSRF Token Expiry**
   - Wait 1 hour (or manually expire CSRF cookie)
   - Submit a form
   - **Expected:** "Security token expired. Please refresh the page."

4. **Server Error (500)**
   - Temporarily break backend
   - Trigger broken endpoint
   - **Expected:** "Server error. Our team has been notified."

### Sentry Integration

All errors are automatically logged to Sentry in production with:
- Component name (`component` option)
- Action name (`action` option)
- Full stack trace
- User context

Check Sentry dashboard after each deployment to verify error capture.

---

## API Reference

### `safeFetch(url, options)`

Enhanced fetch wrapper with automatic CSRF token injection and error handling.

**Parameters:**
- `url` (string): The URL to fetch
- `options` (object): Standard fetch options (method, headers, body, etc.)

**Returns:** `Promise<Response>` - The fetch response (only if successful)

**Throws:** Typed errors (NetworkError, ValidationError, etc.)

### `handleError(error, userMessage, options)`

Consistent error handling with user-friendly messages and Sentry logging.

**Parameters:**
- `error` (Error): The error object
- `userMessage` (string): User-friendly message to display (optional)
- `options` (object): Additional options
  - `component` (string): Component name for logging
  - `action` (string): Action name for logging
  - `retry` (function): Retry callback function

**Returns:** `void`

### `isNetworkOnline()`

Check if the user is currently online.

**Returns:** `boolean` - True if online, false otherwise

---

## Related Documentation

- [Security Guide](SECURITY.md) - Authentication, CSRF protection, rate limiting
- [Toast System](TOAST-SYSTEM.md) - Typed notifications with queuing and actions
- [Deployment Guide](DEPLOYMENT.md) - Production setup including Sentry integration

---

*Last updated: February 2026*
