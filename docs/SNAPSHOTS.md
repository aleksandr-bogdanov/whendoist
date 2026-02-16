# Export Snapshots

Automated daily backups of user data stored in PostgreSQL, with content-hash deduplication.

## Why

Users need a safety net for rollback — accidental bulk deletes, bad syncs, buggy releases, or just "what did I have last week?" Manual export exists (Settings > Backup > Download) but nobody remembers to click it. Snapshots automate this.

## How It Works

1. User enables "Automatic Snapshots" in Settings > Backup (toggle)
2. Background loop runs every 30 minutes, checks all enabled users
3. For each user: if no snapshot exists in the last 24 hours, call `BackupService.export_all()`, compress with gzip, store in `export_snapshots` table
4. Before storing, compute SHA-256 of the data (excluding volatile `exported_at`/`version` fields). If the hash matches the latest snapshot, skip — no new row created
5. After creating, enforce retention: keep the newest 10, delete the rest

Users can also create manual snapshots ("Create Now"), download any snapshot as JSON, restore from any snapshot (replaces all data), or delete individual snapshots.

## Architecture

### Storage: PostgreSQL `LargeBinary`

Snapshots are gzip-compressed JSON stored as `bytea` in PostgreSQL. A typical user's full export compresses to 5-50 KB. Even 50 snapshots per user is a few MB — well within PostgreSQL's comfort zone.

**Why not S3 or filesystem?** No extra infrastructure. No credentials, no bucket policies, no cleanup jobs. Everything stays in one system. The data is small enough that the simplicity wins.

**Why not a separate backup database?** Same reason. If the primary database goes down, you have bigger problems than snapshot access. Phase 2 could add email delivery of snapshots for true disaster recovery (separate from the DB), but that's deferred.

### Content-Hash Deduplication

Every snapshot computes `SHA-256(json_dumps(data, sort_keys=True))` over the user's domains, tasks, and preferences — excluding `exported_at` and `version` which change every export. If the hash matches the most recent snapshot, automatic creation is silently skipped.

This means:
- A user who hasn't changed anything in 6 months generates zero new rows
- The background loop can run frequently (every 30 min) without storage bloat
- Manual snapshots bypass dedup — "Create Now" always creates

### Hardcoded Daily + 10 Retention

Early implementation had per-user frequency (daily/weekly/monthly) and retention count (3-50) dropdowns. This was removed as overengineered — dedup makes daily cheap for everyone, and 10 snapshots covers two weeks of daily changes. No user needs to configure this.

### Background Loop: In-Process `asyncio.Task`

Follows the same pattern as `app/tasks/recurring.py` (materialization loop):
- `while True` + `asyncio.sleep(1800)` (30 min)
- Per-user error isolation (`try/except/continue`)
- `asyncio.wait_for()` timeout (5 min) prevents runaway cycles
- Global task reference for clean shutdown via `stop_snapshot_background()`
- Does NOT run on startup — first check after 30 min (snapshots aren't time-critical)

**Why not Celery/Dagster/pg_cron?** The app is a single-process web server with dozens of users. A proper job orchestrator adds a broker (Redis), a worker process, deployment config, and monitoring — all for "run a function daily per user." The in-process loop has zero dependencies. If the process dies, Railway restarts it and the loop resumes. The snapshot timestamps themselves track "last run" state.

### Restore Path

Restore reuses `BackupService.import_all(data, clear_existing=True)` — the same code path as manual backup restore. This means snapshot data is always compatible with the existing format, and the restore logic (validation, ID remapping, cycle detection) is battle-tested.

## Data Model

### `ExportSnapshot` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | `Integer` (PK) | Auto-increment |
| `user_id` | `Integer` (FK) | Cascading delete with user |
| `data` | `LargeBinary` | Gzip-compressed JSON |
| `content_hash` | `String(64)` | SHA-256 hex for dedup |
| `size_bytes` | `Integer` | Compressed size |
| `is_manual` | `Boolean` | True for "Create Now" snapshots |
| `created_at` | `DateTime` | Server-default `now()` |

Index: `(user_id, created_at)` for efficient listing and "latest snapshot" queries.

### `UserPreferences` column

| Column | Type | Description |
|--------|------|-------------|
| `snapshots_enabled` | `Boolean` | Toggle for automatic snapshots |

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
| `app/services/snapshot_service.py` | Core service: create, list, dedup, restore, retention |
| `app/tasks/snapshots.py` | Background loop (30-min interval) |
| `app/routers/backup.py` | API endpoints (added to existing router) |
| `app/templates/settings.html` | UI: toggle, create, list, download/restore/delete |
| `static/css/pages/settings.css` | Snapshot list styles |
| `tests/test_snapshots.py` | 14 service-layer tests |
