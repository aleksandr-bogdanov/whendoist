# Changelog

Development history of Whendoist. Per-patch details in git history.

---

## v0.54.78 — 2026-02-23

### Fix: Mask encrypted task content in GCal sync
- When E2E encryption is enabled, GCal sync now uses "Encrypted task" as the event title and clears the description instead of pushing ciphertext to Google Calendar
- Event timing (create/update/delete, scheduled dates and times) continues to sync normally
- Applies to single task sync, instance sync, and bulk sync operations



## v0.54.77 — 2026-02-23

### Fix: Encryption toggle completeness and backup metadata
- Encryption enable/disable now processes ALL tasks (subtasks, completed, archived) via `/all-content` endpoint instead of only top-level pending tasks
- Backup export/import now includes encryption metadata (`encryption_enabled`, `encryption_salt`, `encryption_test_value`) so encrypted backups can be restored
- Improved error messages during encryption toggle to help users recover from partial failures


## v0.54.76 — 2026-02-23

### Fix: Encryption decryption pending guard and offline toast
- Fixed decryption pending guard using `decryptionComplete` boolean instead of checking array length — prevents ciphertext flash when decryption fails (wrong key)
- Changed misleading offline toast from "Changes will sync when you're back online" to honest message since no sync mechanism exists

## v0.54.75 — 2026-02-23

### Fix: TypeScript CI to actually type-check source files
- Changed `npx tsc --noEmit` to `npx tsc -p tsconfig.app.json --noEmit` — the bare command checked zero files due to `"files": []` in tsconfig.json
- Replaced phantom `AppRoutersTasksTaskResponse` type with orval-generated `TaskResponse` across 25 files
- Fixed `SubtaskResponse` literal missing `scheduled_time` in parent-task-picker
- Fixed `Record<string, unknown>` cast needing double-cast via `unknown` in attribute-pills
- Added `position` to backend `DomainContentData` so domain reorder actually works
- Fixed unused import in context-menu.tsx
- Fixed `decryptTask`/`decryptDomain` tuple destructuring in task-panel


## v0.54.74 — 2026-02-23

### Fix: Phantom card shows wrong duration for subtask drag-to-calendar
- Calendar now passes all subtasks (not just scheduled ones) to DayColumn lookup, so phantom card uses the real duration instead of defaulting to 30 minutes


## v0.54.73 — 2026-02-23

### Fix: Subtask drag-to-calendar scheduling not working
- Added `scheduled_time` to `SubtaskResponse` — field was missing, causing scheduled time to be lost on data refetch
- Fixed optimistic cache updates in DnD handler to update subtasks within parent's subtasks array (not just top-level tasks)
- Calendar and anytime sections now extract and display scheduled subtasks from parent tasks


## v0.54.72 — 2026-02-23

### Fix: Invalidate instances cache on task edit and delete
- Task editor now invalidates instance query cache after save — fixes stale instance IDs causing "failed to complete/skip" errors when recurrence or time changes
- Task delete now invalidates instance query cache — fixes ghost instances lingering on calendar after parent task is deleted


## v0.54.71 — 2026-02-23

### Fix: Subtask delete not working
- Backend: `_task_to_response` now filters out archived subtasks (`status != "archived"`) — previously archived subtasks were still returned in the parent's subtask array
- Frontend: Optimistic cache update removes the subtask from the parent's array immediately, with rollback on error


## v0.54.70 — 2026-02-23

### Fix: SubtaskItem context menu, kebab menu, and delete action
- Subtasks now have full right-click context menu (Edit, Complete/Reopen, Delete) — was completely missing
- Added kebab (⋮) dropdown menu on hover for desktop, matching parent task pattern
- Delete action with undo toast for subtasks


## v0.54.69 — 2026-02-23

### Fix: Ghost row persistence + style consolidation
- Non-parent tasks no longer stay permanently expanded after dismissing the add-subtask input — collapse on cancel when no real subtasks exist
- Ghost row "Add subtask" now matches domain-level "Add task" style (text-xs, same icon size, same colors, underline input)


## v0.54.68 — 2026-02-23

### Feat: Quick add subtask
- Ghost row at the bottom of expanded subtask trees — click to add a subtask inline with rapid sequential adds
- Hover '+' icon on task rows (desktop) — more subtle for non-parent tasks, auto-expands and focuses the input
- "Add subtask" in right-click context menu, kebab dropdown menu, and mobile long-press action sheet
- Works for any non-recurring, non-completed, top-level task


## v0.54.67 — 2026-02-23

### Fix: Recurring tasks overhaul — 6 bug fixes
- **Timezone bug**: Instance scheduled_datetime now correctly converts user-local time to UTC (e.g., 9 AM ET → 2 PM UTC) instead of treating local time as UTC
- **Invisible in task panel**: Recurring tasks now appear in the Scheduled section instead of being filtered out entirely
- **Completed instances vanish**: Calendar fetches all instance statuses so completed instances stay visible with opacity styling
- **Time-less at 9 AM**: Instances without a scheduled time no longer appear at 9 AM on the calendar; they show in the Anytime section instead
- **Stale instances survive**: Regeneration now deletes ALL pending instances (including past) and recreates from today onward
- **All status endpoint**: Instances API now accepts `status=all` to return all statuses (matches tasks endpoint pattern)
- New `AnytimeInstancePill` component for time-less recurring instances in the calendar's Anytime section


## v0.54.66 — 2026-02-23

### Fix: Drag-drop in scheduled section reschedules instead of reparenting
- Dragging a task from Overdue to Today (or between any date groups) now correctly reschedules the task instead of creating a subtask
- Extended the date-group droppable zone to cover the entire group (header + tasks), not just the header
- Collision detection already prioritizes date-group over task-drop, so this ensures rescheduling wins


## v0.54.65 — 2026-02-23

### Fix: Centered FAB + content scrolls behind glass nav
- FAB (+) button now sits centered inside the pill (YouTube-style, no protrusion)
- Content scrolls behind the glass nav pill — visible through the frosted blur
- Bottom padding moved from `<main>` to individual scroll containers
- Reduced gradient fade on mobile to let glass effect dominate

## v0.54.64 — 2026-02-23

### Fix: Parent picker scroll, ordering, and Thoughts filter
- Fixed scroll not working inside picker (Sheet's scroll lock blocked portaled Popover — replaced with inline dropdown)
- Reordered: parents same-domain → parents other → same-domain → other
- Excluded Thoughts (no-domain tasks) from parent candidates

## v0.54.63 — 2026-02-23

### Fix: Enhanced Apple Glass effect on header and nav pill
- Apply Apple's native `saturate(180%) blur(40px)` formula to both header and floating nav pill
- Lower background opacity with white/dark surface tint for more translucent glass
- Replace border with subtle inset ring highlight (hairline edge like native iOS)
- Consistent glass treatment across header and bottom navigation

## v0.54.62 — 2026-02-23

### Fix: Parent picker smart ordering + subtask count badges
- Tasks with existing subtasks ranked first ("Parents" group)
- Same-domain tasks ranked second for contextual relevance
- Subtask count badge (·N) shown next to parent tasks
- Section labels shown when multiple groups exist (hidden during search)

## v0.54.61 — 2026-02-23

### Feat: Searchable parent task picker with instant apply + undo
- Replaced dumb `<Select>` dropdown with searchable Popover-based picker (type to filter)
- Shows domain icons alongside task names for context
- Changes apply immediately via API (no form save required), matching DnD reparenting behavior
- Toast shows detailed message ("Made X a subtask of Y") with Undo button
- Selecting "None (top-level)" promotes subtask with undo — replaces standalone Promote button
- Edit-mode only; subtask creation on new tasks is via DnD

## v0.54.60 — 2026-02-23

### Feat: Apple Glass floating pill bottom navigation
- MobileNav converted from full-width fixed bar to floating pill with rounded corners
- Frosted glass effect: `backdrop-blur-xl` + semi-transparent background + shadow
- Pill floats above iOS safe area / home indicator — no more touch conflicts
- `pb-nav-safe` now accounts for safe area inset + pill offset
- Demo pill and gesture discovery hints repositioned above the floating nav

## v0.54.59 — 2026-02-23

### Fix: Calendar DnD — drag across days + overlay stability
- Drag-to-adjacent-day: dragging a task to the left/right edge smoothly slides the carousel to the previous/next day
- Overlay no longer jumps during day navigation — `activeNodeRect.left/top` frozen at drag start
- Carousel ignores programmatic scroll events (Arc full-page screenshot compatibility)
- Drag overlay pill preserves proportional grab position with live pointer tracking
- Handles both PointerEvent and TouchEvent activator events

## v0.54.58 — 2026-02-23

### Fix: Calendar DnD overlay grab offset
- Drag overlay pill now preserves proportional grab position (grab middle → cursor at pill middle)
- Measures the actual compact pill element via `firstElementChild` instead of the dnd-kit wrapper
- Uses live pointer position for scroll-drift immunity
- Handles both PointerEvent and TouchEvent activator events

## v0.54.57 — 2026-02-23

### Attribute pills: legacy pill shape + toast with undo
- Pill triggers use legacy shape (`rounded-full`, `h-5`, `px-2`, transparent border → visible on hover)
- Each attribute change shows a success toast with Undo action that reverts optimistically

## v0.54.56 — 2026-02-23

### Interactive attribute mini-pills
- Task metadata (impact, clarity, duration) now renders as interactive pills on desktop
- Hover reveals clickable affordance; click opens compact segmented-control popover for inline editing
- Optimistic mutations update immediately, with rollback on error
- Completed tasks render static pills (no popover) to prevent accidental edits
- Works on both parent leaf tasks and subtasks
- Extracted shared constants (`IMPACT_OPTIONS`, `CLARITY_OPTIONS`, `DURATION_PRESETS`) to `task-utils.ts`

## v0.54.55 — 2026-02-23

### Savepoints for IntegrityError handlers + snapshot review comments
- Replace full `db.rollback()` with `begin_nested()` savepoints in `RecurrenceService.materialize_instances()` and `get_or_create_instance_for_date()` — prevents silent loss of prior work in the caller's transaction on concurrent instance creation
- Add docstring notes on `PreferencesService.setup_encryption()` and `disable_encryption()` explaining why no `bump_data_version` is needed (encryption metadata and passkeys aren't in snapshot exports)

## v0.54.54 — 2026-02-23

### Snapshot scalability — `data_version` change tracking
- Added `data_version` counter to User model, bumped only on user-initiated mutations (task/domain/preference CRUD, imports)
- Snapshot loop now skips unchanged users via O(1) integer comparison instead of full data export + SHA-256 hash
- Recurring task auto-materialization no longer triggers new snapshots for inactive users
- Replaced N+1 per-user queries with single batch query to find due users
- Content-hash dedup kept as safety net for edge cases
- 11 new tests covering version bumping and materialization exclusion

## v0.54.53 — 2026-02-23

### GCal card redesign — recessive left-accent style
- GCal events now use a thin 3px left-accent border (matching task card border width) with 1% calColor tint background
- Removed card style selector and 4 experimental styles (outline, neutral, dashed, ghost) — hardcoded left-accent
- Fixed pixel-eating bug: added z-[1] to cards container so hour grid backgrounds don't clip left borders on date scroll
- Instance (recurring) card titles now use impact color instead of black, matching regular task cards
- Balanced icon sizes: recurrent icon 10px→12px, task checkbox 12px→10px

---

## v0.54.52 — 2026-02-23

### Unified toast duration
- All toasts now use a single 10-second duration via `TOAST_DURATION` constant in `frontend/src/lib/toast.ts`
- Removed 40+ hardcoded `duration` values across 14 files
- Global default set on the `<Toaster>` component — individual toast calls no longer specify duration
- Added rule #10 to CLAUDE.md to enforce this going forward

---

## v0.54.51 — 2026-02-22

### DnD: overlay visibility + gap zone hitboxes
- Drag overlay fades to 40% opacity and scales down when hovering over a reparent target, so the target row and ghost placeholder are clearly visible
- TaskInsertionZone hitbox increased from 8px to 28px — gap drop zones between tasks are much easier to target when promoting subtasks

---

## v0.54.50 — 2026-02-22

### Fix 1px white line clipping card left borders
- Remove `z-10` from time ruler — it was painting its white `bg-background` on top of the first pixel of calendar cards at the ruler/carousel boundary
- Revert GCal outline to uniform `2px` border (non-uniform 3px/1.5px looked off)

---

## v0.54.49 — 2026-02-22

### Reparent visual: ghost placeholder instead of misleading indent
- Removed `translate-x-4` indent on reparent target (was implying the target becomes the child)
- Target now gets subtle purple glow only — stays in place
- Ghost placeholder with dashed border opens below target showing where the dragged task will land
- Badge grammar fix: "Make a subtask" (with article)

---

## v0.54.48 — 2026-02-22

### Consistent 3px left borders + GCal event text contrast
- InstanceCard: `border-l-2` (2px) → inline `3px solid` to match ScheduledTaskCard
- GCal outline: 3px left accent + 1.5px border on other sides (was uniform 2px)
- GCal event title: `text-foreground` instead of `text-muted-foreground` across all styles

---

## v0.54.47 — 2026-02-22

### Fix calendar card left border clipping + refine outline GCal style
- Remove `pl-0.5` left padding from items container so card left borders sit flush against column edge
- Outline GCal style: white (`bg-card`) background instead of transparent, thicker `2px` colored border

---

## v0.54.46 — 2026-02-22

### Stronger task tints + GCal event style picker (4 approaches)
- Tasks always get impact-colored backgrounds: regular ~10%, recurring ~16% (stronger than before)
- Anytime pills also tinted with impact color
- GCal events now have 4 toggleable visual treatments (floating palette button):
  - **Outline**: Transparent bg, thin calendar-color border on all sides
  - **Full Border**: Subtle tint, thin border on all sides, no left accent
  - **Dashed**: Minimal tint, dashed left accent border
  - **Strip**: Top color stripe, compact appearance, small radius

---

## v0.54.45 — 2026-02-22

### Fix subtask DnD: no-op on same parent, gap drop zones, label tweak
- Dragging subtask to same parent is now truly a no-op (no longer accidentally promotes)
- Drop zones between tasks in each domain group wired into collision detection for promote
- Badge text says "Change parent task" when reparenting an existing subtask

---

## v0.54.44 — 2026-02-22

### DnD UX: drop-between-tasks promote, badge text, softer visual
- Drag subtask BETWEEN tasks to promote to standalone (insertion zones with purple line indicator)
- Badge text: "Change parent" when reparenting subtask, "Make subtask" when nesting standalone
- Softer reparent target visual: subtle indent + wash instead of harsh ring+glow

---

## v0.54.43 — 2026-02-22

### Fix missing Undo in calendar instance toasts
- Complete and Skip actions on recurring instances in the calendar view now show Undo in the toast
- Toast text updated to `Completed "Task" · Feb 22` / `Skipped "Task" · Feb 22` format (consistent with task list)

---

## v0.54.42 — 2026-02-22

### Fix three drag-and-drop subtask bugs
- Dragging a subtask onto its own parent no longer duplicates it (findTask now includes parent_id)
- Badge says "Move here" instead of "Make subtask" when dragging an existing subtask to another parent
- New "Drop to make standalone" bar appears when dragging a subtask, providing a clear promote target

---

## v0.54.41 — 2026-02-22

### Fix recurring task duplicates on calendar and task list
- Recurring parent tasks no longer appear on the calendar or in Scheduled/Pending sections — only their instances do
- Root cause: frontend included recurring parents alongside instances, causing duplicates whenever `scheduled_date` was set on the parent

---

## v0.54.40 — 2026-02-22

### Energy filter applies to subtasks
- Subtasks are now filtered by energy level, not just parents
- Zombie mode shows only autopilot subtasks; Normal hides brainstorm subtasks
- Parent with 3 subtasks (autopilot/normal/brainstorm) shows 1, 2, or 3 depending on energy level

---

## v0.54.39 — 2026-02-22

### Show instance date in Complete/Skip toast
- "Completed" and "Skipped" toasts now include the instance date (e.g. "Completed 'Task' · Feb 16")
- Applies to checkbox, context menu, dropdown, and mobile action sheet

---

## v0.54.38 — 2026-02-22

### Fix add-task flicker
- Drop optimistic placeholder approach — append real task from API response to cache instead
- Stable key from the start (real ID), so AnimatePresence never re-animates

---

## v0.54.37 — 2026-02-22

### Calendar card style toggle — A/B test 3 approaches
- Add toggleable card style approaches to visually distinguish regular tasks, recurring instances, and Google Calendar events
- **Default**: Current look (white cards + left border accent)
- **Colored**: Regular tasks get impact-colored tint backgrounds; Google Calendar events stay white/muted
- **All Colored**: All card types get colored backgrounds at different opacity levels
- **Bordered**: Google Calendar events use dashed left borders + muted text
- Floating palette toggle button next to zoom controls to cycle between styles
- Setting persists in localStorage

---

## v0.54.36 — 2026-02-22

### Fix add-task optimistic flicker
- Swap optimistic placeholder (negative ID) with real task response before cache refetch, so AnimatePresence sees a stable key and doesn't re-animate

---

## v0.54.35 — 2026-02-22

### Recurring tasks — Sync recurrence_start when scheduled_date changes
- Changing a recurring task's `scheduled_date` now auto-updates `recurrence_start` to match, triggering instance regeneration
- Previously only changing `recurrence_start` directly would regenerate instances; changing `scheduled_date` alone had no effect

---

## v0.54.34 — 2026-02-22

### Subtask-aware sorting
- Sort controls (clarity, duration, impact) now propagate into subtasks
- Subtasks reorder within their parent by the active sort field (pending first, completed last)
- Parent tasks rank by their best pending subtask's value — a parent with a P1 subtask outranks one with only P3/P4 subtasks
- Standalone tasks (no subtasks) behave unchanged

---

## v0.54.33 — 2026-02-22

### Drag-and-drop subtask reparenting
- Drag a task onto another task to make it a subtask (distinct purple glow + "Make subtask" badge)
- Drag a subtask onto a different parent task to reparent it
- Drag a subtask to the task list empty area to promote it to a standalone task
- Drag overlay shows arrow icon when hovering over a valid reparent target
- All operations support undo via toast
- Proper optimistic updates: tasks move instantly between parent/child lists
- Auto-expands parent's subtask list after nesting
- Invalid targets (recurring, subtasks, tasks with children) are automatically disabled

---

## v0.54.32 — 2026-02-22

### Add undo toast for "Complete this one" and "Skip this one" on recurring instances
- New `POST /api/v1/instances/{id}/unskip` backend endpoint (reverts skip → pending)
- "Complete this one" toast now has Undo button (calls uncomplete instance)
- "Skip this one" toast now has Undo button (calls unskip instance)
- Applies to both desktop context menu / dropdown and mobile action sheet

---

## v0.54.31 — 2026-02-22

### Fix inline add-task visibility + add undo toast
- Add optimistic update when creating a task via "+Add task" — task appears instantly in the list instead of waiting for refetch
- Add undo action to task creation toast (both inline add and Quick Add dialog) — clicking "Undo" deletes the newly created task
- Clear input immediately on submit for faster UX

---

## v0.54.30 — 2026-02-22

### Recurring tasks — Regenerate instances when start/end dates change
- Editing a recurring task's `recurrence_start` or `recurrence_end` now triggers instance regeneration
- Previously only `recurrence_rule` and `scheduled_time` changes triggered regeneration, so changing the start date left stale instances in place

---

## v0.54.29 — 2026-02-22

### Calendar — Fix anytime pills wrapping under label
- Switch from CSS grid to flexbox with `min-w-0` on the pills container
- The `min-w-0` override (instead of default `min-width: auto`) allows the flex item to shrink below its content width, enabling proper `flex-wrap` behavior within the constrained space

---

## v0.54.28 — 2026-02-22

### Calendar — Anytime pills stay right of label on wrap
- Use CSS grid (`grid-template-columns: auto 1fr`) to pin ANYTIME label to the left and constrain all pill rows to the right column

---

## v0.54.27 — 2026-02-22

### Calendar — Anytime section wraps tasks vertically
- Removed fixed `h-[34px]` height and horizontal scroll from the ANYTIME section
- Tasks now wrap to new lines instead of scrolling horizontally when there are many
- Calendar body adapts via `flex-1 min-h-0` — no layout shift, no scroll jump

---

## v0.54.26 — 2026-02-22

### Calendar — Fix Google Calendar event click (400 error)
- **Root cause**: click handler used `btoa(eventId)` to construct the Google Calendar URL, but the `eid` parameter requires `base64(eventId + " " + calendarEmail)` — wrong format → 400
- **Fix**: pass Google's own `htmlLink` field through the API (`GoogleEvent.html_link`, `EventResponse.html_link`) and use it directly; events without a link are non-clickable

---

## v0.54.25 — 2026-02-22

### Calendar — Tasks stay visible after completion (proper fix)
- **Root cause**: backend `GET /api/v1/tasks` defaulted to `status=pending`, so `invalidateQueries` after completion wiped completed tasks from the cache
- **Backend**: added `status=all` which returns pending + completed (excludes archived)
- **CalendarPanel**: now fetches its own `status=all` query internally so completed/skipped tasks always remain visible regardless of the task-list query

## v0.54.24 — 2026-02-22

### Calendar — Completed scheduled tasks stay visible; undo on completion toast
- Completed scheduled task cards remain on the calendar with `opacity-50` + strikethrough
- Undo action added to the completion toast for both scheduled task cards and anytime task pills

## v0.54.23 — 2026-02-22

### Calendar — Keep completed/skipped instances visible
- Completed and skipped recurring instances remain visible in the calendar instead of disappearing
- Visual treatment: `opacity-50` + strikethrough on both completed and skipped instance cards
- Anytime task pills: completed tasks stay in the day header with strikethrough + opacity; context menu shows "Reopen" instead of "Complete"

## v0.54.22 — 2026-02-22

### Calendar — Thicker task card rail
- Increased left border on scheduled task cards from 2px to 3px to match Google Calendar event rail thickness

## v0.54.21 — 2026-02-22

### iOS PWA — Remove safe-area-bottom from nav (no blank zone below icons)
- **Root cause fixed**: Removed `safe-area-bottom` class from `MobileNav` — it was adding 34px of empty padding below the nav icons (the home indicator zone), visible as a wasted blank strip below the nav
- **Updated `pb-nav-safe`**: Now `calc(3.5rem + 1px)` — reserves exactly nav height (h-14) plus the 1px border-t; no `env(safe-area-inset-bottom)` since the nav no longer reserves that space
- **Matches legacy behavior**: Legacy app has no safe-area-bottom on its nav; icons sit flush at the bottom edge

## v0.54.20 — 2026-02-22

### PWA Layout Debug Overlay
- **New debug tool**: acid-color bands for every layout zone (notch spacer, header row, main content, pb-nav-safe padding, nav bar) plus pixel measurements panel
- **Activation**: long-press the W logo for 3 seconds (works in PWA with no address bar); press OFF to deactivate; persists in sessionStorage
- **Gap detector**: highlights unaccounted gap between layout zones

## v0.54.19 — 2026-02-22

### iOS PWA — Header side padding & settings blank space
- **Header breathing room**: increased mobile side padding from `px-4` to `px-5` so logo and action buttons have space from the screen edges
- **Settings bottom blank space**: removed redundant `pb-24` from settings page content — nav clearance is already handled by `pb-nav-safe` on `main`, so `pb-24` was adding 96px of empty scroll area below the last settings item

## v0.54.18 — 2026-02-21

### iOS PWA — Header notch fix & mobile header redesign
- **Notch coverage**: Moved `pt-safe` (env safe-area-inset-top) inside the `<header>` element so the header background fills the notch/Dynamic Island area — no more blank gap before the header
- **Mobile header slim-down**: Hid desktop nav tabs on mobile (hidden md:flex) — on mobile, navigation is handled by the bottom nav. Header now shows only the W logo + theme + logout
- **Compact mobile padding**: Reduced header padding to `px-4` on mobile (was px-6/sm:px-12), and changed content row from `h-20` to `h-14` on mobile (`md:h-20` on desktop)

## v0.54.17 — 2026-02-21

### iOS PWA — Notch & Bottom Safe Area Fix
- **Top notch**: Added `padding-top: env(safe-area-inset-top)` to the app shell — content no longer hides behind the iPhone notch/Dynamic Island in standalone mode
- **Bottom safe area**: Updated main content bottom padding from fixed `64px` to `calc(3.5rem + env(safe-area-inset-bottom))` so content isn't clipped behind the home indicator area, resolving the extra blank space visible under the bottom nav

## v0.54.16 — 2026-02-21

### Dark Mode — Fix Primary Button Color
- **New Task button**: Dark mode `--primary` was near-white (`oklch(0.92...)`) making the button blend with the light theme. Now uses brand dark-mode purple `#8B7CF7` (`oklch(0.66 0.185 277)`) with white foreground text.

## v0.54.15 — 2026-02-21

### Dark Mode Polish — Fix Blue-Slate Chroma
- **Fix dark mode chroma**: Previous fix lifted lightness but kept near-zero chroma (≈ neutral gray). Now uses proper blue-slate OKLch values matching brand hex: `--background` = slate-800 (`#1E293B`, `oklch(0.278 0.047 255)`), `--card` = slate-700 (`#334155`, `oklch(0.388 0.036 256)`), `--muted/accent/secondary` = slate-600 (`#475569`, `oklch(0.458 0.040 264)`)
- **Clarity badge tints in dark mode**: Badges use semi-transparent alpha tints in dark mode, no harsh bright patches
- **Impact color rail**: 4px → 3px

## v0.54.14 — 2026-02-21
- **Impact color rail**: 4px → 3px (better visual proportion)

## v0.54.13 — 2026-02-21

### Brand Rail Tweak
- **Impact color rail**: 4px → 3px (better visual proportion)

## v0.54.12 — 2026-02-21

### Brand Audit — UI Polish
- **Impact color rail**: Left-edge task row bar widened 2px → 4px (matches brand spec) on both tasks and subtasks
- **Impact row wash**: Task rows now have a subtle per-impact-level background tint (P1 red, P2 amber, P3 green, P4 gray) at brand-spec opacity
- **Nav active state**: Active tab now uses purple text (#5B4CF0) + purple tint background instead of generic `bg-muted`, with tint-based hover on inactive tabs
- **Current time indicator**: Calendar time-now line/dot changed from purple (#6D5EF6) to blue (#167BFF) — blue = time/executable per brand semantics
- **Calendar panel separation**: Left edge of calendar panel now uses a border (`border-border/40`) instead of relying on layout gap — shadows reserved for overlays only per brand rules

## v0.54.11 — 2026-02-21

### Recurring Task Actions in Scheduled Section & Mobile
- **Checkbox completes correct instance**: Recurring task checkbox now completes the actual overdue/pending instance instead of defaulting to today's date
- **Instance-aware grouping**: Recurring tasks appear under their pending instance date, not recurrence start date
- **Skip/complete for all recurring tasks**: "Skip this one" and "Complete this one" available for overdue, today, and upcoming recurring tasks (not just overdue)
- **Hide unschedule for recurring tasks**: "Unschedule" option hidden for recurring tasks since it would modify the entire series
- **Mobile action sheet fix**: Skip and complete actions on mobile now target the correct pending instance instead of only searching today's date

## v0.54.10 — 2026-02-21

### Calendar DnD & Instance Fixes
- **Fix DnD auto-scroll zone bias**: Auto-scroll now uses real pointer position (via `pointermove`/`touchmove` listeners) instead of dnd-kit delta which drifts, and runs in a RAF loop so scrolling continues when the pointer is held still
- **Completed instances stay on calendar**: Completed recurring instances now remain visible with a strikethrough title instead of being dimmed to 50% opacity

## v0.54.9 — 2026-02-21

### Thoughts Page Scrollable
- **Fix thoughts page scroll**: Added `min-h-0` to the thoughts page container so the ScrollArea can properly constrain its height and enable scrolling when content overflows

## v0.54.8 — 2026-02-21

### Recurring Tasks: Overdue Based on Instances
- **Recurring tasks leave overdue when caught up**: Skipping/completing all past instances now removes the task from the overdue section — `scheduled_date` (recurrence start) no longer pins recurring tasks as permanently overdue
- **Overdue badge shows instance date**: For recurring tasks, the overdue badge now shows the pending instance date (e.g., "2d overdue") instead of the static recurrence start date

## v0.54.7 — 2026-02-21

### Recurring Task Overdue Fixes
- **"Skip this one" now appears for overdue recurring tasks**: The instance query was too narrow (only fetched past instances); now fetches 30 days ahead to always find the next pending instance
- **Unschedule works for recurring tasks**: Backend was auto-populating `scheduled_date` back to `recurrence_start` even when explicitly cleared — now respects explicit `null`

## v0.54.6 — 2026-02-21

### Remove due_date, Fix Overdue & Calendar Bugs
- **Remove due_date/due_time**: Eliminated unused `due_date` and `due_time` fields from the data model, API, and UI — `scheduled_date` is the single source of truth for task timing
- **Consistent overdue display**: Task overdue badges now use `scheduled_date` (same as the section header), fixing the confusing mismatch where blocks showed "4d overdue" but tasks inside showed "9d overdue"
- **Skip updates overdue count**: Skipping a recurring instance now correctly invalidates the overdue count cache, so the count refreshes immediately
- **Calendar anytime context menu**: Anytime task pills in the calendar now have a right-click menu with Edit, Unschedule, Complete, and Delete actions
- **Todoist import simplified**: Todoist `due.date` now maps directly to `scheduled_date` instead of populating a redundant `due_date`
- **DB migration**: Drops `due_date` and `due_time` columns from the tasks table

## v0.54.5 — 2026-02-20

### Recurring Instance Drag & Unschedule
- **Draggable instances**: Recurring task instances in the calendar view are now draggable — drag to a time slot to reschedule, drag to the anytime section to unschedule
- **Unschedule context menu**: Right-click menu on scheduled instances now includes "Unschedule" (clears time, moves to anytime on the instance's natural day)
- **Series time change fix**: Editing a recurring task's scheduled time now regenerates all pending instances (previously only recurrence rule changes triggered regeneration)

## v0.54.4 — 2026-02-20

### Subtask Layout Fixes
- **Subtask card indentation**: Subtask cards now shift right via `marginLeft` instead of extra `paddingLeft`, so the left border sits close to the checkbox (same gap as regular tasks)
- **Vertical connector line**: Repositioned directly under the parent task's checkbox center instead of overlapping with subtask cards

## v0.54.3 — 2026-02-20

### Design Parity Iteration 2 — Post-Audit Refinements
- **Button font-weight**: All buttons now use `font-semibold` (600) matching brand spec
- **Primary button gradient sheen**: Dark primary buttons get a subtle top-to-bottom white gradient for depth
- **Sort headers uppercase**: Column sort labels (Clarity, Duration, Impact) now uppercase to match all other app labels
- **Purple-tinted hovers**: Replaced all remaining zinc `hover:bg-accent` with brand purple-tinted hovers across task rows, section toggles, calendar zoom controls, and anytime pills
- **Task row inner glow**: Hover state adds a subtle purple inset shadow for a premium feel (matches legacy)
- **Calendar event cleanup**: Removed body tint on events — clean white cards with color from left rail only; compact mode hides time range for short events (<32px)
- **W icon medium size**: Header W icon bumped from 17×15 to 24×21 (brand spec "medium") for more visual presence
- **Consistent 12px card radius**: Domain groups and calendar panel now both use `rounded-[12px]` matching brand spec `--radius-lg`
- **Domain group left accent**: Subtle 2px purple left border on domain group cards reinforcing brand's "left rail" pattern
- **Desktop task list padding**: Added horizontal padding (`sm:px-2 lg:px-4`) on the task scroll area for breathing room
- **Subtask connector line**: Vertical connector line bridges parent to children when subtasks are expanded
- **Calendar day graduated dimming**: Previous evening (opacity 0.7) and next morning (opacity 0.85) for graduated depth — today pops more
- **Strikethrough animation keyframe**: Added `strikethrough-reveal` CSS animation for future use

---

## v0.54.2 — 2026-02-20

### Design Parity Phase 3 — Polish
- **Desktop spacing**: Increased padding on task list container and panel headers for better breathing room on desktop (`sm:p-4`)
- **Calendar panel card treatment**: Calendar panel now renders as a card on desktop with rounded corners, border, and brand shadow system
- **Panel header backgrounds**: Task panel header and calendar header use subtle `bg-muted/30` tint for visual depth
- **Completion animation**: Checkbox pulses with a scale animation when marking tasks complete
- **Hour grid banding**: Alternating subtle background tint on even hours in the calendar day view for improved readability
- **Task row padding**: Slightly more vertical padding on desktop (`sm:py-2`) for readability

---

## v0.54.1 — 2026-02-20

### Design Parity Phase 2 — CTA & Depth
- **Plan My Day button**: Gradient CTA treatment with purple glow shadow (`linear-gradient(135deg, #6D5EF6, #8B7CF7, #A78BFA)`)
- **Glass blur headers**: Main header and task panel header now use `backdrop-blur-md` for premium glass feel
- **Shadow system**: Added brand 3-tier shadow system (`--shadow-card`, `--shadow-raised`, `--shadow-cta`) with dark mode variants, applied to domain group cards and floating controls
- **Calendar card radius**: Scheduled task cards reduced from 10px to 6px for professional look

---

## v0.54.0 — 2026-02-20

### Design Parity Phase 1 — Brand Foundation
- **Canvas background**: Changed from pure white (#FFFFFF) to brand warm (#F8FAFC) for depth
- **Focus rings**: All focus rings now use brand purple (#6D5EF6) instead of generic zinc
- **Task row hovers**: Purple-tinted hover states (`rgba(109,94,246,0.04)`) instead of generic gray
- **Now-line**: Calendar current time indicator changed from red to brand purple
- **Impact rail rounding**: Task items have rounded left edge (`4px 0 0 4px`) matching legacy design
- **Calendar events**: Restyled from solid colored blocks to elegant outlined cards with colored left rail, dark text on light background — the single biggest visual improvement

---

## v0.53.9 — 2026-02-20

### Changed
- **Docs cleanup**: Archived 5 legacy frontend docs (Error Handling, Toast System, In-Place Mutations, Architecture Decision/Review) to `docs/plans/`. Updated README documentation index. Compacted CHANGELOG from 1867 to ~370 lines.

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
- Clock icon removed from task durations (kept only on parent aggregated time)
- Full header labels (Clarity/Duration/Impact) replacing abbreviations
- Stable event ordering on carousel swipe (deterministic sort tiebreaker)
- Event flicker eliminated with `placeholderData: keepPreviousData`
- Anytime section fixed height (34px single-row with horizontal scroll)

---

## v0.51.0–v0.51.9 — 2026-02-19

### Calendar Redesign

- **Extended day view**: Single 44-hour view (prev 9PM through next 5PM) with day separators
- **Anytime section**: Horizontal pill banner above time grid for date-only tasks
- **Continuous zoom**: Ctrl+wheel zooms smoothly, snaps to nearest step on save
- **5-panel carousel**: CSS scroll-snap with desktop pointer-drag swipe, replacing fragile transform-based approach (4 iterations)
- Live scroll updates for header date and anytime tasks
- Wider data fetch range (±5 days) eliminating event flicker on navigation
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
- **Calendar features**: Drag-to-reschedule, instance cards, swipe navigation, auto-scroll during drag, phantom card drop indicator, cross-day drag, adjacent-day sync
- **Task interactions**: Context menus, kebab menus, inline add-task, date shortcuts
- **Undo toasts** on all operations with task names
- **Accessibility**: aria-live announcer, reduced motion support, 44px touch targets
- **Glass morphism**: Header, nav, energy selector with frosted glass effect
- **Demo pill widget** for demo users
- **Pending past instances banner** with bulk Complete/Skip
- **Network status monitoring** with persistent toasts
- **Error boundary** preventing white-screen crashes

### Fixed (~40 patches)

- Sort/filter persistence across reload, swipe cascade to subtasks, plan mode parallel scheduling, calendar time indicator, wizard domain deletion, encrypted text flash, CSRF token flow, subtask editing, domain group expand/collapse, and many more

---

## v0.48.0–v0.48.12 — 2026-02-17/18

### React SPA Launch

- **v0.48.0**: Removed all legacy frontend (18 Jinja2 templates, 25 JS modules, 22 CSS files, vendor libs, legacy routers, obsolete tests). Added keyboard shortcuts and motion animations.
- **Analytics page**: Interactive charts (completions, domain breakdown, heatmap, velocity trends)
- **Frontend CI**: TypeScript, Biome lint, and production build in GitHub Actions
- **Railway deployment**: Resolved railpack Node.js detection through multiple iterations (v0.48.3–v0.48.8)
- **Encryption hardening**: Fixed ciphertext flash, enable corruption race, child route rendering behind unlock dialog
- **CSRF flow**: Added token endpoint and axios interceptor for SPA
- **27 hardcoded query keys** replaced with generated helpers
- **11 backend endpoints** got response models for proper TypeScript codegen

---

## v0.47.0–v0.47.9 — 2026-02-17

### React SPA Migration

Built the entire React frontend from scratch:

- **v0.47.0**: Scaffold — Vite 6, React 19, TypeScript, TanStack Router/Query, Zustand, Tailwind v4, shadcn/ui, dnd-kit, orval
- **v0.47.1**: API codegen (82 types), encryption/passkey ports, Zustand stores, `use-crypto` hook
- **v0.47.2**: App shell, auth guard, login, theme provider, encryption unlock modal
- **v0.47.3**: Settings, Thoughts, Privacy/Terms pages, onboarding wizard
- **v0.47.4**: SPA serving, static assets, service worker, PWA meta tags, Railway build
- **v0.47.5**: Dashboard task panel with domain grouping, subtrees, encryption
- **v0.47.6**: Task editor sheet, quick add, recurrence picker, sort/filter/energy controls
- **v0.47.7**: Calendar panel — 3-day carousel, time grid, overlap detection, zoom, Plan My Day
- **v0.47.8**: Drag-and-drop — task-to-calendar, calendar-to-list, task-to-task reparenting
- **v0.47.9**: Mobile — swipe gestures, haptic feedback, long-press action sheet, gesture discovery

---

## v0.46.0–v0.46.7 — 2026-02-17

### Subtask System

- Depth-1 constraint (subtasks can't have subtasks)
- Completion cascade (parent → children)
- Expand/collapse containers with persisted state
- Create, reparent, and promote subtasks from UI
- Todoist import flattens deep nesting to depth-1
- JS modules preserve subtask containers during sort/drag/count

---

## v0.45.67–v0.45.99 — 2026-02-15/17

### Drag-and-Drop & Calendar Overhaul

- **Custom drag overlay**: Fixed-position clone follows cursor, morphs to event pill over calendar
- **Phantom card**: Drop indicator showing task title, time, impact rail with 15-minute snap
- **Auto-scroll**: Vertical scroll near top/bottom edges during drag
- **Cross-day drag**: Hover near edge for 500ms navigates to adjacent day
- **Adjacent-day sync**: Bidirectional mirroring of evening/morning tasks across day boundaries
- **Toast stacking**: Max 3 visible simultaneously with `Toast.undo()` convenience method
- **Snapshots**: Automated daily backups with content-hash dedup (6 new API endpoints)

### Fixed (30+ patches)

- Drag ghost offset (5 iterations from native ghost → clone → custom overlay)
- Adjacent-day mirroring edge cases (undo, clone cleanup, reschedule)
- Calendar completion/reopen visual state management
- Numerous undo toast and scroll-to-task fixes

---

## v0.45.30–v0.45.66 — 2026-02-13/15

### PWA & Mobile Polish

- **PWA viewport fix**: 3 independent iOS triggers identified and fixed — `overflow:hidden`, `position:fixed`, `100dvh` underreporting. See [docs/PWA-VIEWPORT-FIX.md](docs/PWA-VIEWPORT-FIX.md)
- **In-place mutations**: Surgical DOM updates replacing page reloads for all task operations
- **Calendar improvements**: Fixed calendar header, scroll-to-now, glass backdrop, swipe navigation
- **Recurring tasks**: Auto-populate scheduled_date, undo instance reschedule
- **Privacy policy**: Standalone page for Google OAuth verification
- **Claude Code skills**: `/fix-issue` and `/fix-all-issues` slash commands

---

## v0.45.0–v0.45.29 — 2026-02-12/13

### Thoughts Redesign & Misc

- **Chat-style Thoughts page**: Bottom-input layout, date separators, slide-up animations, glass morphism
- **Mobile polish**: Pull-to-refresh, parent task name wrapping, PWA safe areas
- **Sentry auto-fix workflow**: Auto-assigns issues to Copilot agent

---

## v0.44.0–v0.44.11 — 2026-02-11

### Mobile Redesign (Thoughts, Analytics, Settings)

Full-viewport scrolling, glass-morphism sticky headers, edge-to-edge layout, 44px touch targets. iMessage-style thought capture button. Toast improvements (undo duration, wrapping, full-width snackbar).

---

## v0.42.42–v0.43.3 — 2026-02-10/11

### Glass UI & Mobile UX Overhaul

- **Floating glass energy selector**: iOS-style segmented control above tab bar
- **Glass everywhere**: Header, task-list header, domain headers, tab bar — progressive iterations to Telegram-matched transparency levels
- **Nunito font**: System font → Nunito throughout
- **Gesture discovery**: Animated swipe hint, purple edge hint, long-press tooltip
- **Swipe-left schedules** (was delete; delete moved to long-press)
- **Mobile filter bar**: Full sort labels, gradient spectrum bar, 44px tap targets
- **Calendar fade gradient**: CSS `mask-image` on carousel

---

## v0.42.7–v0.42.41 — 2026-02-09/10

### v1.0 Security Audit & Calendar Features

**Security (15 patches)**:
- CSP hardening (self-hosted all vendor scripts)
- Rate limits on destructive endpoints
- Session fixation defense, backup import size limit
- Input validation (range, max_length, batch size)
- Offline mutation guards, HTMX CSRF injection
- domain_id IDOR fix, batch update rollback, /ready info leak fix

**Features**:
- Calendar zoom (+/- and Ctrl+scroll, persisted)
- Calendar card context menus (Skip, Unschedule, Edit, Delete)
- Actions menu (kebab ⋮) on all tasks with undo-based delete
- Universal departing animation for complete/schedule/delete

---

## v0.42.0–v0.42.6 — 2026-02-08/09

- Complete `safeFetch()` migration (zero plain `fetch()` in application code)
- Keyboard shortcuts: j/k navigation, c/e/x task actions, help modal

---

## v0.40.0–v0.41.1 — 2026-02-08

### Production Hardening & Toast Rewrite

- Database pool tuning, statement timeout (30s), graceful shutdown
- `safeFetch()` error recovery foundation with typed error classes
- Toast system rewrite: queue, type variants, action buttons, deduplication
- Keyboard shortcuts discoverability

---

## v0.39.0–v0.39.8 — 2026-02-07/08

- **Rename clarity to Mode**: clear/defined/open → autopilot/normal/brainstorm
- **Impact labels**: Unified to High/Mid/Low/Min
- **Demo account overhaul**: Realistic PM persona with ~50 tasks

---

## v0.37.0–v0.38.0 — 2026-02-07

### Task List Refinements

- Meta column opacity, ghost checkbox, clarity text labels, domain task counts
- Plan My Day contextual banner, calendar auto-advance after 8pm
- Past-tasks amber badge with Complete/Skip popover

---

## v0.34.0–v0.36.0 — 2026-02-06

### Header & Task List Redesign

- Two-row header layout with energy + view chips
- Flat scheduled/completed sections (no per-domain nesting)
- Brand-aligned spectrum gradient, segmented view toggle
- Collapsible sections, neutral subtask badges, impact labels

---

## v0.32.0–v0.33.1 — 2026-02-02/06

### Recurring Tasks & GCal Sync Hardening

- Skip instances, batch completion, recurrence bounds, drag reschedule
- Per-user sync lock, adaptive throttle, circuit breaker, calendar reuse
- Clarity rename: executable→clear, exploratory→open

---

## v0.31.0–v0.31.9 — 2026-02-02

### Google Calendar Task Sync

One-way sync to dedicated "Whendoist" calendar with impact-based colors. Settings UI, OAuth scope upgrade, fire-and-forget background sync. Non-blocking bulk sync with adaptive throttle.

---

## v0.30.0–v0.30.1 — 2026-02-01

- Subtask hierarchy in Todoist import
- Parent breadcrumb display and subtask count badges
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
