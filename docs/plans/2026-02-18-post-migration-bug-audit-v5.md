---
version: v0.49.2
pr: 345
created: 2026-02-18
---

# Post-Migration Bug Audit v5 — Subtask UX, Touch DnD, Safe Areas

Fifth-pass analysis after the Jinja2 → React SPA migration.
- v1: PR #337 — 2 issues, all fixed
- v2: PR #342 — 16 issues, 12 fixed
- v3: PR #343 — 19 issues, all fixed
- v4: (assumed all 14 fixed)

This pass focuses on **interaction correctness**, **touch device handling**, **subtask UX gaps**, and **missing UI for existing backend features**. Encryption and performance excluded per request.

---

## HIGH — Bugs affecting daily use

### 1. Subtasks cannot be edited — `onEdit` not passed to SubtaskItem

**File:** `frontend/src/components/task/task-item.tsx:246,260`

Parent `TaskItem` receives both `onSelect` and `onEdit`. When you click a parent's title (`handleTitleClick`, line 45-49), it calls `onEdit?.(task)` which opens the task editor sheet.

But `SubtaskTree` (line 246) only receives `onSelect`:
```tsx
<SubtaskTree subtasks={task.subtasks!} depth={depth + 1} onSelect={onSelect} />
```

And `SubtaskItem` (line 276) has no `onEdit` prop at all. Clicking a subtask title calls `selectTask(subtask.id)` + `onSelect?.(subtask.id)` — it highlights the subtask but never opens the editor.

**Impact:** Users cannot edit subtask titles, descriptions, duration, impact, or any other field. The only way to modify a subtask is through the API directly. This is a significant UX regression from the old site where clicking any task opened the editor.

**Fix:** Pass `onEdit` through to `SubtaskTree` and `SubtaskItem`. In `SubtaskItem.handleClick`, look up the full task from the query cache (since `SubtaskResponse` may not have all fields) and call `onEdit`.

### 2. Calendar drag-drop on touch devices calculates wrong scheduled time

**File:** `frontend/src/components/task/task-dnd-context.tsx:159`

```tsx
const pointerY = (event.activatorEvent as PointerEvent).clientY + (event.delta?.y ?? 0);
```

When using `TouchSensor` (mobile), `event.activatorEvent` is a `TouchEvent`, not a `PointerEvent`. `TouchEvent` has no `.clientY` property — that's on `Touch` objects inside `.touches[0]`. Casting to `PointerEvent` and accessing `.clientY` returns `undefined`, making `pointerY = NaN`.

The subsequent `offsetToTime(NaN, hourHeight)` produces garbage time values. Tasks dragged to the calendar on touch devices are scheduled at incorrect times.

**Fix:** Handle both event types:
```tsx
let clientY: number;
if (event.activatorEvent instanceof TouchEvent) {
  clientY = event.activatorEvent.touches[0]?.clientY ?? event.activatorEvent.changedTouches[0]?.clientY ?? 0;
} else {
  clientY = (event.activatorEvent as PointerEvent).clientY;
}
const pointerY = clientY + (event.delta?.y ?? 0);
```

### 3. `pb-safe` utility class doesn't exist — bottom sheet has no safe-area padding

**File:** `frontend/src/components/mobile/bottom-sheet.tsx:40`

```tsx
<div className="flex-1 overflow-y-auto px-4 pb-safe">{children}</div>
```

`pb-safe` is not a standard Tailwind utility and is not defined anywhere in the project. The only safe-area CSS is `.safe-area-bottom` in `globals.css:130`, which is a regular class (not a Tailwind utility like `pb-safe`).

**Impact:** On iPhones with home indicators (iPhone X+), the bottom sheet content renders behind the home indicator bar. Buttons at the bottom of action sheets and editors may be unreachable.

**Fix:** Replace `pb-safe` with inline safe-area padding:
```tsx
<div className="flex-1 overflow-y-auto px-4" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>{children}</div>
```
Or define `pb-safe` as a Tailwind utility in `globals.css`:
```css
@utility pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
```

### 4. Subtask completion has no optimistic update

**File:** `frontend/src/components/task/task-item.tsx:288-299`

`SubtaskItem.handleToggleComplete` fires the mutation and waits for `onSuccess: invalidateQueries` before the checkbox visually toggles:

```tsx
toggleComplete.mutate(
  { taskId: subtask.id, data: null },
  {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
    },
    onError: () => toast.error("Failed to update task"),
  },
);
```

Compare with parent `TaskItem` (line 59-78) which has full optimistic `setQueryData` before the mutation. The result: parent checkboxes toggle instantly, but subtask checkboxes have a 200-500ms delay. This inconsistency feels broken.

**Fix:** Add optimistic update matching the parent pattern. Since subtasks are nested inside parent tasks in the query data, the optimistic update needs to find the parent and update the subtask within it:
```tsx
queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
  getListTasksApiV1TasksGetQueryKey(),
  (old) => old?.map(t => ({
    ...t,
    subtasks: t.subtasks?.map(st =>
      st.id === subtask.id
        ? { ...st, status: isCompleted ? "pending" : "completed" }
        : st
    ),
  })),
);
```

---

## MEDIUM — Correctness issues and feature gaps

### 5. `use-device.ts` creates duplicate media query handlers (O(n²) callbacks)

**File:** `frontend/src/hooks/use-device.ts:58-85`

Each call to `useDevice()` → `useSyncExternalStore(subscribe, ...)` → `subscribe(callback)` creates 5 NEW `MediaQueryList` event listeners. Each handler closure iterates the shared `listeners` Set and calls every registered callback.

With N components using `useDevice()`, there are N×5 media query listeners, and each fires all N callbacks. A single viewport resize triggers N² callback invocations instead of N.

Currently ~3-4 components use `useDevice()`, so this is 9-16× overhead. Not critical, but grows quadratically.

**Fix:** Move media query listeners to module scope (register once) and only manage the callback set in `subscribe`:

```tsx
const handler = () => {
  cachedCapabilities = getCapabilities();
  for (const listener of listeners) listener();
};

// Register ONCE at module level
if (typeof window !== "undefined") {
  for (const query of [
    "(hover: none)", "(max-width: 900px)", "(max-width: 580px)",
    "(prefers-reduced-motion: reduce)", "(display-mode: standalone)",
  ]) {
    window.matchMedia(query).addEventListener("change", handler);
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}
```

### 6. `task-swipe-row.tsx` resetState doesn't clear long-press timer

**File:** `frontend/src/components/task/task-swipe-row.tsx:165-171`

```tsx
function resetState() {
  setDeltaX(0);
  setIsSwiping(false);
  setPhase("idle");
  setDirection(null);
  prevPhaseRef.current = "idle";
  // Missing: clearLongPress()
}
```

`resetState()` is called from multi-touch cancel (line 66), vertical scroll detection (line 111), and gesture end (line 153). In the multi-touch case (lines 64-67), `clearLongPress()` IS called before `resetState()`, but in the vertical scroll case (lines 109-112) it is NOT:

```tsx
if (isVerticalRef.current) {
  cancel();
  resetState();  // ← long-press timer still running!
  return;
}
```

If a user starts a swipe, the system detects vertical scroll and cancels, but the long-press timer continues. 300ms later, `onLongPress?.()` fires unexpectedly, opening the action sheet.

**Fix:** Add `clearLongPress()` to `resetState()`:
```tsx
function resetState() {
  clearLongPress();  // Always clear timer when resetting
  setDeltaX(0);
  // ...
}
```

### 7. Settings missing "Re-run Wizard" button

**Files:** `frontend/src/routes/_authenticated/settings.tsx`, `frontend/src/api/queries/wizard/wizard.ts`

The backend has `POST /api/v1/wizard/reset` and orval generates `useResetWizardApiV1WizardResetPost`. The old site had a Settings > Setup section with a "Re-run Wizard" button. The React settings page has no such section.

**Impact:** Users cannot re-run the onboarding wizard to reconfigure domains, calendar connections, or Todoist imports without directly navigating to `/wizard` (if even exposed as a route).

**Fix:** Add a small settings section:
```tsx
function SetupSection() {
  const resetWizard = useResetWizardApiV1WizardResetPost();
  return (
    <SettingsCard title="Setup" icon={<Settings2 className="h-4 w-4" />}>
      <Button variant="outline" size="sm" onClick={() => resetWizard.mutate(undefined, {
        onSuccess: () => navigate({ to: '/wizard' }),
      })}>
        Re-run Setup Wizard
      </Button>
    </SettingsCard>
  );
}
```

### 8. Backup import has no UI

**Files:** `frontend/src/routes/_authenticated/settings.tsx`, `frontend/src/api/queries/backup/backup.ts`

The backend has `POST /api/v1/backup/import` to import a previously exported JSON backup. The orval hook `useImportBackupApiV1BackupImportPost` exists but is never used. The Data section has Export and snapshot management, but no Import button.

**Impact:** Users can export their data but cannot import it back. This breaks the backup/restore workflow for users migrating between accounts or recovering from data loss.

**Fix:** Add an "Import Data" button in the Data section that opens a file picker, reads the JSON, and calls the import endpoint:
```tsx
<Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
  <Upload className="h-3.5 w-3.5 mr-1.5" /> Import Data
</Button>
<input ref={fileInputRef} type="file" accept=".json" hidden onChange={handleImport} />
```

---

## LOW — Polish and consistency

### 9. `shortcuts-help.tsx` useMemo has empty deps — shows stale shortcuts

**File:** `frontend/src/components/shortcuts-help.tsx:21-33`

```tsx
const grouped = useMemo(() => {
  const all = getRegisteredShortcuts();
  // ...
}, []); // eslint-disable-line react-hooks/exhaustive-deps -- recalc when opened
```

The comment says "recalc when opened" but `open` is not in the dependency array. If shortcuts change (e.g., different components register shortcuts on different pages), the help dialog shows the shortcuts from first render only.

**Fix:** Add `open` to deps:
```tsx
}, [open]);
```

### 10. Settings About section missing footer links

**File:** `frontend/src/routes/_authenticated/settings.tsx:1329-1336`

The old site's settings footer had: GitHub, License, Credits, PWA Debug. The React version only has Privacy Policy and Terms of Service.

**Fix:** Add links:
```tsx
<a href="https://github.com/aleksandr-bogdanov/whendoist" target="_blank" rel="noopener noreferrer"
  className="text-muted-foreground hover:underline">GitHub</a>
<a href="/static/debug-pwa.html" target="_blank" className="text-muted-foreground hover:underline">
  PWA Debug</a>
```

### 11. `mobileTab` not persisted — resets to "tasks" on page reload

**File:** `frontend/src/stores/ui-store.ts:107-117`

`mobileTab` is not in the `partialize` function. If a mobile user is viewing the calendar and refreshes, they're sent back to the tasks tab.

**Fix:** Add `mobileTab` to partialize:
```tsx
partialize: (state) => ({
  // ...existing fields...
  mobileTab: state.mobileTab,
}),
```

### 12. `gesture-discovery.tsx` setTimeout not cleaned up on unmount

**File:** `frontend/src/components/gesture-discovery.tsx:50-52`

```tsx
setTimeout(() => {
  toast.info("Tip: long-press any task for quick actions", { duration: 4000 });
}, 500);
```

If the component unmounts within 500ms of the click, the toast fires on a destroyed component context. Minor — only affects first-time users navigating away quickly.

**Fix:** Store the timeout and clear it in the useEffect cleanup:
```tsx
const timerRef = useRef<number | null>(null);
// In handler:
timerRef.current = window.setTimeout(() => { ... }, 500);
// In cleanup:
if (timerRef.current) clearTimeout(timerRef.current);
```

---

## Summary

| # | Severity | Issue | Category |
|---|----------|-------|----------|
| 1 | HIGH | Subtasks cannot be edited (no `onEdit` on SubtaskItem) | Bug |
| 2 | HIGH | Calendar drag-drop on touch: wrong time (TouchEvent cast) | Bug |
| 3 | HIGH | `pb-safe` undefined — bottom sheet no safe-area padding | Bug |
| 4 | HIGH | Subtask checkbox has no optimistic update (visual delay) | Bug |
| 5 | MEDIUM | `use-device.ts` O(n²) media query handler duplication | Bug |
| 6 | MEDIUM | Swipe resetState doesn't clear long-press timer | Bug |
| 7 | MEDIUM | Settings missing "Re-run Wizard" button | Feature gap |
| 8 | MEDIUM | Backup import has no UI | Feature gap |
| 9 | LOW | ShortcutsHelp shows stale data (empty useMemo deps) | Bug |
| 10 | LOW | About section missing GitHub/Debug links | Feature gap |
| 11 | LOW | `mobileTab` not persisted on reload | UX |
| 12 | LOW | gesture-discovery setTimeout leak on unmount | Bug |

## Recommended Fix Order

**Phase 1 — Quick wins with high impact:**
1. Subtask editing (#1) — pass `onEdit` through, ~10 lines
2. Subtask optimistic update (#4) — add `setQueryData`, ~15 lines
3. `pb-safe` fix (#3) — one-line CSS utility definition
4. Swipe timer cleanup (#6) — one-line addition
5. Shortcuts stale deps (#9) — one-line fix

**Phase 2 — Moderate effort:**
6. Touch DnD time calculation (#2) — type guard + fallback
7. `use-device.ts` refactor (#5) — move listeners to module scope
8. `mobileTab` persistence (#11) — one line in partialize
9. Gesture discovery cleanup (#12) — add ref and cleanup

**Phase 3 — Feature additions:**
10. Re-run Wizard button (#7) — new small settings section
11. Backup import button (#8) — file picker + mutation
12. About section links (#10) — add anchor tags

---

## Implementation Prompt

```
Implement the 12 fixes from docs/plans/2026-02-18-post-migration-bug-audit-v5.md.

Order of implementation:
1. task-item.tsx: Pass onEdit to SubtaskTree and SubtaskItem. Add onEdit prop to
   SubtaskTreeProps and SubtaskItemProps. In SubtaskItem.handleClick, call onEdit
   with the subtask data (cast SubtaskResponse to the needed type or look up from
   query cache).

2. task-item.tsx SubtaskItem: Add optimistic setQueryData before toggleComplete.mutate.
   Map over parent tasks to find and update the subtask within its parent's subtasks array.

3. Either define @utility pb-safe in globals.css with padding-bottom: env(safe-area-inset-bottom),
   or replace pb-safe with inline style in bottom-sheet.tsx.

4. task-swipe-row.tsx: Add clearLongPress() as the first line of resetState().

5. shortcuts-help.tsx: Change useMemo dependency from [] to [open].

6. task-dnd-context.tsx line 159: Add type guard for TouchEvent vs PointerEvent
   to get correct clientY.

7. use-device.ts: Move the 5 matchMedia addEventListener calls to module scope
   (outside subscribe). subscribe() only adds/removes callbacks from the Set.

8. ui-store.ts: Add mobileTab to partialize object.

9. gesture-discovery.tsx: Store setTimeout result in a ref, clear in useEffect cleanup.

10. settings.tsx: Add SetupSection component with "Re-run Setup Wizard" button
    using useResetWizardApiV1WizardResetPost.

11. settings.tsx DataSection: Add "Import Data" button with file input that calls
    useImportBackupApiV1BackupImportPost.

12. settings.tsx AboutSection: Add GitHub and PWA Debug links.

After all changes: cd frontend && npx tsc --noEmit && npx biome check . && npm run build
Then: uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
```
