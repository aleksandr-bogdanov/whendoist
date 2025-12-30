"""Logging configuration for Whendoist."""

import logging
import sys

from app.config import get_settings


def setup_logging() -> None:
    """Configure logging based on environment."""
    settings = get_settings()
    is_production = settings.base_url.startswith("https://")

    # Log level
    level = logging.INFO if is_production else logging.DEBUG

    # Simple, clean format
    if is_production:
        # Production: compact single-line format
        fmt = "%(levelname)s | %(name)s | %(message)s"
    else:
        # Development: more verbose with timestamps
        fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"

    # Configure root logger
    logging.basicConfig(
        level=level,
        format=fmt,
        datefmt="%H:%M:%S",
        stream=sys.stdout,
        force=True,
    )

    # Quiet noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    # App logger
    logger = logging.getLogger("whendoist")
    logger.setLevel(level)
