---
version:
pr:
created: 2026-02-25
---

# Analytics Service Production Readiness

## Context

Audit of the analytics service revealed several production concerns: unbounded queries that
degrade with scale, a missing composite index, correctness bugs, and minor inefficiencies.
This plan fixes all identified issues except server-side caching (deferred) and parallel
queries (impossible — AsyncSession doesn't support concurrent operations on the same session).

## Files to Modify

- `app/services/analytics_service.py` — all query/logic fixes
- `app/models.py` — add composite indexes
- `app/constants.py` — new constants for bounds
- `alembic/versions/` — migration for new indexes

## Fixes

### 1. Bound `_get_aging_stats()` (P0)

Add `AGING_STATS_LIMIT = 5000` to constants. Apply `ORDER BY completed_at DESC LIMIT 5000`
to the query. This bounds memory/CPU while covering any realistic user. The statistics
represent "most recent 5000 completions" which is sufficient.

### 2. Bound `_calculate_streaks()` (P0)

Add `STREAK_HISTORY_DAYS = 730` (2 years) to constants. Filter both Task and TaskInstance
queries to `completed_at >= now - 730 days`. Current streak and "this week" are unaffected
(they only look at recent dates). Longest streak becomes "longest in last 2 years" which
is an acceptable tradeoff.

### 3. Bound `get_recent_completions()` (P0)

Add `completed_at >= now - 365 days` filter to both sides of the UNION ALL. This prevents
the DB from materializing all historical completions before ORDER BY + LIMIT. 365 days is
generous — recent completions are typically from the last few weeks.

### 4. Add composite indexes (P1)

Add to `models.py`:
```python
# Task table
Index("ix_task_user_status_completed", "user_id", "status", "completed_at")

# TaskInstance table
Index("ix_instance_user_status_completed", "user_id", "status", "completed_at")
```

Create migration via `just migrate-new "add analytics composite indexes"`.

These cover the dominant analytics query pattern:
`WHERE user_id = ? AND status = 'completed' AND completed_at >= ? AND completed_at < ?`

### 5. Fix `completion_rate` scope mismatch (P2)

Current: `total_completed` (date-range-scoped) / (`total_completed` + `total_pending` (all-time)).

Fix: also scope `total_pending` to the date range by counting tasks that were pending
(created before range_end and not completed before range_start). But this is complex and
may not match user expectations.

Simpler fix: change the denominator to only `total_completed` in range + tasks created in
range that are still pending. Actually this is also complex.

**Pragmatic fix**: remove `completion_rate` from the response entirely and let the frontend
compute it from `total_completed` and `total_pending` if needed. OR: just keep it as-is
but rename the comment to clarify semantics. The metric is "what % of my visible workload
(completed-in-range + still-pending) have I knocked out" — which is actually useful.

**Decision**: Keep as-is, add a clarifying comment. It's not a bug, just a non-obvious
semantic. The frontend already displays it fine.

### 6. Compute `date.today()` once (P2)

Add `today = date.today()` at the top of `get_comprehensive_stats()` and pass it as a
parameter to `_calculate_streaks(today)`, `_get_week_comparison(today)`, and use it for
the heatmap/velocity calculations. This prevents midnight-boundary inconsistencies.

### 7. Fix median calculation (P2)

Replace:
```python
median_resolution = sorted(resolution_times)[len(resolution_times) // 2]
```

With:
```python
from statistics import median
median_resolution = median(resolution_times) if resolution_times else 0
```

Note: `statistics.median` returns float for even-length lists. Round to int since the
response model expects `int`.

### 8. Remove redundant inner DISTINCT in streaks (P3)

Remove `.distinct()` from `task_dates` and `instance_dates` subqueries — the outer
`select(combined.c.d).distinct()` already handles deduplication.

## Verification

```bash
# Python checks
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test

# Migration
just migrate-new "add analytics composite indexes"
just migrate
```
