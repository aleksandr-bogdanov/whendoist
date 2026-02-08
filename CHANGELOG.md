# Changelog

Development history of Whendoist, condensed into major milestones.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
