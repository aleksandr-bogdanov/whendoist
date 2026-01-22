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
     * fetch('/api/tasks', {
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
     *
     * @example
     * try {
     *     await fetch('/api/tasks');
     * } catch (error) {
     *     handleError(error, 'Failed to load tasks');
     * }
     */
    function handleError(error, userMessage) {
        // Log technical details for debugging
        console.error('[Whendoist Error]', error);

        // Determine message to show
        const message = userMessage || 'Something went wrong';

        // Show toast notification if Toast is available
        if (window.Toast && typeof Toast.show === 'function') {
            Toast.show(message, { showUndo: false });
        } else {
            // Fallback to console warning if Toast not available
            console.warn('[User Message]', message);
        }
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
     * const response = await safeFetch('/api/tasks', {
     *     method: 'POST',
     *     headers: { 'Content-Type': 'application/json' },
     *     body: JSON.stringify({ title: 'New Task' })
     * });
     */
    async function safeFetch(url, options = {}) {
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

        const response = await fetch(url, options);

        // Handle common error status codes
        if (!response.ok) {
            if (response.status === 403) {
                // Could be CSRF error - check response
                const data = await response.json().catch(() => ({}));
                if (data.detail && data.detail.includes('CSRF')) {
                    // CSRF token expired/invalid - reload page to get new token
                    console.error('CSRF token invalid - page may need refresh');
                    throw new Error('Session expired. Please refresh the page.');
                }
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
    }

    // ==========================================================================
    // Exports
    // ==========================================================================

    // Export to window for global access
    window.handleError = handleError;
    window.getCSRFToken = getCSRFToken;
    window.getCSRFHeaders = getCSRFHeaders;
    window.safeFetch = safeFetch;

})();
