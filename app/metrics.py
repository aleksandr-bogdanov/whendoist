"""
Prometheus metrics for Whendoist.

Provides request count and latency histograms for observability.
Metrics are exposed at /metrics endpoint.
"""

import time
from collections.abc import Callable

from prometheus_client import Counter, Gauge, Histogram, generate_latest
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Request metrics
REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)

REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# Business metrics
TASK_OPERATIONS = Counter(
    "whendoist_task_operations_total",
    "Task operations",
    ["operation"],  # create, update, delete, complete
)

SCHEDULED_TASKS = Counter(
    "whendoist_scheduled_tasks_total",
    "Tasks scheduled via drag-drop",
    ["method"],  # schedule, unschedule, reschedule
)

# Database pool metrics
DB_POOL_SIZE = Gauge(
    "whendoist_db_pool_size",
    "Database connection pool size (current number of connections)",
)

DB_POOL_CHECKEDOUT = Gauge(
    "whendoist_db_pool_checkedout",
    "Number of connections currently checked out from the pool",
)


class PrometheusMiddleware(BaseHTTPMiddleware):
    """
    Middleware that collects Prometheus metrics.

    Tracks:
    - Request counts by method, endpoint, status
    - Request latency by method, endpoint
    """

    # Endpoints to skip (high volume, internal)
    SKIP_ENDPOINTS = {"/metrics", "/health", "/ready"}

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path

        # Skip metrics for internal endpoints
        if path in self.SKIP_ENDPOINTS:
            return await call_next(request)

        # Normalize path to reduce cardinality
        # /api/tasks/123 -> /api/tasks/{id}
        endpoint = self._normalize_path(path)

        method = request.method
        start_time = time.perf_counter()
        status = 500  # Default for exceptions

        try:
            response = await call_next(request)
            status = response.status_code
        except Exception:
            raise
        finally:
            duration = time.perf_counter() - start_time

            REQUEST_COUNT.labels(
                method=method,
                endpoint=endpoint,
                status=status,
            ).inc()

            REQUEST_LATENCY.labels(
                method=method,
                endpoint=endpoint,
            ).observe(duration)

        return response

    def _normalize_path(self, path: str) -> str:
        """Normalize path to reduce metric cardinality."""
        parts = path.split("/")
        normalized = []

        for part in parts:
            if not part:
                continue

            # Replace numeric IDs with placeholder
            if part.isdigit():
                normalized.append("{id}")
            # Replace UUIDs with placeholder
            elif len(part) == 36 and part.count("-") == 4:
                normalized.append("{uuid}")
            else:
                normalized.append(part)

        return "/" + "/".join(normalized) if normalized else "/"


def get_metrics() -> bytes:
    """Generate Prometheus metrics output."""
    return generate_latest()


def record_task_operation(operation: str) -> None:
    """Record a task operation for business metrics."""
    TASK_OPERATIONS.labels(operation=operation).inc()


def record_scheduled_task(method: str) -> None:
    """Record a task scheduling event."""
    SCHEDULED_TASKS.labels(method=method).inc()


def update_db_pool_metrics(pool: object) -> None:
    """
    Update database pool metrics.

    Args:
        pool: SQLAlchemy connection pool (from engine.pool)
    """
    # Pool has size() and checkedout() methods
    DB_POOL_SIZE.set(pool.size())  # type: ignore[attr-defined]
    DB_POOL_CHECKEDOUT.set(pool.checkedout())  # type: ignore[attr-defined]
