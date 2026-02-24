# Domain Header Arrow Bug — Investigation & Fix

## Problem

A small right-pointing arrow/chevron/triangle persistently appears in domain group
headers (e.g. "Leisure 5", "Music Hustle 14") in the task list. It shows in Arc,
Safari, and Chrome. It survived 11 CSS-only fix attempts.

## Root Cause

**Pico CSS** — not the browser's native `<details>` disclosure marker.

Pico CSS defines an accordion chevron via `details summary::after`:

```css
/* From Pico CSS (the framework) */
details summary::after {
    display: block;
    width: 1rem;
    height: 1rem;
    margin-inline-start: calc(var(--pico-spacing, 1rem) * .5);
    float: right;
    transform: rotate(-90deg);                     /* points right when closed */
    background-image: var(--pico-icon-chevron);     /* inline SVG chevron */
    background-position: right center;
    background-size: 1rem auto;
    background-repeat: no-repeat;
    content: "";
    transition: transform var(--pico-transition);
}

details[open] > summary::after {
    transform: rotate(0);                           /* points down when open */
}
```

The SVG is an inline data URI of a down-pointing chevron polyline:
```
data:image/svg+xml,%3Csvg ... stroke='rgb(136, 145, 164)' ...%3E%3Cpolyline points='6 9 12 15 18 9'%3E...
```

## Why 11 Fixes Failed

All previous attempts targeted the **browser's native disclosure marker**, not
Pico's `::after`:

| Attempt | Target | Why It Failed |
|---------|--------|--------------|
| `list-style: none` | Native marker | Pico uses `::after`, not `::marker` |
| `::-webkit-details-marker { display: none }` | WebKit marker | Pico uses `::after`, not `::-webkit-details-marker` |
| `::marker { content: none; display: none }` | Standard marker | Pico uses `::after`, not `::marker` |
| `.project-header::before { display: none }` | Custom triangle | Removed our own triangle but not Pico's |
| `display: block !important` on summary | Native marker | Suppresses native marker but not Pico's `::after` |
| Wrapping in inner `<div>` | Native marker | Changes summary layout but Pico still injects `::after` |
| Combinations of above | All native | None targets Pico's `details summary::after` |

The key insight: `::after` is **not** a standard browser disclosure mechanism. It's
a **CSS framework convention** used by Pico CSS for its accordion component. The
browser's native disclosure triangle uses `::marker` (modern) or
`::-webkit-details-marker` (legacy WebKit). These are completely separate from
`::after`.

## Other Pico CSS Rules Affecting `<details>`/`<summary>`

Pico also applies these rules that interact with the project-group:

```css
details summary {
    line-height: 1rem;
    list-style-type: none;
    cursor: pointer;
    transition: color var(--pico-transition);
}

details summary:not([role]) {
    color: var(--pico-accordion-close-summary-color);
}

details[open] > summary {
    margin-bottom: var(--pico-spacing);       /* adds bottom margin! */
}

details[open] > summary:not([role]):not(:focus) {
    color: var(--pico-accordion-open-summary-color);
}

details summary::marker {
    display: none;
}
```

Note: `details[open] > summary { margin-bottom: var(--pico-spacing) }` adds spacing
between the header and task list. This may need attention separately.

## Fix

Add one rule to `static/css/dashboard.css` after the existing marker suppression
rules:

```css
/* Override Pico CSS accordion chevron (details summary::after with background-image) */
.project-group > summary::after {
    display: none !important;
}
```

This is safe because:
- `.project-group > summary` has no intentional `::after` pseudo-element
- `.section-group > summary` (Scheduled/Completed separators) is NOT affected —
  their `.section-separator::after` creates an intentional trailing line with higher
  specificity than Pico's rule
- The left disclosure triangles on section separators use `::before` (not `::after`)
  and are completely unaffected

## How It Was Found

Used Playwright + Chrome DevTools Protocol (CDP) to:

1. **Baseline screenshot** — confirmed the arrow was visible
2. **Diagnostic CSS injection** — colored `::before` red, `::after` blue, `::marker`
   lime green. Only blue (::after) was visible → identified the pseudo-element
3. **CDP `CSS.getMatchedStylesForNode`** — dumped all matched CSS rules for the
   summary element, including pseudo-element styles. Found the Pico CSS rule
   `details summary::after` with `background-image: var(--pico-icon-chevron)`
4. **Verified fix** — applied `display: none !important`, took screenshots in both
   open and collapsed states, confirmed arrow gone and left triangles preserved

## Session Details

- Date: 2026-02-07
- Pico CSS stylesheet ID (from CDP): `style-sheet-40902-22`
- Browsers confirmed affected: Arc, Safari, Chrome (all use WebKit/Blink)
- Headless Chromium also showed the `::after` element in DOM inspection
