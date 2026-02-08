# v1.0 Roadmap

> Strategic plan for reaching production-ready v1.0 release.
>
> Created: February 2026
> Target: v1.0 launch when core features are stable and battle-tested

---

## Philosophy

v1.0 represents **production maturity**, not feature completeness.

**Criteria for v1.0:**
- ✅ Core workflows are stable and tested in production
- ✅ Performance is optimized and monitored
- ✅ Error tracking and observability are production-grade
- ✅ Security is hardened (auth, encryption, rate limiting)
- ✅ Mobile experience is viable (doesn't have to be perfect)

**Not required for v1.0:**
- ❌ Feature parity with competitors
- ❌ Advanced AI/ML scheduling
- ❌ Team/collaboration features
- ❌ Native mobile apps

---

## Current State (v0.40.0)

### ✅ Production-Ready Components

**Core Functionality:**
- Task management with domains, impact, clarity, duration
- Recurring tasks with flexible patterns
- Google Calendar bidirectional sync
- Visual scheduling (drag-and-drop)
- Analytics dashboard (heatmap, velocity, domain breakdown)
- Thought Cabinet (inbox → task promotion)

**Security:**
- Google OAuth authentication
- Passkey (WebAuthn) support
- Optional end-to-end encryption
- Rate limiting on sensitive endpoints
- CSRF protection
- Security headers (CSP, HSTS, etc.)

**Infrastructure:**
- PostgreSQL with async SQLAlchemy
- Background materialization (hourly recurring task instances)
- Database migrations (Alembic)
- Health checks (`/health`, `/ready`)
- Prometheus metrics (`/metrics`)
- **Sentry error tracking** (active since v0.40.0)

**Performance:**
- Query optimization (CTE, batch queries, N+1 fixes)
- Calendar event caching (5min TTL)
- Background instance materialization
- Connection pool tuning (2+3 for single-worker deployment)
- Statement timeouts (30s)
- Graceful shutdown

---

## Gaps to v1.0

### 🔴 Critical (Blocking v1.0)

1. **Mobile UX Polish**
   - Current: Tabs, basic responsiveness
   - Need: Proactive gap surfacing, task-initiated scheduling
   - See [PRODUCT-VISION.md](PRODUCT-VISION.md) mobile insights section

2. **User Onboarding**
   - Current: No guided setup
   - Need: First-run wizard, sample tasks, feature discovery
   - Goal: 0→productive in < 5 minutes

3. **Error Recovery UX**
   - Current: Generic error pages, some inconsistent error handling
   - Need: User-friendly error messages, retry mechanisms
   - Sentry captures backend errors, but frontend needs polish

4. **Data Export**
   - Current: Manual backup endpoint exists
   - Need: Scheduled exports, one-click download
   - Users should be able to leave with their data

### 🟡 Important (Should Have for v1.0)

5. **Mobile App (PWA)**
   - Current: Responsive web only
   - Need: Installable PWA with offline support
   - Goal: Home screen icon, works offline for viewing

6. **Keyboard Shortcuts**
   - Current: Limited (Ctrl+K for quick add)
   - Need: Full shortcut reference, customizable bindings
   - Power users expect this

7. **Undo/Redo**
   - Current: Destructive actions are permanent
   - Need: Undo for delete, reschedule, complete
   - Reduces anxiety around mistakes

8. **Bulk Operations**
   - Current: One-at-a-time editing
   - Need: Multi-select, batch reschedule/complete/delete
   - Efficiency for managing many tasks

### 🟢 Nice to Have (Post-v1.0)

9. **Todoist Sync (Live)**
   - Current: One-time import
   - Future: Bidirectional sync, keep both in sync
   - Allows gradual migration

10. **AI Suggestions**
    - Current: Manual "Plan My Day"
    - Future: "You usually do email at 9am, schedule it?"
    - Pattern learning, not auto-scheduling

11. **Team/Sharing**
    - Current: Single-user only
    - Future: Share tasks, assign to others
    - Big feature, needs careful design

12. **Time Tracking**
    - Current: Duration estimates only
    - Future: Actual time spent, compare estimate vs actual
    - Helps improve estimation over time

---

## Performance Profiling with Honeycomb (v1.0+)

**Goal:** Optimize for the sake of optimization and gain Honeycomb experience.

**When:** After v1.0 release, when core features are stable.

**Why Honeycomb:**
- High-cardinality queries (slice by any dimension)
- Distributed tracing (see exactly where time is spent)
- BubbleUp analysis (find what's different about slow requests)
- Better performance insights than Sentry's basic APM

**What to Profile:**

### 1. Critical User Journeys

```
Dashboard Load
├─ Auth check
├─ Task query (domain filtering, subtasks)
├─ Calendar events (cache hit/miss)
├─ Instance materialization status
└─ Render time
```

Target: < 500ms p95

```
Analytics Page
├─ Comprehensive stats query
├─ Heatmap data
├─ Velocity calculations
├─ Recurring task stats
└─ Chart rendering
```

Target: < 1s p95

```
Task Creation
├─ Validation
├─ Database insert
├─ Encryption (if enabled)
├─ GCal sync (if enabled)
└─ Response
```

Target: < 200ms p95

### 2. Background Operations

```
Materialization Cycle
├─ Per-user processing time
├─ Database session overhead
├─ Recurrence calculation complexity
└─ GCal sync latency
```

Goal: Understand per-user cost, optimize outliers

```
GCal Sync
├─ Token refresh timing
├─ Calendar list fetching
├─ Event diff calculation
├─ Batch API calls
└─ Rate limit impact
```

Goal: Reduce sync time, minimize API calls

### 3. Database Query Analysis

**Questions Honeycomb Can Answer:**
- Which queries are slowest at p99?
- Do queries slow down with more tasks/domains?
- Are indexes being used correctly?
- Which users have pathological data patterns?

**Custom Events to Send:**

```python
# Task query event
honeycomb.send({
    "operation": "task_query",
    "user_id": user.id,
    "domain_count": len(domains),
    "task_count": len(tasks),
    "has_encryption": user.encryption_enabled,
    "duration_ms": elapsed,
    "cache_hit": False,
})

# Analytics page event
honeycomb.send({
    "operation": "analytics_stats",
    "user_id": user.id,
    "date_range_days": (end_date - start_date).days,
    "completion_count": stats["completions"],
    "query_count": query_counter.total,
    "duration_ms": elapsed,
})
```

### 4. Integration Steps

**Phase 1: Basic Instrumentation**
```bash
pip install opentelemetry-api opentelemetry-sdk
pip install opentelemetry-instrumentation-fastapi
pip install opentelemetry-instrumentation-sqlalchemy
```

**Phase 2: Custom Spans**
```python
from opentelemetry import trace

tracer = trace.get_tracer(__name__)

@router.get("/analytics")
async def analytics_page(user: User = Depends(require_user)):
    with tracer.start_as_current_span("analytics.page_load") as span:
        span.set_attribute("user.id", user.id)

        with tracer.start_as_current_span("analytics.fetch_stats"):
            stats = await analytics_service.get_comprehensive_stats()

        with tracer.start_as_current_span("analytics.render"):
            return templates.TemplateResponse(...)
```

**Phase 3: Query Analysis**
- Add custom events for slow queries (> 100ms)
- Track query complexity (JOIN count, result size)
- Correlate performance with user data patterns

**Phase 4: BubbleUp Exploration**
Use Honeycomb's BubbleUp to answer:
- "Why are some dashboard loads slow?"
- "What's different about users with slow analytics?"
- "Which calendar configurations cause sync delays?"

### 5. Optimization Targets

Based on Honeycomb insights, optimize:

| Area | Current | Target (p95) | Strategy |
|------|---------|--------------|----------|
| Dashboard load | ~300ms | < 200ms | Cache domain counts, optimize JOIN |
| Analytics load | ~800ms | < 500ms | Materialized view for stats |
| Task creation | ~150ms | < 100ms | Async GCal sync |
| Bulk operations | N/A | < 1s for 50 tasks | Batch DB commits |

### 6. Cost Consideration

**Honeycomb Pricing (as of 2026):**
- Free: 20M events/month (trial only, 30 days)
- Paid: Starts ~$200/month for 100M events

**Strategy:**
- Use free trial for intensive profiling sprint
- Instrument selectively (critical paths only)
- Downsample events (10% of requests, 100% of errors)
- After optimization sprint, can downgrade or remove

**ROI Calculation:**
If optimization reduces server costs (e.g., smaller Railway plan) or improves conversion (faster = better UX), the $200/month pays for itself.

---

## Mobile-First Improvements (v1.0)

See [PRODUCT-VISION.md](PRODUCT-VISION.md) for detailed mobile UX insights.

**Key Changes:**

1. **Surface Free Time Proactively**
   - Show "2h 30m free until 14:00" banner
   - One-tap "Plan This Gap" action

2. **Task-Initiated Scheduling**
   - From task detail: "When can you do this?"
   - Show available slots in context
   - Schedule in one tap

3. **Anti-Calendar View**
   - Show gaps, not events
   - Visual timeline of free time
   - Tap gap → plan it

4. **Decision Interface**
   - "What's your situation?" home screen
   - Select time + energy → task suggestion
   - Optimize for speed-to-action

---

## Release Plan

### v0.x → v1.0 Milestones

| Milestone | Version | Focus | Target |
|-----------|---------|-------|--------|
| **Honeycomb Profiling** | v0.41.0 | Performance deep dive with Honeycomb | Mar 2026 |
| **Mobile UX Overhaul** | v0.45.0 | Implement mobile-first improvements | Apr 2026 |
| **Onboarding Wizard** | v0.50.0 | First-run experience | May 2026 |
| **PWA + Offline** | v0.60.0 | Installable app, offline viewing | Jun 2026 |
| **Polish & Testing** | v0.70-0.99 | Bug fixes, edge cases, stress testing | Jul 2026 |
| **v1.0 Launch** | v1.0.0 | Production-ready release | Aug 2026 |

### Post-v1.0 Roadmap

**v1.1 - v1.5: Stability & Refinement**
- Keyboard shortcuts
- Undo/Redo
- Bulk operations
- Export automation

**v2.0: Intelligent Features**
- Pattern learning (suggest based on history)
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
| **Retention** | 70%+ of users return within 7 days |

---

## Not in Scope for v1.0

These are explicitly **deferred to post-v1.0:**

- ❌ Native iOS/Android apps
- ❌ Team/collaboration features
- ❌ Advanced AI scheduling (pattern learning)
- ❌ Integrations beyond Google Calendar (Outlook, Apple Calendar, etc.)
- ❌ Time tracking (actual vs estimated)
- ❌ Recurring task templates library
- ❌ Premium/paid tiers

**Rationale:** v1.0 is about **nailing the core solo user experience**. Expansion comes after validation.

---

## Technical Debt to Address Before v1.0

1. **Frontend state management** — Currently scattered; consider lightweight state lib
2. **Test coverage** — Add integration tests for critical workflows
3. **Error handling consistency** — Standardize error responses across API
4. **Documentation** — Complete API docs, deployment runbook
5. **Logging levels** — Review all INFO/DEBUG usage, reduce noise

---

## Related Documentation

- [Product Vision](PRODUCT-VISION.md) — Strategic positioning, mobile UX insights
- [Performance Guide](PERFORMANCE.md) — Current optimizations, monitoring
- [Deployment Guide](DEPLOYMENT.md) — Production setup, Sentry integration
- [Security Guide](SECURITY.md) — Authentication, encryption, rate limiting

---

*Last updated: February 2026*
