# iOS PWA Viewport Shrinking Bug

## The Problem

On iOS Safari in PWA standalone mode (`apple-mobile-web-app-status-bar-style: black-translucent`),
`overflow: hidden` on `<html>` or `<body>` causes the browser to **shrink the CSS viewport** by
`safe-area-inset-top` (59px on iPhone 15 Pro Max).

This makes `100dvh`, `100vh`, `window.innerHeight`, and all CSS viewport units report a
**smaller value** than the physical screen height:

| Metric | Without overflow:hidden | With overflow:hidden |
|--------|------------------------|---------------------|
| screen.height | 932px | 932px |
| window.innerHeight | 932px | **873px** |
| 100dvh | 932px | **873px** |
| 100vh | 932px | **873px** |
| safe-area-inset-top | 59px | 59px |

The difference (932 - 873 = 59) exactly equals `safe-area-inset-top`.

## Root Cause

Per the CSS Overflow spec, `overflow` set on the root element (`<html>`) **propagates to the
viewport**. iOS Safari then treats the viewport as having `overflow: hidden`, and for PWA
standalone mode with `black-translucent` status bar, it excludes the status bar safe area
from the viewport height calculation.

Two sources set `overflow: hidden` on the root element:

1. **Pico CSS** (`pico.min.css`) — sets `overflow-x: hidden` on `:root`
2. **Mobile body-scroll-lock** (`mobile.css`) — sets `overflow: hidden !important` on `html, body`
   to prevent body-level scrolling (page containers scroll internally)

When either propagates to the viewport, the viewport shrinks.

## The Fix

In `mobile.css`, inside `@media (display-mode: standalone)`:

```css
html, body {
    overflow: visible !important;  /* Prevent viewport shrinking */
    height: auto !important;       /* Kill height:100% from body-scroll-lock */
    min-height: 0 !important;      /* Kill -webkit-fill-available from app.css */
}
```

This **only affects PWA standalone mode**. In browser mode, the body-scroll-lock and Pico
overflow rules still apply normally (the viewport shrinking bug doesn't manifest in browser
mode because there's no status bar safe area).

## Why This Works

- `overflow: visible !important` prevents the root overflow from propagating `hidden` to the viewport
- `height: auto !important` overrides `height: 100%` from the mobile body-scroll-lock, which
  would constrain html/body to the (potentially shrunken) viewport size
- `min-height: 0 !important` overrides `min-height: -webkit-fill-available` from app.css, which
  also interacts with the viewport calculation on iOS

## How to Verify

1. Open the PWA on an iPhone
2. Go to Settings → footer → "PWA Debug" link
3. Check that `100dvh` equals `screen.height` (e.g., both 932px on iPhone 15 Pro Max)
4. If `100dvh < screen.height`, the viewport is shrunk — check for new overflow:hidden rules

## Rules to Prevent Recurrence

1. **Never set `overflow: hidden` on `html` or `body` in PWA standalone mode** — it shrinks the viewport
2. **Never set `height: 100%` or fixed heights on `html`/`body` in PWA mode** — use `auto`
3. **If adding a CSS framework or reset**, check if it sets `overflow` on `:root` or `body`
4. Page-level scroll should be handled by page containers (`.tasks-panel`, `.settings-page`, etc.),
   not by body-level overflow

## Debug Tools

- **Static debug page**: `/static/debug-pwa.html` — standalone viewport diagnostic (no app CSS)
- **Settings footer link**: "PWA Debug" → opens the static debug page
- The static page reports viewport dimensions, CSS unit values, safe area insets, standalone
  detection, and element bounding rects

## Affected Devices

Any iOS device with a notch/Dynamic Island running in PWA standalone mode:
- iPhone 15 Pro Max (safe-area-inset-top: 59px)
- iPhone 14/15 series (varies by model)
- Any future iPhone with status bar safe area

## References

- CSS Overflow spec: root element overflow propagation to viewport
- WebKit bug: viewport height excludes status bar when overflow:hidden propagates
- `viewport-fit=cover` + `apple-mobile-web-app-status-bar-style: black-translucent`
