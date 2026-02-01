# Whendoist

Task scheduling app: native tasks + Google Calendar.

**Website:** [whendoist.com](https://whendoist.com)
**Docs:** See [README.md#documentation](README.md#-documentation) for all guides.

---

## Vibecode-First Project

This is a vibecoded project. Testing philosophy:

- **Only write tests that run in CI automatically** — no manual test execution
- **No E2E/Playwright tests** — they require manual setup and won't be run
- **Unit tests (SQLite)** — fast, run on every PR
- **Integration tests (PostgreSQL)** — run in CI with service containers

If a test can't run automatically in GitHub Actions, don't write it.

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
Always create PRs — even for version bumps or small fixes. "Push to deploy" means
"create a PR so CI runs and Railway deploys on merge." Only push directly to master
if the user says **exactly** "push to master" or "push directly."

### 2. Versioned PRs and commits: `v{version}/{type}: Description`
**Every PR must bump the version in `pyproject.toml`** and use that version in the title.
The PR title becomes the merge commit message (GitHub is configured for this).

Format: `v{version}/{type}: Description`
Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`.
```
v0.30.1/fix: Resolve login timeout on slow connections
v0.30.2/feat: Add subtask hierarchy to Todoist import
v0.30.3/chore: Quieter production logs
v0.31.0/refactor: Rewrite calendar sync engine
```

Checklist for every PR:
1. Bump version in `pyproject.toml`
2. Run `uv lock` (Railway requires lockfile in sync)
3. Update `CHANGELOG.md` with version entry
4. PR title matches `v{new_version}/{type}: Description`

### 3. Multitenancy: Always filter by user_id
```python
# CORRECT
select(Task).where(Task.id == task_id, Task.user_id == self.user_id)

# WRONG — data leak
select(Task).where(Task.id == task_id)
```
Batch operations: **skip** unowned IDs silently, never fail.

### 4. API Routes: Versioned only
All API routes are registered in `app/routers/v1/__init__.py` and served at `/api/v1/*`.
Router files use resource prefix only: `APIRouter(prefix="/tasks")` — not `/api/tasks`.

### 5. Encryption: Global toggle only
- **One toggle:** `user.encryption_enabled` — no per-record flags
- **Encrypted fields (3 only):** `Task.title`, `Task.description`, `Domain.name`
- Everything else (dates, priority, status) stays plaintext for server-side filtering

### 6. Constants: Use `app.constants`
```python
from app.constants import DEFAULT_IMPACT, CHALLENGE_TTL_SECONDS  # correct
TTL = 300  # wrong - magic number
```

### 7. Query patterns: Batch, don't loop
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
