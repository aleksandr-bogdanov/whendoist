default:
    @just --list

dev:
    #!/usr/bin/env bash
    trap 'kill 0' EXIT
    uv run uvicorn app.main:app --reload --port 8000 &
    cd frontend && npm run dev &
    wait

dev-backend:
    uv run uvicorn app.main:app --reload --port 8000

test:
    uv run pytest

lint:
    uv run ruff check .

fmt:
    uv run ruff format .
    uv run ruff check --fix .

sync:
    uv sync

# Docker
db-up:
    docker compose up -d

db-down:
    docker compose down

db-logs:
    docker compose logs -f db

db-psql:
    docker compose exec db psql -U whendoist

db-flush:
    docker compose down -v
    docker compose up -d

db-nuke:
    docker compose down -v --rmi all
    docker volume prune -f

# Backups
_ensure-backup-dir:
    @mkdir -p .backups

# Quick save/load (single slot)
quicksave: _ensure-backup-dir
    @echo "💾 Saving database state..."
    docker compose exec -T db pg_dump -U whendoist -c --if-exists whendoist > .backups/quicksave.sql
    @echo "✅ Saved to .backups/quicksave.sql ($(wc -l < .backups/quicksave.sql) lines)"

quickload:
    @if [ ! -f .backups/quicksave.sql ]; then echo "❌ No quicksave found. Run 'just quicksave' first."; exit 1; fi
    @echo "📂 Loading database state..."
    docker compose exec -T db psql -U whendoist whendoist < .backups/quicksave.sql
    @echo "✅ Restored from .backups/quicksave.sql"

# Named backups
backup name: _ensure-backup-dir
    @echo "💾 Creating backup '{{name}}'..."
    docker compose exec -T db pg_dump -U whendoist -c --if-exists whendoist > .backups/{{name}}.sql
    @echo "✅ Saved to .backups/{{name}}.sql"

restore name:
    @if [ ! -f .backups/{{name}}.sql ]; then echo "❌ Backup '{{name}}' not found."; exit 1; fi
    @echo "📂 Restoring from '{{name}}'..."
    docker compose exec -T db psql -U whendoist whendoist < .backups/{{name}}.sql
    @echo "✅ Restored from .backups/{{name}}.sql"

# List available backups
backups:
    @echo "📋 Available backups:"
    @ls -lh .backups/*.sql 2>/dev/null || echo "   (none)"

# ============================================================================
# Tauri (Mobile)
# ============================================================================

# Start Tauri Android dev (runs backend separately with `just dev-backend`)
tauri-android:
    cd frontend && TAURI_DEV_HOST=$(ipconfig getifaddr en0) npx tauri android dev

# Start Tauri iOS dev (physical device — bundled build, fast)
# Builds frontend first, serves via vite preview. Rebuild to pick up changes.
tauri-ios:
    cd frontend && npx vite build --mode development && TAURI_DEV_HOST=$(ipconfig getifaddr en0) npx tauri ios dev -c '{"build":{"beforeDevCommand":"npx vite preview --port 5173 --host 0.0.0.0"}}'

# Start Tauri iOS dev with HMR (slow — unbundled modules over WiFi)
# Only use when actively iterating on frontend code and need live reload.
tauri-ios-hmr:
    cd frontend && TAURI_DEV_HOST=$(ipconfig getifaddr en0) npx tauri ios dev

# Start Tauri iOS dev on simulator
tauri-ios-sim device="iPhone 17 Pro":
    cd frontend && npx tauri ios dev "{{device}}"

# Build Android APK/AAB (release)
tauri-build-android:
    cd frontend && npx tauri android build

# Build iOS app (release)
tauri-build-ios:
    cd frontend && npx tauri ios build

# Initialize Tauri Android project (run once after scaffold)
tauri-android-init:
    cd frontend && npx tauri android init

# Initialize Tauri iOS project (run once after scaffold)
tauri-ios-init:
    cd frontend && npx tauri ios init

# ============================================================================
# Database Migrations (Alembic)
# ============================================================================

# Apply all pending migrations
migrate:
    uv run alembic upgrade head

# Show current migration status
migrate-status:
    uv run alembic current

# Show migration history
migrate-history:
    uv run alembic history

# Create new migration from model changes (autogenerate)
migrate-new message:
    uv run alembic revision --autogenerate -m "{{message}}"

# Create empty migration for manual edits
migrate-empty message:
    uv run alembic revision -m "{{message}}"

# Rollback last migration
migrate-rollback:
    uv run alembic downgrade -1

# Stamp database with migration version (for existing DBs)
migrate-stamp revision="0001_initial":
    uv run alembic stamp {{revision}}

# Generate SQL for migrations (without applying)
migrate-sql:
    uv run alembic upgrade head --sql