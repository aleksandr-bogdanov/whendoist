# Post-v1.0 Backlog

> Features and improvements deferred past v1.0. One line per item — plans linked where they exist.
>
> See also: [Competitive Gap Analysis](COMPETITIVE-GAP-ANALYSIS.md) — full feature comparison vs. Todoist, TickTick, Things 3, Fantastical, Any.do, Google Tasks, Motion, Reclaim.ai, Sunsama.

---

## Multi-Select Completion — [plan](plans/2026-03-02-multi-select-batch-operations.md)

Core multi-select shipped (v0.55.90–v0.55.96). Remaining work:

- **Instance support in batch ops** — FAB, batch edit, and batch drag skip instances (deferred comment in code)
- **Batch drag overlay for instances** — Verify overlay renders when instance is the drag anchor
- **⌘+A feedback** — No visual confirmation when select-all fires; add count pulse or toast
- **Batch edit "mixed values"** — Show "Mixed" instead of "—" when selected tasks have differing values
- **Popover viewport awareness** — Batch edit popover clips on short viewports (`side="top"` without flip)
- **Shift+Click range selection** — Select contiguous range in task list and calendar
- **Lasso / drag-select on calendar** — Click+drag on empty space to draw selection rectangle
- **Command palette batch expansion** — Expand existing `palette-batch-actions.tsx` with Unschedule, Edit, Reschedule

---

## v1.1–v1.5: Stability & Refinement

### Product

- **Task search** — Full-text search across tasks by keyword — [investigation](plans/2026-03-02-task-search-investigation.md)
- **Undo/Redo** — Full undo for complete, reschedule, and edit (delete already has toast undo)
- ~~**Bulk operations**~~ — ✅ Shipped in v0.55.90–v0.55.96 — [plan](plans/2026-03-02-multi-select-batch-operations.md)
- **Task activity log** — Per-task event history (created, completed, rescheduled, etc.) — [investigation](plans/2026-03-02-activity-log-investigation.md)
- **Offline write queue** — IndexedDB mutation queue with sync-on-reconnect
- **Encryption passphrase change** — Re-encrypt without disable/re-enable cycle
- **Scheduled export automation** — Automated periodic backups beyond manual snapshots
- **PWA install** — Home screen icon, offline viewing, installable app shell
- **Multi-timezone calendar** — Secondary timezone labels on the time grid for remote workers — [investigation](plans/2026-03-02-multi-timezone-investigation.md)

### Recurring Tasks

- **Timezone-aware scheduling** — `scheduled_time` is bare Time (no TZ), always interpreted as UTC
- **Recurrence start vs scheduled date** — Clarify precedence when both are set
- **Monthly 31st skips short months** — Needs UI warning for months with <31 days
- **Instance cleanup on rule change** — Old instances aren't cleaned up when rule changes
- **Skip → toggle gives completed** — Toggling a skipped instance should return to pending

### GCal Sync

- **Rapid toggle drops sync** — Enable→Disable→Enable quickly loses sync due to lock contention
- **Bulk sync timeout** — 1000+ tasks can exceed timeouts
- **Orphan calendar events** — Disable without `delete_events` leaves orphans
- **Fire-and-forget skips lock** — `_fire_and_forget_bulk_sync` doesn't acquire per-user lock

### Security

- **Offline checks on 11 mutation paths** — 11 of 18 mutations lack `isNetworkOnline()` guards
- **Analytics aging stats unbounded** — `_get_aging_stats()` loads all completed tasks with no date cap
- **Passkey deletion rate limit** — `DELETE /api/v1/passkeys/{id}` has no rate limit
- **Instance cleanup has no audit trail** — `cleanup_old_instances` permanently deletes with no log

### Infrastructure (Trigger-Based)

- **Redis rate limiting** — Required before `replicas > 1` (in-memory counters are per-process)
- **Redis calendar cache** — Required before multi-worker deployment
- **JS test infrastructure** — Prerequisite for offline queue, encryption testing, frontend complexity
- **Honeycomb/OpenTelemetry** — Distributed tracing for performance profiling

---

## v2.0: Integrations & Intelligence

- **Public API & API keys** — API key auth, rate limiting, OpenAPI docs — [investigation](plans/2026-03-02-integration-ecosystem-investigation.md)
- **Webhooks** — Event-driven notifications on task mutations (requires API keys first)
- **Zapier/Make.com integration** — Triggers (task completed) and actions (create task)
- **Calendar subscription export** — iCal/.ics feed for subscribing in Apple Calendar, Outlook, etc. — [investigation](plans/2026-03-02-calendar-feed-investigation.md)
- **Todoist live sync** — Bidirectional sync (currently one-time import only)
- **Pattern learning** — Suggest scheduling from usage history
- **Smart scheduling** — AI-assisted, user-controlled (not auto-scheduling)
- **Advanced analytics** — Time tracking, estimation accuracy (actual vs estimated)

---

## v3.0: Collaboration

- **Team workspaces** — Shared task domains with role-based access
- **Task assignment** — Delegation and ownership transfer
- **Shared views** — Collaborative dashboards and calendars

---

## Not in Scope

- Native iOS/Android apps
- Recurring task templates library
- Premium/paid tiers

---

*Source: v1.0 gate audits (`docs/plans/2026-02-09-*.md`), ongoing investigations*
