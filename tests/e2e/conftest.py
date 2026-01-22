"""
End-to-end test fixtures using Playwright.

Prerequisites:
- Running dev server: `just dev` or `uv run uvicorn app.main:app --reload`
- Playwright browsers: `uv run playwright install chromium`

Usage:
    @pytest.mark.e2e
    def test_something(page: Page, base_url: str):
        page.goto(base_url)
        ...
"""

import os

import pytest


@pytest.fixture(scope="session")
def base_url() -> str:
    """Base URL for the test server."""
    return os.environ.get("TEST_BASE_URL", "http://localhost:8000")


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args: dict) -> dict:
    """Configure browser context for all tests."""
    return {
        **browser_context_args,
        "viewport": {"width": 1280, "height": 720},
        "ignore_https_errors": True,
    }


@pytest.fixture
def authenticated_page(page, base_url: str):
    """
    Page fixture with authentication.

    For tests that require a logged-in user, this fixture handles
    the authentication flow. Currently a placeholder - implement
    when auth testing is needed.
    """
    # TODO: Implement authentication flow
    # This could involve:
    # - Setting session cookies directly
    # - Mocking OAuth responses
    # - Using a test user endpoint
    yield page
