"""
API Versioning Tests.

Verifies /api/v1/* routes are registered and frontend calls match backend routes.

Test Category: Unit
Related Code: app/main.py, app/routers/v1/__init__.py

v0.15.0: Architecture Cleanup
v0.16.0: Removed legacy /api/* routes - only v1 routes remain
v0.27.0: Added frontend-backend contract tests
"""

import re
from pathlib import Path

from app.main import app

PROJECT_ROOT = Path(__file__).parent.parent
JS_DIR = PROJECT_ROOT / "static" / "js"
TEMPLATES_DIR = PROJECT_ROOT / "app" / "templates"


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


class TestFrontendBackendContract:
    """
    Contract tests verifying frontend API calls match backend routes.

    These tests prevent the bug where backend routes change but frontend
    code still calls the old paths, causing silent failures.

    v0.27.0: Added after discovering /api/ vs /api/v1/ mismatch
    """

    def _get_registered_routes(self) -> set[str]:
        """Get all registered FastAPI route paths."""
        routes = set()
        for route in app.routes:
            if hasattr(route, "path"):
                routes.add(route.path)
        return routes

    def _extract_api_paths_from_file(self, filepath: Path) -> set[str]:
        """Extract /api/... paths from a file."""
        content = filepath.read_text()
        paths = set()

        # Match patterns like '/api/v1/tasks', "/api/v1/tasks", `/api/v1/tasks`
        # Also match template literals like `/api/v1/tasks/${id}`
        patterns = [
            r"'(/api/v1/[^'?\s]+)",  # single quotes
            r'"(/api/v1/[^"?\s]+)',  # double quotes
            r"`(/api/v1/[^`?\s\$]+)",  # backticks (before ${)
        ]

        for pattern in patterns:
            for match in re.findall(pattern, content):
                # Clean up the path - remove trailing punctuation
                clean_path = match.rstrip("',\"`);/")

                # Skip Jinja template syntax
                if "{{" in clean_path or "}}" in clean_path:
                    continue

                # Skip empty or too-short paths
                if len(clean_path) <= len("/api/v1/"):
                    continue

                paths.add(clean_path)

        return paths

    def _normalize_path_for_matching(self, path: str) -> str:
        """
        Normalize a frontend path for matching against backend routes.

        Converts /api/v1/tasks/123 -> /api/v1/tasks/{task_id}
        """
        # Common ID patterns in URLs
        # Replace numeric IDs with {id} placeholder
        normalized = re.sub(r"/\d+(?=/|$)", "/{id}", path)
        return normalized

    def _path_matches_route(self, frontend_path: str, registered_routes: set[str]) -> bool:
        """Check if a frontend path matches any registered route."""
        # Direct match
        if frontend_path in registered_routes:
            return True

        # Normalize and try to match with path parameters
        normalized = self._normalize_path_for_matching(frontend_path)

        for route in registered_routes:
            # Convert route params like {task_id} to {id} for comparison
            route_normalized = re.sub(r"\{[^}]+\}", "{id}", route)
            if normalized == route_normalized:
                return True

            # Check if frontend path is a base path for a parameterized route
            # e.g., /api/v1/tasks matches /api/v1/tasks/{task_id}
            if route.startswith(frontend_path + "/") or route.startswith(frontend_path + "{"):
                return True

        return False

    def test_no_legacy_api_paths_in_js(self):
        """JavaScript files must not contain legacy /api/ paths (without v1)."""
        legacy_paths = []

        for js_file in JS_DIR.glob("*.js"):
            content = js_file.read_text()
            # Find /api/ not followed by v1
            matches = re.findall(r"['\"`](/api/(?!v1)[^'\"`\s]+)", content)
            for match in matches:
                legacy_paths.append((js_file.name, match))

        assert not legacy_paths, "Found legacy /api/ paths (should be /api/v1/):\n" + "\n".join(
            f"  {f}: {p}" for f, p in legacy_paths
        )

    def test_no_legacy_api_paths_in_templates(self):
        """HTML templates must not contain legacy /api/ paths (without v1)."""
        legacy_paths = []

        for template_file in TEMPLATES_DIR.rglob("*.html"):
            content = template_file.read_text()
            # Find /api/ not followed by v1
            matches = re.findall(r"['\"`](/api/(?!v1)[^'\"`\s]+)", content)
            for match in matches:
                rel_path = template_file.relative_to(TEMPLATES_DIR)
                legacy_paths.append((str(rel_path), match))

        assert not legacy_paths, "Found legacy /api/ paths in templates (should be /api/v1/):\n" + "\n".join(
            f"  {f}: {p}" for f, p in legacy_paths
        )

    def test_js_api_calls_match_backend_routes(self):
        """All /api/v1/ calls in JS files must have matching backend routes."""
        registered_routes = self._get_registered_routes()
        unmatched = []

        for js_file in JS_DIR.glob("*.js"):
            paths = self._extract_api_paths_from_file(js_file)
            for path in paths:
                if not self._path_matches_route(path, registered_routes):
                    unmatched.append((js_file.name, path))

        assert not unmatched, (
            "JS files call API paths with no matching backend route:\n"
            + "\n".join(f"  {f}: {p}" for f, p in unmatched)
            + f"\n\nRegistered routes: {sorted(r for r in registered_routes if r.startswith('/api/'))}"
        )

    def test_template_api_calls_match_backend_routes(self):
        """All /api/v1/ calls in templates must have matching backend routes."""
        registered_routes = self._get_registered_routes()
        unmatched = []

        for template_file in TEMPLATES_DIR.rglob("*.html"):
            paths = self._extract_api_paths_from_file(template_file)
            for path in paths:
                if not self._path_matches_route(path, registered_routes):
                    rel_path = template_file.relative_to(TEMPLATES_DIR)
                    unmatched.append((str(rel_path), path))

        assert not unmatched, (
            "Templates call API paths with no matching backend route:\n"
            + "\n".join(f"  {f}: {p}" for f, p in unmatched)
            + f"\n\nRegistered routes: {sorted(r for r in registered_routes if r.startswith('/api/'))}"
        )
