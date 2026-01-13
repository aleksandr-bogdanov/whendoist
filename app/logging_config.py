"""Logging configuration for Whendoist."""

import logging
import sys
import traceback

from app.config import get_settings


class CleanExceptionFormatter(logging.Formatter):
    """Formatter that produces readable exception tracebacks."""

    def __init__(self, fmt: str, datefmt: str | None = None):
        super().__init__(fmt, datefmt)

    def formatException(self, ei) -> str:
        """Format exception with clean, readable output."""
        exc_type, exc_value, exc_tb = ei

        # Get the simplified traceback
        lines = []
        lines.append("")
        lines.append(f"{'─' * 60}")
        exc_name = exc_type.__name__ if exc_type else "Unknown"
        lines.append(f"  EXCEPTION: {exc_name}")
        lines.append(f"  MESSAGE:   {exc_value}")
        lines.append(f"{'─' * 60}")

        # Extract frames, filtering out library internals
        frames = traceback.extract_tb(exc_tb)

        # Filter to show only relevant frames
        relevant_frames = []
        for frame in frames:
            # Skip deep library internals, keep app code and key library entry points
            if "/site-packages/" in frame.filename:
                # Keep important library frames
                if any(lib in frame.filename for lib in ["fastapi", "starlette", "sqlalchemy"]):
                    # Only keep the router/route handler frames, not internal dispatch
                    if frame.name in (
                        "__call__",
                        "run_asgi",
                        "wrapped_app",
                        "app",
                        "handle",
                    ):
                        continue
                else:
                    continue
            relevant_frames.append(frame)

        # If we filtered everything, show the last few frames at least
        if not relevant_frames:
            relevant_frames = frames[-3:]

        lines.append("  TRACEBACK:")
        for frame in relevant_frames:
            # Shorten path for readability
            filename = frame.filename
            if "/app/" in filename:
                filename = filename.split("/app/")[-1]
            elif "/site-packages/" in filename:
                filename = "..." + filename.split("/site-packages/")[-1]

            lines.append(f"    → {filename}:{frame.lineno} in {frame.name}()")
            if frame.line:
                lines.append(f"      {frame.line.strip()}")

        lines.append(f"{'─' * 60}")
        lines.append("")

        return "\n".join(lines)


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

    # Quieter uvicorn access logs in development
    if not is_production:
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    # App logger
    logger = logging.getLogger("whendoist")
    logger.setLevel(level)
