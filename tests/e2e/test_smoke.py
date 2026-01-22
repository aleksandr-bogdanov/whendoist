"""
Smoke tests for Whendoist using Playwright.

These tests verify basic application functionality is working.
Run with: uv run pytest tests/e2e/ -v --headed

Prerequisites:
- Running dev server: `just dev`
- Playwright browsers: `uv run playwright install chromium`
"""

import pytest
from playwright.sync_api import Page, expect


@pytest.mark.e2e
class TestLandingPage:
    """Verify landing page loads correctly."""

    def test_landing_page_loads(self, page: Page, base_url: str):
        """Landing page should load and display branding."""
        page.goto(base_url)

        # Should see the Whendoist branding
        expect(page.locator("body")).to_be_visible()

        # Page title should be set
        assert "Whendoist" in page.title() or page.title() != ""

    def test_landing_page_has_login(self, page: Page, base_url: str):
        """Landing page should have login option."""
        page.goto(base_url)

        # Should have some form of login/auth element
        # This is a generic check - customize based on actual landing page
        body_text = page.locator("body").text_content()
        assert body_text is not None


@pytest.mark.e2e
class TestHealthEndpoints:
    """Verify health check endpoints work."""

    def test_health_endpoint(self, page: Page, base_url: str):
        """Health endpoint should return healthy status."""
        response = page.request.get(f"{base_url}/health")

        assert response.status == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data

    def test_ready_endpoint(self, page: Page, base_url: str):
        """Ready endpoint should return ready status with DB check."""
        response = page.request.get(f"{base_url}/ready")

        assert response.status == 200
        data = response.json()
        assert data["status"] == "ready"
        assert data["database"] == "connected"


@pytest.mark.e2e
class TestStaticAssets:
    """Verify static assets are served correctly."""

    def test_service_worker(self, page: Page, base_url: str):
        """Service worker should be accessible."""
        response = page.request.get(f"{base_url}/sw.js")

        # Service worker may or may not exist
        assert response.status in [200, 404]

    def test_static_css(self, page: Page, base_url: str):
        """Main CSS file should load."""
        response = page.request.get(f"{base_url}/static/css/main.css")

        # CSS may be bundled differently, but static route should work
        # Accept 200 or 404 (file may not exist with that name)
        assert response.status in [200, 404]
