"""
Task Item Partial Endpoint Tests.

Tests GET /api/v1/task-item/{task_id} which returns server-rendered HTML
for a single task item. Used by TaskMutations.insertNewTask() for task creation.

Test Category: Unit (fast, no I/O)
"""

import pytest
from httpx import ASGITransport, AsyncClient
from jinja2 import Environment, FileSystemLoader

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


def test_task_item_template_compiles_without_error():
    """
    Regression test for Sentry issue WHENDOIST-G (KeyError: 'request').
    
    The _task_item.html template imports render_task_item macro from _task_item_macro.html.
    This test ensures the template can be compiled without raising KeyError for 'request'
    or 'url_for', which would happen if the macro file contained top-level url_for calls.
    """
    env = Environment(loader=FileSystemLoader("app/templates"))
    
    # This should compile without KeyError: 'request' or 'url_for'
    template = env.get_template("_task_item.html")
    assert template is not None
    
    # Also verify _task_list.html compiles (it imports from the same macro file)
    template = env.get_template("_task_list.html")
    assert template is not None

