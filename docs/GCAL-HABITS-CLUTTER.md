# Google Calendar Habits Clutter Problem

## Decision (v0.32.5)

| Task Type | Has Time Slot | Syncs to GCal |
|-----------|---------------|---------------|
| One-off | No (anytime) | All-day event |
| One-off | Yes (e.g., 2pm) | Timed event |
| Recurring | No (anytime) | Stays in Whendoist |
| Recurring | Yes (e.g., 7am) | Timed event |

Recurring tasks only appear on Google Calendar when scheduled for a specific time. This keeps daily habits from cluttering your calendar view. Drag a habit to a time slot and it syncs. Leave it in "Anytime" and it stays in Whendoist.

Removed the `gcal_sync_all_day` user preference — the behavior is now hardcoded based on task type.

---

## The Problem

Recurring tasks used as habits (e.g., "Sport machen", "Чтение книги") flood Google Calendar. The month view becomes unreadable because every day shows 5-6 repeating habit entries alongside actual appointments and one-off tasks.

**Root cause:** Each recurring task is materialized into individual `TaskInstance` records (60-day rolling window), and each instance is synced as a **separate Google Calendar event**. A daily habit = 60 individual events. Five daily habits = 300 events.

**Screenshot (Feb 2026):** Every day shows "Sport machen", "Чтение книги", "Переустановить...", "Подвести финансы", "Разобрать дистрибутив" — drowning out real calendar items.

**Core insight:** Habits are not calendar events. A calendar event means "this occupies a time slot." A habit means "I intend to do this sometime today." Treating them identically is the design flaw.

---

## Current Architecture

- `Task` with `is_recurring = True` + `recurrence_rule` (JSON: freq, interval, days_of_week, etc.)
- Background job materializes `TaskInstance` records for next 60 days
- `GCalSyncService` syncs each `TaskInstance` as an individual GCal event
- `GoogleCalendarEventSync` maps each instance to a GCal event ID
- Hash-based change detection skips unchanged events
- No concept of "habit" vs "task" — all tasks are the same type

---

## Options

### A. Per-task GCal sync toggle

Add `sync_to_gcal: bool` on `Task`. User decides per-task whether it syncs.

| Aspect | Detail |
|--------|--------|
| **Effort** | Small — one field, one checkbox, one `if` guard in sync |
| **Clutter reduction** | Full — unsync habits, problem gone |
| **Downside** | Manual decision per task. Default matters: `True` = problem continues for new habits, `False` = users forget to enable for real tasks |
| **Best for** | Immediate relief, quick ship |

### B. Native RRULE recurring events

Instead of 60 individual events, sync recurring tasks as a single GCal event with an RRULE. GCal renders the recurrence natively.

**RRULE conversion from Whendoist's recurrence_rule JSON:**

| Whendoist | RRULE | Example |
|-----------|-------|---------|
| `freq: "daily"` | `FREQ=DAILY` | Every day |
| `freq: "weekly"` + `days_of_week: ["MO","WE","FR"]` | `FREQ=WEEKLY;BYDAY=MO,WE,FR` | MWF |
| `freq: "monthly"` + `day_of_month: 15` | `FREQ=MONTHLY;BYMONTHDAY=15` | 15th monthly |
| `freq: "monthly"` + `week_of_month: 2` + `days_of_week: ["MO"]` | `FREQ=MONTHLY;BYDAY=2MO` | 2nd Monday |
| `interval: N` | `INTERVAL=N` | Every Nth occurrence |
| `recurrence_end` | `UNTIL=YYYYMMDD` | End date |

**Per-instance completion (the hard part):** GCal supports recurrence exceptions. When an instance is completed, fetch the specific occurrence via GCal's instances API, modify it (add `✓` prefix). This creates an exception on that date while keeping other instances unchanged.

**API call comparison:**

| Scenario | Current (individual) | RRULE |
|----------|---------------------|-------|
| Create daily habit | 60 creates | 1 create |
| Bulk sync 5 daily habits | ~300 calls | ~5 calls |
| Complete one instance | 1 update | 1 fetch + 1 update |
| Delete recurring task | 60 deletes | 1 delete |
| Change recurrence pattern | 120 (delete + recreate) | 1 update |

| Aspect | Detail |
|--------|--------|
| **Effort** | Moderate-high — RRULE conversion is easy, exception management for completions is complex |
| **Clutter reduction** | Visual — GCal renders recurring events more cleanly than 60 individual ones |
| **Downside** | Exception edge cases (orphaned exceptions when pattern changes). Migration needed for existing events. Two-phase sync (parent RRULE + completion exceptions) |
| **Best for** | Long-term "proper" architecture, massive API call reduction |

### C. Separate "Habits" calendar

Sync habits to a second GCal calendar ("Whendoist Habits"). Toggle visibility in GCal with one click.

| Aspect | Detail |
|--------|--------|
| **Effort** | Medium — second calendar creation, task type routing |
| **Clutter reduction** | Full when hidden, habits still accessible when toggled on |
| **Downside** | Needs a way to distinguish habits from tasks (new field or heuristic). Two calendars in sync logic |
| **Best for** | Users who sometimes want to see habits, sometimes not |

### D. Short sync window (today + N days)

Only sync recurring instances within a small window (e.g., 3 days) instead of 60.

| Aspect | Detail |
|--------|--------|
| **Effort** | Small — change one query filter |
| **Clutter reduction** | Significant in month view, minimal in day/week view |
| **Downside** | Can't plan ahead. Habits vanish from week/month view |
| **Best for** | Quick partial fix |

### E. Habit tracker in Whendoist (don't sync habits to GCal)

Build a dedicated habit view: daily checklist or streak grid. Habits live in Whendoist, not GCal. Calendar stays for appointments and one-off tasks.

| Aspect | Detail |
|--------|--------|
| **Effort** | High — new frontend component, possibly new data model |
| **Clutter reduction** | Complete — habits never touch GCal |
| **Downside** | Loses GCal reminders/notifications for habits. Significant frontend work |
| **Best for** | Philosophically correct — right tool for the right job |

### F. Sync habits as all-day events

Sync recurring habits as all-day events instead of timed events. All-day events appear in the thin banner at the top of each day in GCal, not in the main time grid.

| Aspect | Detail |
|--------|--------|
| **Effort** | Small — change `build_event_data()` for recurring tasks |
| **Clutter reduction** | Moderate — habits move to banner, but banner can also get crowded with 5-6 items |
| **Downside** | Still 60 events per habit. Loses specific time info |
| **Best for** | Quick visual improvement without architectural change |

### G. Consolidate into daily summary event

Instead of 5 separate habit events per day, create one "Daily Habits" event with all habits listed in the description:

```
Summary: "Daily Habits (5)"
Description:
  - Sport machen (30m)
  - Чтение книги (30m)
  - Переустановить...
  - Подвести финансы
  - Разобрать дистрибутив
```

| Aspect | Detail |
|--------|--------|
| **Effort** | Medium — aggregation logic, different sync model |
| **Clutter reduction** | Massive — 1 event per day instead of 5-6 |
| **Downside** | Loses individual timing. Completion updates require rewriting the aggregate event. Can't set per-habit GCal reminders |
| **Best for** | Clean calendar while keeping habits visible |

### H. Color differentiation + GCal filtering

Assign distinct `colorId` values to habits. Use GCal's color filter to hide them.

| Aspect | Detail |
|--------|--------|
| **Effort** | Small — add colorId to event data |
| **Clutter reduction** | None by default — requires manual filtering every time |
| **Downside** | Band-aid. GCal color filtering is per-session, not sticky |
| **Best for** | Supplement to another option, not standalone |

### I. Sync only next occurrence per recurring task

Instead of 60 instances, sync only the **next upcoming instance** of each habit. On completion, sync the next one. 5 habits = 5 events total (ever).

| Aspect | Detail |
|--------|--------|
| **Effort** | Medium — new sync logic to pick "next" instance, re-sync on completion |
| **Clutter reduction** | Maximum — one event per habit at any time |
| **Downside** | Can't see habit schedule in week/month planning. Only today's (or tomorrow's) habits visible |
| **Best for** | Users who just want a daily nudge, not a full schedule view |

---

## Comparison Matrix

| Option | Effort | Clutter Fix | Keeps Habits on GCal | Preserves Timing | API Calls |
|--------|--------|-------------|----------------------|-------------------|-----------|
| **A. Per-task toggle** | Low | Full (manual) | User's choice | Yes | Same |
| **B. RRULE** | High | Moderate | Yes | Yes | Drastically fewer |
| **C. Separate calendar** | Medium | Full (toggleable) | Yes (toggleable) | Yes | Same |
| **D. Short window** | Low | Partial | Partially | Yes | Fewer |
| **E. Habit tracker** | High | Full | No | N/A | Fewer |
| **F. All-day events** | Low | Moderate | Yes | No | Same |
| **G. Daily summary** | Medium | High | Yes (aggregated) | No | Fewer |
| **H. Color filtering** | Low | None (manual) | Yes | Yes | Same |
| **I. Next-occurrence** | Medium | Maximum | Minimally | Yes | Much fewer |

---

## Suggested Combinations

### Pragmatic path: A + F
Per-task toggle (immediate control) + all-day events for synced recurring tasks (visual relief). Ship fast.

### Clean path: A + I
Per-task toggle + next-occurrence-only for recurring tasks that are synced. Minimal calendar footprint.

### Proper path: A + B
Per-task toggle as the quick win, then RRULE migration for recurring tasks. Best long-term architecture but most work.

### Radical path: E
Build a real habit tracker. Habits leave the calendar entirely. Calendar is for calendar things.

---

## Context

- Pre-1.0, single user (me)
- GCal sync is one-way: Whendoist → Google Calendar
- Recurring tasks use `recurrence_rule` JSON, materialized via `dateutil.rrule`
- 60-day materialization window, hourly background job
- Sync uses hash-based change detection, ~5 QPS throttle
- No existing concept of "habit" vs "task" in the data model
