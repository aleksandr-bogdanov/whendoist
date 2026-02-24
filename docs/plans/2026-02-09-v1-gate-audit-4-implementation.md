# V1.0 Gate Audit #4 — Implementation Plan

> For Sonnet. Each task is a separate PR following the project's versioned PR workflow.
> Before each commit: `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`

---

## PR 1: Tighten Pydantic input validation

**Version bump:** 0.42.19
**Type:** fix
**Risk:** Low — adds constraints; all existing tests send valid data
**Time:** ~15 minutes

### What to do

Add `Field()` constraints to Pydantic request models that currently accept unbounded
values. Also convert one raw `str` to `Literal`.

### File: `app/routers/tasks.py`

**Add `Field` to the import** (line 13). Change:
```python
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
```
To:
```python
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
```

**TaskCreate** (lines 135-136). Change:
```python
    duration_minutes: int | None = None
    impact: int = 4
```
To:
```python
    duration_minutes: int | None = Field(None, ge=1, le=1440)
    impact: int = Field(default=4, ge=1, le=4)
```

**TaskUpdate** (lines 188-189). Change:
```python
    duration_minutes: int | None = None
    impact: int | None = None
```
To:
```python
    duration_minutes: int | None = Field(None, ge=1, le=1440)
    impact: int | None = Field(None, ge=1, le=4)
```

**BatchUpdateTasksRequest** (line 727). Change:
```python
    tasks: list[TaskContentData]
```
To:
```python
    tasks: list[TaskContentData] = Field(max_length=5000)
```

### File: `app/routers/domains.py`

**Add `Field` to the import.** Change:
```python
from pydantic import BaseModel, ConfigDict
```
To:
```python
from pydantic import BaseModel, ConfigDict, Field
```

**BatchUpdateDomainsRequest** (line 189). Change:
```python
    domains: list[DomainContentData]
```
To:
```python
    domains: list[DomainContentData] = Field(max_length=500)
```

### File: `app/routers/instances.py`

**Add `Literal` to typing imports** (line 7 area). Add:
```python
from typing import Literal
```

**BatchAction** (line 184). Change:
```python
    action: str  # "complete" or "skip"
```
To:
```python
    action: Literal["complete", "skip"]
```

The manual `if/elif/else` validation at lines 225-230 can stay — it now serves as
defense-in-depth and the `else` branch becomes unreachable.

### File: `app/routers/passkeys.py`

**Add `Field` to the import.** Change:
```python
from pydantic import BaseModel
```
To:
```python
from pydantic import BaseModel, Field
```

**RegistrationVerifyRequest** (lines 40-42). Change:
```python
    name: str  # User-provided name for this passkey
    prf_salt: str  # Salt used in PRF evaluation
    wrapped_key: str  # Master encryption key wrapped with PRF-derived key
```
To:
```python
    name: str = Field(max_length=100)  # User-provided name for this passkey
    prf_salt: str = Field(max_length=64)  # Salt used in PRF evaluation
    wrapped_key: str = Field(max_length=10000)  # Master encryption key wrapped with PRF-derived key
```

### File: `app/routers/preferences.py`

**Add `Field` to the import.** Change:
```python
from pydantic import BaseModel
```
To:
```python
from pydantic import BaseModel, Field
```

**EncryptionSetupRequest** (lines 65-66). Change:
```python
    salt: str  # Base64-encoded 32-byte salt (generated client-side)
    test_value: str  # Encrypted test value for passphrase verification
```
To:
```python
    salt: str = Field(max_length=64)  # Base64-encoded 32-byte salt (generated client-side)
    test_value: str = Field(max_length=1000)  # Encrypted test value for passphrase verification
```

### File: `app/routers/api.py`

**Add `Field` to the import** (line 11). Change:
```python
from pydantic import BaseModel
```
To:
```python
from pydantic import BaseModel, Field
```

**ScheduledTaskUpdate** (line 98). Change:
```python
    duration_minutes: int
```
To:
```python
    duration_minutes: int = Field(ge=1, le=1440)
```

**CommitTasksRequest** (line 104). Change:
```python
    tasks: list[ScheduledTaskUpdate]
```
To:
```python
    tasks: list[ScheduledTaskUpdate] = Field(max_length=500)
```

**CalendarSelectionsRequest** (line 353). Change:
```python
    calendar_ids: list[str]
```
To:
```python
    calendar_ids: list[str] = Field(max_length=100)
```

### File: `app/routers/import_data.py`

**Add `Field` to the import.** Change:
```python
from pydantic import BaseModel
```
To:
```python
from pydantic import BaseModel, Field
```

**ImportOptions** (line 60). Change:
```python
    completed_limit: int = 200
```
To:
```python
    completed_limit: int = Field(default=200, ge=0, le=1000)
```

### Testing

All existing tests must pass — they send valid values. No new tests needed unless
you want to add a quick negative test for `impact=0` or `impact=5` → 422.

### CHANGELOG entry

```
## [0.42.19] - 2026-02-09 — Tighten Input Validation

### Fixed
- **Pydantic field constraints** — Added range validation to `impact` (1-4), `duration_minutes` (1-1440), `completed_limit` (0-1000); max_length on passkey and encryption string fields; size limits on batch update lists; `BatchAction.action` now uses `Literal` instead of raw `str`
```

---

## PR 2: Add HTMX CSRF protection and fix safeFetch bypass

**Version bump:** 0.42.20
**Type:** fix
**Risk:** Low — adds CSRF header to HTMX requests (currently no HTMX state-changing
requests are active, but this future-proofs); fixes raw fetch() in dead code
**Time:** ~10 minutes

### Background

The task sheet (`_task_sheet.html`) is currently dead code — the DOM elements
`#task-sheet` and `#sheet-overlay` don't exist in any page template. But it contains
HTMX form submissions without CSRF tokens and raw `fetch()` calls bypassing `safeFetch()`.
This PR fixes both issues so they're safe when the sheet is eventually activated.

### Step 1: Add global HTMX CSRF injector

**File: `static/js/error-handler.js`**

Add this block just **before** the exports section (before line 399, the
`// Exports` comment). This injects the CSRF token into every HTMX state-changing
request:

```javascript
    // ==========================================================================
    // HTMX CSRF Integration
    // ==========================================================================

    // Inject CSRF token into all HTMX requests that modify state
    if (typeof document !== 'undefined') {
        document.body.addEventListener('htmx:configRequest', (e) => {
            const method = (e.detail.verb || '').toUpperCase();
            if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
                const token = getCSRFToken();
                if (token) {
                    e.detail.headers['X-CSRF-Token'] = token;
                }
            }
        });
    }
```

### Step 2: Replace raw fetch() with safeFetch() in task sheet

**File: `app/templates/tasks/_task_sheet.html`**

**Unschedule action** (~line 145). Replace the entire `fetch` block:
```javascript
        try {
          const resp = await fetch(`/api/v1/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scheduled_date: null, scheduled_time: null })
          });
          if (resp.ok) {
```
With:
```javascript
        try {
          const resp = await safeFetch(`/api/v1/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scheduled_date: null, scheduled_time: null })
          });
          if (resp.ok) {
```

**Skip action** (~line 169). Replace:
```javascript
          const resp = await fetch(`/api/v1/instances/${instanceId}/skip`, {
            method: 'POST',
            headers: window.getCSRFHeaders(),
          });
```
With:
```javascript
          const resp = await safeFetch(`/api/v1/instances/${instanceId}/skip`, {
            method: 'POST',
          });
```
(safeFetch auto-injects CSRF and Content-Type isn't needed for a bodiless POST.)

**Delete action** (~line 197). Replace:
```javascript
          const resp = await fetch(`/api/v1/tasks/${taskId}`, { method: 'DELETE' });
```
With:
```javascript
          const resp = await safeFetch(`/api/v1/tasks/${taskId}`, { method: 'DELETE' });
```

### Testing

All existing tests must pass. No new tests needed — the task sheet is dead code
and the HTMX CSRF injector is additive (no existing HTMX POST/PUT/DELETE requests
to break).

### CHANGELOG entry

```
## [0.42.20] - 2026-02-09 — HTMX CSRF Protection

### Security
- **HTMX CSRF token injection** — All HTMX state-changing requests (POST/PUT/DELETE/PATCH) now automatically include the `X-CSRF-Token` header via a global `htmx:configRequest` listener
- **safeFetch coverage** — Replaced 3 raw `fetch()` calls in task sheet template with `safeFetch()`, restoring automatic CSRF injection and error handling
```

---

## PR 3: Preserve subtask hierarchy in backup export/import

**Version bump:** 0.42.21
**Type:** fix
**Risk:** Low — additive field in schema and export; import adds a second pass
for parent assignment. Backward-compatible: old backups without `parent_id` import
fine (field defaults to `None`).
**Time:** ~20 minutes

### What to do

The backup export doesn't include `parent_id`, and the import schema omits it.
Subtask hierarchies are silently lost on backup/restore. Fix both sides:
1. Add `parent_id` to the export serialization
2. Add `parent_id` to the import schema
3. Two-pass import: create all tasks first, then assign parent_id using an
   `old_id → new_id` map (same pattern as `domain_id_map`)

### File: `app/services/backup_service.py`

**Step 1: Add `parent_id` to BackupTaskSchema** (after line 52, `domain_id`). Add:
```python
    parent_id: int | None = None
```

So the class looks like:
```python
class BackupTaskSchema(BaseModel):
    """Schema for task in backup."""

    title: str
    id: int | None = None
    domain_id: int | None = None
    parent_id: int | None = None
    description: str | None = None
    ...
```

**Step 2: Add `parent_id` to export serialization** (~line 322, `_serialize_task`).
Add `parent_id` to the returned dict, after the `"domain_id"` entry:
```python
            "parent_id": task.parent_id,
```

So the method returns:
```python
        return {
            "id": task.id,
            "domain_id": task.domain_id,
            "parent_id": task.parent_id,
            "title": task.title,
            ...
```

**Step 3: Two-pass import with parent_id assignment** (~lines 242-267).

Replace the `# Import tasks` block:
```python
            # Import tasks
            for task_data in validated.tasks:
                old_domain_id = task_data.domain_id
                new_domain_id = domain_id_map.get(old_domain_id) if old_domain_id else None

                task = Task(
                    user_id=self.user_id,
                    domain_id=new_domain_id,
                    title=task_data.title,
                    description=task_data.description,
                    status=task_data.status,
                    clarity=task_data.clarity,
                    impact=task_data.impact,
                    duration_minutes=task_data.duration_minutes,
                    scheduled_date=self._parse_date(task_data.scheduled_date),
                    scheduled_time=self._parse_time(task_data.scheduled_time),
                    due_date=self._parse_date(task_data.due_date),
                    is_recurring=task_data.is_recurring,
                    recurrence_rule=task_data.recurrence_rule,
                    completed_at=self._parse_datetime(task_data.completed_at),
                    external_id=task_data.external_id,
                    external_source=task_data.external_source,
                    external_created_at=self._parse_datetime(task_data.external_created_at),
                )
                self.db.add(task)
                await self.db.flush()

                # Import task instances
                for instance_data in task_data.instances:
                    instance = TaskInstance(
                        task_id=task.id,
                        user_id=self.user_id,
                        instance_date=self._parse_date(instance_data.instance_date),
                        status=instance_data.status,
                        scheduled_datetime=self._parse_datetime(instance_data.scheduled_datetime),
                        completed_at=self._parse_datetime(instance_data.completed_at),
                    )
                    self.db.add(instance)
```

With:
```python
            # Import tasks (pass 1: create all tasks, build ID map)
            task_id_map: dict[int, int] = {}
            tasks_with_parents: list[tuple[int, int]] = []  # (old_id, old_parent_id)

            for task_data in validated.tasks:
                old_domain_id = task_data.domain_id
                new_domain_id = domain_id_map.get(old_domain_id) if old_domain_id else None

                task = Task(
                    user_id=self.user_id,
                    domain_id=new_domain_id,
                    title=task_data.title,
                    description=task_data.description,
                    status=task_data.status,
                    clarity=task_data.clarity,
                    impact=task_data.impact,
                    duration_minutes=task_data.duration_minutes,
                    scheduled_date=self._parse_date(task_data.scheduled_date),
                    scheduled_time=self._parse_time(task_data.scheduled_time),
                    due_date=self._parse_date(task_data.due_date),
                    is_recurring=task_data.is_recurring,
                    recurrence_rule=task_data.recurrence_rule,
                    completed_at=self._parse_datetime(task_data.completed_at),
                    external_id=task_data.external_id,
                    external_source=task_data.external_source,
                    external_created_at=self._parse_datetime(task_data.external_created_at),
                )
                self.db.add(task)
                await self.db.flush()

                # Track old→new ID mapping for parent assignment
                old_id = task_data.id
                if old_id is not None:
                    task_id_map[old_id] = task.id
                if old_id is not None and task_data.parent_id is not None:
                    tasks_with_parents.append((old_id, task_data.parent_id))

                # Import task instances
                for instance_data in task_data.instances:
                    instance = TaskInstance(
                        task_id=task.id,
                        user_id=self.user_id,
                        instance_date=self._parse_date(instance_data.instance_date),
                        status=instance_data.status,
                        scheduled_datetime=self._parse_datetime(instance_data.scheduled_datetime),
                        completed_at=self._parse_datetime(instance_data.completed_at),
                    )
                    self.db.add(instance)

            # Import tasks (pass 2: assign parent_id using ID map)
            for old_id, old_parent_id in tasks_with_parents:
                new_id = task_id_map.get(old_id)
                new_parent_id = task_id_map.get(old_parent_id)
                if new_id is not None and new_parent_id is not None:
                    result = await self.db.execute(
                        select(Task).where(Task.id == new_id, Task.user_id == self.user_id)
                    )
                    task = result.scalar_one_or_none()
                    if task:
                        task.parent_id = new_parent_id

            await self.db.flush()
```

Note: the `select(Task)` import should already be present at the top of the file.
Verify — if not, add it.

### Testing

All existing tests must pass. Add one test to verify subtask hierarchy is preserved:

**File: `tests/test_backup.py`** (or wherever backup tests live)

Add a test that:
1. Creates a parent task and a subtask (with `parent_id` set)
2. Exports via `BackupService.export_all()`
3. Verifies the exported JSON contains `parent_id` on the subtask
4. Wipes data and imports the JSON via `BackupService.import_all()`
5. Verifies the imported subtask has the correct `parent_id` pointing to the
   imported parent task

### CHANGELOG entry

```
## [0.42.21] - 2026-02-09 — Preserve Subtask Hierarchy in Backup

### Fixed
- **Backup export/import loses subtask hierarchy** — `parent_id` is now included in backup exports and restored on import via a two-pass ID mapping strategy, preserving parent-child task relationships across backup/restore cycles
```

---

## PR Order and Dependencies

```
PR 1 (input validation)       — independent, merge first
PR 2 (HTMX CSRF)              — independent, can merge in parallel
PR 3 (backup subtask hierarchy) — independent, can merge in parallel
```

All 3 PRs are independent. Merge in order to avoid version conflicts.

---

## Checklist for Each PR

1. [ ] Bump version in `pyproject.toml`
2. [ ] Run `uv lock`
3. [ ] Update `CHANGELOG.md` with version entry
4. [ ] Run `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
5. [ ] PR title: `v{version}/{type}: Description`
6. [ ] Create PR via `gh pr create`
