"""
API Versioning Tests.

Verifies both legacy (/api/*) and versioned (/api/v1/*) routes work.

Test Category: Unit
Related Code: app/main.py, app/routers/v1/__init__.py

v0.15.0: Architecture Cleanup
"""

from app.main import app


class TestRouteRegistration:
    """Tests for route registration."""

    def test_legacy_api_routes_exist(self):
        """Legacy /api/* routes are registered."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]

        # Check key legacy API routes exist
        assert "/api/tasks" in routes or any(r.startswith("/api/tasks") for r in routes)
        assert "/api/domains" in routes or any(r.startswith("/api/domains") for r in routes)
        assert "/api/preferences" in routes or any(r.startswith("/api/preferences") for r in routes)

    def test_v1_api_routes_exist(self):
        """Versioned /api/v1/* routes are registered."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]

        # Check v1 API routes exist
        assert any(r.startswith("/api/v1/tasks") for r in routes)
        assert any(r.startswith("/api/v1/domains") for r in routes)
        assert any(r.startswith("/api/v1/preferences") for r in routes)

    def test_v1_routes_count(self):
        """V1 router includes expected number of route prefixes."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]
        v1_routes = [r for r in routes if r.startswith("/api/v1")]

        # Should have routes for: tasks, domains, preferences, passkeys,
        # instances, backup, import, build, wizard
        # Each may have multiple endpoints, so check we have at least 9 prefixes
        v1_prefixes = set()
        for route in v1_routes:
            # Extract the resource name (e.g., /api/v1/tasks/... -> tasks)
            parts = route.split("/")
            if len(parts) >= 4:
                v1_prefixes.add(parts[3])

        assert len(v1_prefixes) >= 9, f"Expected at least 9 v1 prefixes, got: {v1_prefixes}"


class TestLegacyRoutes:
    """Tests for legacy API route patterns."""

    def test_tasks_routes_at_legacy_prefix(self):
        """Task routes are available at /api/tasks."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]
        task_routes = [r for r in routes if r.startswith("/api/tasks") and not r.startswith("/api/v1")]

        # Should have at least the base /api/tasks route
        assert len(task_routes) > 0, "No legacy task routes found"

    def test_domains_routes_at_legacy_prefix(self):
        """Domain routes are available at /api/domains."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]
        domain_routes = [r for r in routes if r.startswith("/api/domains") and not r.startswith("/api/v1")]

        assert len(domain_routes) > 0, "No legacy domain routes found"

    def test_preferences_routes_at_legacy_prefix(self):
        """Preference routes are available at /api/preferences."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]
        pref_routes = [r for r in routes if r.startswith("/api/preferences") and not r.startswith("/api/v1")]

        assert len(pref_routes) > 0, "No legacy preference routes found"


class TestV1Routes:
    """Tests for versioned API route patterns."""

    def test_tasks_routes_at_v1_prefix(self):
        """Task routes are available at /api/v1/tasks."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]
        task_routes = [r for r in routes if r.startswith("/api/v1/tasks")]

        assert len(task_routes) > 0, "No v1 task routes found"

    def test_domains_routes_at_v1_prefix(self):
        """Domain routes are available at /api/v1/domains."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]
        domain_routes = [r for r in routes if r.startswith("/api/v1/domains")]

        assert len(domain_routes) > 0, "No v1 domain routes found"

    def test_passkeys_routes_at_v1_prefix(self):
        """Passkey routes are available at /api/v1/passkeys."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]
        passkey_routes = [r for r in routes if r.startswith("/api/v1/passkeys")]

        assert len(passkey_routes) > 0, "No v1 passkey routes found"

    def test_backup_routes_at_v1_prefix(self):
        """Backup routes are available at /api/v1/backup."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]
        backup_routes = [r for r in routes if r.startswith("/api/v1/backup")]

        assert len(backup_routes) > 0, "No v1 backup routes found"

    def test_wizard_routes_at_v1_prefix(self):
        """Wizard routes are available at /api/v1/wizard."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]
        wizard_routes = [r for r in routes if r.startswith("/api/v1/wizard")]

        assert len(wizard_routes) > 0, "No v1 wizard routes found"


class TestRouteSymmetry:
    """Tests that v1 routes are included in legacy routes."""

    def test_v1_tasks_routes_are_subset_of_legacy(self):
        """V1 task routes are available in legacy API.

        Note: Legacy API may have additional routes from the old api.router
        for backwards compatibility with Todoist integration.
        """
        routes = [r.path for r in app.routes if hasattr(r, "path")]

        legacy_tasks = set(
            r.replace("/api/tasks", "") for r in routes if r.startswith("/api/tasks") and not r.startswith("/api/v1")
        )
        v1_tasks = set(r.replace("/api/v1/tasks", "") for r in routes if r.startswith("/api/v1/tasks"))

        # V1 routes should be a subset of legacy routes (legacy may have extra old routes)
        missing = v1_tasks - legacy_tasks
        assert not missing, f"V1 task routes missing from legacy:\n{missing}"

    def test_v1_domains_routes_match_legacy(self):
        """V1 and legacy domain routes match."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]

        legacy = set(
            r.replace("/api/domains", "")
            for r in routes
            if r.startswith("/api/domains") and not r.startswith("/api/v1")
        )
        v1 = set(r.replace("/api/v1/domains", "") for r in routes if r.startswith("/api/v1/domains"))

        assert legacy == v1, f"Domain routes differ:\nLegacy: {legacy}\nV1: {v1}"

    def test_v1_preferences_routes_match_legacy(self):
        """V1 and legacy preference routes match."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]

        legacy = set(
            r.replace("/api/preferences", "")
            for r in routes
            if r.startswith("/api/preferences") and not r.startswith("/api/v1")
        )
        v1 = set(r.replace("/api/v1/preferences", "") for r in routes if r.startswith("/api/v1/preferences"))

        assert legacy == v1, f"Preference routes differ:\nLegacy: {legacy}\nV1: {v1}"
