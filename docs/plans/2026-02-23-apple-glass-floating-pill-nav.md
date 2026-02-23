---
version:
pr:
created: 2026-02-23
---

# Apple Glass: Floating Pill Bottom Navigation

## Context

The current full-width bottom nav bar sits flush at `bottom: 0`, conflicting with the iOS home indicator on modern iPhones. Removing safe-area padding causes touch target overlap; adding it creates an empty dead zone below the icons. The "Apple Glass" approach (used by Todoist, Telegram, and native iOS apps) solves this: a floating pill-shaped tab bar with frosted glass, positioned above the home indicator, with the safe area below showing through transparently.

## Changes

### 1. CSS custom properties + updated `pb-nav-safe` (`globals.css`)

Add pill dimension variables to `:root`:
```css
--nav-pill-height: 3.5rem;    /* 56px, same h-14 */
--nav-pill-mx: 0.75rem;       /* 12px side margins */
--nav-pill-mb: 0.5rem;        /* 8px min bottom margin */
--nav-pill-radius: 1.5rem;    /* 24px rounded corners */
```

Update `pb-nav-safe` to account for safe area + floating offset:
```css
@utility pb-nav-safe {
  padding-bottom: calc(
    env(safe-area-inset-bottom, 0px) +
    var(--nav-pill-mb) +
    var(--nav-pill-height) +
    0.25rem
  );
}
```

### 2. MobileNav floating pill (`mobile-nav.tsx`)

Replace the full-width bar with a floating pill:
- **Position**: `fixed`, `left/right: var(--nav-pill-mx)`, `bottom: calc(env(safe-area-inset-bottom,0px) + var(--nav-pill-mb))`
- **Shape**: `rounded-[var(--nav-pill-radius)]` (pill)
- **Glass**: `backdrop-blur-xl bg-background/70` (stronger blur, more transparent)
- **Border**: `border border-border/50` (all-around, semi-transparent)
- **Shadow**: `shadow-lg` with light/dark mode opacity variants
- **FAB**: Keep `-mt-5` protrusion above the pill

### 3. Dependent positioning updates

- `demo-pill.tsx`: Update `bottom-20` to `bottom-[calc(env(safe-area-inset-bottom,0px)+var(--nav-pill-mb)+var(--nav-pill-height)+0.75rem)]`
- `gesture-discovery.tsx`: Same bottom offset update

### Files

| File | Action |
|------|--------|
| `frontend/src/styles/globals.css` | Add vars, update `pb-nav-safe` |
| `frontend/src/components/layout/mobile-nav.tsx` | Rewrite to floating pill |
| `frontend/src/components/demo-pill.tsx` | Update bottom position |
| `frontend/src/components/gesture-discovery.tsx` | Update bottom position |

## Verification

1. `cd frontend && npx tsc --noEmit && npx biome check . && npm run build`
2. Test on iPhone PWA: pill floats above home indicator, glass blur visible
3. Test on non-notch device: pill has 8px bottom margin
4. Verify FAB is tappable, content scrolls behind pill with blur visible
5. Verify demo-pill and gesture-discovery hints sit above the nav pill
6. Verify dark mode appearance (shadow, glass opacity)
