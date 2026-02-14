# Changelog

Development history of Whendoist, organized by release.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Iterative UI polish runs are collapsed into grouped entries — see git history for per-patch details.

---

Todo: 
- BIG: Scheduled backups
- BIG: Parent tasks
- Move thoughts bubbles a bit to the left to center out the visual weight of the page.
- Scheduled "testtesttest" for Feb 15 - add UNDO to the toast.
- Unscheduled "testtesttest" for Feb 15 - add Toast itself.
- Separate past scheduled tasks from normal scheduled tasks
- Remove or redesign the scrollbar in THOUGHTS (desktop only)
- 
- 
## v0.45.58 — 2026-02-14

### Fixed
- Restore task toast now shows task name (e.g. `"My task" restored` instead of generic `Task restored`)
- Restored scheduled tasks now reappear on the calendar immediately (restore endpoint returns full task data, frontend calls `updateCalendarItem`)

## v0.45.57 — 2026-02-14

### Fixed
- Archived (deleted) tasks reappearing on calendar after page refresh — calendar queries now exclude archived tasks


## v0.45.56 — 2026-02-14

### Fixed
- Deleted tasks not appearing in Deleted subview until page refresh — task deletion uses a 2–5s undo delay before calling the API; navigating to the Deleted view now flushes any pending deletion first


## v0.45.55 — 2026-02-14

### Fixed
- Calendar hour-grid scroll jump when swiping between days — all grids now stay synced continuously

## v0.45.54 — 2026-02-14

### Fixed
- **Calendar trackpad swipe broken on macOS** — Removed `overscroll-behavior-x: none` from `.hour-grid` (was blocking horizontal scroll chaining to carousel) and `scroll-behavior: smooth` from carousel (was fighting scroll-snap on trackpad input). Added `overscroll-behavior-x: contain` on carousel to prevent browser back-navigation.

---

## v0.45.53 — 2026-02-14

### Fixed
- **Desktop calendar swipe dead** — Added pointer-based drag-to-swipe on the calendar carousel so desktop users can click-drag horizontally to switch days. Touch devices continue using native scroll.

---

## v0.45.52 — 2026-02-14

### Fixed
- **Completed tasks persist on calendar** — Completing a task now removes its calendar card (`.scheduled-task` / `.date-only-task`). Editing a completed task no longer re-creates the calendar card.

---

## v0.45.51 — 2026-02-14

### Fixed
- **Calendar quick action overlapping checkbox** — On medium/long duration calendar tasks, the quick action button now shifts left of the complete checkbox instead of overlapping it.

---

## v0.45.50 — 2026-02-14

### Fixed
- **Health check query error** — Fixed `column "access_token" does not exist` error on every deploy by updating health check to query `access_token_encrypted` (column was renamed when encryption was added).

---

## v0.45.49 — 2026-02-14

### Removed
- **PWA debug badge** — Viewport fix confirmed working on iPhone 15 Pro Max; removed the live overlay from `base.html`. Static debug page (`/static/debug-pwa.html`) and Settings footer link remain for future testing.

---


## v0.45.48 — 2026-02-14

### Fixed
- **PWA bottom gap (for real)** — `100dvh` and `window.innerHeight` underreport by 59px on iOS PWA standalone (Settings/Analytics/Thoughts still showed 873px instead of 932px even after v0.45.47 position:static fix). Root cause: iOS Safari's viewport height calculation is unreliable in standalone mode. Fix: use `screen.height` (always correct) via early inline `<script>` in `<head>` that sets `--app-height` before first paint, and `mobile-core.js` for resize events. Standalone CSS blocks now use `height: var(--app-height, 100vh) !important` instead of `100dvh`.

---

## v0.45.47 — 2026-02-14

### Fixed
- **PWA bottom gap on all non-Tasks pages** — Root cause: `position: fixed` on page containers (Thoughts, Analytics, Settings) removed them from normal document flow, collapsing html/body to 0px height. iOS Safari interprets zero-height body as "no content" and shrinks the viewport by `safe-area-inset-top` (59px) even with `overflow: visible`. Fix: reverted all page containers from `position: fixed; inset: 0` to `position: static` with `height: var(--app-height, 100vh)`, plus `height: 100dvh !important` in standalone mode. Elements in normal flow keep html/body at full content height, preventing the viewport shrink. Bumped service worker cache to v18.

---

## v0.45.46 — 2026-02-14

### Added
- **PWA debug badge on all pages** — Shows viewport dimensions, computed styles (overflow, position, height), bounding rects, and gap measurement for the active page container in standalone mode; visible on Tasks (working) vs Settings (broken) for side-by-side comparison

---

## v0.45.45 — 2026-02-14

### Fixed
- **PWA bottom gap on Settings/Analytics (for real this time)** — Three root causes: (1) `position: fixed; inset: 0` was inside a nested `@media (display-mode: standalone)` block that didn't apply reliably on iOS; moved to the general mobile block matching the Thoughts page pattern; (2) Pico CSS `body>main { padding-block: 1rem }` (specificity 0,0,2) was beating our `main { padding: 0 }` (0,0,1), adding 16px top padding to `<main>`; overridden with `body > main { padding-block: 0 !important }`; (3) service worker `CACHE_VERSION` was stuck at `v16`, potentially serving stale CSS; bumped to `v17`

---

## v0.45.44 — 2026-02-14

### Fixed
- **Unscheduling a task from Scheduled section doesn't move it back** — `updateTaskInPlace` called `moveTaskToUnscheduledSection` which only reorders within the same list; when the task is in `#section-sched`, now calls `moveFromScheduledToDomain` instead to do the proper cross-section move back to its domain group

## v0.45.43 — 2026-02-14

### Fixed
- **PWA bottom gap on Settings/Analytics** — `height: 100dvh` approach failed because Pico CSS `body>main { padding-block: 1rem }` offsets the page container within `<main>`, and the layout chain leaves a gap at the bottom; switched to `position: fixed; inset: 0` (same pattern as Thoughts page) which bypasses all parent constraints

---

## v0.45.42 — 2026-02-14

### Fixed
- **New scheduled tasks stay in domain group** — `insertNewTask()` never checked for `scheduled_date`, so tasks created via "Add task" with a scheduled date appeared in the domain group instead of the Scheduled section; now creates `#section-sched` dynamically if it doesn't exist (same pattern as `#section-done`), then moves the task there and adds a calendar card when applicable

## v0.45.40 — 2026-02-14

### Fixed
- **PWA bottom gap on all pages** — `overflow: visible` fix from v0.45.39 only worked on Tasks page; the mobile body-scroll-lock (`height: 100% !important`) was constraining html/body to the shrunken viewport on other pages; removed `height: 100%` and added `height: auto !important` in standalone override so all pages (Settings, Analytics, Thoughts) get the full-screen viewport

### Added
- **PWA Viewport Fix documentation** — new `docs/PWA-VIEWPORT-FIX.md` explaining the iOS Safari viewport shrinking bug, root cause, fix, and prevention rules
- **Permanent PWA Debug link** — Settings footer has a "PWA Debug" link to `/static/debug-pwa.html` for diagnosing viewport issues on any device
- **CLAUDE.md rule #8** — never set `overflow: hidden` on `html`/`body` in PWA standalone mode

### Removed
- Temporary in-app debug overlay from settings page

---

## v0.45.39 — 2026-02-14

### Fixed
- **PWA bottom gap: actual root cause** — Pico CSS sets `overflow-x: hidden` on `:root` and `body`; per CSS spec, root overflow propagates to the viewport; on iOS PWA standalone, `overflow: hidden` on the viewport causes it to shrink by `safe-area-inset-top` (59px), making `100dvh = 873px` instead of `932px`; overriding to `overflow: visible !important` restores full-screen viewport

---

## v0.45.38 — 2026-02-14

### Fixed
- **PWA bottom gap root cause found and fixed** — `min-height: -webkit-fill-available` on html/body caused iOS to shrink the CSS viewport by `safe-area-inset-top` (59px), making `100dvh`/`innerHeight` report 873px instead of 932px; overriding to `min-height: 0` in standalone mode restores the full viewport
- **Removed html/body overflow:hidden** — the previous approach of locking html/body to viewport height with overflow:hidden was counterproductive; it interacted with `-webkit-fill-available` to shrink the viewport further

---

## v0.45.37 — 2026-02-14

### Fixed
- **Completely disable zoom on iPhone PWA** — added `maximum-scale=1.0, user-scalable=no` to viewport meta and global `touch-action: manipulation` via `*` selector to prevent pinch-to-zoom and double-tap-to-zoom everywhere

---

## v0.45.36 — 2026-02-14

### Fixed
- **PWA bottom gap fully eliminated** — locked `html/body` to `100dvh` with `overflow: hidden` in standalone mode; prevents body-level scroll that created visible gap below page containers
- **Main container overflow locked** — `main.container-fluid` gets `height: 100%; overflow: hidden` in PWA standalone, ensuring no body-level scroll from page container heights

---

## v0.45.35 — 2026-02-14

### Fixed
- **Double-tap zoom on rapid calendar nav taps** — added `touch-action: manipulation` to `.day-nav-btn` so fast taps advance days instead of triggering Safari zoom
- **Stale cached "today" in PWA** — added client-side reconciliation that detects when the service worker serves a cached page with the wrong "today" and corrects the calendar markers (or forces a reload if the real today is outside the rendered range)

---

## v0.45.34 — 2026-02-14

### Fixed
- **Calendar nav skipping dates on rapid tap** — replaced live `scrollLeft` calculation with intent-based `targetDayIndex` so rapid taps always advance correctly
- **Calendar nav buttons too small on mobile** — enlarged from 20×20px to 28×28px with 18px SVG icons and 48px touch targets
- **No active/press feedback on nav buttons** — added `:active` state with scale + purple background for instant tactile feedback
- **Taller mobile calendar header** — increased padding for better visual weight and button spacing

---

## v0.45.33 — 2026-02-14

### Fixed
- **PWA bottom grey gap eliminated** — removed `main` bottom safe-area padding on mobile; each page already handles its own bottom spacing
- **Calendar glass header backdrop** — added frosted-glass `::before` layer so content no longer scrolls visibly behind the transparent header
- **Tab switch scroll restoration** — double-rAF ensures layout is committed after `display:none → flex` toggle before restoring scroll position
- **Thoughts header overlap** — bumped glass mask opaque zone from 40% to 55% so content doesn't show through the blur
- **Analytics/Settings PWA height** — added `100dvh` height override for analytics and settings pages in PWA standalone mode (previously only dashboard panels had it)

---

## v0.45.32 — 2026-02-13

### Fixed
- **PWA content overlap resolved** — `--header-h` standalone override was being clobbered by a later `--header-h: 44px` at same specificity; moved into the standalone media query block so safe-area-inset-top is used for content offset
- **PWA bottom gap in dark mode** — `body` now gets matching background-color alongside `html` in standalone mode
- **Calendar swipe navigation restored** — `.hour-grid` had `touch-action: pan-y` which blocked horizontal swipes from reaching the carousel; changed to `pan-x pan-y`
- **Mobile tabs scroll save/restore** — selector was `.calendar-scroll` (doesn't exist) instead of `.calendar-carousel`

### Added
- **Fixed calendar day header** — date label and nav buttons now live above the carousel so they stay put during horizontal swipes; day label updates via IntersectionObserver
- **Schedule toast** — editing a task to add a scheduled date now shows a confirmation toast ("Scheduled 'title' for Jan 6")

---

## v0.45.31 — 2026-02-13

### Fixed
- **Calendar day navigation restored** — `todayCalendar` variable was out of scope in the DOMContentLoaded handler after scroll-to-now refactor; "Go to Today" button and IntersectionObserver now work again
- **PWA safe areas actually work** — shorthand `padding` rule was clobbering the standalone `padding-top` override; split to longhand and moved standalone override after the base rule in both light and dark mode
- **Task moves to scheduled section after dialog save** — `moveTaskToScheduledSection` now does a cross-section move into `#section-sched` when the sectioned layout is active, matching the pattern used by `moveTaskToCompleted`

---

## v0.45.30 — 2026-02-13

### Fixed
- **Calendar now scrolls to current time on mobile** — `scrollIntoView` was a no-op on the hidden calendar panel; now deferred to the first tab switch via `MobileTabs`
- **Editing a task's schedule via the dialog now updates its calendar card** — new `TaskMutations.updateCalendarItem()` removes the old card and creates a new one at the correct position
- **Unscheduling a task from the calendar now shows an undo toast** — matches the undo pattern used by delete and complete actions; API call is deferred 2 seconds
- **PWA mode: header no longer cramped near the notch** — `!important` on `padding-top` in the nested standalone media query overrides the mobile shorthand
- **PWA mode: no more white gap at the bottom** — panels use stable `100vh` instead of `var(--app-height)` in standalone mode (no dynamic address bar)

---

## v0.45.29 — 2026-02-13

### Added
- **Claude Code skills checked into repo** — `/fix-issue <number>` and `/fix-all-issues` slash commands for automated end-to-end issue resolution (investigate, fix, PR, merge)

---

## v0.45.28 — 2026-02-13

### Fixed
- **Task item partial no longer crashes with KeyError: 'request'** — `_task_list.html` had a `url_for()` call at module level (outside any macro) which requires `request` in the Jinja2 context; when `_task_item.html` imported the macro via `{% from %}`, Jinja2 executed the module-level code without context, causing the error. Replaced with a static path.

---

## v0.45.27 — 2026-02-13

### Fixed
- **Sentry auto-fix workflow now actually triggers Copilot** — switched from commenting `@copilot` (ignored by bots) to assigning `copilot-swe-agent[bot]` via the REST API with `agent_assignment` parameters

---

## v0.45.26 — 2026-02-13

### Fixed
- **Mobile: pull-to-refresh indicator no longer gets stuck** — when a pull gesture is abandoned mid-drag (user scrolls up or scroll position changes), the indicator now hides immediately instead of staying visible
- **Mobile: pull-to-refresh feels smoother** — CSS transitions disabled during drag for instant finger-following, rubber-band dampening for natural resistance, rAF-batched DOM updates, and native overscroll prevented during gesture
- **Mobile: pull-to-refresh waits for actual data** — refresh now waits for HTMX `afterSettle` instead of an arbitrary 500ms timeout, with a 5s safety fallback

---

## v0.45.25 — 2026-02-13

### Fixed
- **Mobile: parent task names no longer truncated to 1 line** — breadcrumb above child tasks now wraps up to 2 lines instead of cutting off long parent names

---

## v0.45.23 — 2026-02-12

### Added
- **Standalone privacy policy page** — `/privacy` now serves a full page (not a redirect) with expanded coverage of Google API data usage, data storage, cookies, and deletion rights. Required for Google OAuth verification.
- **Terms & Privacy links in settings footer** — legal links now accessible from the app

---

## v0.45.22 — 2026-02-12

### Fixed
- **Save button stuck disabled after in-place edit** — `openDialog()` now resets `submitBtn.disabled = false`, fixing the button becoming inaccessible after editing a task (especially after domain changes).
- **Unschedule not moving task out of Scheduled section** — `moveTaskToUnscheduledSection()` only works within a single `.task-list` container. Tasks in `#section-sched` now use new `TaskMutations.moveFromScheduledToDomain()` for proper cross-section moves (applies to both RMB unschedule and drag-to-trash).

---

## v0.45.21 — 2026-02-12

### Added
- **In-place task mutations** — Task edits, creates, completions, deletions, and skips now update the DOM surgically instead of reloading the page. New `TaskMutations` JS module handles patching, section moves, re-sorting, scroll-to, and highlight animation. New `GET /api/v1/task-item/{id}` endpoint returns server-rendered HTML for single task insertion.

### Changed
- Task dialog save no longer triggers `window.location.reload()` — uses `TaskMutations.updateTaskInPlace()` for edits and `TaskMutations.insertNewTask()` for creates.
- Task completion/reopening, deletion, and drag-drop unschedule all use in-place DOM updates instead of full page refreshes.
- Added `DragDrop.initSingleTask()` export for binding drag handlers on dynamically inserted tasks.
- Added `data-domain-id` attribute to task items for client-side domain change detection.

---

## v0.45.20 — 2026-02-12

### Added
- **Sentry auto-fix workflow** — GitHub Actions workflow that auto-assigns Sentry-created issues to GitHub Copilot coding agent, which investigates and opens draft fix PRs.

---

## v0.45.14–v0.45.19 — 2026-02-12

### Fixed
- **Thoughts send button** — Replaced ghost outline with solid purple fill + white arrow icon for visibility in both themes.
- **Deleted tasks reappear** — Dashboard and HTMX task-list queries now exclude archived tasks.
- **Google Calendar 403 on re-login** — OAuth write scope flag derived from actual token response scopes instead of stale cookie state.
- **Desktop toast notifications** — Long messages wrap (up to 3 lines); toast aligns with content area on ultrawide monitors.
- **Send button contrast** — Visible border on both desktop and mobile.

---

## v0.45.0–v0.45.12 — 2026-02-12

### Changed
- **Thoughts page chat-style redesign** — Replaced top-input panel with bottom-input chat layout. Bubbles with left-aligned content and right-pinned actions, date separators, scroll-area with gravity pushing bubbles to bottom, slide-up animation for new thoughts, glass morphism bottom bar on mobile.

### Fixed (12 follow-up patches)
- Header height, font matching, button contrast, oval button radius, horizontal rhythm, date grouping (`external_created_at`), bottom blank space, date separators, glass header blur, bottom fade gradient, mobile action button alignment, Jinja2 `items` key collision.

---

## v0.44.0–v0.44.11 — 2026-02-11

### Added
- **Mobile-first redesign for Thoughts, Analytics & Settings** — All three pages now match the Tasks page: full-viewport scrolling, glass-morphism sticky headers with backdrop blur, edge-to-edge flat layout, bottom fade gradients, hairline separators, 44px touch targets, scroll spacers for tab bar clearance. Dark mode counterparts.
- **Submit button for thought capture** — Desktop: keyboard-hint badge. Mobile: iMessage-style round accent button.

### Fixed (10 follow-up patches)
- Warm-tinted energy glass, toast undo duration (5s), toast message wrapping, toast dismiss button on iPhone SE, toast full-width snackbar, bottom empty space reduction, thoughts row visual balance, thoughts text space, capture bar sticky scroll, thoughts mobile polish.

---

## v0.43.0–v0.43.3 — 2026-02-11

### Changed
- **Glass UI consistency** — Unified backdrop-filter recipe across all floating glass elements (energy selector, tab bar). More transparent mobile glass. Much more transparent everywhere.
- **Mobile font sizes** — Bumped all mobile font sizes closer to iOS system defaults for iPhone readability. Two rounds of increases.

### Removed
- **Playwright CI workflow** — Removed (was running boilerplate tests against playwright.dev, not Whendoist). Removed `fsevents` from direct dependencies.

---

## v0.42.84–v0.42.99 — 2026-02-10/11

Mobile UX overhaul: seamless glass headers & polish (16 patches).

### Changed
- **Seamless glass header** — Task-list-header extends upward behind transparent site-header using negative margin + padding. One continuous glass element.
- **Calendar fade gradient** — Replaced overlay-based approaches with CSS `mask-image` on carousel (compositing layer fix for iOS Safari).
- **Mobile touch targets** — `::before` pseudo-element touch expanders (44px) for day-nav, domain-add, and calendar quick-action buttons.
- **Font sizes round 2** — All mobile font sizes increased further for iPhone readability (task titles 13→15px, metadata 9.75→11px, etc.).
- **Playwright mobile UX audit infrastructure** — Audit scripts, static HTML reproductions, Playwright config.

---

## v0.42.62–v0.42.83 — 2026-02-10

Mobile UX overhaul: glass UI & Telegram-inspired design (22 patches).

### Changed
- **Floating glass energy selector** — Energy mode selector moved from header to floating iOS-style glass segmented control above bottom tab bar with text labels.
- **Glass everywhere** — Site header, task-list header, domain headers, and tab bar all use frosted glass (progressive iterations from 85% → 45% → ~0% opacity). Telegram-matched levels (~88% light, ~82% dark).
- **Nunito font** — Switched body/UI text from system font to Nunito. Relaxed task padding, transparent impact backgrounds, thinner impact rail, hairline separators, bolder domain headers.
- **Glass tab bar** — Bottom tab bar uses frosted glass. Active tab: Telegram-style color-only (no background pill). Floating individual pill design.
- **CSS custom property `--header-h`** — Header height token used for sticky offset and scroll padding throughout.
- **SVG tab icons** — Replaced emoji tab icons with SVG sprite references. Font-weight fixes for Nunito range.

### Fixed
- Service worker caching old CSS (bumped `CACHE_VERSION` to force invalidation).
- Energy selector `position: fixed` broken inside `-webkit-overflow-scrolling: touch` container — moved in DOM.
- Nav underline position — invisible `::before` pseudo for 44px touch target while keeping visual at 24px.

---

## v0.42.52–v0.42.61 — 2026-02-10

Mobile UX overhaul: filter bar, swipe fixes, tab layout (10 patches).

### Changed
- **Mobile filter bar** — Full sort labels (Clarity/Duration/Impact), compact at 580px (DUR/IMP/CLR), gradient spectrum bar, invisible 44px tap targets on sort buttons.
- **Two-line task names** — `-webkit-line-clamp: 2` instead of single-line truncation on mobile.
- **Progressive domain label** — Label in sticky header reveals proportionally to scroll, smooth crossfade between domains.
- **Bottom fade gradient** — Content fades out before energy selector and tab bar (120px gradient).

### Fixed
- Swipe gestures broken by `\!` syntax error and `const`/`var` scope conflict — both fixed.
- Sticky task-list header broken by `translateZ(0)` and `will-change: transform` — overridden in mobile.css.
- Desktop header token conflict — removed duplicate `--col-duration` declaration from `app.css`.
- Long press triggering iOS text selection — reduced from 400ms to 300ms.
- Mobile tab bar layout — vertical icon+label, 56px height, fixed scroll overlap.

---

## v0.42.42–v0.42.51 — 2026-02-10

### Added
- **Gesture discovery** — Three-layer progressive disclosure: animated swipe hint on first visit, permanent purple edge on task rows (touch devices), one-time long-press tooltip after first dialog.
- **BRAND.md v1.8: Mobile & Touch section** — Documents gesture model, touch targets, mobile layout principles, breakpoints, bottom sheet spec.

### Changed
- **Swipe-left schedules instead of deletes** — Swiping left now opens calendar for manual scheduling (was auto-tomorrow). Delete moved exclusively to long-press context menu.
- **Flatten domain cards on mobile** — Groups lose card borders, become flat sections with sticky headers (recovers ~24px horizontal space).

### Fixed
- Swipe-right completion — correct parameters passed (`taskEl, taskId, instanceId, shouldComplete, isRecurring`).
- Mobile CSS polish — compact filter bar padding, two-liner truncation, domain card spacing, SVG FAB icon, removed tab badge.

---

## v0.42.29–v0.42.41 — 2026-02-09/10

### Added
- **Calendar zoom** — +/- buttons and Ctrl+scroll (pinch on macOS) adjust hour height 30–100px, persisted. New `calendar_hour_height` preference with migration.
- **Calendar card actions menu** — Right-click context menu with Skip (recurring), Unschedule (non-recurring), Edit, Delete.
- **Unschedule from task list** — Kebab menu option for scheduled non-recurring tasks.
- **Actions menu for all tasks** — Kebab (⋮) on every task, contextual items. Undo-based delete.
- **Universal departing animation** — Completing, scheduling, and deleting all use consistent slide-down + fade-out + collapse.

### Changed
- Smooth calendar zoom with `requestAnimationFrame`. Date-aware completion toasts ("Done for Mon, Feb 10").
- SVG icons for calendar quick-actions and kebab button. Kebab clickability z-index fix.

### Fixed
- Mobile kebab/touch visibility — `@media (hover: none)` overrides. Short calendar cards show compact buttons.

---

## v0.42.22–v0.42.28 — 2026-02-09

v1.0 security gate audit: final hardening round.

### Fixed
- **domain_id IDOR** — Added ownership validation in `create_task()` and `update_task()`.
- **Batch update dirty session** — Added rollback and sanitized error messages.
- **/ready info leakage** — Sanitized database error messages, removed user count.
- **Backup validation** — Pydantic validators for status, clarity, impact fields.
- **Circular parent_id protection** — Cycle detection in import, recursion guards in archive/restore.
- **TaskUpdate.clarity validation** — Added enum validator matching TaskCreate.
- **Todoist import error leakage** — Generic message to client, full exception logged server-side.
- **Head-loaded JS crash** — `error-handler.js` and `shortcuts.js` used `document.body` in `<head>` where it's null.
- **Parent tasks excluded from Plan My Day** — Only subtasks are plannable.
- **Backup import 500** — Validation errors return 400; `BackupValidationError` handler. Legacy clarity mapping. Missing fields in round-trip.
- **Instance schedule crash** — `MissingGreenlet` from missing `selectinload`.

---

## v0.42.7–v0.42.21 — 2026-02-09

v1.0 security gate audit: hardening sprint.

### Security
- **CSP hardening** — Self-hosted all vendor scripts (htmx, air-datepicker, ApexCharts, Pico CSS). Removed `cdn.jsdelivr.net` from CSP.
- **Sanitized error responses** — Exception details no longer exposed to clients.
- **Rate limits on destructive endpoints** — 5/min for import wipe, Todoist, GCal enable/disable/sync, passkey deletion.
- **Offline mutation guards** — Task completion, deletion, creation, scheduling check network status before optimistic UI updates.
- **HTMX CSRF injection** — Global `htmx:configRequest` listener injects CSRF token on all state-changing requests.
- **Session fixation defense** — OAuth and demo login clear session before setting user_id.
- **Backup import size limit** — Files > 10 MB rejected with 413 before parsing.
- **Input validation** — Range validation on impact, duration_minutes, completed_limit; max_length on string fields; batch size limits.

### Fixed
- **Offline flickering** — Network checks added to plan-tasks, dialog complete/delete, mobile skip (secondary paths).
- **Token revocation zombie state** — GCal sync auto-disables when Google revokes access.
- **Instance creation race condition** — `IntegrityError` from unique constraint handled gracefully.
- **Orphaned instances on recurrence disable** — Turning off recurrence deletes future pending instances.
- **Backup subtask hierarchy** — `parent_id` included in exports, two-pass ID mapping on import.

### Added
- **Mobile bottom tab bar** — Fixed to bottom of viewport, safe-area support.
- **Accessibility** — aria-live announcer, swipe role description, `.sr-only` utility.
- **Service worker cache TTL** — API responses expire after 5 minutes. `CLEAR_API_CACHE` on reconnect.

### Changed
- **Recurring task UTC notice** — Added timezone notice near scheduled time input.
- Scaling documentation for rate limiting and caching with Redis.
- README terminology updated (Executable→Autopilot, P1-P4→High/Mid/Low/Min).
- GCal events orphan cleanup on data wipe.

---

## v0.42.0–v0.42.6 — 2026-02-08/09

### Changed
- **Complete safeFetch migration** — All remaining 18 fetch() calls across 5 files now use safeFetch() with automatic CSRF injection and typed errors. Zero plain `fetch()` in application code.
- **V1-ROADMAP.md rewritten** — Reflects v0.42.1 state. 7 stale docs archived.

### Added
- **Keyboard shortcuts: task navigation & actions** — `j`/`k` move selection, `c` complete, `e`/Enter edit, `x` delete. Visual selection state, smart selection management. Help modal shows 11 shortcuts.

---

## v0.41.0–v0.41.1 — 2026-02-08

### Changed
- **Toast system rewrite** — Queue system prevents stomping, type variants (success/error/warning/info) with icons, action buttons, deduplication. Typed API: `Toast.success()`, `.error()`, `.warning()`, `.info()`. FIFO queue with priority, type-based durations, in-place updates. Full backward compatibility.

### Added
- **Shortcuts discoverability** — Footer hint bar ("? Keyboard shortcuts"), one-time toast, tooltip enhancement, Settings panel entry.

---

## v0.40.0–v0.40.1 — 2026-02-08

### Changed
- **Production hardening** — Database pool 5+10 → 2+3. Pool recycle 5min → 30min. Healthcheck `/health` → `/ready`. Per-user materialization sessions.

### Added
- **Statement timeout** — 30s for all PostgreSQL queries.
- **Materialization timeout** — 5 minutes with automatic retry.
- **Graceful shutdown** — Database engine pool disposal on shutdown.
- **Error recovery foundation** — `safeFetch()` with pre-flight network check, typed error classes (NetworkError, ValidationError, CSRFError, RateLimitError), `handleError()` with recovery actions, Sentry integration. 17 fetch() calls migrated.

---

## v0.39.0–v0.39.8 — 2026-02-07/08

### Changed
- **Rename clarity to Mode** — `clear`/`defined`/`open` → `autopilot`/`normal`/`brainstorm`. Two optional toggle chips replace 3 mandatory pills. Migration included.
- **Impact labels** — Unified to High/Mid/Low/Min everywhere.
- **Column order** — Clarity | Dur | Impact (was Dur | Impact | Clarity).
- **Full mode names** — `Autopilot`/`Brainstorm` instead of `Auto`/`Brain`.
- **Inbox → Thoughts** — Renamed throughout all views. Removed from domain picker.
- **Demo account overhaul** — Floating pill banner, realistic PM persona with ~50 tasks, ~28 completed tasks for analytics, 14-day recurring backfill. Tighter rate limits (3/min).
- **Subview headers** — Centered title, arrow-only back button, proper grid layout in subviews. Multiple alignment and specificity fixes.

---

## v0.38.0 — 2026-02-07

### Changed
- **Task list UI refinements** — Past-tasks amber badge on SCHEDULED header with Complete/Skip popover. PMD banner contextual copy (morning/evening). Domain count left-aligned. Scheduled separator column labels. Temporal date coloring (overdue=red, today=purple).

---

## v0.37.0–v0.37.3 — 2026-02-07

### Changed
- **Design audit** — Meta column resting opacity 0.65→0.85. Ghost checkbox always visible (30%). Clarity text labels. Dashed add-task placeholder. Domain task counts. Single-row header (energy pills merged into sort row). Plan My Day contextual banner. Calendar auto-advance after 8pm.

### Fixed
- Ghost checkbox centering, task completion movement, section separator overflow, back-to-tasks button stretch.

---

## v0.36.0 — 2026-02-06

### Changed
- **Task list visual refinements** — Neutral subtask badges. Impact labels "High/Mid/Low/Min" (replaces P1-P4). Single-dot clarity column (32px). Collapsible Scheduled/Completed sections. Left-aligned section separators. Trash moved to settings panel.

---

## v0.35.0 — 2026-02-06

### Changed
- **Brand-aligned header refresh** — Spectrum gradient border (blue→purple→magenta). Clarity-tinted energy pills with indicator dots. Segmented view toggle. Dot-only clarity column (42px).

---

## v0.34.0 — 2026-02-06

### Changed
- **Task list header redesign** — Two-row layout: Row 1 (title + sort + gear), Row 2 (energy + view chips). Always-visible `Sched`/`Done` chip toggles. Minimal settings panel (replaces 12-control dropdown). Hardcoded sort preferences.

---

## v0.33.0–v0.33.1 — 2026-02-06

### Changed
- **Flatten scheduled/completed sections** — Flat chronological lists (no per-domain nesting). New return structure with `domain_groups`, `scheduled_tasks`, `completed_tasks`. Reusable task macro.
- **Rename clarity levels** — `executable`→`clear`, `exploratory`→`open`. Migration included.

---

## v0.32.4–v0.32.19 — 2026-02-02

### Added
- **Recurring tasks** — Skip instances (right-click + mobile), batch completion for past instances, recurrence bounds UI (start/end dates), instance drag-and-drop rescheduling, weekly preset auto-selects day of week.
- **Pending past dashboard banner** — With Complete all / Skip all / Dismiss actions.

### Fixed
- Recurrence bounds date inputs too narrow. Past instances never materialized. Completion visual mismatch. Recurrence rule data loss on edit. Desktop dialog missing yearly/monthly fields. `aria-pressed` wrong for instances.
- Recurrence time unified to `task.scheduled_time` (migration strips `rule.time`).
- Migration cast `::jsonb` for PostgreSQL `json` column.

---

## v0.32.0–v0.32.3 — 2026-02-02

### Changed
- **GCal sync hardening (2 rounds)** — Per-user sync lock, adaptive throttle (1→5+ QPS), calendar reuse with stale event cleanup, cancellation signal, progress tracking, circuit breaker. Recurring tasks without time don't sync (keeps calendar clean). Consolidated 3 GCal docs into [GCAL-SYNC.md](docs/GCAL-SYNC.md).

---

## v0.31.0–v0.31.9 — 2026-02-02

### Added
- **Google Calendar task sync** — One-way sync to dedicated "Whendoist" calendar. Impact-based colors, completed prefix, recurring instances synced individually. Settings UI, OAuth scope upgrade, dashboard dedup. Fire-and-forget background sync.
- **Settings redesign** — Google Calendar consolidated into Integrations. Calendar toggles use fetch. GCal events inherit calendar color (removed per-event `colorId`).

### Fixed
- Drag-and-drop overwrites task duration to 30min. Completed Todoist imports sync. GCal sync circuit breaker for 403/404. Fully async sync operations with status polling.
- Non-blocking bulk sync, adaptive throttle, per-user lock, rate limit vs permission 403 detection.

---

## v0.30.0–v0.30.1 — 2026-02-01

### Added
- Subtask hierarchy in Todoist import (two-pass with parent-child relationships)
- Parent breadcrumb display and subtask count badges
- Cascade delete confirmation for parent tasks

### Changed
- CI pipeline: 3 jobs run in parallel. Railway auto-deploys on merge.
- Quieter production logs with version and boot timing.

---

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
