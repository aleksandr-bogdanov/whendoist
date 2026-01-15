"""Logging configuration for Whendoist."""

import logging
import sys
import traceback

from app.config import get_settings


class CleanExceptionFormatter(logging.Formatter):
    """Formatter that produces readable exception tracebacks."""

    # Maximum number of frames to show in traceback
    MAX_FRAMES = 5

    def __init__(self, fmt: str, datefmt: str | None = None):
        super().__init__(fmt, datefmt)

    def formatException(self, ei) -> str:
        """Format exception with clean, readable output."""
        exc_type, exc_value, exc_tb = ei

        exc_name = exc_type.__name__ if exc_type else "Unknown"
        exc_msg = str(exc_value)

        # For database connection errors, provide a cleaner summary
        if "ConnectionDoesNotExistError" in exc_msg or "connection was closed" in exc_msg:
            return self._format_connection_error(exc_name, exc_msg)

        # Extract frames from traceback
        frames = traceback.extract_tb(exc_tb)

        # Filter to show only app code frames
        app_frames = [f for f in frames if "/app/" in f.filename and "/site-packages/" not in f.filename]

        # If no app frames, show last few frames
        if not app_frames:
            app_frames = frames[-3:]

        # Limit total frames
        app_frames = app_frames[-self.MAX_FRAMES :]

        # Build output
        lines = [""]
        lines.append(f"{'─' * 60}")
        lines.append(f"  {exc_name}: {self._truncate(exc_msg, 200)}")
        lines.append(f"{'─' * 60}")

        if app_frames:
            for frame in app_frames:
                filename = frame.filename.split("/app/")[-1] if "/app/" in frame.filename else frame.filename
                lines.append(f"  → {filename}:{frame.lineno} in {frame.name}()")
                if frame.line:
                    lines.append(f"    {frame.line.strip()}")

        lines.append(f"{'─' * 60}")
        return "\n".join(lines)

    def _format_connection_error(self, exc_name: str, exc_msg: str) -> str:
        """Format database connection errors concisely."""
        lines = [""]
        lines.append(f"{'─' * 60}")
        lines.append("  DATABASE CONNECTION LOST")
        lines.append("  The database connection was closed unexpectedly.")
        lines.append("  This is typically transient - retry the operation.")
        lines.append(f"{'─' * 60}")
        return "\n".join(lines)

    def _truncate(self, text: str, max_len: int) -> str:
        """Truncate text with ellipsis if too long."""
        if len(text) <= max_len:
            return text
        return text[: max_len - 3] + "..."


def setup_logging() -> None:
    """Configure logging based on environment."""
    settings = get_settings()
    is_production = settings.base_url.startswith("https://")

    # Log level
    level = logging.INFO if is_production else logging.DEBUG

    # Format strings
    if is_production:
        fmt = "%(levelname)s | %(name)s | %(message)s"
    else:
        fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"

    datefmt = "%H:%M:%S"

    # Create formatter
    formatter = CleanExceptionFormatter(fmt, datefmt)

    # Configure root handler
    root = logging.getLogger()
    root.setLevel(level)

    # Remove existing handlers
    for handler in root.handlers[:]:
        root.removeHandler(handler)

    # Add our handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    handler.setFormatter(formatter)
    root.addHandler(handler)

    # Quiet noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("asyncpg").setLevel(logging.WARNING)

    # Suppress uvicorn's default exception logging (we handle exceptions ourselves)
    # This prevents duplicate verbose tracebacks from appearing in stderr
    logging.getLogger("uvicorn.error").setLevel(logging.CRITICAL)

    # Quieter uvicorn access logs in development
    if not is_production:
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    # App logger
    logger = logging.getLogger("whendoist")
    logger.setLevel(level)
