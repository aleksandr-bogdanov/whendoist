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
  <a href="#-documentation">Documentation</a>
</p>

---

## The Problem

Calendar shows *when* you're busy. Task lists show *what* you need to do. But neither tells you *when to actually do your tasks*.

## The Solution

Whendoist brings tasks and calendar together. Create tasks with impact and clarity levels, see your Google Calendar events, drag tasks into free time slots, and track your completion progress.

---

## ⚡ Quick Start

```bash
git clone https://github.com/aleksandr-bogdanov/whendoist.git
cd whendoist
uv sync
cp .env.example .env   # Configure OAuth credentials
just db-up && just dev
```

Open http://localhost:8000 and connect Google Calendar.

See the [Deployment Guide](docs/DEPLOYMENT.md) for production setup.

---

## ✨ Features

### Four Pages

| Page | Purpose |
|------|---------|
| **Tasks** | Day planning with task list + calendar |
| **Thought Cabinet** | Quick capture inbox, promote thoughts to tasks |
| **Analytics** | Completion stats, trends, streaks |
| **Settings** | Integrations, domains, security, preferences |

### Energy-Based Filtering

Filter tasks by how much energy they require:

| Clarity | Energy | Use When |
|---------|--------|----------|
| Executable | 🧟 Zombie | Clear next action, can do when tired |
| Defined | ☕ Normal | Know what to do, needs some focus |
| Exploratory | 🧠 Focus | Needs research or deep thinking |

### Task Properties

| Property | Purpose |
|----------|---------|
| **Impact** | Priority: P1 (high) → P4 (minimal) |
| **Clarity** | Energy required: Executable, Defined, Exploratory |
| **Duration** | Time estimate (30m, 2h, etc.) |
| **Scheduled** | When you plan to work on it |
| **Due** | Deadline (optional) |
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

## 🔐 Optional: End-to-End Encryption

Your task titles, descriptions, and project names can be encrypted so only you can read them.

| Encrypted | Not Encrypted |
|-----------|---------------|
| Task titles | Dates and times |
| Task descriptions | Priority, clarity, status |
| Project/domain names | Recurrence, duration |

When enabled, we store ciphertext — we cannot read your content. Dates stay unencrypted for calendar/filter functionality.

**Trade-offs:** You must enter your passphrase each session. If you lose it, data is unrecoverable.

See the [Encryption Guide](docs/ENCRYPTION.md) for technical details.

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
just dev      # Dev server with hot reload
just test     # Run pytest
just lint     # Run ruff
just fmt      # Format code
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2.0 (async) |
| Frontend | HTMX, Jinja2, Pico CSS, ApexCharts |
| Database | PostgreSQL with asyncpg |
| Tooling | uv, ruff, pytest |

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
| [Performance Guide](docs/PERFORMANCE.md) | Query optimization, caching, monitoring |
| [GCal Sync](docs/GCAL-SYNC.md) | Google Calendar one-way sync architecture |
| [Task List Header Redesign](docs/TASK-LIST-HEADER-REDESIGN.md) | Header restructure, clarity naming revamp, options panel simplification |
| **Product & Roadmap** | |
| [Product Vision](docs/PRODUCT-VISION.md) | Strategic positioning, user archetypes, mobile UX |
| [v1.0 Roadmap](docs/V1-ROADMAP.md) | Path to production-ready release, Honeycomb profiling plan |
| **Brand & Design** | |
| [Brand Guidelines](BRAND.md) | Colors, typography, design principles |
| [Color System](docs/brand/COLOR-SYSTEM.md) | Complete color palette |
| [UI Components](docs/brand/UI-KIT.md) | Button, form, panel specs |
| **Reference** | |
| [Changelog](CHANGELOG.md) | Version history |
| [Test Architecture](tests/README.md) | Testing patterns |
| [Archived Docs](docs/archive/) | Historical audits, reviews, and plans |

---

## 📄 License

MIT

## 👤 Author

Alex Bogdanov — [alex@bogdanov.wtf](mailto:alex@bogdanov.wtf)

---

<p align="center">
  <sub>Built with FastAPI, HTMX, and too much coffee ☕</sub>
</p>
