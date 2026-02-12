# Post-v1.0 Backlog

> Deferred work and future roadmap. Compiled from v1.0 gate audits (Feb 9, 2026) and V1 roadmap planning.
>
> See also: [V1 Roadmap (archived)](archive/2026-02-09-v1-roadmap.md)

---

## Remaining Pre-v1.0 Items

These should still be addressed before v1.0:

- **Gesture discovery redesign** — Current swipe hint animation works but needs polished, branded onboarding flow
- **Settings/gear redesign** — Hidden on mobile since v0.42.x; needs a mobile-friendly settings surface

---

## v1.1–v1.5: Stability & Refinement

### Product Features

- **Undo/Redo** — Delete has toast undo; full undo for complete/reschedule/edit is next
- **Bulk operations** — Multi-select, batch reschedule/complete/delete
- **Offline write queue** — Full IndexedDB queue (~14 days work, high risk). Warn-only for v1.0. Revisit when JS test infra exists
- **Honeycomb profiling** — OpenTelemetry distributed tracing for performance deep dives
- **Encryption passphrase change** — No way to change passphrase without disable/re-enable (loses passkeys). Needs re-encryption flow
- **Scheduled export automation** — Automated periodic backups
- **PWA + Offline** — Installable app, offline viewing, home screen icon

### Recurring Tasks

- **Timezone on scheduled_time** — `scheduled_time` stored as bare Time (no TZ); materialized as UTC. A user in EST with a 9 AM task gets instances at 9 AM UTC = 4 AM EST. Needs user timezone preference + TZ-aware materialization
- **recurrence_rule validation** — Any dict accepted; malformed input silently produces zero instances. UI sends valid JSON so risk is API-only
- **Monthly 31st skips short months** — `dateutil.rrule` with `bymonthday=31` skips Feb/Apr/Jun/Sep/Nov. Needs UI tooltip when `day_of_month > 28`
- **regenerate_instances cleanup** — Changing a recurrence rule doesn't clean up completed/skipped instances from the old rule
- **Skip/toggle state machine** — Toggling a skipped instance marks it completed (not pending). May surprise users expecting skip → pending → completed
- **list_instances timezone** — Endpoint missing timezone parameter (consistency issue, not causing wrong behavior)
- **cleanup_old_instances uses server time** — Uses `date.today()` instead of `get_user_today()`. Only affects cleanup timing

### GCal Sync

- **Rapid toggle drops second sync** — Enable→Disable→Enable quickly: second sync skips because lock is held by first. Workaround: wait 1-2 min, then Full Re-sync
- **Fire-and-forget bypasses per-user lock** — `_fire_and_forget_bulk_sync` in tasks.py doesn't acquire the sync lock
- **Bulk sync timeout** — 1000+ tasks with rate limiting can exceed timeouts. Consider `asyncio.wait_for()` with 15-min ceiling
- **Orphan event scenarios** — Fire-and-forget sync→unsync race; disable without `delete_events` leaves calendar events
- **Background bulk_sync has no timeout** — Unlike materialization loop (5-min via `asyncio.wait_for`), background GCal sync can run indefinitely

### Security & Hardening

- **Offline checks on secondary mutation paths** — 11 of 18 JS mutation paths still lack `isNetworkOnline()` checks. Primary 7 paths are protected
- **Analytics aging stats unbounded** — `_get_aging_stats()` loads ALL completed tasks with no date range. 10k+ tasks = slow + memory spike
- **Passkey deletion rate limit** — `DELETE /api/v1/passkeys/{id}` has no rate limit
- **Encryption timing oracle** — Client-side passphrase verification uses non-constant-time string comparison. Theoretical risk only
- **Instance cleanup audit trail** — `cleanup_old_instances` permanently deletes 90+ day instances with no log
- **Nonce-based CSP** — `script-src` still uses `'unsafe-inline'` (~45 `onclick` handlers). Fix: refactor all inline handlers to `addEventListener`, generate per-request nonce

### Infrastructure (Trigger-Based)

- **Redis rate limiting** — Required before `replicas > 1` on Railway (in-memory counters are per-process)
- **Redis calendar cache** — Required before multi-worker deployment
- **JS test infrastructure** — Prerequisite for offline queue, frontend complexity, and encryption testing

---

## v2.0: Intelligent Features

- **Pattern learning** — Suggest scheduling based on usage history ("You usually do email at 9am")
- **Smart scheduling** — AI-assisted, user-controlled (not auto-scheduling)
- **Advanced analytics** — Time tracking, estimation accuracy (actual vs estimated)
- **Todoist live sync** — Bidirectional sync (currently one-time import only)

---

## v3.0: Collaboration

- **Team workspaces**
- **Shared tasks**
- **Assignment and delegation**

---

## Not in Scope (Indefinitely Deferred)

- Native iOS/Android apps
- Integrations beyond Google Calendar (Outlook, Apple Calendar)
- Recurring task templates library
- Premium/paid tiers

---

*Source: [V1 Roadmap](archive/2026-02-09-v1-roadmap.md) and v1.0 gate audit reports (`docs/archive/2026-02-09-*.md`)*
