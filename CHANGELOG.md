# Changelog

Development history of Whendoist, condensed into major milestones.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## v0.42.85 — 2026-02-11

### Fixed
- **Seamless glass header (mobile)** — Fixed broken `::before` pseudo approach from v0.42.84 that created a blank gap. Instead, the `.task-list-header` itself extends upward behind the transparent fixed site-header using `margin-top: -var(--header-h)` + `padding-top: var(--header-h)`. One continuous glass element covers both header areas — no seam, no gap.

---

## v0.42.84 — 2026-02-10

### Fixed
- **Unified glass layer (mobile)** — Replaced two separate `backdrop-filter` panels (site-header + task-list-header) with a single `::before` pseudo on `.task-list-container`. Both headers are now transparent; the glass comes from one element — no seam, no boundary artifact. Hidden spectrum bar between headers.

---

## v0.42.83 — 2026-02-10

### Changed
- **Glass site header with scroll-through content (mobile)** — Restructured mobile layout so `.tasks-panel` is the scroll container (was `.task-list-container`). Site header is now `position: fixed` with real glass (`rgba white 0.72` + 20px blur). Task content scrolls behind both the site-header and task-list-header, making the frosted glass effect actually visible.
- **CSS custom property `--header-h`** — Header height token (44px, or 44px + safe-area in PWA) used for sticky offset and scroll padding
- **Updated scroll container in JS** — `sticky-domain.js`, `mobile-core.js`, `mobile-tabs.js` all updated to use `.tasks-panel` as the scroll container

---

## v0.42.82 — 2026-02-10

### Fixed
- **Truly transparent site header (mobile)** — Removed backdrop-filter and background entirely. Glass blur over a static white canvas is invisible (nothing scrolls behind the site-header), so 2% opacity + blur still rendered as solid white. Now `background: transparent` with no filter — seamless with page background.

---

## v0.42.81 — 2026-02-10

### Changed
- **Transparent site header (mobile)** — Light mode site header now uses ultra-transparent glass (`rgba(255,255,255,0.02)` + 50px blur) matching the task-list-header
- **Smaller CSS chevrons** — Domain collapse chevrons reduced from 7px to 5px for a subtler look
- **Larger domain names** — `.project-name` font bumped from 0.9rem to 0.95rem
- **Sticky domain count pill** — Task count in sticky header now renders as a pill badge (matching actual domain headers) instead of plain text

---

## v0.42.80 — 2026-02-10

### Changed
- **White canvas background** — `--bg-canvas` changed from slate-50 to pure white, making glass navbar truly transparent
- **CSS chevrons** — Replaced `▶` emoji arrows on domain collapse headers with clean CSS-drawn chevrons
- **Chevron animation** — Right-pointing when collapsed, rotates down when expanded

---

## v0.42.79 — 2026-02-10

### Changed
- **SVG tab icons** — Replaced emoji tab icons (📋/📅) with SVG sprite references for consistent rendering
- **Font-weight fixes** — Remapped 13 invalid font-weight values to Nunito's loaded range (400-700)
- **Pico form font** — Override `--pico-form-element-font-family` so form inputs use Nunito
- **Unified glass navbar** — Desktop site header and task-list header now share the same glass treatment (`--glass-bg-strong` + backdrop blur)
- **Dark mode hairline separator** — Mobile task separators now use light rgba on dark backgrounds
- **Dark mode tab text** — Fixed hardcoded `#777` to `var(--text-muted)` in mobile tab bar

---

## v0.42.78 — 2026-02-10

### Changed
- **Nunito font** — Switched body/UI text from system font to Nunito (rounded, excellent Cyrillic). Wordmark stays Quicksand
- **Relaxed task padding** — Task item vertical padding increased from 7px to 11px for more breathing room
- **Removed impact row wash** — Task backgrounds are now transparent; impact conveyed solely via left rail
- **Thinner impact rail** — 60% opacity, brightens to 100% on hover instead of expanding width
- **Telegram-style hairline separators** — Subtle 0.5px dividers between task items on mobile
- **Bolder domain headers** — Font-size 0.8rem → 0.9rem, weight 600 → 700
- **Clean add-task row** — Removed dashed border for a cleaner look

---

## v0.42.77 — 2026-02-10

### Changed
- **Seamless header block (mobile)** — Site header and task-list-header are now one continuous block: zero bottom padding on site-header, 44px compact height, identical glass treatment. No visible seam between nav and sort row
- **Floating tab pills** — Tab bar container is now invisible (no glass, no border). Tasks and Schedule pills float freely with their own individual glass backgrounds, matching the energy pill treatment
- **Equal-width tab pills** — Both pills have `min-width: 80px` so Tasks matches Schedule width
- **Dark mode floating pills** — Each pill gets its own dark glass (`rgba(30,30,30,0.75)`) with blur
- **SW cache v15→v16**

---

## v0.42.76 — 2026-02-10

### Changed
- **Pill-shaped tab bar (mobile)** — Tasks and Schedule tabs are now compact pills with rounded backgrounds, centered in the bar with breathing room on sides. Active tab gets accent-colored pill highlight
- **Transparent top navbar (mobile)** — Header nav background is now fully transparent on mobile, matching the task-list-header glass treatment exactly
- **Dark mode tab pills** — Subtle white-tinted pill backgrounds for inactive tabs, accent-tinted for active
- **SW cache v14→v15**

---

## v0.42.75 — 2026-02-10

### Added
- **Sticky domain label in header (mobile)** — When scrolling through a domain's tasks, the domain name (emoji + name + count) appears left-aligned in the task-list-header row, merged with the sort buttons. Replaces the separate sticky domain headers
- **Spectrum bar re-enabled on mobile** — The gradient clarity bar below the header acts as a visual separator between the header and task content
- **SW cache v13→v14**

---

## v0.42.74 — 2026-02-10

### Changed
- **Ultra-transparent glass everywhere** — All glass elements (site header, task-list header, energy pill, domain headers, tab bar) dropped to ~2% background opacity with heavy blur. Content is clearly visible through all floating/sticky elements
- **Seamless header stack** — Site header and task-list header are now one continuous glass surface: no border, no spectrum bar, no separator line between them
- **Domain headers seamless** — No border-bottom, same ultra-transparent glass treatment
- **SW cache v12→v13**

## v0.42.73 — 2026-02-10

### Changed
- **Glass site header** — Mobile header now uses Telegram-style frosted glass (~88% white light / ~82% dark) instead of solid background. Content scrolls behind it with blur visible
- **Glass task-list header** — Sort bar uses matching frosted glass treatment. Removed solid background pseudo-element
- **Glass domain headers** — Project/domain sticky headers use frosted glass so task items are visible through them when scrolling
- **SW cache v11→v12**

## v0.42.72 — 2026-02-10

### Changed
- **Telegram-matched frosted glass** — Tab bar and energy pill now use Telegram's actual opacity levels: ~88% white (light) and ~82% dark (dark mode) instead of near-transparent. Content barely peeks through, matching Telegram iOS exactly
- **Tab bar dimensions** — Height reduced to 49px (iOS standard), labels shrunk to 10px, tighter icon-to-label gap. No border-radius on tabs, pure color-only active state
- **Energy pill polish** — Active segment now nearly-solid white with subtle shadow (like iOS segmented controls). Container shadow softened from dramatic to subtle
- **Search button in header** — Magnifying glass icon in mobile header bar, styled like Telegram's search affordance. Non-functional placeholder
- **SW cache v10→v11**

## v0.42.71 — 2026-02-10

### Changed
- **Telegram-style tab bar** — Active tab no longer has a background pill/card. Matches Telegram: inactive tabs are grey, active tab is accent-colored (icon + label). Removed box-shadow and border from active state. Top border changed to subtle grey hairline
- **Energy pill active states half-transparent** — Light mode active pill opacity halved from 85% to 42%. Dark mode from 15% to 8%
- **SW cache v9→v10**

## v0.42.70 — 2026-02-10

### Changed
- **Maximum transparency glass** — Both tab bar and energy pill background opacity dropped from 45% to ~0% (`rgba(..., 0.01)`). Pure backdrop-filter blur with virtually no tint — content is as visible as possible through the frost. Dark mode same treatment. SW cache v8→v9

## v0.42.69 — 2026-02-10

### Changed
- **Glass tab bar** — Bottom tab bar now uses the same frosted glass as the energy selector: 45% opacity, `blur(50px) saturate(200%) brightness(1.05)`, inset highlight. Content scrolls behind it and is visible through the frost. Active tab pill is semi-transparent white instead of solid. Dark mode: `rgba(20,20,28,0.5)` with `brightness(0.9)` for rich dark glass
- **More dramatic energy pill glass** — Opacity lowered from 65% to 45%, blur bumped from 40px to 50px, saturate 200%, added brightness boost and inset white highlight. Shadow deepened. Dark mode glass matched to tab bar
- **Zero padding scroll** — Tasks panel padding-bottom set to 0 at both breakpoints; scroll spacer `::after` (120px) on `.task-list-scroll` lets content extend fully behind both glass elements
- **SW cache v7→v8** — Force phones to pick up new CSS

## v0.42.68 — 2026-02-10

### Fixed
- **Service worker caching old CSS** — The real reason glass updates never reached the phone. `sw.js` precaches `mobile.css` with Cache First strategy; bumping `?v=` query strings doesn't help because the SW matches by pathname. Bumped `CACHE_VERSION` from `v6` to `v7` to force full cache invalidation
- **Glass had nothing to blur** — `padding-bottom: 106px` on `.tasks-panel` created empty space under the last task, so the glass floated over a solid background with no content to blur. Reduced to `60px` (tab bar only) so tasks extend behind the glass like Telegram's chat list behind its tab bar
- **Telegram-style glass tuning (over-the-top)** — Light: `rgba(240,240,245,0.65)` + `blur(40px)`, pill radius 18px, active segment `rgba(255,255,255,0.85)`. Dark: `rgba(30,30,35,0.65)` + `blur(40px)`, active `rgba(255,255,255,0.18)`. Verified with Playwright: `backdrop-filter: blur(40px) saturate(1.8)` computes correctly

## v0.42.67 — 2026-02-10

### Fixed
- **Glass effect not updating on deploy** — CSS links had no cache-busting; phones served stale files. Added `?v={{ app_version }}` query strings to all CSS `<link>` tags across all templates. Version injected via `render_template` from `app.__version__`
- **Glass effect barely visible on dark mode / WebKit** — Dark mode was `rgba(15,23,42,0.5)` (dark-on-dark = invisible). Replaced with light-tinted glass `rgba(180,190,210,0.18)` + `brightness(1.1)` so frost reads against dark backgrounds. Light mode also bumped: blur 24px→32px, opacity 55%→45%, added `brightness(1.05)` and inset highlight for proper iOS-style frosted glass on WebKit

## v0.42.65 — 2026-02-10

### Fixed
- **Energy selector glass effect invisible** — Background was 85% opaque white (`--glass-bg`), too solid for blur to show through. Replaced with 55% opacity, stronger 24px blur, higher saturation, and layered shadow for true frosted glass appearance. Dark mode uses matching translucent dark glass

## v0.42.64 — 2026-02-10

### Fixed
- **Energy pills cramped on mobile** — Dashboard.css sets `width: 26px` on `.energy-pill` for the compact desktop view. Mobile override was missing `width: auto !important`, so pills couldn't expand to fit emoji + text labels

## v0.42.63 — 2026-02-10

### Fixed
- **Floating energy selector invisible on iOS** — `position: fixed` was broken because the energy-wrapper was inside `.task-list-container` which has `-webkit-overflow-scrolling: touch` (creates a containing block on iOS, making fixed behave as absolute). Moved energy-wrapper in HTML to be a direct child of `.tasks-panel`, outside the scroll container

## v0.42.62 — 2026-02-10

### Changed
- **Floating glass energy selector on mobile** — Moved the energy mode selector from the task list header to a floating iOS-style glass segmented control above the bottom tab bar. Uses `position: fixed` with backdrop-filter blur, text labels ("Zombie" / "Normal" / "Focus") via CSS `::after` pseudo-elements. Reverts to inline header position on landscape tablets

## v0.42.61 — 2026-02-10

### Fixed
- **Nav underline position** — Underline was rendering below the nav bar because `min-height: 44px` made items overflow the 28px container. Replaced with `::before` pseudo-element for invisible 44px touch target while keeping visual height at 24px so underline sits at the container's bottom edge

## v0.42.60 — 2026-02-10

### Fixed
- **Nav active state — underline instead of grey square** — Replaced the grey background pill on the active `.nav-item` with a 2px bottom border in brand purple. Cleaner at mobile sizes and eliminates the floating grey rectangle artifact on iOS

## v0.42.59 — 2026-02-10

### Fixed
- **Mobile tab bar too short** — Restored vertical layout (`flex-direction: column`) with icon stacked above label, increased height from 44px to 56px matching typical iOS tab bar buttons
- **Sort headers misaligned with task metadata** — Added `!important` to task-meta gap, widths, and padding to beat dashboard.css overrides (which loads after mobile.css); added `margin-left: auto` and `border: none` for pixel-perfect alignment with header-meta columns
- **Grey square on navbar button** — Cleared persistent `:focus`/`:focus-visible` background on `.nav-item` that lingered after tap on iOS; added transparent background override in mobile media query
- **Page body scrolling from bottom bar** — Added `overflow: hidden`, `height: 100%`, and `overscroll-behavior: none` on `html, body` inside the 900px mobile query so only `.task-list-container` scrolls

## v0.42.58 — 2026-02-10

### Fixed
- **Desktop header token conflict** — `app.css` re-declared `--col-duration: 48px` after `tokens.css`, silently overriding the design token. Removed duplicate declarations from `app.css` so `tokens.css` is the single source of truth
- **Calendar controls hidden behind tab bar** — Added `!important` to toolbar `bottom` override so it beats `dashboard.css` (which loads after `mobile.css`)
- **Long press triggering iOS text selection** — Reduced long-press duration from 400ms to 300ms (beats iOS Siri Intelligence ~400ms threshold) and added `user-select: none` + `-webkit-touch-callout: none` on task items
- **Mobile sort labels** — Show full labels for Clarity and Impact, compact "DUR" only for Duration (which overflows 32px at 0.5rem)
- **Reverted mobile column widths** — Restored header and task-meta columns to pre-round-4 values (32/24/56px) for consistency with yesterday's layout
- **Removed `display: flex` from `.task-list-header`** — Was not present in the working v0.42.53 state; unnecessary since header-row1 handles its own flex layout

## v0.42.57 — 2026-02-10

### Fixed
- **Sticky task-list header broken on mobile** — `transform: translateZ(0)` on `.task-list-container` (GPU hint from dashboard.css) and `will-change: transform` on `.task-list-header` broke `position: sticky` on mobile WebKit/Blink. Override both to `none`/`auto` in mobile.css. Also added `overscroll-behavior: contain` to prevent vertical scroll chaining to body.

## v0.42.56 — 2026-02-10

### Fixed
- **Swipe gestures still broken** — `const isCompleted` (outer scope) conflicted with `var isCompleted` (inner scope) causing a SyntaxError that prevented `task-swipe.js` from parsing; both long press and all swipe gestures were dead. Fixed by removing outer declaration and using block-scoped `const` in each branch
- **Desktop header text overflow** — "DURATION" at 11px uppercase overflowed 48px column width; increased `--col-duration` from 48px to 60px in tokens.css
- **Sort arrow layout shift** — Changed sort-icon from `display: inline` (zero width when empty) to `position: absolute` so it never affects the button's flow width
- **Mobile sort labels overflow** — Full labels ("DURATION", "IMPACT") overflow 40/32px columns at 0.5rem; switched to compact labels ("DUR", "IMP", "CLR") on mobile
- **Calendar controls hidden behind tab bar** — Toolbar (Today + zoom) at `bottom: 1rem` was obscured by the fixed mobile tab bar; increased `bottom` to clear the tab bar height
- **SCHEDULED section header misaligned** — Override grid layout to flex on mobile and hide column labels that don't align with flex-based task rows

## v0.42.55 — 2026-02-10

### Fixed
- **Gradient spectrum bar missing on mobile** — Position `::after` absolutely inside flex container so it renders as a full-width bar below the filter header
- **Sort arrow shift on tap** — Add `!important` to opacity rules to override desktop `:hover` specificity; also override `overflow: hidden`
- **Sort header ↔ column misalignment** — Widen Duration (32→40px) and Impact (24→32px) columns in both header and task rows to fit full labels
- **Energy label alignment** — Add `!important` to `margin-left: 0` to ensure desktop 34px margin is overridden
- **Child task date stacking** — Change breadcrumb layout from `flex-direction: column` to `flex-wrap: wrap` so `.task-due` stays inline with task text instead of appearing as a third row

## v0.42.54 — 2026-02-10

### Fixed
- **Swipe gestures + long press broken** — Fix `\!` syntax error in `task-swipe.js` and `mobile-sheet.js` that prevented both files from parsing, killing all swipe and long-press handlers (regression from v0.42.53)
- **Swipe-left tab switch** — Use `getMobileTabs()` instance instead of `MobileTabs` class for `switchTo()` call in `task-swipe.js`
- **Tab switch scroll position** — Save/restore `scrollTop` in `mobile-tabs.js` when switching between Tasks and Schedule tabs so sticky headers don't end up half-visible

## v0.42.53 — 2026-02-10

### Fixed
- **Swipe-right completion** — Export `toggle` from `TaskComplete` and fix call signature in `task-swipe.js` and `mobile-sheet.js` so swipe-right and action sheet completion pass correct parameters (`taskEl, taskId, instanceId, shouldComplete, isRecurring`)
- **Swipe-left timing** — Increase plan-mode entry delay from 400ms to 600ms so the calendar panel is fully visible before `PlanTasks.enterPlanMode` fires

## v0.42.52 — 2026-02-10

### Fixed
- **Mobile filter bar full names, 2-line wrap, horizontal tabs** — Group A mobile UX round 3:
  - Filter bar: show full sort labels (Clarity/Duration/Impact), hide gear icon, restore gradient spectrum bar, fix sort arrow fade (no reflow)
  - Task names: 2-line wrap with `-webkit-line-clamp: 2` instead of single-line truncation
  - Tab bar: horizontal layout (icon + label side by side)
  - Domain headers: left padding aligned with task text at 580px breakpoint
  - HTML: "Dur" → "Duration" in sort button label

## v0.42.51 — 2026-02-10

### TODO (pre-1.0)
- **Gesture discovery redesign** — Current swipe hint animation works but needs polished, branded onboarding flow
- **Settings/gear redesign** — Hidden on mobile since v0.42.x; needs a mobile-friendly settings surface before 1.0

## v0.42.50 — 2026-02-10

### Fixed
- **Mobile CSS polish** — Three targeted fixes for mobile layout refinement:
  - Filter bar: compact padding aligned with task rail, hidden spectrum gradient, invisible 44px tap targets on sort buttons via `::before` pseudo-elements
  - Two-liner truncation: `align-items: stretch` on breadcrumb task-content fixes text-overflow ellipsis in column layout
  - Domain card spacing: tighter group margins, compact add-task rows, smaller project headers at 580px, dashed separator style for add-task at phone breakpoint

### Changed
- **Remove Tasks tab badge** — Removed unscheduled task count badge from mobile tab bar and all associated JS (`updateBadge` method, htmx/viewport listeners)
- **SVG FAB icon** — Replaced text "+" in the embedded tab-bar FAB with an SVG `<use>` referencing `ui-icons.svg#plus` for crisp rendering at all sizes

### TODO (pre-1.0)
- **Gesture discovery redesign** — Current swipe hint animation works but needs a polished, branded onboarding flow before v1.0

## v0.42.47 — 2026-02-10

### Fixed
- **Swipe-left opens manual scheduling instead of auto-tomorrow** — Swipe-left on a task no longer auto-schedules to tomorrow and shows an undo toast. Instead, it switches to the calendar tab and enters plan mode so the user can manually pick a time slot.

## v0.42.45 — 2026-02-10

### Added
- **BRAND.md v1.8: Mobile & Touch section** — Documents gesture model (swipe right/left, long-press, tap), touch target requirements (44×44px minimum with `::before` expansion pattern), mobile layout principles (edge-to-edge, flat groups, two-line rows), breakpoints (desktop/tablet/phone), bottom sheet spec, and tab bar design.

## v0.42.44 — 2026-02-10

### Fixed
- **Mobile layout overhaul** — Five CSS-dominant fixes for iPhone Pro Max readability:
  - Filter bar: `.header-row1` flex override fixes grid-in-flex conflict; `.header-energy` selector corrected to `.energy-wrapper`
  - Touch targets: sort buttons, energy pills, nav items, and task rows expanded to 44px minimum
  - Two-line child tasks: `:has(.task-breadcrumb)` shows parent name above task name on mobile
  - Edge-to-edge: container padding removed at 580px with `env(safe-area-inset-*)` for notch safety
  - Plan banner: dismiss button with per-day localStorage, compact mobile sizing

## v0.42.43 — 2026-02-10

### Added
- **Gesture discovery** — Three-layer progressive disclosure for mobile swipe/long-press gestures:
  - First-visit animated swipe hint: the first task row slides right then left (2.4s) to reveal both complete and schedule actions, followed by a tooltip explaining all gestures.
  - Permanent subtle 2px purple edge on the right side of task rows (touch devices only) hinting that swipe-left is available.
  - One-time long-press tooltip: after closing the first task edit dialog, a toast reminds the user about the long-press context menu.

## v0.42.42 — 2026-02-10

### Changed
- **Swipe-left schedules instead of deletes** — On mobile, swiping a task left now schedules it for tomorrow (via `PUT /api/v1/tasks/{id}`) with an undo toast, instead of deleting. Delete is now exclusively in the long-press context menu where it has proper danger signaling.
- **Higher swipe threshold** — Increased from 100px to 130px (max 150px) to reduce accidental triggers. Velocity threshold lowered slightly (0.5 → 0.4).
- **Visual feedback phases** — Swipe indicators now show a peek zone (0–40px), full opacity (40–100px), "almost there" scale-up (100–130px), and trigger at 130px+. Calendar icon replaces trash icon for swipe-left.
- **Tab bar: embedded FAB + badge fix** — Center "+" button replaces the floating FAB on mobile; badge overlays the tab icon instead of pushing layout; tab bar reduced from 56px to 44px height.

## v0.42.41 — 2026-02-10

### Changed
- **Flatten domain cards on mobile** — On phones (<580px), domain groups lose their card borders and become flat sections with sticky headers. Recovers ~24px of horizontal space for task names. Desktop layout unchanged.

## v0.42.40 — 2026-02-10

### Fixed
- **Revert mobile kebab visibility** — The original `display: none` on `.task-actions` was intentional: long-press context menu is the correct mobile interaction pattern. The kebab was redundant visual noise.

## v0.42.39 — 2026-02-10

### Fixed
- **Kebab actually visible on mobile** — `mobile.css` had `.task-item .task-actions { display: none !important; }` which completely hid the kebab container. The `@media (hover: none)` opacity fix in `dashboard.css` couldn't override `display: none`. Replaced with visible flex layout and 40% opacity kebab.

## v0.42.38 — 2026-02-10

### Fixed
- **Mobile touch visibility actually works** — The `@media (hover: none)` block was placed before the base `.kebab-btn` and `.calendar-quick-action` rules in the CSS file, so the base `opacity: 0` won the cascade (same specificity, later source order). Moved the media query to the end of the file.

## v0.42.37 — 2026-02-10

### Fixed
- **Mobile touch visibility** — Kebab menu and calendar quick-action buttons were invisible on touch devices (opacity: 0 with no `@media (hover: none)` override). Now shown at 40% opacity on touch devices.
- **Short calendar cards** — Quick-action button was completely hidden (`display: none`) on sub-30-minute cards. Now shows a compact 16px version instead.

### Removed
- **"Drag to reschedule" context menu hint** — Removed the non-interactive hint row from recurring calendar card context menus. Reduces menu clutter.

## v0.42.36 — 2026-02-09

### Fixed
- **Calendar quick-action buttons visible** — The `.scheduled-task.calendar-item > *` rule (specificity 0,2,0) was overriding `.calendar-quick-action`'s `position: absolute` (specificity 0,1,0) with `position: relative`, putting the button in the normal flow where `overflow: hidden` clipped it. Added higher-specificity override.
- **Faster zoom** — Wheel scale 0.15 → 0.20.

## v0.42.35 — 2026-02-09

### Fixed
- **Kebab menu actually clickable** — Root cause was a JS event ordering bug, not CSS z-index. `dismissActionsMenu` was registered as a document-level click handler that fired on the same click as `handleKebabClick`, immediately removing the menu after creation. Fixed by guarding `dismissActionsMenu` to skip when the click target is inside `.kebab-btn` or `.actions-menu`.
- **Faster zoom** — Increased wheel scale from 0.10 to 0.15 for quicker trackpad pinch response.

## v0.42.34 — 2026-02-09

### Fixed
- **Zoom tuning** — Changed zoom wheel scale from 0.05 to 0.10 for a better middle ground (~2-3s to traverse full range with gentle pinch).
- **SVG quick-action icons** — Replaced emoji characters (⏭, 📤) on calendar cards with clean SVG icons (`skip-forward`, `upload`) from the `ui-icons.svg` sprite. Vertically centered on scheduled cards.
- **SVG kebab icon** — Replaced plain text `⋮` on task-list items with SVG `#menu-dots-stroke` icon for consistent styling.

### Added
- **Unschedule from task list** — Scheduled non-recurring tasks now show "Unschedule" in the kebab menu, providing a way to unschedule without dragging the calendar card.

## v0.42.33 — 2026-02-09

### Fixed
- **Truly smooth calendar zoom** — Replaced discrete step accumulator with continuous `requestAnimationFrame`-based zoom (scale factor 0.05). Trackpad pinch now feels gradual; mouse wheel still responsive. Buttons still snap to discrete steps.

### Changed
- **Calendar quick-action buttons** — Replaced generic kebab (⋮) on calendar cards with contextual quick-action buttons: ⏭ skip (recurring instances) or 📤 unschedule (non-recurring). One click to act, no menu needed. Right-click still opens full context menu.

## v0.42.32 — 2026-02-09

### Fixed
- **Smooth calendar zoom** — Trackpad pinch-to-zoom now accumulates small delta events before stepping, preventing jarring jumps. Mouse wheel still steps immediately. CSS transitions added for smooth position recalculation.
- **Date-aware completion toasts** — Recurring task toasts now say "Done for Mon, Feb 10" instead of always "Done for today". Same for "Reopened for" and "Skipped for" toasts.

### Added
- **Calendar card actions menu** — Right-click context menu on scheduled and date-only calendar cards. Menu includes Skip (recurring), Unschedule (non-recurring), Edit, and Delete. Recurring instances show a "Drag to reschedule" hint.
- **Unschedule from menu** — Non-recurring calendar cards can be unscheduled via the actions menu, removing them from the calendar and returning them to the task list.

## v0.42.31 — 2026-02-09

### Fixed
- **Kebab button clickability** — `.task-actions` now has `display:flex`, `position:relative`, `z-index:3` and `.kebab-btn` gets `position:relative`, `z-index:1` so the button is no longer occluded by the `::after` divider pseudo-element.

### Changed
- **Actions menu for all tasks** — Kebab (⋮) button now appears on every task, not just recurring ones. Menu items are contextual: non-recurring tasks get "Edit task" and "Delete"; recurring tasks additionally get "Skip this one" and show "Edit series" / "Delete series".
- **Undo-based delete** — Deleting from the actions menu uses the undo-toast pattern (2s window) matching the existing drag-to-trash flow. Subtask cascade shows a confirm dialog first.
- **Renamed skip-menu → actions-menu** — CSS classes and JS internals renamed from `skip-menu` to `actions-menu` to reflect the expanded scope.

## v0.42.30 — 2026-02-09

### Fixed
- **Skip menu jargon** — "Skip this instance" renamed to "Skip this one" to remove tech jargon.
- **Kebab button margin** — Added `margin: 0; padding: 0` to `.kebab-btn` to fix Pico CSS injecting extra `margin-bottom` on buttons.
- **Zoom scroll preservation** — Zooming in/out now keeps the same time centered in the viewport instead of jumping to the top.
- **Completion toast undo** — Completing a task now shows an "Undo" button in the toast; clicking it cancels the animation and reverses the completion.

### Changed
- **Universal departing animation** — Completing, scheduling (drag to calendar), and deleting (drag to trash) all use one consistent `.departing` slide-down + fade-out + collapse animation, replacing the old `.completing` fade.
- **Exposed `window.TaskComplete` API** — `{ init, refreshTaskList }` so other modules (drag-drop) can trigger task list refreshes after scheduling animations.

## v0.42.29 — 2026-02-09

### Added
- **Calendar zoom** — +/- buttons and Ctrl+scroll (pinch on macOS) adjust hour height from 30px to 100px, persisted per user. New `calendar_hour_height` preference with DB migration.
- **Recurring task kebab menu** — Three-dot (⋮) button on recurring task items opens skip context menu without right-click.

### Fixed
- **Skip right-click target** — Right-click skip now works on the entire task card and calendar cards, not just the completion gutter.
- **Drag highlight shows task duration** — Dragging a task over calendar slots now highlights the correct number of slots based on task duration (e.g., 2h task highlights 2 hours).
- **Completion animation** — Completed tasks fade out and collapse smoothly before HTMX refreshes the list, eliminating the visual jump.

### Changed
- **Undo timeout reduced** — Deletion undo window shortened from 5s to 2s for faster workflow. Toast duration for undo actions adjusted to match.

## v0.42.28 — 2026-02-09

### Fixed
- **Instance schedule endpoint crash** — `PUT /api/v1/instances/{id}/schedule` crashed with `MissingGreenlet` because `schedule_instance()` query lacked eager loading for `task` and `task.domain` relationships needed by the response serializer. Added `selectinload` to match other instance queries.

## v0.42.27 — 2026-02-09

### Fixed
- **Parent tasks excluded from Plan My Day** — Parent tasks (those with subtasks) are no longer scheduled as calendar blocks; only their subtasks are plannable. Adds template-level draggable guard, JS safety nets in both plan-tasks.js and drag-drop.js, and a contract test.

## v0.42.26 — 2026-02-09

### Fixed
- **Backup import 500 error** — Validation errors (e.g. legacy `"executable"` clarity) now return 400 instead of 500; added explicit `BackupValidationError` handler
- **Todoist import clarity** — Parent tasks now default to `"autopilot"` instead of invalid `"executable"` clarity value
- **Legacy backup compatibility** — Old backups with `"executable"` clarity are auto-mapped to `"autopilot"` during import
- **Export/import schema drift** — Added missing fields to backup round-trip: `due_time`, `recurrence_start/end`, `position` (tasks); `position`, `is_archived` (domains); `completed_sort_by_date`, `show_scheduled_in_list`, `scheduled_move_to_bottom`, `scheduled_sort_by_date`, `timezone` (preferences)
- **Defensive import defaults** — NOT NULL fields (`clarity`, `impact`) now fall back to defaults when null in backup data

## v0.42.25 — 2026-02-09

### Added
- **Archive docs** — Added v1 gate audit and final review documentation to `docs/archive/`

## v0.42.24 — 2026-02-09

### Fixed
- **Head-loaded JS crash** — `error-handler.js` and `shortcuts.js` used `document.body.addEventListener` but load in `<head>` where `document.body` is null; changed to `document.addEventListener` (events bubble to document). This also fixes `handleError is not defined` in `task-dialog.js` since the error-handler crash prevented `window.handleError` from being exported.

## v0.42.23 — 2026-02-09

### Fixed
- **domain_id IDOR** — Added ownership validation in `create_task()` and `update_task()` to prevent IDOR via unowned domain_id
- **Batch update dirty session** — Added rollback and sanitized error messages in task/domain batch updates (security hardening)
- **/ready info leakage** — Sanitized database error messages and removed user count from health check endpoint
- **Backup validation** — Added Pydantic validators for task/instance status, clarity, and impact fields to reject invalid backup imports
- **Circular parent_id protection** — Added cycle detection in backup import and recursion guards in archive/restore subtasks

## v0.42.22 — 2026-02-09

### Fixed
- **TaskUpdate.clarity validation** — Added enum validator matching TaskCreate; rejects arbitrary strings via API
- **Todoist import error leakage** — Replaced raw `str(e)` with generic message; full exception already logged
- **Drag-drop delete retry** — Fixed `executeDeleteNow` → `executeDelete` reference in error retry callback

## Post-v1.0 Backlog

Known issues and deferred work from v1.0 gate audits (February 9, 2026).
Full audit reports: `docs/archive/2026-02-09-*.md`

### Product Features

- **Mobile UX overhaul** — Proactive gap surfacing ("2h free until 14:00"), task-initiated scheduling. Current mobile is functional but basic.
- **Undo/Redo** — Delete has toast undo. Full undo for complete/reschedule/edit is v1.1.
- **Bulk operations** — Multi-select, batch reschedule/complete/delete. One-at-a-time works.
- **Offline write queue** — Full IndexedDB queue deferred (~14 days, high risk). Warn-only for v1.0. Revisit when JS test infra exists.
- **Honeycomb profiling** — OpenTelemetry distributed tracing for performance optimization.
- **Encryption passphrase change** — No way to change passphrase without disable→re-enable (loses passkeys). Need a re-encryption flow.

### Recurring Tasks

- **Timezone on scheduled_time** — `scheduled_time` stored as bare Time (no TZ); materialized as UTC in `recurrence_service.py:175`. A user in EST with a 9 AM task gets instances at 9 AM UTC = 4 AM EST. Needs user timezone preference + TZ-aware materialization.
- **recurrence_rule validation** — Any dict accepted as `recurrence_rule` on create/update. Malformed input (e.g. `freq: "bogus"`, `interval: 0`) silently produces zero instances. UI always sends valid JSON so risk is API-only.
- **list_instances timezone** — Endpoint missing timezone parameter (consistency issue, not causing wrong behavior).
- **Monthly 31st skips short months** — `dateutil.rrule` with `bymonthday=31` skips Feb/Apr/Jun/Sep/Nov. Needs UI tooltip when `day_of_month > 28`.
- **regenerate_instances cleanup** — Changing a recurrence rule doesn't clean up completed/skipped instances from the old rule.
- **Skip→toggle state machine** — Toggling a skipped instance marks it completed (not pending). May surprise users expecting skip→pending→completed.
- **cleanup_old_instances uses server time** — Uses `date.today()` instead of `get_user_today()`. Only affects cleanup timing, not user-visible scheduling.

### GCal Sync

- **Rapid toggle drops second sync** — Enable→Disable→Enable quickly: second sync skips because lock is held by first. User sees "enabled" with 0 events. Workaround: wait 1-2 min, then Full Re-sync.
- **Fire-and-forget bypasses per-user lock** — `_fire_and_forget_bulk_sync` in tasks.py doesn't acquire the sync lock, allowing concurrent syncs with the protected path.
- **Bulk sync timeout** — 1000+ tasks with rate limiting can exceed 5-min materialization timeout. User-triggered syncs have no timeout at all. Consider `asyncio.wait_for()` with 15-min ceiling.
- **Orphan event scenarios** — Fire-and-forget sync→unsync race (task archived right after sync started); disable without `delete_events` leaves calendar events.
- **Background bulk_sync has no timeout** — Unlike materialization loop (5-min timeout via `asyncio.wait_for`), background GCal sync can run indefinitely.

### Security & Hardening

- **Offline checks on secondary mutation paths** — 11 of 18 JS mutation paths still lack `isNetworkOnline()` checks (plan-tasks, mobile-sheet, task-dialog complete/delete, drag-drop unschedule, task-list-options). Primary 7 paths are protected.
- **Analytics aging stats unbounded** — `_get_aging_stats()` loads ALL completed tasks with no date range. 10k+ tasks = 1-2s delay + 5-10MB memory spike. Add date range parameter.
- **Passkey deletion rate limit** — `DELETE /api/v1/passkeys/{id}` has no rate limit. Attacker could delete all passkeys.
- **Encryption timing oracle** — Client-side passphrase verification in `crypto.js` uses non-constant-time string comparison. Theoretical risk only (client-side).
- **Session clear before login** — OAuth callbacks don't call `session.clear()` before setting user_id. Starlette auto-regenerates, so implicitly safe, but explicit clear is better.
- **Instance cleanup audit trail** — `cleanup_old_instances` permanently deletes 90+ day instances with no log of what was deleted.
- **Nonce-based CSP** — `script-src` still uses `'unsafe-inline'` because ~45 `onclick` handlers in templates need it. Full fix: refactor all inline event handlers to `addEventListener`, generate per-request nonce in middleware, update CSP to `script-src 'self' 'nonce-{value}'`.

### Infrastructure (Trigger-Based)

- **Redis rate limiting** — Required before `replicas > 1` on Railway (in-memory counters are per-process).
- **Redis calendar cache** — Required before multi-worker deployment.
- **JS test infrastructure** — Prerequisite for offline queue, frontend complexity, and encryption testing.

---

## [0.42.21] - 2026-02-09 — Preserve Subtask Hierarchy in Backup

### Fixed
- **Backup export/import loses subtask hierarchy** — `parent_id` is now included in backup exports and restored on import via a two-pass ID mapping strategy, preserving parent-child task relationships across backup/restore cycles

---

## [0.42.20] - 2026-02-09 — HTMX CSRF Protection

### Security
- **HTMX CSRF token injection** — All HTMX state-changing requests (POST/PUT/DELETE/PATCH) now automatically include the `X-CSRF-Token` header via a global `htmx:configRequest` listener
- **safeFetch coverage** — Replaced 3 raw `fetch()` calls in task sheet template with `safeFetch()`, restoring automatic CSRF injection and error handling

---

## [0.42.19] - 2026-02-09 — Tighten Input Validation

### Fixed
- **Pydantic field constraints** — Added range validation to `impact` (1-4), `duration_minutes` (1-1440), `completed_limit` (0-1000); max_length on passkey and encryption string fields; size limits on batch update lists; `BatchAction.action` now uses `Literal` instead of raw `str`

---

## [0.42.18] - 2026-02-09 — Clean Up GCal Events on Data Wipe

### Fixed
- **Orphaned GCal events after data wipe** — Import wipe now deletes the Whendoist calendar from Google Calendar before removing tasks, preventing orphaned events that were invisible to subsequent syncs

---

## [0.42.17] - 2026-02-09 — Self-Host Vendor Scripts, Tighten CSP

### Security
- **CSP hardening** — Removed `https://cdn.jsdelivr.net` from Content-Security-Policy; all vendor scripts (htmx, air-datepicker, ApexCharts) and stylesheets (Pico CSS) now self-hosted from `/static/vendor/`, eliminating CDN-based CSP bypass vector

### Technical Details
- `'unsafe-inline'` remains in `script-src` — ~45 inline `onclick` handlers in templates require it; nonce-based CSP is a Post-v1.0 Backlog item
- Google Fonts remains in `style-src` and `font-src` (external CSS, not scripts)

---

## [0.42.16] - 2026-02-09 — Sanitize Error Responses

### Fixed
- **Exception details in HTTP responses** — Error endpoints no longer expose raw exception messages (DB errors, library internals) to clients; details are logged server-side only

---

## [0.42.15] - 2026-02-09 — Document Recurring Task Timezone Limitation

### Changed
- **Recurring task time input** — Added UTC timezone notice near scheduled time for recurring tasks, clarifying that times are stored and materialized in UTC

---

## [0.42.14] - 2026-02-09 — Offline Checks for Secondary Mutation Paths

### Fixed
- **Offline flickering on Plan My Day** — Batch scheduling now checks network before optimistic updates
- **Offline flickering on dialog complete/delete** — Task dialog complete and delete buttons now check network status
- **Offline flickering on mobile skip** — Mobile sheet skip instance checks network before optimistic update

---

## [0.42.13] - 2026-02-09 — Session Fixation Defense-in-Depth

### Fixed
- **Session not cleared before login** — OAuth and demo login now explicitly clear the session before setting user_id, preventing theoretical session fixation

---

## [0.42.12] - 2026-02-09 — Backup Import Size Limit

### Fixed
- **No upload size limit on backup import** — Files larger than 10 MB now rejected with 413 before parsing, preventing memory exhaustion

---

## [0.42.11] - 2026-02-09 — Rate Limit Destructive Endpoints

### Fixed
- **Unprotected destructive endpoints** — Added rate limits (5/min) to: import wipe, Todoist preview, Todoist import, GCal enable/disable/sync, passkey deletion

---

## [0.42.10] - 2026-02-09 — Offline: Block Mutations Before Optimistic Updates

### Fixed
- **Offline mutation flickering** — Task completion, deletion, creation, and scheduling now check network status before optimistic UI updates, showing a clear "You're offline" warning instead of animate-then-revert
- **Duplicate offline toasts** — Consolidated network status toasts to error-handler.js only (removed duplicate from mobile-core.js)
- **Misleading offline page** — Service worker offline page no longer claims changes will sync; honestly states changes require a connection

### Technical Details
- Network check added to: task-complete.js, task-swipe.js, task-dialog.js, drag-drop.js
- mobile-core.js NetworkStatus class retains CSS class toggle but no longer shows toasts
- Service worker offline page text updated for honesty

---

## [0.42.9] - 2026-02-09 — GCal Sync: Token Revocation & Crash Safety

### Fixed
- **Token revocation zombie state** — When Google revokes OAuth access, sync now auto-disables with a clear error message instead of silently failing forever
- **Orphan events on sync crash** — Bulk sync now flushes sync records every 50 events, preventing duplicate events if the sync is interrupted by rate limiting or timeout

### Technical Details
- `TokenRefreshError` now caught alongside `httpx.HTTPStatusError` in bulk_sync, sync_task, and sync_task_instance
- `_disable_sync_on_error()` called with user-friendly message on token revocation
- Periodic `db.flush()` every 50 events preserves sync records even if the session is never committed
- Fire-and-forget sync wrappers also handle TokenRefreshError gracefully

---

## [0.42.8] - 2026-02-09 — Recurring Task Race Condition & Orphan Fixes

### Fixed
- **Instance creation race condition** — Double-click or concurrent requests no longer cause 500 errors; `IntegrityError` from the unique constraint is now caught and handled gracefully
- **Orphaned instances on recurrence disable** — Turning off recurrence on a task now deletes future pending instances instead of leaving them orphaned in the database and calendar

### Technical Details
- `get_or_create_instance_for_date` catches `IntegrityError` and re-queries the existing instance
- `materialize_instances` skips duplicates instead of failing the entire user's materialization
- `update_task` adds cleanup branch for `is_recurring` transitioning from True to False

---

## [0.42.7] - 2026-02-09 — Mobile Bottom Tab Bar

### Changed
- **Mobile tabs moved to bottom** — Tab bar now fixed to bottom of viewport (was top), matching standard mobile app patterns for better thumb reachability on large phones
- **Safe area support** — Bottom tabs respect iPhone home indicator via `env(safe-area-inset-bottom)`
- **Content padding** — Task list scroll area padded to prevent content from hiding behind fixed tabs

### Technical Details
- Desktop layout completely unchanged (tabs only appear on mobile < 900px)
- Dark mode support for bottom tab bar
- No JavaScript changes — only CSS position/layout updates

---

## [0.42.6] - 2026-02-09 — Rate Limiting Scaling Documentation

### Added
- **Scaling section in Deployment Guide** — Documents in-memory rate limiting limitation, Redis migration path, and calendar cache considerations for horizontal scaling

### Changed
- **V1-ROADMAP.md** — Added rate limiting + caching to technical debt section

---

## [0.42.5] - 2026-02-09 — Accessibility: Screen Reader Announcements

### Added
- **aria-live announcer** — Screen readers now announce online/offline status changes
- **Swipe role description** — Task items have `aria-roledescription="swipeable task"` for assistive tech discovery
- **`.sr-only` utility class** — Visually hidden but screen-reader accessible content

---

## [0.42.4] - 2026-02-09 — Service Worker Cache TTL

### Fixed
- **API cache staleness** — Cached API responses now expire after 5 minutes; going back online clears the API cache entirely, preventing stale task data after offline→online transitions

### Technical Details
- API responses stamped with `X-SW-Cached-At` header on cache write
- Cache reads check TTL (5 min) before serving
- Main thread sends `CLEAR_API_CACHE` message to SW on `online` event
- Static asset cache unchanged (still cache-first with background update)

---

## [0.42.3] - 2026-02-09 — README Terminology Update

### Changed
- **README.md** — Updated stale terminology to match app: Executable→Autopilot, Defined→Normal, Exploratory→Brainstorm; P1-P4→High/Mid/Low/Min; Clarity→Mode

---

## [0.42.2] - 2026-02-08 — Docs cleanup and roadmap update

### Changed
- **V1-ROADMAP.md rewritten** — Reflects v0.42.1 reality: onboarding, error recovery, data export, and keyboard shortcuts moved to "Resolved" section; remaining gaps narrowed to mobile UX, PWA, undo/redo, and bulk operations
- **README doc index cleaned up** — Removed dead link (TASK-LIST-HEADER-REDESIGN.md) and links to archived docs

### Archived
- 7 stale docs moved to `docs/archive/`: V1-ROADMAP-AUDIT.md, V1-ROADMAP-AUDIT-V2.md, V1-BLOCKERS-IMPLEMENTATION-PLAN.md, 3 keyboard shortcuts planning docs, UI-POLISH-PLAN.md

---

## [0.42.1] - 2026-02-08 — Keyboard Shortcuts: Task Navigation & Actions

### Added
- **Task navigation shortcuts** — `j`/`k` to move selection down/up through visible task list, with smooth scroll-into-view
- **Task action shortcuts** — `c` complete, `e` edit, `x` delete selected task, `Enter` edit selected task
- **Visual selection state** — Selected task highlighted with `.is-selected` class (purple accent)
- **Smart selection management** — Selection clears on Escape, auto-advances after delete, resets on HTMX task list refresh

### Changed
- **Help modal now shows 11 shortcuts** — Previously 4 (?, q, n, Esc), now includes j, k, c, e, x for task navigation/actions
- **Help modal skips internal shortcuts** — `showInHelp: false` flag hides Enter (duplicate of `e`) from reference
- **Shortcuts suppressed when help modal is open** — Typing while viewing help no longer triggers actions
- **Escape clears task selection** — Before closing dialogs, Escape now also deselects any selected task

### Technical Details
- Task selection uses existing `.is-selected` CSS class from dashboard.css
- Completion triggers via `.complete-gutter` click simulation (reuses TaskComplete's event delegation)
- Delete uses safeFetch with animation and error recovery
- Selection state automatically cleared on HTMX `afterSwap` events
- No new CSS needed — existing `.is-selected` styles provide the visual feedback

---

## [0.42.0] - 2026-02-08 — Complete safeFetch Migration

### Changed
- **Migrated all remaining fetch() calls to safeFetch()** — 18 calls across 5 files now use the centralized error handler with automatic CSRF injection, network status checks, and typed error throwing
- **task-list-options.js** — Preference saves and task restore now use safeFetch + handleError with component tags
- **mobile-sheet.js** — Skip instance and delete task actions use safeFetch with typed toast notifications
- **passkey.js** — All 5 WebAuthn API calls use safeFetch for consistent network/CSRF handling
- **task-swipe.js** — Swipe-to-complete fallback and swipe-to-delete use safeFetch + handleError
- **wizard.js** — All 7 onboarding API calls (wizard complete, calendar selections, calendar/event prefetch, Todoist import, domain creation) use safeFetch

### Added
- **V1-ROADMAP-AUDIT-V2.md** — Updated roadmap assessment reflecting post-v0.41.1 implementation state

### Technical Details
- Zero plain `fetch()` calls remain in application code (only error-handler.js uses raw fetch internally)
- Removed redundant `getCSRFHeaders()` calls — safeFetch handles CSRF injection automatically
- Removed manual `!response.ok` checks — safeFetch throws typed errors (NetworkError, ValidationError, etc.)
- Passkey module retains its own `{success, error}` return pattern while benefiting from safeFetch internals

---

## [0.41.1] - 2026-02-08 — Keyboard Shortcuts Discoverability

### Added
- **Footer hint bar** — Fixed bottom bar showing "? Keyboard shortcuts" with dismiss button, slide-up/down animations, localStorage persistence, hidden on mobile
- **One-time toast** — "Press ? to view keyboard shortcuts" with "Show" action button, fires once after 2s delay on first visit (desktop only)
- **Tooltip enhancement** — Quick add FAB shows "(Q)" in native tooltip via `data-shortcut` attribute
- **Settings panel** — "Keyboard Shortcuts" section with "View Shortcuts" button added to Settings > Appearance

### Changed
- **Centralized N shortcut** — Removed duplicate `N` key handler from task-sheet.js (now handled by shortcuts.js)

---

## [0.41.0] - 2026-02-08 — Toast System Redesign

### Changed
- **Complete toast.js rewrite** — Queue system prevents toast stomping, type variants (success, error, warning, info) with color-coded icons, generic action buttons with custom labels, deduplication by ID
- **Consolidated CSS** — Removed duplicate toast styles from app.css, loading.css is now single source of truth
- **Updated error-handler.js** — Uses new typed toast API (Toast.error, Toast.warning, Toast.success) with proper action labels ("Retry", "Refresh Page" instead of misused "Undo")

### Added
- **Typed toast API** — Toast.success(), Toast.error(), Toast.warning(), Toast.info() convenience methods
- **Toast queue** — FIFO queue with priority (errors jump to front), max 5 toasts, one visible at a time
- **Type-based durations** — Success: 3s, Info: 4s, Warning: 5s, Error: 6s (longer with actions, errors persistent with actions)
- **Toast icons** — ✓ (success), ! (error), ⚠ (warning), i (info)
- **In-place updates** — Same ID updates existing toast message/type without exit animation
- **Documentation** — docs/TOAST-SYSTEM.md with API reference, examples, migration guide

### Fixed
- **Silent 3-arg API bug** — Toast.show(msg, 'error') and Toast.show(msg, 'info', { duration: 5000 }) now work correctly (previously type string was ignored)
- **Misused "Undo" button** — Error recovery actions now show proper labels ("Retry", "Refresh") instead of confusing "Undo"
- **Toast stomping** — Rapid operations no longer overwrite each other, toasts queue properly
- **No visual types** — Toasts now have color-coded icons and styling based on type

### Technical Details
- Full backward compatibility maintained (all 30+ existing call sites work unchanged)
- Legacy onUndo → action conversion automatic
- Contract tests updated to verify new exports
- Dark mode support for all toast types

---

## [0.40.1] - 2026-02-08 — Error Recovery Foundation (WIP)

### Added
- **Enhanced error-handler.js** — Network status detection (online/offline events), typed error classes (NetworkError, ValidationError, CSRFError, RateLimitError, etc.), global error boundary
- **safeFetch() enhancements** — Pre-flight network check, automatic CSRF injection, typed error throwing for all HTTP status codes
- **handleError() improvements** — Recovery actions (retry, refresh), Sentry integration, user-friendly messages
- **Migrated 17 fetch() calls** — task-dialog.js (7), drag-drop.js (5), task-complete.js (3), plan-tasks.js (2) now use safeFetch() + handleError()
- **Error handling documentation** — docs/ERROR-HANDLING.md with developer guide, migration patterns, testing scenarios

### Notes
- **Incomplete** — Toast system needs architectural redesign before error recovery can be production-ready
- **Known issues** — Offline operations (e.g., adding thoughts) don't show proper feedback; toast timing/stacking needs work
- **Next steps** — Opus to investigate toast architecture redesign, then revisit error handling with stronger foundation

---

## [0.40.0] - 2026-02-08 — Production Hardening

### Changed
- **Database pool sizing** — reduced defaults from 5+10 overflow to 2+3 overflow (sufficient for single-worker deployment at current scale)
- **Pool recycle interval** — increased from 5 minutes to 30 minutes (reduces connection churn; `pool_pre_ping` handles stale connections)
- **Healthcheck endpoint** — switched Railway healthcheck from `/health` to `/ready` (verifies database connectivity before routing traffic)
- **Materialization architecture** — refactored to use per-user session scope instead of single session for all users (prevents ORM object accumulation, reduces memory pressure)

### Added
- **Statement timeout** — 30-second server-side timeout for all PostgreSQL queries (prevents runaway queries from holding connections)
- **Materialization timeout** — 5-minute timeout for materialization cycle with automatic retry (protects against pathological user data or slow external APIs)
- **Enhanced error logging** — all exception handlers now use `logger.exception()` with exception type for full tracebacks in production logs
- **Graceful shutdown** — database engine pool disposal on shutdown (eliminates "Connection reset by peer" warnings on deploys)

### Technical Details
Implements [PROD-HARDENING-PLAN.md](docs/PROD-HARDENING-PLAN.md) in full:
- Phase 1: Observability (traceback logging, readiness probe, graceful shutdown)
- Phase 2: Stability (timeouts, per-user sessions)
- Phase 3: Cost optimization (right-sized pool, reduced recycle frequency)

---

## [0.39.8] - 2026-02-08 — Demo Account Overhaul

### Changed
- Demo banner replaced with floating pill (bottom-right, dismissible via localStorage)
- Demo seed data rewritten with realistic PM persona, 4 domains, ~50 tasks

### Added
- Completed task history (~28 tasks) for populated analytics charts
- Recurring task instances (14 days backfill) for recurring completion rates
- Demo login feature documentation (`docs/DEMO-LOGIN.md`)

### Security
- Tighter rate limits on demo endpoints: `DEMO_LIMIT` (3/minute) replaces `AUTH_LIMIT` (10/minute) for both login and reset — demo operations are expensive (bulk DELETEs + ~80 INSERTs)
- Documented shared-state limitation and encryption testing guidance in `docs/DEMO-LOGIN.md`

---

## [0.39.7] - 2026-02-08 — Subview Header Consistency & Styling

### Fixed
- **Subview header layout** — kept grid layout in subviews (scheduled, completed, deleted) instead of switching to flex; fixes header height mismatch, gear button position drift, and missing column legend labels
- **Header height consistency** — added `min-height: 32px` to `.header-row1` so subview headers match main view height (energy-pill row)
- **Column legend in subviews** — Clarity/Dur/Impact labels now stay visible as non-interactive column headers (pointer-events disabled, sort icons hidden)
- **Date column label** — completed/scheduled subview headers now show a "Date" column label aligned with task dates
- **Subview task styling** — removed extra greying/dimming from completed and deleted subviews; tasks now use same styling as main view active tasks
- **Recurring icon centering** — positioned ↻ icon absolutely within `.task-due` so it no longer shifts date text off-center

---

## [0.39.6] - 2026-02-08 — Subview Header, Thoughts Rename, Checkmark Fixes

### Fixed
- **Subview header layout** — centered title (e.g. "Completed (162)") with absolute-positioned back arrow left and gear right; removes inconsistent gear button shift between main/sub views
- **Back button** — simplified to arrow-only (removed "Back to tasks" text); centered title provides context
- **Completed checkmarks** — fixed CSS specificity so `.completed-group` override (muted gray) beats `.task-item[data-completed="1"]` (purple); both light and dark mode

### Changed
- **Inbox → Thoughts** — renamed "Inbox" domain to "Thoughts" in all task list views (main, completed, scheduled, deleted)
- **Domain picker** — removed Thoughts/Inbox option from task create/edit form; new tasks default to first real domain
- **Thoughts styling** — domain header for unassigned tasks shown in italic with muted color

---

## [0.39.5] - 2026-02-07 — Subview Header & Styling Fixes

### Fixed
- **Domain name alignment** — changed `.project-header` from `align-items: baseline` to `center` so name, arrow, and pill are vertically centered
- **Subview header height** — added `align-items: center` and compact padding to flex override when back button is visible, matching main view height
- **Back button size** — shrunk from CTA-style (8px 16px padding, filled background) to compact ghost link (4px 10px, transparent); hover shows tint instead of solid fill
- **Completed checkmarks** — muted purple filled checkmarks to subtle neutral in completed subview; added dark mode variant

---

## [0.39.4] - 2026-02-07 — Labels, Column Order & Styling

### Changed
- **Impact labels** — unified to High/Mid/Low/Min everywhere (constants, templates, task form, JS dialog); replaces mixed P1/P2/P3/P4 and Critical/High/Medium/Low
- **Column order** — reordered task grid to Clarity | Dur | Impact (was Dur | Impact | Clarity), putting the mode-filtering column first
- **Column label** — renamed "Mode" to "Clarity" in sort headers and scheduled section
- **Column widths** — narrowed duration (68→48px) and impact (56→44px) columns; clarity stays 68px (was 80px in app.css override)
- **Normal clarity** — shows blank instead of "—" dash for normal/default clarity
- **Domain count** — restyled as gray micro pill with rounded background
- **Strikethrough** — removed line-through on completed tasks (kept for skipped); state is already communicated by section header and muted color

---

## [0.39.3] - 2026-02-07 — Domain Header & Special View Fixes

### Fixed
- **Domain header alignment** — arrow, name, and task count now vertically centered with proper baseline alignment; count `font-weight` reduced to 400 for clearer hierarchy
- **Completed section line rotation** — Pico CSS was rotating the `::after` trailing line via `details[open]>summary::after`; overridden with `transform: none !important`
- **Section separator alignment** — Completed section left padding now matches Scheduled (`var(--rail-w)` instead of `12px`)
- **Special view header layout** — header switches from grid to flex via `:has()` when back button is visible, preventing count from being squeezed into narrow grid columns
- **Back to tasks button** — restyled with brand tint background, uppercase, proper breathing room; system font matching other header labels

---

## [0.39.2] - 2026-02-07 — Section Task Styling & DATE Header Alignment

### Changed
- **Section task styling** — tasks in Completed/Scheduled sections use softer opacity (0.85 vs 0.65), no strikethrough, `text-secondary` color — settled but scannable since the section header already communicates state
- **DATE header alignment** — added `min-width: var(--col-date)` to `.task-due` so date values center-align with the header label
- **Scheduled separator** — rebuilt as grid layout matching task-item columns with disclosure triangle and label line
- **Domain add button** — SVG icon replaces text `+`, borderless style
- **Dark mode** — added section task overrides for consistent styling

---

## [0.39.1] - 2026-02-07 — Full Mode Names in Display

### Changed
- **Display labels** — use full mode names (`Autopilot`/`Brainstorm`) instead of abbreviations (`Auto`/`Brain`) in task list, scheduled, completed, deleted views, settings, and task dialog
- **Column width** — widened mode column from 42px to 68px (desktop) and 32px to 56px (mobile) to fit full names

---

## [0.39.0] - 2026-02-07 — Rename Clarity to Mode (Autopilot/Normal/Brainstorm)

### Changed
- **Mode system** — renamed clarity levels from `clear`/`defined`/`open` to `autopilot`/`normal`/`brainstorm`; "normal" is the unnamed default (most tasks), while autopilot (mindless work) and brainstorm (deep thinking) are the two extremes
- **Task form** — changed from 3 mandatory clarity pills to 2 optional mode toggle chips (`🧟 Autopilot` and `🧠 Brainstorm`); clicking an active chip deactivates it (sets to normal), clicking an inactive one activates it
- **Display labels** — updated task list, scheduled, completed, and deleted views to show `Auto`/`—`/`Brain` instead of `Clear`/`Def`/`Open`
- **Sort header** — renamed "Clarity" column to "Mode" with compact label "MOD"
- **Energy pill tooltips** — updated to reference new mode names
- **Settings** — "Assign Clarity" button now shows "Assign Mode" with autopilot/brainstorm options
- **Login hero** — updated CSS classes and titles to use new mode names

### Database
- **Migration** — renames `clear`→`autopilot`, `defined`→`normal`, `open`→`brainstorm`; backfills NULLs to `normal`; makes `clarity` column NOT NULL with default `normal`
- **Todoist import** — accepts both legacy (`clear`/`defined`/`open`/`executable`/`exploratory`) and new (`autopilot`/`normal`/`brainstorm`) label names

---

## [0.38.0] - 2026-02-07 — Task List UI Refinements

### Changed
- **Past-tasks badge** — replaced full-width pending-past banner with an inline amber badge on the SCHEDULED section header; clicking shows a popover with Complete all / Skip all actions
- **PMD banner copy** — evening shows "Plan tomorrow" + "N tasks waiting to be scheduled"; morning shows "Plan your day" + "N tasks to fill your time"; title and sub-text now sit on one line with a centered dot separator
- **Domain header count** — task count now hugs the domain name (left-aligned) instead of being pushed to the right; spacer element pushes the + button to the far right
- **Scheduled separator column labels** — the SCHEDULED section divider line now includes Date/Dur/Impact/Clarity column labels aligned with the task grid
- **Temporal date coloring** — overdue dates show in red, today's dates show in purple with bold weight
- **Grammar fix** — toast messages now properly pluralize "instance" / "instances"

---

## [0.37.3] - 2026-02-07 — Ghost Checkbox Visibility

### Fixed
- **Ghost checkbox opacity** — bumped resting opacity from 0.30 to 0.65 so the completion affordance is visible without hover

---

## [0.37.2] - 2026-02-07 — Banner Scroll, Missing Sections, Plan Button, Inbox Collapse

### Fixed
- **Recurring banner scroll** — moved `.pending-past-banner` inside `.task-list-scroll` so it scrolls with the task list instead of pushing the page beyond viewport height
- **Completed/Scheduled sections disappearing** — decoupled `<details>` collapse state from backend filtering; sections now always render with tasks, preference only controls the `open` attribute
- **Plan My Day banner button** — rewired to call `PlanTasks.enterPlanMode()` directly instead of fragile programmatic `.click()` on a potentially hidden calendar button
- **Completed view Inbox collapse** — Inbox domain group in completed tasks view now starts collapsed by default to avoid overwhelming the view with many completed tasks

---

## [0.37.1] - 2026-02-07 — Design Audit Bugfixes

### Fixed
- **Ghost checkbox centering** — added `box-sizing: border-box` so border doesn't push checkmark off-center
- **Task completion movement** — completing/reopening a task now refreshes the full task list from server, correctly moving tasks between domain groups and Completed/Scheduled sections
- **Section separator line** — constrained `::after` height to prevent vertical overflow when collapsing Completed section
- **Back-to-tasks button** — added `justify-self: start` and margin alignment so the button doesn't stretch across the full grid column in Scheduled/Completed/Deleted views

---

## [0.37.0] - 2026-02-07 — Design Audit

### Changed
- **Meta column readability** — resting opacity raised from 0.65 to 0.85; hover fade-in removed (always readable)
- **Ghost checkbox** — completion circle always visible at 30% opacity; full opacity on hover; communicates completability without requiring hover discovery
- **Clarity text labels** — single colored dot replaced with "Clear"/"Def"/"Open" in clarity colors; mirrors the impact column pattern; immediately readable without learning color codes
- **Add task affordance** — dashed placeholder row replaces invisible text; "+" button appears in domain headers on hover for quick capture
- **Domain task counts** — muted count shown on all domain headers (expanded and collapsed)
- **Single-row header** — "TASKS" label removed (redundant with nav), energy pills merged into sort row; header ~30px shorter
- **Plan My Day banner** — contextual banner at top of task list: "Plan tomorrow?" in evening, "Plan your day" in morning; shows unscheduled task count
- **Calendar auto-advance** — after 8pm, calendar shows tomorrow instead of empty evening; hero planning card replaces dead timeline space
- **Domain chevron** — removed redundant right chevron from domain headers; disclosure triangle alone is sufficient

---

## [0.36.0] - 2026-02-06 — Task List Visual Refinements

### Changed
- **Subtask badges** — neutral grey background with subtle border replaces purple tint; badges no longer compete with task titles for attention
- **Impact labels** — "P1/P2/P3/P4" (Todoist heritage) replaced with "High/Mid/Low/Min" in impact color; redundant dot indicator removed since left rail already encodes impact
- **Meta column readability** — resting opacity raised from 0.5 to 0.65; metadata readable without hovering
- **Single-dot clarity** — task row clarity column shows one colored dot instead of three (8 dots per screen instead of 24); column width reduced from 42px to 32px
- **Collapsible sections** — Scheduled and Completed sections always render at bottom of task list; collapsible in-place via click (replaces header view toggle buttons)
- **Section separators** — left-aligned label with trailing line replaces centered label between two rules; disclosure triangle indicates collapsible state
- **TASKS label** — header label opacity increased from 0.38 to 0.50 for better readability
- **Trash view** — moved from header icon button to settings panel action ("🗑 View deleted")

---

## [0.35.0] - 2026-02-06 — Brand-Aligned Header Refresh

### Changed
- **Spectrum bar** — gradient border (blue → purple → magenta) using clarity colors replaces flat grey border on task list header
- **Clarity-tinted energy pills** — active energy pill background uses clarity color tints instead of flat purple; three indicator dots show which clarity levels are currently visible (level 1: blue dot only, level 2: blue + purple, level 3: all three)
- **Segmented view toggle** — "Scheduled" / "Completed" buttons in a contained segmented control replace floating "Sched" / "Done" chips; trash icon separated as standalone button
- **Dot-only clarity** — task row clarity column shows only the colored dot (no text label); column narrows from 80px to 42px, giving task titles more space

---

## [0.34.0] - 2026-02-06 — Redesign Task List Header with Filter Chips and Minimal Settings

### Changed
- **Two-row header layout** — restructured from single row with kebab menu into Row 1 (title + sort columns + gear) and Row 2 (energy selector + view chips)
- **View chips** — `📅 Sched` and `✓ Done` are now always-visible one-click toggles for `show_scheduled_in_list` / `show_completed_in_list` preferences; `🗑` enters deleted tasks view
- **Settings panel** — replaced 12-control dropdown with a minimal gear (⚙) panel containing only: "Keep visible for" (1d/3d/7d) segmented control, "Hide recurring after done" toggle, and two action links for full scheduled/completed views
- **JS refactor** — removed old toggle handlers and cascading data-controls visibility logic; chip toggles now save preferences and refresh task list directly
- **Hardcoded sort preferences** — `task-sort.js` no longer calls the preferences API at load time; section ordering is hardcoded as constants (always group-at-bottom, always sort-by-date)
- **Preferences cleanup** — removed `completed_move_to_bottom`, `completed_sort_by_date`, `scheduled_move_to_bottom`, `scheduled_sort_by_date` from `PreferencesUpdate` schema and `update_preferences()` service method (kept in response model for backwards compat)

---

## [0.33.1] - 2026-02-06 — Flatten Scheduled/Completed Sections, Hardcode Group-at-Bottom

### Changed
- **Hardcoded section defaults** — `move_to_bottom` and `sort_by_date` preferences are now always `True`, removing 3 dead ordering branches from task grouping logic
- **Flattened scheduled/completed sections** — scheduled and completed tasks are now collected across all domains into flat chronological lists instead of being nested within each domain group
- **New return structure** — `group_tasks_by_domain()` returns a dict with `domain_groups`, `scheduled_tasks`, `completed_tasks` instead of a flat list
- **Section separators** — task list template renders three distinct sections with "Scheduled" and "Completed" separator labels
- **Reusable task macro** — task item rendering extracted into a Jinja2 macro to avoid duplication across sections

---

## [0.33.0] - 2026-02-06 — Rename Clarity Levels: Executable → Clear, Exploratory → Open

### Changed
- **Clarity naming revamp** — replaced jargon with everyday language throughout the entire stack:
  - Database values: `executable` → `clear`, `exploratory` → `open` (migration included)
  - Python enums, labels, and display functions
  - JavaScript sort order, dialog options, and wizard preview
  - CSS selectors, custom properties, and energy filtering rules
  - HTML templates: tooltips, pill labels, and form controls
  - Energy tooltips: "Zombie — no-brainers" / "Normal — clear tasks" / "Focus — deep work too"
  - All test files updated to match new values
- **No functional changes** — this is purely a naming improvement; all task filtering and energy modes work exactly as before

---

## [0.32.19] - 2026-02-02 — Fix Recurrence Bounds UI & Past Instance Materialization

### Fixed
- **Recurrence bounds date inputs too narrow** — widened Starts/Ends inputs from 44px to 110px so full dates are visible
- **Past instances never materialized** — removed the clamp that forced `start_date` to today in `materialize_instances`, so recurring tasks with a past start date now generate instances for past days
- **Pending-past banner never appeared** — with past instances now materialized, the dashboard banner and task dialog batch-complete button work as intended

---

## [0.32.18] - 2026-02-02 — Fix Migration for JSON Column Type

### Fixed
- **Migration cast to jsonb** — the `recurrence_rule` column is PostgreSQL `json` (not `jsonb`), so the `?` (key exists) and `-` (key removal) operators failed in production; added explicit `::jsonb` casts

---

## [0.32.17] - 2026-02-02 — Unify Recurrence Time Handling

### Changed
- **Single source of truth for time** — `task.scheduled_time` is now the only time field for recurring tasks; `recurrence_rule.time` is no longer used
- **Alembic migration** — moves existing `rule.time` values to `task.scheduled_time` (where not already set) and strips the `time` key from all recurrence rule JSON

### Removed
- **Time input from recurrence picker** — removed the "At" time field from `recurrence-picker.js`; task time is set via the main scheduled time input
- **rule.time override logic** — removed time parsing from `recurrence_service.py` (`materialize_instances` and `get_or_create_instance_for_date`)

---

## [0.32.16] - 2026-02-02 — Batch Completion for Past Instances

### Added
- **Batch complete endpoint** — `POST /api/v1/instances/batch-complete` completes all pending instances for a task before a given date
- **Batch past actions endpoint** — `POST /api/v1/instances/batch-past` with `action: "complete"` or `"skip"` handles all past pending instances across all tasks
- **Pending past count endpoint** — `GET /api/v1/instances/pending-past-count` returns count of pending past instances
- **Task dialog button** — recurring tasks show "Complete past instances (N pending)" button when past pending instances exist
- **Dashboard banner** — on dashboard load, a banner appears if pending past instances exist with "Complete all", "Skip all", and "Dismiss" actions

---

## [0.32.15] - 2026-02-02 — Recurrence Bounds UI

### Added
- **Recurrence start/end date pickers** — when any recurrence is active in the task dialog, "Starts" and "Ends" date fields appear, allowing users to define when a recurrence begins and optionally when it ends
- **Backend fields exposed in API response** — `recurrence_start` and `recurrence_end` are now included in `TaskResponse`, so the frontend can read them back when editing
- **Mobile recurrence picker bounds** — `recurrence-picker.js` now includes start/end date inputs with `getBounds()`/`setBounds()` API, and the task sheet template passes existing values when editing

---

## [0.32.14] - 2026-02-02 — Instance Drag-and-Drop Rescheduling

### Fixed
- **Recurring instance drag-and-drop rescheduling** — dragging a recurring task instance to a different time slot on the same day now correctly uses the instance schedule API (`PUT /api/v1/instances/{id}/schedule`) instead of updating the parent task's `scheduled_date`/`scheduled_time`. Cross-day drops still update the parent task (existing behavior).

---

## [0.32.13] - 2026-02-02 — Skip Recurring Task Instances

### Added
- **Skip action for recurring task instances** — right-click the completion gutter on a recurring task to show a context menu with "Skip this instance" option
- **Mobile skip support** — added "Skip instance" button to mobile task action sheet and task edit form for recurring tasks
- **Skipped instance visual styling** — skipped instances show with italic strikethrough and reduced opacity, distinct from completed tasks; includes dark mode support

---

## [0.32.12] - 2026-02-02 — Completion Visual Mismatch Fix

### Fixed
- **Task list date/completion mismatch for recurring tasks** — when today's instance is completed, the task list now shows "Today ✓" instead of the next occurrence date (e.g., "Feb 04"), resolving the confusing visual where a checked checkbox appeared next to a future date
- Pass `today` to the task list partial endpoint so it's available for the template

---

## [0.32.11] - 2026-02-02 — Weekly Preset Day of Week

### Fixed
- **Weekly preset ambiguity** — selecting "Weekly" recurrence now auto-selects today's day of week (e.g., "Every Monday" on a Monday) instead of sending a bare `{ freq: 'weekly', interval: 1 }` with no day, which relied on unpredictable backend defaults. Applied to both desktop dialog and mobile recurrence picker.

---

## [0.32.10] - 2026-02-02 — Prevent Recurrence Rule Data Loss

### Fixed
- **Recurrence rule data loss on edit** — editing a task with advanced recurrence fields (week_of_month, month_of_year) no longer silently drops those fields on save; both desktop dialog and mobile picker now preserve unknown fields
- **Desktop dialog missing yearly frequency** — added "years" option to the custom recurrence frequency select
- **Desktop dialog missing day-of-month for monthly** — added day-of-month input that shows when monthly frequency is selected
- **Desktop dialog `populateCustomRecurrence()` incomplete** — now restores day_of_month and correctly shows/hides freq-dependent UI rows

---

## [0.32.9] - 2026-02-02 — Recurring Task UX Fixes

### Fixed
- **`aria-pressed` wrong for recurring tasks** — screen readers now correctly report completion state for recurring task instances (was always "false" because it checked `task.status` instead of instance completion)
- **Toast text for recurring task completion** — gutter click now shows "Done for today" / "Reopened for today" instead of generic "Task completed" / "Task reopened"

---

## [0.32.8] - 2026-02-02 — GCal Sync Docs Consolidation

### Changed
- Consolidated three GCal sync docs into single [docs/GCAL-SYNC.md](docs/GCAL-SYNC.md) describing current architecture
- Archived `GCAL-SYNC-PLAN.md`, `GCAL-SYNC-HARDENING.md`, `GCAL-HABITS-CLUTTER.md` (fully implemented)
- Fixed stale doc links in CHANGELOG and archived cross-references

---

## [0.32.7] - 2026-02-02 — Sync Recurring Task Instances on Create/Update

### Fixed
- **Recurring task instances not syncing to GCal on create/update** — creating or updating a recurring task now triggers a bulk sync so all materialized instances appear on Google Calendar immediately, instead of waiting for the hourly background job

---

## [0.32.6] - 2026-02-02 — Faster Deploys

Instance materialization now runs as a background task after the server starts accepting connections, instead of blocking startup. This fixes intermittent Railway healthcheck failures where the 30-second window expired during heavy materialization + GCal sync work.

### Fixed
- **Intermittent deploy failures** — healthcheck no longer times out waiting for materialization to complete
- Server responds to `/health` immediately after migrations and DB connectivity check

### Changed
- Initial instance materialization runs in the background task loop (first iteration is immediate, then hourly)

---

## [0.32.5] - 2026-02-02 — Recurring Tasks Don't Clutter GCal

Recurring tasks (habits) only sync to Google Calendar when scheduled for a specific time. Unscheduled recurring tasks stay in Whendoist, keeping your calendar clean.

### Changed
- **Recurring tasks without a time slot no longer sync to GCal** — daily habits like "Sport machen" or "Чтение книги" stay in Whendoist unless time-blocked
- **One-off tasks always sync** — with or without a time (all-day event if no time)
- Removed "Include date-only tasks as all-day events" setting (replaced by the new rule)
- Existing habit events in GCal are automatically cleaned up on next sync

### Removed
- `gcal_sync_all_day` preference — no longer needed

See [docs/archive/2026-02-02-gcal-habits-clutter.md](docs/archive/2026-02-02-gcal-habits-clutter.md) for background.

---

## [0.32.4] - 2026-02-02 — GCal Sync Hardening Round 2

Second round of GCal sync reliability fixes. See [docs/archive/2026-02-02-gcal-sync-hardening.md](docs/archive/2026-02-02-gcal-sync-hardening.md) for full details.

### Fixed
- **Disable sync hangs / toggle stays on** — replaced per-event deletion loop (384 events x 1s throttle = 6+ min timeout) with single `delete_calendar` API call
- **Enable sync blocks for minutes** — moved `clear_all_events` from enable handler to background task
- **Progress stuck at "0 events"** — added in-memory progress tracking (DB hasn't committed during sync)
- **Disable during sync doesn't stop it** — added in-memory cancellation signal checked before each API call
- Improved error logging with full tracebacks, added frontend error alerts for disable failures

### Changed
- **5x faster bulk sync** — API throttle reduced from 1.0s to 0.2s per call (~5 QPS). 384 events: ~80s instead of ~6.5 min
- **Snappier UI** — optimistic toggle state, "Enabling..."/"Disabling..." feedback, 1s poll interval (was 3s)
- Removed dead `delete_all_synced_events()` method

---

## [0.31.9] - 2026-02-02 — Settings Redesign & Uniform GCal Event Color

### Changed
- **Settings: Consolidated Google Calendar into Integrations** — Google Calendars and Task Sync panels merged into an expandable section under the Google Calendar row in Integrations, matching the Todoist pattern. CONNECTIONS section went from 3 panels to 1
- **Settings: Whendoist calendar hidden from toggle list** — the sync output calendar is no longer shown as a toggleable calendar; instead it appears as a status hint next to the Task Sync label
- **Settings: Calendar toggles use fetch** — replaced HTMX-based calendar toggles with plain fetch calls for reliability inside expandable sections
- **GCal events inherit calendar color** — events synced to Google Calendar no longer set per-event `colorId` based on impact level; they inherit the Whendoist calendar's color instead, which the user can configure in Google Calendar settings
- Removed `GCAL_COMPLETED_COLOR_ID` and `GCAL_IMPACT_COLOR_MAP` constants (no longer needed)

---

## [0.31.8] - 2026-02-02 — Drag-and-Drop Duration Fix

### Fixed
- **Drag-and-drop overwrites task duration to 30 minutes** — the drop handler now sends `duration_minutes` to the API, preventing the backend validator from replacing the existing duration with the default

---

## [0.31.7] - 2026-02-02 — GCal Sync Hardening

### Fixed
- **Lock race condition** — per-user sync lock now uses `setdefault` to prevent TOCTOU on concurrent init
- **Throttle orphan deletion** — orphan event cleanup in bulk_sync and delete_all_synced_events now uses adaptive throttle to avoid rate limits
- **Calendar reuse clears stale events** — re-enabling sync on an existing "Whendoist" calendar now drops all events and sync records, then recreates from scratch to prevent orphans/duplicates
- **Removed dead constant** — `GCAL_SYNC_BATCH_RATE_LIMIT` was defined but never used

### Changed
- UI clarifies that sync may take up to 10 minutes depending on number of tasks
- Sync records are always cleared on enable (not just when calendar ID changes) since events are recreated

---

## [0.31.6] - 2026-02-02 — Fully Async GCal Sync

### Changed
- **All sync operations are now server-side background tasks** — enable, re-sync, and all-day toggle all return instantly
- Full-sync endpoint fires background task instead of blocking the HTTP request
- Status endpoint exposes `syncing` boolean so UI knows when sync is in progress
- Re-sync button polls status every 3s, shows live event count while syncing
- Page load auto-detects running sync and shows progress on re-sync button

---

## [0.31.5] - 2026-02-02 — GCal Sync: Non-blocking, Adaptive Throttle, Dedup

### Fixed
- **Bulk sync runs in background** — enable returns instantly, no more hanging UI
- **Adaptive throttle** — starts at 1 QPS, automatically slows down when rate-limited (adds +3s penalty per hit)
- **Reuse existing calendar** — `find_or_create_calendar` detects existing "Whendoist" calendar, cleans up duplicates instead of creating new ones every enable
- **Per-user sync lock** — prevents concurrent bulk syncs (double-click, rapid re-enable)
- **Rate limit vs permission 403** — Google `usageLimits` domain 403s retry with 5s/10s/20s backoff instead of permanently disabling sync
- Stale sync records cleared only when calendar ID changes (not on every re-enable)
- UI disables enable button during operation, all-day toggle ignores sync errors

---

## [0.31.2] - 2026-02-02 — GCal Sync Circuit Breaker

### Fixed
- Bulk sync now aborts immediately on calendar-level errors (403/404) instead of retrying hundreds of tasks
- Auto-disables sync and clears stale calendar ID when calendar is deleted externally or access is lost
- Settings page shows error banner when sync is auto-disabled, with clear guidance to re-enable
- Fire-and-forget background tasks log warnings (not debug) for calendar-level failures
- Re-enable always creates a fresh calendar instead of reusing a potentially stale ID

---

## [0.31.1] - 2026-02-02 — Sync Completed Todoist Imports

### Fixed
- Completed tasks imported from Todoist now sync to Google Calendar using `completed_at` date as fallback when `scheduled_date` is missing

---

## [0.31.0] - 2026-02-02 — Google Calendar Task Sync

### Added
- One-way sync: scheduled tasks appear in a dedicated "Whendoist" calendar in Google Calendar
- Impact-based event colors: P1=Tomato, P2=Tangerine, P3=Banana, P4=Sage
- Completed tasks show with "✓ " prefix and Graphite color
- Recurring task instances synced individually (no RRULE)
- Settings UI: enable/disable sync toggle, all-day event toggle, re-sync button
- OAuth scope upgrade flow for calendar write access (incremental consent)
- Dashboard deduplication: filters out events from the Whendoist sync calendar
- `duration_minutes` auto-set to 30 when `scheduled_time` is provided without a duration
- New database table `google_calendar_event_syncs` for sync state tracking
- API endpoints: `/api/v1/gcal-sync/enable`, `/disable`, `/status`, `/full-sync`
- Fire-and-forget background sync on task create/update/complete/delete

### Changed
- Google OAuth now supports optional write scope for calendar sync
- Encryption users see sync toggle greyed out (requires plaintext titles)

---

## [0.30.1] - 2026-02-01 — Quieter Production Logs

### Changed
- Startup logs now include version and boot timing (e.g., `Starting Whendoist v0.30.1 ... Startup complete (2.5s)`)
- Migration script is quiet on no-op (single line instead of 10-line banner)
- Materialization logs include task counts; silent at INFO level when idle
- Alembic context info downgraded from WARNING to DEBUG in production
- Periodic materialization loop only logs at INFO when work is actually done

---

## [0.30.0] - 2026-02-01 — Subtask Hierarchy & CI/CD Simplification

### Added
- Subtask hierarchy in Todoist import (two-pass import preserving parent-child relationships)
- Parent breadcrumb display and subtask count badges in task list
- Cascade delete confirmation when deleting parent tasks

### Changed
- CI pipeline: all 3 jobs (lint, typecheck, test) run in parallel
- Deployment: Railway auto-deploys on merge with "Wait for CI" gate

### Removed
- Release workflow, build provenance system, build manifest scripts

## [0.24.0–0.29.0] - 2026-01 — Production Hardening

### Added
- CSRF protection with synchronizer token pattern
- Health checks on `/ready` endpoint (database, Google Calendar)
- Observability: structured JSON logging, Prometheus metrics, Sentry integration
- PostgreSQL integration tests with service containers
- Centralized constants and cleanup jobs

### Changed
- API versioning with `/api/v1/*` routes
- Business logic extracted from routes to dedicated services
- Legacy `/api/*` routes removed

## [0.14.0–0.18.0] - 2026-01 — Performance & Testing

### Added
- CTE-based analytics queries (26+ queries down to ~10)
- SQL-level task filtering (replaces Python filtering)
- Calendar event caching (5-minute TTL)
- Alembic migrations with async SQLAlchemy support
- Database indexes for common query patterns

### Changed
- Rate limiting: 10 req/min auth, 5 req/min encryption
- CSP headers and PBKDF2 600k iterations (OWASP 2024)

## [0.10.0] - 2026-01 — Mobile Adaptation

### Added
- Service worker for offline caching
- Bottom sheet component with swipe-to-dismiss
- Task swipe gestures (right to complete, left to delete)
- Long-press action sheet and haptic feedback
- Pull-to-refresh and network status indicators
- Mobile tab layout (Tasks/Schedule)

## [0.9.0] - 2026-01 — Brand & Onboarding

### Added
- WhenWizard 8-step onboarding flow
- Landing page task-to-calendar animation
- 70+ stroke-based SVG icons and 21 illustrations
- Icon sprite system and brand assets

### Changed
- Migrated to semantic CSS tokens with full dark mode
- Accessibility: ARIA labels, skip-to-content, prefers-reduced-motion

## [0.8.0] - 2026-01 — E2E Encryption & Passkeys

### Added
- AES-256-GCM encryption with PBKDF2 key derivation
- WebAuthn/FIDO2 passkey unlock (PRF extension)
- Global encryption toggle for task titles, descriptions, domain names
- Todoist import preview dialog
- Plan My Day undo with toast

## [0.7.0] - 2026-01 — Analytics & Backup

### Added
- Analytics dashboard with ApexCharts
- Backup/restore (JSON export/import)
- Completed task tracking with visual aging
- Todoist completed task import

### Changed
- Migrated to Todoist API v1

## [0.6.0] - 2026-01 — Thought Cabinet

### Added
- Quick capture page with promote-to-task action
- Delete with undo toast

## [0.5.0] - 2026-01 — UI Polish

### Added
- Grid-based task layout with fixed-width columns
- Hour banding and time axis on calendar

### Changed
- Refined border hierarchy and hover states

## [0.4.0] - 2026-01 — Native Task Management

### Added
- Task dialog with full editing (title, description, schedule, duration, impact, clarity)
- Recurrence picker for repeating tasks
- Drag-to-trash deletion
- Domain management and Todoist import

## [0.3.0] - 2025-12 — Plan My Day

### Added
- Click-and-drag time range selection
- Smart scheduling algorithm
- PWA support (fullscreen, safe area)

## [0.2.0] - 2025-12 — Drag-and-Drop Scheduling

### Added
- Drag tasks from list to calendar
- 15-minute interval snapping and duration-based event sizing
- Overlap detection (max 3 columns)
- Calendar carousel (15 days)

## [0.1.0] - 2025-12 — Initial Release

### Added
- OAuth2 authentication (Todoist, Google Calendar)
- Task fetching, display, and grouping by project
- Energy-based task filtering
- Settings page for calendar selection
