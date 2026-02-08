# Deployment Guide

This guide covers deploying Whendoist to production using Railway.

## Prerequisites

- Railway account ([railway.app](https://railway.app))
- GitHub repository connected to Railway
- Domain (optional, but recommended)

## Railway Setup

### 1. Create New Project

1. Go to Railway dashboard
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your Whendoist repository

### 2. Add PostgreSQL Database

1. Click "+ New" in your project
2. Select "Database" → "PostgreSQL"
3. Railway will automatically set `DATABASE_URL`

### 3. Environment Variables

Set these variables in Railway settings:

```bash
# Required
SECRET_KEY=<generate-32-char-random-string>
BASE_URL=https://your-domain.com
DATABASE_URL=<auto-set-by-railway>

# OAuth (Todoist Integration)
TODOIST_CLIENT_ID=<from-todoist-developer-console>
TODOIST_CLIENT_SECRET=<from-todoist-developer-console>

# Google Calendar Integration
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>

# Recommended: Error Tracking (5 min setup, free tier available)
SENTRY_DSN=<from-sentry.io>
ENVIRONMENT=production
```

### 4. Generate Secret Key

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 5. Set Up Error Tracking (Recommended)

**Why Sentry?**
- Exception tracking with full stack traces and local variables
- Performance monitoring (10% transaction sampling)
- User context (know which user hit the error)
- Email/Slack alerts when errors occur
- Search and filter errors by type, user, route

**Setup (5 minutes):**

1. Sign up at [sentry.io](https://sentry.io) (free tier: 5K errors/month, no credit card)
2. Create a new **Python** or **FastAPI** project
3. Copy your DSN (looks like `https://abc@o123.ingest.sentry.io/456`)
4. Add to Railway variables:
   ```bash
   SENTRY_DSN=https://your-dsn-here
   ENVIRONMENT=production
   ```
5. Deploy - Sentry activates automatically on next restart

**Verify in logs:**
```
Sentry initialized for environment: production
```

Your app already includes full Sentry integration (privacy-safe, PII scrubbing enabled). Just needs the DSN to activate.

### 6. Custom Domain

1. Go to Settings → Domains
2. Add custom domain
3. Configure DNS (CNAME to Railway-provided hostname)
4. Railway handles SSL automatically

## Health Checks

Railway uses these endpoints for health monitoring:

- **GET /health** - Liveness check (app is running, always returns 200)
- **GET /ready** - Readiness check (includes DB connection, used by Railway healthcheck)
- **GET /metrics** - Prometheus metrics (for monitoring)

**Note:** Railway is configured to use `/ready` as the healthcheck endpoint (see `railway.toml`). This ensures traffic only routes to containers with verified database connectivity.

## Database Migrations

Migrations run automatically on startup via `scripts/migrate.py`.

To create a new migration locally:
```bash
just migrate-new "description of changes"
```

## Monitoring

### Prometheus Metrics

The `/metrics` endpoint exposes:
- `http_requests_total` - Request count by method/endpoint/status
- `http_request_duration_seconds` - Request latency histogram
- `whendoist_task_operations_total` - Task CRUD operations
- `whendoist_scheduled_tasks_total` - Scheduling events

### Sentry Integration

If `SENTRY_DSN` is set:
- Automatic exception tracking
- Performance tracing (10% sample rate)
- Request context (user ID, request ID)

## Logs

View logs in Railway dashboard or CLI:
```bash
railway logs
```

Production logs are JSON-formatted for easy parsing:
```json
{
  "timestamp": "2024-01-22T10:30:00.000Z",
  "level": "INFO",
  "logger": "whendoist",
  "message": "Request completed",
  "request_id": "abc123",
  "user_id": 42
}
```

## Scaling

### Current Limitations (Single-Process Deployment)

**Rate Limiting:** The application uses [slowapi](https://github.com/laurentS/slowapi) with in-memory storage for rate limiting (see `app/middleware/rate_limit.py`). This works perfectly for single-process deployments (one Railway dyno) but has a critical limitation when scaling horizontally.

**The Problem:** When running multiple replicas/processes, each instance maintains its own in-memory rate limit counters. A user hitting different replicas gets N× the intended rate limit. For example:
- Intended limit: 10 requests/minute
- 2 replicas: User can make 20 requests/minute (10 per replica)
- 3 replicas: User can make 30 requests/minute (10 per replica)

This is a common pitfall with in-memory rate limiting and can undermine security controls on sensitive endpoints.

**Calendar Cache:** Similarly, `app/services/calendar_cache.py` uses in-memory caching with a 5-minute TTL. With multiple processes, cache invalidation won't propagate across instances, leading to stale data and unnecessary Google Calendar API calls.

### When to Migrate

**Before enabling `replicas > 1` on Railway** or before adding a load balancer with multiple backends, you must migrate both rate limiting and caching to Redis.

Current deployment is optimized for single-process operation. Scaling horizontally requires the Redis migration below.

### Redis Migration Guide

Railway offers Redis as an add-on service. Once added, Railway will provide a `REDIS_URL` environment variable.

#### Rate Limiting Migration

slowapi uses the `limits` library under the hood, which supports Redis via storage backends:

```python
# app/middleware/rate_limit.py

from slowapi import Limiter
from slowapi.util import get_remote_address

# Current (in-memory):
limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

# Redis-backed (for multi-process):
import os
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"],
    storage_uri=os.getenv("REDIS_URL", "redis://localhost:6379"),
)
```

The `storage_uri` parameter tells slowapi to use Redis instead of in-memory storage. All rate limit counters will be centralized in Redis and shared across all process replicas.

#### Calendar Cache Migration

Replace the in-memory dictionary with a Redis-backed cache:

```python
# app/services/calendar_cache.py

import redis
import json
import os

# Initialize Redis client
redis_client = redis.from_url(
    os.getenv("REDIS_URL", "redis://localhost:6379"),
    decode_responses=True
)

class CalendarCache:
    def get(self, user_id, calendar_ids, start_date, end_date):
        key = self._make_key(user_id, calendar_ids, start_date, end_date)
        cached = redis_client.get(key)
        if cached:
            return json.loads(cached)
        return None

    def set(self, user_id, calendar_ids, start_date, end_date, events):
        key = self._make_key(user_id, calendar_ids, start_date, end_date)
        redis_client.setex(
            key,
            300,  # 5 minutes TTL
            json.dumps(events)
        )
```

#### Adding Redis on Railway

1. In your Railway project, click "+ New"
2. Select "Database" → "Redis"
3. Railway will automatically inject `REDIS_URL` environment variable
4. Deploy the code changes above
5. Verify in logs that Redis connection succeeds

#### Testing

After migration, test that rate limiting works across replicas:
1. Scale to 2 replicas
2. Make rapid requests to a rate-limited endpoint
3. Verify you hit the limit at the intended threshold (not 2×)

### Database Scaling

For database scaling:
- Upgrade PostgreSQL plan for more connections
- Consider connection pooling with PgBouncer
- Current pool settings (2+3) are tuned for single-worker deployment

## Backups

Railway PostgreSQL includes automatic backups:
- Point-in-time recovery available
- Configure retention in database settings

## Troubleshooting

### App won't start
1. Check logs: `railway logs`
2. Verify all required env vars are set
3. Check `/ready` endpoint for DB issues

### Database connection errors
1. Check `DATABASE_URL` is set correctly
2. Verify PostgreSQL service is running
3. Check connection limits

### OAuth not working
1. Verify redirect URIs in provider consoles
2. Check `BASE_URL` matches your domain
3. Ensure HTTPS is enabled

### Migrations failing
1. Check migration files for syntax errors
2. Verify database permissions
3. Review migration logs in startup output
