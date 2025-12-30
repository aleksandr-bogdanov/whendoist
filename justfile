default:
    @just --list

dev:
    uv run uvicorn app.main:app --reload --port 8000

test:
    uv run pytest

lint:
    uv run ruff check .

fmt:
    uv run black .
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