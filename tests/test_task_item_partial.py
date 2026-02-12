"""
Task Item Partial Endpoint Tests.

Tests GET /api/v1/task-item/{task_id} which returns server-rendered HTML
for a single task item. Used by TaskMutations.insertNewTask() for task creation.

Test Category: Unit (fast, no I/O)
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    """Create an async test client for the FastAPI app."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_task_item_returns_401_when_not_authenticated(client: AsyncClient):
    """Endpoint must require authentication."""
    response = await client.get("/api/v1/task-item/1")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_task_item_returns_401_for_nonexistent_task(client: AsyncClient):
    """Non-authenticated request for nonexistent task returns 401, not 404."""
    response = await client.get("/api/v1/task-item/99999")
    assert response.status_code == 401
