# Changelog

Development history of Whendoist. Per-patch details in git history.

---

## v0.55.32 — 2026-02-26

### Fix: iOS auto-zoom on triage drawer inputs

Bumped triage drawer textarea and parent task search input from `text-sm` (14px) to `text-base` (16px). iOS Safari auto-zooms any input with font-size below 16px, causing the page layout to break.

---

## v0.55.31 — 2026-02-26

### Fix: Extended duration and date abbreviation parsing

Duration parser now supports spaced compound formats (`2h 30m`), and longer suffixes (`30min`, `1hr`, `2hrs`). Added date abbreviations: `tod` (today), `tom` (tomorrow), `yes`/`yest` (yesterday).

---

## v0.55.30 — 2026-02-26

### Fix: Domain symbol @ → #, triage drawer bug fixes

Changed domain token prefix from `@` to `#` (like Todoist) across parser, autocomplete, smart input hook, quick-add, and triage drawer. Fixed three triage drawer bugs: date replacement now uses dynamic token matching instead of static regex (handles chrono-node dates like "next friday"), duration replacement handles compound formats like `2h30m`, and changing domain via chip row now clears parent task if it's in a different domain.

---

## v0.55.29 — 2026-02-26

### Refactor: Bottom sheet triage drawer for thoughts

Replaced inline `ThoughtTriageCard` expansion (which consumed ~60% of iPhone viewport) with a vaul-based bottom sheet drawer that slides up as an overlay. Extracted reusable `DomainChipRow`, `ImpactButtonRow`, and `ScheduleButtonRow` picker components into `field-pickers.tsx`. Added collapsible "More options" section with duration and clarity pickers. Convert button now shows domain color. Thoughts page dropped from ~640 to ~340 lines — card list is now a simple flat list of tappable rows with swipe always enabled.

---

## v0.55.28 — 2026-02-26

### Fix: Thoughts triage panel clipping on iPhone SE

Removed two `overflow-hidden` declarations from the triage panel card wrapper and panel container that clipped domain chips, priority labels, and the Convert button at 375px width. Added `shrink-0` to domain chip buttons so flex wraps instead of shrinking text. Tightened mobile selector spacing to match panel rhythm.

---

## v0.55.27 — 2026-02-25

### Feat: Thoughts page redesign — inbox cards, smart input triage, mobile selectors

Replaced chat-bubble layout with full-width inbox card list. Triage panel uses shared `useSmartInput()` hook for inline metadata parsing (`#domain`, `!priority`, `?clarity`, `30m`, `tomorrow`, `//notes`). Mobile gets tappable domain pills, priority buttons, and schedule quick-picks below the smart input. Extracted `useSmartInput` hook from duplicated code in Quick Add and Thoughts, added CLAUDE.md rule 10 to prevent future duplication.

---

## v0.55.26 — 2026-02-25

### Fix: Analytics query production readiness

Bounded three unbounded queries that degrade with scale: `_get_aging_stats` (LIMIT 5000), `_calculate_streaks` (2-year lookback), `get_recent_completions` (365-day cutoff). Added composite indexes `(user_id, status, completed_at)` on both Task and TaskInstance tables. Fixed median calculation bug, eliminated multiple `date.today()` calls, removed redundant DISTINCT in streaks query.

---

## v0.55.25 — 2026-02-25

### Fix: Sticky header height jump when scrolling between sections

Fixed the task list sticky header (domain label + sort columns) changing height in real time when scrolling from domains to scheduled section. Added fixed height so the header size stays constant regardless of whether the domain label is visible.

---

## v0.55.24 — 2026-02-25

### Feat: Analytics page redesign

Complete visual overhaul of the analytics dashboard. Hero gradient card with animated count-up and sparkline. Section grouping (Overview/Patterns/Details) with divider lines. Asymmetric grids for visual hierarchy. Two new charts: Active Hours (area chart with gradient) and Resolution Time (donut chart replacing stacked bar). All chart cards have subtitles explaining the data, hover lift effects, and proper tooltip styling (solid background, box shadow). Domain donut no longer clips. Sticky header with Apple glass effect keeps range selector accessible while scrolling. Range switching uses `keepPreviousData` for seamless transitions. Impact colors updated to match brand spec (P4 Min = grey). Recurring tasks show progress bars. Velocity chart has a visible legend.

---

## v0.55.23 — 2026-02-25

### Fix: Wizard swipe animation and polish

Replaced simple fade transition with directional slide animation (translateX + opacity). Added smooth height animation between steps of different sizes — locks current height before content swap, measures new content, animates between them. Fixed Radix Dialog Portal timing: replaced `useRef` + `useEffect` (ref was null on mount) with callback ref pattern. Swipe at boundaries: back on first step is a no-op, forward on last step triggers finish. Button glow no longer clipped — `overflow-hidden` only applied during active transitions.

---

## v0.55.22 — 2026-02-25

### Fix: Wizard swipe — use native event listeners

Replaced React synthetic `onPointerDown`/`onPointerUp` with native `addEventListener` for both touch and pointer events, following the same pattern as the calendar carousel. Touch events (`touchstart`/`touchend`) handle mobile swipe; `pointerdown` on the wrapper + `pointerup` on `document` handles desktop mouse drag (skips buttons/inputs). Wheel/trackpad handler unchanged.

---

## v0.55.21 — 2026-02-25

### Fix: Restore original wizard layout with swipe support

Reverted wizard back to original one-step-at-a-time conditional rendering (pre-swipe changes). The simultaneous panel rendering (both scroll-snap and transform approaches) broke layout and scrolling. Swipe/wheel navigation is now layered on top of the original structure: wheel events with 800ms cooldown for desktop trackpad, pointer swipe detection for touch. Both trigger the same `goForward`/`goBack` that buttons use.

---

## v0.55.20 — 2026-02-25

### Fix: Wizard swipe — replace native scroll with transform

Replaced `overflow-x: auto` + CSS `scroll-snap` with `overflow: hidden` + CSS `transform: translateX()`. Native scroll-snap couldn't handle macOS trackpad momentum — hard swipes flew to the last panel. Transform approach gives full control: one panel per gesture, no momentum overshoot. Dots now driven directly by React state instead of scroll position events.

---

## v0.55.19 — 2026-02-25

### Fix: Wizard swipe infinite scroll and layout centering

Fixed two wizard issues: (1) Trackpad/mousewheel caused infinite scrolling because raw pixel deltas were piped to `scrollBy` — now snaps one panel at a time with a 600ms cooldown. (2) Content was top-aligned with empty space below — panels now use `flex flex-col justify-center` to vertically center content.

---

## v0.55.18 — 2026-02-25

### Chore: `just dev` runs both backend and frontend

`just dev` now starts both the backend (port 8000) and frontend dev server (port 5173) in parallel. Ctrl+C stops both. The old backend-only command is available as `just dev-backend`.

---

## v0.55.17 — 2026-02-25

### Fix: Wizard swipe on macOS trackpad

Wheel handler now picks whichever axis has the larger delta (`deltaX` vs `deltaY`), so macOS trackpad horizontal two-finger swipe works alongside vertical mousewheel.

---

## v0.55.16 — 2026-02-25

### Fix: User preferences race condition and cascade delete

Fixed two user_preferences bugs: (1) Race condition where concurrent requests for the same user both tried to INSERT preferences, causing UniqueViolationError — now uses savepoint with IntegrityError retry. (2) Demo user cleanup setting user_id to NULL instead of cascading delete — added `cascade="all, delete-orphan"` to User relationships missing it (preferences, todoist_token, google_token, calendar_selections). Fixes #480, #481, #486, #487, #493, #494.

---

## v0.55.15 — 2026-02-25

### Fix: Analytics page colors and scroll

Fixed charts rendering as black instead of brand purple — all chart fills/strokes now use `--color-brand` (#6D5EF6). Fixed page not scrolling by replacing Radix ScrollArea with native overflow. Updated recurring rate colors to use brand purple for success states.

---

## v0.55.14 — 2026-02-25

### Fix: Restore wizard nav buttons alongside swipe

Restored Back/Next/Skip/Get Started buttons that were removed in v0.55.13. Buttons now coexist with horizontal scroll-snap — users can swipe or use buttons.

---

## v0.55.13 — 2026-02-25

### Feat: Swipeable setup wizard

Replaced button-based wizard navigation (Back/Next/Skip) with horizontal scroll-snap. Swipe on mobile, scroll on desktop. Progress dots track position. Action buttons (Connect Calendar, Connect Todoist, Open Tasks) remain.

---

## v0.55.12 — 2026-02-25

### Fix: Demo seed data — add unscheduled domain tasks

Moved 8 tasks from scheduled to unscheduled and added 3 new backlog tasks so demo users see content in domain areas, not just in the calendar.

---

## v0.55.11 — 2026-02-25

### Feat: Smart Quick Add V2

Redesigned Quick Add as an intelligent single-field input with inline metadata parsing. Type naturally and metadata is extracted automatically.

- **Syntax**: `#Domain` `!high` `?auto` `30m` `tomorrow` `// description`
- **Autocomplete**: Dropdown for `@` domains, `?` clarity, `!` impact
- **Metadata pills**: Colored dismissable pills below input showing parsed tokens
- **chrono-node date guard**: Rejects ambiguous bare month names ("Jan", "May") that could be person names — only accepts dates with a certain day, weekday, or hour
- **Sticky dismissals**: Pill dismissals persist while their trigger text remains in the input (Map-based tracking instead of clearing on every keystroke)
- **Double-submit guard**: `isPending` check on both Enter key and `handleSave` prevents duplicate task creation
- **Keep-open mode**: Checkbox to stay open for batch creation (persisted to localStorage)
- **Syntax hints**: Dismissable reference row below pills

New files: `task-parser.ts` (pure parsing logic), `smart-input-autocomplete.tsx` (dropdown component)
New dependency: `chrono-node` (natural language date parsing)

## v0.55.10 — 2026-02-25

### Fix: Vertically center subtask count badge
- Badge button was a block element — changed to `inline-flex items-center` so the flex parent's `items-center` can properly center it

## v0.55.9 — 2026-02-25

### Fix: Remove duplicate subtask count from clarity column
- Parent task rows had active/total count in both the title-area badge and the clarity column — removed the clarity column duplicate
- Subtask count badge now always shows `active/total` format (was only showing total when not hiding completed)
- Added `self-center` to the subtask count badge button for proper vertical centering

## v0.55.8 — 2026-02-25

### Fix: Center clarity/duration/impact pills in column cells
- Autopilot and Brainstorm clarity pills were left-aligned because `text-center` on the wrapper doesn't properly center `inline-flex` elements that overflow the fixed column width
- Switched all metadata column wrappers from `text-center` to `flex justify-center` for proper centering regardless of pill width

## v0.55.7 — 2026-02-25

### Fix: Align sticky domain label with actual domain names
- Added `pl-9` (36px) to sticky domain label to match the left offset of domain names in cards (content padding + card border + trigger padding + chevron + gap)

## v0.55.6 — 2026-02-25

### Fix: Task rows painting above sticky header
- Framer-motion `layout` prop on task rows creates promoted compositing layers (`will-change: transform`) that escaped the sticky header's backdrop-filter
- Added `isolate` on the task content container to trap compositing layers in their own stacking context
- Bumped sticky header to `z-20` so it paints above all task content

## v0.55.5 — 2026-02-25

### Fix: Sticky header glass effect + clarity column alignment
- Sticky sort header now has proper glass surface (`backdrop-blur-lg` 16px + 90% opacity) so domain headers don't show through
- Fixed clarity column alignment: `calc()` padding values had no spaces around `+` operator, generating invalid CSS that the browser ignored — switched to explicit pixel values (`pr-[9px] sm:pr-[17px]`)

## v0.55.4 — 2026-02-25

### Feat: Sticky domain label in column headers + alignment fix
- Domain name, emoji, and task count now fade into the sticky sort header as you scroll past each domain section (desktop, matching legacy behavior)
- Fixed column header alignment: Clarity/Duration/Impact labels now align precisely with task row metadata pills (was shifted ~15px left at large breakpoints)

## v0.55.3 — 2026-02-25

### Chore: Overhaul demo seed data
- Expanded domains from 4 to 5 (Work, Health & Fitness, Personal, Side Project, Learning)
- Doubled recurring tasks from 4 to 8 with realistic schedules (standup, gym, 1:1, sprint review, meal prep, water plants, coding sessions, reading)
- Dense calendar coverage: 8 tasks today, 6 tomorrow, decreasing density through day+5
- Added 3 overdue tasks, 6 archived tasks, 5 subtasks under 2 parent tasks, 6 thoughts
- Made seeding deterministic via `random.seed(user_id)` — same demo data on every reset
- Coherent persona: Alex Chen, senior PM at a tech startup

## v0.55.1 — 2026-02-24

### Chore: Task panel UX cleanup
- Moved sort controls (Clarity/Duration/Impact) from toolbar into a sticky column header row aligned with task metadata
- Removed gradient separator under task panel header (border-b is sufficient)
- Removed colored clarity dots from energy selector (duplicated toggle icons)
- Removed "+ Quick" button from toolbar (Thoughts page handles quick add)
- Increased section separator spacing for Scheduled/Completed/Deleted sections

## v0.55.0 — 2026-02-24

### Fix: Completed section disappears when retention filter matches zero tasks
- Changed early-return guard from `filtered.length === 0` to `tasks.length === 0` so the header and retention buttons stay visible even when the current filter window has no matches

## v0.54.99 — 2026-02-24

### Fix: Illustration SVGs not served in production
- Mounted `/illustrations` static directory from SPA dist so SVGs are served directly instead of falling through to SPA fallback (which returned HTML)
- Added `illustrations/`, `assets/`, `icons/` to SPA fallback exclusion list

## v0.54.98 — 2026-02-24

### Fix: Demo login 500 error + landing page readability + animation tweaks
- **Demo login crash**: Added `passive_deletes=True` to all User relationships — SQLAlchemy was trying to null-out FKs before DB CASCADE could fire during demo user cleanup
- **Landing task cards**: Changed from white to muted background with subtle shadow for contrast against hero illustration
- **Rocket animation**: Slowed from 0.6s to 1.2s with gentler float-up-and-settle curve
- **Thoughts glow**: Sped up from 5s to 3s cycle
- **Empty tasks entrance**: More noticeable — added translateY + larger scale change, 0.6s duration

## v0.54.97 — 2026-02-24

### Feat: Subtle animations for empty states and illustrations
- Empty tasks: fade-in + scale entrance animation (0.4s, one-shot)
- Empty thoughts: entrance + glacial brightness glow pulse (5s cycle)
- Onboarding rocket: slide-up entrance with ease-out overshoot (0.6s, one-shot)
- Onboarding logo float slowed from 3s to 5s for calmer feel
- All new animations respect `prefers-reduced-motion`

## v0.54.96 — 2026-02-24

### Fix: PWA update toast keeps reappearing after reload
- Switched service worker from `registerType: "prompt"` to `autoUpdate` — updates apply silently in background
- Removed `PwaReloadPrompt` component and persistent "New version available" toast

## v0.54.95 — 2026-02-24

### Feat: Task panel header cleanup and UX improvements
- Removed FilterBar (SCHEDULED/COMPLETED toggle buttons) and SettingsPanel (gear menu) — redundant with section-level controls
- Restructured task panel header to single row: Energy selector + Sort controls + action buttons
- Moved completed retention days (1d/3d/7d) to CompletedSection header — contextually discoverable
- Dashboard now fetches `status=all` so completed tasks persist across page refresh
- Created shared `dashboardTasksKey()` for consistent query invalidation across all task components
- DeletedSection: limited to 15 items by default with "Show all" link; reads `X-Total-Count` header
- Backend: added `limit`/`offset` query params and `X-Total-Count` header to `GET /api/v1/tasks`
- Extracted `_build_task_filters()` and added `count_tasks()` to TaskService
- Added per-parent "hide completed subtasks" toggle on the subtask count badge
- Removed "Hide recurring after done" setting (meaningless in current architecture)

---

## v0.54.94 — 2026-02-24

### Feat: Add illustrations to empty states and error boundaries
- Created reusable `EmptyState` component (`frontend/src/components/ui/empty-state.tsx`)
- Added illustrations to: empty task list, empty thoughts, analytics load failure, root and app error boundaries
- Copied 4 brand SVGs from legacy `static/img/illustrations/` to `frontend/public/illustrations/`

---

## v0.54.93 — 2026-02-24

### Fix: Demo cleanup uses index-friendly query and CASCADE deletes
- Cleanup query uses `startswith("demo-")` instead of `endswith("@whendoist.local")` — B-tree index compatible
- Cleanup relies on `ondelete=CASCADE` instead of manual 10-table deletes — future-proof when new tables are added
- Added missing `ExportSnapshot` delete to `_clear_user_data` (used by demo reset)

---

## v0.54.92 — 2026-02-24

### Feat: Multi-tenant demo users (unique per session)
- Each demo login creates a fresh user with unique email `demo-{profile}-{uuid}@whendoist.local` — no more shared state between concurrent sessions
- Added `cleanup_stale_users()` that lazily deletes demo users older than 24h (configurable via `DEMO_CLEANUP_MAX_AGE_HOURS`)
- Added `extract_profile()` to parse profile from both new and legacy email formats
- 21 tests covering creation, reset, cleanup, and isolation

---

## v0.54.91 — 2026-02-24

### Feat: Demo users always start with onboarding wizard
- Demo login now sets `wizard_completed=False` so the onboarding wizard shows on every demo session
- Returning demo users get wizard reset on login; demo reset also resets wizard state

---

## v0.54.90 — 2026-02-24

### Feat: Landing page redesign + demo login fix
- Ported legacy landing page design to React SPA: hero animation (task→calendar transfer), brand wordmark (Quicksand), value proposition, gradient CTA, trust/features meta block
- Added `demo_login_enabled` to build-info API so "Try Demo Account" button actually appears when enabled
- New `frontend/src/styles/login.css` with all animation keyframes, dark mode, and `prefers-reduced-motion` support

---

## v0.54.89 — 2026-02-24

### Fix: Child task editor opens on click
- Task editor's "close if deleted" guard only checked top-level tasks, causing it to immediately close when opening a child task
- Now also checks `subtasks` arrays so child tasks are recognized as existing

---

## v0.54.88 — 2026-02-24

### Feat: Allow editing completed tasks via metadata pills
- Removed `disabled={isCompleted}` from Impact, Clarity, and Duration pills for both tasks and subtasks
- Completed tasks now have interactive metadata pills — users can change values without reopening

---

## v0.54.87 — 2026-02-24

### Feat: Redesign onboarding wizard to match legacy design
- Ported polished legacy wizard design: Whendoist logo with float animation, branded SVGs (rocket, Google Calendar, Todoist), glassmorphic cards, purple gradient CTA buttons
- Welcome step: logo wordmark + personalized greeting + value proposition card
- Energy step: 3 horizontal selectable mode cards with live task preview (color-coded accent bars)
- Calendar step: branded connection card with Google icon, status indicator, privacy notice
- Todoist step: centered branded card with Todoist logo
- Domains step: 3-column suggestion chip grid with emoji picker for custom domains
- Completion step: rocket illustration + pulsing "Open Tasks" button
- Added `logoFloat` and `finalPulse` CSS keyframe animations with reduced-motion support
- Renamed FOCUS energy label to BRAINSTORM

---

## v0.54.86 — 2026-02-24

### Fix: Legacy frontend CSP inline script blocking
- Legacy Jinja2 templates use inline event handlers (`onclick`, `onchange`, etc.) incompatible with nonce-based CSP
- `render_template` now flags legacy pages via `request.state.legacy_template`
- CSP middleware uses `'unsafe-inline'` for legacy pages, nonce-based for React SPA

---

## v0.54.85 — 2026-02-24

### Fix: V4 audit findings (7 of 8)
- **Input validation**: Added field validators to `TaskContentData` and `DomainContentData` batch models (control char stripping + length limits)
- **Domain icon validation**: Added `@field_validator("icon")` to `DomainCreate` and `DomainUpdate` (50 char limit, control char stripping)
- **Retention days**: Changed `completed_retention_days` from `Field(ge=1, le=7)` to `Literal[1, 3, 7]`
- **Rate limit interval leak**: Store interval ID at module level, clear before creating new countdown
- **Backup completeness**: Added `encryption_unlock_method` to backup export/import
- **Undo error handling**: Added `onError` toast to toggle-complete and instance reschedule undo callbacks

---

## v0.54.84 — 2026-02-24

### Docs: Pre-1.0 cleanup
- Merged `docs/archive/` into `docs/plans/` (single location for all historical docs)
- Created `docs/scratchpad/` for HTML mockups (consolidated from archive + frontend/mockups)
- Compacted CHANGELOG from 1078 to ~490 lines (v0.54.x: 83 entries → 6 grouped sections)
- Removed root `openapi.json` from git (orval fetches from running server)
- Removed `e2e/` directory (no E2E tests per project philosophy)
- Fixed README: removed stale "Due" property, corrected tsc command, "Thought Cabinet" → "Thoughts"
- Updated POST-1.0-BACKLOG: removed completed items (nonce CSP, recurrence_rule validation)
- Renamed misnamed plan files to follow `yyyy-mm-dd-name.md` convention

---

## v0.54.79–v0.54.83 — 2026-02-24

### Production Hardening

- **Error boundary** with friendly "Something went wrong" page
- **Code splitting**: Route-based lazy loading + vendor chunk separation (1,546 KB → 350 KB initial)
- **PWA reload prompt**: User-controlled update instead of silent auto-update
- **Nonce-based CSP**: Replaced `'unsafe-inline'` in `script-src` with per-request nonces
- **Input validation**: Recurrence rule schema, domain color format, expanded subtask set cap
- **UX guards**: Double-tap completion guard, CSRF auto-retry, stale data prevention, editor auto-close
- **Encryption**: Decrypt all UI surfaces (dashboard, calendar, settings, thoughts, analytics), mask content in GCal sync
- **CI**: Fixed TypeScript check to use `tsconfig.app.json`

---

## v0.54.56–v0.54.78 — 2026-02-23

### Subtasks, Recurring, & Encryption

**Subtask features:**
- Quick add subtask: ghost row, hover '+' icon, context menu/action sheet entry
- Full subtask context menus, kebab dropdown, delete with undo
- Subtask drag-to-calendar scheduling with correct phantom card duration
- Instance cache invalidation on task edit/delete

**Recurring tasks overhaul (6 fixes):**
- Timezone-aware instance scheduling (user-local → UTC conversion)
- Recurring tasks visible in Scheduled section
- Completed/skipped instances stay on calendar
- Time-less instances in Anytime section (not at 9 AM)
- Stale instance cleanup on regeneration
- `status=all` for instances API

**Other features:**
- Searchable parent task picker with smart ordering (parents first, same-domain second)
- Apple Glass floating pill navigation with frosted glass effect
- Interactive attribute mini-pills for inline metadata editing
- Calendar DnD: cross-day drag + overlay grab offset stability
- Snapshot scalability: `data_version` change tracking (O(1) skip unchanged users)
- GCal card redesign: recessive left-accent style (removed 4 experimental styles)
- Unified 10-second toast duration via `TOAST_DURATION` constant

**Encryption hardening:**
- Toggle processes ALL tasks (subtasks, completed, archived)
- Backup export/import includes encryption metadata
- Decryption pending guard prevents ciphertext flash
- GCal sync masks encrypted content

**TypeScript CI fix:**
- `tsc -p tsconfig.app.json` (was checking zero files), replaced phantom types across 25 files

---

## v0.54.33–v0.54.55 — 2026-02-22/23

### DnD Reparenting & Calendar Polish

**Drag-and-drop reparenting:**
- Drag task onto task → make subtask; drag subtask to different parent → reparent; drag to gap → promote
- Ghost placeholder, gap zone hitboxes (8px → 28px), overlay fade on hover
- Badge text adapts: "Make subtask" / "Change parent" / "Drop to make standalone"
- All operations with undo toast and optimistic updates

**Subtask enhancements:**
- Subtask-aware sorting (parent ranks by best pending subtask value)
- Energy filter applies to subtasks (not just parents)
- Drag-drop reschedule in scheduled section (between date groups)

**Calendar:**
- Completed tasks/instances stay visible (opacity + strikethrough)
- Undo on all completion/skip toasts with instance dates
- Anytime section: vertical wrap, grid→flexbox, label alignment
- GCal event click fix (use `htmlLink` from API)
- Card style A/B test (4 approaches), settled on impact-colored tints
- Consistent 3px left borders, border clipping fixes

**Task creation:**
- Optimistic add-task (stable key from API response, no flicker)
- Undo on task creation toast

**Recurring:**
- Regenerate instances on start/end date change
- Sync `recurrence_start` when `scheduled_date` changes
- Recurring parent tasks hidden from calendar (instances only)

**Backend:**
- Savepoints for IntegrityError handlers (no silent transaction loss)
- Instance unskip endpoint

---

## v0.54.6–v0.54.32 — 2026-02-21/22

### Data Model Cleanup & iOS PWA

**Data model:**
- Removed `due_date`/`due_time` — `scheduled_date` is single source of truth
- DB migration drops columns, Todoist import simplified

**Recurring tasks:**
- Overdue based on pending instances (not recurrence start date)
- Instance-aware grouping in scheduled sections
- Skip/complete available for all recurring tasks (not just overdue)
- "Unschedule" hidden for recurring tasks
- Instance drag & unschedule in calendar view

**iOS PWA (6 patches):**
- Notch coverage: safe-area-inset-top inside header
- Mobile header slim-down (desktop tabs hidden)
- Bottom safe area: nav sits flush, `pb-nav-safe` precise
- Debug overlay for layout zone inspection

**Dark mode & brand:**
- Blue-slate OKLch chroma fix (was neutral gray)
- Primary button color fix
- Impact color rail (settled on 3px), row wash tints
- Active nav purple state, time indicator → blue
- Calendar panel border separation

**Calendar completion:**
- Completed/skipped tasks/instances stay visible
- Undo on completion toasts
- Thicker 3px left border rail
- Anytime context menu (Edit, Unschedule, Complete, Delete)

---

## v0.54.0–v0.54.5 — 2026-02-20

### Design Parity

Complete brand alignment of the React frontend:

- **Phase 1**: Brand warm canvas (#F8FAFC), purple focus rings, calendar events restyled to outlined cards with colored left rail
- **Phase 2**: CTA gradient buttons, glass blur headers, 3-tier shadow system
- **Phase 3**: Desktop spacing, completion animation, hour grid banding
- **Post-audit**: Button font-weight, purple-tinted hovers, subtask connector lines, 12px card radius, domain left accent, graduated day dimming
- Subtask layout: proper margin-based indentation, connector line positioning
- Recurring instance drag & unschedule in calendar

---

## v0.53.9 — 2026-02-20

- Docs cleanup: archived legacy frontend docs, compacted CHANGELOG

---

## v0.53.0–v0.53.8 — 2026-02-20

### Calendar Drag-and-Drop

- **Calendar context menus**: Right-click on scheduled tasks and recurring instances with full action set
- **Anytime drop zone**: Drag tasks to schedule date-only (no specific time)
- **Reschedule undo**: In-calendar rescheduling with toast + undo
- **Drag to date-group headers**: Reschedule overdue tasks onto "Today", "Tomorrow" headers
- **"Skip this one" context menu**: Right-click overdue recurring tasks to skip

### Fixed (8 patches)

- Calendar drop zones broken by dnd-kit Rect measurement in nested scroll containers — moved droppable outside scroll as overlay. See [docs/CALENDAR-DND.md](docs/CALENDAR-DND.md)
- Duplicate draggable IDs between task panel and calendar cards
- DragOverlay position drift and proportional sizing in scroll containers
- Phantom card position off by hours (double-counted scroll offset)
- DnD reschedule overwriting task duration to 30 minutes
- Parent tasks hidden by energy filter — now pass through based on subtask clarity
- Subtasks not draggable (missing `useDraggable`)

---

## v0.53.4–v0.53.5 — 2026-02-20

### Security & Hardening

- Rate limit key function fixed (per-user instead of always IP)
- ProxyHeadersMiddleware restricted to `127.0.0.1`
- Secret key fail-safe validator for production
- HSTS header added
- Undo mutation error handling (onError callbacks on all 7 undo paths)
- HTTP timeouts on all OAuth token exchanges and API clients
- Passphrase cleared from React state after encryption unlock
- N+1 queries fixed in batch-update endpoints
- Composite index `ix_task_user_parent(user_id, parent_id)`
- Console.error and error boundary logging gated behind `import.meta.env.DEV`

---

## v0.52.0–v0.52.3 — 2026-02-19/20

### Polish

- **Inbox → Thoughts** rename throughout all views, backend, and tests
- Thoughts hidden from Tasks page (belong exclusively on Thoughts page)
- Subtask metadata grid alignment with parent task columns
- Full header labels (Clarity/Duration/Impact) replacing abbreviations
- Stable event ordering on carousel swipe
- Event flicker eliminated with `placeholderData: keepPreviousData`

---

## v0.51.0–v0.51.9 — 2026-02-19

### Calendar Redesign

- **Extended day view**: Single 44-hour view (prev 9PM through next 5PM) with day separators
- **Anytime section**: Horizontal pill banner above time grid for date-only tasks
- **Continuous zoom**: Ctrl+wheel zooms smoothly, snaps to nearest step on save
- **5-panel carousel**: CSS scroll-snap with desktop pointer-drag swipe (4 iterations)
- Live scroll updates for header date and anytime tasks
- `scrollend` event replacing debounce for instant swipe response

---

## v0.50.0–v0.50.6 — 2026-02-19

### Legacy Visual Parity

Complete React frontend restyling to match legacy Jinja2 aesthetic:
- Top horizontal tab navigation, W icon logo, emoji energy selector
- Task items with 2px impact rail, grid-aligned columns, brand colors
- Domain groups as card-style containers
- Spectrum gradient bar, Nunito + Quicksand fonts
- Calendar floating controls, rounded task cards

### Fixed (6 patches)

- Task list scrolling (native `overflow-y-auto` replacing Radix ScrollArea)
- Calendar pinch-to-zoom threshold (10px from 50px for trackpad)
- Duplicate "Today" columns (UTC vs local time mismatch)
- Sort header alignment, page max-width, header breathing room

---

## v0.49.0–v0.49.9 — 2026-02-18/19

### Post-Migration Bug Audit & Features

Major bug-fix and feature sprint after React migration:

- **Legacy frontend toggle**: `SERVE_LEGACY_FRONTEND=true` for parallel deployment
- **Mobile gestures**: Swipe complete/schedule, pull-to-refresh, long-press action sheet
- **Calendar features**: Drag-to-reschedule, instance cards, swipe navigation, auto-scroll, phantom card, cross-day drag
- **Task interactions**: Context menus, kebab menus, inline add-task, date shortcuts
- **Undo toasts** on all operations with task names
- **Accessibility**: aria-live announcer, reduced motion support, 44px touch targets
- **Glass morphism**: Header, nav, energy selector with frosted glass effect
- **Demo pill widget**, pending past instances banner, network status monitoring

### Fixed (~40 patches)

- Sort/filter persistence, swipe cascade to subtasks, plan mode parallel scheduling, calendar time indicator, wizard domain deletion, encrypted text flash, CSRF token flow, subtask editing, domain group expand/collapse, and more

---

## v0.48.0–v0.48.12 — 2026-02-17/18

### React SPA Launch

- **v0.48.0**: Removed all legacy frontend (18 templates, 25 JS modules, 22 CSS files). Added keyboard shortcuts and motion animations.
- **Analytics page**: Interactive charts (completions, domain breakdown, heatmap, velocity)
- **Frontend CI**: TypeScript, Biome lint, production build in GitHub Actions
- **Railway deployment**: Resolved railpack Node.js detection (v0.48.3–v0.48.8)
- **Encryption hardening**: Fixed ciphertext flash, enable corruption race, child route rendering
- **CSRF flow**: Token endpoint + axios interceptor for SPA
- 27 hardcoded query keys → generated helpers, 11 endpoints got response models

---

## v0.47.0–v0.47.9 — 2026-02-17

### React SPA Migration

Built the entire React frontend from scratch:

- **v0.47.0**: Scaffold — Vite 6, React 19, TypeScript, TanStack Router/Query, Zustand, Tailwind v4, shadcn/ui, dnd-kit, orval
- **v0.47.1**: API codegen (82 types), encryption/passkey ports, Zustand stores
- **v0.47.2**: App shell, auth guard, login, theme provider, encryption unlock modal
- **v0.47.3**: Settings, Thoughts, Privacy/Terms pages, onboarding wizard
- **v0.47.4**: SPA serving, static assets, service worker, PWA meta tags
- **v0.47.5**: Dashboard task panel with domain grouping, subtrees, encryption
- **v0.47.6**: Task editor, quick add, recurrence picker, sort/filter/energy controls
- **v0.47.7**: Calendar panel — 3-day carousel, time grid, overlap detection, zoom
- **v0.47.8**: Drag-and-drop — task-to-calendar, calendar-to-list, reparenting
- **v0.47.9**: Mobile — swipe gestures, haptic feedback, long-press, gesture discovery

---

## v0.46.0–v0.46.7 — 2026-02-17

### Subtask System

- Depth-1 constraint, completion cascade, expand/collapse containers
- Create, reparent, promote subtasks from UI
- Todoist import flattens deep nesting to depth-1

---

## v0.45.67–v0.45.99 — 2026-02-15/17

### Drag-and-Drop & Calendar Overhaul

- **Custom drag overlay**: Fixed-position clone follows cursor, morphs to event pill over calendar
- **Phantom card**: Drop indicator with title, time, impact rail, 15-minute snap
- **Auto-scroll**: Vertical scroll near edges during drag
- **Cross-day drag**: Hover near edge for 500ms → navigate adjacent day
- **Adjacent-day sync**: Bidirectional mirroring of evening/morning tasks
- **Snapshots**: Automated daily backups with content-hash dedup (6 new endpoints)

### Fixed (30+ patches)

- Drag ghost offset (5 iterations), adjacent-day mirroring edge cases
- Calendar completion/reopen visual state, undo toast and scroll-to-task fixes

---

## v0.45.30–v0.45.66 — 2026-02-13/15

### PWA & Mobile Polish

- **PWA viewport fix**: 3 independent iOS triggers identified and fixed. See [docs/PWA-VIEWPORT-FIX.md](docs/PWA-VIEWPORT-FIX.md)
- **In-place mutations**: Surgical DOM updates replacing page reloads
- **Calendar**: Fixed header, scroll-to-now, glass backdrop, swipe navigation
- **Recurring tasks**: Auto-populate scheduled_date, undo instance reschedule
- **Privacy policy**: Standalone page for Google OAuth verification

---

## v0.45.0–v0.45.29 — 2026-02-12/13

### Thoughts Redesign & Misc

- **Chat-style Thoughts page**: Bottom-input layout, date separators, slide-up animations
- **Mobile polish**: Pull-to-refresh, parent task name wrapping, PWA safe areas
- **Sentry auto-fix workflow**: Auto-assigns issues to Copilot agent

---

## v0.44.0–v0.44.11 — 2026-02-11

### Mobile Redesign (Thoughts, Analytics, Settings)

Full-viewport scrolling, glass-morphism sticky headers, edge-to-edge layout, 44px touch targets. iMessage-style thought capture button. Toast improvements.

---

## v0.42.42–v0.43.3 — 2026-02-10/11

### Glass UI & Mobile UX Overhaul

- Floating glass energy selector, glass headers/domain headers/tab bar
- Nunito font, gesture discovery (swipe hint, edge hint, long-press tooltip)
- Swipe-left schedules (was delete), mobile filter bar, calendar fade gradient

---

## v0.42.7–v0.42.41 — 2026-02-09/10

### v1.0 Security Audit & Calendar Features

**Security (15 patches):**
- CSP hardening, rate limits, session fixation defense, backup size limit
- Input validation, offline mutation guards, HTMX CSRF injection
- domain_id IDOR fix, batch update rollback, /ready info leak fix

**Features:**
- Calendar zoom (+/- and Ctrl+scroll), card context menus
- Actions menu (kebab) on all tasks, universal departing animation

---

## v0.42.0–v0.42.6 — 2026-02-08/09

- Complete `safeFetch()` migration
- Keyboard shortcuts: j/k navigation, c/e/x task actions, help modal

---

## v0.40.0–v0.41.1 — 2026-02-08

### Production Hardening & Toast Rewrite

- Database pool tuning, statement timeout, graceful shutdown
- `safeFetch()` error recovery with typed error classes
- Toast system rewrite: queue, type variants, action buttons, deduplication

---

## v0.39.0–v0.39.8 — 2026-02-07/08

- **Rename clarity to Mode**: clear/defined/open → autopilot/normal/brainstorm
- **Impact labels**: Unified to High/Mid/Low/Min
- **Demo account overhaul**: Realistic PM persona with ~50 tasks

---

## v0.37.0–v0.38.0 — 2026-02-07

### Task List Refinements

- Meta column opacity, ghost checkbox, clarity text labels, domain task counts
- Plan My Day banner, calendar auto-advance after 8pm, past-tasks badge

---

## v0.34.0–v0.36.0 — 2026-02-06

### Header & Task List Redesign

- Two-row header layout with energy + view chips
- Flat scheduled/completed sections, brand-aligned spectrum gradient
- Collapsible sections, neutral subtask badges, impact labels

---

## v0.32.0–v0.33.1 — 2026-02-02/06

### Recurring Tasks & GCal Sync Hardening

- Skip instances, batch completion, recurrence bounds, drag reschedule
- Per-user sync lock, adaptive throttle, circuit breaker, calendar reuse

---

## v0.31.0–v0.31.9 — 2026-02-02

### Google Calendar Task Sync

One-way sync to dedicated "Whendoist" calendar with impact-based colors. Settings UI, OAuth scope upgrade, fire-and-forget background sync.

---

## v0.30.0–v0.30.1 — 2026-02-01

- Subtask hierarchy in Todoist import, parent breadcrumb, subtask count badges
- CI pipeline parallelization, Railway auto-deploy

---

## [0.24.0–0.29.0] — 2026-01 — Production Hardening

CSRF protection, health checks, observability (JSON logging, Prometheus, Sentry), PostgreSQL integration tests, API versioning (`/api/v1/*`), service extraction.

## [0.14.0–0.18.0] — 2026-01 — Performance & Testing

CTE-based analytics, SQL-level filtering, calendar caching, Alembic migrations, database indexes, rate limiting, CSP headers.

## [0.10.0] — 2026-01 — Mobile Adaptation

Service worker, bottom sheet, swipe gestures, long-press, pull-to-refresh, mobile tab layout.

## [0.9.0] — 2026-01 — Brand & Onboarding

WhenWizard 8-step flow, landing page animation, 70+ SVG icons, 21 illustrations, semantic CSS tokens, dark mode, accessibility.

## [0.8.0] — 2026-01 — E2E Encryption & Passkeys

AES-256-GCM with PBKDF2, WebAuthn/FIDO2 passkey unlock, global encryption toggle, Todoist import preview, Plan My Day undo.

## [0.7.0] — 2026-01 — Analytics & Backup

Analytics dashboard, backup/restore, completed task tracking, Todoist completed import.

## [0.6.0] — 2026-01 — Thought Cabinet

Quick capture page with promote-to-task, delete with undo.

## [0.5.0] — 2026-01 — UI Polish

Grid-based task layout, hour banding, border hierarchy refinements.

## [0.4.0] — 2026-01 — Native Task Management

Task dialog, recurrence picker, drag-to-trash, domain management, Todoist import.

## [0.3.0] — 2025-12 — Plan My Day

Click-and-drag time range selection, smart scheduling, PWA support.

## [0.2.0] — 2025-12 — Drag-and-Drop Scheduling

Drag tasks to calendar, 15-minute snapping, overlap detection, calendar carousel.

## [0.1.0] — 2025-12 — Initial Release

OAuth2 authentication, task display, energy-based filtering, calendar selection.
