# Export Snapshots

Automated daily backups of user data stored in PostgreSQL, with two-tier change detection: a `data_version` counter for O(1) skip of unchanged users, plus content-hash deduplication as a safety net.

## Why

Users need a safety net for rollback — accidental bulk deletes, bad syncs, buggy releases, or just "what did I have last week?" Manual export exists (Settings > Backup > Download) but nobody remembers to click it. Snapshots automate this.

## How It Works

1. User enables "Automatic Snapshots" in Settings > Backup (toggle)
2. Background loop runs every 30 minutes
3. **Single batch query** finds all enabled users who are due (>24h since last snapshot)
4. For each candidate, **two-tier check**:
   - **Fast path**: compare `user.data_version` with `latest_snapshot.snapshot_data_version` — if equal, skip entirely (zero DB reads, zero serialization)
   - **Slow path**: versions differ (or legacy NULL) — full export, hash, compress, store
5. After creating, enforce retention: keep the newest 10, delete the rest

Users can also create manual snapshots ("Create Now"), download any snapshot as JSON, restore from any snapshot (replaces all data), or delete individual snapshots.

## Change Detection: `data_version`

### The problem with hash-only dedup

The original design relied solely on content-hash deduplication. For each due user, it would:

1. `export_all()` — load ALL domains, tasks, task instances, preferences from DB
2. Serialize to JSON
3. Compute SHA-256
4. Compare to latest snapshot hash
5. Skip if identical

This is O(users x data_per_user) even when nothing changed. With recurring tasks making it worse: the materialization loop creates new `TaskInstance` records hourly (60-day horizon), changing the content hash even for completely inactive users.

### How `data_version` solves it

A monotonic integer counter on the `User` model, bumped via atomic SQL (`SET data_version = data_version + 1`) only on user-initiated mutations:

| Bumped (user action) | NOT bumped (system action) |
|---|---|
| Create/update/delete task | Auto-materialize recurring instances |
| Create/update/archive domain | Instance cleanup (old completed/skipped) |
| Complete/skip/unskip instance | GCal sync metadata |
| Update preferences | Passkey authentication |
| Import data (backup or Todoist) | Snapshot creation itself |
| Wipe user data | |

The snapshot loop compares integers instead of doing full exports:

```
user.data_version == latest_snapshot.snapshot_data_version → skip (zero work)
user.data_version != latest_snapshot.snapshot_data_version → full export + hash dedup
```

### Why keep content-hash dedup?

The hash check is a safety net for edge cases where `data_version` was bumped but the exported data is actually identical — e.g., user renamed a domain then renamed it back. It prevents storing a duplicate snapshot in the rare case where versions diverge but data doesn't.

### Recurring tasks and snapshots

Recurring task materialization creates `TaskInstance` records automatically (hourly, 60-day horizon). These instances are included in snapshot data (for accurate point-in-time restore), but **materialization does NOT bump `data_version`**. This means:

- Inactive user with recurring tasks: `data_version` stays the same → fast-path skip → zero export work
- User completes a recurring instance: `data_version` bumps → next snapshot captures the completion + any new instances

This is the key scalability win. Without it, every user with recurring tasks would get a new snapshot every day regardless of activity.

## Architecture

### Two-Tier Snapshot Processing

```
┌─────────────────────────────────────────────┐
│ Single batch query: find due users          │
│ (snapshots_enabled=true, >24h since last)   │
└────────────────┬────────────────────────────┘
                 │
    ┌────────────▼────────────┐
    │ data_version == snapshot │──── yes ──── SKIP (fast path)
    │ _data_version?          │              (zero work)
    └────────────┬────────────┘
                 │ no (or NULL)
    ┌────────────▼────────────┐
    │ Full export + hash      │
    │ (slow path)             │
    └────────────┬────────────┘
                 │
    ┌────────────▼────────────┐
    │ content_hash == latest  │──── yes ──── SKIP (hash dedup)
    │ snapshot hash?          │
    └────────────┬────────────┘
                 │ no
    ┌────────────▼────────────┐
    │ Compress + store +      │
    │ enforce retention       │
    └─────────────────────────┘
```

### Batch Query

Instead of N+1 queries (one per user), a single query finds users who are both due and have changed data:

```sql
SELECT up.user_id, u.data_version, latest.snapshot_data_version
FROM user_preferences up
JOIN users u ON u.id = up.user_id
LEFT JOIN (latest snapshot subquery) ON ...
WHERE up.snapshots_enabled = TRUE
  AND (no snapshot exists OR last snapshot > 24h ago)
```

For N users with snapshots enabled, this is one query regardless of N. The fast-path version check then filters in Python with zero additional DB access.

### Storage: PostgreSQL `LargeBinary`

Snapshots are gzip-compressed JSON stored as `bytea` in PostgreSQL. A typical user's full export compresses to 5-50 KB. Even 50 snapshots per user is a few MB — well within PostgreSQL's comfort zone.

**Why not S3 or filesystem?** No extra infrastructure. No credentials, no bucket policies, no cleanup jobs. Everything stays in one system. The data is small enough that the simplicity wins.

### Hardcoded Daily + 10 Retention

Early implementation had per-user frequency and retention dropdowns. This was removed as overengineered — dedup makes daily cheap for everyone, and 10 snapshots covers two weeks of daily changes. No user needs to configure this.

### Background Loop: In-Process `asyncio.Task`

Follows the same pattern as `app/tasks/recurring.py` (materialization loop):
- `while True` + `asyncio.sleep(1800)` (30 min)
- Per-user error isolation (`try/except/continue`)
- `asyncio.wait_for()` timeout (5 min) prevents runaway cycles
- Global task reference for clean shutdown via `stop_snapshot_background()`
- Does NOT run on startup — first check after 30 min (snapshots aren't time-critical)

**Why not Celery/Dagster/pg_cron?** The app is a single-process web server. A proper job orchestrator adds a broker, worker process, deployment config, and monitoring — all for "run a function daily per user." The in-process loop has zero dependencies.

### Restore Path

Restore reuses `BackupService.import_all(data, clear_existing=True)` — the same code path as manual backup restore. This means snapshot data is always compatible with the existing format, and the restore logic (validation, ID remapping, cycle detection) is battle-tested.

## Data Model

### `User` column

| Column | Type | Description |
|--------|------|-------------|
| `data_version` | `Integer` (default 0) | Monotonic counter, bumped on user-initiated mutations |

### `ExportSnapshot` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | `Integer` (PK) | Auto-increment |
| `user_id` | `Integer` (FK) | Cascading delete with user |
| `data` | `LargeBinary` | Gzip-compressed JSON |
| `content_hash` | `String(64)` | SHA-256 hex for dedup |
| `size_bytes` | `Integer` | Compressed size |
| `is_manual` | `Boolean` | True for "Create Now" snapshots |
| `snapshot_data_version` | `Integer` (nullable) | User's `data_version` at snapshot time |
| `created_at` | `DateTime` | Server-default `now()` |

Index: `(user_id, created_at)` for efficient listing and "latest snapshot" queries.

### `UserPreferences` column

| Column | Type | Description |
|--------|------|-------------|
| `snapshots_enabled` | `Boolean` | Toggle for automatic snapshots |

## Backward Compatibility

Existing snapshots have `snapshot_data_version = NULL`. On the first cycle after migration, NULL triggers the slow path (full export + hash comparison). If data changed, a new snapshot is stored with `snapshot_data_version = 0` (matching the user's initial `data_version`). From then on, the fast path kicks in.

## `data_version` Bump Locations

The bump is called via `await bump_data_version(db, user_id)` after a successful flush. All call sites:

**Services:**
- `TaskService`: `create_domain`, `update_domain`, `archive_domain`, `create_task`, `update_task`, `complete_task`, `uncomplete_task`, `archive_task`, `restore_task`, `delete_task`
- `RecurrenceService`: `complete_instance`, `uncomplete_instance`, `skip_instance`, `unskip_instance`, `schedule_instance`, `batch_complete_instances`, `batch_complete_all_past_instances`, `batch_skip_all_past_instances`
- `PreferencesService`: `update_preferences`
- `BackupService`: `import_all`
- `TodoistImportService`: `wipe_user_data`, `import_all`

**Routers** (direct DB mutations not going through services):
- `import_data.py`: `wipe_user_data`
- `tasks.py`: `batch_update_tasks`
- `domains.py`: `batch_update_domains`

If you add a new mutation endpoint or service method that modifies user data (tasks, domains, instances, preferences), add a `bump_data_version` call.

## API Endpoints

All under `/api/v1/backup/snapshots`, rate-limited at 5/minute per user.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/snapshots` | List snapshots + enabled state |
| `PUT` | `/snapshots/enabled` | Toggle automatic snapshots on/off |
| `POST` | `/snapshots` | Create manual snapshot |
| `GET` | `/snapshots/{id}/download` | Download as JSON file |
| `POST` | `/snapshots/{id}/restore` | Restore (replaces all data) |
| `DELETE` | `/snapshots/{id}` | Delete single snapshot |

## Files

| File | Purpose |
|------|---------|
| `app/models.py` | `User.data_version`, `ExportSnapshot.snapshot_data_version` |
| `app/services/data_version.py` | `bump_data_version()` — atomic SQL increment utility |
| `app/services/snapshot_service.py` | Core service: create, list, dedup, restore, retention |
| `app/services/backup_service.py` | Full export/import (used by snapshot service) |
| `app/tasks/snapshots.py` | Background loop with batch query + version fast-path |
| `app/routers/backup.py` | API endpoints |
| `tests/test_snapshots.py` | 16 service-layer tests (including `data_version` storage) |
| `tests/test_data_version.py` | 9 tests for version bumping and materialization exclusion |
