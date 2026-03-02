# Calendar Feed (iCal Subscription)

Whendoist can generate an `.ics` subscription URL that any calendar app can poll for live task updates. This is the recommended way to see your Whendoist tasks in Apple Calendar, Outlook, Fantastical, or any iCal-compatible app.

For Google Calendar users, [GCal Sync](GCAL-SYNC.md) provides a better experience (real-time push vs periodic polling).

---

## How It Works

1. **Enable** the feed in Settings → Calendar Feed
2. **Copy** the generated URL
3. **Subscribe** in your calendar app (e.g., Apple Calendar → File → New Calendar Subscription)
4. Your tasks appear as calendar events and update automatically

The feed URL contains a cryptographically random 256-bit token — no login is needed for your calendar app to fetch it. Treat it like a password.

---

## What's Included

| Included | Excluded |
|----------|----------|
| Scheduled tasks (with date) | Archived tasks |
| Completed tasks (last 14 days, with ✓ prefix) | Unscheduled tasks (no date = no event) |
| Recurring tasks (as RRULE, repeats indefinitely) | VALARM reminders (avoids notification spam) |
| Subtasks with their own scheduled date | |
| Completed Todoist imports (via `completed_at` fallback) | |

---

## Recurring Tasks

Recurring tasks are emitted as a **single VEVENT with an RRULE** — not one event per materialized instance. This means your calendar app computes future occurrences itself, with no 60-day horizon limit. A weekly task will show up every week for as far as you scroll.

Exception handling follows the RFC 5545 standard:
- **Skipped instances** → `EXDATE` entries (removed from the series)
- **Completed instances** → override VEVENTs with the same UID + `RECURRENCE-ID`, showing a ✓ prefix

---

## All-Day vs Timed Events

| Task has | Calendar event type |
|----------|-------------------|
| `scheduled_date` only | All-day event (`VALUE=DATE`) |
| `scheduled_date` + `scheduled_time` | Timed event with timezone |
| `scheduled_time` + `duration_minutes` | Timed event with correct end time |
| `scheduled_time` without duration | Timed event, 30-minute default duration |

All-day events use bare dates (not midnight datetimes) to avoid timezone-offset wrong-day bugs.

---

## Caching

The feed is cached in-memory, keyed on `(user_id, data_version)`. When your data hasn't changed, the server returns cached bytes with zero database queries. When you make any change in Whendoist, `data_version` bumps and the next request regenerates the feed.

The response includes an `ETag` header for clients that support conditional requests, though most calendar apps (notably Apple Calendar) ignore it and do unconditional GETs.

---

## Security

- **Token authentication**: The feed URL contains `secrets.token_urlsafe(32)` (256 bits of entropy). No cookies or sessions needed.
- **Referrer-Policy: no-referrer**: Prevents the token from leaking via HTTP Referer headers
- **IP rate limiting**: 30 requests/minute per IP
- **Encryption block**: The feed is disabled when E2E encryption is enabled — exposing your complete schedule structure through an unauthenticated URL contradicts the privacy choice of enabling encryption
- **Regenerate**: If a URL is compromised, regenerate it in Settings. The old URL stops working immediately.

---

## Refresh Frequency

How often your calendar app polls the feed:

| App | Typical refresh interval |
|-----|------------------------|
| Apple Calendar (macOS) | ~1 hour |
| Apple Calendar (iOS) | ~4 hours (or pull-to-refresh) |
| Google Calendar | 12–24 hours |
| Outlook | ~3 hours |
| Fantastical | ~15 minutes |

The feed includes `REFRESH-INTERVAL:PT1H` (RFC 7986) and `X-PUBLISHED-TTL:PT1H` (legacy Outlook), requesting a 1-hour refresh. Not all clients honor this.

---

## Technical Details

### Files

| File | Purpose |
|------|---------|
| `app/services/calendar_feed.py` | Feed generation — queries, RRULE conversion, VEVENT building |
| `app/routers/calendar_feed.py` | Endpoints + in-memory cache |
| `app/models.py` (`UserPreferences.feed_token`) | Token storage |

### Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/v1/calendar-feed/{token}.ics` | Token in URL | Serve the feed (unauthenticated) |
| `GET /api/v1/calendar-feed/status` | Session | Check if feed is enabled, get URL |
| `POST /api/v1/calendar-feed/enable` | Session | Generate token, return feed URL |
| `POST /api/v1/calendar-feed/disable` | Session | Clear token |
| `POST /api/v1/calendar-feed/regenerate` | Session | New token, old URL stops working |

### RFC 5545 Compliance

Every VEVENT includes: `UID`, `DTSTAMP`, `DTSTART`, `DTEND`, `SEQUENCE`, `SUMMARY`, `LAST-MODIFIED`, `STATUS=CONFIRMED`.

Feed-level properties: `PRODID`, `VERSION`, `CALSCALE`, `X-WR-CALNAME`, `X-WR-TIMEZONE`, `REFRESH-INTERVAL`, `X-PUBLISHED-TTL`.

`STATUS` is always `CONFIRMED` — never `CANCELLED`, because Google Calendar hides cancelled events entirely.

`SEQUENCE` is derived from `updated_at` (unix timestamp) to ensure Google Calendar detects changes.
