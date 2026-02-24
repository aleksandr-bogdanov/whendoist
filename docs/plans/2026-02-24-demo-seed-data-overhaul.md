---
version:
pr:
created: 2026-02-24
---

# Make Demo Great Again — Overhaul Demo Seed Data

## Context

The current demo user ships with decent but shallow seed data: 4 domains, ~17 active tasks, 4 recurring tasks, 28 completed tasks, 4 thoughts, and **zero** archived/deleted tasks or subtasks. Tasks are scattered generically and don't tell a coherent story. Random completion status (`random.random()`) makes the demo non-deterministic — bad for testing. Calendar view looks sparse because few tasks have time slots.

**Goal:** Create a rich, realistic, deterministic demo dataset that showcases every app feature and serves as a reliable testing sandbox.

## Persona

**Alex Chen — Senior Product Manager at a tech startup** who stays active, has a side project, and is a continuous learner.

## Changes — all in `app/services/demo_service.py`

### 1. Domains: 4 → 5

| Domain | Color | Icon | Replaces |
|--------|-------|------|----------|
| **Work** | #3b82f6 (blue) | 💼 | Product |
| **Health & Fitness** | #22c55e (green) | 💪 | Fitness |
| **Personal** | #f59e0b (orange) | 🏠 | Home |
| **Side Project** | #a855f7 (purple) | 🚀 | Side Project (same) |
| **Learning** | #06b6d4 (cyan) | 📚 | *NEW* |

### 2. Deterministic randomness

Replace bare `random.random()` with `random.seed(user_id)` at the top of `_seed_demo_data()`. Every demo load for the same user_id produces identical data. Different users still get slightly different skip patterns.

### 3. Recurring tasks: 4 → 8

| Task | Domain | Schedule | Time | Duration |
|------|--------|----------|------|----------|
| Morning standup | Work | daily (weekdays) | 9:00 | 15 min |
| Gym session | Health | Mon/Wed/Fri | 7:00 | 60 min |
| Weekly 1:1 with manager | Work | Thu | 14:00 | 30 min |
| Sprint review | Work | Fri | 15:00 | 45 min |
| Meal prep | Health | Sun | 10:00 | 90 min |
| Water plants | Personal | every 3 days | 8:00 | 10 min |
| Evening coding session | Side Project | Tue/Thu | 20:00 | 90 min |
| Reading time | Learning | daily | 22:00 | 30 min |

Backfill 14 days of instances (same as now), but with deterministic skip patterns.

### 4. Active tasks — dense calendar coverage

**Today (6-7 time-slotted + 2-3 date-only):**
- 10:00 Write PRD for search feature (Work, P1, brainstorm, 90min) — **with 3 subtasks**
- 11:30 Review design mockups from Figma (Work, P2, normal, 30min)
- 13:00 Lunch with Sarah (Personal, P3, normal, 60min)
- 14:30 Prepare Q4 investor update (Work, P1, brainstorm, 60min) — **with 2 subtasks**
- 17:00 Grocery run — farmers market (Personal, P2, autopilot, 45min)
- 19:00 Fix authentication bug in OAuth flow (Side Project, P1, normal, 60min)
- *(date only)* Pay rent (Personal, P1, autopilot, 5min)
- *(date only)* Submit expense report (Work, P3, autopilot, 15min)

**Tomorrow (5-6 time-slotted + 1-2 date-only):**
- 10:30 Prep user interview questions (Work, P2, brainstorm, 45min)
- 13:00 Coffee with Marcus re: partnership (Work, P2, normal, 45min)
- 16:00 Write blog post draft (Side Project, P2, brainstorm, 90min)
- 18:00 Run — 5K tempo (Health, P2, normal, 40min)
- 20:00 Complete online course module 3 (Learning, P3, normal, 60min)
- *(date only)* Order new monitor for home office (Work, P3, autopilot)

**Day +2 through +5 (decreasing density):**
- Day+2: 3-4 tasks (sprint planning prep, dentist appt, side project deploy, book chapter)
- Day+3: 2-3 tasks (team workshop, call plumber, conference talk outline)
- Day+4: 2 tasks (book flight for conference, design landing page)
- Day+5: 1-2 tasks (quarterly OKR review, deep clean apartment)

### 5. Overdue tasks (past-dated, still pending) — 3-4 tasks

- Day-1: Reply to partnership email (Work, P2, normal)
- Day-2: Return Amazon package (Personal, P4, autopilot)
- Day-3: Review pull request #312 (Side Project, P2, normal, 30min)

These show up with overdue styling in the task list view.

### 6. Subtasks (NEW)

Two parent tasks get subtasks:

**"Write PRD for search feature":**
1. Define user stories and acceptance criteria
2. Create wireframe sketches
3. Write success metrics and KPIs

**"Prepare Q4 investor update":**
1. Pull Q4 revenue and growth metrics
2. Draft narrative slides

### 7. Archived/deleted tasks (NEW) — 6-8 tasks

Status `"archived"` across multiple domains:
- Cancel premium Notion plan (Work, P4) — archived 5 days ago
- Old meal prep recipe collection (Health, P4) — archived 8 days ago
- Research coworking spaces (Personal, P3) — archived 3 days ago
- Rewrite onboarding flow (Side Project, P2) — archived 10 days ago
- Organize bookshelf by category (Personal, P4) — archived 6 days ago
- Set up RSS reader (Learning, P4) — archived 12 days ago

### 8. Completed tasks — ~30, more realistic

Keep similar volume (~30) but with coherent titles matching the persona. Spread across all 5 domains. Varied `completed_at` hours (7am-10pm) for analytics charts. Deterministic timestamps (no random minutes — use a formula based on index).

### 9. Thoughts (unscheduled, no domain) — 5-6

- "Explore working remotely from Lisbon for a month" (P4, brainstorm)
- "Cancel HBO Max subscription" (P3, autopilot)
- "Birthday gift ideas for Mom" (P3, brainstorm)
- "Try that new Thai place on 5th Avenue" (P4, normal)
- "Look into home office tax deduction" (P3, normal)
- "Learn to make sourdough bread" (P4, brainstorm)

## Files to modify

| File | Change |
|------|--------|
| `app/services/demo_service.py` | Rewrite all `_seed_*` methods |
| `tests/test_demo_service.py` | Update assertions (5 domains, new task counts, archived tasks exist, subtasks exist) |

## What stays the same

- `DemoService` class structure, `get_or_create_demo_user`, `reset_demo_user`, `cleanup_stale_users`, `_clear_user_data` — no changes
- Demo login flow, endpoints, frontend — no changes
- Domain/Task/TaskInstance models — no changes
- `wizard_completed=False` — no change

## Verification

1. `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test` — all pass
2. Start dev server, click "Try Demo Account" → verify:
   - 5 domains visible in sidebar
   - Today's calendar has 6+ time-slotted tasks
   - Tomorrow has 5+ tasks
   - Recurring tasks show in calendar with correct patterns
   - Deleted/archived section shows 6+ tasks
   - Completed section shows ~30 tasks
   - Thoughts inbox has 5-6 items
   - Subtasks visible under parent tasks
   - Overdue tasks show with past dates
   - Reset demo → same data reappears (deterministic)
