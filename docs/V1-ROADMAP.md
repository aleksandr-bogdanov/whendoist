# v1.0 Roadmap

> Path to production-ready v1.0 release.
>
> Created: February 2026 | Last updated: February 8, 2026 (v0.42.1)

---

## Philosophy

v1.0 represents **production maturity**, not feature completeness.

**Criteria for v1.0:**
- Core workflows are stable and tested in production
- Performance is optimized and monitored
- Error tracking and observability are production-grade
- Security is hardened (auth, encryption, rate limiting)
- Mobile experience is viable (doesn't have to be perfect)

**Not required for v1.0:**
- Feature parity with competitors
- Advanced AI/ML scheduling
- Team/collaboration features
- Native mobile apps

---

## Current State (v0.42.1)

### Production-Ready Components

**Core Functionality:**
- Task management with domains, impact, mode (autopilot/normal/brainstorm), duration
- Recurring tasks with flexible patterns and instance materialization
- Google Calendar bidirectional sync
- Visual scheduling (drag-and-drop)
- Analytics dashboard (heatmap, velocity, domain breakdown)
- Thought Cabinet (inbox -> task promotion)

**User Experience:**
- 7-step onboarding wizard (energy, calendar, Todoist import, domains)
- One-click data export + restore (Settings > Backup)
- 11 keyboard shortcuts with help modal, footer hint, tooltips
- Toast notification system (typed, queued, deduplicated)
- Centralized error handling with typed errors and recovery actions
- Demo account with realistic seed data

**Security:**
- Google OAuth authentication
- Passkey (WebAuthn) support
- Optional end-to-end encryption (AES-256-GCM)
- Rate limiting on sensitive endpoints
- CSRF protection (synchronizer token, auto-injected by safeFetch)
- Security headers (CSP, HSTS, etc.)

**Infrastructure:**
- PostgreSQL with async SQLAlchemy
- Background materialization (hourly recurring task instances)
- Database migrations (Alembic)
- Health checks (`/health`, `/ready`)
- Prometheus metrics (`/metrics`)
- Sentry error tracking (active since v0.40.0)
- Graceful shutdown, statement timeouts (30s)

**Performance:**
- Query optimization (CTE, batch queries, N+1 fixes)
- Calendar event caching (5min TTL)
- Connection pool tuning (2+3 for single-worker deployment)
- Background instance materialization (non-blocking startup)

**Frontend Error Handling (v0.40.1-v0.42.0):**
- `safeFetch()` — all application fetch() calls migrated (zero raw fetch remaining)
- Typed error classes: NetworkError, ValidationError, AuthError, CSRFError, RateLimitError, ServerError
- `handleError()` with recovery actions, Sentry tags, user-friendly messages
- Network status detection (online/offline events)
- Global error boundary (unhandled rejections + uncaught exceptions)

**Keyboard Shortcuts (v0.41.0-v0.42.1):**
- Declarative shortcut registry with context-aware handlers
- Task navigation: j/k (next/prev), c (complete), e/Enter (edit), x (delete)
- Global: ? (help), q (quick add), n (new task), Esc (close/deselect)
- Help modal, footer hint bar, tooltips, settings panel integration
- Triple-layered discoverability (footer + one-time toast + tooltips)

---

## Remaining Gaps to v1.0

### Important (Should Have)

1. **Mobile UX Polish**
   - Current: Tabs, basic responsiveness, swipe gestures, bottom sheets
   - Need: Proactive gap surfacing, task-initiated scheduling
   - See [PRODUCT-VISION.md](PRODUCT-VISION.md) mobile insights section

2. **Mobile App (PWA)**
   - Current: Responsive web with service worker
   - Need: Installable PWA with offline support
   - Goal: Home screen icon, works offline for viewing

3. **Undo/Redo**
   - Current: Destructive actions are permanent (delete has toast notification)
   - Need: Undo for delete, reschedule, complete
   - Reduces anxiety around mistakes

4. **Bulk Operations**
   - Current: One-at-a-time editing
   - Need: Multi-select, batch reschedule/complete/delete
   - Efficiency for managing many tasks

### Nice to Have (Post-v1.0)

5. **Todoist Sync (Live)**
   - Current: One-time import
   - Future: Bidirectional sync

6. **AI Suggestions**
   - Current: Manual "Plan My Day"
   - Future: Pattern learning, not auto-scheduling

7. **Team/Sharing**
   - Current: Single-user only
   - Future: Share tasks, assign to others

8. **Time Tracking**
   - Current: Duration estimates only
   - Future: Actual time spent, compare estimate vs actual

---

## Resolved Items

These were previously listed as gaps but have been fully implemented:

| Item | Resolved In | Details |
|------|-------------|---------|
| User Onboarding | v0.9.0 | 7-step wizard with OAuth, mobile support, state persistence |
| Error Recovery UX | v0.40.1-v0.42.0 | safeFetch + handleError + typed errors + toast redesign |
| Data Export | v0.7.0 | One-click JSON export/import in Settings |
| Keyboard Shortcuts | v0.41.0-v0.42.1 | 11 shortcuts, help modal, discoverability |
| Error handling consistency | v0.40.1-v0.42.0 | All fetch calls use safeFetch, standardized error responses |

---

## Mobile-First Improvements

See [PRODUCT-VISION.md](PRODUCT-VISION.md) for detailed mobile UX insights.

**Key Changes:**

1. **Surface Free Time Proactively**
   - Show "2h 30m free until 14:00" banner
   - One-tap "Plan This Gap" action

2. **Task-Initiated Scheduling**
   - From task detail: "When can you do this?"
   - Show available slots in context

3. **Decision Interface**
   - "What's your situation?" home screen
   - Select time + energy -> task suggestion

---

## Performance Profiling with Honeycomb (Post-v1.0)

**Goal:** Deep performance optimization with distributed tracing.

**What to Profile:**
- Dashboard load (target: < 500ms p95)
- Analytics page (target: < 1s p95)
- Task creation (target: < 200ms p95)
- Background materialization and GCal sync

**Integration:** OpenTelemetry instrumentation with custom spans for critical paths.

See [Performance Guide](PERFORMANCE.md) for current optimizations.

---

## Release Plan

### v0.x -> v1.0 Milestones

| Milestone | Focus | Status |
|-----------|-------|--------|
| Production Hardening | Pool tuning, timeouts, Sentry, graceful shutdown | Done (v0.40.0) |
| Error Recovery | safeFetch, typed errors, toast redesign | Done (v0.40.1-v0.42.0) |
| Keyboard Shortcuts | Navigation, actions, discoverability | Done (v0.41.0-v0.42.1) |
| Mobile UX Overhaul | Proactive gap surfacing, task-initiated scheduling | Planned |
| PWA + Offline | Installable app, offline viewing | Planned |
| Polish & Testing | Bug fixes, edge cases, stress testing | Planned |
| **v1.0 Launch** | Production-ready release | Target |

### Post-v1.0

**v1.1-v1.5: Stability & Refinement**
- Undo/Redo
- Bulk operations
- Scheduled export automation
- Honeycomb performance profiling

**v2.0: Intelligent Features**
- Pattern learning
- Smart scheduling (AI-assisted, user-controlled)
- Advanced analytics (time tracking, estimation accuracy)

**v3.0: Collaboration**
- Team workspaces
- Shared tasks
- Assignment and delegation

---

## Success Metrics for v1.0

| Metric | Target |
|--------|--------|
| **Performance** | Dashboard load < 500ms (p95) |
| **Reliability** | 99.9% uptime (measured by `/ready` checks) |
| **Errors** | < 10 errors/day in Sentry (excluding 404s) |
| **Mobile UX** | 80%+ of core workflows usable on mobile |
| **Onboarding** | 90%+ of new users complete first task |

---

## Not in Scope for v1.0

- Native iOS/Android apps
- Team/collaboration features
- Advanced AI scheduling (pattern learning)
- Integrations beyond Google Calendar
- Time tracking (actual vs estimated)
- Premium/paid tiers

---

## Technical Debt to Address

1. **Frontend state management** — Currently scattered across modules; consider lightweight state lib
2. **Test coverage** — Add integration tests for critical workflows
3. **Documentation** — Complete API docs, deployment runbook
4. **Logging levels** — Review all INFO/DEBUG usage, reduce noise

---

## Related Documentation

- [Product Vision](PRODUCT-VISION.md) — Strategic positioning, mobile UX insights
- [Performance Guide](PERFORMANCE.md) — Current optimizations, monitoring
- [Deployment Guide](DEPLOYMENT.md) — Production setup, Sentry integration
- [Security Guide](SECURITY.md) — Authentication, encryption, rate limiting
- [Error Handling](ERROR-HANDLING.md) — safeFetch, handleError, typed errors
- [Toast System](TOAST-SYSTEM.md) — Typed notifications with queuing
- [GCal Sync](GCAL-SYNC.md) — Google Calendar sync architecture
