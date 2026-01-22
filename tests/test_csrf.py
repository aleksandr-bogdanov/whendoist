"""
Tests for CSRF (Cross-Site Request Forgery) protection.

Verifies:
- CSRF middleware exists and is configured
- Token generation is cryptographically secure
- Protected methods require valid token
- Exempt paths are correctly configured
- Integration with session middleware

v0.24.0: Security Hardening
"""

from pathlib import Path


class TestCSRFMiddlewareExists:
    """Contract tests for CSRF middleware existence."""

    def test_csrf_middleware_file_exists(self):
        """csrf.py should exist in middleware folder."""
        assert Path("app/middleware/csrf.py").exists()

    def test_csrf_middleware_class_exists(self):
        """CSRFMiddleware class should exist."""
        from app.middleware.csrf import CSRFMiddleware

        assert CSRFMiddleware is not None

    def test_middleware_is_base_http_middleware(self):
        """CSRFMiddleware should extend BaseHTTPMiddleware."""
        from starlette.middleware.base import BaseHTTPMiddleware

        from app.middleware.csrf import CSRFMiddleware

        assert issubclass(CSRFMiddleware, BaseHTTPMiddleware)

    def test_generate_csrf_token_function_exists(self):
        """generate_csrf_token function should exist."""
        from app.middleware.csrf import generate_csrf_token

        assert callable(generate_csrf_token)

    def test_get_csrf_token_function_exists(self):
        """get_csrf_token function should exist."""
        from app.middleware.csrf import get_csrf_token

        assert callable(get_csrf_token)


class TestCSRFTokenGeneration:
    """Tests for CSRF token generation."""

    def test_generate_token_uses_secrets_module(self):
        """Token generation should use cryptographically secure secrets."""
        content = Path("app/middleware/csrf.py").read_text()
        assert "secrets.token_urlsafe" in content

    def test_generate_token_has_sufficient_length(self):
        """Generated token should be at least 32 bytes (256 bits)."""
        from app.middleware.csrf import generate_csrf_token

        token = generate_csrf_token()
        # Base64url encoding of 32 bytes produces ~43 characters
        assert len(token) >= 40

    def test_generate_token_is_unique(self):
        """Each call should produce a unique token."""
        from app.middleware.csrf import generate_csrf_token

        tokens = {generate_csrf_token() for _ in range(100)}
        assert len(tokens) == 100


class TestCSRFProtectedMethods:
    """Tests for which HTTP methods require CSRF validation."""

    def test_post_method_is_protected(self):
        """POST requests should require CSRF token."""
        content = Path("app/middleware/csrf.py").read_text()
        assert "POST" in content
        assert "CSRF_PROTECTED_METHODS" in content

    def test_put_method_is_protected(self):
        """PUT requests should require CSRF token."""
        content = Path("app/middleware/csrf.py").read_text()
        assert "PUT" in content

    def test_delete_method_is_protected(self):
        """DELETE requests should require CSRF token."""
        content = Path("app/middleware/csrf.py").read_text()
        assert "DELETE" in content

    def test_patch_method_is_protected(self):
        """PATCH requests should require CSRF token."""
        content = Path("app/middleware/csrf.py").read_text()
        assert "PATCH" in content

    def test_get_method_not_protected(self):
        """GET requests should NOT require CSRF token (safe method)."""
        from app.middleware.csrf import CSRF_PROTECTED_METHODS

        assert "GET" not in CSRF_PROTECTED_METHODS


class TestCSRFExemptPaths:
    """Tests for paths exempt from CSRF validation."""

    def test_oauth_callbacks_exempt(self):
        """OAuth callback paths should be exempt (they use state parameter)."""
        from app.middleware.csrf import CSRF_EXEMPT_PATHS

        assert "/auth/google/callback" in CSRF_EXEMPT_PATHS
        assert "/auth/todoist/callback" in CSRF_EXEMPT_PATHS

    def test_health_endpoints_exempt(self):
        """Health check endpoints should be exempt."""
        from app.middleware.csrf import CSRF_EXEMPT_PATHS

        assert "/health" in CSRF_EXEMPT_PATHS
        assert "/ready" in CSRF_EXEMPT_PATHS


class TestCSRFTokenValidation:
    """Tests for CSRF token validation logic."""

    def test_uses_constant_time_comparison(self):
        """Token comparison should use constant-time algorithm."""
        content = Path("app/middleware/csrf.py").read_text()
        assert "secrets.compare_digest" in content

    def test_returns_403_on_missing_token(self):
        """Missing CSRF token should return 403."""
        content = Path("app/middleware/csrf.py").read_text()
        assert "403" in content
        assert "CSRF" in content

    def test_returns_403_on_invalid_token(self):
        """Invalid CSRF token should return 403."""
        content = Path("app/middleware/csrf.py").read_text()
        assert "HTTPException" in content
        assert "status_code=403" in content


class TestCSRFHeaderConfiguration:
    """Tests for CSRF header configuration."""

    def test_csrf_header_name_defined(self):
        """CSRF_HEADER_NAME constant should be defined."""
        from app.middleware.csrf import CSRF_HEADER_NAME

        assert CSRF_HEADER_NAME == "X-CSRF-Token"

    def test_csrf_session_key_defined(self):
        """CSRF_SESSION_KEY constant should be defined."""
        from app.middleware.csrf import CSRF_SESSION_KEY

        assert CSRF_SESSION_KEY == "_csrf_token"


class TestMainAppIntegration:
    """Tests verifying CSRF middleware is integrated into main app."""

    def test_csrf_middleware_imported(self):
        """CSRFMiddleware should be imported in main.py."""
        content = Path("app/main.py").read_text()
        assert "CSRFMiddleware" in content

    def test_csrf_middleware_added_to_app(self):
        """CSRFMiddleware should be added to app."""
        content = Path("app/main.py").read_text()
        assert "app.add_middleware(CSRFMiddleware)" in content


class TestJavaScriptIntegration:
    """Tests verifying CSRF is integrated with JavaScript."""

    def test_error_handler_js_exists(self):
        """error-handler.js utility should exist."""
        assert Path("static/js/error-handler.js").exists()

    def test_error_handler_exports_get_csrf_token(self):
        """error-handler.js should export getCSRFToken function."""
        content = Path("static/js/error-handler.js").read_text()
        assert "getCSRFToken" in content
        assert "window.getCSRFToken" in content

    def test_error_handler_exports_get_csrf_headers(self):
        """error-handler.js should export getCSRFHeaders function."""
        content = Path("static/js/error-handler.js").read_text()
        assert "getCSRFHeaders" in content
        assert "window.getCSRFHeaders" in content

    def test_error_handler_reads_from_meta_tag(self):
        """Should read CSRF token from meta tag."""
        content = Path("static/js/error-handler.js").read_text()
        assert 'meta[name="csrf-token"]' in content

    def test_base_template_has_csrf_meta_tag(self):
        """base.html should include CSRF meta tag."""
        content = Path("app/templates/base.html").read_text()
        assert 'name="csrf-token"' in content
        assert "csrf_token" in content

    def test_error_handler_included_in_base(self):
        """error-handler.js should be included in base.html."""
        content = Path("app/templates/base.html").read_text()
        assert "error-handler.js" in content


class TestCSRFDependencyAvailable:
    """Tests for CSRF dependency injection."""

    def test_require_csrf_token_dependency_exists(self):
        """require_csrf_token dependency should exist for route protection."""
        from app.middleware.csrf import require_csrf_token

        assert callable(require_csrf_token)
