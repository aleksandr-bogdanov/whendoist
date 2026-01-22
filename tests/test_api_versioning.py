"""
API Versioning Tests.

Verifies /api/v1/* routes are registered.

Test Category: Unit
Related Code: app/main.py, app/routers/v1/__init__.py

v0.15.0: Architecture Cleanup
v0.16.0: Removed legacy /api/* routes - only v1 routes remain
"""

from app.main import app


class TestRouteRegistration:
    """Tests for route registration."""

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

    def test_preferences_routes_at_v1_prefix(self):
        """Preference routes are available at /api/v1/preferences."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]
        pref_routes = [r for r in routes if r.startswith("/api/v1/preferences")]

        assert len(pref_routes) > 0, "No v1 preference routes found"

    def test_instances_routes_at_v1_prefix(self):
        """Instance routes are available at /api/v1/instances."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]
        instance_routes = [r for r in routes if r.startswith("/api/v1/instances")]

        assert len(instance_routes) > 0, "No v1 instance routes found"
