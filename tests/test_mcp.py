"""
MCP (Model Context Protocol) endpoint tests.

Verifies:
- MCP endpoint is reachable at /mcp (both with and without trailing slash)
- Authentication via Bearer token is enforced
- POST, GET, DELETE methods are accepted (not 405)
- SPA catch-all does not intercept /mcp paths
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.routers.device_auth import _create_access_token


@pytest.fixture
async def client():
    """Create an async test client for the FastAPI app."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
def auth_headers():
    """Create valid Bearer token headers for user_id=1."""
    token = _create_access_token(user_id=1)
    return {"Authorization": f"Bearer {token}"}


# =============================================================================
# Routing: /mcp must not return 405 (Method Not Allowed)
# =============================================================================


class TestMCPRouting:
    """Verify /mcp requests reach the MCP handler, not the SPA catch-all."""

    @pytest.mark.asyncio
    async def test_post_mcp_no_trailing_slash_not_405(self, client: AsyncClient):
        """POST /mcp must not return 405 — this was the original bug."""
        response = await client.post("/mcp")
        assert response.status_code != 405, "POST /mcp returned 405 — SPA catch-all is intercepting"

    @pytest.mark.asyncio
    async def test_post_mcp_trailing_slash_not_405(self, client: AsyncClient):
        """POST /mcp/ must not return 405."""
        response = await client.post("/mcp/")
        assert response.status_code != 405, "POST /mcp/ returned 405"

    @pytest.mark.asyncio
    async def test_get_mcp_not_html(self, client: AsyncClient):
        """GET /mcp must not return the SPA HTML page."""
        response = await client.get("/mcp")
        content_type = response.headers.get("content-type", "")
        assert "text/html" not in content_type, "GET /mcp returned HTML — SPA catch-all is intercepting"

    @pytest.mark.asyncio
    async def test_delete_mcp_not_405(self, client: AsyncClient):
        """DELETE /mcp must not return 405."""
        response = await client.delete("/mcp")
        assert response.status_code != 405, "DELETE /mcp returned 405"


# =============================================================================
# Authentication: Bearer token required
# =============================================================================


class TestMCPAuthentication:
    """Verify MCP endpoint enforces Bearer token authentication."""

    @pytest.mark.asyncio
    async def test_post_without_auth_returns_401(self, client: AsyncClient):
        """POST /mcp without Authorization header must return 401."""
        response = await client.post("/mcp", json={"jsonrpc": "2.0", "method": "initialize", "id": 1})
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_post_without_auth_returns_bearer_challenge(self, client: AsyncClient):
        """401 response must include WWW-Authenticate: Bearer header."""
        response = await client.post("/mcp")
        assert "WWW-Authenticate" in response.headers
        assert "Bearer" in response.headers["WWW-Authenticate"]

    @pytest.mark.asyncio
    async def test_post_with_invalid_token_returns_401(self, client: AsyncClient):
        """POST /mcp with an invalid Bearer token must return 401."""
        response = await client.post(
            "/mcp",
            headers={"Authorization": "Bearer invalid-token-here"},
            json={"jsonrpc": "2.0", "method": "initialize", "id": 1},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_post_with_valid_token_not_401(self, auth_headers: dict):
        """POST /mcp with a valid Bearer token must not return 401.

        Uses raise_app_exceptions=False because FastMCP's session manager
        requires lifespan initialization (which httpx doesn't send). The
        RuntimeError would propagate as a Python exception otherwise. We
        only care that auth succeeded (not 401), even if MCP itself errors.
        """
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/mcp",
                headers=auth_headers,
                json={"jsonrpc": "2.0", "method": "initialize", "id": 1},
            )
        assert response.status_code != 401, "Valid token was rejected"

    @pytest.mark.asyncio
    async def test_trailing_slash_without_auth_returns_401(self, client: AsyncClient):
        """POST /mcp/ without auth must also return 401 (not 405)."""
        response = await client.post("/mcp/")
        assert response.status_code == 401
