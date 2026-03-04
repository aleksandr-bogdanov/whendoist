---
version: v0.57.0
created: 2026-03-04
type: implementation
---

# Task Activity Log — Implementation Plan

## Context

Whendoist has no audit trail. Users can't see when a task was rescheduled, changed domains, or completed. This plan adds an **activity log** — per-task (in the task detail panel) and per-user (in Settings). The investigation at `docs/plans/2026-03-02-activity-log-investigation.md` identified 21 mutation points, evaluated 4 options, and recommended Option C (hybrid). User confirmed Option C, platform-native mobile/desktop UX, and a dual per-task + per-user activity log.

**Key decisions:**
- **Option C (Hybrid):** Field diffs for non-encrypted fields; event-only for encrypted fields (title, description, domain name)
- **Single `activity_log` table** serves both per-task (`WHERE task_id = ?`) and per-user (`WHERE user_id = ?`) views
- **Desktop:** Line-style tabs (Details | Activity) in TaskDetailPanel
- **Mobile:** "View activity" link in TaskEditDrawer → nested vaul drawer
- **Settings:** SettingsCard with "View activity log" → opens Sheet/drawer with paginated user activity
- **Multitenancy-ready:** `user_id` on every record; future `actor_id` column when multitenancy arrives
- **Retention:** Keep forever (~3.5 MB/user/year)

---

## Phase 1: Backend Foundation

### 1.1 — ActivityLog model

**File:** `app/models.py` — add after `ExportSnapshot`

```python
class ActivityLog(Base):
    __tablename__ = "activity_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"))
    instance_id: Mapped[int | None] = mapped_column(ForeignKey("task_instances.id", ondelete="SET NULL"))
    domain_id: Mapped[int | None] = mapped_column(ForeignKey("domains.id", ondelete="SET NULL"))
    event_type: Mapped[str] = mapped_column(String(50))
    field_name: Mapped[str | None] = mapped_column(String(50))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    batch_id: Mapped[str | None] = mapped_column(String(36))  # UUID as string for SQLite compat
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_activity_log_user_task", "user_id", "task_id", "created_at"),
        Index("ix_activity_log_user_created", "user_id", "created_at"),
    )
```

- `ON DELETE SET NULL` on task/instance/domain FKs — activity survives entity deletion
- `batch_id` as `String(36)` for SQLite test compatibility (no native UUID type)
- No ORM relationships needed — activity is queried by direct SQL only

### 1.2 — Migration

```bash
just migrate-new "add_activity_log_table"
```

### 1.3 — Activity log service

**New file:** `app/services/activity_log.py`

Two functions:
- `log_activity(db, *, user_id, event_type, task_id?, instance_id?, domain_id?, field_name?, old_value?, new_value?, batch_id?)` — single entry
- `log_field_changes(db, *, user_id, event_type, old_values, new_values, diff_fields, task_id?, domain_id?, batch_id?)` — iterates changed fields, respects `ENCRYPTED_FIELDS` (no values) and `SKIP_FIELDS` (`position`)
- `new_batch_id() -> str` — `str(uuid.uuid4())`

Constants in the file:
- `ENCRYPTED_FIELDS = {"title", "description", "name"}`
- `SKIP_FIELDS = {"position"}`
- `TASK_DIFF_FIELDS = {"domain_id", "parent_id", "impact", "clarity", "duration_minutes", "scheduled_date", "scheduled_time", "is_recurring", "recurrence_rule", "recurrence_start", "recurrence_end"}`
- `DOMAIN_DIFF_FIELDS = {"color", "icon", "position"}`

### 1.4 — Instrument TaskService

**File:** `app/services/task_service.py`

| Method | Event(s) | Notes |
|--------|----------|-------|
| `create_task` | `task_created` | After flush, before `bump_data_version` |
| `update_task` | `task_field_changed` × N | Capture old values before setattr loop. `parent_id` is popped from kwargs early — capture `old_parent_id` before the parent handling block. Use `log_field_changes` for remaining fields. |
| `complete_task` | `task_completed` + per-subtask | Log for main task + each cascaded subtask |
| `uncomplete_task` | `task_uncompleted` | |
| `toggle_task_completion` | (delegates) | No change needed — calls complete/uncomplete |
| `archive_task` | `task_archived` + per-subtask | Log in `_archive_subtasks` for each subtask |
| `restore_task` | `task_restored` + per-subtask | Log in `_restore_subtasks` for each subtask |
| `delete_task` | `task_deleted` | Before `db.delete(task)` so task_id is still valid |
| `create_domain` | `domain_created` | After flush |
| `update_domain` | `domain_updated` × N | Capture old values, use `log_field_changes` with `DOMAIN_DIFF_FIELDS`. Encrypted `name` → event-only. |
| `archive_domain` | `domain_archived` | After flush |

### 1.5 — Instrument RecurrenceService

**File:** `app/services/recurrence_service.py`

| Method | Event | Notes |
|--------|-------|-------|
| `complete_instance` | `instance_completed` | `task_id` + `instance_id` |
| `uncomplete_instance` | `instance_uncompleted` | |
| `toggle_instance_completion` | (delegates) | No change needed |
| `skip_instance` | `instance_skipped` | |
| `unskip_instance` | `instance_unskipped` | |
| `schedule_instance` | `instance_rescheduled` | Capture old datetime before mutation |
| `batch_complete_instances` | `instance_batch_completed` | Single event, count in `new_value` |
| `batch_complete_all_past_instances` | `instance_batch_completed` | Single event, count in `new_value` |
| `batch_skip_all_past_instances` | `instance_batch_skipped` | Single event, count in `new_value` |

**Not instrumented** (system operations, not user-initiated): `materialize_instances`, `regenerate_instances`, `get_or_create_today_instance`, `get_or_create_instance_for_date`, `ensure_instances_materialized`.

### 1.6 — Instrument router-level operations

**`app/routers/tasks.py`:**
- `batch_update_tasks` (encryption toggle) → single `encryption_enabled`/`encryption_disabled` event. Determine direction by checking `UserPreferences.encryption_enabled`. Place before final commit.
- `batch_action_tasks` (multi-select) → per-item events with shared `batch_id`. Map action to event: complete→`task_completed`, schedule→`task_field_changed`(scheduled_date), move→`task_field_changed`(domain_id), delete→`task_archived`.

**`app/routers/import_data.py`:**
- `wipe_user_data` → delete all `ActivityLog` records for user first, then log single `data_wiped` event with counts, before commit.
- `import_from_todoist` → log `data_imported` with counts. Import commits internally, so add a separate `log_activity` + `commit` after.

### 1.7 — API endpoints

**New file:** `app/routers/activity.py`

```
GET /api/v1/activity/task/{task_id}?limit=50
  → list[ActivityLogEntry]  (per-task, ordered by created_at DESC)

GET /api/v1/activity?limit=50&offset=0
  → ActivityLogResponse { entries: list[ActivityLogEntry], total: int }  (per-user, paginated)
```

Both endpoints filter by `user_id` (multitenancy). Use constants from `app/constants.py` for default/max limits.

### 1.8 — Register router

**File:** `app/routers/v1/__init__.py` — add `activity` import + `router.include_router(activity.router)`

### 1.9 — Constants

**File:** `app/constants.py` — add `ACTIVITY_LOG_DEFAULT_LIMIT = 50`, `ACTIVITY_LOG_MAX_LIMIT = 200`

### 1.10 — Tests

**New file:** `tests/test_activity_log.py`

- `test_create_task_logs_event` — verify task_created entry exists
- `test_complete_task_logs_event` — verify task_completed entry
- `test_update_task_logs_field_changes` — verify field_changed entries with old/new values
- `test_encrypted_field_no_values` — verify title change logs event with null old/new
- `test_multitenancy_isolation` — user A can't see user B's activity
- `test_archive_cascades_to_subtasks` — verify all subtask archive events logged
- `test_batch_operation_single_event` — verify batch_complete logs single event with count

### 1.11 — Validate

```bash
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
```

---

## Phase 2: Frontend — Per-Task Activity

### 2.1 — Regenerate API types

```bash
cd frontend && npx orval
```

Generates `ActivityLogEntry`, `ActivityLogResponse` types and query hooks.

### 2.2 — Activity entry component

**New file:** `frontend/src/components/activity/activity-entry.tsx`

Single activity entry row:
- Icon from lucide based on `event_type` (CheckCircle=completed, Archive=archived, Edit=field_changed, Plus=created, etc.)
- Human-readable description: maps `field_name` to labels, formats old/new values (impact→P1-P4 labels via `Impact` enum mapping, domain_id→domain name from query cache, dates→formatted)
- Relative timestamp ("2m ago", "1h ago", "3d ago", "Mar 4")
- For encrypted fields (`title`, `description`, `name`): just shows "updated" with no values

### 2.3 — Activity list component

**New file:** `frontend/src/components/activity/activity-list.tsx`

Receives `entries: ActivityLogEntry[]` + `isLoading`. Renders loading spinner, empty state, or list of `ActivityEntryRow` components.

### 2.4 — Desktop tabs in TaskDetailPanel

**File:** `frontend/src/components/task/task-detail-panel.tsx`

In `DetailBody` (edit mode only), wrap the scrollable body with Tabs:
- Import `Tabs, TabsContent, TabsList, TabsTrigger` from `@/components/ui/tabs`
- `variant="line"` for clean underline style
- Tab "Details" → current TaskFieldsBody + batch complete + metadata
- Tab "Activity" → `ActivityList` using orval-generated hook for `GET /activity/task/{id}`
- Create mode: no tabs, just the form as-is

### 2.5 — Mobile nested drawer in TaskEditDrawer

**File:** `frontend/src/components/task/task-edit-drawer.tsx`

- Add "View activity →" link at the bottom of the scrollable area (edit mode only), in a new metadata section
- Opens a `Drawer.NestedRoot` (same pattern used for calendar picker and parent picker)
- Nested drawer contains drag handle, "Activity" title, and `ActivityList`
- Max height `70vh`, scrollable content

### 2.6 — Validate

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```

---

## Phase 3: Frontend — User Activity Log (Settings)

### 3.1 — Settings activity section

**File:** `frontend/src/routes/_authenticated/settings.lazy.tsx`

- New `SettingsCard` with History icon, titled "Activity"
- "View activity log" button opens a `Sheet` (desktop side panel, slides from right)
- On mobile, Sheet already handles responsive behavior
- Sheet contains `ActivityList` with paginated data from `GET /activity?limit=50&offset=0`
- "Load more" button at bottom for pagination
- Place after the "Data" section in Settings

### 3.2 — Wipe cleanup

**File:** `app/routers/import_data.py`

In `wipe_user_data`, add `delete(ActivityLog).where(ActivityLog.user_id == user.id)` before logging the `data_wiped` event (so the wipe event itself is preserved as the first entry).

### 3.3 — Validate

```bash
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```

---

## Event Types Reference

| Event Type | Entity | Logged By | Has field diffs? |
|------------|--------|-----------|-----------------|
| `task_created` | Task | TaskService.create_task | No |
| `task_completed` | Task | TaskService.complete_task, batch_action | No |
| `task_uncompleted` | Task | TaskService.uncomplete_task | No |
| `task_archived` | Task | TaskService.archive_task, batch_action | No |
| `task_restored` | Task | TaskService.restore_task | No |
| `task_deleted` | Task | TaskService.delete_task | No |
| `task_field_changed` | Task | TaskService.update_task, batch_action | Yes (non-encrypted only) |
| `instance_completed` | Instance | RecurrenceService.complete_instance | No |
| `instance_uncompleted` | Instance | RecurrenceService.uncomplete_instance | No |
| `instance_skipped` | Instance | RecurrenceService.skip_instance | No |
| `instance_unskipped` | Instance | RecurrenceService.unskip_instance | No |
| `instance_rescheduled` | Instance | RecurrenceService.schedule_instance | Yes (old/new datetime) |
| `instance_batch_completed` | Instance | RecurrenceService.batch_* | Count in new_value |
| `instance_batch_skipped` | Instance | RecurrenceService.batch_skip_* | Count in new_value |
| `domain_created` | Domain | TaskService.create_domain | No |
| `domain_updated` | Domain | TaskService.update_domain | Yes (non-encrypted only) |
| `domain_archived` | Domain | TaskService.archive_domain | No |
| `encryption_enabled` | User | tasks.batch_update_tasks | Count in new_value |
| `encryption_disabled` | User | tasks.batch_update_tasks | Count in new_value |
| `data_imported` | User | import_data.import_from_todoist | Counts in new_value |
| `data_wiped` | User | import_data.wipe_user_data | Counts in new_value |

---

## Critical Files

**Backend (modify):**
- `app/models.py` — add ActivityLog model
- `app/services/task_service.py` — instrument 11 mutation methods
- `app/services/recurrence_service.py` — instrument 7 mutation methods
- `app/routers/tasks.py` — instrument batch_update_tasks, batch_action_tasks
- `app/routers/import_data.py` — instrument wipe + import
- `app/routers/v1/__init__.py` — register new router
- `app/constants.py` — add activity log constants

**Backend (create):**
- `app/services/activity_log.py` — log_activity, log_field_changes helpers
- `app/routers/activity.py` — API endpoints
- `tests/test_activity_log.py` — unit tests
- Alembic migration file

**Frontend (modify):**
- `frontend/src/components/task/task-detail-panel.tsx` — add tabs (Details | Activity)
- `frontend/src/components/task/task-edit-drawer.tsx` — add "View activity" link + nested drawer
- `frontend/src/routes/_authenticated/settings.lazy.tsx` — add Activity SettingsCard + Sheet

**Frontend (create):**
- `frontend/src/components/activity/activity-entry.tsx` — single entry component
- `frontend/src/components/activity/activity-list.tsx` — list component

---

## Verification

1. Backend passes: `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
2. Frontend passes: `cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build`
3. Manual: Create → edit (change domain, priority, schedule) → complete → archive → restore a task. Verify all events appear in the Activity tab. Check Settings activity log shows all events across tasks.
4. Verify multitenancy: activity endpoints return only the authenticated user's events.
5. Verify batch operations: encryption toggle logs single event, multi-select logs per-item with batch_id.
