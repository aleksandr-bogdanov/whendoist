---
version: v0.55.4
pr: 499
created: 2026-02-25
---

# Sticky Domain Label in Column Headers + Alignment Fix

## Context

The legacy frontend had a sticky header row that showed **both** the current domain name/emoji AND the sort column labels (Clarity, Duration, Impact) in one row. As the user scrolled past a domain section, the domain name faded in on the left side of that sticky row. The new React frontend has this behavior only on mobile (via `StickyDomainHeader`), but the desktop `ColumnHeaders` just has an empty spacer on the left.

Additionally, the Clarity/Duration/Impact column headers are misaligned with the actual metadata pills in task rows. The headers are shifted ~15px to the left at `lg` breakpoint due to a padding mismatch (`lg:px-8` on headers vs `sm:p-4` on the content wrapper + 1px card border).

## Changes

### 1. Fix Column Alignment (`sort-controls.tsx`)

**Root cause**: `ColumnHeaders` has `px-2 sm:px-4 lg:px-8` while task rows sit inside a `p-2 sm:p-4` content wrapper + a `DomainGroup` card with 1px border. At `lg`, the header has 32px right padding vs ~17px for task content = 15px shift.

**Fix**: Change header padding from `px-2 sm:px-4 lg:px-8` to `pl-2 sm:pl-4 pr-[calc(0.5rem+1px)] sm:pr-[calc(1rem+1px)]` to account for the 1px card border exactly.

### 2. Add Sticky Domain Label to Column Headers (`sort-controls.tsx`)

Add scroll-based domain detection directly in `ColumnHeaders` (desktop only). Replace the empty `flex-1` spacer with an animated domain label showing the current domain's emoji + name + task count.

**Behavior** (matching legacy `sticky-domain.js`):
- When a domain header scrolls behind the sticky column headers, the domain name fades in (opacity 0 → 0.85)
- The label's `flex-grow` also animates from 0 → 1, pushing sort columns to the right
- When the next domain header approaches, the current label crossfades out
- Uses `requestAnimationFrame` for smooth 60fps scroll tracking

**Implementation**: Add a `useEffect` with scroll listener inside `ColumnHeaders` that:
1. Finds all `[data-domain-group]` elements
2. Determines which group spans the header's bottom edge
3. Calculates enter progress and exit fade (same algorithm as `StickyDomainHeader`)
4. Renders domain icon + name + count pill with animated opacity and flex-grow

**No changes to `StickyDomainHeader`** — it remains the mobile-only implementation.

## Files Modified

- `frontend/src/components/dashboard/sort-controls.tsx` — both fixes

## Verification

1. `cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build`
2. Visual check: column headers should align perfectly with task metadata pills
3. Visual check: scrolling through domains should show domain name fading in/out in the header row
