#!/usr/bin/env python
"""
Database migration script for Railway deployments.

Handles the case where an existing database needs to be stamped
before running migrations (tables exist but alembic_version doesn't).
"""

import asyncio
import subprocess
import sys

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
            subprocess.run(["alembic", "stamp", "0001_initial"], check=True)
        elif not has_alembic:
            print("Fresh database detected. Will create all tables.")
        else:
            print("Alembic already initialized.")

    except Exception as e:
        print(f"Warning: Could not check database state: {e}")
        # Continue anyway - alembic upgrade will fail clearly if there's an issue

    # Run migrations
    print("Running migrations...")
    result = subprocess.run(["alembic", "upgrade", "head"])
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
