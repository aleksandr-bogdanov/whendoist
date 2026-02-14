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

## Root Causes

There are **two independent triggers** for this viewport shrink bug:

### Trigger 1: `overflow: hidden` on root

Per the CSS Overflow spec, `overflow` set on the root element (`<html>`) **propagates to the
viewport**. iOS Safari then treats the viewport as having `overflow: hidden`, and for PWA
standalone mode with `black-translucent` status bar, it excludes the status bar safe area
from the viewport height calculation.

Two sources set `overflow: hidden` on the root element:

1. **Pico CSS** (`pico.min.css`) — sets `overflow-x: hidden` on `:root`
2. **Mobile body-scroll-lock** (`mobile.css`) — sets `overflow: hidden !important` on `html, body`
   to prevent body-level scrolling (page containers scroll internally)

When either propagates to the viewport, the viewport shrinks.

### Trigger 2: `position: fixed` on all page content (v0.45.47 discovery)

When **all visible content** uses `position: fixed`, every element is taken out of normal
document flow. This causes `<html>` and `<body>` to collapse to **0px height** (no in-flow
children). iOS Safari interprets this zero-height body as having no content and shrinks
the viewport — even if `overflow: visible` is set.

Debug data from iPhone 15 Pro Max confirmed this:

| Page | Container position | html height | window.innerHeight |
|------|-------------------|-------------|-------------------|
| Tasks | `static` | 947px | **932px** (full) |
| Thoughts | `fixed` | 0px | **873px** (shrunk) |

The fix: page containers must use `position: static` (the default), so they remain in normal
flow and give html/body non-zero content height.

### Trigger 3: `100dvh` / `innerHeight` underreporting (v0.45.48 discovery)

Even with triggers 1 and 2 fixed, `100dvh` and `window.innerHeight` can still report 873px
instead of 932px on some pages. The viewport height calculation in iOS Safari's standalone
mode is fundamentally unreliable.

`screen.height` is always correct — it always returns the true physical viewport height in
CSS pixels (932px on iPhone 15 Pro Max).

The fix: set `--app-height` to `screen.height` via JavaScript (inline `<script>` in `<head>`
for first paint, and `mobile-core.js` for resize events). CSS standalone blocks use
`height: var(--app-height, 100vh) !important` instead of `100dvh`.

## The Fix

Three layers of defense:

### 1. Overflow fix — in `mobile.css`, `@media (display-mode: standalone)`:

```css
html, body {
    overflow: visible !important;  /* Prevent viewport shrinking */
    height: auto !important;       /* Kill height:100% from body-scroll-lock */
    min-height: 0 !important;      /* Kill -webkit-fill-available from app.css */
}
```

### 2. Position fix — page containers must NOT use `position: fixed`:

```css
/* In general mobile block */
.settings-page { height: var(--app-height, 100vh); /* position: static (default) */ }
```

### 3. Height fix — use `screen.height` via JS instead of `100dvh`:

```html
<!-- In <head>, before CSS layout -->
<script>
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
    document.documentElement.style.setProperty('--app-height', screen.height + 'px');
}
</script>
```

```css
/* In standalone CSS block */
.settings-page { height: var(--app-height, 100vh) !important; }
```

## Why This Works

- **Overflow fix**: `overflow: visible !important` prevents root overflow from propagating to the viewport
- **Position fix**: `position: static` keeps page containers in normal flow → html/body have non-zero height
- **Height fix**: `screen.height` is always the correct physical viewport height in CSS pixels, unaffected by the iOS viewport calculation bug. `100dvh` and `innerHeight` are unreliable.

## How to Verify

1. Open the PWA on an iPhone
2. Go to Settings → footer → "PWA Debug" link
3. Check that `100dvh` equals `screen.height` (e.g., both 932px on iPhone 15 Pro Max)
4. If `100dvh < screen.height`, the viewport is shrunk — check for new overflow:hidden rules

## Rules to Prevent Recurrence

1. **Never set `overflow: hidden` on `html` or `body` in PWA standalone mode** — it shrinks the viewport
2. **Never set `height: 100%` or fixed heights on `html`/`body` in PWA mode** — use `auto`
3. **Never use `position: fixed` on page containers** — it removes them from flow, collapsing
   html/body to 0px height, which triggers the viewport shrink even with `overflow: visible`
4. **Page containers must stay in normal flow** — use `height: var(--app-height, 100vh)` with
   `height: 100dvh !important` in `@media (display-mode: standalone)`
5. **If adding a CSS framework or reset**, check if it sets `overflow` on `:root` or `body`
6. Page-level scroll should be handled by page containers (`.tasks-panel`, `.settings-page`, etc.),
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
