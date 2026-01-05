# Changelog

All notable changes to Whendoist are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Redesign Thoughts space
- Redesign Settings space
- Support task completion
- Polish Todoist import UX

### Known Issues
- Multiple anytime tasks may cause calendar alignment shift between days

---

## [0.5.0] - 2026-01-05

### Summary
Major UI polish release focused on the **Tasks space**. Establishes a calm, enterprise-grade aesthetic with improved information hierarchy, tint-based interactions, and a consistent visual grammar across task list and calendar.

### Added

- **Grid-based task layout** — Duration, Impact, and Clarity in fixed-width columns with proper alignment
- **Column separators in header** — Vertical lines centered in column gaps (header only, not rows)
- **Inset row dividers** — Separator lines start after the impact rail, not cutting through it
- **Hour banding on calendar** — Alternating row backgrounds for easier scanning
- **Major hour lines** — Stronger border every 2 hours for visual rhythm
- **Time axis gutter** — 54px label column with right-aligned tabular numbers

### Changed

- **Task row hover** — Now uses neutral slate tint instead of purple wash
- **Selection state** — Purple tint reserved exclusively for selected items
- **Impact rail** — Implemented as pseudo-element for cleaner rendering
- **Day separator** — Changed from heavy slab to subtle line + centered pill
- **Anytime lane** — Tray-style container with white task cards inside
- **Text contrast** — Bumped all text colors for better readability
- **Border system** — Refined 3-tier hierarchy (hair/normal/strong)
- **Sort header** — Removed rounded border, text color only for active state
- **Column widths** — Duration 68px, Impact 56px, Clarity 80px, Gap 12px

### Fixed

- **Calendar cell width** — No longer expands with long task text (min-width: 0)
- **Tasks spanning day separator** — Duration display now correct across boundaries
- **Trash bin drop zone** — Active area covers entire button, not just top portion
- **Scheduled task positioning** — Removed conflicting position: relative override
- **Drag rescheduling** — Tasks no longer disappear during calendar drag operations

### Design System

See [DESIGN.md](./DESIGN.md) for comprehensive documentation of the Tasks space design patterns.

---

## [0.4.0] - 2026-01-04

### Added

- **Native task management** — Create, edit, and delete tasks directly in Whendoist
  - Task dialog with title, description, schedule, due date, duration, impact, and clarity
  - Recurrence picker for repeating tasks (daily, weekly, monthly, custom)
  - Delete button in edit dialog
- **Drag-to-trash** — Drag tasks from panel or calendar to trash bin to delete
- **Domain management** — Create and organize task domains/projects
- **Todoist import** — One-click import of existing Todoist tasks
- **Task instances** — Recurring task instance tracking
- **Version badge** in header (v0.4)

### Changed

- **Energy filter task counts** — Domain headers now show "visible/total" when filtered (e.g., "3/5")
- Deleting a parent task now cascades to delete all subtasks
- Plan My Day selection now works correctly in adjacent-day sections (prev evening, next morning)
- Improved Plan My Day visual highlight with subtle inset glow

### Fixed

- Plan My Day time selection accuracy using actual DOM positions
- Vertical alignment of energy buttons and Plan My Day button
- Selection overlay positioning in hour grid with borders
- Removed unwanted scroll behavior when entering Plan mode

---

## [0.3.0] - 2025-12-30

### Added

- **Plan feature** - Auto-schedule tasks into selected time ranges
  - Click-and-drag time range selection on calendar
  - Bidirectional selection (drag up or down)
  - Smart scheduling algorithm respects existing events
- **PWA support** - Add to home screen on iOS and Android
  - Fullscreen standalone mode
  - Safe area support for notched devices
- **Mobile-optimized compact mode** - Vertical layout with touch support
- **Touch support** for Plan feature on mobile devices
- `data-due-date` and `data-is-recurring` attributes for date-aware scheduling

### Changed

- Tasks without `@clarity` labels are now hidden from task list
- Projects with no visible tasks are automatically hidden
- Energy filter completely hides non-matching tasks (previously greyed out)
- Renamed "Stack" feature to "Plan" throughout codebase
- Inbox project moved to bottom, collapsed by default
- Improved mobile responsive layout with configurable panel ratios

### Fixed

- Plan selection works in both directions (top-to-bottom and bottom-to-top)
- Tasks without duration default to 30 minutes
- Algorithm skips tasks that don't fit instead of advancing slots

---

## [0.2.0] - 2025-12-28

### Added

- **Drag-and-drop scheduling** - Drag tasks from list to calendar
- 15-minute interval snapping for precise scheduling
- Duration-based event height visualization
- Reschedule by dragging scheduled tasks
- Remove scheduled tasks by dragging out of calendar
- Overlap detection with side-by-side display (max 3 columns)
- Commit scheduled tasks to Todoist API
- Calendar carousel (15 days: 7 before, today, 7 after)
- "Today" floating button for quick navigation

---

## [0.1.0] - 2025-12-27

### Added

- OAuth2 authentication for Todoist and Google Calendar
- Fetch and display tasks from Todoist
- Fetch and display events from Google Calendar
- Dashboard with 2:1 layout (tasks : calendar)
- Energy-based task filtering (Zombie / Normal / Focus)
- Task grouping by project with collapsible sections
- Settings page for Google Calendar selection
- Clarity labels parsing (`@executable`, `@defined`, `@exploratory`)
- Duration parsing from task description (`d:30m`, `d:2h`, `d:1h30m`)

---

[unreleased]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/aleksandr-bogdanov/whendoist/releases/tag/v0.1.0
