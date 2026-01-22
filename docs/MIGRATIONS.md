# Database Migrations Guide

This document explains how to manage database schema changes in Whendoist using Alembic.

## Overview

Whendoist uses **Alembic** for database migrations with async SQLAlchemy support. Migrations are version-controlled Python scripts that modify the database schema.

**Key Points:**
- Schema changes MUST go through migrations (no more manual `create_all()`)
- Migrations run automatically on Railway deploy via release command
- Local development requires manual `just migrate` after pulling changes

## Quick Reference

| Command | Description |
|---------|-------------|
| `just migrate` | Apply all pending migrations |
| `just migrate-status` | Show current migration version |
| `just migrate-history` | Show full migration history |
| `just migrate-new "description"` | Create migration from model changes |
| `just migrate-empty "description"` | Create empty migration for manual SQL |
| `just migrate-rollback` | Revert last migration |

## Local Development Workflow

### 1. After Pulling Changes

If someone else added migrations:

```bash
git pull
just migrate
```

### 2. Adding a New Column

1. Update the model in `app/models.py`:
   ```python
   class Task(Base):
       # ... existing columns ...
       new_column: Mapped[str | None] = mapped_column(String(100), nullable=True)
   ```

2. Generate migration:
   ```bash
   just migrate-new "add new_column to tasks"
   ```

3. Review the generated file in `alembic/versions/`

4. Apply the migration:
   ```bash
   just migrate
   ```

5. Commit both the model change AND the migration file

### 3. Creating a New Table

1. Create the model in `app/models.py`

2. Import it in `alembic/env.py` (so Alembic can detect it):
   ```python
   from app.models import NewModel  # noqa: F401
   ```

3. Generate and apply:
   ```bash
   just migrate-new "create new_model table"
   just migrate
   ```

### 4. Complex Migrations (Data Migration)

For migrations that need to transform data:

```bash
just migrate-empty "migrate user data format"
```

Then edit the generated file to add custom logic:

```python
def upgrade() -> None:
    # Add new column
    op.add_column("users", sa.Column("full_name", sa.String(255)))

    # Migrate data
    connection = op.get_bind()
    connection.execute(
        sa.text("UPDATE users SET full_name = first_name || ' ' || last_name")
    )

    # Drop old columns
    op.drop_column("users", "first_name")
    op.drop_column("users", "last_name")
```

## Production Deployment (Railway)

### Automatic Migrations

Railway runs migrations automatically on every deploy:

```toml
# railway.toml
[deploy]
releaseCommand = "uv run alembic upgrade head"
```

The release command runs:
1. After the build completes
2. Before the new version starts serving traffic
3. Only once per deploy (not per worker)

### First Deployment with Existing Database

If you have an existing database that was created with `create_all()`:

```bash
# SSH into Railway or use railway run
railway run uv run alembic stamp 0001_initial
```

This marks the database as being at the initial migration without running it.

### Viewing Migration Status

```bash
railway run uv run alembic current
railway run uv run alembic history
```

## Troubleshooting

### "Target database is not up to date"

Your database is behind. Run migrations:
```bash
just migrate
```

### "Can't locate revision"

Migration files are missing or database references non-existent revision:
```bash
just migrate-history  # Check what exists
just migrate-stamp 0001_initial  # Reset to known state if needed
```

### Migration Fails Halfway

If a migration partially applies and fails:

1. Check what state the database is in
2. Fix the migration file
3. Manually clean up if needed
4. Re-run `just migrate`

For production, consider:
- Using transactions (Alembic does this by default for PostgreSQL)
- Testing migrations on a staging database first

### Autogenerate Misses Changes

Alembic autogenerate has limitations. It may miss:
- Table/column renames (sees as drop + create)
- Changes to constraints
- Custom types

For these, use `just migrate-empty` and write manually.

## Best Practices

### DO:
- **Test migrations locally** before pushing
- **Write reversible migrations** with proper `downgrade()`
- **Keep migrations small** - one logical change per migration
- **Include data migrations** when changing column types
- **Commit migrations with the code that requires them**

### DON'T:
- **Don't edit applied migrations** - create a new one instead
- **Don't delete migration files** - they're part of history
- **Don't skip migrations** in production
- **Don't modify models without a migration**

## File Structure

```
alembic/
├── env.py              # Migration environment (async SQLAlchemy config)
├── script.py.mako      # Template for new migrations
├── README              # Quick reference
└── versions/           # Migration files
    └── 20250122_000000_initial_schema.py
```

## Migration Naming Convention

Migrations are auto-named with timestamp + description:
```
20250122_143052_add_priority_to_tasks.py
```

Format: `YYYYMMDD_HHMMSS_description.py`

## Testing Migrations

The test suite uses in-memory SQLite with `Base.metadata.create_all()`, so tests don't run migrations. This is intentional:

- Tests are fast (no migration overhead)
- Tests verify current model state
- Migration testing should be done manually against PostgreSQL

To test a migration against a real database:

```bash
# Create a test database
docker compose exec db createdb -U whendoist whendoist_test

# Set test database URL
export DATABASE_URL=postgresql://whendoist:whendoist@localhost:5432/whendoist_test

# Run migrations
just migrate

# Verify schema
docker compose exec db psql -U whendoist whendoist_test -c "\dt"

# Clean up
docker compose exec db dropdb -U whendoist whendoist_test
```

## Emergency Procedures

### Rolling Back in Production

```bash
# Check current version
railway run uv run alembic current

# Rollback one version
railway run uv run alembic downgrade -1

# Deploy previous code version that matches the schema
```

### Complete Reset (Development Only)

```bash
just db-flush        # Destroys all data!
just migrate         # Re-apply all migrations
```

**Never do this in production.**
