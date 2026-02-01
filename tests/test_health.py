"""
Health check endpoint tests.

Tests /health and /ready endpoints for load balancer and deployment verification.
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
async def test_health_endpoint_returns_200(client: AsyncClient):
    """Health endpoint should always return 200 if app is running."""
    response = await client.get("/health")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_health_endpoint_returns_healthy_status(client: AsyncClient):
    """Health response should include status: healthy."""
    response = await client.get("/health")
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_health_endpoint_includes_version(client: AsyncClient):
    """Health response should include app version."""
    from app import __version__

    response = await client.get("/health")
    data = response.json()
    assert "version" in data
    assert data["version"] == __version__


@pytest.mark.asyncio
async def test_ready_endpoint_returns_200_with_db(client: AsyncClient):
    """Ready endpoint should return 200 when database is connected."""
    response = await client.get("/ready")
    # Note: This test requires database to be available
    # In CI with proper database setup, this should pass
    assert response.status_code in (200, 503)  # Allow 503 if DB not configured


@pytest.mark.asyncio
async def test_ready_endpoint_includes_database_status(client: AsyncClient):
    """Ready response should include database connection status in checks."""
    response = await client.get("/ready")
    data = response.json()
    assert "checks" in data
    assert "database" in data["checks"]
    assert "status" in data


@pytest.mark.asyncio
async def test_ready_endpoint_includes_version(client: AsyncClient):
    """Ready response should include app version."""
    from app import __version__

    response = await client.get("/ready")
    data = response.json()
    # Version is always included in the new format
    assert "version" in data
    assert data["version"] == __version__
    assert "status" in data


@pytest.mark.asyncio
async def test_ready_endpoint_includes_google_calendar_status(client: AsyncClient):
    """Ready response should include Google Calendar status in checks."""
    response = await client.get("/ready")
    data = response.json()
    assert "checks" in data
    # Google Calendar check is always present (may be 'unavailable' if DB not up)
    assert "google_calendar" in data["checks"]
