# Whendoist Competitive Gap Analysis

> Generated 2026-03-02. Compared against: Todoist, TickTick, Things 3, Fantastical, Any.do, Google Tasks, Motion, Reclaim.ai, Sunsama.

---

## CRITICAL GAPS (Table-stakes every competitor has)

### 1. No Reminders or Notifications

Every single competitor has reminders. Whendoist has zero: no push notifications, no email reminders, no alerts. A task without a reminder is a task you forget. Users set `scheduled_time` but never get nudged.

**What competitors do:**
- Todoist: time-based + location-based + "urgent" (bypasses DnD)
- TickTick: multiple per task, subtask-level, constant-repeat, location-based, lock screen pin
- Things 3: instant-push via Fastlane sync
- Any.do: WhatsApp reminders

### 2. No Search

No way to search tasks by keyword. No search bar, no search route, no search API endpoint. With dozens or hundreds of tasks, users can't find anything.

### 3. No Landing Page / Marketing Site

The `/login` page is the entire public presence. There's:
- No feature descriptions or screenshots of the actual app
- No pricing information or social proof
- No SEO-optimizable content pages
- No "how it works" section

A cold visitor must sign in with Google before seeing what the app does.

### 4. No Due Date vs. Scheduled Date Distinction

Whendoist conflates "when I plan to work on it" with "when it's due." Only `scheduled_date` exists. Todoist and Things 3 separate these — fundamental to task planning.

---

## HIGH IMPACT GAPS (Significant competitive disadvantages)

### 5. No Labels/Tags

Domains are the only organizational axis. No cross-cutting tag system like `@phone`, `@email`, `@waiting-for`. Tags are a GTD fundamental.

### 6. No Saved Filters / Smart Lists

No way to save custom views. Todoist has a powerful filter query language. TickTick has smart filters. Energy-level filter is clever but it's the only dynamic view.

### 7. No Integration Ecosystem

No public API, no Zapier/IFTTT/Make, no Slack, no email-to-task, no browser extension. Todoist has 90+ integrations. The app is an island.

### 8. Only One Calendar View (5-Day Carousel)

No week view, no month view, no agenda/list view. TickTick has day/3-day/week/month/year/agenda. Users need month overview for long-range planning.

### 9. No Kanban/Board View

TickTick and Todoist both have board views. Popular for visual thinkers and project workflows.

---

## MEDIUM IMPACT GAPS

### 10. No Voice Input / Brain Dump

Todoist's Ramble (Jan 2026): speak a brain dump and AI parses it into tasks. Smart input is excellent for typed input but voice capture is increasingly expected on mobile.

### 11. No Focus Timer / Pomodoro

TickTick's Pomodoro timer tracks actual time per task and compares estimated vs. actual. Whendoist has `duration_minutes` but no timer for execution.

### 12. No Habit Tracking

TickTick's habit tracker (streaks, check-ins, heatmaps) is a major draw. Recurring tasks partially cover this but dedicated habit tracking is a distinct need.

### 13. No Task Templates

Todoist has 60+ templates. No reusable task structures in Whendoist (e.g., "Weekly Review" with 8 subtasks).

### 14. No File Attachments

Can't attach files or images to tasks. Description field is text-only.

### 15. No Email-to-Task

Can't forward an email to create a task. Critical capture pathway for knowledge workers.

### 16. No Browser Extension

No way to clip a webpage as a task from outside the app.

### 17. No Activity Log / Task History

No per-task change history. Todoist logs all changes with timestamps and platform info.

### 18. No Widgets

No home screen widgets for iOS or Android. Major engagement driver for competitors.

---

## NICE-TO-HAVES

### 19. No Gamification

Todoist's Karma system drives daily engagement. Analytics show streaks but no progression system.

### 20. No Calendar Subscription Export

No `.ics` feed for subscribing to Whendoist tasks from Apple Calendar, Outlook, etc.

### 21. No Eisenhower Matrix View

P1-P4 maps perfectly to quadrants — natural addition.

### 22. No Daily Planning / Shutdown Ritual

Sunsama's guided rituals are a core differentiator. Plan My Day is close but lacks structured review.

### 23. No Timeline/Gantt View

TickTick and Motion both have timeline views for visualizing task durations.

### 24. No Location-Based Reminders

Fantastical, TickTick, Any.do support geofenced reminders.

### 25. No Multi-Timezone Support

TickTick shows multiple timezones in calendar. Useful for remote workers/travelers.

### 26. No Offline-First Guarantee

PWA exists but offline capability depth is unclear.

---

## UNIQUE STRENGTHS (Don't lose these)

| Feature | Competitive Advantage |
|---|---|
| **Energy/Clarity filtering** (Zombie/Normal/Brainstorm) | Truly unique — no competitor has this |
| **E2E encryption + Passkeys** | Extremely rare in task apps |
| **Plan My Day auto-scheduling** | Similar to Motion/Reclaim but free and simpler |
| **Smart Input parser** | On par with Todoist's NLP |
| **Analytics dashboard** | More comprehensive than most competitors |
| **Open source** | Trust + transparency — rare in this space |
| **Thoughts/inbox triage** | Clean capture → organize flow |

---

## Recommended Priority Order

| Priority | Feature | Rationale |
|---|---|---|
| **P0** | Reminders/notifications | Without this, tasks are just a list you'll forget |
| **P0** | Task search | Basic usability |
| **P0** | Landing page | Can't acquire users without explaining the product |
| **P1** | Due date + scheduled date | Fundamental planning distinction |
| **P1** | Labels/tags | Cross-cutting organization |
| **P1** | More calendar views (week/month) | Calendar is a core feature |
| **P1** | Saved filters | Power user retention |
| **P2** | Browser extension | Capture from anywhere |
| **P2** | Focus timer | Natural extension of duration tracking |
| **P2** | Public API + Zapier | Integration ecosystem |
| **P3** | Voice input | Mobile capture |
| **P3** | Kanban view | Visual alternative |
| **P3** | Templates | Reduce setup friction |
| **P3** | Widgets | Engagement outside the app |
