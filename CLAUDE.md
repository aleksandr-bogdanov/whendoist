# Whendoist

Task scheduling app: native tasks + Google Calendar.

**Docs index:** See [README.md#documentation](README.md#-documentation) for all guides.

---

## Commands

```bash
# Before EVERY commit (all must pass, CI enforces)
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test

# Database migrations (required for ALL schema changes)
just migrate-new "description"   # Create migration after changing models.py
just migrate                     # Apply migration
# Commit BOTH model changes AND migration file
```

---

## Rules

### 1. Git: Never push to master
Always create PRs. Only push directly if user explicitly requests it.

### 2. Multitenancy: Always filter by user_id
```python
# CORRECT
select(Task).where(Task.id == task_id, Task.user_id == self.user_id)

# WRONG — data leak
select(Task).where(Task.id == task_id)
```
Batch operations: **skip** unowned IDs silently, never fail.

### 3. API Routes: Register in BOTH places
```python
# 1. app/main.py (legacy_api, ~line 217)
legacy_api.include_router(my_router.router)

# 2. app/routers/v1/__init__.py (versioned)
router.include_router(my_router.router)
```
Router files use resource prefix only: `APIRouter(prefix="/tasks")` — not `/api/tasks`.

### 4. Encryption: Global toggle only
- **One toggle:** `user.encryption_enabled` — no per-record flags
- **Encrypted fields (3 only):** `Task.title`, `Task.description`, `Domain.name`
- Everything else (dates, priority, status) stays plaintext for server-side filtering

### 5. Constants: Use `app.constants`
```python
from app.constants import DEFAULT_IMPACT, CHALLENGE_TTL_SECONDS  # correct
TTL = 300  # wrong - magic number
```

### 6. Query patterns: Batch, don't loop
```python
# CORRECT: Single query with GROUP BY
stats = select(Task.id, func.count()).where(Task.id.in_(ids)).group_by(Task.id)

# WRONG: N+1 loop
for task in tasks:
    count = await db.execute(select(func.count()).where(...))
```

For Task + TaskInstance queries, use `union_all`:
```python
task_q = select(Task.completed_at, literal(False).label("is_instance")).where(...)
instance_q = select(TaskInstance.completed_at, literal(True).label("is_instance")).where(...)
combined = union_all(task_q, instance_q)  # Single query, not two
```

---

## Documentation

**Document significant changes.** When adding features, fixing non-trivial bugs, or changing architecture:

1. **Update or create** a doc in `docs/` (e.g., `docs/FEATURE-NAME.md`)
2. **Add to README** documentation index at `README.md#-documentation`
3. **Update CHANGELOG.md** with version entry

This keeps the codebase navigable without reading everything.
