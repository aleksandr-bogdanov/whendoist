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

# Optional: Error Tracking
SENTRY_DSN=<from-sentry.io>

# Optional: Environment name
ENVIRONMENT=production
```

### 4. Generate Secret Key

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 5. Custom Domain

1. Go to Settings → Domains
2. Add custom domain
3. Configure DNS (CNAME to Railway-provided hostname)
4. Railway handles SSL automatically

## Health Checks

Railway uses these endpoints for health monitoring:

- **GET /health** - Liveness check (app is running)
- **GET /ready** - Readiness check (includes DB connection)
- **GET /metrics** - Prometheus metrics (for monitoring)

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

Railway supports horizontal scaling:

1. Go to Settings → Scaling
2. Adjust number of replicas
3. Railway handles load balancing

For database scaling:
- Upgrade PostgreSQL plan for more connections
- Consider connection pooling with PgBouncer

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
