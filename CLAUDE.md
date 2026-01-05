# Claude Code Context

> Quick reference for Claude Code sessions working on Whendoist.

## Project Overview

**Whendoist** is a task scheduling app that answers "WHEN do I do my tasks?" by combining Todoist tasks with Google Calendar events.

**Current Version:** v0.5 (UI Polish)

**Three Spaces:**
- **Tasks** — Day planning with task list + calendar (v0.5 design complete)
- **Thoughts** — Quick capture (design pending)
- **Settings** — Account configuration (design pending)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2.0 (async) |
| Frontend | HTMX, Jinja2, Pico CSS, vanilla JS |
| Database | PostgreSQL with asyncpg |
| APIs | Todoist REST v2, Google Calendar v3 |
| Tooling | uv, ruff, pytest |

## Project Structure

```
app/
├── main.py           # FastAPI entrypoint
├── config.py         # Pydantic settings
├── database.py       # Async SQLAlchemy
├── models.py         # ORM models
├── auth/             # OAuth2 flows
├── services/         # API clients
├── routers/          # HTTP routes
└── templates/        # Jinja2 templates

static/
├── css/
│   ├── app.css       # Design tokens, header, nav, toast
│   ├── dashboard.css # Task list, calendar, drag-drop (2000+ lines)
│   └── dialog.css    # Task edit dialog
└── js/
    ├── drag-drop.js      # Main drag/drop logic, trash bin
    ├── plan-tasks.js     # Time range selection, auto-schedule
    ├── task-dialog.js    # Create/edit task modal
    ├── task-sort.js      # Column sorting
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

## Design System (Tasks Space)

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

### Calendar Structure
- Adjacent day hours (prev evening, next morning)
- Day separator with negative margins (doesn't consume space)
- Hour slots with absolute-positioned tasks

## Recent Changes (v0.5)

- Grid-based task layout with fixed columns
- Inset row dividers (don't cut through rail)
- Neutral hover (slate tint, not purple)
- Day separator as line + pill
- Anytime lane tray style
- Hour banding on calendar
- Trash bin drop zone fix

## Files to Read First

1. `DESIGN.md` — Full design system documentation
2. `CHANGELOG.md` — Version history and changes
3. `static/css/app.css` — Design tokens (first 120 lines)
4. `app/templates/dashboard.html` — Main template structure

## Known Issues

- Multiple anytime tasks may cause calendar alignment shift between days
- Todoist import UX needs polish

## Next Up (v0.6)

- Redesign Thoughts space
- Redesign Settings space
- Task completion support
