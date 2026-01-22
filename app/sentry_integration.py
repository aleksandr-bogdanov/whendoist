"""
Optional Sentry integration for error tracking.

Sentry is initialized only if SENTRY_DSN environment variable is set.
The sentry-sdk package is an optional dependency - install with:
    pip install whendoist[sentry]

Features when enabled:
- Automatic exception tracking
- Request context (user ID, request ID)
- Performance tracing (10% sample rate)
"""

import logging
import os

logger = logging.getLogger("whendoist")


def init_sentry() -> bool:
    """
    Initialize Sentry if SENTRY_DSN is configured.

    Returns True if Sentry was initialized, False otherwise.
    """
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        logger.debug("SENTRY_DSN not set, Sentry disabled")
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except ImportError:
        logger.warning("sentry-sdk not installed, Sentry disabled. Install with: pip install sentry-sdk")
        return False

    environment = os.environ.get("ENVIRONMENT", "development")

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        # Performance tracing sample rate (10% of requests)
        traces_sample_rate=0.1,
        # Profile 10% of sampled transactions
        profiles_sample_rate=0.1,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
            SqlalchemyIntegration(),
        ],
        # Include local variables in stack traces
        include_local_variables=True,
        # Scrub sensitive data
        send_default_pii=False,
        # Don't send IP addresses
        before_send=_scrub_sensitive_data,
    )

    logger.info(f"Sentry initialized for environment: {environment}")
    return True


def _scrub_sensitive_data(event, hint):  # type: ignore[no-untyped-def]
    """Scrub sensitive data from Sentry events."""
    # Remove sensitive headers
    if "request" in event:
        headers = event["request"].get("headers", {})
        for key in list(headers.keys()):
            key_lower = key.lower()
            if any(
                sensitive in key_lower
                for sensitive in ["cookie", "authorization", "x-session", "x-csrf", "api-key", "secret"]
            ):
                headers[key] = "[REDACTED]"

    # Remove sensitive env vars
    if "extra" in event:
        for key in list(event["extra"].keys()):
            if any(sensitive in key.upper() for sensitive in ["SECRET", "KEY", "PASSWORD", "TOKEN", "DSN"]):
                event["extra"][key] = "[REDACTED]"

    return event


def set_user_context(user_id: int | None) -> None:
    """Set user context for Sentry events."""
    try:
        import sentry_sdk

        if user_id:
            sentry_sdk.set_user({"id": str(user_id)})
        else:
            sentry_sdk.set_user(None)
    except ImportError:
        pass


def set_request_context(request_id: str) -> None:
    """Set request ID context for Sentry events."""
    try:
        import sentry_sdk

        sentry_sdk.set_tag("request_id", request_id)
    except ImportError:
        pass


def capture_exception(exc: Exception) -> None:
    """Capture an exception in Sentry."""
    try:
        import sentry_sdk

        sentry_sdk.capture_exception(exc)
    except ImportError:
        pass


def capture_message(message: str, level: str = "info") -> None:
    """Capture a message in Sentry."""
    try:
        import sentry_sdk

        sentry_sdk.capture_message(message, level=level)  # type: ignore[arg-type]
    except ImportError:
        pass
