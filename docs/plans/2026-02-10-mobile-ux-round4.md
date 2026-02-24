# Mobile UX Round 4: Critical Fixes (Feb 10, 2026)

> Fixes based on real-device screenshot review after v0.42.53 shipped.
> Predecessor: `docs/archive/2026-02-10-mobile-ux-round3.md`

---

## Issues Fixed

### PR #124 — v0.42.54/fix: JS gesture fixes (P0)

**Root cause: `\!` syntax error in PR #123**

Both `task-swipe.js:270` and `mobile-sheet.js:354` had `\!isCompleted` (backslash-exclamation) instead of `!isCompleted`. In JavaScript, `\` is only valid inside string/regex literals — in regular code it's a syntax error that prevents the ENTIRE file from parsing. This killed:
- Swipe right (complete) — `TaskSwipeHandler` class never defined
- Swipe left (schedule) — same file
- Long press — `LongPressHandler` class in same file
- Bottom sheet actions — `TaskActionSheet` class in mobile-sheet.js

**Additional fixes:**
- `scheduleTask()` called `window.MobileTabs.switchTo()` on the class constructor, not the singleton instance. Fixed to use `window.getMobileTabs()?.switchTo()`.
- Tab switching didn't save/restore `scrollTop`, causing sticky headers to end up half-visible when returning to Tasks tab.

### PR #125 — v0.42.55/fix: CSS layout fixes (P1-P2)

1. **Gradient bar**: `task-list-header::after` was invisible because the parent is `display: flex` on mobile, making the `::after` a zero-width flex item. Fixed with `position: absolute; bottom: 0; left: 0; right: 0`.

2. **Sort arrow shift**: Mobile `opacity: 0` rule lost specificity to desktop `.header-sort:hover .sort-icon { opacity: 1 }`. Fixed with `!important`.

3. **Column alignment**: Full labels "Duration" and "Impact" overflowed their 32px/24px fixed widths. Widened to 40px/32px in both header sorts and task meta spans.

4. **Energy label**: Added `!important` to `margin-left: 0` to ensure desktop `margin-left: 34px` is overridden.

5. **Child task date**: Changed breadcrumb layout from `flex-direction: column` to `flex-wrap: wrap` with `width: 100%` on breadcrumb, so `.task-due` stays inline on line 2 instead of stacking as line 3.

### PR #126 — v0.42.56/fix: Swipe + layout hotfix

**Root cause: `const`/`var` redeclaration SyntaxError (hidden behind `\!` fix)**

`task-swipe.js` line 253 had `const isCompleted = ...` at function scope, and line 268 had `var isCompleted = ...` inside a block. Since `var` hoists to function scope, it collides with the existing `const`, causing a SyntaxError that (again) prevents the entire file from parsing. This was masked by the `\!` error in PR #124 — fixing `\!` revealed this second parse error.

**Additional fixes:**
- Desktop header: `--col-duration: 48px` too narrow for "DURATION" at 11px uppercase → increased to 60px
- Sort arrow: `position: absolute` instead of `display: inline` so empty arrow never causes layout shift
- Mobile sort labels: compact ("DUR"/"IMP"/"CLR") instead of full ("DURATION"/"IMPACT"/"CLARITY") which overflowed fixed-width columns
- Calendar toolbar: `bottom: 1rem` hidden behind mobile tab bar → increased to clear tab bar height + safe area
- SCHEDULED section: override grid to flex on mobile, hide column labels

---

## Files Changed

| PR | File | Change |
|----|------|--------|
| #124 | `static/js/task-swipe.js` | `\!` → `!`, MobileTabs instance call |
| #124 | `static/js/mobile-sheet.js` | `\!` → `!` |
| #124 | `static/js/mobile-tabs.js` | Save/restore scrollTop on tab switch |
| #125 | `static/css/mobile.css` | Gradient bar, sort arrow, column widths, energy margin, breadcrumb layout |
| #126 | `static/js/task-swipe.js` | Remove const/var redeclaration, block-scoped `const` |
| #126 | `static/css/tokens.css` | `--col-duration: 48px` → `60px` |
| #126 | `static/css/mobile.css` | Sort-icon absolute, compact labels, calendar toolbar bottom, SCHEDULED flex |
