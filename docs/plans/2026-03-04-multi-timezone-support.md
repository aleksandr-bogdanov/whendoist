---
version: null
pr: null
created: 2026-03-04
---

# Multi-Timezone Support

## Context

The timezone preference (`UserPreferences.timezone`) is stored and used correctly in most
backend routes but **never applied on the frontend**. All time rendering uses browser local
time (`getHours()`/`getMinutes()`). Additionally, analytics and a few other backend paths
use `date.today()` (UTC) instead of `get_user_today(timezone)`. This plan fixes these
foundation issues (Phase 1) and then adds secondary timezone display on the calendar ruler
(Phase 2).

**Target users:** Team members in different timezones; travelers wanting to see home timezone.
**Decisions:** 1 secondary timezone, stacked labels (Option D), display-only, settings page
picker + calendar header toggle, desktop-first but mobile-compatible.

---

## Phase 1: Fix Timezone Foundations (1 PR)

### Step 1.1 — Frontend timezone utility module (new file)

**Create `frontend/src/lib/timezone.ts`**

Central module — all timezone conversion goes through here. Uses `Intl.DateTimeFormat` with
an internal formatter cache (keyed on `tz+options`) to avoid creating formatters in hot loops.

```typescript
// Core functions:
getHoursInTimezone(date: Date, tz: string): number
getMinutesInTimezone(date: Date, tz: string): number
getCurrentTimeInTimezone(tz: string): { hours: number; minutes: number }
toDateStringInTimezone(date: Date, tz: string): string  // YYYY-MM-DD
getTimezoneOffsetHours(tz1: string, tz2: string, date?: Date): number  // for Phase 2
formatTimezoneOffset(tz: string, date?: Date): string  // "UTC-5", "UTC+5:30"
getEffectiveTimezone(preferredTz?: string | null): string  // pref ?? browser fallback
```

Implementation approach: `Intl.DateTimeFormat` with `{ timeZone, hour: "numeric" }` etc.
to extract parts. The formatter cache is a `Map<string, Intl.DateTimeFormat>`.

**Create `frontend/src/hooks/use-timezone.ts`**

```typescript
export function useTimezone(): string {
  const { data: prefs } = useGetPreferencesApiV1PreferencesGet();
  return getEffectiveTimezone(prefs?.timezone);
}
```

Single source of truth for "what timezone should the UI use."

### Step 1.2 — Convert frontend time rendering

Thread `timezone` from `useTimezone()` through the component tree. The pattern is:
`CalendarPanel` calls `useTimezone()`, passes it down as a prop to `DayColumn`, and passes
it to all utility functions.

**`frontend/src/lib/calendar-utils.ts`** — 5 functions need a `tz?: string` parameter:

| Function | Line | Change |
|----------|------|--------|
| `todayString()` | 19 | Accept optional `tz`, use `toDateStringInTimezone(new Date(), tz)` |
| `datetimeToOffset()` | 77 | Use `getHoursInTimezone`/`getMinutesInTimezone` instead of `getHours`/`getMinutes` |
| `eventToTimeRange()` | 228 | Same — extract hours/minutes in user tz |
| `calculateOverlaps()` | 266 | Pass `tz` through to `eventToTimeRange` and instance time extraction (lines 301-303) |
| `calculateExtendedOverlaps()` | 393 | Same — instance time extraction at lines 447-449 |

**Key insight:** `taskToTimeRange()` (line 237) parses `scheduled_time` as a naive `HH:MM`
string. This is already "wall clock in user's timezone" by convention — **no conversion needed**.
Only UTC-stored datetimes (`event.start/end`, `instance.scheduled_datetime`) need conversion.

**`frontend/src/components/calendar/day-column.tsx`:**

| Area | Line | Change |
|------|------|--------|
| Props interface | 60 | Add `timezone?: string` |
| `isToday` check | 93 | `centerDate === todayString(timezone)` instead of `todayString()` |
| Current time indicator | 187-196 | Use `getCurrentTimeInTimezone(timezone)` instead of `now.getHours()`/`getMinutes()` |
| Instance time extraction | 357-358 | Use `getHoursInTimezone`/`getMinutesInTimezone` |
| `calculateExtendedOverlaps` call | ~165 | Pass `timezone` |

**`frontend/src/components/calendar/calendar-panel.tsx`:**

| Area | Line | Change |
|------|------|--------|
| Call `useTimezone()` | top-level | Add hook call |
| `isNotToday` | 196 | `todayString(timezone)` |
| "Today" button | 217 | `setCalendarCenterDate(todayString(timezone))` |
| Scroll-to-current-time | ~290 | Use `getCurrentTimeInTimezone(timezone)` for initial scroll offset |
| Pass `timezone` to DayColumn | ~716 | Add `timezone={timezone}` prop |

**`frontend/src/components/task/scheduled-section.tsx`:**
- Line 24: `todayString()` → `todayString(timezone)` (call `useTimezone()`)

**`frontend/src/stores/ui-store.ts`:**
- Lines 88-94: Default `calendarCenterDate` uses `new Date().getHours() >= 20`. This runs once
  at store init — acceptable to leave as browser-local since it's just a "should we default
  to tomorrow" heuristic.

### Step 1.3 — Fix backend `date.today()` bugs

**`app/services/analytics_service.py`:**
- Add `timezone: str | None = None` parameter to `__init__` (line 39)
- Line 56: `today = date.today()` → `today = get_user_today(self.timezone)`
- Line ~569 (`_get_aging_stats`): same fix for aging cutoff date
- Line ~636 (`get_recent_completions`): same fix for lookback cutoff

**`app/routers/analytics.py`:**
- Lines 132-144: Fetch timezone before creating service:
  ```python
  prefs_service = PreferencesService(db, user.id)
  timezone = await prefs_service.get_timezone()
  end_date = get_user_today(timezone)
  service = AnalyticsService(db, user.id, timezone=timezone)
  ```
- Lines 147-155 (`get_recent_completions`): Same pattern — fetch tz, pass to service

**`app/routers/tasks.py`:**
- Line 741 (`restore_task`): Add timezone fetch + `user_today` calculation before
  `_task_to_response(task)`, matching the pattern on lines 407-409 of the same file

**`app/tasks/recurring.py`:**
- Line 119: Add docstring comment documenting that UTC is intentional (90-day retention
  makes ±1 day negligible; per-user cleanup would require N queries). No logic change.

### Step 1.4 — Invalid timezone validation error

**`app/services/preferences_service.py`** (line 105-106):
- Replace `pass` with `raise ValueError(f"Invalid timezone: {timezone}")`

**`app/routers/preferences.py`:**
- Wrap `service.update_preferences()` call in try/except:
  ```python
  except ValueError as e:
      raise HTTPException(status_code=422, detail=str(e))
  ```

### Step 1.5 — Searchable timezone picker

**`frontend/src/routes/_authenticated/settings.lazy.tsx`** (lines 223-283):

Replace the `Select` + `COMMON_TIMEZONES` array with a `Popover` + search `Input` + scrollable
list. Use `Intl.supportedValuesOf("timeZone")` for the full IANA list (~400 zones). Use `fuse.js`
(already in `package.json`) for fuzzy search. Show UTC offset next to each timezone name:
`"America/New_York (UTC-5)"`. Existing `Popover` component: `components/ui/popover.tsx`.

Extract a reusable `TimezonePicker` component — it will be reused in Phase 2 for the secondary
timezone picker.

---

## Phase 2: Secondary Timezone Display (Separate PR)

### Step 2.1 — Backend: Add `secondary_timezone` field

**`app/models.py`** — Add after `timezone` (line 231):
```python
secondary_timezone: Mapped[str | None] = mapped_column(String(50), nullable=True)
```

**New migration** via `just migrate-new "add secondary_timezone preference"`.

**`app/routers/preferences.py`:**
- Add `secondary_timezone: str | None = Field(None, max_length=50)` to `PreferencesUpdate`
- Add `secondary_timezone: str | None = None` to `PreferencesResponse`
- Pass through in `update_preferences` endpoint

**`app/services/preferences_service.py`:**
- Add `secondary_timezone` parameter to `update_preferences()`
- Validate with same `ZoneInfo` + `ValueError` pattern as primary timezone

### Step 2.2 — Regenerate API types

Run `cd frontend && npx orval`. This adds `secondary_timezone` to generated types.

### Step 2.3 — UI store toggle

**`frontend/src/stores/ui-store.ts`:**
- Add `showSecondaryTimezone: boolean` to state (default `false`, persisted to localStorage)
- Add `setShowSecondaryTimezone(show: boolean)` action

### Step 2.4 — Extend hour labels for secondary timezone

**`frontend/src/lib/calendar-utils.ts`:**

Extend `ExtendedHourLabel` interface:
```typescript
secondaryLabel?: string;  // e.g., "2AM" or "1:30AM" for half-hour offsets
```

Extend `getExtendedHourLabels()` signature:
```typescript
function getExtendedHourLabels(
  hourHeight: number,
  secondaryTz?: string,
  primaryTz?: string,
  referenceDate?: Date,
): ExtendedHourLabel[]
```

When secondary tz params are provided, compute offset via `getTimezoneOffsetHours()` (from
`timezone.ts`) once, then apply to each label's hour. Handle half-hour offsets (India UTC+5:30,
Nepal UTC+5:45) by showing minutes in the label when offset is fractional:
- Integer offset: `formatHourLabel(secondaryHour)` → "2AM"
- Fractional offset: `formatHourLabel(secondaryHour) + ":" + minutes` → "1:30AM"

### Step 2.5 — Render stacked labels in time ruler

**`frontend/src/components/calendar/calendar-panel.tsx`:**

In the time ruler JSX (lines 671-684), modify each hour label `<div>` to render two lines:
- Primary: existing `text-[10px]` label
- Secondary: `text-[8px] text-muted-foreground/50` label (smaller + dimmer)

Only render secondary when:
1. `showSecondaryTimezone` is true (from UI store)
2. `secondaryTz` is configured (from preferences)
3. `calendarHourHeight >= 50` (zoom levels 30, 40 are too compact)

Pass secondary tz params to `getExtendedHourLabels()` in the `useMemo` call (line ~561).

### Step 2.6 — Calendar header toggle

**`frontend/src/components/calendar/calendar-panel.tsx`:**

Add a `Globe` icon button (from lucide-react) in the calendar header action area. Only visible
when `secondary_timezone` is configured. Toggles `showSecondaryTimezone` in UI store.
Show active state via variant change (`ghost` ↔ `default`).

### Step 2.7 — Secondary timezone picker in settings

**`frontend/src/routes/_authenticated/settings.lazy.tsx`:**

Add `SecondaryTimezoneSection` below `TimezoneSection`, reusing the `TimezonePicker` component
from Step 1.5. Include a "Clear" option to remove the secondary timezone. Brief description
text: "Show a second timezone on the calendar time ruler."

---

## Files Changed Summary

### Phase 1 (12 files)
| File | Change |
|------|--------|
| `frontend/src/lib/timezone.ts` | **New** — timezone utility module |
| `frontend/src/hooks/use-timezone.ts` | **New** — `useTimezone()` hook |
| `frontend/src/lib/calendar-utils.ts` | Add `tz` param to 5 functions |
| `frontend/src/components/calendar/calendar-panel.tsx` | Wire timezone through |
| `frontend/src/components/calendar/day-column.tsx` | Add `timezone` prop, fix current-time indicator |
| `frontend/src/components/task/scheduled-section.tsx` | `todayString(tz)` |
| `frontend/src/routes/_authenticated/settings.lazy.tsx` | Searchable timezone picker |
| `app/services/analytics_service.py` | Add timezone param, fix `date.today()` |
| `app/routers/analytics.py` | Fetch timezone, pass to service |
| `app/routers/tasks.py` | Fix `restore_task` missing `user_today` |
| `app/services/preferences_service.py` | ValueError on invalid timezone |
| `app/routers/preferences.py` | Catch ValueError → 422 |

### Phase 2 (8 files)
| File | Change |
|------|--------|
| `app/models.py` | Add `secondary_timezone` column |
| `alembic/versions/...` | **New** — migration |
| `app/routers/preferences.py` | Add field to request/response |
| `app/services/preferences_service.py` | Validate + store secondary tz |
| `frontend/src/lib/calendar-utils.ts` | Extend `getExtendedHourLabels` + `ExtendedHourLabel` |
| `frontend/src/stores/ui-store.ts` | Add `showSecondaryTimezone` toggle |
| `frontend/src/components/calendar/calendar-panel.tsx` | Stacked labels + globe toggle |
| `frontend/src/routes/_authenticated/settings.lazy.tsx` | Secondary timezone picker |

---

## Verification

### Phase 1
1. `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
2. `cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build`
3. Manual: Set timezone to something different from browser tz in settings → verify calendar
   shows current-time indicator at the correct position for the chosen timezone
4. Manual: Check analytics page with non-UTC timezone — dates should match user's "today"

### Phase 2
1. Same backend + frontend checks as Phase 1
2. `just migrate` — verify migration applies cleanly
3. Manual: Set secondary timezone in settings → toggle globe icon → verify stacked labels
   appear at zoom ≥ 50px, hidden at zoom 30-40px
4. Manual: Test with a half-hour offset timezone (e.g., `Asia/Kolkata` UTC+5:30) — secondary
   labels should show minutes
