# Changelog

All notable changes to Whendoist are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/aleksandr-bogdanov/whendoist/releases/tag/v0.1.0
