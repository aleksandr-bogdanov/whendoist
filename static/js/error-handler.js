/**
 * Error Handler Utility
 *
 * Standardizes error handling across the application:
 * - Logs technical details to console for debugging
 * - Shows user-friendly toast notifications
 * - Provides CSRF token helper for fetch requests
 *
 * v0.24.0: Security Hardening
 */
(function() {
    'use strict';

    // ==========================================================================
    // CSRF Token Handling
    // ==========================================================================

    /**
     * Get the CSRF token from the meta tag.
     * @returns {string|null} The CSRF token or null if not found
     */
    function getCSRFToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : null;
    }

    /**
     * Get headers object with CSRF token included.
     * Use this for all POST/PUT/DELETE/PATCH requests.
     *
     * @param {Object} additionalHeaders - Additional headers to include
     * @returns {Object} Headers object with CSRF token
     *
     * @example
     * fetch('/api/v1/tasks', {
     *     method: 'POST',
     *     headers: getCSRFHeaders({ 'Content-Type': 'application/json' }),
     *     body: JSON.stringify(data)
     * });
     */
    function getCSRFHeaders(additionalHeaders = {}) {
        const token = getCSRFToken();
        const headers = { ...additionalHeaders };

        if (token) {
            headers['X-CSRF-Token'] = token;
        }

        return headers;
    }

    // ==========================================================================
    // Error Handling
    // ==========================================================================

    /**
     * Handle an error consistently across the application.
     *
     * @param {Error|string} error - The error object or message
     * @param {string} userMessage - User-friendly message to display (optional)
     * @param {Object} options - Additional options
     * @param {string} options.component - Component name for logging
     * @param {string} options.action - Action name for logging
     * @param {Function} options.retry - Retry callback function
     *
     * @example
     * try {
     *     await safeFetch('/api/v1/tasks');
     * } catch (error) {
     *     handleError(error, 'Failed to load tasks', {
     *         component: 'task-list',
     *         action: 'loadTasks',
     *         retry: () => loadTasks()
     *     });
     * }
     */
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
        if (window.Toast && typeof Toast.error === 'function') {
            if (recoveryAction) {
                Toast.error(message, { action: recoveryAction });
            } else {
                Toast.error(message);
            }
        } else {
            // Fallback to console warning if Toast not available
            console.warn('[User Message]', message);
        }
    }

    // ==========================================================================
    // Custom Error Classes
    // ==========================================================================

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

    // ==========================================================================
    // Network Status Detection
    // ==========================================================================

    let isOnline = navigator.onLine;
    let offlineToastShown = false;

    function setupNetworkMonitoring() {
        window.addEventListener('online', () => {
            isOnline = true;
            offlineToastShown = false;

            if (window.Toast && typeof Toast.success === 'function') {
                Toast.success('Back online');
            }

            // Trigger event for other modules to retry failed requests
            window.dispatchEvent(new CustomEvent('network:online'));
        });

        window.addEventListener('offline', () => {
            isOnline = false;

            if (window.Toast && typeof Toast.warning === 'function' && !offlineToastShown) {
                Toast.warning('No internet connection');
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

    /**
     * Enhanced fetch wrapper that automatically includes CSRF token
     * and handles common errors.
     *
     * @param {string} url - The URL to fetch
     * @param {Object} options - Fetch options (method, body, headers, etc.)
     * @returns {Promise<Response>} The fetch response
     * @throws {Error} If the response is not ok
     *
     * @example
     * const response = await safeFetch('/api/v1/tasks', {
     *     method: 'POST',
     *     headers: { 'Content-Type': 'application/json' },
     *     body: JSON.stringify({ title: 'New Task' })
     * });
     */
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

    // ==========================================================================
    // Exports
    // ==========================================================================

    // Export to window for global access
    window.handleError = handleError;
    window.getCSRFToken = getCSRFToken;
    window.getCSRFHeaders = getCSRFHeaders;
    window.safeFetch = safeFetch;
    window.isNetworkOnline = isNetworkOnline;

    // Export error classes
    window.NetworkError = NetworkError;
    window.ValidationError = ValidationError;
    window.AuthError = AuthError;
    window.CSRFError = CSRFError;
    window.NotFoundError = NotFoundError;
    window.RateLimitError = RateLimitError;
    window.ServerError = ServerError;
    window.HTTPError = HTTPError;

})();
