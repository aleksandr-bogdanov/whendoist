---
version:
pr:
created: 2026-03-02
---

# iCal (.ics) Calendar Subscription Feed

## Findings

### 1. Existing Calendar Code

**No iCal/ics handling exists anywhere in the codebase.** The calendar-related code is:

- **`app/services/gcal.py`** — `GoogleCalendarClient` that talks to Google Calendar API v3 via `httpx`. `build_event_data()` constructs event payloads from task fields (timed vs all-day, completed prefix). No iCal generation.
- **`app/services/calendar_cache.py`** — In-memory cache for Google Calendar *read* events (5-minute TTL, keyed by user + date range + calendar IDs).
- **`app/services/gcal_sync.py`** — One-way push sync: Whendoist → Google Calendar. Bulk query pattern (`gcal_sync.py:487-510`) defines which tasks/instances are "calendar-worthy."

### 2. Task Data Shape

**Non-recurring tasks** (`Task`, `app/models.py:291`):
- `scheduled_date` (Date, nullable), `scheduled_time` (Time, nullable), `duration_minutes` (Integer, nullable)
- `title`, `description` (Text — may be encrypted ciphertext)
- `status`: pending / completed / archived

**Recurring tasks** use `TaskInstance` (`app/models.py:368`):
- `instance_date` (Date), `scheduled_datetime` (DateTime, nullable), `status` (pending / completed / skipped)
- Instances materialized for a **60-day rolling window** by `RecurrenceService`

**Recurrence rules** (`Task.recurrence_rule`, JSON):
```json
{"freq": "weekly", "interval": 1, "days_of_week": ["MO", "WE", "FR"]}
{"freq": "monthly", "week_of_month": 2, "days_of_week": ["MO"]}
{"freq": "yearly", "month_of_year": 6, "day_of_month": 15}
```

### 3. Auth Patterns

All API routes use `Depends(require_user)` — session cookie auth. No existing token-based URL auth pattern. Calendar apps need unauthenticated GET requests.

### 4. Encryption Handling

GCal sync **blocks entirely** when encryption is enabled (`gcal_sync.py` enable endpoint raises 400). Titles become `GCAL_SYNC_ENCRYPTED_PLACEHOLDER = "Encrypted task"` when sync was enabled before encryption.

### 5. Python iCal Libraries

**`icalendar`** is the best fit. Classic, most downloaded, simple generation API, ~50KB pure Python, depends only on `python-dateutil` (already a project dependency). None of `icalendar`, `ics`, `ical`, or `vobject` are in current dependencies.

---

## Architecture

### Critical Design Decisions

#### RRULE for recurring tasks (not materialized instances)

The 60-day materialization window is a showstopper for calendar feeds. Apple Calendar lets users scroll years ahead — a weekly task would show 8 weeks of instances then vanish. Users would think the task was cancelled.

**Solution**: Emit recurring tasks as a **single VEVENT with RRULE** instead of one VEVENT per materialized instance. The `recurrence_rule` JSON maps 1:1 to RFC 5545 RRULE:

| JSON | RRULE |
|---|---|
| `freq: "weekly"` + `days_of_week: ["MO","WE","FR"]` | `FREQ=WEEKLY;BYDAY=MO,WE,FR` |
| `freq: "monthly"` + `week_of_month: 2` + `days_of_week: ["MO"]` | `FREQ=MONTHLY;BYDAY=2MO` |
| `freq: "yearly"` + `month_of_year: 6` + `day_of_month: 15` | `FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=15` |
| `interval: 2` | `INTERVAL=2` |
| `recurrence_end` set | `UNTIL=...` |
| `recurrence_end` null | Omit UNTIL (repeats forever per RFC 5545) |

Every combination in `recurrence_service.py` has a direct RRULE equivalent.

**Exception handling** (standard RFC 5545 pattern):
- **Skipped instances** → `EXDATE` entries on the parent VEVENT
- **Completed instances** → Override VEVENTs with same UID + `RECURRENCE-ID` pointing to the original occurrence date, `SUMMARY` with `✓` prefix

**Edge cases**:
- `DTSTART` must be the first *actual* occurrence (computed via dateutil), not `recurrence_start` if they don't align
- Never emit both `BYMONTHDAY` and `BYDAY` in the same monthly rule (already mutually exclusive in `recurrence_service.py:110-119`)
- `day_of_month: 31` silently skips short months — correct per RFC, matches dateutil

#### Server-side caching (not ETag/304)

Apple Calendar macOS — the most likely subscriber — does **unconditional GETs** and ignores `If-None-Match`. ETag/304 is nearly useless as a primary strategy.

**Actual caching strategy**: In-memory cache of generated `.ics` bytes, keyed on `(user_id, data_version)`. Same pattern as `CalendarCache`:
- On request: look up `user.data_version`, compare with cached version
- Match → serve cached bytes (zero queries, zero serialization)
- Mismatch → regenerate, cache, serve

Keep ETag/304 as a free bonus for clients that support it — but don't rely on it.

**Additional feed-level properties**:
- `SEQUENCE` on every VEVENT — derived from task's `updated_at` (unix timestamp). Critical for Google Calendar, which uses `UID + SEQUENCE` to detect event changes.
- `X-PUBLISHED-TTL:PT1H` — Outlook respects this for polling frequency
- `REFRESH-INTERVAL;VALUE=DURATION:PT1H` — RFC 7986 equivalent

#### Block when encryption is enabled (same as GCal sync)

Schedule metadata (times, durations, recurring patterns) is sensitive. A user who enabled E2E encryption made a deliberate privacy choice. Exposing their complete schedule structure through an unauthenticated URL contradicts that choice.

Block feed generation when `encryption_enabled = True`. Consistent with GCal sync's behavior. Easy to relax later. The alternative ("Busy" masking) is a half-measure that gives false security confidence.

#### Token-in-URL (industry standard)

Every major product uses this pattern (Google Calendar, Todoist, Teamup). Calendar apps cannot send Authorization headers. `secrets.token_urlsafe(32)` = 256 bits in URL path.

Security additions:
- `Referrer-Policy: no-referrer` response header
- Rate limit by IP
- Note in deployment docs about access log token redaction

#### Warn about GCal sync overlap (don't prevent it)

If both GCal sync and the calendar feed are enabled, tasks appear twice in Google Calendar (separate calendars). Show a warning in Settings UI. Don't prevent it — user might want GCal sync for Google Calendar and the feed for Apple Calendar.

### RFC 5545 Compliance

Every VEVENT must include:
- `UID`: `task-{id}@whendoist.com` or `instance-{id}@whendoist.com` (stable, unique)
- `DTSTAMP`: Current UTC time of feed generation (required by RFC)
- `DTSTART`: Date or DateTime depending on task type
- `DTEND`: Preferred over `DURATION` for Outlook compatibility
- `SEQUENCE`: Derived from `updated_at` (unix timestamp for freshness)
- `SUMMARY`: Task title (with `✓` prefix if completed)
- `DESCRIPTION`: Task description (if present)
- `LAST-MODIFIED`: Task's `updated_at`
- `STATUS`: Always `CONFIRMED` — never `CANCELLED` (Google Calendar hides cancelled events)

All-day events: `DTSTART;VALUE=DATE:20260315` (bare date, not midnight datetime — avoids timezone-offset wrong-day bugs).

Feed-level properties:
- `PRODID:-//Whendoist//Calendar Feed//EN`
- `VERSION:2.0`
- `CALSCALE:GREGORIAN`
- `X-WR-CALNAME:Whendoist`
- `X-WR-TIMEZONE:{user_timezone}` (Apple Calendar uses this as default)
- `REFRESH-INTERVAL;VALUE=DURATION:PT1H` (RFC 7986)
- `X-PUBLISHED-TTL:PT1H` (legacy Outlook equivalent)

### Feed Content Scope

**Include:**
- Non-recurring tasks with `scheduled_date` (pending and completed)
- Completed tasks with `completed_at` date (Todoist imports lacking `scheduled_date`)
- Recurring tasks as VEVENT+RRULE (with EXDATE/override VEVENTs for exceptions)
- Subtasks that have their own `scheduled_date`
- Completed task retention: **last 14 days** only

**Exclude:**
- Archived tasks
- Unscheduled tasks (no date = no calendar event)
- Skipped recurring instances (EXDATE removes them)
- VALARM reminders (notification spam risk)

---

## Implementation Plan

### Files

```
pyproject.toml                              — add icalendar dep
app/models.py                               — add feed_token column
app/services/calendar_feed.py               — NEW: feed generation service
app/routers/calendar_feed.py                — NEW: feed + management endpoints
app/routers/v1/__init__.py                  — register new router
alembic/versions/..._add_feed_token.py      — NEW: migration
frontend/src/components/settings/...        — feed URL UI
```

No changes to existing service code. No changes to existing write paths.

### 1. Dependency

Add `icalendar>=6.0.0` to `pyproject.toml`, run `uv lock`.

### 2. Migration

Add to `UserPreferences`:
```python
feed_token: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
```

### 3. Service: `app/services/calendar_feed.py`

Core functions:
- `generate_feed(db, user_id, timezone) -> bytes` — main entry point
- `_build_calendar(tasks, recurring_tasks, exceptions, timezone) -> Calendar` — builds icalendar object
- `_recurrence_rule_to_rrule(rule: dict) -> vRecur` — JSON → RRULE conversion
- `_task_to_vevent(task, timezone, dtstamp) -> Event` — non-recurring task → VEVENT
- `_recurring_task_to_vevent(task, skipped_dates, timezone, dtstamp) -> Event` — recurring → VEVENT+RRULE+EXDATE
- `_completed_instance_to_override(instance, task, timezone, dtstamp) -> Event` — completed instance → override VEVENT

Queries (same WHERE clauses as `gcal_sync.py` bulk_sync):
1. Non-recurring tasks: `scheduled_date IS NOT NULL` or `completed_at IS NOT NULL`, status != archived, completed within 14 days
2. Recurring tasks: `is_recurring = True`, status != archived
3. Non-pending instances for recurring tasks: status in (completed, skipped), joined to parent task

### 4. Router: `app/routers/calendar_feed.py`

**Unauthenticated feed endpoint:**
- `GET /calendar-feed/{token}.ics`
- Look up `UserPreferences` by `feed_token` → join to `User`
- 404 if token invalid (not 401 — don't reveal endpoint exists)
- Check `encryption_enabled` → 403 with message if true
- Check in-memory cache: `(user_id, data_version)` → serve cached bytes or regenerate
- Response headers: `Content-Type: text/calendar; charset=utf-8`, `Content-Disposition: inline; filename="whendoist.ics"`, `Referrer-Policy: no-referrer`, `ETag` from `data_version`
- Rate limit by IP

**Authenticated management endpoints** (behind `require_user`):
- `GET /calendar-feed/status` — enabled state + URL
- `POST /calendar-feed/enable` — generates token, returns feed URL (blocked if encryption on)
- `POST /calendar-feed/disable` — clears token
- `POST /calendar-feed/regenerate` — new token, old URL stops working

### 5. In-Memory Feed Cache

Same pattern as `CalendarCache`:
```python
_feed_cache: dict[int, tuple[int, bytes]] = {}  # user_id → (data_version, ics_bytes)
```

Invalidated naturally: if `user.data_version` doesn't match cached version, regenerate. No mutation hooks needed.

### 6. Frontend: Settings UI

- "Calendar Feed" section in Settings
- Enable toggle (blocked with explanation if encryption is on)
- Feed URL with copy-to-clipboard
- "Regenerate URL" button with confirmation dialog
- Warning banner if GCal sync is also enabled: "You already have Google Calendar sync enabled. Using both in Google Calendar will create duplicate events. The calendar feed is for other apps (Apple Calendar, Outlook)."
- Brief instructions: "Paste this URL into Apple Calendar, Google Calendar, or Outlook"
