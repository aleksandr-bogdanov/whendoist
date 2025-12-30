<p align="center">
  <img src="static/img/logo.png" alt="Whendoist" width="200">
</p>

<h1 align="center">Whendoist</h1>

<p align="center">
  <strong>WHEN do I do my tasks?</strong><br>
  A Todoist companion that merges your tasks with Google Calendar.
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-how-it-works">How It Works</a> •
  <a href="#-setup">Setup</a> •
  <a href="#-development">Development</a> •
  <a href="#-roadmap">Roadmap</a>
</p>

---

## The Problem

Todoist is great at capturing *what* you need to do. Your calendar shows *when* you're busy. But neither tells you *when to actually do your tasks*.

## The Solution

Whendoist pulls tasks from Todoist and events from Google Calendar into one dashboard. Filter tasks by your energy level, drag them onto free time slots, and commit back to Todoist.

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

## 🎯 How It Works

### Energy-Based Filtering

Tag your Todoist tasks with clarity labels:

| Label | Energy | Use When |
|-------|--------|----------|
| `@executable` | 🧟 Zombie | Clear next action, can do when tired |
| `@defined` | ☕ Normal | Know what to do, needs some focus |
| `@exploratory` | 🧠 Focus | Needs research or deep thinking |

Toggle your current energy level to see only matching tasks.

### Duration Tracking

Add duration in task description: `d:30m`, `d:2h`, `d:1h30m`

Parent task duration = sum of subtask durations (automatic).

### Visual Scheduling

1. **Drag** tasks from the list to calendar time slots
2. **Plan** — auto-schedule multiple tasks into a selected time range
3. **Commit** — push scheduled times back to Todoist

---

## 🔧 Setup

### Prerequisites

- Python 3.13+ (we use [uv](https://github.com/astral-sh/uv) for package management)
- PostgreSQL (or Docker)
- Todoist account
- Google account with Calendar

### 1. Todoist OAuth

1. Go to [Todoist App Console](https://developer.todoist.com/appconsole.html)
2. Create a new app
3. Set OAuth redirect URL: `http://localhost:8000/auth/todoist/callback`
4. Copy Client ID and Client Secret to `.env`

### 2. Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or select existing)
3. Enable **Google Calendar API** in [API Library](https://console.cloud.google.com/apis/library)
4. Go to **Credentials** → Create **OAuth 2.0 Client ID**
   - Application type: Web application
   - Authorized redirect URI: `http://localhost:8000/auth/google/callback`
5. Copy Client ID and Client Secret to `.env`

### 3. Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```bash
DATABASE_URL=postgresql+asyncpg://whendoist:whendoist@localhost:5432/whendoist
SECRET_KEY=generate-a-random-secret-key
BASE_URL=http://localhost:8000
TODOIST_CLIENT_ID=your-todoist-client-id
TODOIST_CLIENT_SECRET=your-todoist-client-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

> 💡 Generate a secret key: `python -c "import secrets; print(secrets.token_urlsafe(32))"`

### 4. Run

```bash
just db-up   # Start PostgreSQL
just dev     # Start dev server
```

Open http://localhost:8000, connect Todoist, then Google Calendar.

---

## 🛠 Development

```bash
just dev      # Dev server with hot reload
just test     # Run pytest
just lint     # Run ruff
just fmt      # Format code
just sync     # Sync dependencies
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2.0 (async) |
| Frontend | HTMX, Jinja2, Pico CSS |
| Database | PostgreSQL with asyncpg |
| APIs | Todoist REST v2, Google Calendar v3 |
| Tooling | uv, ruff, pytest, GitHub Actions |

### Project Structure

```
app/
├── main.py           # FastAPI entrypoint
├── config.py         # Pydantic settings
├── database.py       # Async SQLAlchemy
├── models.py         # ORM models (User, Tokens)
├── auth/             # OAuth2 flows
├── services/         # API clients (Todoist, Google)
├── routers/          # HTTP routes
└── templates/        # Jinja2 templates

static/
├── css/              # Styles + design tokens
├── js/               # Energy selector, drag-drop, planning
└── img/              # Logo and favicons
```

---

## 🔮 Roadmap

### ✅ v0.1 — Foundation
OAuth, dashboard, energy filtering, clarity labels

### ✅ v0.2 — Drag & Drop
Visual scheduling, calendar carousel, overlap detection

### ✅ v0.3 — Auto-Planning (Current)
Plan feature, mobile PWA, touch support

### 🔜 v0.4 — Polish
- Persistent scheduled tasks (before commit)
- Undo/redo for scheduling
- Calendar sync improvements
- Multiple scheduling strategies

### 🔜 Future
- Time blocking templates
- Recurring task patterns
- Analytics and insights

---

## 📄 License

MIT

## 👤 Author

Alex Bogdanov — [alex@bogdanov.wtf](mailto:alex@bogdanov.wtf)

---

<p align="center">
  <sub>Built with FastAPI, HTMX, and too much coffee ☕</sub>
</p>
