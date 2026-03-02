---
version: null
pr: null
created: 2026-03-02
---

# Multi-Timezone Support Investigation

Research-only investigation into what would be needed to add secondary timezone
labels to Whendoist's calendar view.

---

## Findings

### 1. Current Timezone Architecture

**Storage:** `UserPreferences.timezone` (`app/models.py:231`) stores an IANA timezone
string (e.g., `"America/New_York"`), nullable, falls back to `"UTC"` via `DEFAULT_TIMEZONE`
in `app/constants.py:165`.

**Backend usage — consistent where it matters:**

| Area | Uses user timezone? | Location |
|------|-------------------|----------|
| Recurring instance materialization | Yes | `recurrence_service.py:46-60` |
| "Today" calculation | Yes | `constants.py:179-198` via `get_user_today()` |
| Task completion checks | Yes (with fallback) | `routers/tasks.py:386-388` |
| Instance batch operations | Yes | `routers/instances.py:301-334` |
| Background materialization | Yes | `tasks/recurring.py:72-73` |
| Google Calendar sync | Yes | `gcal.py:530-531` sends IANA tz to Google API |
| **Analytics** | **No — uses `date.today()`** | `analytics_service.py:55,632`, `routers/analytics.py:139` |
| **Instance cleanup** | **No — uses `date.today()`** | `tasks/recurring.py:116` |

**Frontend usage — timezone preference is collected but not applied:**
- Settings page (`settings.lazy.tsx:190-257`) lets users pick from 16 common timezones
- Falls back to `Intl.DateTimeFormat().resolvedOptions().timeZone` (browser tz)
- **No frontend code ever reads the preference for display purposes**
- All times rendered via browser-local `new Date().getHours()/.getMinutes()`
- No timezone conversion library is imported (date-fns is in `package.json` but unused)

### 2. Time Storage Format

**Tasks** (`app/models.py:323-324`):
- `scheduled_date: date | None` — naive date, no timezone
- `scheduled_time: time | None` — naive time, no timezone
- These are "wall clock" values in the user's local timezone by convention

**TaskInstances** (`app/models.py:384`):
- `scheduled_datetime: DateTime(timezone=True)` — UTC-aware datetime
- Converted from user-local via `RecurrenceService._to_utc_datetime()` (line 46-60)
- `instance_date: date` — naive date (user's local date)

**Google Calendar events** (`app/services/gcal.py:50-62`):
- Stored as UTC datetimes in the `GoogleEvent` dataclass
- Fetched from Google API with timezone info, converted to UTC during parsing (line 350-351)
- Sent back to Google with user's IANA timezone (line 530-531)

**Frontend interpretation** (`calendar-utils.ts:228-235`):
- ISO strings parsed with `new Date(event.start)` → JavaScript auto-converts to browser local
- Task times treated as local already (naive date + time from the API)

**Key insight:** The system implicitly assumes `browser timezone == user preference timezone`.
If they differ (e.g., user is traveling), task times will display incorrectly. This is a
pre-existing bug unrelated to multi-timezone, but relevant context.

### 3. Calendar Component Structure

**Hierarchy:**
```
CalendarPanel (calendar-panel.tsx)
├── AnytimeSection (inline, lines 726-786)
├── Time Ruler (inline, lines 631-644) — 48px wide
│   └── Hour labels: absolute-positioned, right-aligned, 10px text
└── Carousel (5 panels, lines 648-686)
    └── DayColumn × 5 (day-column.tsx)
        ├── Hour grid lines + 30-min subdivisions
        ├── ScheduledTaskCard components
        ├── CalendarEventCard components
        └── InstanceCard components (inline)
```

**Time ruler details** (calendar-panel.tsx:631-644):
- Width: `w-12` = 48px, `flex-shrink-0`
- Labels: `text-[10px]`, `text-right`, `pr-1.5` (6px right padding)
- Labels centered on hour line via `-translate-y-1/2`
- Extended timeline: 31 hours (prev day 22:00 → next day 05:00)
- Hour format: `formatHourLabel()` → "9PM", "12AM" (compact 12-hour)

**Hour label generation** (`calendar-utils.ts:177-214`):
- `getExtendedHourLabels(hourHeight)` produces 31 labels with pixel offsets
- Each label: `{ hour, section, offset, label, isAdjacentDay }`
- Adjacent-day labels styled differently (70% opacity, italic)

**No responsive differences** for the time ruler — same 48px on all screen sizes.

### 4. Google Calendar Events

- Events fetched via `GET /api/v1/events` with date range (default: today ± 2 days)
- Backend returns ISO 8601 datetime strings with timezone info
- Frontend parses with `new Date()`, extracts local hours/minutes for grid positioning
- All-day events shown in a separate section, not on the time grid
- Events and tasks share the same positioning/overlap system (max 3 columns)
- Sync is **one-way only** (Whendoist → Google), so timezone metadata flows outward

### 5. DST Edge Cases

When displaying two timezones simultaneously, the offset between them is **not always
constant**:

- **US DST** transitions: 2nd Sunday of March, 1st Sunday of November
- **EU DST** transitions: Last Sunday of March, Last Sunday of October
- **Gap period (2026):** March 8–29, US has sprung forward but EU hasn't yet
  - `America/New_York` is UTC-4, `Europe/London` is UTC+0 → 4-hour difference
  - After March 29: `America/New_York` is UTC-4, `Europe/London` is UTC+1 → 5-hour difference
- **Some timezones never observe DST:** `Asia/Tokyo`, `Asia/Kolkata`, etc.

**Impact on time grid:** A secondary timezone with a different DST transition date would
need its labels to shift mid-grid on transition days. For example, on March 8 (US spring
forward), 2:00 AM doesn't exist in US Eastern — the grid would need to show 1:59 AM → 3:00 AM
for the secondary timezone while the primary continues normally.

For most use cases (showing a colleague's timezone), the offset is constant for any given
day. The edge case only matters on the ~4 days/year when one timezone transitions and the
other doesn't. A reasonable v1 could compute the offset once per day and accept the ~1 hour
inaccuracy on those transition days.

### 6. Available UI Space

**Current time ruler: 48px.** Hour labels like "9PM" occupy roughly 25-30px of that.

**Options for secondary labels:**

| Approach | Space needed | Layout impact |
|----------|-------------|---------------|
| **A. Widen ruler to ~80px**, show both timezones side-by-side | +32px | Reduces calendar width slightly |
| **B. Add a second ruler column** on the right side of the grid | +48px | Moderate — requires DayColumn restructuring |
| **C. Tooltip/hover on existing labels** | 0px | No layout change, but low discoverability |
| **D. Stacked labels** (primary above, secondary below in smaller text) | 0px extra width, but tighter vertically | Needs sufficient `hourHeight` (zoom level) |

On mobile (narrow screens), any extra width is costly. Approach D (stacked) or C (hover)
would be most mobile-friendly. Approach A is simplest for desktop.

### 7. Pre-existing Timezone Issues

These should be fixed before or alongside multi-timezone work:

1. **Analytics uses server time** — `analytics_service.py:55` and `routers/analytics.py:139`
   use `date.today()` instead of `get_user_today(timezone)`. Analytics date ranges can be
   off by ±1 day for users far from server timezone.

2. **Instance cleanup uses server time** — `tasks/recurring.py:116` uses `date.today()`.
   Low impact (90-day retention), but inconsistent.

3. **Task completion fallback** — `routers/tasks.py:319` falls back to `date.today()` if
   user_today isn't provided. Should use `get_user_today()`.

4. **Frontend ignores timezone preference** — All display uses browser local time. If user
   sets timezone to "Asia/Tokyo" but their browser is in "America/New_York", all times
   display in New York time. The preference only affects server-side "today" calculations.

5. **Invalid timezone silently ignored** — `preferences_service.py:105-106` discards invalid
   timezone strings without error feedback.

6. **Limited timezone picker** — Only 16 timezones available in settings UI. Users in
   unlisted timezones (e.g., `America/Phoenix`, `Asia/Kathmandu`) can't select their zone.

---

## Options

### Option A: Dual Time Ruler (Widened)

Widen the time ruler from 48px to ~80-90px. Show primary timezone labels right-aligned (as
today) and secondary timezone labels left-aligned or in a distinct column.

**Pros:** Simple layout change, always visible, no interaction needed.
**Cons:** Steals horizontal space, harder on mobile, two columns of tiny text.

**Effort:** Small-medium. Modify `calendar-panel.tsx` time ruler section, extend
`getExtendedHourLabels()` to compute secondary offsets, add a timezone selector to
calendar header.

### Option B: Secondary Ruler on Right Edge

Add a thin timezone column on the right side of each DayColumn, showing the secondary
timezone's hour labels.

**Pros:** Doesn't steal space from the primary ruler, visually distinct.
**Cons:** Requires DayColumn layout changes, might feel disconnected from the primary ruler,
each panel shows its own ruler (redundant across 5 panels).

**Effort:** Medium. Changes to `day-column.tsx` layout, new hour label rendering logic.

### Option C: Hover/Long-press on Hour Labels

Show secondary timezone in a tooltip when hovering (desktop) or long-pressing (mobile) on
any hour label. No permanent UI change.

**Pros:** Zero layout impact, works on all screen sizes.
**Cons:** Not discoverable, requires interaction for every check, can't scan at a glance.

**Effort:** Small. Add tooltip component to hour labels, compute offset on demand.

### Option D: Stacked Labels (Primary + Secondary)

Keep the 48px ruler but stack two lines per hour: primary label on top (current size),
secondary label below (smaller/dimmer text).

**Pros:** No extra width, both visible at a glance, mobile-friendly.
**Cons:** Requires sufficient hourHeight (minimum zoom level), can look cramped, may need
to skip labels at low zoom. Only practical when hourHeight >= ~40px.

**Effort:** Small-medium. Modify hour label rendering, add secondary offset computation.

### Option E: Don't Build It (Fix Existing Issues First)

The timezone preference is already underutilized. Before adding multi-timezone:
1. Fix the 6 pre-existing issues listed above
2. Make the frontend actually respect the user's timezone preference for all display
3. Add a comprehensive timezone picker (all IANA zones with search)
4. Then consider multi-timezone as a follow-up

**Pros:** Fixes real bugs, establishes correct foundations, lower risk.
**Cons:** Doesn't deliver the multi-timezone feature, but delivers correctness.

---

## Open Questions

1. **Who is the target user?** Remote workers checking a colleague's timezone? Travelers
   who want their home timezone? This affects whether it should be a persistent secondary
   timezone or a quick-reference tool.

2. **How many secondary timezones?** Google Calendar supports showing up to 2 additional
   timezones. Supporting just 1 secondary is significantly simpler than N.

3. **Where should the timezone selector live?** Calendar header? Settings page? Both?
   Google Calendar puts it in Settings with a toggle to show/hide on the calendar.

4. **Should the secondary timezone affect task scheduling?** Or is it purely display-only?
   E.g., when dragging a task to 3 PM, should we show "3 PM EST / 9 PM CET" in the
   drag tooltip?

5. **Browser tz vs preference tz discrepancy:** If we add multi-timezone display, should
   we also fix the root issue where the frontend ignores the user's timezone preference?
   This is arguably more important than secondary timezones.

6. **Mobile priority:** Is multi-timezone valuable on mobile where screen width is tight?
   If desktop-only is acceptable, Option A becomes viable.

---

## Recommendation

**Phase 1 — Fix foundations (prerequisite, ~1 PR):**
- Fix `date.today()` calls in analytics and instance cleanup to use `get_user_today()`
- Make the frontend respect the user's timezone preference (not just browser timezone)
- Add a searchable timezone picker with all IANA timezones
- Return proper error when invalid timezone is set

This is higher priority than multi-timezone because the current system has real correctness
issues. A user in Tokyo with their browser set to UTC will see all their tasks displayed at
the wrong time.

**Phase 2 — Secondary timezone display (follow-up):**
- **Recommended approach: Option D (stacked labels)** for initial implementation
  - Zero additional width, works on mobile and desktop
  - Degrade gracefully: hide secondary labels when zoom level is too low
  - Store `secondary_timezone` in UserPreferences
  - Add toggle in calendar header to show/hide
- Compute offset once per day (accept ±1hr on DST transition days for v1)
- Show secondary timezone in drag-to-schedule tooltip

**Phase 2 effort estimate scope:** ~3-4 files changed:
- `app/models.py` — add `secondary_timezone` to UserPreferences
- `frontend/src/lib/calendar-utils.ts` — extend `getExtendedHourLabels()` with secondary tz
- `frontend/src/components/calendar/calendar-panel.tsx` — render dual labels, add header toggle
- `frontend/src/routes/_authenticated/settings.lazy.tsx` — secondary timezone picker

No backend API changes needed beyond the preferences field — all conversion is frontend-side
using `Intl.DateTimeFormat` with explicit `timeZone` option.
