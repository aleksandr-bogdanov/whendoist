---
version: v0.54.6
pr:
created: 2026-02-21
---

# Remove due_date/due_time + Fix Overdue & Calendar Bugs

## Context

`due_date` and `due_time` are dead-weight fields. They serve no purpose distinct from
`scheduled_date`/`scheduled_time` — no backend sorting, no filtering, no calendar sync.
They only appear in the UI as an "overdue" badge on task-item, creating confusion:
the overdue block header uses `scheduled_date` while individual badges use `due_date`,
showing wildly different overdue counts (e.g., "4d" vs "9d"). Removing them fixes the
root cause and simplifies the model. Three additional bugs are fixed in the same PR.

## Changes

### 1. DB Migration — drop `due_date` + `due_time` columns

- Create migration: `just migrate-new "drop_due_date_due_time"`
- Drop `due_date` and `due_time` from `tasks` table

### 2. Backend model + schemas

**`app/models.py`** — Remove:
- `due_date` (line 305)
- `due_time` (line 306)

**`app/routers/tasks.py`** — Remove `due_date`/`due_time` from:
- `TaskCreate` schema (lines 141-142)
- `TaskUpdate` schema (lines 195-196)
- `SubtaskResponse` (line 250)
- `TaskResponse` (lines 270-271)
- `_task_to_response()` (lines 313-314)
- `create_task` endpoint (lines 480-481)

### 3. Backend services

**`app/services/task_service.py`**:
- Remove `due_date`/`due_time` from `create_task()` signature (lines 240-241) and body (lines 292-293)
- Remove from `UPDATABLE_FIELDS` (lines 337-338)

**`app/services/demo_service.py`** — Remove all `due_date=` params (lines 213, 242, 279, 327)

**`app/services/todoist_import.py`** — Simplify: map Todoist `due.date` → `scheduled_date` only, drop `due_date`/`due_time` variables entirely (lines 274-321)

**`app/services/backup_service.py`**:
- Remove from `BackupTaskSchema` (lines 68-69)
- Remove from `import_all` (lines 307-308)
- Remove from `_serialize_task` (lines 438-439)

### 4. Tests

**`tests/test_hotfix_0_8_13.py`** — Remove `task.due_date = None` / `task.due_time = None` (lines 188-189)

**`tests/test_backup_validation.py`** — Remove `due_date`/`due_time` from test data and assertions (lines 324-325, 380-381)

**`tests/test_task_service.py`** — Remove or rewrite `test_task_with_due_date` test (lines 447-457). Convert to test `scheduled_date` if not already covered.

### 5. Frontend — task-item overdue badge

**`frontend/src/components/task/task-item.tsx`**:
- Change overdue source from `task.due_date` → `task.scheduled_date` (line 352-353)
- Update the display (lines 539-550) to show `scheduled_date` overdue badge instead

**`frontend/src/lib/task-utils.ts`** — `isOverdue()` and `formatDate()` stay as-is (they work on any date string)

### 6. Frontend — task editor "Due Date" field removal

**`frontend/src/components/task/task-editor.tsx`**:
- Remove `dueDate` state (line 97), `setDueDate` calls (lines 118, 136)
- Remove `due_date` from create/update payloads (lines 206, 238)
- Remove the entire "Due Date" form section (lines 591-631)

### 7. Bug fix — skip doesn't update overdue count

**`frontend/src/components/task/task-item.tsx`** (`handleMenuSkip`, line ~300):
- Add missing invalidation: `queryClient.invalidateQueries({ queryKey: getPendingPastCountApiV1InstancesPendingPastCountGetQueryKey() })`

**`frontend/src/components/calendar/day-column.tsx`** (`invalidateAll`, line 436-439):
- Add same missing invalidation for pending-past-count

### 8. Bug fix — anytime pills have no context menu

**`frontend/src/components/calendar/anytime-task-pill.tsx`**:
- Wrap `<button>` with `<ContextMenu>` + `<ContextMenuTrigger>`
- Add context menu items: Edit, Unschedule, Complete, Delete
- Follow `scheduled-task-card.tsx` pattern (lines 202-255)

### 9. Legacy template (minor)

**`app/templates/tasks/_task_form_content.html`** — Remove due date chip + expandable section (lines 76-112). Only affects `SERVE_LEGACY_FRONTEND=true`.

### 10. Regenerate frontend API types

- `cd frontend && npx orval` after backend schema changes

## Verification

```bash
# Backend
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test

# Frontend
cd frontend && npx orval && npx tsc --noEmit && npx biome check . && npm run build

# Migration
just migrate
```
