<p align="center">
  <img src="static/img/logo.png" alt="Whendoist" width="200">
</p>

<h1 align="center">Whendoist</h1>

<p align="center">
  <strong>WHEN do I do my tasks?</strong><br>
  A day planning app that merges your tasks with Google Calendar.
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#-setup">Setup</a> •
  <a href="#-development">Development</a>
</p>

---

## The Problem

Calendar shows *when* you're busy. Task lists show *what* you need to do. But neither tells you *when to actually do your tasks*.

## The Solution

Whendoist brings tasks and calendar together. Create tasks with impact and clarity levels, see your Google Calendar events, drag tasks into free time slots, and track your completion progress.

---

## ⚡ Quick Start

```bash
# Clone and install
git clone https://github.com/aleksandr-bogdanov/whendoist.git
cd whendoist
uv sync

# Configure (see Setup section for OAuth credentials)
cp .env.example .env

# Start database and server
just db-up
just dev

# Open http://localhost:8000
```

---

## ✨ Features

### Four Pages

| Page | Purpose |
|------|---------|
| **Tasks** | Day planning with task list + calendar |
| **Thought Cabinet** | Quick capture inbox, promote thoughts to tasks |
| **Analytics** | Completion stats, trends, streaks |
| **Settings** | Integrations, domains, security, task display preferences |

### Energy-Based Filtering

Filter tasks by clarity (how defined the work is):

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

### Task List Organization

Tasks are organized into three sections within each domain:

| Section | Sorting | Purpose |
|---------|---------|---------|
| **Unscheduled** | By impact (P1 → P4) | Tasks without a scheduled date — highest priority first |
| **Scheduled** | By date (soonest first) | Tasks with a scheduled date — what's coming up next |
| **Completed** | By impact | Recently completed tasks (faded styling) |

**Why date-based sorting for scheduled tasks?**

When you schedule a task for a specific date, that date represents when you plan to do it. A task due tomorrow is more urgent than one due next week, regardless of impact level. This gives you a natural "what's coming up next" view in your task list.

### Analytics Dashboard

Powered by ApexCharts:
- Daily completions, completion rate, streaks
- Domain breakdown, impact distribution
- Day-of-week and hour-of-day patterns
- GitHub-style contribution heatmap
- Velocity trends with rolling averages

### Privacy & Security

- **E2E Encryption** — Optional client-side encryption for task data (AES-256-GCM)
- **Code Provenance** — Verify deployed code matches GitHub source with build hashes
- **Backup & Restore** — Export/import all data as JSON

### Optional: Import from Todoist

Already have tasks in Todoist? Import them with one click.

---

## 🔧 Setup

### Prerequisites

- Python 3.13+ (we use [uv](https://github.com/astral-sh/uv))
- PostgreSQL (or Docker)
- Google account with Calendar

### 1. Google OAuth (Required)

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or select existing)
3. Enable **Google Calendar API** in [API Library](https://console.cloud.google.com/apis/library)
4. Go to **Credentials** → Create **OAuth 2.0 Client ID**
   - Application type: Web application
   - Authorized redirect URI: `http://localhost:8000/auth/google/callback`
5. Copy Client ID and Client Secret to `.env`

### 2. Todoist OAuth (Optional)

Only needed if you want to import existing Todoist tasks:

1. Go to [Todoist App Console](https://developer.todoist.com/appconsole.html)
2. Create a new app
3. Set OAuth redirect URL: `http://localhost:8000/auth/todoist/callback`
4. Copy Client ID and Client Secret to `.env`

### 3. Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```bash
DATABASE_URL=postgresql+asyncpg://whendoist:whendoist@localhost:5432/whendoist
SECRET_KEY=generate-a-random-secret-key
BASE_URL=http://localhost:8000
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
# Optional - only for Todoist import
TODOIST_CLIENT_ID=your-todoist-client-id
TODOIST_CLIENT_SECRET=your-todoist-client-secret
```

> Generate a secret key: `python -c "import secrets; print(secrets.token_urlsafe(32))"`

### 4. Run

```bash
just db-up   # Start PostgreSQL
just dev     # Start dev server
```

Open http://localhost:8000 and connect Google Calendar.

---

## 🛠 Development

```bash
just dev      # Dev server with hot reload
just test     # Run pytest
just lint     # Run ruff
just fmt      # Format code
```

### Testing

See [`tests/README.md`](tests/README.md) for full test architecture.

```bash
# Run all unit tests
just test

# Run specific test file
uv run pytest tests/test_task_sorting.py -v

# Run E2E tests (requires running server)
uv run playwright install chromium
uv run pytest tests/e2e/ -v
```

| Category | Files | Purpose |
|----------|-------|---------|
| Unit | `test_*.py` | Fast tests, no I/O |
| Contract | `test_js_module_contract.py` | Verify JS module APIs |
| E2E | `e2e/test_*.py` | Full browser flows |

### Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2.0 (async) |
| Frontend | HTMX, Jinja2, Pico CSS, ApexCharts |
| Database | PostgreSQL with asyncpg |
| APIs | Google Calendar v3, Todoist API v1 (optional import) |
| Tooling | uv, ruff, pytest |

### Project Structure

```
app/
├── main.py           # FastAPI entrypoint
├── models.py         # ORM models (Task, Domain, User, etc.)
├── services/         # Task, Analytics, Preferences services
├── routers/          # HTTP routes
└── templates/        # Jinja2 templates

static/
├── css/              # Styles + design tokens
├── js/               # Drag-drop, planning, dialogs
└── img/              # Logo and favicons
```

See `DESIGN.md` for full design system documentation.

---

## 📄 License

MIT

## 👤 Author

Alex Bogdanov — [alex@bogdanov.wtf](mailto:alex@bogdanov.wtf)

---

<p align="center">
  <sub>Built with FastAPI, HTMX, and too much coffee ☕</sub>
</p>
