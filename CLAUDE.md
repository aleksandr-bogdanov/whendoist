# Claude Code Context

> Quick reference for Claude Code sessions working on Whendoist.

## Project Overview

**Whendoist** is a task scheduling app that answers "WHEN do I do my tasks?" by combining native tasks with Google Calendar events.

**Current Version:** v0.8.1 (E2E Encryption)

**Four Pages:**
- **Tasks** — Day planning with task list + calendar (v0.5 design complete)
- **Thought Cabinet** — Quick capture with promote-to-task (v0.6 design complete)
- **Analytics** — Comprehensive completion stats with ApexCharts (v0.7)
- **Settings** — Account configuration, Task Display, Security, Backup (v0.8)

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
    ├── crypto.js         # Client-side E2E encryption (AES-256-GCM)
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
just dev            # Start dev server (localhost:8000)
just db-up          # Start PostgreSQL
just test           # Run pytest
just lint           # Run ruff check
just fmt            # Format code
just build-manifest # Generate build manifest for code provenance
```

## Before Committing (IMPORTANT)

**ALWAYS run ALL of these commands before every commit:**

```bash
uv run ruff format .   # Format all Python files
uv run ruff check .    # Check for linting errors
uv run pyright app/    # Type check (REQUIRED - CI will fail without this!)
just test              # Run tests
```

**Or run them all at once:**
```bash
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
```

The CI runs: lint → test → typecheck. All three must pass. Don't skip pyright!

## Release Process

Releases are managed via GitHub Actions with automatic tag signing and build provenance.

### Creating a Release (Step by Step)

**1. Update CHANGELOG.md** — Add entry for new version:
```markdown
## [0.9.0] - 2026-01-15

### Added
- New feature X

### Fixed
- Bug Y
```

**2. Run ALL pre-commit checks:**
```bash
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
```

**3. Generate build manifest** (REQUIRED for build provenance):
```bash
just build-manifest
```

**4. Commit and push:**
```bash
git add -A && git commit -m "Release v0.9.0"
git push origin master
```

**5. Wait for CI to pass** — Check GitHub Actions CI workflow

**6. Push tag to trigger release:**
```bash
git tag -a v0.9.0 -m "Release v0.9.0"
git push origin v0.9.0
```

The release workflow auto-triggers on tag push and creates the GitHub release with artifacts.

### What the Pipeline Does

| Job | Description |
|-----|-------------|
| **Prepare** | Validates version format, checks tag doesn't exist, verifies CHANGELOG entry |
| **Validate** | Runs linter and tests |
| **Create Tag** | Creates signed tag (GitHub-verified ✓) |
| **Release** | Generates hashes, creates build manifest, publishes GitHub Release |

### Build Artifacts

Each release includes:
- `build-manifest.json` — Version, commit, build hash, file hashes
- `file-hashes.txt` — SHA256 hashes for all source files
- `sri-hashes.json` — SRI hashes for script integrity
- `whendoist-vX.Y.Z.tar.gz` — Source archive

### Backwards Compatibility

You can still create releases by pushing tags manually:
```bash
git tag -a v0.9.0 -m "Release v0.9.0"
git push origin v0.9.0
```

However, manually-pushed tags won't show as "Verified" unless you've configured GPG signing locally.

## Testing

**Full documentation:** `tests/README.md`

### Test Structure

```
tests/
├── conftest.py                 # Shared fixtures (db_session)
├── test_labels.py              # Label parsing
├── test_preferences.py         # PreferencesService CRUD
├── test_task_sorting.py        # Server-side sorting (pages.py)
├── test_js_module_contract.py  # JS module API verification
└── e2e/
    └── test_task_sorting_e2e.py  # Browser-based tests (Playwright)
```

### Test Categories

| Category | Speed | Purpose |
|----------|-------|---------|
| **Unit** | Fast | Pure logic, in-memory SQLite |
| **Contract** | Fast | Verify JS modules have correct APIs |
| **E2E** | Slow | Full browser flow, needs running server |

### Critical Pattern: JS Module Contract Tests

When fixing bugs that involve JavaScript module interactions, add a **contract test** that verifies the integration point exists:

```python
# tests/test_js_module_contract.py
def test_calls_tasksort_update_preference_after_save():
    """
    task-list-options.js MUST call TaskSort.updatePreference()
    after saving. Without this, column headers use stale values.
    """
    assert "TaskSort.updatePreference" in task_list_options_js
```

This catches bugs where one JS module expects to call another but the API doesn't exist or the call is missing.

### When Writing Tests

1. **Choose the right layer** — Python bug? Unit test. JS integration? Contract test. Full flow? E2E.
2. **Add docstring with context** — Category, related code, what bug it prevents
3. **Link to bugs/PRs** — For regression tests, reference the original issue

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

## Recent Changes (v0.8)

- **E2E Encryption** — Optional end-to-end encryption for task data:
  - Uses Web Crypto API with AES-256-GCM
  - PBKDF2 key derivation from user passphrase (100,000 iterations)
  - Key stored in sessionStorage (cleared on logout/tab close)
  - Security panel in Settings to enable/disable
  - Passphrase unlock modal on page load when enabled
- **Code Provenance** — Verify deployed code matches GitHub (Three Pillars):
  - Build Provenance panel in Settings with version/commit info
  - "Verify Build" modal with file hashes and verification instructions
  - GitHub Actions release workflow with artifact attestations
  - SHA256 hashes for all static files, SRI hashes for key files
  - Build manifest generated at `static/build-manifest.json`
  - API endpoints: `/api/build/info`, `/api/build/verify`, `/api/build/hashes`
- **Todoist Import Polish** — Preview dialog with import options:
  - Shows project/task/subtask counts before importing
  - Option to include/exclude completed tasks
  - Visual stats display
- **Plan My Day Undo** — Undo button in toast after auto-scheduling
- **Cancel Button** — Task dialogs now have Cancel + primary action buttons
- **Compact Task Modal** — Reduced padding and heights for more compact editing
- **Scheduled Task Separation** — Scheduled tasks appear after unscheduled in list
- **Recurring Task Completion** — Fixed Complete button in Edit Task modal

### v0.7 (Task Completion)
- **Analytics Dashboard** — Comprehensive stats with ApexCharts
- **Task Completion Visibility** — Configurable retention window
- **Visual Aging** — 2-level system (today, older)
- **Completed Tasks Settings** — 4 preferences in Settings
- **Backup & Restore** — Export/import all data as JSON

### E2E Encryption Architecture
```javascript
// Client-side encryption flow:
1. User sets passphrase in Settings
2. Salt generated (32 bytes random)
3. Key derived: PBKDF2(passphrase, salt, 100000, SHA-256) -> AES-256
4. Test value encrypted and sent to server with salt
5. On subsequent visits, passphrase prompt -> key derived -> stored in sessionStorage
```

## Files to Read First

1. `DESIGN.md` — Full design system documentation
2. `CHANGELOG.md` — Version history and changes
3. `tests/README.md` — Test architecture and how to write tests
4. `static/css/app.css` — Design tokens (first 120 lines)
5. `static/js/crypto.js` — Client-side encryption library
6. `app/templates/dashboard.html` — Tasks page template
7. `app/templates/settings.html` — Settings page with Security and Build Provenance panels
8. `app/routers/build_info.py` — Build provenance API endpoints
9. `.github/workflows/release.yml` — Release pipeline (signed tags, attestations, provenance)

## Known Issues

None currently tracked.

## Next Up (v0.9)

- Time blocking templates
- Task encryption integration (encrypt on submit, decrypt on display)
