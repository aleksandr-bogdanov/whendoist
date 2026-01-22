"""
Tests for security headers middleware.

Verifies:
- CSP headers are present and correct
- X-Frame-Options prevents clickjacking
- X-Content-Type-Options prevents MIME sniffing
- Referrer-Policy controls information leakage
"""

from pathlib import Path


class TestSecurityHeadersMiddlewareExists:
    """Contract tests for security middleware existence."""

    def test_security_middleware_file_exists(self):
        """security.py should exist in middleware folder."""
        assert Path("app/middleware/security.py").exists()

    def test_security_headers_middleware_class_exists(self):
        """SecurityHeadersMiddleware class should exist."""
        from app.middleware.security import SecurityHeadersMiddleware

        assert SecurityHeadersMiddleware is not None

    def test_middleware_is_base_http_middleware(self):
        """SecurityHeadersMiddleware should extend BaseHTTPMiddleware."""
        from starlette.middleware.base import BaseHTTPMiddleware

        from app.middleware.security import SecurityHeadersMiddleware

        assert issubclass(SecurityHeadersMiddleware, BaseHTTPMiddleware)


class TestCSPConfiguration:
    """Tests for Content Security Policy configuration."""

    def test_csp_includes_default_src(self):
        """CSP should include default-src directive."""
        security_content = Path("app/middleware/security.py").read_text()
        assert "default-src 'self'" in security_content

    def test_csp_includes_script_src(self):
        """CSP should include script-src directive."""
        security_content = Path("app/middleware/security.py").read_text()
        assert "script-src" in security_content

    def test_csp_includes_style_src(self):
        """CSP should include style-src directive."""
        security_content = Path("app/middleware/security.py").read_text()
        assert "style-src" in security_content

    def test_csp_includes_connect_src(self):
        """CSP should include connect-src for API calls."""
        security_content = Path("app/middleware/security.py").read_text()
        assert "connect-src" in security_content

    def test_csp_prevents_framing(self):
        """CSP should prevent framing with frame-ancestors."""
        security_content = Path("app/middleware/security.py").read_text()
        assert "frame-ancestors 'none'" in security_content

    def test_csp_restricts_base_uri(self):
        """CSP should restrict base-uri to prevent base tag injection."""
        security_content = Path("app/middleware/security.py").read_text()
        assert "base-uri 'self'" in security_content

    def test_csp_no_unsafe_eval(self):
        """CSP should NOT include unsafe-eval (dangerous for XSS)."""
        security_content = Path("app/middleware/security.py").read_text()
        # unsafe-eval allows arbitrary code execution
        assert "unsafe-eval" not in security_content


class TestOtherSecurityHeaders:
    """Tests for other security headers."""

    def test_x_frame_options_present(self):
        """X-Frame-Options header should be set to DENY."""
        security_content = Path("app/middleware/security.py").read_text()
        assert "X-Frame-Options" in security_content
        assert '"DENY"' in security_content

    def test_x_content_type_options_present(self):
        """X-Content-Type-Options should be set to nosniff."""
        security_content = Path("app/middleware/security.py").read_text()
        assert "X-Content-Type-Options" in security_content
        assert '"nosniff"' in security_content

    def test_referrer_policy_present(self):
        """Referrer-Policy should be set."""
        security_content = Path("app/middleware/security.py").read_text()
        assert "Referrer-Policy" in security_content


class TestMainAppIntegration:
    """Tests verifying security middleware is integrated into main app."""

    def test_security_middleware_imported(self):
        """SecurityHeadersMiddleware should be imported in main.py."""
        main_content = Path("app/main.py").read_text()
        assert "SecurityHeadersMiddleware" in main_content

    def test_security_middleware_added_to_app(self):
        """SecurityHeadersMiddleware should be added to app."""
        main_content = Path("app/main.py").read_text()
        assert "app.add_middleware(SecurityHeadersMiddleware)" in main_content


class TestAllowedDomainsInCSP:
    """Tests for allowed domains in CSP directives."""

    def test_google_oauth_allowed_in_connect(self):
        """Google OAuth domains should be allowed in connect-src."""
        security_content = Path("app/middleware/security.py").read_text()
        assert "accounts.google.com" in security_content

    def test_cdn_allowed_for_scripts(self):
        """jsdelivr CDN should be allowed for ApexCharts and libraries."""
        security_content = Path("app/middleware/security.py").read_text()
        assert "cdn.jsdelivr.net" in security_content

    def test_google_fonts_allowed_for_fonts(self):
        """Google Fonts should be allowed for font-src."""
        security_content = Path("app/middleware/security.py").read_text()
        assert "fonts.gstatic.com" in security_content or "fonts.googleapis.com" in security_content
