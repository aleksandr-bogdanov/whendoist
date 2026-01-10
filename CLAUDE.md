# Claude Code Context

> Quick reference for Claude Code sessions working on Whendoist.

## Project Overview

**Whendoist** is a task scheduling app that answers "WHEN do I do my tasks?" by combining native tasks with Google Calendar events.

**Current Version:** v0.7 (Task Completion)

**Four Pages:**
- **Tasks** — Day planning with task list + calendar (v0.5 design complete)
- **Thought Cabinet** — Quick capture with promote-to-task (v0.6 design complete)
- **Analytics** — Comprehensive completion stats with ApexCharts (v0.7)
- **Settings** — Account configuration, Task Display panel, Backup/Restore (v0.7)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2.0 (async) |
| Frontend | HTMX, Jinja2, Pico CSS, vanilla JS, ApexCharts |
| Database | PostgreSQL with asyncpg |
| APIs | Google Calendar v3, Todoist API v1 (optional import) |
| Tooling | uv, ruff, pytest |

## Project Structure

```
app/
├── main.py           # FastAPI entrypoint
├── config.py         # Pydantic settings
├── database.py       # Async SQLAlchemy
├── models.py         # ORM models (Task, Domain, UserPreferences, etc.)
├── auth/             # OAuth2 flows
├── services/
│   ├── task_service.py        # Native task CRUD
│   ├── analytics_service.py   # Completion stats and trends
│   ├── preferences_service.py # User preferences CRUD
│   ├── backup_service.py      # Data export/import as JSON
│   └── todoist_import.py      # Optional Todoist import
├── routers/          # HTTP routes
└── templates/        # Jinja2 templates

static/
├── css/
│   ├── app.css       # Design tokens, header, nav, toast
│   ├── dashboard.css # Tasks page: task list, calendar, drag-drop
│   └── dialog.css    # Task edit dialog
└── js/
    ├── drag-drop.js      # Main drag/drop logic, trash bin
    ├── plan-tasks.js     # Time range selection, auto-schedule
    ├── task-dialog.js    # Create/edit task modal
    ├── task-sort.js      # Column sorting
    ├── task-complete.js  # Task completion with preference-aware behavior
    ├── energy-selector.js
    ├── recurrence-picker.js
    └── toast.js
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Domains** | Project containers for tasks |
| **Clarity** | Task readiness: Executable, Defined, Exploratory |
| **Impact** | Priority: P1 (high) → P4 (minimal) |
| **Energy Mode** | Filters tasks by clarity level |
| **Anytime Tasks** | Scheduled for date, no specific time |

**Note:** Google Calendar integration only shows calendars from the Google account used to sign in. Todoist integration is optional (for importing existing tasks).

## Design System (Tasks Page)

### CSS Custom Properties (in app.css)

```css
/* Backgrounds */
--dark-bg: #F8FAFC;    /* canvas */
--grey-bg: #F1F5F9;    /* panels */
--light-bg: #FFFFFF;   /* cards */

/* Text */
--text: #0B1220;
--text-muted: rgba(15, 23, 42, 0.64);

/* Borders (3-tier) */
--border-hair: rgba(15, 23, 42, 0.055);
--border: rgba(15, 23, 42, 0.085);
--border-strong: rgba(15, 23, 42, 0.12);

/* Task columns */
--col-duration: 68px;
--col-impact: 56px;
--col-clarity: 80px;
--col-gap: 12px;
--rail-w: 2px;
```

### Design Principles

1. **Tint-based interactions** — Hover/active use color tints, not shadows
2. **Shadows for overlays only** — Modals, popovers, toasts
3. **Impact owns the row** — Rail + wash, chips are neutral
4. **Inset dividers** — Row separators start after the rail

### Task Row Visual Grammar

```
┌──┬─────────────────┬────────┬────────┬──────────┐
│▌ │ Task title      │  30m   │  High  │ Defined  │
└──┴─────────────────┴────────┴────────┴──────────┘
 ↑         ↑            ↑        ↑         ↑
rail   content      duration  impact   clarity
```

## Common Commands

```bash
just dev      # Start dev server (localhost:8000)
just db-up    # Start PostgreSQL
just test     # Run pytest
just lint     # Run ruff
just fmt      # Format code
```

## Important Patterns

### CSS Organization
- Section headers with `/* ===== Section Name ===== */`
- Comments reference patch numbers from development (e.g., "Patch 51")
- Mobile breakpoints: 900px (tablet), 580px (phone)

### Drag & Drop
- `body.is-dragging` class added during drag operations
- `.dragging` class on the element being dragged
- Trash bin appears at bottom center during drag

### Task States
- `.scheduled` — Task has been placed on calendar (opacity: 0.5)
- `.is-selected` — Task is selected (purple tint)
- `.impact-1` through `.impact-4` — Priority coloring
- `.completed-today` — Completed today (grey text, strikethrough)
- `.completed-older` — Completed before today (ghostly appearance)

### Calendar Structure
- Adjacent day hours (prev evening, next morning)
- Day separator with negative margins (doesn't consume space)
- Hour slots with absolute-positioned tasks

### Focus Glow (Pico CSS Workaround)
Pico CSS aggressively styles input focus states. To override with custom glow:

```css
.modal-backdrop .input:focus {
    border-color: rgba(99, 102, 241, 0.5) !important;
    box-shadow: none !important;
    outline: none !important;
    filter: drop-shadow(0 0 4px rgba(99, 102, 241, 0.4)) !important;
    position: relative;
    z-index: 1;
}
```

**Key learnings:**
- `box-shadow` gets clipped by `overflow-y: auto` on parent containers
- `filter: drop-shadow()` renders on a different layer and isn't clipped
- `.modal-backdrop` prefix + `!important` needed to override Pico CSS
- `z-index: 1` fixes joined inputs overlapping each other's borders on focus

## Recent Changes (v0.7)

- **Todoist API Migration** — Migrated from REST v2 to API v1 for all operations
- **Task Completion Visibility** — Completed tasks remain visible for configurable retention window (1/3/7 days) in both Task List and Calendar
- **Visual Aging** — Simplified 2-level system:
  - Today: grey text with strikethrough
  - Older: muted grey (70% opacity) with strikethrough
- **Analytics Dashboard** — Comprehensive stats with ApexCharts:
  - Overview: completed, pending, rate, streak
  - Daily completions bar chart
  - Domain breakdown donut
  - Best days (day of week)
  - Active hours (hour of day)
  - GitHub-style contribution heatmap
  - Impact distribution
  - Velocity trend with rolling average
  - Task aging analysis
  - Recurring task completion rates
- **Completed Tasks Settings** — New panel in Settings with 4 preferences:
  - Show in Task List (toggle) — Calendar always shows completed tasks as history
  - Keep visible for (1/3/7 days) — Retention window for both
  - Position in Task List (bottom / in place)
  - Hide recurring after completing today — For "remaining work only" view
- **UserPreferences Model** — Backend storage for task display preferences
- **Completed Task Import** — Import recently completed tasks from Todoist for analytics
- **Backup & Restore** — Export/import all user data as JSON from Settings:
  - Download backup with timestamped filename
  - Restore from backup (replaces all data)
  - Includes domains, tasks, instances, preferences

### Task Completion CSS Classes
```css
.completed-today .task-text {
    text-decoration: line-through;
    color: var(--text-muted);
}
.completed-older .task-text {
    color: rgba(15, 23, 42, 0.7);  /* 70% - readable but clearly done */
    text-decoration: line-through;
}
```

### Recurring Task Completion
When a recurring task's today instance is completed:
- Parent task shows "done today" visual state in left panel
- Task instance has separate `completed_at` timestamp
- Can hide from list after completion (optional preference)

## Files to Read First

1. `DESIGN.md` — Full design system documentation
2. `CHANGELOG.md` — Version history and changes
3. `static/css/app.css` — Design tokens (first 120 lines)
4. `app/templates/dashboard.html` — Tasks page template
5. `app/templates/analytics.html` — Analytics page with ApexCharts
6. `app/templates/settings.html` — Settings page template

## Known Issues

- Todoist import UX needs polish

## Next Up (v0.8)

- Time blocking templates
