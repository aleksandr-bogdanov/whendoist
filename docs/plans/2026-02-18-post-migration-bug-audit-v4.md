---
version: v0.49.1
pr:
created: 2026-02-18
---

# Post-Migration Bug Audit v4 — Calendar Interactions, Mobile UX, Feature Gaps

Fourth-pass analysis after the Jinja2 → React SPA migration.
- v1: `2026-02-18-fix-post-rework-frontend-bugs.md` (PR #337) — 2 critical, 2 fixed
- v2: `2026-02-18-post-migration-bug-audit-v2.md` (PR #342) — 16 issues, 12 fixed
- v3: `2026-02-18-post-migration-bug-audit-v3.md` (PR #343) — **all 19 issues fixed** in v0.49.0

This pass focuses on **interaction gaps** that remain after v3's fixes. Encryption and performance are excluded per request.

### v3 status check

All 19 v3 issues verified as fixed:
- #1 Instances in calendar ✅ (calendar-panel.tsx:63, day-column.tsx:156)
- #2 Skip instance wired ✅ (task-action-sheet.tsx:177-200)
- #3 Thoughts CRUD ✅ (thoughts.tsx full edit/delete/promote)
- #4 Deleted section ✅ (deleted-section.tsx, task-panel.tsx:155)
- #5 Export/download ✅ (settings.tsx:979, 1073)
- #6 Swipe cascade ✅ (domain-group.tsx:71-74)
- #7 Mobile undo ✅ (task-action-sheet.tsx:135-154)
- #8 Plan mode parallel ✅ (plan-mode.tsx:56 Promise.allSettled)
- #9 Sort/filter persist ✅ (ui-store.ts:100-107)
- #10 Domain expand persist ✅ (ui-store.ts:108-109, 117-122)
- #11 Time indicator updates ✅ (day-column.tsx:54-59)
- #12 Swipe-left selects task ✅ (domain-group.tsx:119)
- #13 Wizard domain delete ✅ (onboarding-wizard.tsx:382-391)
- #14 Swipe vertical fixed ✅ (task-swipe-row.tsx:53 uses movement)
- #15 Passkey uses configured axios ✅ (passkey.ts:13 imports from api-client)
- #16 showCompleted true ✅ (ui-store.ts:47)
- #17 Analytics has both widgets ✅ (analytics.tsx:112 RecentCompletions, 117 AgingStats)
- #18 Date separators ✅ (thoughts.tsx:41-57 groupByDate)
- #19 Error boundary ✅ (_authenticated.tsx:67-126 AppErrorBoundary)

---

## CRITICAL — Backend features with zero frontend coverage

### 1. Pending past instances never surfaced

**Impact:** If a user is away for 3 days, all recurring task instances for those days pile up as "pending". The app never tells the user about them — they're silently invisible.

**Backend endpoints (unused):**
- `GET /api/v1/instances/pending-past-count` — returns count of overdue instances
- `POST /api/v1/instances/batch-past` — mark all overdue instances as completed or skipped

**Old site:** Showed a banner like "You have 12 pending instances from past days" with Complete All / Skip All buttons.

**Fix:** On dashboard mount, call `pending-past-count`. If > 0, show a dismissable banner above the task list: "You have {N} overdue recurring tasks. [Complete All] [Skip All] [Dismiss]". Calling batch-past on button click.

**Files:** `frontend/src/components/dashboard/task-panel.tsx`, new component `pending-past-banner.tsx`

### 2. Calendar instance cards are not interactive

**File:** `frontend/src/components/calendar/day-column.tsx:183-223`

Instance cards render as static `<div>` elements — no `onClick`, no context menu, no complete/skip buttons. Users can *see* recurring instances on the calendar but have no way to interact with them.

Compare with `ScheduledTaskCard` (line 27) which is a `<button>` with `onClick`.

**Old site:** Calendar instance cards had quick-action buttons for complete and skip, plus click-to-expand.

**Fix:** Make InstanceCard a `<button>` with onClick that opens either:
- (A) A mini action popover with Complete / Skip buttons, or
- (B) The task editor pre-populated with that instance's task

Also add the skip/complete mutations to the component.

**Files:** `day-column.tsx` (InstanceCard component)

### 3. Calendar cards cannot be dragged to reschedule

**File:** `frontend/src/components/calendar/scheduled-task-card.tsx`, `day-column.tsx`

No component in `components/calendar/` uses `useDraggable` from dnd-kit. Tasks on the calendar (both scheduled tasks and instances) cannot be dragged to a different time slot or day.

Current flow: drag task FROM task list → calendar (works). But:
- Cannot drag scheduled task FROM calendar → different time (reschedule)
- Cannot drag scheduled task FROM calendar → task list (unschedule from calendar side)

**Old site:** Full drag support within calendar — drag a scheduled card to a new time slot.

**Fix:** Wrap `ScheduledTaskCard` and `InstanceCard` in `useDraggable`. Update `task-dnd-context.tsx` to handle calendar→calendar drops (change time) and calendar→task-list drops (unschedule).

**Files:** `scheduled-task-card.tsx`, `day-column.tsx`, `task-dnd-context.tsx`

---

## HIGH — UX bugs that affect daily use

### 4. Action sheet complete doesn't cascade to subtasks

**File:** `frontend/src/components/mobile/task-action-sheet.tsx:77-91`

Three code paths for completing a task:
1. **Checkbox click** (`task-item.tsx`) — cascades subtasks ✅
2. **Swipe-right** (`domain-group.tsx:71-74`) — cascades subtasks ✅
3. **Action sheet** (`task-action-sheet.tsx:77-91`) — does NOT cascade ❌

The action sheet optimistic update only toggles the parent:
```tsx
return old.map((t) =>
  t.id === task.id
    ? { ...t, status: ..., completed_at: ... }
    : t,
);
```

Missing the `subtasks: t.subtasks?.map(...)` cascade that the other two paths have.

**Fix:** Add subtask cascade logic matching `domain-group.tsx:71-74`.

### 5. Action sheet "Schedule" doesn't select the task

**File:** `frontend/src/components/task/domain-group.tsx:130-134`

```tsx
const handleScheduleFromSheet = useCallback(
  (_task: AppRoutersTasksTaskResponse) => {
    setMobileTab("calendar");  // switches tab but doesn't select task
  },
  [setMobileTab],
);
```

Compare with swipe-left handler (line 116-123) which calls `selectTask(task.id)` before switching tabs. The action sheet's Schedule button switches to the calendar but doesn't even highlight which task the user wanted to schedule.

**Fix:** Add `selectTask(task.id)` matching the swipe handler:
```tsx
const handleScheduleFromSheet = useCallback(
  (task: AppRoutersTasksTaskResponse) => {
    selectTask(task.id);
    setMobileTab("calendar");
  },
  [selectTask, setMobileTab],
);
```

### 6. Sidebar domains are display-only

**File:** `frontend/src/components/layout/sidebar.tsx:59-72`

Domains in the desktop sidebar render as plain `<div>` elements with no click handler. Clicking a domain does nothing.

**Old site:** Clicking a domain in the sidebar filtered the task list to show only that domain's tasks.

**Fix:** Either:
- (A) Make domains clickable to filter the task list (add `selectedDomainId` to UIStore, filter in task-panel.tsx)
- (B) Make domains clickable to scroll to that domain group in the task list (simpler, lower effort)

**Files:** `sidebar.tsx`, `ui-store.ts`, `task-panel.tsx`

### 7. No Google Calendar disconnect

**File:** `frontend/src/routes/_authenticated/settings.tsx:275-334`

The Google Calendar section has "Connect" (when disconnected) and "Reconnect" (when connected) buttons, but no way to fully disconnect/unlink the Google account. A user who connected accidentally or wants to revoke access has no UI path.

**Fix:** Add a "Disconnect" button that clears the OAuth tokens server-side. Check if an API endpoint exists for this; if not, add one.

---

## MEDIUM — Correctness and completeness

### 8. Domain reordering not available

The old site allowed reordering domains via drag-and-drop or position controls. The React site:
- Sorts domains by `position` in sidebar (`sidebar.tsx:57`)
- Has domain management in settings (create, edit name/icon/color, delete)
- But provides no way to change domain order

**Fix:** Add drag-and-drop reordering in the Settings > Domains section, or up/down arrows, calling `PUT /api/v1/domains/{id}` with updated `position`.

**Files:** `settings.tsx` (DomainsSection)

### 9. Quick-add silently ignores empty input

**File:** `frontend/src/components/task/task-quick-add.tsx`

The quick-add dialog returns silently on empty title (`if (!title.trim()) return`). The dialog stays open but nothing happens — no error message, no visual feedback. User might think there's a bug.

**Fix:** Either show a validation message ("Title is required") or disable the submit button when empty (preferred — it's already done for the send button on the Thoughts page).

### 10. Calendar events not clickable

**File:** `frontend/src/components/calendar/calendar-event.tsx`

Google Calendar events render with `cursor-default` and no click handler. Users expect clicking a Google Calendar event would open it (either in a details popover or link to Google Calendar).

**Fix:** Add `onClick` that opens the event URL in a new tab (if available from the API), or show a small details popover with the event's title, time, and location.

### 11. No "full sync" trigger in UI

**Backend:** `POST /api/v1/gcal-sync/full-sync` forces a re-sync of all tasks to Google Calendar. The orval hook exists (`useFullSyncApiV1GcalSyncFullSyncPost`) but is never used.

The GCal Sync section in settings shows sync status and toggle, but if something goes wrong (sync_error visible), the user has no way to trigger a manual resync.

**Fix:** Add a "Re-sync" button in the GCal Sync settings card, visible when sync is enabled. Calls `full-sync` endpoint.

**Files:** `settings.tsx` (GCalSyncSection)

---

## LOW — Polish

### 12. Scheduled task cards have no quick actions on calendar

`scheduled-task-card.tsx` only has `onClick` → open editor. No unschedule or quick-complete. The old site had skip/unschedule icons on calendar cards.

**Fix:** Add a small action menu (right-click or icon button) with Unschedule / Complete options.

### 13. Mobile quick-add button missing from bottom nav

**Old site:** Mobile bottom nav had a center "+" button for quick task creation. The React mobile nav has 4 equal navigation items (Dashboard, Thoughts, Analytics, Settings) but no quick-add.

**File:** `frontend/src/components/layout/mobile-nav.tsx`

**Fix:** Add a center "+" FAB or add quick-add to the nav bar.

### 14. Plan mode doesn't explain energy filter

**File:** `frontend/src/components/calendar/plan-mode.tsx:38-44`

Plan mode silently filters tasks by energy level. If a user has energy=1 (low), only autopilot tasks appear. The dialog says "Auto-schedule {N} unscheduled tasks" but doesn't explain that tasks were filtered by energy level or how to include more tasks.

**Fix:** Add a note: "Showing tasks matching your current energy level (Level {N})" with a link to change it.

---

## Summary

| # | Severity | Issue | Category |
|---|----------|-------|----------|
| 1 | CRITICAL | Pending past instances never surfaced | Feature gap |
| 2 | CRITICAL | Calendar instance cards not interactive | Feature gap |
| 3 | CRITICAL | Calendar cards can't be dragged to reschedule | Feature gap |
| 4 | HIGH | Action sheet complete doesn't cascade subtasks | Bug |
| 5 | HIGH | Action sheet Schedule doesn't select task | Bug |
| 6 | HIGH | Sidebar domains display-only (no click action) | Feature gap |
| 7 | HIGH | No Google Calendar disconnect button | Feature gap |
| 8 | MEDIUM | Domain reordering not available | Feature gap |
| 9 | MEDIUM | Quick-add silently ignores empty input | UX |
| 10 | MEDIUM | Calendar events not clickable | UX |
| 11 | MEDIUM | No manual GCal full-sync trigger | Feature gap |
| 12 | LOW | Scheduled cards have no quick actions | UX |
| 13 | LOW | Mobile nav missing quick-add button | UX |
| 14 | LOW | Plan mode doesn't explain energy filter | UX |

## Recommended Fix Order

**Phase 1 — Critical calendar interactions (highest UX impact):**
1. Pending past instances banner (#1) — quick win, high visibility
2. Interactive instance cards (#2) — complete/skip from calendar
3. Action sheet subtask cascade (#4) — one-line fix
4. Action sheet schedule selects task (#5) — one-line fix

**Phase 2 — Calendar drag and sidebar:**
5. Calendar card drag-to-reschedule (#3) — requires dnd-kit work
6. Sidebar domain click-to-filter (#6) — moderate effort
7. GCal disconnect (#7) — needs backend check

**Phase 3 — Polish:**
8. Quick-add validation (#9)
9. Calendar event click (#10)
10. GCal full-sync button (#11)
11. Remaining items
