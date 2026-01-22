"""
Query timing utilities for performance monitoring.

Provides decorators and utilities to measure and log execution time
of async functions for performance verification.

Performance optimization (v0.14.0):
- log_timing decorator for measuring async function execution
- Useful for verifying optimization targets
"""

import functools
import logging
import time
from collections.abc import Awaitable, Callable
from typing import ParamSpec, TypeVar

logger = logging.getLogger("whendoist.performance")

P = ParamSpec("P")
T = TypeVar("T")


def log_timing(name: str) -> Callable[[Callable[P, Awaitable[T]]], Callable[P, Awaitable[T]]]:
    """
    Decorator to log execution time of async functions.

    Args:
        name: Name to use in log message (e.g., "analytics.get_stats")

    Usage:
        @log_timing("analytics.comprehensive_stats")
        async def get_comprehensive_stats(...):
            ...

    Output:
        INFO whendoist.performance: analytics.comprehensive_stats: 123.4ms
    """

    def decorator(func: Callable[P, Awaitable[T]]) -> Callable[P, Awaitable[T]]:
        @functools.wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            start = time.perf_counter()
            try:
                result = await func(*args, **kwargs)
                return result
            finally:
                elapsed = (time.perf_counter() - start) * 1000
                logger.info(f"{name}: {elapsed:.1f}ms")

        return wrapper

    return decorator


class Timer:
    """
    Context manager for timing code blocks.

    Usage:
        with Timer("my_operation") as t:
            # ... code to time ...
        print(f"Took {t.elapsed_ms:.1f}ms")
    """

    def __init__(self, name: str | None = None, log: bool = True):
        """
        Initialize timer.

        Args:
            name: Name for log output (optional)
            log: Whether to log on exit (default True)
        """
        self.name = name
        self.log = log
        self.start: float = 0
        self.end: float = 0

    @property
    def elapsed_ms(self) -> float:
        """Elapsed time in milliseconds."""
        return (self.end - self.start) * 1000

    def __enter__(self) -> "Timer":
        self.start = time.perf_counter()
        return self

    def __exit__(self, *args: object) -> None:
        self.end = time.perf_counter()
        if self.log and self.name:
            logger.info(f"{self.name}: {self.elapsed_ms:.1f}ms")
