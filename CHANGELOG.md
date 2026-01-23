# Changelog

All notable changes to Whendoist are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Cleanup Python tests including docs/README.md
- Cleanup static files
- Cleanup justfile
- Find unused/dead code
- Clear up legal aspect (LICENSE?)
- Polish railway.toml
- Remove old logo everywhere
- Add contact form on the website
- Mobile view sorting doesn't work
- Show only * tasks doesn't work

---

## [0.29.0] - 2026-01-23

**Documentation Restructure** — Production-grade docs with clear separation between evergreen and archived content.

### Changed
- README.md rewritten as customer-facing landing page with whendoist.com
- CHANGELOG.md rewritten with conceptual changes (removed file-level details)
- BRAND.md cleaned up (audit section moved to archive)
- docs/ reorganized: evergreen docs only, point-in-time content archived with timestamps

### Fixed
- Dead links in PERFORMANCE.md
- Outdated references in CLAUDE.md and UI-KIT.md

---

## [0.28.1] - 2026-01-23

### Fixed
- Calendar toggle in Settings not working for calendar IDs containing `#` or `@` characters

---

## [0.28.0] - 2026-01-22

### Fixed
- Integration tests failing in CI (missing psycopg2-binary dependency)

---

## [0.25.0] - 2026-01-22

**Operational Polish** — Health checks, cleanup jobs, and centralized constants.

### Added
- External service health checks on `/ready` endpoint (database, Google Calendar status)
- TaskInstance cleanup job (removes completed instances older than 90 days)
- Centralized analytics constants (`HEATMAP_WEEKS`, `VELOCITY_DAYS`, etc.)

### Changed
- `/ready` endpoint returns structured response with service checks

---

## [0.24.0] - 2026-01-22

**Security Hardening** — CSRF protection and standardized error handling.

### Added
- CSRF protection with synchronizer token pattern
- Standardized error handler (`safeFetch()` wrapper)
- `IMPACT_COLORS` constant for centralized color palette

### Removed
- Unused CSP nonce generation

---

## [0.19.0] - 2026-01-22

**Production Documentation** — Deployment and security guides.

### Added
- Deployment documentation (`docs/DEPLOYMENT.md`)
- Security documentation (`docs/SECURITY.md`)

---

## [0.18.0] - 2026-01-22

**Observability** — Production-grade logging, metrics, and error tracking.

### Added
- JSON structured logging with request ID context
- Request ID middleware for distributed tracing
- Prometheus metrics endpoint (`/metrics`)
- Optional Sentry integration for error tracking

---

## [0.17.0] - 2026-01-22

**Testing Infrastructure** — PostgreSQL parity and expanded contract tests.

### Added
- PostgreSQL test container for integration tests
- Pytest markers (`@pytest.mark.unit`, `@pytest.mark.integration`)
- Expanded JavaScript module contract tests

---

## [0.16.0] - 2026-01-22

**Legacy Cleanup** — Removed backwards-compatibility code before v1.0.

### Removed
- Legacy `/api/*` routes (only versioned `/api/v1/*` remain)
- PBKDF2 v1 iterations (100k) — only 600k supported now
- Encryption version tracking field

---

## [0.15.0] - 2026-01-22

**Architecture Cleanup** — Business logic extraction and API versioning.

### Added
- Centralized constants (`app/constants.py`)
- Task sorting and grouping services
- API versioning with `/api/v1/*` routes

### Changed
- Extracted business logic from `pages.py` to dedicated services

| Metric | Before | After |
|--------|--------|-------|
| pages.py lines | 999 | 754 |

---

## [0.14.0] - 2026-01-22

**Performance Optimization** — Query optimization and caching.

### Added
- CTE-based analytics queries (reduced from 26+ to ~10 queries)
- SQL-level task filtering (replaces Python filtering)
- Calendar event caching (5-minute TTL)
- Background instance materialization

| Metric | Before | After |
|--------|--------|-------|
| Analytics queries | 26+ | ~10 |
| Calendar API calls | Every request | 5-min cache |

---

## [0.13.0] - 2026-01-22

**Database Migrations** — Alembic integration for safe production deployments.

### Added
- Alembic migrations with async SQLAlchemy support
- Railway release command for automatic migrations
- Migration commands in justfile

### Changed
- Schema managed exclusively by migrations (removed `create_all()`)

---

## [0.12.0] - 2026-01-22

**Security Hardening** — WebAuthn improvements, rate limiting, and security headers.

### Added
- Database-backed WebAuthn challenge storage (multi-worker support)
- Rate limiting (10 req/min auth, 5 req/min encryption)
- Content Security Policy headers
- PBKDF2 iteration upgrade to 600k (OWASP 2024)

---

## [0.11.0] - 2025-01-22

**Production Foundation** — Health checks, indexes, and backup validation.

### Added
- `/ready` endpoint for load balancer health checks
- Database indexes for common query patterns
- Backup validation with Pydantic schemas

### Fixed
- Version synchronization across codebase

---

## [0.10.1] - 2026-01-21

### Fixed
- Wizard wordmark alignment and FOUC
- Light/dark mode background consistency

---

## [0.10.0] - 2026-01-21

**Mobile Adaptation** — Touch gestures, bottom sheets, and offline support.

### Added
- Service worker for offline caching
- Mobile tab layout (Tasks/Schedule)
- Bottom sheet component with swipe-to-dismiss
- Task swipe gestures (right to complete, left to delete)
- Long-press action sheet
- Haptic feedback engine
- Pull-to-refresh
- Network status indicators

---

## [0.9.6] - 2026-01-21

**Documentation Cleanup** — Consolidated scattered docs.

### Changed
- README now serves as documentation hub
- Moved 5 planning docs to `docs/archive/`

### Removed
- Legacy DESIGN.md (superseded by `docs/brand/*`)

---

## [0.9.5] - 2026-01-21

### Changed
- CSS refinements and improved hover states

---

## [0.9.4] - 2026-01-21

**Design System Infrastructure** — Token migration and accessibility.

### Added
- Icon sprite system
- 21 empty-state illustrations
- Skip-to-content link for accessibility
- ARIA labels on all interactive elements
- `prefers-reduced-motion` support

### Changed
- Migrated to semantic CSS tokens
- Full dark mode support
- Success states use purple (brand alignment)

---

## [0.9.3] - 2026-01-20

### Added
- 70+ stroke-based SVG UI icons
- Interactive icon reference tool

---

## [0.9.2] - 2026-01-20

**Brand System Complete** — Marketing assets, color system, UI kit, illustrations.

### Added
- Social media profile images and post templates
- Email headers and press kit assets
- Color reference tool with WCAG verification
- UI kit documentation and interactive reference
- 21 brand-consistent illustrations

---

## [0.9.1] - 2026-01-19

### Added
- Maskable icon SVG for Android adaptive icons
- PNG export tool for all icon sizes
- Apple touch icons (5 sizes)

---

## [0.9.0] - 2026-01-17

**Onboarding** — WhenWizard and landing page animation.

### Added
- WhenWizard 8-step onboarding flow
- Landing page task→calendar animation

---

## [0.8.13] - 2026-01-15

**Encryption Hotfixes** — Series of fixes for E2E encryption edge cases.

### Fixed
- Recurring task completion showing wrong state in dialog
- Passkey RPID mismatch on mobile browsers
- Analytics page decryption for recurring tasks and domains
- Double encryption prevention for pre-existing data
- Thoughts Cabinet plaintext display with encryption enabled
- Task list and domain name display with encryption enabled
- Encrypted data column limits (VARCHAR → TEXT)

---

## [0.8.4] - 2026-01-15

**Passkey Unlock** — WebAuthn PRF extension for encryption unlock.

### Added
- Passkey registration in Settings
- Passkey unlock on page load (1Password, Touch ID, YubiKey)
- Lock status indicator with re-authenticate option

---

## [0.8.3] - 2026-01-15

**E2E Encryption Rewrite** — Global toggle model.

### Changed
- Single global `encryption_enabled` toggle (no per-record flags)
- Domain names now encrypted alongside task content
- Batch update endpoints for enable/disable operations

---

## [0.8.2] - 2026-01-13

### Fixed
- OAuth callback error handling

---

## [0.8.1] - 2026-01-13

### Fixed
- Database connection stability (`pool_pre_ping`, `pool_recycle`)
- Clean exception logging format

---

## [0.8.0] - 2026-01-11

**E2E Encryption & Polish** — Optional encryption, Todoist import preview, Plan My Day undo.

### Added
- Optional E2E encryption (AES-256-GCM, PBKDF2 key derivation)
- Todoist import preview dialog
- Plan My Day undo with toast
- Code provenance verification (build hashes)
- Cancel button in task dialogs

---

## [0.7.0] - 2026-01-11

**Task Completion Features** — Analytics dashboard, visual aging, backup/restore.

### Added
- Backup & restore (JSON export/import)
- Completed task visibility with configurable retention
- Visual aging for completed tasks
- Analytics dashboard with ApexCharts
- Todoist completed task import

### Changed
- Migrated to Todoist API v1

---

## [0.6.0] - 2026-01-06

**Thought Cabinet** — Quick capture page matching Tasks aesthetic.

### Added
- Thought Cabinet page with capture input
- Promote thought to task action
- Delete with undo toast

### Fixed
- Anytime tasks shifting calendar layout
- Settings page redesign
- FAB button redesign
- Task completion support

---

## [0.5.0] - 2026-01-05

**UI Polish** — Grid-based task layout and improved visual hierarchy.

### Added
- Grid-based task layout with fixed-width columns
- Hour banding and major hour lines on calendar
- Time axis gutter

### Changed
- Task row hover uses neutral tint (purple reserved for selection)
- Day separator with centered pill
- Refined border hierarchy

### Fixed
- Calendar cell width with long task text
- Drag rescheduling task disappearance

---

## [0.4.0] - 2026-01-04

**Native Task Management** — Create, edit, delete tasks directly.

### Added
- Task dialog with full editing
- Recurrence picker for repeating tasks
- Drag-to-trash deletion
- Domain management
- Todoist import
- Task instance tracking

### Changed
- Energy filter shows visible/total counts
- Parent task deletion cascades to subtasks

---

## [0.3.0] - 2025-12-30

**Plan Feature** — Auto-schedule tasks into selected time ranges.

### Added
- Click-and-drag time range selection
- Smart scheduling algorithm
- PWA support (fullscreen, safe area)
- Mobile compact mode

### Changed
- Tasks without `@clarity` labels hidden
- Energy filter hides non-matching tasks

---

## [0.2.0] - 2025-12-28

**Drag-and-Drop Scheduling** — Visual task scheduling.

### Added
- Drag tasks from list to calendar
- 15-minute interval snapping
- Duration-based event height
- Overlap detection (max 3 columns)
- Calendar carousel (15 days)

---

## [0.1.0] - 2025-12-27

**Initial Release** — Core functionality.

### Added
- OAuth2 authentication (Todoist, Google Calendar)
- Task fetching and display
- Google Calendar integration
- Energy-based task filtering
- Task grouping by project
- Settings page for calendar selection

---

[unreleased]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.29.0...HEAD
[0.29.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.28.1...v0.29.0
[0.28.1]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.28.0...v0.28.1
[0.28.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.25.0...v0.28.0
[0.25.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.19.0...v0.24.0
[0.19.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.10.1...v0.11.0
[0.10.1]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.9.6...v0.10.0
[0.9.6]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.9.5...v0.9.6
[0.9.5]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.9.4...v0.9.5
[0.9.4]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.9.3...v0.9.4
[0.9.3]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.8.13...v0.9.0
[0.8.13]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.8.4...v0.8.13
[0.8.4]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.8.3...v0.8.4
[0.8.3]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/aleksandr-bogdanov/whendoist/releases/tag/v0.1.0
