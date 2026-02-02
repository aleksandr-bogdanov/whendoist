/**
 * Whendoist Service Worker
 * Provides offline caching and PWA functionality.
 *
 * Caching Strategy:
 * - Static assets: Cache First (CSS, JS, images)
 * - API requests: Network First with cache fallback
 * - HTML pages: Network First with offline fallback
 */

const CACHE_VERSION = 'v6';
const STATIC_CACHE = `whendoist-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `whendoist-dynamic-${CACHE_VERSION}`;
const API_CACHE = `whendoist-api-${CACHE_VERSION}`;

// Static assets to precache
const PRECACHE_ASSETS = [
    '/',
    '/static/css/app.css',
    '/static/css/tokens.css',
    '/static/css/dashboard.css',
    '/static/css/dialog.css',
    '/static/css/mobile.css',
    '/static/js/device-detection.js',
    '/static/js/haptics.js',
    '/static/js/mobile-sheet.js',
    '/static/js/mobile-tabs.js',
    '/static/js/mobile-core.js',
    '/static/js/task-swipe.js',
    '/static/js/toast.js',
    '/static/js/drag-drop.js',
    '/static/js/task-dialog.js',
    '/static/js/task-complete.js',
    '/static/js/crypto.js',
    '/static/img/brand/w-icon-color.svg',
    '/static/img/icons/ui-icons.svg'
];

// Patterns for cache strategies
const CACHE_PATTERNS = {
    static: /\.(css|js|woff2?|ttf|png|jpg|jpeg|gif|svg|ico|webp)$/,
    api: /\/api\//,
    html: /\/(?!api\/).*$/
};

// =============================================================================
// Install Event - Precache static assets
// =============================================================================

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] Precaching static assets');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .then(() => {
                // Skip waiting to activate immediately
                return self.skipWaiting();
            })
            .catch(err => {
                console.error('[SW] Precache failed:', err);
            })
    );
});

// =============================================================================
// Activate Event - Clean up old caches
// =============================================================================

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => {
                            // Delete old version caches
                            return name.startsWith('whendoist-') &&
                                   !name.endsWith(CACHE_VERSION);
                        })
                        .map(name => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                // Take control of all pages immediately
                return self.clients.claim();
            })
    );
});

// =============================================================================
// Fetch Event - Serve from cache or network
// =============================================================================

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip cross-origin requests (except for fonts/images)
    if (url.origin !== self.location.origin) {
        // Allow Google Fonts and similar
        if (!url.hostname.includes('fonts.googleapis.com') &&
            !url.hostname.includes('fonts.gstatic.com')) {
            return;
        }
    }

    // Choose strategy based on request type
    if (CACHE_PATTERNS.static.test(url.pathname)) {
        // Static assets: Cache First
        event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    } else if (CACHE_PATTERNS.api.test(url.pathname)) {
        // API requests: Network First
        event.respondWith(networkFirst(event.request, API_CACHE));
    } else {
        // HTML pages: Network First with offline fallback
        event.respondWith(networkFirstWithOffline(event.request, DYNAMIC_CACHE));
    }
});

// =============================================================================
// Caching Strategies
// =============================================================================

/**
 * Cache First Strategy
 * Try cache, fall back to network, update cache
 */
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    if (cached) {
        // Return cached, but update in background
        updateCache(request, cacheName);
        return cached;
    }

    // Fetch from network
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        console.error('[SW] Cache first fetch failed:', err);
        return new Response('Offline', { status: 503 });
    }
}

/**
 * Network First Strategy
 * Try network, fall back to cache
 */
async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        // Network failed, try cache
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }

        // Return offline JSON for API
        return new Response(
            JSON.stringify({ error: 'offline', message: 'You are offline' }),
            {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

/**
 * Network First with Offline Fallback
 * Try network, fall back to cache, show offline page
 */
async function networkFirstWithOffline(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        // Network failed, try cache
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }

        // Return offline page
        return createOfflinePage();
    }
}

/**
 * Update cache in background
 */
async function updateCache(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response);
        }
    } catch (err) {
        // Ignore network errors during background update
    }
}

/**
 * Create offline fallback page
 */
function createOfflinePage() {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Offline - Whendoist</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #F8FAFC;
            color: #0B1220;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 24px;
        }
        .offline-container {
            text-align: center;
            max-width: 320px;
        }
        .offline-icon {
            font-size: 4rem;
            margin-bottom: 24px;
        }
        h1 {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 12px;
        }
        p {
            color: #64748B;
            margin-bottom: 24px;
            line-height: 1.5;
        }
        button {
            background: #6D5EF6;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
        }
        button:active {
            transform: scale(0.97);
        }
    </style>
</head>
<body>
    <div class="offline-container">
        <div class="offline-icon">📡</div>
        <h1>You're offline</h1>
        <p>Check your connection and try again. Your changes will sync when you're back online.</p>
        <button onclick="location.reload()">Try Again</button>
    </div>
</body>
</html>
    `;

    return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
    });
}

// =============================================================================
// Message Handler - Cache management from main thread
// =============================================================================

self.addEventListener('message', (event) => {
    const { type, payload } = event.data;

    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'CLEAR_CACHE':
            caches.keys().then(names => {
                names.forEach(name => caches.delete(name));
            });
            break;

        case 'CACHE_URLS':
            if (payload?.urls) {
                caches.open(STATIC_CACHE).then(cache => {
                    cache.addAll(payload.urls);
                });
            }
            break;
    }
});

// =============================================================================
// Background Sync (for offline actions)
// =============================================================================

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-tasks') {
        event.waitUntil(syncTasks());
    }
});

async function syncTasks() {
    // Get pending operations from IndexedDB
    // This would be implemented with a proper offline queue
    console.log('[SW] Syncing tasks...');
}

// =============================================================================
// Push Notifications (placeholder)
// =============================================================================

self.addEventListener('push', (event) => {
    if (!event.data) return;

    const data = event.data.json();
    const options = {
        body: data.body || 'You have a notification',
        icon: '/static/img/brand/app-icon-512.svg',
        badge: '/static/img/brand/w-icon-color.svg',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/'
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Whendoist', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = event.notification.data?.url || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window' })
            .then(windowClients => {
                // Focus existing window if available
                for (const client of windowClients) {
                    if (client.url === url && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Open new window
                return clients.openWindow(url);
            })
    );
});

console.log('[SW] Service worker loaded');
