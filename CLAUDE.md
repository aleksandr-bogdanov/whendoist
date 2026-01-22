# Claude Code Context

> Quick reference for Claude Code sessions working on Whendoist.

## Project Overview

**Whendoist** is a task scheduling app that answers "WHEN do I do my tasks?" by combining native tasks with Google Calendar events.

**Current Version:** v0.14.0 (Performance Optimization)

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
| Tooling | uv, ruff, pytest, alembic |

## Database Migrations

> **⚠️ CRITICAL: ALL schema changes MUST have migrations.**
>
> Before modifying `app/models.py` (adding columns, changing types, renaming fields, adding tables), you MUST:
> 1. Create a migration with `just migrate-new "description"`
> 2. Review the generated migration file
> 3. Test with `just migrate`
> 4. Commit BOTH the model change AND the migration file
>
> **Breaking the schema without a migration will cause production deployment failures.**

See [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md) for the full guide.

### Quick Reference

```bash
just migrate              # Apply pending migrations
just migrate-new "desc"   # Create migration from model changes
just migrate-status       # Show current version
just migrate-rollback     # Revert last migration
```

### Workflow

1. Modify model in `app/models.py`
2. Run `just migrate-new "description"`
3. Review generated file in `alembic/versions/`
4. Run `just migrate`
5. Commit both model and migration

### Production (Railway)

Migrations run automatically on app startup via `scripts/migrate.py`:
- Detects fresh vs existing databases
- Stamps existing DBs before upgrading
- Runs `alembic upgrade head`

> **Note:** `releaseCommand` is in `railway.toml` but doesn't work with Railpack. Migrations run during FastAPI lifespan startup instead.

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
│   ├── analytics_service.py   # Completion stats and trends (CTE-optimized)
│   ├── preferences_service.py # User preferences CRUD
│   ├── backup_service.py      # Data export/import as JSON
│   ├── calendar_cache.py      # TTL-based calendar event cache
│   └── todoist_import.py      # Optional Todoist import
├── tasks/
│   └── recurring.py           # Background instance materialization
├── utils/
│   └── timing.py              # Query timing decorator
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

## Assets

### Logo
- **File**: `static/img/logo.png`
- **Dimensions**: 1584 × 276 pixels (5.74:1 aspect ratio)
- **Type**: Wide wordmark with "WHENdoist" text integrated
- **Usage**: CSS should constrain height only (`height: Xpx; width: auto;`) to preserve aspect ratio

### Brand Assets
- **Location**: `static/img/brand/`
- **Files**: w-icon-color.svg, w-icon-dark.svg, w-icon-white.svg, app-icon-512.svg, favicon.svg
- **Wordmark**: W icon + "hendoist" in Quicksand 500
- **See**: `BRAND.md` for full specifications

### CRITICAL: Wordmark Sizing (DO NOT DEVIATE)

When implementing the W icon + "hendoist" wordmark, use EXACT specs from the table below. The W icon acts as the letter "W" and must align precisely with the text baseline.

| Size | Text | Icon W×H | Gap | Offset | Use Case |
|------|------|----------|-----|--------|----------|
| **Hero** | 6.5rem (104px) | 90×80px | 4px | 12px | Landing page |
| **Large** | 3rem (48px) | 42×37px | 2px | 5.5px | Page headers |
| **Medium** | 1.75rem (28px) | 24×21px | 1px | 3px | Section headers |
| **Small** | 1.25rem (20px) | 17×15px | 1px | 2px | Navigation, headers |

**Implementation pattern:**
```css
.logo {
    display: inline-flex;
    align-items: flex-end;
}
.logo svg {
    width: 17px;           /* From table */
    height: 15px;          /* From table */
    margin-bottom: 2px;    /* Offset from table */
    margin-right: 1px;     /* Gap from table */
    flex-shrink: 0;
}
.logo span {
    font-family: 'Quicksand', sans-serif;
    font-weight: 500;
    font-size: 1.25rem;    /* From table */
    color: #1E293B;
    line-height: 1;
}
```

**SVG viewBox:** Always use `viewBox="38 40 180 160"` for the W icon.

## Design System Overview

### Design Documentation

| Document | Purpose |
|----------|---------|
| **[BRAND.md](BRAND.md)** | Brand identity, wordmark, colors, typography |
| **[docs/brand/COLOR-SYSTEM.md](docs/brand/COLOR-SYSTEM.md)** | Complete color palette (107 tokens) |
| **[docs/brand/UI-KIT.md](docs/brand/UI-KIT.md)** | Button, form, panel specifications |
| **[docs/brand/PRESS-KIT.md](docs/brand/PRESS-KIT.md)** | Media resources, logos, screenshots |

**Note:** Historical planning docs are archived in `docs/archive/` for reference.

### Token Migration Map

| Legacy Token | New Token | Meaning |
|--------------|-----------|---------|
| `--dark-bg` | `--bg-canvas` | Page canvas |
| `--grey-bg` | `--bg-panel` | Panel backgrounds |
| `--light-bg` | `--bg-surface` | Card surfaces |
| `--elevated-bg` | `--bg-elevated` | Modals, popovers |
| `--text` | `--text-primary` | Primary text |
| `--text-muted` | `--text-secondary` | Secondary text |
| `--text-faint` | `--text-muted` | Tertiary text |
| `--border-hair` | `--border-subtle` | Inner dividers |
| `--border` | `--border-default` | Standard borders |

**During migration:** Legacy aliases will continue to work (defined as aliases to new tokens).

### Current CSS Custom Properties (Legacy - in app.css)

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

### Reference Implementation

`static/css/wizard.css` (v0.9) uses many of the new design patterns:
- Glassmorphism effects (`backdrop-filter`)
- Modern button variants
- Mobile-first responsive design

### Design Principles

1. **Tint-based interactions** — Hover/active use color tints, not shadows
2. **Shadows for overlays only** — Modals, popovers, toasts
3. **Impact owns the row** — Rail + wash, chips are neutral
4. **Inset dividers** — Row separators start after the rail
5. **Purple for success states** — Check/connected/success UI uses neutral + purple, never green (except third-party brand icons)

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

## Git Workflow (CRITICAL)

**NEVER push directly to master.** Always use pull requests.

### Standard Workflow

```
feature branch → PR → CI passes → merge → release (if needed)
```

1. **Create feature branch:**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes, run pre-commit checks:**
   ```bash
   uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
   ```

3. **Commit and push branch:**
   ```bash
   git add -A && git commit -m "Description of changes"
   git push -u origin feature/my-feature
   ```

4. **Create PR:**
   ```bash
   gh pr create --title "Feature title" --body "Description"
   ```

5. **Wait for CI to pass, then merge**

### Exceptions

Only push directly to master when **explicitly asked** by the user (e.g., "push this directly to master").

## Release Process

Releases are managed via GitHub Actions with GPG-signed tags.

### Creating a Release (Step by Step)

**1. Create release PR** with these changes:
- Update `CHANGELOG.md` with new version entry
- Update version in `CLAUDE.md` if needed
- Update version badge in `app/templates/base.html` (e.g., `v0.9`)
- Run `just build-manifest` to update build manifest

**2. Get PR merged** — CI must pass

**3. Trigger release** via GitHub Actions:
- Go to: Actions → Release → Run workflow
- Enter version (e.g., `0.9.0`)
- Click "Run workflow"

The release workflow:
- Validates CHANGELOG entry exists
- Checks CI passed for current commit
- Creates GPG-signed tag (shows ✓ Verified)
- Builds and publishes GitHub Release with artifacts

### What the Pipeline Does

| Job | Description |
|-----|-------------|
| **Prepare** | Validates version format, checks tag doesn't exist, verifies CHANGELOG entry |
| **Create Tag** | Creates signed tag (GitHub-verified ✓) |
| **Release** | Generates hashes, creates build manifest, publishes GitHub Release |
| **Update Manifest** | Commits updated `static/build-manifest.json` to master for production |

### Build Artifacts

Each release includes:
- `build-manifest.json` — Version, commit, build hash, file hashes
- `file-hashes.txt` — SHA256 hashes for all source files
- `sri-hashes.json` — SRI hashes for script integrity
- `whendoist-vX.Y.Z.tar.gz` — Source archive


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
├── test_encryption.py          # E2E encryption (48 tests, multitenancy)
├── test_passkey.py             # Passkey unlock (49 tests, key wrapping, multitenancy)
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

## Recent Changes (v0.14.0)

### Performance Optimization

v0.14.0 addresses N+1 queries and performance bottlenecks. See [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) for full technical details.

#### Key Metrics Achieved

| Metric | Before | After |
|--------|--------|-------|
| Analytics queries | 26+ | ~10 |
| Recurring stats | 1 + 2N queries | 2 queries |
| Task filtering | Python memory | SQL WHERE |
| Calendar API | Every request | 5-min cache |

#### MUST-KNOW: Query Patterns

**1. Use UNION ALL for Task + Instance queries**

When querying both Task and TaskInstance tables for the same data, use `union_all`:

```python
from sqlalchemy import union_all, literal

# CORRECT: Single query
task_q = select(Task.completed_at, literal(False).label("is_instance")).where(...)
instance_q = select(TaskInstance.completed_at, literal(True).label("is_instance")).where(...)
combined = union_all(task_q, instance_q)
result = await db.execute(combined)

# WRONG: Two separate queries
tasks = await db.execute(select(Task).where(...))
instances = await db.execute(select(TaskInstance).where(...))
```

**2. Batch queries instead of N+1 loops**

```python
# CORRECT: Single batch query with GROUP BY
stats = (
    select(TaskInstance.task_id, func.count().label("total"))
    .where(TaskInstance.task_id.in_(task_ids))
    .group_by(TaskInstance.task_id)
)

# WRONG: N+1 loop
for task in tasks:
    count = await db.execute(select(func.count()).where(TaskInstance.task_id == task.id))
```

**3. Use SQL filter parameters, not Python filtering**

```python
# CORRECT: Filter in SQL
tasks = await task_service.get_tasks(has_domain=True, exclude_statuses=["archived"])

# WRONG: Filter in Python after fetching all
all_tasks = await task_service.get_tasks(status=None)
filtered = [t for t in all_tasks if t.domain_id is not None]
```

#### Calendar Cache Usage

```python
from app.services.calendar_cache import get_calendar_cache

cache = get_calendar_cache()

# Check cache first
events = cache.get(user_id, calendar_ids, start_date, end_date)
if events is None:
    events = await fetch_from_google_api(...)
    cache.set(user_id, calendar_ids, start_date, end_date, events)

# Invalidate when calendar selection changes
cache.invalidate_user(user_id)
```

**Important:** Cache is in-memory (single process). For multi-worker deployments, replace with Redis.

#### Background Tasks

Instance materialization runs automatically:
- **Startup:** `materialize_all_instances()` runs blocking
- **Hourly:** Background loop refreshes instances
- **Horizon:** 60 days ahead

Don't call `ensure_instances_materialized()` in request handlers — it's already handled.

#### Timing Decorator

Use `@log_timing` for performance monitoring:

```python
from app.utils.timing import log_timing

@log_timing("my_operation")
async def my_function():
    ...

# Logs: INFO whendoist.timing: my_operation: 45.2ms
```

#### Key Files

| File | Purpose |
|------|---------|
| `app/services/analytics_service.py` | CTE-optimized queries |
| `app/services/calendar_cache.py` | TTL cache (5 min) |
| `app/services/task_service.py` | `has_domain`, `exclude_statuses` params |
| `app/tasks/recurring.py` | Background materialization |
| `app/utils/timing.py` | `@log_timing` decorator |
| `docs/PERFORMANCE.md` | Full technical documentation |

---

## Previous Changes (v0.12.0)

### Security Hardening

v0.12.0 is Stage 2 of the production roadmap, focusing on security improvements.

### WebAuthn Challenge Storage

Challenges are now stored in PostgreSQL instead of in-memory dict:

```python
# OLD (broken with multiple workers):
_challenges: dict[int, bytes] = {}

# NEW (works with multiple workers):
from app.services.challenge_service import ChallengeService

service = ChallengeService(db, user.id)
await service.store_challenge(challenge_bytes)
challenge = await service.get_and_consume_challenge()
```

**Key Files:**
| File | Purpose |
|------|---------|
| `app/models.py` | `WebAuthnChallenge` model |
| `app/services/challenge_service.py` | Challenge CRUD with TTL |
| `tests/test_challenge_storage.py` | 12 tests including multitenancy |

### Rate Limiting

Sensitive endpoints are rate-limited using slowapi:

| Endpoint Category | Limit | Applied To |
|-------------------|-------|------------|
| Auth | 10/min | OAuth callbacks |
| Encryption | 5/min | Passkey, encryption setup |
| Default | 100/min | All other endpoints |

**Usage:**
```python
from app.middleware.rate_limit import limiter, ENCRYPTION_LIMIT

@router.post("/endpoint")
@limiter.limit(ENCRYPTION_LIMIT)
async def my_endpoint(request: Request, ...):
    ...
```

### PBKDF2 Iteration Versioning

Key derivation now supports versioned iteration counts:

| Version | Iterations | Use Case |
|---------|------------|----------|
| 1 | 100,000 | Legacy (v0.8.0 - v0.11.x) |
| 2 | 600,000 | New setups (v0.12.0+) |

**Automatic version detection:**
```javascript
// crypto.js
const version = window.WHENDOIST.encryptionVersion || 1;
const iterations = getIterationCount(version);  // 100k or 600k
```

### Security Headers

All responses include security headers via `SecurityHeadersMiddleware`:

| Header | Value | Purpose |
|--------|-------|---------|
| Content-Security-Policy | (see below) | XSS prevention |
| X-Frame-Options | DENY | Clickjacking prevention |
| X-Content-Type-Options | nosniff | MIME sniffing prevention |
| Referrer-Policy | strict-origin-when-cross-origin | Information leakage |

**CSP Policy:**
- `default-src 'self'` — Only same-origin by default
- `script-src 'self' 'unsafe-inline' cdn.jsdelivr.net` — Scripts from self and CDN
- `frame-ancestors 'none'` — Cannot be embedded in iframe
- No `unsafe-eval` — Prevents XSS via eval()

---

## Previous Changes (v0.11.0)

### Production Foundation

v0.11.0 begins the production-readiness effort documented in `docs/PRODUCTION-ROADMAP.md`.

- **Version Module** (`app/__init__.py`) — Single source of truth for `__version__`
- **Health Endpoints**:
  - `GET /health` — Basic liveness check, always returns 200 if app is running
  - `GET /ready` — Readiness check with database connectivity verification, returns 503 if DB unavailable
  - Both endpoints include app version in response
- **Database Indexes** — Composite indexes for common query patterns:
  - `ix_task_user_status` — Fast status filtering
  - `ix_task_user_scheduled` — Calendar queries
  - `ix_task_user_domain` — Domain filtering
  - `ix_task_parent` — Subtask lookups
  - `ix_instance_task_date`, `ix_instance_user_status`, `ix_instance_user_date` — Instance queries
- **Backup Validation** — Pydantic schemas validate backup data BEFORE clearing existing data:
  - `BackupValidationError` with clear error messages
  - Uses nested transaction/savepoint for rollback on failure
  - Existing data preserved if validation fails

### New Test Suites

| File | Tests | Coverage |
|------|-------|----------|
| `test_version.py` | 3 | Version consistency across codebase |
| `test_health.py` | 6 | Health endpoint contract tests |
| `test_backup_validation.py` | 11 | Backup validation, data preservation |

### Production Roadmap

See `docs/PRODUCTION-ROADMAP.md` for the 8-stage plan from v0.12.0 → v1.0.0:
- v0.13.0: Database migrations (Alembic)
- v0.14.0: Performance (query optimization, caching)
- v0.15.0: Architecture (code organization, API versioning)
- v0.16.0: Testing (PostgreSQL containers, E2E expansion)
- v0.17.0: Operations (structured logging, metrics)
- v1.0.0: Launch

---

## Previous Changes (v0.8)

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

### E2E Encryption Architecture (CRITICAL CONSTRAINTS)

The encryption system was completely rewritten in v0.8.3. **Do not introduce per-record encryption flags.**

#### Core Principle: Global Toggle Only

```
✅ CORRECT: One global toggle (encryption_enabled) per user
❌ WRONG: Per-record flags like title_encrypted, description_encrypted
```

**Why?** Per-record flags create orphaned encrypted data, mixed-state confusion, and make the system impossible to audit.

#### Encrypted Fields (3 total)

| Field | Model |
|-------|-------|
| `title` | Task |
| `description` | Task |
| `name` | Domain |

**Everything else stays plaintext** (dates, priority, clarity, status, recurrence) so calendar and filters work server-side.

#### Multitenancy Isolation (NEVER BREAK)

All encryption operations MUST be user-scoped. Tests verify this:

```python
# tests/test_encryption.py - 48 tests
# CRITICAL: TestEncryptionMultitenancy class

# Every query MUST filter by user_id
query = select(Task).where(
    Task.id == task_id,
    Task.user_id == self.user_id  # ← NEVER remove this
)

# Batch updates MUST skip unowned IDs
for item in data.tasks:
    task = await service.get_task(item.id)  # Returns None if not owned
    if not task:
        continue  # ← Skip, don't fail
```

#### Key Files

| File | Role |
|------|------|
| `static/js/crypto.js` | Client-side AES-256-GCM encryption |
| `app/services/preferences_service.py` | `setup_encryption()`, `disable_encryption()` |
| `app/routers/tasks.py` | `/api/tasks/all-content`, `/api/tasks/batch-update` |
| `app/routers/domains.py` | `/api/domains/batch-update` |
| `app/templates/base.html` | `window.WHENDOIST` config |
| `tests/test_encryption.py` | 48 comprehensive tests |

#### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/tasks/all-content` | Fetch all tasks/domains for batch encrypt/decrypt |
| `POST /api/tasks/batch-update` | Update multiple tasks (encrypt enable/disable) |
| `POST /api/domains/batch-update` | Update multiple domains (encrypt enable/disable) |
| `POST /api/preferences/encryption/setup` | Enable encryption (stores salt, test value) |
| `POST /api/preferences/encryption/disable` | Disable encryption |

#### MUST-HAVES for Any Encryption Changes

1. **Run encryption tests**: `uv run pytest tests/test_encryption.py -v`
2. **Verify multitenancy**: User A must never see/modify User B's data
3. **No per-record flags**: Global toggle only via `UserPreferences.encryption_enabled`
4. **Batch updates respect ownership**: `get_task(id)` returns None for other users' tasks

#### E2E Testing for Encrypted Field Display (CRITICAL)

**Before committing any feature that displays encrypted fields (title, description, domain name), you MUST manually test with encryption enabled.**

Contract tests only verify code EXISTS, not that it WORKS at runtime. The v0.8.9-v0.8.11 bugs proved this:
- Contract test checked for `domainChart.updateOptions` string → passed
- But the actual code path was broken (ApexCharts API misuse)
- DOM-based decryption (`el.textContent`) failed while JS data-based worked

**Mandatory E2E Test Checklist:**

| Feature Type | Manual Test Required |
|-------------|---------------------|
| New chart/visualization with domain names | Enable encryption → verify labels decrypt |
| New list/table with task titles | Enable encryption → verify titles decrypt |
| New feature displaying task descriptions | Enable encryption → verify descriptions decrypt |
| Any new Analytics section | Test with encrypted data, verify decryption |

**Reliable Pattern for Decryption:**

Always read encrypted data from **JavaScript variables** (serialized JSON), not DOM content:

```javascript
// ✅ CORRECT: Read from JS data (reliable)
const data = {{ server_data | tojson }};
for (let i = 0; i < elements.length; i++) {
    const encrypted = data[i].title;
    const decrypted = await Crypto.decryptField(encrypted);
    elements[i].textContent = decrypted;
}

// ❌ WRONG: Read from DOM (unreliable)
const encrypted = element.textContent;  // May have encoding issues
```

### Passkey Unlock Architecture (v0.8.4)

Passkeys provide an alternative to passphrase for unlocking encrypted data using WebAuthn PRF extension.

#### Key Wrapping Model (CRITICAL)

Each passkey wraps the **same master key**, not its own derived key:

```
Master Key (from PBKDF2 passphrase or first passkey)
├── Passkey A → PRF → Wrapping Key A → encrypt(Master Key) → stored
├── Passkey B → PRF → Wrapping Key B → encrypt(Master Key) → stored
└── Master Key → encrypts actual data (tasks, domains)
```

**Why wrapping?** Different passkeys produce different PRF outputs. Without wrapping, each passkey would derive its own independent key, making multi-passkey support impossible.

#### Data Model

```python
class UserPasskey(Base):
    credential_id: bytes      # WebAuthn credential ID
    public_key: bytes         # COSE public key for verification
    sign_count: int           # Replay attack protection
    prf_salt: str             # Salt for PRF input
    wrapped_key: str          # Master key wrapped with PRF-derived key
    name: str                 # User-friendly name ("1Password", "Touch ID")
```

**NEVER use `encryption_test_value` per passkey** — that was the broken architecture. Use `wrapped_key`.

#### Registration Flow

1. User must be unlocked (have master key in session)
2. User creates passkey with PRF extension
3. PRF output → wrapping key
4. `wrapMasterKey(wrappingKey, masterKey)` → `wrapped_key`
5. Server stores credential + wrapped_key

#### Authentication Flow

1. Server sends `allowCredentials` (only registered credential IDs)
2. User authenticates with passkey
3. PRF output → wrapping key
4. `unwrapMasterKey(wrappingKey, wrapped_key)` → master key
5. Verify master key against `UserPreferences.encryption_test_value`
6. Store master key in sessionStorage

#### Multitenancy (CRITICAL)

Same rules as encryption — all passkey operations are user-scoped:

```python
# tests/test_passkey.py - TestPasskeyMultitenancy class
# EVERY query MUST filter by user_id

result = await db.execute(
    select(UserPasskey).where(
        UserPasskey.id == passkey_id,
        UserPasskey.user_id == self.user_id  # ← NEVER remove this
    )
)
```

#### Key Files

| File | Role |
|------|------|
| `static/js/passkey.js` | WebAuthn + PRF + key wrapping |
| `app/services/passkey_service.py` | Credential CRUD |
| `app/routers/passkeys.py` | REST API endpoints |
| `tests/test_passkey.py` | 49 comprehensive tests |

#### MUST-HAVES for Passkey Changes

1. **Run passkey tests**: `uv run pytest tests/test_passkey.py -v`
2. **Verify multitenancy**: User A cannot access User B's passkeys
3. **Use wrapped_key**: Never derive separate keys per passkey
4. **Registration requires unlock**: Can't add passkey without master key in session
5. **Authentication verifies key**: Always decrypt test value before storing key

## WhenWizard (First-Run Onboarding) — v0.9

The onboarding wizard guides new users through initial setup. It's implemented as a full-screen overlay on the dashboard.

### Architecture

| Component | File | Purpose |
|-----------|------|---------|
| JavaScript | `static/js/wizard.js` | `WhenWizard` class with state management, navigation, rendering |
| CSS | `static/css/wizard.css` | Mobile-first responsive styles |
| Backend | `app/routers/wizard.py` | API endpoints for status/complete/reset |
| Model | `app/models.py` | `User.wizard_completed`, `User.wizard_completed_at` fields |

### 8-Step Flow

| Step | Title | Required | Key Features |
|------|-------|----------|--------------|
| 1 | Welcome | Yes | Logo, value proposition, user greeting |
| 2 | Energy Modes | Yes | Interactive clarity filter preview |
| 3 | Connect Calendar | Optional | Google OAuth for calendar access |
| 4 | Select Calendars | Conditional | Only if Step 3 connected; pre-fetched on connect |
| 5 | Todoist Import | Optional | OAuth + import with detailed results |
| 6 | Set Up Domains | Yes | Preset chips + custom domain with emoji picker |
| 7 | Security | Optional | Encryption setup + passkey registration |
| 8 | Ready | Yes | Recap and launch |

### State Management

```javascript
// State persisted to localStorage
{
    currentStep: 1,
    completedSteps: [],
    data: {
        calendarConnected: boolean,
        selectedCalendars: string[],
        cachedCalendars: Calendar[],      // Pre-fetched for instant Step 4 load
        todoistConnected: boolean,
        importResult: { tasksImported, projectsImported, ... },
        domains: [{ name, icon }, ...],
        encryptionEnabled: boolean,
        passkeyRegistered: boolean,
        acknowledgmentChecked: boolean
    }
}
```

### Key Patterns

1. **OAuth Return Handling**: Add `?wizard=true` to OAuth redirects. Wizard resumes from localStorage state after return.

2. **Calendar Pre-fetching**: Calendars are fetched when `calendarConnected` becomes true, cached in state for instant Step 4 rendering.

3. **Domain Deduplication**: `create_domain()` is idempotent — returns existing domain if name matches.

4. **Encryption in Wizard**: Full setup including fetching all content, encrypting, batch-updating, and enabling on server.

5. **Swipe Navigation**: Touch devices can swipe to navigate. Higher thresholds (120px, 0.7 velocity) prevent accidental triggers on interactive elements.

6. **Wordmark FOUC Prevention**: The wordmark starts with `opacity: 0` and is revealed via `.font-ready` class after `document.fonts.load('500 3rem Quicksand')` resolves. This prevents a visible jump when the font swaps from fallback to Quicksand. The wordmark styles are duplicated in `wizard.css` to avoid `@import` timing issues from `typography.css`.

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/wizard/status` | Check if wizard completed |
| `POST /api/wizard/complete` | Mark wizard as complete |
| `POST /api/wizard/reset` | Reset for re-run from Settings |

### CSS Class Naming

All wizard classes prefixed with `wizard-`:
- `.wizard-backdrop` — Full-screen overlay
- `.wizard-panel` — Centered card (full-screen on mobile)
- `.wizard-content` — Scrollable step content
- `.wizard-nav` — Bottom navigation with buttons
- `.wizard-progress` — Step indicator dots
- `.wizard-btn-primary`, `.wizard-btn-secondary`, `.wizard-btn-ghost` — Button variants

### Mobile Considerations

- Base styles for mobile, `@media (min-width: 600px)` for tablet/desktop
- Touch-friendly targets (52px height on mobile, 44px on desktop)
- Virtual keyboard handling (`body.keyboard-open` hides nav)
- PWA safe area padding

### Testing

Contract tests in `tests/test_hotfix_wizard_bugs.py` verify:
- Wizard encryption setup calls all required APIs
- Google OAuth always updates user name
- Domain creation is idempotent
- Task counts display in Settings

## Files to Read First

### Production Planning
1. `docs/ARCHITECTURAL-REVIEW.md` — 25-issue security/scalability assessment
2. `docs/PRODUCTION-ROADMAP.md` — 8-stage implementation plan (v0.11.0 → v1.0.0)
3. `docs/PERFORMANCE.md` — Query optimization, caching, background tasks (v0.14.0)

### Design System
3. `BRAND.md` — Brand identity, wordmark, colors, typography
4. `docs/brand/COLOR-SYSTEM.md` — Complete color palette (107 tokens)
5. `docs/brand/UI-KIT.md` — Component specifications (buttons, forms, panels)

### Code Understanding
6. `CHANGELOG.md` — Version history and changes
7. `tests/README.md` — Test architecture and how to write tests
8. `static/css/app.css` — Design tokens (first 120 lines)
9. `static/css/wizard.css` — Reference implementation of new design patterns
10. `static/js/crypto.js` — Client-side encryption library
11. `app/templates/dashboard.html` — Tasks page template
12. `app/templates/settings.html` — Settings page with Security and Build Provenance panels

## Known Issues

See `docs/ARCHITECTURAL-REVIEW.md` for 25 tracked issues with severity ratings.

## Next Up (v1.0)

The path to v1.0 is documented in `docs/PRODUCTION-ROADMAP.md`. Key milestones:

| Version | Focus | Status |
|---------|-------|--------|
| v0.12.0 | Security (rate limiting, WebAuthn challenge storage, CSP) | Done |
| v0.13.0 | Database migrations (Alembic) | Done |
| v0.14.0 | Performance (N+1 queries, caching) | Done |
| v0.15.0 | Architecture (code organization, API versioning) | Next |
| v0.16.0 | Testing (PostgreSQL containers, E2E expansion) | |
| v0.17.0 | Operations (structured logging, metrics) | |
| v1.0.0 | Launch (security audit, documentation) | |

### Feature Backlog
- Design system overhaul with dark mode support
- Time blocking templates
- Key rotation (change passphrase without re-encrypting all data)
- Recovery key generation during encryption setup
