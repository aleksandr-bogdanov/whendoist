---
version: v0.49.0
pr: 343
created: 2026-02-18
---

# Post-Migration Bug Audit v3 — Feature Gaps & UX Issues

Third-pass analysis after the Jinja2 → React SPA migration.
- v1: `2026-02-18-fix-post-rework-frontend-bugs.md` (PR #337) — route collision + settings crash
- v2: `2026-02-18-post-migration-bug-audit-v2.md` (PR #342) — 16 issues, 12 fixed

This pass focuses on **feature completeness** compared to the old Jinja2 site, and **UX bugs**. Encryption and performance issues are excluded per request.

---

## CRITICAL — Features that existed before migration and are now broken or missing

### 1. Recurring task instances completely absent from calendar

**Impact:** Recurring tasks are invisible in the calendar view. A daily 9am standup won't appear.

**Root cause:** The calendar panel (`calendar-panel.tsx:64-67`) only shows tasks that have `scheduled_date` AND `scheduled_time` set. But recurring task instances are managed via a separate `TaskInstance` model and API (`/api/v1/instances`). The frontend never calls ANY instance endpoint — all 9 instance endpoints are unused.

The old site's drag-drop.js fetched instances for the visible date range and rendered them alongside calendar events. The React frontend only shows manually scheduled non-recurring tasks.

**What's missing:**
- `GET /api/v1/instances?start_date=X&end_date=Y` to fetch instances for the calendar range
- Instance cards rendered in `DayColumn` alongside events and scheduled tasks
- Instance completion (toggle, skip) from the calendar view
- Batch handling of past-due instances (`GET /instances/pending-past-count`, `POST /instances/batch-past`)

**Fix:** CalendarPanel (or DayColumn) needs to call `useListInstancesApiV1InstancesGet()` for the visible date range and render instance cards. Each card needs complete/skip actions.

### 2. "Skip Instance" button is a no-op

**File:** `frontend/src/components/mobile/task-action-sheet.tsx:138-143`

```tsx
{task.is_recurring && (
  <ActionButton
    icon={<SkipForward className="h-5 w-5" />}
    label="Skip instance"
    onClick={close}   // ← just closes the sheet, does nothing
  />
)}
```

The backend has `POST /api/v1/instances/{instance_id}/skip` but it's never called. The button literally does nothing but dismiss the sheet. Users see "Skip instance" and click it expecting the instance to be skipped.

**Fix:** Wire up the skip action. This requires knowing the instance ID for the current occurrence, which means the frontend needs to resolve which instance corresponds to this task + today's date. Either:
- (A) Pass the instance ID through from the instances query
- (B) Add a convenience endpoint like `POST /tasks/{task_id}/skip-today`

### 3. Thoughts page: no delete, no edit, no promote-to-task

**File:** `frontend/src/routes/_authenticated/thoughts.tsx`

The old thoughts page had three key interactions per thought:
- **Delete** a thought (cleanup)
- **Edit** a thought (fix typos)
- **Promote to task** (assign a domain to make it a real task)

The React page only renders read-only bubbles. The `ThoughtBubble` component (lines 134-152) is purely presentational — no click handlers, no context menu, no swipe actions. Users can create thoughts but cannot interact with them after creation.

**Fix:** Add at minimum:
- Click/tap on a thought → open the task editor sheet with that thought pre-populated
- Swipe-left or long-press → delete option
- The editor should allow assigning a domain (which "promotes" it from a thought to a task)

### 4. No deleted/trash section — no way to see or restore deleted tasks

**Old site:** Had a dedicated "Deleted tasks" section (`_deleted_tasks.html`) that showed archived tasks with a "Restore" button. This section was toggleable from the settings panel.

**React site:** Delete actions show a 5-second undo toast, then the task is gone. If the user misses the toast (or it auto-dismisses), there's no way to find or restore deleted tasks.

The backend supports this — `DELETE /tasks/{id}` sets `status="archived"` (soft delete), and `POST /tasks/{id}/restore` recovers it. But the frontend has no UI to list archived tasks.

**Fix:** Add a "Deleted" collapsible section (like CompletedSection/ScheduledSection) that:
- Queries tasks where `status === "archived"` (may need a query param on `GET /tasks`)
- Shows each with a "Restore" button
- Is hidden by default, toggled from the settings panel

### 5. Backup export and snapshot download missing

**File:** `frontend/src/routes/_authenticated/settings.tsx` (Data & Backup section)

The old site had buttons to export all user data as JSON and download individual snapshots. The React settings page can create/list/restore/delete snapshots but cannot:
- **Export data as JSON** — `GET /api/v1/backup/export` exists, never called
- **Download a snapshot** — `GET /api/v1/backup/snapshots/{id}/download` exists, never called

Users have no way to get their data out of the system except through snapshot restore (which overwrites current data).

**Fix:** Add:
- "Export Data" button that calls `GET /backup/export` and triggers a file download
- "Download" button per snapshot row that calls `GET /backup/snapshots/{id}/download`

---

## HIGH — UX bugs that affect usability

### 6. Swipe-complete doesn't cascade to subtasks (inconsistent with click-complete)

**File:** `frontend/src/components/task/domain-group.tsx:61-75`

When completing a task via **swipe** (mobile), the optimistic update only toggles the parent:
```tsx
return old.map((t) =>
  t.id === task.id
    ? { ...t, status: "completed", completed_at: new Date().toISOString() }
    : t,
);
```

But when completing via **checkbox click** (`task-item.tsx:56-73`), subtasks are cascaded:
```tsx
subtasks: t.subtasks?.map((st) => ({
  ...st,
  status: isCompleted ? "pending" : "completed",
})),
```

Result: swipe-completing a parent task with subtasks shows the parent as done but subtasks remain visually unchecked until the server refetch arrives (500ms-2s later). Feels broken.

**Fix:** Copy the subtask cascade logic from task-item.tsx into domain-group.tsx's `handleSwipeComplete`.

### 7. Mobile action sheet delete has no undo (desktop does)

**File:** `frontend/src/components/mobile/task-action-sheet.tsx:110-121`

Desktop delete actions (task-editor.tsx, keyboard shortcut) use `restoreMutation` for undo:
```tsx
toast.success("Task deleted", {
  action: { label: "Undo", onClick: () => restoreMutation.mutate(...) },
});
```

Mobile action sheet delete just shows `toast.info("Deleted ...")` with no undo action. On mobile — where accidental taps are more common — there's NO way to recover a deleted task.

**Fix:** Add the same undo pattern: call `useRestoreTaskApiV1TasksTaskIdRestorePost()` in the action sheet and wire it to the toast action button.

### 8. Plan Mode sends N sequential API calls instead of batch

**File:** `frontend/src/components/calendar/plan-mode.tsx:59-73`

```tsx
for (const p of planned) {
  try {
    await updateTask.mutateAsync({ taskId: p.taskId, data: { ... } });
    successCount++;
  } catch { failCount++; }
}
```

If the user plans 10 tasks, that's 10 sequential HTTP requests. With a 200ms round-trip, that's 2 seconds of "Scheduling..." spinner. The old site also scheduled one-by-one but the Jinja2 site was snappier because HTMX handled partial updates.

**Fix:** Either:
- (A) Use `Promise.all()` to send all requests in parallel
- (B) Add a backend batch-schedule endpoint
- (C) At minimum, fire-and-forget with a single `invalidateQueries` at the end

### 9. Sort/filter state lost on page reload

**File:** `frontend/src/stores/ui-store.ts:99-104`

```tsx
partialize: (state) => ({
  theme: state.theme,
  energyLevel: state.energyLevel,
  calendarHourHeight: state.calendarHourHeight,
}),
```

`sortField`, `sortDirection`, `showScheduled`, `showCompleted` are NOT persisted. Every page reload resets to: sort by clarity ASC, showScheduled=true, showCompleted=false.

If a user sorts by impact DESC and refreshes, they're back to clarity ASC. The old site persisted these via localStorage (each JS module saved its own state).

**Fix:** Add `sortField`, `sortDirection`, `showScheduled`, `showCompleted` to the `partialize` function.

### 10. Domain expand/collapse state resets on every page load

**File:** `frontend/src/stores/ui-store.ts:48-49`

```tsx
expandedDomains: new Set<number>(),
expandedSubtasks: new Set<number>(),
```

These use `Set<number>` which isn't JSON-serializable, and they're excluded from `partialize`. So domains start collapsed (or expanded — depends on the `expandedDomains.size === 0` check in domain-group.tsx:48) on every load.

The `isExpanded` logic defaults to expanded when the set is empty (`expandedDomains.size === 0 || expandedDomains.has(domainKey)`), which is fine for first load. But if the user collapses a domain and refreshes, it re-expands. Not a major issue since the default is "all expanded", but subtask expand state also resets.

**Fix (optional):** Convert Sets to arrays in `partialize`, or use a custom serializer. Low priority since default is "all expanded".

### 11. Calendar current-time indicator is static (never updates)

**File:** `frontend/src/components/calendar/day-column.tsx:50-53`

```tsx
const now = new Date();
const currentTimeOffset = isToday
  ? (now.getHours() - DAY_START_HOUR + now.getMinutes() / 60) * hourHeight
  : -1;
```

`now` is captured once during render. There's no interval or timer to re-render as time passes. The red "current time" line stays frozen at whatever time the component last rendered. If the user keeps the dashboard open for an hour, the indicator is an hour behind.

**Fix:** Use a `useEffect` with `setInterval` (every 60 seconds) to update a `currentTime` state variable, or use a lightweight `useClock` hook.

### 12. Swipe-left for scheduling doesn't schedule the specific task

**File:** `frontend/src/components/task/domain-group.tsx:112-115`

```tsx
const handleSwipeSchedule = useCallback(() => {
  haptic("light");
  setMobileTab("calendar");
}, [haptic, setMobileTab]);
```

Swiping left on a task just switches to the calendar tab — it doesn't pre-populate anything about which task to schedule. The user swipes left on "Buy groceries", lands on the calendar, and... nothing happens. They'd need to manually drag-and-drop from the task panel.

The old site's swipe-left triggered "plan mode" or at least pre-selected the swiped task for scheduling.

**Fix:** Either:
- (A) Pass the swiped task ID to the calendar panel and highlight it for drop
- (B) Open the task editor with the scheduling fields focused
- (C) At minimum, select the task so it's visually highlighted when the user returns to tasks

---

## MEDIUM — Correctness issues

### 13. Wizard "remove domain" deletes from UI but not from server

**File:** `frontend/src/components/wizard/onboarding-wizard.tsx:391`

In the DomainsStep, the trash button removes a domain from the local `domains` state:
```tsx
onClick={() => setDomains((prev) => prev.filter((_, j) => j !== i))}
```

But the `createDomain.mutate()` call (line 357) already created it on the server. The domain still exists in the database, but disappears from the wizard's display. When the user opens Settings, they'll see the "deleted" domain is still there.

**Fix:** Also call `deleteDomainMutation.mutate()` when removing from the local list.

### 14. `my` variable in swipe detection compares position to movement

**File:** `frontend/src/components/task/task-swipe-row.tsx:87`

```tsx
const [, my] = [mx, (event as TouchEvent).touches?.[0]?.clientY ?? 0];
```

`mx` is relative movement (from @use-gesture), but `my` is set to `clientY` which is an absolute screen position. The vertical-vs-horizontal check on line 98:
```tsx
if (first && Math.abs(my) > Math.abs(mx) * 1.5)
```

...compares absolute Y position (e.g., 500px from top of screen) against relative X movement (e.g., 3px). This means `Math.abs(my)` is always much larger than `Math.abs(mx)`, so `isVerticalRef` would almost always be set to `true`, which would cancel the swipe.

However, this only runs when `first` is true, and the `first` check on line 88 returns early when `mx < 10`. So this code path is effectively dead — by the time `mx` is large enough to not early-return, `first` is already false. The swipe still works, but the vertical-scroll conflict detection is broken (it never activates).

**Fix:** Use `@use-gesture`'s movement array: `const [, my] = movement` (available from the gesture state as `movement: [mx, my]`). Update the destructuring on line 50 to capture both axes.

### 15. Passkey WebAuthn registration works but unlock may use raw axios

**File:** `frontend/src/lib/passkey.ts:315`

```tsx
const optionsRes = await axios.post("/api/v1/passkeys/register/options");
```

The passkey module uses `axios.post()` directly instead of going through the `apiClient` wrapper. If the API client has interceptors (e.g., error handling, auth redirect), passkey calls bypass them. Also, if cookies/credentials aren't included by default in the axios instance here, the request may fail.

**Fix:** Import and use the `apiClient` from `@/lib/api-client` instead of raw axios, or ensure the passkey module's axios instance includes credentials.

---

## LOW — Polish and consistency

### 16. `showCompleted` defaults to `false` — different from old site

**File:** `frontend/src/stores/ui-store.ts:16`

The old site showed completed tasks by default (`show_completed_in_list` was `true` in UserPreferences). The React store defaults `showCompleted: false`. Users migrating from the old site will see their completed tasks disappear until they toggle the filter.

**Fix:** Default to `true`, or read the user's preference from the API on first load.

### 17. Analytics missing "Recent Completions" and "Resolution Time" widgets

**Old site:** Had ~15 chart widgets including "Recent Completions" list (20 items) and "Resolution Time" distribution.

**React site:** Has 8 widgets (stat cards, daily chart, domain breakdown, day-of-week, heatmap, impact chart, velocity chart, recurring list). The backend has `GET /analytics/recent-completions` but it's not called.

**Fix:** Add RecentCompletions and ResolutionTime components to the analytics page.

### 18. Thoughts page missing date group separators

**Old site:** Grouped thoughts by date ("Today", "Yesterday", "Feb 15", etc.) with visual separators between groups.

**React site:** Shows all thoughts in a flat list with individual timestamps but no date grouping/separators.

**Fix:** Group `decryptedTasks` by `created_at` date and render date headers between groups.

### 19. No error boundary wrapping authenticated routes

**File:** `frontend/src/routes/_authenticated.tsx`

There's no React error boundary. If any component throws during render (e.g., unexpected API data shape, crypto failure), the entire app crashes to a white screen. The old site had `error-handler.js` that caught and displayed errors gracefully.

**Fix:** Wrap the `<Outlet />` in an error boundary that shows a "Something went wrong" message with a "Reload" button.

---

## Summary by Priority

| # | Severity | Issue | Area |
|---|----------|-------|------|
| 1 | CRITICAL | Recurring instances absent from calendar | Feature gap |
| 2 | CRITICAL | "Skip instance" button is a no-op | Bug |
| 3 | CRITICAL | Thoughts: no delete, edit, or promote | Feature gap |
| 4 | CRITICAL | No deleted/trash section | Feature gap |
| 5 | CRITICAL | Backup export and snapshot download missing | Feature gap |
| 6 | HIGH | Swipe-complete doesn't cascade subtasks | Bug |
| 7 | HIGH | Mobile delete has no undo | Bug |
| 8 | HIGH | Plan Mode N sequential API calls | UX |
| 9 | HIGH | Sort/filter state lost on reload | UX |
| 10 | HIGH | Domain expand/collapse resets on reload | UX |
| 11 | HIGH | Calendar time indicator frozen | Bug |
| 12 | HIGH | Swipe-left doesn't schedule specific task | UX |
| 13 | MEDIUM | Wizard domain remove doesn't delete from server | Bug |
| 14 | MEDIUM | Swipe vertical detection uses wrong value | Bug |
| 15 | MEDIUM | Passkey module uses raw axios | Bug |
| 16 | LOW | showCompleted defaults differ from old site | UX |
| 17 | LOW | Analytics missing 2 widget types | Feature gap |
| 18 | LOW | Thoughts missing date separators | Feature gap |
| 19 | LOW | No error boundary for crash protection | UX |

## Recommended Fix Order

**Phase 1 — Critical feature gaps (largest UX regressions):**
1. Recurring instances in calendar (#1)
2. Thoughts interactivity (#3)
3. Deleted/trash section (#4)

**Phase 2 — High bugs (quick fixes, big impact):**
4. Swipe-complete subtask cascade (#6)
5. Mobile delete undo (#7)
6. Sort/filter persistence (#9)
7. Calendar time indicator (#11)
8. Skip instance wiring (#2)

**Phase 3 — Medium/Low polish:**
9. Export/download (#5)
10. Plan mode parallelization (#8)
11. Remaining items
