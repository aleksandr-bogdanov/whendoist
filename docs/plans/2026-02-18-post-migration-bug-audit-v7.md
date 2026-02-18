---
version:
pr:
created: 2026-02-18
---

# Post-Migration Bug Audit v7

Seventh audit round following the Jinja2/JS → React SPA migration.
All v1-v6 issues (77 total) are assumed resolved and excluded from this list.

---

## HIGH — Significant bugs or broken logic

### 1. Domain group expand/collapse broken on first toggle

**Files:**
- `frontend/src/stores/ui-store.ts:52, 76-85`
- `frontend/src/components/task/domain-group.tsx:79-80`

The `expandedDomains` set starts empty. `domain-group.tsx:80` treats empty as "all expanded":
```tsx
const isExpanded = expandedDomains.size === 0 || expandedDomains.has(domainKey);
```

But `toggleExpandedDomain` (ui-store.ts:76-85) does a standard add/remove toggle. On first click of domain A (to collapse it), A is not in the empty set → `add(A)` → set becomes `{A}`. Now:
- Domain A: `size > 0 && has(A)` → **still expanded** (wrong — user wanted to collapse)
- Domain B: `size > 0 && !has(B)` → **collapsed** (wrong — user didn't touch B)
- Domain C: `size > 0 && !has(C)` → **collapsed** (wrong — user didn't touch C)

The first toggle of any domain collapses all OTHER domains instead of the clicked one. Subsequent toggles work correctly because the set is already populated.

**Impact:** Confusing first-use experience. Users who try to collapse one domain see all other domains disappear. The state persists to localStorage, so it only happens once per user, but it's a jarring bug.

**Fix:** Change to tracking collapsed domains instead of expanded ones:
```tsx
// ui-store.ts
collapsedDomains: new Set<number>(),
toggleCollapsedDomain: (domainId) =>
  set((state) => {
    const next = new Set(state.collapsedDomains);
    if (next.has(domainId)) next.delete(domainId);
    else next.add(domainId);
    return { collapsedDomains: next };
  }),

// domain-group.tsx
const isExpanded = !collapsedDomains.has(domainKey);
```

Rename in persistence layer too (`expandedDomains` → `collapsedDomains`). Empty set = all expanded (correct default).

---

### 2. Pull-to-refresh threshold check is broken (regex never matches)

**File:** `frontend/src/hooks/use-pull-to-refresh.ts:73, 87-90`

Line 73 sets the indicator's transform as:
```js
indicator.style.transform = `translate(-50%, ${translateY - 40}px)`;
```

Line 87 tries to extract the Y value with:
```js
indicator.style.transform.match(/translateY\(([\d.]+)px\)/)
```

The regex looks for `translateY(...)` but the actual CSS uses `translate(-50%, ...)` — a completely different CSS function. The regex **never matches**, so `finalY` is always `0 + 40 = 40`. The threshold check on line 90 (`finalY >= threshold * 0.5` → `40 >= 40`) is always true.

**Impact:** Pull-to-refresh triggers on any downward pull > 10px (the delta needed to create the indicator), instead of the intended 80px threshold. The visual progress indicator works correctly (shows the arrow filling up), but the trigger fires way too early.

**Fix:** Store the pull distance in a ref instead of parsing it from the DOM:
```ts
const pullDistanceRef = useRef(0);

// In handleTouchMove:
pullDistanceRef.current = deltaY;

// In handleTouchEnd:
if (pullDistanceRef.current >= threshold) {
  // trigger refresh
}
```

---

### 3. Keyboard shortcut 'x' deletes tasks without confirmation (even with subtasks)

**File:** `frontend/src/routes/_authenticated/dashboard.tsx:228-257`

The `x` keyboard shortcut fires `deleteTask.mutate()` immediately with no confirmation dialog, even when the task has subtasks. This silently deletes the parent and all its children.

Contrast with:
- `task-action-sheet.tsx:120-128` — shows `window.confirm` when task has subtasks
- `task-editor.tsx:728-752` — shows a full Dialog confirmation before delete

The undo toast (line 249, 5s duration) provides recovery, but users may not notice accidental deletion.

**Impact:** Accidental data loss. A user navigating with j/k who accidentally hits x (adjacent key) loses a task and all its subtasks.

**Fix:** Add a confirmation step for tasks with subtasks:
```tsx
handler: () => {
  // ...
  if (task.subtasks?.length) {
    if (!window.confirm(`Delete "${task.title}" and ${task.subtasks.length} subtask(s)?`)) return;
  }
  // proceed with delete
}
```

---

## MEDIUM — UX inconsistencies / missing error handling

### 4. Date-only scheduled tasks missing from calendar

**Files:**
- `frontend/src/components/calendar/calendar-panel.tsx:74-77`
- `frontend/src/lib/task-utils.ts:137-156`

Tasks can be scheduled for a date without a specific time (e.g., "do today, anytime"). These tasks are categorized as "scheduled" by `categorizeTasks` (task-utils.ts:148) and removed from the pending list. But the calendar only renders tasks with BOTH `scheduled_date` AND `scheduled_time`:

```tsx
const scheduledTasks = useMemo(
  () => tasks.filter((t) => t.scheduled_date && t.scheduled_time),
  [tasks],
);
```

Date-only tasks appear in the task panel's "Scheduled" collapsible section (scheduled-section.tsx), but NOT on the calendar view. The old site showed these in an "anytime" section at the top of each calendar day column.

**Impact:** Users who schedule tasks for "today" without a time see them disappear from the pending list and not appear on the calendar. They're only findable in the Scheduled section if it's expanded.

**Fix:** In `day-column.tsx`, add an "Anytime" section above the time grid that renders date-only tasks (those with `scheduled_date` matching the column date but null `scheduled_time`). Filter these from the `scheduledTasks` passed to `DayColumn` and pass separately.

---

### 5. No UI for batch-completing past recurring instances

**Files:**
- `frontend/src/api/queries/instances/instances.ts` (hooks exist)
- `frontend/src/components/task/task-editor.tsx` (feature absent)

The backend has `/api/v1/instances/batch-complete` and `/api/v1/instances/pending-past-count` endpoints. The orval-generated hooks (`useBatchCompleteInstances`, `useGetPendingPastCount`) exist but are never used. The old `task-dialog.js` showed a "Complete past instances" button when editing a recurring task with pending past instances.

**Impact:** Users with recurring tasks who miss several days have no way to batch-complete past instances. They must individually complete each one from the calendar or skip them.

**Fix:** In `task-editor.tsx`, when editing a recurring task, fetch the pending past count. If > 0, show a "Complete N past instances" button that calls the batch-complete endpoint.

---

### 6. InstanceCard on calendar missing optimistic updates

**File:** `frontend/src/components/calendar/day-column.tsx:219-247`

`handleComplete` (line 219) and `handleSkip` (line 234) call their mutations but don't perform optimistic cache updates. The card's visual state doesn't change until the server responds. Every other completion handler in the app (task-item.tsx, domain-group.tsx, task-action-sheet.tsx, scheduled-task-card.tsx) uses optimistic `queryClient.setQueryData` with rollback on error.

**Impact:** Noticeable delay when completing/skipping recurring instances on the calendar. Inconsistent with the instant feedback everywhere else.

**Fix:** Add optimistic updates matching the pattern in `scheduled-task-card.tsx:66-100` — update the instances cache optimistically and rollback on error.

---

### 7. Inconsistent complete/reopen toast feedback across entry points

**Files:**
- `frontend/src/components/task/task-item.tsx:113-131` — undo toast on complete, silent on reopen
- `frontend/src/components/task/domain-group.tsx:118-136` — undo toast on complete, silent on reopen
- `frontend/src/components/mobile/task-action-sheet.tsx:99-111` — toast for both, no undo
- `frontend/src/components/task/task-editor.tsx:289-303` — toast for both, no undo, closes editor

| Entry point | Complete feedback | Reopen feedback |
|---|---|---|
| Checkbox click (task-item) | "Task completed" + Undo | Silent |
| Swipe right (domain-group) | "Task completed" + Undo | Silent |
| Action sheet (long-press) | "Task completed" | "Task reopened" |
| Editor button | "Task completed" | "Task reopened" |

**Impact:** Users get no confirmation when reopening tasks via checkbox or swipe. Inconsistent UX across entry points.

**Fix:** Standardize: all entry points should show a toast on both complete and reopen. Undo should be available on complete from all entry points (it's a more common accidental action).

---

### 8. j/k navigation selects tasks in collapsed/hidden sections

**File:** `frontend/src/routes/_authenticated/dashboard.tsx:80-84`

`visibleTaskIds` includes ALL top-level tasks regardless of status:
```tsx
const visibleTaskIds = useMemo(() => {
  if (!tasks) return [];
  return tasks.filter((t) => t.parent_id === null).map((t) => t.id);
}, [tasks]);
```

Completed tasks (in the "Completed" collapsible, which may be collapsed) and scheduled tasks (in the "Scheduled" collapsible) are included. When the user navigates with j/k, they can "select" a task that isn't visible on screen. The `scrollIntoView` call (line 299) doesn't work because the element isn't in the DOM when its section is collapsed.

**Impact:** j/k navigation becomes unresponsive — user presses j repeatedly and nothing visibly happens because the selection moves through hidden tasks.

**Fix:** Filter `visibleTaskIds` to only include tasks in the pending (always visible) section, or at minimum respect `showScheduled` and `showCompleted` store flags:
```tsx
const visibleTaskIds = useMemo(() => {
  if (!tasks) return [];
  return tasks
    .filter((t) => t.parent_id === null && t.status !== "completed" && !t.scheduled_date)
    .map((t) => t.id);
}, [tasks]);
```

---

### 9. Domain reorder — second mutation has no error handling

**File:** `frontend/src/routes/_authenticated/settings.tsx:892-918`

`handleMove` fires two sequential `updateDomain.mutate` calls to swap positions. The second call (line 906-916) is nested inside the first's `onSuccess` but has no `onError` handler. If the second mutation fails, domain A has its new position but domain B keeps its old position — the positions are now inconsistent (both may share the same position value).

**Impact:** Corrupted domain ordering. No error toast shown to the user. Only visible after page refresh.

**Fix:** Add `onError` handler to the second mutation. Or better, use `useBatchUpdateDomainsApiV1DomainsBatchUpdatePost` (already imported, line 43) to swap both positions in a single atomic request.

---

### 10. Timezone update has no error toast

**File:** `frontend/src/routes/_authenticated/settings.tsx:228-238`

`updatePrefs.mutate` has `onSuccess` with `toast.success("Timezone updated")` but no `onError` handler. If the server rejects the timezone change, the Select visually reverts (controlled by server data) but the user gets no error feedback.

**Fix:** Add `onError: () => toast.error("Failed to update timezone")`.

---

### 11. No Todoist disconnect UI in settings

**File:** `frontend/src/routes/_authenticated/settings.tsx:447-515`

The Todoist section only has a "Connect Todoist" button. Once connected, there's no way to disconnect from the React SPA. The `useDisconnectTodoistAuthTodoistDisconnectPost` API hook exists (orval-generated) but is never used.

The old site had a Todoist disconnect option in the settings.

**Impact:** Users who want to disconnect Todoist have no way to do so.

**Fix:** After successful import (or when a Todoist connection exists), show a "Disconnect Todoist" button that calls the disconnect API.

---

### 12. SubtaskItem passes SubtaskResponse as TaskResponse to editor

**File:** `frontend/src/components/task/task-item.tsx:462`

```tsx
onEdit?.(subtask as unknown as AppRoutersTasksTaskResponse);
```

`SubtaskResponse` is missing fields present in `AppRoutersTasksTaskResponse`: `scheduled_date`, `scheduled_time`, `recurrence_rule`, `recurrence_start`, `recurrence_end`, `due_date`, `description`, `domain_id`, `subtasks`, etc. The task editor reads these fields from the `task` prop (task-editor.tsx:101-138). Missing fields are `undefined`, and the `??` fallbacks default them to empty/null, so the editor renders but shows incomplete/incorrect data (e.g., domain shows "Inbox" even if the subtask belongs to a domain via its parent).

**Impact:** Editing a subtask via the editor shows missing/incorrect metadata. Users may accidentally clear data that doesn't appear in the form.

**Fix:** When editing a subtask, fetch the full task data using `useGetTaskApiV1TasksTaskIdGet` (currently unused — see Area 1), or pass the parent task's full data and find the subtask within it.

---

## LOW — Minor gaps / dead code

### 13. Delete passkey has no confirmation dialog

**File:** `frontend/src/routes/_authenticated/settings.tsx:727-738`

Deleting a passkey fires immediately on button click with no confirmation. Passkeys are security credentials — accidental deletion could lock the user out of their encrypted data on that device.

**Fix:** Add a confirmation dialog (same pattern as the delete task confirmation in task-editor.tsx:728-752).

---

### 14. Unused API hooks (7 hooks after exclusions)

The following orval-generated hooks have zero usage in `frontend/src/` (excluding api/ directory):

| Hook | File | Reason unused |
|---|---|---|
| `useBatchCompleteInstances` | instances.ts | No batch instance completion UI |
| `useGetAllContent` | tasks.ts | No "export all content" feature in React |
| `useGetTask` | tasks.ts | List endpoint used everywhere (individual fetch unnecessary) |
| `useGetDomain` | domains.ts | List endpoint used everywhere |
| `useGetProjects` | projects.ts | Projects endpoint (Todoist-related, no UI) |
| `useScheduleInstance` | instances.ts | No instance rescheduling UI |
| `useToggleInstanceComplete` | instances.ts | Directional `useCompleteInstance` used instead |

**Impact:** Dead code. Not harmful but indicates potential missing features (batch instance complete, instance rescheduling) or API surface that could be pruned.

**Fix:** No immediate action needed. Consider adding UI for `useGetTask` (single-task fetch for subtask editing, see #12) and `useBatchCompleteInstances` (batch operations, see #5). The rest can remain as available API surface.

---

### 15. Area 5: No TODO/FIXME/HACK/XXX comments found

Grep for `TODO|FIXME|HACK|XXX` in `frontend/src/` returned zero matches. Clean.

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| HIGH     | 3     | #1-3   |
| MEDIUM   | 9     | #4-12  |
| LOW      | 3     | #13-15 |
| **Total** | **15** | |
