---
version: v0.49.3
pr: 346
created: 2026-02-18
---

# Post-Migration Bug Audit v6

Sixth audit round following the Jinja2/JS → React SPA migration.
All v1-v5 issues are assumed resolved and excluded from this list.

---

## HIGH — Significant bugs or missing features

### 1. ScheduledTaskCard: Complete action missing optimistic update

**File:** `frontend/src/components/calendar/scheduled-task-card.tsx:62-75`

The `handleComplete` function calls `toggleComplete.mutate` and only invalidates queries on success. Every other complete path in the app (task-item.tsx, domain-group.tsx, task-action-sheet.tsx) performs an optimistic `queryClient.setQueryData` update before the mutation, giving instant visual feedback with rollback on error.

**Impact:** Users see a noticeable delay when completing a task from the calendar card — the card lingers until the server responds, inconsistent with the instant feedback everywhere else.

**Fix:** Add optimistic update + onError rollback matching the pattern in `domain-group.tsx:54-114`.

---

### 2. PlanMode: Dialog closable during active scheduling

**File:** `frontend/src/components/calendar/plan-mode.tsx:84`

Line 84: `<Dialog open={open} onOpenChange={onOpenChange}>` — the `onOpenChange` callback has no guard against closure while `isCommitting` is true. The Cancel/Confirm buttons are correctly disabled (lines 116, 119), but the user can close the dialog via backdrop click or Escape while `Promise.allSettled` is in flight on line 56.

**Impact:** If closed mid-commit, the `Promise.allSettled` continues in the background, then calls `onOpenChange(false)` again (line 74), `setIsCommitting(false)` on an unmounted component, and toast notifications appear with no context.

**Fix:** Guard the callback:
```tsx
<Dialog open={open} onOpenChange={(v) => { if (!isCommitting) onOpenChange(v); }}>
```

---

### 3. Task editor: No Complete/Reopen button

**File:** `frontend/src/components/task/task-editor.tsx` (entire file — feature absent)

The old `task-dialog.js` had a Complete/Reopen button inside the editor dialog so users could toggle task status while editing. The React TaskEditor only has Save and Delete — there is no way to complete or reopen a task from the editor.

On desktop, users can use the `c` keyboard shortcut with the task selected, but this doesn't work from inside the editor sheet (modal suppresses shortcuts). On mobile, users must close the editor, long-press for the action sheet, then tap Complete.

**Fix:** Add a Complete/Reopen button in the editor footer (next to Delete), using `useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost`. Only show when editing an existing task (`task !== null`).

---

### 4. Task editor: No "Promote to top-level" for subtasks

**File:** `frontend/src/components/task/task-editor.tsx` (feature absent)

The old `task-dialog.js` had a "Promote to task" button when editing a subtask, allowing users to detach it from its parent and make it a top-level task. The React TaskEditor has no such button. The thoughts page has a "promote" action (thoughts.tsx:183), but that promotes thoughts to tasks — a different concept.

**Impact:** Users who want to promote a subtask must manually clear the parent field, which requires knowing to use the parent picker and set it to "None". Not discoverable.

**Fix:** When editing a subtask (`task.parent_id !== null`), show a "Promote to top-level" button that calls `updateTask.mutate({ taskId: task.id, data: { parent_id: null } })`.

---

### 5. No network status monitoring / offline detection

**Missing feature** (no file exists)

The old `error-handler.js` had `window.addEventListener('online'/'offline')` with toast notifications ("No internet connection" / "Back online") and dispatched custom `network:online`/`network:offline` events. The React SPA has zero network monitoring — grep for `navigator.onLine`, `online`, `offline` events returns no matches in `frontend/src/`.

**Impact:** When the user loses connectivity, API calls fail silently (or show generic "Failed to..." error toasts) with no explanation. The user gets no indication that the problem is network-related, and no "back online" confirmation when connectivity resumes.

**Fix:** Create a `useNetworkStatus` hook that listens for `online`/`offline` window events and shows persistent toasts. Mount it in the authenticated layout (`_authenticated.tsx`).

---

### 6. ScheduledTaskCard: Unschedule button has no loading/disabled state

**File:** `frontend/src/components/calendar/scheduled-task-card.tsx:47-60, 124-130`

The Unschedule button fires `updateTask.mutate` but remains fully interactive during the pending mutation. It doesn't check `updateTask.isPending` and has no visual loading state. The actions overlay is immediately hidden by `setShowActions(false)` on line 59, so if the mutation fails, the user has no feedback until the error toast appears.

**Fix:** Keep `showActions` visible during mutation. Disable both action buttons while either mutation is pending:
```tsx
disabled={updateTask.isPending || toggleComplete.isPending}
```

---

## MEDIUM — UX gaps / regressions from old site

### 7. Task editor: No metadata timestamps

**File:** `frontend/src/components/task/task-editor.tsx` (feature absent)

The old `task-dialog.js` displayed "Created at" and "Completed at" timestamps at the bottom of the dialog. The React TaskEditor shows no task metadata. The `AppRoutersTasksTaskResponse` model includes `created_at` and `completed_at` fields — the data is available.

**Fix:** Add a metadata footer at the bottom of the editor when editing an existing task:
```
Created Feb 15, 2026 · Completed Feb 17, 2026
```

---

### 8. No pull-to-refresh on mobile

**Missing feature** (no file exists)

The old `mobile-core.js` had a `PullToRefresh` class that triggered a full data refresh on pull-down gesture. The React SPA has no pull-to-refresh — the only way to refresh data on mobile is to navigate away and back or wait for stale time to expire.

**Fix:** Implement a pull-to-refresh gesture handler (e.g., via a lightweight library or custom touch handler) that calls `queryClient.invalidateQueries()` for tasks, instances, and events. Mount in the task panel on touch devices.

---

### 9. Calendar hour height not synced to server preferences

**Files:**
- `frontend/src/stores/ui-store.ts:58, 105-106, 114` (local-only storage)
- `app/models.py:216` (server field exists: `calendar_hour_height`)
- `app/routers/preferences.py:34, 52` (API accepts and returns it)

The `calendarHourHeight` value is persisted only in Zustand's localStorage. The server's `preferences` model has a `calendar_hour_height` column, and the API accepts it in `PreferencesUpdate` and returns it in `PreferencesResponse`. But the React SPA never reads from or writes to the server preference.

**Impact:** Calendar zoom level doesn't sync across devices or sessions cleared of localStorage.

**Fix:** On auth layout mount, read `preferences.calendar_hour_height` and initialize the store. On zoom change, debounce-write to `useUpdatePreferencesApiV1PreferencesPut`.

---

### 10. No Google Calendar connection banner on dashboard

**File:** `frontend/src/routes/_authenticated/dashboard.tsx` (feature absent)

The old `dashboard.html` showed a "Connect Google Calendar" banner when the user hadn't connected GCal. The React dashboard has no such prompt. The data is available: `MeResponse.calendar_connected: boolean` (see `frontend/src/api/model/meResponse.ts:13`).

**Impact:** New users who skip the onboarding wizard see an empty calendar panel with no guidance on how to connect GCal. They must discover it in Settings.

**Fix:** In `dashboard.tsx`, check `me.calendar_connected`. If false, show a dismissible banner above or inside the calendar panel with a "Connect Google Calendar" button that navigates to `/auth/google`.

---

### 11. No right-click context menu on desktop tasks

**File:** `frontend/src/components/task/task-item.tsx` (feature absent)

The old `task-complete.js` had `handleGutterRightClick` that opened a context menu with quick actions (edit, complete, schedule, delete). The React TaskItem has no `onContextMenu` handler. Desktop users must use keyboard shortcuts or double-click to edit — there's no discoverable right-click menu.

Note: `ScheduledTaskCard` does have a right-click handler (line 97-100) that toggles action buttons, but the main task list items do not.

**Fix:** Add `onContextMenu` to TaskItem that opens a `DropdownMenu` with Edit, Complete, Schedule, Delete actions.

---

### 12. No desktop kebab/more menu on task items

**File:** `frontend/src/components/task/task-item.tsx` (feature absent)

The old site had a three-dot kebab button on each task item (visible on hover) for quick actions. Mobile has the action sheet via long-press, but desktop has no equivalent visual affordance — actions require keyboard shortcuts (c, e, x) or double-click. Many users won't discover keyboard shortcuts.

**Fix:** Add an `EllipsisVertical` (lucide) button that appears on hover, opening a `DropdownMenu`. This could be combined with issue #11 (right-click opens the same menu).

---

## LOW — Minor gaps, intentional simplification possible

### 13. No inline "add task" row per domain group

**File:** `frontend/src/components/task/domain-group.tsx` (feature absent)

The old dashboard had `.add-task-row` at the bottom of each domain group — a compact row with a "+" icon that opened a quick-add pre-filled with that domain. The React SPA only has the global quick-add (Q shortcut) and the full editor (N shortcut), neither of which pre-selects the domain.

**Fix:** Add a minimal "Add task" button at the bottom of each `DomainGroup` that opens quick-add pre-seeded with the group's domain.

---

### 14. Plain HTML date/time inputs in task editor

**Files:**
- `frontend/src/components/task/task-editor.tsx:362` (`<input type="date">`)
- `frontend/src/components/task/task-editor.tsx:385` (`<input type="time">`)

The old site used Air Datepicker with Today/Clear buttons for date selection, and a custom iOS-style scroll picker for time selection with hour/minute drums, snap-to-value, and drag support. The React TaskEditor uses plain `<input type="date">` and `<input type="time">`.

**Impact:** Functional but a UX downgrade — no "Today" shortcut button, no "Clear" button (users must manually delete the date), and the native time picker varies wildly across browsers/platforms.

**Fix:** Consider a lightweight React date picker (e.g., react-day-picker or cmdk-based) with Today/Clear buttons. For time, consider a custom selector or at minimum add Today/Clear shortcut buttons next to the native inputs.

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| HIGH     | 6     | #1-6   |
| MEDIUM   | 6     | #7-12  |
| LOW      | 2     | #13-14 |
| **Total** | **14** | |

---

## Implementation prompt

> Fix all 14 issues from the v6 post-migration bug audit plan at `docs/plans/2026-02-18-post-migration-bug-audit-v6.md`.
>
> **Read the plan file first** — it has exact file paths, line numbers, and fix descriptions for each issue.
>
> Work through issues in order (HIGH → MEDIUM → LOW). For each issue:
> 1. Read the file(s) mentioned in the plan
> 2. Implement the fix described
> 3. Verify the fix doesn't break existing functionality
>
> Key patterns to follow:
> - **Optimistic updates** (#1, #6): Match the pattern in `domain-group.tsx:54-114` — `queryClient.setQueryData` before mutation, rollback in `onError`
> - **New hooks** (#5): Create in `frontend/src/hooks/`, mount in `_authenticated.tsx`
> - **Editor features** (#3, #4, #7): Add to `task-editor.tsx` — use existing mutation hooks
> - **Desktop menus** (#11, #12): Use shadcn `DropdownMenu` component
> - **Connection banner** (#10): Check `me.calendar_connected` from the `/api/v1/me` query
> - **Server sync** (#9): Use `useUpdatePreferencesApiV1PreferencesPut` with debounce
>
> After all fixes, run: `cd frontend && npx tsc --noEmit && npx biome check .`
>
> Do NOT touch: encryption logic, performance optimizations, test files, backend code (all fixes are frontend-only).
