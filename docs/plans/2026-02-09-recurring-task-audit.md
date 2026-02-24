# Recurring Task System — v1.0 Gate Audit

> Opus investigation, February 9 2026. Pre-v1.0 edge case audit.

---

## Scope

Files audited: `recurrence_service.py`, `recurring.py`, `instances.py`, `tasks.py`, `models.py`, `task_service.py`, `constants.py`, `database.py`, `pages.py`, `task_grouping.py`, `recurrence-picker.js`, all recurrence-related tests.

## Findings

| # | Risk | Severity | Fixed? |
|---|------|----------|--------|
| 1 | **No lock on concurrent materialization** — `IntegrityError` unhandled, double-click causes 500 | HIGH | **Yes — PR #80 (v0.42.8)** |
| 2 | **Disabling recurrence orphans all instances** — pending instances left in DB/calendar | HIGH | **Yes — PR #80 (v0.42.8)** |
| 3 | `list_instances` endpoint missing timezone parameter | MEDIUM | Deferred |
| 4 | Monthly task on 31st silently skips short months (dateutil behavior) | MEDIUM | Deferred |
| 5 | No server-side validation of `recurrence_rule` JSON | MEDIUM | Deferred |
| 6 | Timezone inconsistency — `scheduled_datetime` stored as UTC but `scheduled_time` has no TZ context | MEDIUM | Deferred |
| 7 | `regenerate_instances` doesn't clean up completed instances for changed rules | LOW-MED | Deferred |
| 8 | No instance count limit / horizon guard for old tasks with far-past `recurrence_start` | LOW | Deferred |
| 9 | Skip→reopen→re-skip state machine unconstrained (toggle skipped → completed, not pending) | LOW | Deferred |
| 10 | `cleanup_old_instances` uses server time (`date.today()`) instead of `get_user_today()` | LOW | Deferred |
| 11 | `batch_complete_instances` doesn't validate task ownership upfront (safe due to `user_id` filter) | LOW | Deferred |

## Fix Details (PR #80)

### IntegrityError handling
- `get_or_create_instance_for_date` catches `IntegrityError` and re-queries the existing instance
- `materialize_instances` wraps per-instance flush in try/except, skips duplicates gracefully

### Orphan cleanup
- `update_task` detects `is_recurring` transitioning from True→False
- Deletes all pending instances for that task (preserves completed/skipped)

## Deferred Items — Post-v1.0

**#3 Timezone in list_instances:** Consistency fix. `RecurrenceService(db, user.id)` should receive timezone like batch endpoints do. Low risk since current method doesn't use timezone internally.

**#4 Month-end behavior:** `dateutil.rrule` with `bymonthday=31` skips months with fewer days. Consider adding a UI tooltip in recurrence-picker when `day_of_month > 28`.

**#5 Rule validation:** Accept any dict as `recurrence_rule`. Malformed input (e.g. `freq: "bogus"`, `interval: 0`) silently produces empty occurrence lists. Add Pydantic validation on `TaskCreate`/`TaskUpdate`.

**#6 Timezone design issue:** `scheduled_time` is a bare Time column with no TZ. Materialized as UTC (`datetime.combine(date, time, tzinfo=UTC)`) — 5 hours off for EST user. Fundamental design issue requiring migration.

**#9 State machine:** Toggling a skipped instance marks it completed (not pending). May surprise users. Consider enforcing skip→pending→completed transitions.
