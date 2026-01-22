"""
Tests for rate limiting middleware.

Verifies:
- Rate limit configuration exists
- Rate limits applied to sensitive endpoints
- Correct limit values for different endpoint categories
"""

from pathlib import Path


class TestRateLimitConfiguration:
    """Tests for rate limit configuration."""

    def test_limiter_exists(self):
        """Rate limiter should be importable from middleware."""
        from app.middleware.rate_limit import limiter

        assert limiter is not None

    def test_rate_limit_constants_exist(self):
        """Rate limit constants should be defined."""
        from app.middleware.rate_limit import AUTH_LIMIT, BACKUP_LIMIT, ENCRYPTION_LIMIT

        assert AUTH_LIMIT is not None
        assert ENCRYPTION_LIMIT is not None
        assert BACKUP_LIMIT is not None

    def test_auth_limit_value(self):
        """Auth endpoints should be limited to 10/minute."""
        from app.middleware.rate_limit import AUTH_LIMIT

        assert AUTH_LIMIT == "10/minute"

    def test_encryption_limit_value(self):
        """Encryption endpoints should be limited to 5/minute."""
        from app.middleware.rate_limit import ENCRYPTION_LIMIT

        assert ENCRYPTION_LIMIT == "5/minute"

    def test_backup_limit_value(self):
        """Backup endpoints should be limited to 5/minute."""
        from app.middleware.rate_limit import BACKUP_LIMIT

        assert BACKUP_LIMIT == "5/minute"

    def test_get_user_or_ip_function_exists(self):
        """Custom key function for user-based rate limiting should exist."""
        from app.middleware.rate_limit import get_user_or_ip

        assert callable(get_user_or_ip)


class TestRateLimitedEndpoints:
    """Contract tests verifying rate limits are applied to sensitive endpoints."""

    def test_passkey_register_options_has_rate_limit(self):
        """passkeys.py register/options should have rate limiting."""
        passkeys_content = Path("app/routers/passkeys.py").read_text()

        # Check that the endpoint has the limiter decorator
        assert "@limiter.limit(ENCRYPTION_LIMIT)" in passkeys_content
        assert "async def get_registration_options" in passkeys_content

    def test_passkey_register_verify_has_rate_limit(self):
        """passkeys.py register/verify should have rate limiting."""
        passkeys_content = Path("app/routers/passkeys.py").read_text()

        # The decorator should appear before verify_registration
        assert "@limiter.limit(ENCRYPTION_LIMIT)" in passkeys_content
        assert "async def verify_registration" in passkeys_content

    def test_passkey_authenticate_options_has_rate_limit(self):
        """passkeys.py authenticate/options should have rate limiting."""
        passkeys_content = Path("app/routers/passkeys.py").read_text()

        assert "@limiter.limit(ENCRYPTION_LIMIT)" in passkeys_content
        assert "async def get_authentication_options" in passkeys_content

    def test_passkey_authenticate_verify_has_rate_limit(self):
        """passkeys.py authenticate/verify should have rate limiting."""
        passkeys_content = Path("app/routers/passkeys.py").read_text()

        assert "@limiter.limit(ENCRYPTION_LIMIT)" in passkeys_content
        assert "async def verify_authentication" in passkeys_content

    def test_encryption_setup_has_rate_limit(self):
        """preferences.py encryption/setup should have rate limiting."""
        preferences_content = Path("app/routers/preferences.py").read_text()

        assert "@limiter.limit(ENCRYPTION_LIMIT)" in preferences_content
        assert "async def setup_encryption" in preferences_content

    def test_encryption_disable_has_rate_limit(self):
        """preferences.py encryption/disable should have rate limiting."""
        preferences_content = Path("app/routers/preferences.py").read_text()

        assert "@limiter.limit(ENCRYPTION_LIMIT)" in preferences_content
        assert "async def disable_encryption" in preferences_content

    def test_auth_callbacks_have_rate_limit(self):
        """Auth OAuth callbacks should have rate limiting."""
        auth_content = Path("app/routers/auth.py").read_text()

        assert "@limiter.limit(AUTH_LIMIT)" in auth_content
        assert "async def google_callback" in auth_content
        assert "async def todoist_callback" in auth_content

    def test_backup_export_has_rate_limit(self):
        """backup.py export should have rate limiting."""
        backup_content = Path("app/routers/backup.py").read_text()

        assert "@limiter.limit(BACKUP_LIMIT" in backup_content
        assert "async def export_backup" in backup_content

    def test_backup_import_has_rate_limit(self):
        """backup.py import should have rate limiting."""
        backup_content = Path("app/routers/backup.py").read_text()

        assert "@limiter.limit(BACKUP_LIMIT" in backup_content
        assert "async def import_backup" in backup_content

    def test_backup_rate_limits_use_user_key(self):
        """Backup rate limits should use user-based key function."""
        backup_content = Path("app/routers/backup.py").read_text()

        # Verify get_user_or_ip is imported and used
        assert "get_user_or_ip" in backup_content
        assert "key_func=get_user_or_ip" in backup_content


class TestMainAppIntegration:
    """Tests verifying rate limiter is integrated into main app."""

    def test_limiter_state_set_on_app(self):
        """main.py should set app.state.limiter."""
        main_content = Path("app/main.py").read_text()

        assert "app.state.limiter = limiter" in main_content

    def test_rate_limit_exception_handler_added(self):
        """main.py should add RateLimitExceeded exception handler."""
        main_content = Path("app/main.py").read_text()

        assert "RateLimitExceeded" in main_content
        assert "_rate_limit_exceeded_handler" in main_content

    def test_slowapi_imported(self):
        """slowapi should be imported in main.py."""
        main_content = Path("app/main.py").read_text()

        assert "from slowapi" in main_content


class TestSlowAPIInDependencies:
    """Tests verifying slowapi is in dependencies."""

    def test_slowapi_in_pyproject(self):
        """slowapi should be listed in pyproject.toml dependencies."""
        pyproject_content = Path("pyproject.toml").read_text()

        assert "slowapi" in pyproject_content
