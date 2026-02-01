#!/usr/bin/env python
"""
Database migration script for Railway deployments.

Handles the case where an existing database needs to be stamped
before running migrations (tables exist but alembic_version doesn't).
"""

import asyncio
import subprocess
import sys
from pathlib import Path

# Add project root to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncpg

from app.config import get_settings


async def check_database_state() -> tuple[bool, bool]:
    """Check if alembic_version and users tables exist."""
    settings = get_settings()

    # Parse connection string for asyncpg
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(url)
    try:
        # Check if alembic_version table exists
        has_alembic = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'alembic_version'
            )
        """)

        # Check if users table exists (indicates existing database)
        has_tables = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'users'
            )
        """)

        return has_alembic, has_tables
    finally:
        await conn.close()


def main():
    """Run migrations, stamping first if needed for existing databases."""
    try:
        has_alembic, has_tables = asyncio.run(check_database_state())

        if not has_alembic and has_tables:
            print("Existing database detected. Stamping with initial migration...")
            result = subprocess.run(["alembic", "stamp", "0001_initial"], check=True)
            print(f"  Stamp completed with exit code: {result.returncode}")
        elif not has_alembic:
            print("Fresh database detected. Will create all tables.")

    except Exception as e:
        print(f"Warning: Could not check database state: {e}")
        import traceback

        traceback.print_exc()
        # Continue anyway - alembic upgrade will fail clearly if there's an issue

    # Run migrations (capture output to detect no-op)
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
    )
    # Alembic logs to stderr; check if any migrations actually ran
    stderr = result.stderr.strip() if result.stderr else ""
    has_pending = "Running upgrade" in stderr

    if has_pending:
        print("Applied migrations:")
        for line in stderr.split("\n"):
            print(f"  {line.strip()}")
    else:
        print("No pending migrations")

    if result.returncode != 0:
        print(f"Migration FAILED (exit code {result.returncode})")
        if result.stdout:
            print(result.stdout)
        if stderr:
            print(stderr)

    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
