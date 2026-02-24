# Whendoist Production Roadmap

> Detailed implementation plan for addressing architectural review findings.
>
> **Created:** 2025-01-22
> **Starting Version:** v0.10.1
> **Current Version:** v0.25.0
> **Status:** Production Ready

---

## Completion Status

All planned stages have been completed.

| Version | Stage | Focus | Status |
|---------|-------|-------|--------|
| v0.11.0 | 1 | Foundation & Quick Wins | COMPLETE |
| v0.12.0 | 2 | Security Hardening | COMPLETE |
| v0.13.0 | 3 | Database Migrations | COMPLETE |
| v0.14.0 | 4 | Performance Optimization | COMPLETE |
| v0.15.0 | 5 | Architecture Cleanup | COMPLETE |
| v0.16.0 | 6 | Architecture Cleanup (continued) | COMPLETE |
| v0.17.0 | 7 | Testing Infrastructure | COMPLETE |
| v0.18.0 | 8 | Production Operations | COMPLETE |
| v0.19.0 | 9 | Final Polish | COMPLETE |

**Post-roadmap releases (January 2026 review):**

| Version | Focus | Status |
|---------|-------|--------|
| v0.20.0 | Input Validation | COMPLETE |
| v0.21.0 | Google Calendar Robustness | COMPLETE |
| v0.22.0 | Database & Performance | COMPLETE |
| v0.23.0 | Testing Infrastructure | COMPLETE |
| v0.24.0 | Security Hardening | COMPLETE |
| **v0.25.0** | **Operational Polish** | **COMPLETE** |

See [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) for details on the v0.20.0 → v1.0.0 implementation.

---

## Overview

This roadmap addressed the 25 issues identified in `ARCHITECTURAL-REVIEW.md` across 9 staged releases. Each stage:
- Incremented the minor version
- Had clear acceptance criteria
- Included comprehensive testing requirements
- Was deployed independently

---

## Stage 1: Foundation & Quick Wins (v0.11.0)

**Goal:** Fix low-effort high-impact issues, establish infrastructure for later stages.

### 1.1 Version Synchronization

**Issue:** #23 Version Drift

**Files to modify:**
- `pyproject.toml` — update version to match
- `app/__init__.py` — create with `__version__`
- `CLAUDE.md` — reference single source of truth

**Implementation:**
```python
# app/__init__.py
__version__ = "0.11.0"

# pyproject.toml
[project]
version = "0.11.0"
```

**Testing:**
```python
# tests/test_version.py
def test_version_consistency():
    """Ensure all version references match."""
    from app import __version__
    import tomllib

    with open("pyproject.toml", "rb") as f:
        pyproject = tomllib.load(f)

    assert __version__ == pyproject["project"]["version"]
```

---

### 1.2 Health Check Endpoint

**Issue:** #20 No Health Check

**Files to create/modify:**
- `app/routers/health.py` — new router
- `app/main.py` — include router

**Implementation:**
```python
# app/routers/health.py
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db

router = APIRouter(tags=["health"])

@router.get("/health")
async def health():
    """Basic health check."""
    return {"status": "healthy"}

@router.get("/ready")
async def ready(db: AsyncSession = Depends(get_db)):
    """Readiness check including database connectivity."""
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ready", "database": "connected"}
    except Exception as e:
        return {"status": "not_ready", "database": str(e)}, 503
```

**Testing:**
```python
# tests/test_health.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

@pytest.mark.asyncio
async def test_ready_endpoint_with_db(client: AsyncClient):
    response = await client.get("/ready")
    assert response.status_code == 200
    assert response.json()["database"] == "connected"
```

---

### 1.3 Missing Dev Dependencies

**Issue:** #25 pyright not in dependencies

**Files to modify:**
- `pyproject.toml`

**Implementation:**
```toml
[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
    "aiosqlite>=0.20.0",
    "ruff>=0.8.0",
    "black>=24.10.0",
    "pyright>=1.1.390",
    "httpx>=0.28.0",  # for testing
]
```

**Testing:**
```bash
# CI should verify dev install works
uv sync --all-extras
uv run pyright --version
```

---

### 1.4 Database Indexes

**Issue:** #12 Missing Indexes

**Files to modify:**
- `app/models.py`

**Implementation:**
```python
from sqlalchemy import Index

class Task(Base):
    __tablename__ = "tasks"
    # ... existing columns ...

    __table_args__ = (
        Index("ix_task_user_status", "user_id", "status"),
        Index("ix_task_user_scheduled", "user_id", "scheduled_date"),
        Index("ix_task_user_domain", "user_id", "domain_id"),
        Index("ix_task_parent", "parent_id"),
    )

class TaskInstance(Base):
    __tablename__ = "task_instances"
    # ... existing columns ...

    __table_args__ = (
        Index("ix_instance_task_date", "task_id", "instance_date"),
        Index("ix_instance_user_status", "user_id", "status"),
    )

class Domain(Base):
    __tablename__ = "domains"
    # ... existing columns ...

    __table_args__ = (
        Index("ix_domain_user", "user_id"),
    )
```

**Testing:**
```python
# tests/test_indexes.py
from sqlalchemy import inspect
from app.models import Task, TaskInstance, Domain

def test_task_indexes_exist():
    """Verify critical indexes are defined."""
    indexes = {idx.name for idx in Task.__table__.indexes}
    assert "ix_task_user_status" in indexes
    assert "ix_task_user_scheduled" in indexes

def test_query_uses_index(db_session):
    """Verify query plan uses index (PostgreSQL only)."""
    # This test only runs against real PostgreSQL
    pass
```

---

### 1.5 Backup Import Validation

**Issue:** #4 No validation before delete

**Files to modify:**
- `app/services/backup_service.py`

**Implementation:**
```python
from pydantic import BaseModel, ValidationError
from typing import Any

class BackupTaskSchema(BaseModel):
    title: str
    description: str | None = None
    status: str = "pending"
    # ... all fields with validation

class BackupSchema(BaseModel):
    version: str
    exported_at: str
    domains: list[dict[str, Any]]
    tasks: list[dict[str, Any]]
    preferences: dict[str, Any] | None = None

class BackupService:
    async def import_all(self, data: dict[str, Any], clear_existing: bool = True) -> dict[str, int]:
        # STEP 1: Validate entire backup BEFORE any mutations
        try:
            validated = BackupSchema.model_validate(data)
        except ValidationError as e:
            raise ValueError(f"Invalid backup format: {e}")

        # STEP 2: Validate all tasks can be parsed
        for task_data in validated.tasks:
            try:
                BackupTaskSchema.model_validate(task_data)
            except ValidationError as e:
                raise ValueError(f"Invalid task in backup: {e}")

        # STEP 3: Only now clear existing data (inside transaction)
        async with self.db.begin_nested():  # Savepoint
            if clear_existing:
                await self._clear_user_data()

            # STEP 4: Import validated data
            # ... existing import logic ...

        return counts
```

**Testing:**
```python
# tests/test_backup_validation.py
import pytest
from app.services.backup_service import BackupService

@pytest.mark.asyncio
async def test_import_rejects_invalid_format(db_session, test_user):
    service = BackupService(db_session, test_user.id)

    with pytest.raises(ValueError, match="Invalid backup format"):
        await service.import_all({"invalid": "data"})

@pytest.mark.asyncio
async def test_import_does_not_clear_on_validation_failure(db_session, test_user):
    """Data should not be cleared if validation fails."""
    service = BackupService(db_session, test_user.id)

    # Create existing data
    # ... setup ...

    # Attempt import with invalid data
    with pytest.raises(ValueError):
        await service.import_all({"version": "1.0", "tasks": [{"bad": "data"}]})

    # Verify existing data still present
    # ... assertions ...

@pytest.mark.asyncio
async def test_import_rollback_on_partial_failure(db_session, test_user):
    """If import fails mid-way, all changes should rollback."""
    pass
```

---

### Stage 1 Acceptance Criteria

- [ ] `uv run pytest tests/test_version.py` passes
- [ ] `curl localhost:8000/health` returns 200
- [ ] `curl localhost:8000/ready` returns 200 with DB status
- [ ] All indexes created on fresh database
- [ ] Invalid backup files rejected with clear error message
- [ ] Valid backup files import successfully
- [ ] CI passes with all new dependencies

---

## Stage 2: Security Hardening (v0.12.0)

**Goal:** Address all security-critical issues.

### 2.1 WebAuthn Challenge Storage

**Issue:** #1 In-memory challenge storage

**Option A: Database Storage (recommended for simplicity)**

**Files to modify:**
- `app/models.py` — add `WebAuthnChallenge` model
- `app/routers/passkeys.py` — use database storage

**Implementation:**
```python
# app/models.py
class WebAuthnChallenge(Base):
    """Temporary storage for WebAuthn challenges."""
    __tablename__ = "webauthn_challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    challenge: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(nullable=False)

    __table_args__ = (
        Index("ix_challenge_user_expires", "user_id", "expires_at"),
    )

# app/services/challenge_service.py
from datetime import datetime, timedelta
from sqlalchemy import delete, select
from app.models import WebAuthnChallenge

CHALLENGE_TTL_SECONDS = 300  # 5 minutes

class ChallengeService:
    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id

    async def store_challenge(self, challenge: bytes) -> None:
        """Store challenge with TTL, replacing any existing."""
        # Delete old challenges for this user
        await self.db.execute(
            delete(WebAuthnChallenge).where(
                WebAuthnChallenge.user_id == self.user_id
            )
        )

        # Store new challenge
        expires_at = datetime.utcnow() + timedelta(seconds=CHALLENGE_TTL_SECONDS)
        record = WebAuthnChallenge(
            user_id=self.user_id,
            challenge=challenge,
            expires_at=expires_at,
        )
        self.db.add(record)
        await self.db.flush()

    async def get_and_consume_challenge(self) -> bytes | None:
        """Get challenge and delete it (one-time use)."""
        result = await self.db.execute(
            select(WebAuthnChallenge).where(
                WebAuthnChallenge.user_id == self.user_id,
                WebAuthnChallenge.expires_at > datetime.utcnow(),
            )
        )
        record = result.scalar_one_or_none()

        if record:
            challenge = record.challenge
            await self.db.delete(record)
            await self.db.flush()
            return challenge
        return None

    @classmethod
    async def cleanup_expired(cls, db: AsyncSession) -> int:
        """Delete all expired challenges. Run periodically."""
        result = await db.execute(
            delete(WebAuthnChallenge).where(
                WebAuthnChallenge.expires_at < datetime.utcnow()
            )
        )
        return result.rowcount
```

**Testing:**
```python
# tests/test_challenge_storage.py
import pytest
from datetime import datetime, timedelta
from app.services.challenge_service import ChallengeService

@pytest.mark.asyncio
async def test_challenge_storage_and_retrieval(db_session, test_user):
    service = ChallengeService(db_session, test_user.id)
    challenge = b"test_challenge_bytes"

    await service.store_challenge(challenge)
    retrieved = await service.get_and_consume_challenge()

    assert retrieved == challenge

@pytest.mark.asyncio
async def test_challenge_consumed_after_retrieval(db_session, test_user):
    service = ChallengeService(db_session, test_user.id)
    await service.store_challenge(b"challenge")

    # First retrieval succeeds
    assert await service.get_and_consume_challenge() is not None
    # Second retrieval fails (consumed)
    assert await service.get_and_consume_challenge() is None

@pytest.mark.asyncio
async def test_expired_challenge_not_returned(db_session, test_user):
    service = ChallengeService(db_session, test_user.id)
    # Manually create expired challenge
    # ... setup with past expires_at ...

    assert await service.get_and_consume_challenge() is None

@pytest.mark.asyncio
async def test_new_challenge_replaces_old(db_session, test_user):
    service = ChallengeService(db_session, test_user.id)

    await service.store_challenge(b"first")
    await service.store_challenge(b"second")

    retrieved = await service.get_and_consume_challenge()
    assert retrieved == b"second"

@pytest.mark.asyncio
async def test_multiuser_isolation(db_session, test_user, test_user_2):
    service1 = ChallengeService(db_session, test_user.id)
    service2 = ChallengeService(db_session, test_user_2.id)

    await service1.store_challenge(b"user1_challenge")
    await service2.store_challenge(b"user2_challenge")

    assert await service1.get_and_consume_challenge() == b"user1_challenge"
    assert await service2.get_and_consume_challenge() == b"user2_challenge"
```

---

### 2.2 Rate Limiting

**Issue:** #5 No rate limiting

**Files to create/modify:**
- `app/middleware/rate_limit.py` — new middleware
- `app/main.py` — add middleware
- `pyproject.toml` — add slowapi dependency

**Implementation:**
```python
# app/middleware/rate_limit.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

# Specific limits for sensitive endpoints
AUTH_LIMIT = "10/minute"
ENCRYPTION_LIMIT = "5/minute"
API_LIMIT = "60/minute"

# app/routers/passkeys.py (updated)
from app.middleware.rate_limit import limiter, ENCRYPTION_LIMIT

@router.post("/register/options")
@limiter.limit(ENCRYPTION_LIMIT)
async def get_registration_options(request: Request, ...):
    ...

# app/main.py
from app.middleware.rate_limit import limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
```

**Testing:**
```python
# tests/test_rate_limiting.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_rate_limit_headers_present(client: AsyncClient):
    response = await client.get("/api/tasks")
    assert "X-RateLimit-Limit" in response.headers
    assert "X-RateLimit-Remaining" in response.headers

@pytest.mark.asyncio
async def test_rate_limit_exceeded_returns_429(client: AsyncClient):
    # Make requests until limit exceeded
    for _ in range(15):  # Exceeds 10/minute for auth
        await client.post("/api/passkeys/register/options")

    response = await client.post("/api/passkeys/register/options")
    assert response.status_code == 429
    assert "Retry-After" in response.headers
```

---

### 2.3 PBKDF2 Iteration Upgrade

**Issue:** #6 100k iterations too low

**Files to modify:**
- `static/js/crypto.js`
- `app/services/preferences_service.py` — add iteration_count field

**Implementation:**
```javascript
// static/js/crypto.js
const PBKDF2_ITERATIONS_V1 = 100000;  // Legacy
const PBKDF2_ITERATIONS_V2 = 600000;  // Current (2024 OWASP recommendation)

// Detect version from salt length or metadata
function getIterationCount(version) {
    return version >= 2 ? PBKDF2_ITERATIONS_V2 : PBKDF2_ITERATIONS_V1;
}

// New setup uses v2
async function setupEncryption(passphrase) {
    const salt = generateSalt();
    const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS_V2);
    // ...
    return {
        salt: arrayToBase64(salt),
        testValue: testValue,
        version: 2,  // Track version
    };
}

// Unlock detects version and uses appropriate iterations
async function unlockEncryption(passphrase) {
    const version = window.WHENDOIST?.encryptionVersion || 1;
    const iterations = getIterationCount(version);
    // ...
}
```

**Migration path:**
1. New encryption setups use 600k iterations
2. Existing users prompted to re-setup encryption on next password change
3. Version tracked in `UserPreferences.encryption_version`

**Testing:**
```python
# tests/test_crypto_iterations.py (contract test)
def test_crypto_supports_v2_iterations():
    with open("static/js/crypto.js") as f:
        content = f.read()

    assert "PBKDF2_ITERATIONS_V2 = 600000" in content
    assert "getIterationCount" in content
```

---

### 2.4 Content Security Policy

**Issue:** #3 XSS mitigation for encryption keys

**Files to modify:**
- `app/main.py` — add CSP middleware
- `app/templates/base.html` — add nonces

**Implementation:**
```python
# app/middleware/security.py
from starlette.middleware.base import BaseHTTPMiddleware
import secrets

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)

        # Generate nonce for inline scripts
        nonce = secrets.token_urlsafe(16)
        request.state.csp_nonce = nonce

        # Strict CSP
        csp = (
            f"default-src 'self'; "
            f"script-src 'self' 'nonce-{nonce}' https://cdn.jsdelivr.net; "
            f"style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            f"img-src 'self' data: https:; "
            f"connect-src 'self' https://accounts.google.com; "
            f"frame-ancestors 'none'; "
            f"base-uri 'self'; "
            f"form-action 'self' https://accounts.google.com;"
        )

        response.headers["Content-Security-Policy"] = csp
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        return response
```

**Testing:**
```python
# tests/test_security_headers.py
@pytest.mark.asyncio
async def test_csp_header_present(client: AsyncClient):
    response = await client.get("/dashboard")
    assert "Content-Security-Policy" in response.headers
    csp = response.headers["Content-Security-Policy"]
    assert "script-src" in csp
    assert "'unsafe-eval'" not in csp

@pytest.mark.asyncio
async def test_xframe_options(client: AsyncClient):
    response = await client.get("/")
    assert response.headers["X-Frame-Options"] == "DENY"
```

---

### Stage 2 Acceptance Criteria

- [ ] WebAuthn works with multiple uvicorn workers
- [ ] Challenges expire after 5 minutes
- [ ] Rate limit returns 429 after threshold
- [ ] New encryption setups use 600k iterations
- [ ] CSP headers present on all responses
- [ ] No `'unsafe-eval'` in CSP
- [ ] All security tests pass

---

## Stage 3: Database Migrations (v0.13.0)

**Goal:** Implement Alembic migrations for production-safe schema evolution.

### 3.1 Alembic Setup

**Files to create:**
- `alembic.ini`
- `alembic/env.py`
- `alembic/versions/` — initial migration

**Implementation:**
```bash
uv add alembic
uv run alembic init alembic
```

```python
# alembic/env.py
from app.database import Base
from app.models import *  # Import all models
from app.config import get_settings

settings = get_settings()

def get_url():
    return settings.database_url

# ... standard async alembic setup ...
```

```python
# alembic/versions/001_initial_schema.py
"""Initial schema from existing models.

Revision ID: 001
Create Date: 2025-01-22
"""

def upgrade():
    # Create all tables matching current models
    # This is the "baseline" migration
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('email', sa.String(), unique=True),
        # ... all columns ...
    )
    # ... all other tables ...

def downgrade():
    op.drop_table('webauthn_challenges')
    # ... in reverse order ...
```

**Testing:**
```python
# tests/test_migrations.py
import pytest
from alembic import command
from alembic.config import Config

def test_migrations_up_down():
    """Test migrations can upgrade and downgrade cleanly."""
    alembic_cfg = Config("alembic.ini")

    # Upgrade to head
    command.upgrade(alembic_cfg, "head")

    # Downgrade to base
    command.downgrade(alembic_cfg, "base")

    # Upgrade again
    command.upgrade(alembic_cfg, "head")

def test_models_match_migrations():
    """Ensure no drift between models and migrations."""
    # Use alembic --autogenerate to check for differences
    pass
```

---

### 3.2 Migration for New Tables

**Files to create:**
- `alembic/versions/002_add_webauthn_challenges.py`

```python
"""Add WebAuthn challenges table.

Revision ID: 002
Revises: 001
"""

def upgrade():
    op.create_table(
        'webauthn_challenges',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id')),
        sa.Column('challenge', sa.LargeBinary(), nullable=False),
        sa.Column('created_at', sa.DateTime()),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_challenge_user_expires', 'webauthn_challenges',
                    ['user_id', 'expires_at'])

def downgrade():
    op.drop_index('ix_challenge_user_expires')
    op.drop_table('webauthn_challenges')
```

---

### 3.3 CI Integration

**Files to modify:**
- `.github/workflows/ci.yml`

```yaml
jobs:
  test:
    steps:
      - name: Run migrations
        run: uv run alembic upgrade head

      - name: Check for migration drift
        run: |
          uv run alembic check
          # Fails if models don't match migrations
```

---

### Stage 3 Acceptance Criteria

- [ ] `alembic upgrade head` works from clean database
- [ ] `alembic downgrade base` removes all tables
- [ ] Existing production data preserved after migration
- [ ] CI checks for migration drift
- [ ] Documentation updated to remove "no migrations" warning

---

## Stage 4: Performance Optimization (v0.14.0)

**Goal:** Address all N+1 queries and performance bottlenecks.

### 4.1 Analytics Query Optimization

**Issue:** #9 N+1 queries in analytics

**Files to modify:**
- `app/services/analytics_service.py`

**Implementation Strategy:** Combine multiple queries using CTEs and window functions.

```python
# app/services/analytics_service.py
async def get_comprehensive_stats_optimized(
    self, start_date: date, end_date: date
) -> dict:
    """
    Optimized analytics using CTEs to reduce from 20+ queries to 3-4.
    """
    range_start = datetime.combine(start_date, datetime.min.time())
    range_end = datetime.combine(end_date + timedelta(days=1), datetime.min.time())

    # Single CTE-based query for all completion data
    completion_cte = (
        select(
            Task.completed_at,
            Task.impact,
            Task.domain_id,
            literal(False).label("is_instance"),
        )
        .where(
            Task.user_id == self.user_id,
            Task.status == "completed",
            Task.completed_at >= range_start,
            Task.completed_at < range_end,
        )
        .union_all(
            select(
                TaskInstance.completed_at,
                Task.impact,
                Task.domain_id,
                literal(True).label("is_instance"),
            )
            .select_from(TaskInstance)
            .join(Task, TaskInstance.task_id == Task.id)
            .where(
                TaskInstance.user_id == self.user_id,
                TaskInstance.status == "completed",
                TaskInstance.completed_at >= range_start,
                TaskInstance.completed_at < range_end,
            )
        )
    ).cte("completions")

    # Aggregate in single query
    stats_query = select(
        func.count().label("total"),
        func.count().filter(completion_cte.c.impact == 1).label("impact_1"),
        func.count().filter(completion_cte.c.impact == 2).label("impact_2"),
        # ... more aggregations ...
    ).select_from(completion_cte)

    result = await self.db.execute(stats_query)
    # ... build response ...
```

**Testing:**
```python
# tests/test_analytics_performance.py
import pytest
from unittest.mock import patch
import time

@pytest.mark.asyncio
async def test_analytics_query_count(db_session, test_user):
    """Ensure analytics uses minimal queries."""
    service = AnalyticsService(db_session, test_user.id)

    query_count = 0
    original_execute = db_session.execute

    async def counting_execute(*args, **kwargs):
        nonlocal query_count
        query_count += 1
        return await original_execute(*args, **kwargs)

    with patch.object(db_session, 'execute', counting_execute):
        await service.get_comprehensive_stats(date.today() - timedelta(days=7), date.today())

    assert query_count <= 5, f"Too many queries: {query_count}"

@pytest.mark.asyncio
async def test_analytics_performance_with_many_tasks(db_session, test_user):
    """Analytics should complete in reasonable time with 1000+ tasks."""
    # Create 1000 completed tasks
    # ...

    start = time.time()
    await service.get_comprehensive_stats(...)
    elapsed = time.time() - start

    assert elapsed < 2.0, f"Analytics too slow: {elapsed}s"
```

---

### 4.2 Task Filtering Optimization

**Issue:** #10 In-memory filtering

**Files to modify:**
- `app/services/task_service.py`
- `app/routers/pages.py`

**Implementation:**
```python
# app/services/task_service.py
async def get_tasks(
    self,
    domain_id: int | None = None,
    status: str | None = "pending",
    has_domain: bool | None = None,  # NEW: filter by domain presence
    # ...
) -> list[Task]:
    query = select(Task).where(Task.user_id == self.user_id)

    if has_domain is True:
        query = query.where(Task.domain_id.isnot(None))
    elif has_domain is False:
        query = query.where(Task.domain_id.is_(None))

    # ... rest of filtering ...
```

```python
# app/routers/pages.py (updated)
# Before:
# all_tasks = await task_service.get_tasks(status=None, top_level_only=True)
# tasks = [t for t in all_tasks if t.domain_id is not None]

# After:
tasks = await task_service.get_tasks(status=None, top_level_only=True, has_domain=True)
```

---

### 4.3 Calendar Event Caching

**Issue:** #13 Synchronous calendar sync

**Files to create/modify:**
- `app/services/calendar_cache.py`
- `app/routers/pages.py`

**Implementation:**
```python
# app/services/calendar_cache.py
from datetime import datetime, timedelta
from typing import Any

# In production, use Redis. For now, in-memory with TTL.
_calendar_cache: dict[str, tuple[datetime, list[Any]]] = {}
CACHE_TTL = timedelta(minutes=5)

async def get_cached_events(
    user_id: int,
    calendar_ids: list[str],
    start_date: date,
    end_date: date,
    fetch_func,
) -> list[Any]:
    """Get events from cache or fetch if stale."""
    cache_key = f"{user_id}:{','.join(sorted(calendar_ids))}:{start_date}:{end_date}"

    if cache_key in _calendar_cache:
        cached_at, events = _calendar_cache[cache_key]
        if datetime.utcnow() - cached_at < CACHE_TTL:
            return events

    # Fetch fresh
    events = await fetch_func()
    _calendar_cache[cache_key] = (datetime.utcnow(), events)
    return events

async def invalidate_calendar_cache(user_id: int):
    """Clear cache for user (call after calendar selection changes)."""
    keys_to_delete = [k for k in _calendar_cache if k.startswith(f"{user_id}:")]
    for k in keys_to_delete:
        del _calendar_cache[k]
```

**Testing:**
```python
# tests/test_calendar_cache.py
@pytest.mark.asyncio
async def test_cache_returns_cached_events():
    fetch_count = 0
    async def mock_fetch():
        nonlocal fetch_count
        fetch_count += 1
        return [{"event": "test"}]

    # First call fetches
    events1 = await get_cached_events(1, ["cal1"], date.today(), date.today(), mock_fetch)
    assert fetch_count == 1

    # Second call uses cache
    events2 = await get_cached_events(1, ["cal1"], date.today(), date.today(), mock_fetch)
    assert fetch_count == 1  # No new fetch
    assert events1 == events2
```

---

### 4.4 Background Instance Materialization

**Issue:** #11 Instance materialization on every request

**Files to create:**
- `app/tasks/recurring.py` — background job

**Implementation:**
```python
# app/tasks/recurring.py
import asyncio
from datetime import date, timedelta

async def materialize_instances_background():
    """
    Background task to materialize recurring instances.
    Run every hour or on app startup.
    """
    from app.database import async_session
    from app.services.recurrence_service import RecurrenceService
    from app.models import User
    from sqlalchemy import select

    async with async_session() as db:
        # Get all users with recurring tasks
        users = await db.execute(
            select(User.id).distinct()
            .join(Task)
            .where(Task.is_recurring == True)
        )

        for (user_id,) in users:
            service = RecurrenceService(db, user_id)
            await service.ensure_instances_materialized(
                horizon_days=14  # Materialize 2 weeks ahead
            )

        await db.commit()

# app/main.py
@app.on_event("startup")
async def startup_event():
    # Run instance materialization on startup
    asyncio.create_task(materialize_instances_background())
```

---

### Stage 4 Acceptance Criteria

- [ ] Analytics page loads in < 500ms with 1000 tasks
- [ ] Dashboard query count reduced by 50%+
- [ ] Calendar events cached for 5 minutes
- [ ] Instance materialization runs in background
- [ ] All performance tests pass

---

## Stage 5: Architecture Cleanup (v0.15.0)

**Goal:** Improve code organization and maintainability.

### 5.1 Extract Business Logic from pages.py

**Issue:** #15 Mixed responsibility

**Files to create:**
- `app/services/task_grouping.py`
- `app/services/task_sorting.py`

**Implementation:**
```python
# app/services/task_grouping.py
"""
Task grouping and organization logic.

Extracted from pages.py for better testability and reuse.
"""
from datetime import date, datetime
from typing import Any
from app.models import Task, Domain, UserPreferences

class TaskGroupingService:
    """Handles task grouping by domain with sorting."""

    def __init__(self, user_prefs: UserPreferences | None = None):
        self.prefs = user_prefs or UserPreferences()

    def group_by_domain(
        self,
        tasks: list[Task],
        domains: list[Domain],
        next_instances: dict[int, dict] | None = None,
        completions: dict[int, datetime] | None = None,
    ) -> list[dict[str, Any]]:
        """Group tasks by domain with proper sorting."""
        # ... extracted logic from group_tasks_by_domain ...
```

```python
# app/services/task_sorting.py
"""Task sorting strategies."""

def sort_by_impact(task_item: dict) -> tuple:
    """Sort by impact (P1 first), then position."""
    task = task_item["task"]
    return (task.impact, task.position, task.created_at)

def sort_by_scheduled_date(task_item: dict) -> tuple:
    """Sort by scheduled date (soonest first), then impact."""
    task = task_item["task"]
    scheduled = task_item.get("next_occurrence") or task.scheduled_date or date.max
    return (scheduled, task.impact, task.position)

def sort_by_completion_date(task_item: dict) -> tuple:
    """Sort by completion date (most recent first)."""
    completed_at = task_item.get("instance_completed_at") or task_item["task"].completed_at
    timestamp = -completed_at.timestamp() if completed_at else float("inf")
    return (timestamp, task_item["task"].impact)
```

**Testing:**
```python
# tests/test_task_grouping.py
from app.services.task_grouping import TaskGroupingService
from app.services.task_sorting import sort_by_impact

def test_group_tasks_by_domain():
    service = TaskGroupingService()
    # ... test grouping logic in isolation ...

def test_sort_by_impact_orders_correctly():
    tasks = [
        {"task": Mock(impact=4, position=0)},
        {"task": Mock(impact=1, position=0)},
        {"task": Mock(impact=2, position=0)},
    ]

    sorted_tasks = sorted(tasks, key=sort_by_impact)

    assert [t["task"].impact for t in sorted_tasks] == [1, 2, 4]
```

---

### 5.2 Constants Module

**Issue:** #17 Hardcoded business rules

**Files to create:**
- `app/constants.py`

**Implementation:**
```python
# app/constants.py
"""
Centralized business constants.

Change values here to update behavior across the app.
"""
from enum import Enum, IntEnum

class Impact(IntEnum):
    """Task impact/priority levels."""
    CRITICAL = 1
    HIGH = 2
    MEDIUM = 3
    LOW = 4

    @classmethod
    def all(cls) -> list[int]:
        return [e.value for e in cls]

    @classmethod
    def labels(cls) -> dict[int, str]:
        return {
            cls.CRITICAL: "Critical",
            cls.HIGH: "High",
            cls.MEDIUM: "Medium",
            cls.LOW: "Low",
        }

class Clarity(str, Enum):
    """Task clarity levels."""
    EXECUTABLE = "executable"
    DEFINED = "defined"
    EXPLORATORY = "exploratory"

class RetentionDays(IntEnum):
    """Valid completed task retention periods."""
    ONE_DAY = 1
    THREE_DAYS = 3
    ONE_WEEK = 7

    @classmethod
    def is_valid(cls, days: int) -> bool:
        return days in [e.value for e in cls]

# Crypto constants
PBKDF2_ITERATIONS_V1 = 100_000
PBKDF2_ITERATIONS_V2 = 600_000
CHALLENGE_TTL_SECONDS = 300
ENCRYPTION_TEST_VALUE = "WHENDOIST_ENCRYPTION_TEST"
```

---

### 5.3 API Versioning Preparation

**Issue:** #16 No API versioning

**Files to modify:**
- `app/main.py`
- `app/routers/*.py`

**Implementation:**
```python
# app/routers/v1/__init__.py
"""API v1 routers."""
from fastapi import APIRouter
from app.routers import tasks, domains, preferences, passkeys

router = APIRouter(prefix="/api/v1")
router.include_router(tasks.router)
router.include_router(domains.router)
# ...

# app/main.py
from app.routers.v1 import router as v1_router

# Legacy routes (deprecated, remove in v2)
app.include_router(tasks.router)  # /api/tasks

# Versioned routes
app.include_router(v1_router)  # /api/v1/tasks
```

**Note:** Full migration happens over 2 releases:
1. v0.15.0: Add v1 prefix, keep legacy routes
2. v0.17.0: Deprecation warnings on legacy routes
3. v1.0.0: Remove legacy routes

---

### Stage 5 Acceptance Criteria

- [ ] `pages.py` reduced to < 400 lines
- [ ] All business constants in `constants.py`
- [ ] Task grouping has dedicated tests
- [ ] API accessible at both `/api/tasks` and `/api/v1/tasks`
- [ ] No functionality changes (refactor only)

---

## Stage 6: Testing Infrastructure (v0.16.0)

**Goal:** Production-grade testing with PostgreSQL parity.

### 6.1 PostgreSQL Test Container

**Issue:** #18 SQLite vs PostgreSQL mismatch

**Files to modify:**
- `pyproject.toml` — add testcontainers
- `tests/conftest.py` — PostgreSQL fixture

**Implementation:**
```toml
# pyproject.toml
[project.optional-dependencies]
dev = [
    # ...
    "testcontainers[postgres]>=4.0.0",
]
```

```python
# tests/conftest.py
import pytest
from testcontainers.postgres import PostgresContainer
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

@pytest.fixture(scope="session")
def postgres_container():
    """Start PostgreSQL container for test session."""
    with PostgresContainer("postgres:16") as postgres:
        yield postgres

@pytest.fixture
async def pg_session(postgres_container):
    """Create async session with real PostgreSQL."""
    url = postgres_container.get_connection_url().replace(
        "postgresql://", "postgresql+asyncpg://"
    )
    engine = create_async_engine(url)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, class_=AsyncSession)

    async with async_session() as session:
        yield session

    await engine.dispose()

# Keep SQLite for fast unit tests
@pytest.fixture
async def db_session():
    """In-memory SQLite for fast unit tests."""
    # ... existing implementation ...
```

**Testing Strategy:**
- Unit tests: SQLite (fast, isolated)
- Integration tests: PostgreSQL container (production parity)
- Mark tests appropriately:

```python
@pytest.mark.unit
async def test_fast_logic(db_session):
    pass

@pytest.mark.integration
async def test_postgres_specific(pg_session):
    pass
```

---

### 6.2 End-to-End Test Suite

**Files to create:**
- `tests/e2e/conftest.py`
- `tests/e2e/test_full_flows.py`

**Implementation:**
```python
# tests/e2e/test_full_flows.py
"""
Full user flow E2E tests using Playwright.
"""
import pytest
from playwright.async_api import Page

@pytest.mark.e2e
async def test_complete_onboarding_flow(page: Page, test_server):
    """Test complete new user onboarding."""
    await page.goto(test_server.url)

    # Login via Google OAuth mock
    await page.click("[data-testid='google-login']")

    # Complete wizard
    await page.click("[data-testid='wizard-next']")
    # ... complete all steps ...

    # Verify dashboard loaded
    await page.wait_for_selector(".task-list")
    assert await page.title() == "Tasks - Whendoist"

@pytest.mark.e2e
async def test_encryption_setup_and_unlock(page: Page, test_server, authenticated_user):
    """Test E2E encryption flow."""
    await page.goto(f"{test_server.url}/settings")

    # Enable encryption
    await page.click("[data-testid='enable-encryption']")
    await page.fill("[data-testid='passphrase']", "test-passphrase-123")
    await page.fill("[data-testid='passphrase-confirm']", "test-passphrase-123")
    await page.click("[data-testid='confirm-encryption']")

    # Verify encryption enabled
    await page.wait_for_selector("[data-testid='encryption-badge']")

    # Reload and unlock
    await page.reload()
    await page.fill("[data-testid='unlock-passphrase']", "test-passphrase-123")
    await page.click("[data-testid='unlock-submit']")

    # Verify unlocked
    await page.wait_for_selector(".task-list")
```

---

### 6.3 Contract Test Expansion

**Files to modify:**
- `tests/test_js_module_contract.py`

**Implementation:**
```python
# tests/test_js_module_contract.py
"""
JavaScript module contract tests.

These verify that JS modules export expected APIs without running a browser.
Catches integration bugs early.
"""
import pytest
from pathlib import Path

JS_DIR = Path("static/js")

class TestCryptoModuleContract:
    @pytest.fixture
    def crypto_js(self):
        return (JS_DIR / "crypto.js").read_text()

    def test_exports_required_functions(self, crypto_js):
        required = [
            "isEncryptionEnabled",
            "canCrypto",
            "setupEncryption",
            "unlockEncryption",
            "encryptField",
            "decryptField",
        ]
        for func in required:
            assert func in crypto_js, f"Missing export: {func}"

    def test_uses_secure_iterations(self, crypto_js):
        assert "PBKDF2_ITERATIONS_V2 = 600000" in crypto_js

    def test_no_eval_usage(self, crypto_js):
        assert "eval(" not in crypto_js
        assert "Function(" not in crypto_js

class TestDragDropModuleContract:
    @pytest.fixture
    def dragdrop_js(self):
        return (JS_DIR / "drag-drop.js").read_text()

    def test_exports_required_functions(self, dragdrop_js):
        required = [
            "createScheduledTaskElement",
            "recalculateOverlaps",
        ]
        for func in required:
            assert f"window.{func}" in dragdrop_js
```

---

### Stage 6 Acceptance Criteria

- [ ] PostgreSQL container tests pass
- [ ] E2E tests cover critical user flows
- [ ] Contract tests verify all JS module APIs
- [ ] Test coverage > 80%
- [ ] CI runs both SQLite and PostgreSQL tests

---

## Stage 7: Production Operations (v0.17.0)

**Goal:** Observability, logging, and operational readiness.

### 7.1 Structured Logging

**Issue:** #21 No structured logging

**Files to create/modify:**
- `app/logging.py`
- `app/main.py`

**Implementation:**
```python
# app/logging.py
import logging
import json
import sys
from datetime import datetime
from contextvars import ContextVar

# Request context
request_id_var: ContextVar[str] = ContextVar("request_id", default="")

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_var.get(),
        }

        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)

        if hasattr(record, "user_id"):
            log_record["user_id"] = record.user_id

        return json.dumps(log_record)

def setup_logging(json_output: bool = True):
    handler = logging.StreamHandler(sys.stdout)

    if json_output:
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        ))

    root = logging.getLogger()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
```

```python
# app/middleware/request_id.py
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from app.logging import request_id_var

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request_id_var.set(request_id)

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id

        return response
```

---

### 7.2 Metrics with Prometheus

**Issue:** #22 No monitoring

**Files to create:**
- `app/middleware/metrics.py`

**Implementation:**
```python
# app/middleware/metrics.py
from prometheus_client import Counter, Histogram, generate_latest
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Response
import time

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"]
)

REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "endpoint"]
)

DB_QUERY_LATENCY = Histogram(
    "db_query_duration_seconds",
    "Database query latency",
    ["operation"]
)

class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.time()

        response = await call_next(request)

        duration = time.time() - start
        endpoint = request.url.path

        REQUEST_COUNT.labels(
            method=request.method,
            endpoint=endpoint,
            status=response.status_code
        ).inc()

        REQUEST_LATENCY.labels(
            method=request.method,
            endpoint=endpoint
        ).observe(duration)

        return response

# Endpoint for Prometheus scraping
async def metrics_endpoint():
    return Response(
        content=generate_latest(),
        media_type="text/plain"
    )
```

---

### 7.3 Error Tracking Preparation

**Files to create:**
- `app/error_tracking.py`

**Implementation:**
```python
# app/error_tracking.py
"""
Error tracking integration.

Supports Sentry when configured, falls back to logging.
"""
import logging
from app.config import get_settings

logger = logging.getLogger(__name__)
_sentry_initialized = False

def init_error_tracking():
    global _sentry_initialized
    settings = get_settings()

    if settings.sentry_dsn:
        import sentry_sdk
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            traces_sample_rate=0.1,
            environment=settings.environment,
        )
        _sentry_initialized = True
        logger.info("Sentry error tracking initialized")

def capture_exception(exc: Exception, **context):
    if _sentry_initialized:
        import sentry_sdk
        with sentry_sdk.push_scope() as scope:
            for key, value in context.items():
                scope.set_extra(key, value)
            sentry_sdk.capture_exception(exc)
    else:
        logger.exception(f"Error: {exc}", extra=context)
```

---

### Stage 7 Acceptance Criteria

- [ ] Logs output as JSON in production
- [ ] Request IDs in all log entries
- [ ] `/metrics` endpoint returns Prometheus format
- [ ] Request latency tracked per endpoint
- [ ] Error tracking ready for Sentry (optional)

---

## Stage 8: Final Polish & Launch (v1.0.0)

**Goal:** Production launch readiness.

### 8.1 Security Audit

**Tasks:**
- [ ] Audit OAuth state handling
- [ ] Review all user input validation
- [ ] Check for SQL injection (should be none with SQLAlchemy)
- [ ] Verify CORS configuration
- [ ] Review CSP for completeness
- [ ] Check session cookie settings

### 8.2 Documentation

**Files to create/update:**
- `docs/DEPLOYMENT.md`
- `docs/SECURITY.md`
- `docs/API.md` (OpenAPI export)

### 8.3 Remove Deprecations

- Remove legacy `/api/*` routes (use `/api/v1/*`)
- Remove SQLite development support (PostgreSQL only)
- Clean up feature flags

### 8.4 Final Testing

**Checklist:**
- [ ] All tests pass
- [ ] Performance benchmarks met
- [ ] Security scan clean
- [ ] Backup/restore verified
- [ ] Encryption upgrade path tested
- [ ] Multi-worker deployment verified

### 8.5 Launch Checklist

- [ ] Database backed up
- [ ] Migrations tested on staging
- [ ] Rollback plan documented
- [ ] Monitoring dashboards ready
- [ ] On-call rotation set up
- [ ] Support channels ready

---

## Version Summary

| Version | Focus | Key Deliverables |
|---------|-------|------------------|
| **v0.11.0** | Foundation | Health checks, indexes, backup validation |
| **v0.12.0** | Security | Rate limiting, challenge storage, CSP |
| **v0.13.0** | Migrations | Alembic setup, schema versioning |
| **v0.14.0** | Performance | Query optimization, caching |
| **v0.15.0** | Architecture | Code organization, constants |
| **v0.16.0** | Testing | PostgreSQL tests, E2E suite |
| **v0.17.0** | Operations | Logging, metrics, error tracking |
| **v1.0.0** | Launch | Security audit, documentation |

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| Migration data loss | Test on staging, backup before migration |
| Performance regression | Automated benchmarks in CI |
| Security vulnerability | Regular dependency updates, security scans |
| Breaking API changes | Versioned API, deprecation period |
| Encryption key loss | Recovery key feature (planned) |

---

## Dependencies

```
New dependencies per stage:

v0.12.0: slowapi
v0.13.0: alembic
v0.16.0: testcontainers[postgres]
v0.17.0: prometheus-client, sentry-sdk (optional)
```

---

## Questions for User

Before beginning implementation:

1. **Redis availability?** For challenge storage, would you prefer Redis (better for multi-instance) or database storage (simpler)?

2. **Deployment target?** Railway, Fly.io, Kubernetes? Affects health check and metrics configuration.

3. **Error tracking preference?** Sentry, or logging-only for now?

4. **Migration priority?** Some stages could be parallelized. Which is most urgent?
