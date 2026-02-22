---
version: v0.54.54
pr: 440
created: 2026-02-23
---

# Revisit Scheduled Backups: `data_version` Change Tracking

## Context

The scheduled backup system has three scalability problems:

1. **Wasteful full exports for inactive users**: Every cycle, `process_due_snapshots()` calls `export_all()` for every due user (loads ALL domains, tasks, task instances, preferences), serializes to JSON, computes SHA-256 — only THEN discovers nothing changed. With 1000 inactive users, that's 1000 full data exports daily for zero benefit.

2. **Recurring task instance inflation**: Materialization creates new `TaskInstance` records hourly (60-day horizon). These change the content hash even though the user did nothing. Result: inactive users with recurring tasks get a new snapshot every single day, defeating the dedup entirely.

3. **Sequential processing bottleneck**: All users processed in a single loop with a 5-minute timeout. Large user counts get cut off; no batching/pagination.

## Solution: `data_version` Counter

Add a monotonic `data_version: int` counter to the `User` model. Bump it only on user-initiated mutations. Store it on snapshots. The snapshot loop compares integers instead of doing full exports.

**Key insight**: Auto-materialization of recurring task instances does NOT bump `data_version`, so inactive users with recurring tasks are never wastefully snapshotted.

### Fast path (new)
```
user.data_version == latest_snapshot.snapshot_data_version → skip (zero work)
```

### Slow path (existing, kept as safety net)
```
versions differ or legacy NULL → full export + content-hash dedup → create or skip
```

---

## Implementation Steps

### 1. Schema Changes

**Migration**: `alembic/versions/20260223_XXXXXX_add_data_version_to_users_and_snapshots.py`

```python
# users.data_version: int, NOT NULL, server_default=0
op.add_column("users", sa.Column("data_version", sa.Integer(), nullable=False, server_default=sa.text("0")))
# export_snapshots.snapshot_data_version: int, NULLABLE (backward compat)
op.add_column("export_snapshots", sa.Column("snapshot_data_version", sa.Integer(), nullable=True))
```

**Models** (`app/models.py`):
- `User`: add `data_version: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))`
- `ExportSnapshot`: add `snapshot_data_version: Mapped[int | None] = mapped_column(Integer, nullable=True)`

### 2. `bump_data_version` Utility

**New file**: `app/services/data_version.py`

```python
async def bump_data_version(db: AsyncSession, user_id: int) -> None:
    await db.execute(
        update(User).where(User.id == user_id).values(data_version=User.data_version + 1)
    )
```

Atomic SQL increment — no read-modify-write race. Rides the caller's transaction (no extra commit).

### 3. SnapshotService Changes

**File**: `app/services/snapshot_service.py`

- `create_snapshot()`: accept `data_version: int | None = None` parameter, store on `ExportSnapshot`
- Add `get_latest_snapshot_data_version()` method

### 4. Rewrite `process_due_snapshots()`

**File**: `app/tasks/snapshots.py`

Replace N+1 queries with a single batch query:

```sql
-- Find users who: have snapshots_enabled, are due (>1 day), AND have no matching version
SELECT up.user_id, u.data_version, latest.snapshot_data_version
FROM user_preferences up
JOIN users u ON u.id = up.user_id
LEFT JOIN (latest snapshot subquery) ON ...
WHERE up.snapshots_enabled = TRUE
  AND (latest.created_at IS NULL OR latest.created_at < cutoff)
```

Then for each candidate:
- **Fast path**: `snapshot_data_version == data_version` → skip entirely (new `users_skipped_fast` stat)
- **Slow path**: versions differ or NULL → full export + hash dedup (existing behavior)

### 5. Integrate Bumps into All User-Initiated Mutations

Add `await bump_data_version(self.db, self.user_id)` after successful flush in:

**TaskService** (`app/services/task_service.py`) — 10 methods:
| Method | Condition |
|--------|-----------|
| `create_domain()` | Always (both create & idempotent update paths) |
| `update_domain()` | If domain found |
| `archive_domain()` | If domain found |
| `create_task()` | Always |
| `update_task()` | If task found |
| `complete_task()` | If task found |
| `uncomplete_task()` | If task found |
| `archive_task()` | If task found |
| `restore_task()` | If task found |
| `delete_task()` | If task found |

**RecurrenceService** (`app/services/recurrence_service.py`) — 8 methods:
| Method | Condition |
|--------|-----------|
| `complete_instance()` | If instance found |
| `uncomplete_instance()` | If instance found |
| `skip_instance()` | If instance found |
| `unskip_instance()` | If instance found |
| `schedule_instance()` | If instance found |
| `batch_complete_instances()` | If count > 0 |
| `batch_complete_all_past_instances()` | If count > 0 |
| `batch_skip_all_past_instances()` | If count > 0 |

**NOT bumped** (auto/system): `materialize_instances()`, `regenerate_instances()`, `ensure_instances_materialized()`, `get_or_create_today_instance()`, `get_or_create_instance_for_date()`

**PreferencesService** (`app/services/preferences_service.py`) — 1 method:
- `update_preferences()` — after flush

**BackupService** (`app/services/backup_service.py`) — 1 method:
- `import_all()` — inside `begin_nested()` block, after final flush

**TodoistImportService** (`app/services/todoist_import.py`) — 2 methods:
- `wipe_user_data()` — before `await self.db.commit()` on line 93
- `import_all()` — after all imports, before commit

**Routers** (direct DB mutations, not through services):
- `app/routers/import_data.py` `wipe_user_data()` — before `await db.commit()` on line 136
- `app/routers/tasks.py` `batch_update_tasks()` — once, before final commit
- `app/routers/domains.py` `batch_update_domains()` — once, after all updates

**Methods that delegate (no bump needed)**:
- `toggle_task_completion()` → delegates to `complete_task`/`uncomplete_task`
- `toggle_instance_completion()` → delegates to `complete_instance`/`uncomplete_instance`

### 6. Tests

**New test file**: `tests/test_data_version.py`

- `test_bump_increments_version` — verify counter goes 0→1→2
- `test_bump_on_task_create` — create task, verify data_version increased
- `test_bump_on_task_update` — update task, verify data_version increased
- `test_bump_on_domain_create` — create domain, verify data_version increased
- `test_no_bump_on_materialize_instances` — materialize, verify version unchanged
- `test_bump_on_instance_complete` — complete instance, verify version increased
- `test_bump_on_import_all` — import data, verify version increased

**Update** `tests/test_snapshots.py`:

- `test_snapshot_stores_data_version` — create snapshot with data_version=5, verify stored
- `test_snapshot_data_version_defaults_to_none` — verify backward compat

---

## Backward Compatibility

| Scenario | Behavior |
|----------|----------|
| Existing users (migration) | `data_version=0`, existing snapshots `snapshot_data_version=NULL` |
| First cycle post-migration | NULL triggers slow path → full export + hash dedup once → stores `snapshot_data_version=0` |
| Subsequent cycles (no user activity) | `0 == 0` → fast path skip |
| User makes a change | `data_version` bumps to 1 → `1 != 0` → slow path → new snapshot with `snapshot_data_version=1` |

After one cycle, all active users have versioned snapshots and use the fast path going forward.

## Verification

```bash
# Full backend check
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test

# Specific test files
uv run pytest tests/test_data_version.py tests/test_snapshots.py -v

# Verify migration applies cleanly
just migrate
```
