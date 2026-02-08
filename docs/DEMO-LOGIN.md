# Demo Login

Config-gated demo login system that bypasses Google OAuth. Enables product demos, PR preview deployments, and safe testing without mixing real data.

**Gated by:** `DEMO_LOGIN_ENABLED` env var (default: `false`). When disabled, demo routes return 404 and the login page shows only the Google sign-in button.

---

## Profiles

| Profile | Email | Description |
|---------|-------|-------------|
| `demo` | `demo-demo@whendoist.local` | Rich sample data: 4 domains, ~50 tasks, analytics history |
| `encrypted` | `demo-encrypted@whendoist.local` | Empty account for testing E2E encryption setup |
| `blank` | `demo-blank@whendoist.local` | Clean slate for manual testing |

Demo users are regular `User` rows identified by `@whendoist.local` email suffix. No database migration required.

---

## Demo Persona: Product Manager

The "demo" profile seeds a realistic product manager workflow:

### Domains

| Domain | Icon | Color | Theme |
|--------|------|-------|-------|
| Product | `#3b82f6` | Blue | PM work: specs, reviews, ceremonies |
| Fitness | `#22c55e` | Green | Workouts, health habits |
| Home | `#f59e0b` | Amber | Household, errands, family |
| Side Project | `#a855f7` | Purple | Hobby coding, learning |

### Clarity Rules

- **Autopilot** — zero-thought tasks: standup updates, watering plants, filing expenses, paying bills
- **Normal** — routine execution: reviewing PRs, grocery shopping, gym workouts, fixing bugs
- **Brainstorm** — creative/open-ended: writing specs, planning sprints, designing APIs, trip planning

### Task Distribution

| Category | Count | Method |
|----------|-------|--------|
| Active (pending) tasks | ~17 | `TaskService.create_task()` — proper position handling |
| Recurring tasks | 4 | `TaskService.create_task()` + direct `TaskInstance` insertion |
| Recurring instances | ~30+ | Direct `TaskInstance()` — 14 days of history with realistic completion |
| Completed tasks | ~28 | Direct `Task()` — custom `created_at`/`completed_at` for analytics |
| Thoughts (inbox) | 4 | `TaskService.create_task()` — no domain assigned |

Active tasks are spread across day-2 through day+5 with `scheduled_time` and `duration_minutes` so the calendar carousel shows time blocks.

### Analytics Coverage

Completed tasks are distributed to populate all analytics charts:

- **Active Hours** — morning (7-9), midday (10-13), afternoon (14-17), evening (18-21)
- **Best Days** — Mon-Fri heavier, weekends lighter
- **By Impact** — P1 through P4 represented
- **By Domain** — all 4 domains with 6-10 completions each
- **Resolution Time** — same-day through multi-week range
- **Heatmap** — 1-3 completions per day across past 30 days

Recurring instances include completed and skipped statuses for recurring completion rate charts.

---

## UI Indicator

A **floating pill** appears in the bottom-right corner on all pages for demo users (rendered in `base.html`, gated by `is_demo_user` template variable).

- Small purple "Demo" badge — non-intrusive, doesn't push content
- Click to expand: shows "Reset data" button and "Dismiss" link
- "Dismiss" saves to `localStorage` (`demo-pill-dismissed`) — stays hidden across page navigations
- Replaces the old block-level `.demo-banner` that pushed the task list down

---

## Reset Behavior

"Reset data" (via the pill or `POST /auth/demo/reset`):

1. Deletes all user data (tasks, instances, domains, preferences, tokens, passkeys)
2. Re-seeds if profile is "demo" (blank/encrypted stay empty)
3. All dates recalculated relative to current date — always looks fresh

---

## Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/demo?profile=demo` | Create/reuse demo user, set session, redirect to `/thoughts` |
| `POST` | `/auth/demo/reset` | Clear all data and re-seed (requires authenticated demo session) |

Both return 404 when `DEMO_LOGIN_ENABLED=false`. Rate-limited with `DEMO_LIMIT` (3/minute) — tighter than general auth since demo login seeds ~80 rows and reset does bulk DELETEs + INSERTs.

---

## Security

- **Gated by env var** — default `false`, invisible when off
- **No OAuth tokens** — demo users can't access Google/Todoist APIs
- **Standard multitenancy** — demo data isolated via `user_id` filtering
- **Email convention** — `@whendoist.local` never collides with real emails (non-routable TLD)
- **Rate-limited** — `DEMO_LIMIT` (3/minute), tighter than general `AUTH_LIMIT` (10/minute)
- **No migration** — demo users are plain `User` rows

---

## Limitations

**Shared state:** All visitors using the same profile share a single user row. One person's reset affects all concurrent sessions. This is fine for PR previews (single tester) but not suitable for a public-facing demo with multiple simultaneous users. A per-session isolation approach (e.g., UUID-based demo users with TTL cleanup) would be needed for that use case.

**No pre-seeded encryption:** Encryption is client-side only (browser generates keys via PBKDF2 + AES-256-GCM). Pre-seeding encrypted data in Python would require duplicating the JS crypto chain and hard-coding a passphrase — a fragile coupling that breaks silently if crypto parameters change. Instead, test encryption by enabling it manually on the "encrypted" (blank) or "demo" (rich data) profiles.

---

## Railway PR Previews

Set on Railway PR environments:

```
DEMO_LOGIN_ENABLED=true
BASE_URL=https://<pr-preview-url>
```

Demo login bypasses OAuth — works on any domain.

---

## Files

| File | Role |
|------|------|
| `app/services/demo_service.py` | Core service: user creation, seeding, reset |
| `app/routers/auth.py` | Routes: `GET /auth/demo`, `POST /auth/demo/reset` |
| `app/routers/pages.py` | Passes `is_demo_user` flag to all templates |
| `app/config.py` | `demo_login_enabled` setting |
| `app/constants.py` | `DEMO_EMAIL_SUFFIX`, `DEMO_VALID_PROFILES` |
| `app/templates/base.html` | Floating pill HTML + JS |
| `app/templates/login.html` | "Try Demo Account" button |
| `static/css/dashboard.css` | `.demo-pill` styles |
| `static/css/login.css` | Demo button styles |
| `tests/test_demo_service.py` | Unit tests |
