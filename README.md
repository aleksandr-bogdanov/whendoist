<p align="center">
  <img src="static/img/w-icon-512.png" alt="Whendoist" width="120">
</p>

<p align="center">
  <strong>WHEN do I do my tasks?</strong><br>
  A day planning app that merges your tasks with Google Calendar.
</p>

<p align="center">
  <a href="https://whendoist.com">whendoist.com</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#-calendar-integration">Calendar</a> •
  <a href="#-documentation">Documentation</a>
</p>

---

## The Problem

Calendar shows *when* you're busy. Task lists show *what* you need to do. But neither tells you *when to actually do your tasks*.

## The Solution

Whendoist brings tasks and calendar together. Create tasks with impact and mode settings, see your Google Calendar events, drag tasks into free time slots, and track your completion progress.

---

## ⚡ Quick Start

```bash
git clone https://github.com/aleksandr-bogdanov/whendoist.git
cd whendoist
uv sync
cp .env.example .env   # Configure OAuth credentials

# Frontend
cd frontend && npm install && cd ..

# Start
just db-up && just dev           # Backend at :8000
cd frontend && npm run dev       # Frontend dev server at :5173 (proxies API to :8000)
```

Open http://localhost:5173 (dev) or http://localhost:8000 (production build) and connect Google Calendar.

See the [Deployment Guide](docs/DEPLOYMENT.md) for production setup.

---

## ✨ Features

### Four Pages

| Page | Purpose |
|------|---------|
| **Tasks** | Day planning with task list + calendar |
| **Thoughts** | Quick capture inbox, promote thoughts to tasks |
| **Analytics** | Completion stats, trends, streaks |
| **Settings** | Integrations, domains, security, preferences |

### Energy-Based Filtering

Filter tasks by how much energy they require:

| Mode | Energy | Use When |
|---------|--------|----------|
| Autopilot | 🧟 Zombie | Mindless work, can do when tired |
| Normal | ☕ Normal | Know what to do, needs some focus |
| Brainstorm | 🧠 Focus | Needs research or deep thinking |

### Task Properties

| Property | Purpose |
|----------|---------|
| **Impact** | Priority: High / Mid / Low / Min |
| **Mode** | Task mode: Autopilot, Normal, Brainstorm |
| **Duration** | Time estimate (30m, 2h, etc.) |
| **Scheduled** | When you plan to work on it |
| **Recurrence** | Daily, weekly, monthly, custom |

### Visual Scheduling

- **Drag** tasks from the list to calendar time slots
- **Plan** — auto-schedule tasks into a selected time range
- **Complete** — mark tasks done with visual aging

### Analytics Dashboard

- Daily completions, completion rate, streaks
- Domain breakdown, impact distribution
- GitHub-style contribution heatmap
- Velocity trends with rolling averages

---

## 🔁 Recurring Tasks

Set any task to repeat on a schedule — daily, weekly, monthly, or a custom interval (e.g. every 4 days).

### How it works

- When you create a recurring task, Whendoist generates **individual instances** for each upcoming occurrence (up to 60 days ahead).
- Each instance can be **completed** or **skipped** independently — completing Monday's instance doesn't affect Wednesday's.

### Editing a recurring task

There are two different things you can change, and they work differently:

| What you do | What happens |
|-------------|--------------|
| **Complete / skip an instance** | Only that one occurrence is affected. The rest of the schedule stays the same. |
| **Edit the parent task** (change the scheduled date, repeat rule, or start date) | The entire schedule resets. All future instances are deleted and regenerated from the new settings. Completed and skipped instances stay in history. |

**In short:** completing or skipping touches one instance. Editing the task card resets the whole series.

### Drag and drop

Dragging a task in the calendar reschedules that **single instance** — the rest of the series is untouched.

---

## 🔐 Optional: End-to-End Encryption

Your task titles, descriptions, and project names can be encrypted so only you can read them.

| Encrypted | Not Encrypted |
|-----------|---------------|
| Task titles | Dates and times |
| Task descriptions | Priority, mode, status |
| Project/domain names | Recurrence, duration |

When enabled, we store ciphertext — we cannot read your content. Dates stay unencrypted for calendar/filter functionality.

**Trade-offs:** You must enter your passphrase each session. If you lose it, data is unrecoverable.

See the [Encryption Guide](docs/ENCRYPTION.md) for technical details.

---

## 📅 Calendar Integration

Whendoist doesn't just show your calendar — it **syncs back to it**. Two options depending on your setup:

### Google Calendar Sync (real-time push)

If you use Google Calendar, this is the best option. Whendoist pushes your scheduled tasks as real events into a dedicated "Whendoist" calendar in your Google account.

- **Instant** — tasks appear in Google Calendar within seconds of scheduling
- **Two-way visibility** — see your real calendar in Whendoist, see your tasks in Google Calendar
- **Native events** — triggers Google Calendar notifications, shows in schedule view, works on every device signed into your Google account

Enable in Settings → Google Calendar Sync. Requires a one-time Google authorization with calendar write access.

### Calendar Feed (iCal subscription)

For **Apple Calendar, Outlook, Fantastical**, or any app that supports iCal subscriptions. Whendoist generates a `.ics` feed URL that your calendar app polls for updates.

- **Universal** — works with any calendar app that supports URL subscriptions
- **Recurring tasks done right** — emitted as proper RRULE events, so your calendar app shows occurrences indefinitely (not limited to the 60-day materialization window)
- **Private** — the feed URL contains a 256-bit token; no login required for your calendar app to fetch it
- **Completed tasks** — show with a ✓ prefix, retained for 14 days, then automatically removed

Enable in Settings → Calendar Feed. Copy the URL into your calendar app's "Subscribe to calendar" option.

> **Using both?** If you subscribe to the feed from Google Calendar while also having GCal Sync enabled, you'll see duplicate events. The feed is designed for other calendar apps — GCal Sync already gives Google Calendar the best experience.

---

## 🔧 Setup

### Prerequisites

- Python 3.13+ ([uv](https://github.com/astral-sh/uv) recommended)
- PostgreSQL (or Docker)
- Google Cloud credentials for Calendar API

### Configuration

1. **Google OAuth** — Create credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. **Todoist OAuth** (optional) — Create app in [Todoist App Console](https://developer.todoist.com/appconsole.html)
3. **Environment** — Copy `.env.example` to `.env` and fill in credentials

See the [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

### Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness check (always returns 200) |
| `GET /ready` | Readiness check (verifies DB connectivity) |
| `GET /metrics` | Prometheus metrics (request counts, latency, pool stats) |

### Monitoring & Observability

**Error Tracking:**
- **Sentry** — Automatic exception capture with full stack traces, user context, and performance monitoring
- Configured via `SENTRY_DSN` environment variable (see [Deployment Guide](docs/DEPLOYMENT.md))
- Free tier: 5K errors/month

**Performance Monitoring:**
- Query timing logs (`whendoist.timing` logger)
- Database connection pool metrics
- Calendar cache hit/miss rates
- Background task execution tracking

See [Performance Guide](docs/PERFORMANCE.md) for optimization details.

---

## 🛠 Development

```bash
# Backend
just dev      # Dev server with hot reload
just test     # Run pytest
just lint     # Run ruff
just fmt      # Format code

# Frontend
cd frontend && npm run dev          # Vite dev server with HMR
cd frontend && npm run build        # Production build
cd frontend && npx orval            # Regenerate API types from OpenAPI spec
cd frontend && npx biome check .    # Lint + format check
cd frontend && npx tsc -p tsconfig.app.json --noEmit  # TypeScript type check
```

### Claude Code Skills

Custom [slash commands](https://docs.anthropic.com/en/docs/claude-code/skills) for automated issue management:

| Command | Description |
|---------|-------------|
| `/fix-issue 123` | Fix a single GitHub issue end-to-end — investigate root cause, implement fix, run checks, create versioned PR, wait for CI, merge, and close |
| `/fix-all-issues` | Fix all open GitHub issues one by one, following the same workflow for each |

Both skills enforce the full project workflow: root cause analysis, `ruff format` + `ruff check` + `pyright` + `pytest`, version bump, changelog entry, and squash-merge PR.

### Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2.0 (async) |
| Frontend | React 19, TypeScript, TanStack Router/Query, Tailwind CSS v4, shadcn/ui |
| Build | Vite 7, Biome, orval (OpenAPI codegen) |
| Database | PostgreSQL with asyncpg |
| Tooling | uv, ruff, pytest, Biome |

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **Getting Started** | |
| [Deployment Guide](docs/DEPLOYMENT.md) | Railway deployment, environment variables, Sentry setup |
| [Database Migrations](docs/MIGRATIONS.md) | Schema changes with Alembic |
| **Security** | |
| [Security Guide](docs/SECURITY.md) | Authentication, rate limiting, headers |
| [Encryption Guide](docs/ENCRYPTION.md) | E2E encryption details |
| [Demo Login](docs/DEMO-LOGIN.md) | Demo accounts for testing and previews |
| **Architecture** | |
| [Recurring Tasks](#-recurring-tasks) | How repeating tasks, instances, and editing work |
| [Subtasks](docs/SUBTASKS.md) | Three-level hierarchy, container model, enforced constraints |
| [Performance Guide](docs/PERFORMANCE.md) | Query optimization, caching, monitoring |
| [GCal Sync](docs/GCAL-SYNC.md) | Google Calendar one-way sync architecture |
| [Calendar Feed](docs/CALENDAR-FEED.md) | iCal subscription feed for Apple Calendar, Outlook, etc. |
| [Smart Input](docs/SMART-INPUT.md) | Two-hook token parsing architecture — design decisions and file map |
| [Calendar DnD](docs/CALENDAR-DND.md) | dnd-kit in nested scroll containers — bugs and working patterns |
| [Snapshots](docs/SNAPSHOTS.md) | Automated daily backups with `data_version` change tracking |
| [PWA Viewport Fix](docs/PWA-VIEWPORT-FIX.md) | iOS viewport shrinking bug — diagnosis and workaround |
| [Widgets](docs/WIDGETS.md) | Native home screen widgets (iOS WidgetKit + Android AppWidgetProvider) |
| [Command Palette Research](docs/COMMAND-PALETTE-RESEARCH.md) | Competitive analysis of 13 apps, 20 ranked enhancement proposals |
| **Brand & Design** | |
| [Brand Guidelines](BRAND.md) | Colors, typography, design principles |
| [Color System](docs/brand/COLOR-SYSTEM.md) | Complete color palette |
| [UI Components](docs/brand/UI-KIT.md) | Button, form, panel specs |
| **Reference** | |
| [Post-v1.0 Backlog](docs/POST-1.0-BACKLOG.md) | Deferred work and future roadmap |
| [Changelog](CHANGELOG.md) | Version history |
| [Test Architecture](tests/README.md) | Testing patterns |
| [Plans & Archive](docs/plans/) | Historical audits, reviews, and implementation plans |

---

## 📄 License

MIT

## 👤 Author

Alex Bogdanov — [alex@bogdanov.wtf](mailto:alex@bogdanov.wtf)

---

<p align="center">
  <sub>Built with FastAPI, React, and too much coffee ☕</sub>
</p>
