---
version:
pr:
created: 2026-03-06
---

# Audit 4 — Frontend UX & State Management (v0.57.0 → v0.64.1)

Scope: React components, hooks, stores, routing. Focus on UX correctness, state
consistency, and mobile responsiveness.

---

## 1. Lazy Routes

All 5 authenticated/public routes use TanStack Router's `.lazy()` code splitting:
`login`, `dashboard`, `analytics`, `settings`, `thoughts`. Non-lazy: `__root`,
`_authenticated`, `index`, `privacy`, `terms`.

### Findings

- **[SEV: Medium]** No `pendingComponent` or `defaultPendingComponent` defined anywhere
  - Files: `frontend/src/main.tsx:19`, all route `.tsx` files pass `{}`
  - Every critical-path route file (`dashboard.tsx`, `analytics.tsx`, etc.) creates a
    route with an empty options object — no `loader`, `pendingComponent`, or `errorComponent`.
  - The router (`createRouter({ routeTree })`) has no `defaultPendingComponent`.
  - During lazy chunk loading on slow networks, there is **no visual loading indicator**
    at the routing layer. TanStack Router's default is to keep the old route visible,
    which works but provides zero navigation feedback.
  - User impact: On slow connections or cold starts, navigation appears unresponsive.
    The user clicks a nav link and nothing visibly happens until the chunk loads.

- **[SEV: Low]** No route-level `errorComponent` for chunk load failures
  - Files: all route files, `frontend/src/main.tsx:19`
  - If a `.lazy.tsx` chunk fails to load (network error, stale cache after deploy),
    the error bubbles to `RootErrorBoundary` or `AppErrorBoundary` (React class
    components in `__root.tsx:44-89` and `_authenticated.tsx:116-166`).
  - These show a generic "Something went wrong" with Reload — functional but no
    chunk-specific retry or messaging.
  - User impact: After a deploy, users on stale tabs may see a generic error instead
    of a "new version available, please reload" message.

- **[SEV: Low]** `privacy.tsx` and `terms.tsx` are not code-split
  - Files: `frontend/src/routes/privacy.tsx`, `frontend/src/routes/terms.tsx`
  - Full component inline, adding to the initial bundle.
  - User impact: Minimal — these are small static pages.

---

## 2. Optimistic Updates

The codebase has a **consistent and well-executed optimistic update pattern** across
task/calendar interactions. The standard structure: snapshot → optimistic apply →
mutate → onSuccess: invalidate + toast with undo → onError: rollback + error toast.

The batch mutations library (`batch-mutations.ts`) is particularly well-designed with
`Promise.allSettled` for partial failure handling.

### Findings

- **[SEV: Medium]** Timezone optimistic update has no error rollback
  - File: `frontend/src/routes/_authenticated/settings.lazy.tsx:252-265, 277-291`
  - Both primary and secondary timezone updates use `setQueryData` for optimistic UI
    but have no `onError` rollback. If the mutation fails, the UI shows the new timezone
    until the next refetch (2-minute staleTime).
  - User impact: User sees wrong timezone for up to 2 minutes after a failed save.

- **[SEV: Low]** No global mutation error handler
  - File: `frontend/src/lib/query-client.ts:1-11`
  - No `MutationCache` with `onError` callback. Every call site must remember to add
    `onError`. The API client interceptor catches 5xx errors with a generic toast
    (`api-client.ts:204`), but 4xx errors (validation, not-found) are silently
    swallowed without explicit `onError`.
  - User impact: Some mutation failures produce no user feedback (see §4 for specifics).

- **[SEV: Low]** Undo mutations sometimes lack `onError`
  - File: `frontend/src/components/calendar/scheduled-task-card.tsx:101-109`
  - The undo action (reschedule back) inside the toast callback has no `onError`.
    If the undo itself fails, the user gets no feedback.
  - User impact: Silent undo failure — user thinks action was reversed but it wasn't.

---

## 3. Offline State

The offline architecture is well-designed:
- **Web**: immediate rejection with user feedback (error toast)
- **Tauri**: read from SQLite cache, queue writes, replay on reconnect
- 15s axios timeout prevents hanging requests
- TanStack Query `retry: 1` prevents infinite retry loops

### Findings

- **[SEV: Low]** No "slow connection" intermediate feedback
  - File: `frontend/src/lib/api-client.ts:22`
  - If online but with poor connectivity, 15s timeout + 1 retry = up to 30s wait
    with no intermediate feedback beyond the component's own loading spinner.
  - User impact: Minor — user sees a loading state but no explanation of why it's slow.

No spinners that hang forever were found. The `_authenticated.tsx` layout spinner
resolves to either data or a `/login` redirect. Tauri mode hydrates from SQLite
before network requests, so the spinner is typically skipped.

---

## 4. Toast Consistency

Global configuration: `TOAST_DURATION = 10_000` in `toast.ts:2`, applied via
`<Toaster>` in `__root.tsx:38`.

### Findings

- **[SEV: Low]** Hardcoded `duration: 2000` magic number
  - File: `frontend/src/routes/_authenticated/dashboard.lazy.tsx:411`
  - `toast(\`Selected ${parts.join(" and ")}\`, { duration: 2000 });`
  - Should use `TOAST_DURATION_SHORT` (4000ms) from `toast.ts` or a named constant.
  - User impact: None functional — cosmetic rule violation.

- **[SEV: Medium]** Five mutations missing `onError` toast
  - `frontend/src/routes/_authenticated/settings.lazy.tsx:322-330` — calendar selection save
  - `frontend/src/routes/_authenticated/settings.lazy.tsx:1354-1364` — domain archive
  - `frontend/src/routes/_authenticated/settings.lazy.tsx:1468-1475` — toggle snapshots
  - `frontend/src/routes/_authenticated/settings.lazy.tsx:1483-1490` — create snapshot
  - `frontend/src/routes/_authenticated/thoughts.lazy.tsx:229-238` — thought restore (undo action)
  - Note: 5xx errors still show a generic toast via the API interceptor, but 4xx errors
    (validation failures, not-found) produce no user feedback.
  - User impact: User performs action, it fails silently, stale data remains until refetch.

- **[SEV: Low]** `TOAST_DURATION_SHORT` not documented in Rule 11
  - File: `frontend/src/lib/toast.ts:5`
  - A second constant `TOAST_DURATION_SHORT = 4_000` exists and is used in 3 places
    (`use-task-form.ts:209, 241, 349`). Technically compliant (centralized constant)
    but not mentioned in the project's Rule 11 documentation.

---

## 5. Smart Input

All 8 consumer components properly delegate to either `useSmartInput` or
`useSmartInputConsumer`. No components duplicate parser state, token handling, or
autocomplete logic outside the canonical hooks. **Rule 10 is well-enforced.**

### Findings

- **[SEV: Medium]** `smartCallbacks` not memoized in `TaskFieldsBody`
  - File: `frontend/src/components/task/task-fields-body.tsx:110-139`
  - The `smartCallbacks` object is created inline on every render without `useMemo`.
    In contrast, `task-editor.tsx:64` and `task-edit-drawer.tsx:198` both correctly
    wrap their callbacks in `useMemo`.
  - This causes `useSmartInputConsumer` to receive a new `callbacks` reference on
    every render, triggering unnecessary re-creation of its `processTitle` callback
    (deps include `callbacks` at `use-smart-input-consumer.ts:152`).
  - User impact: Unnecessary re-renders during editing. No visible bug but wasted cycles.

- **[SEV: Low]** Duplicated keyboard nav logic across two hooks
  - Files: `frontend/src/hooks/use-smart-input.ts:152-179`,
    `frontend/src/hooks/use-smart-input-consumer.ts:174-201`
  - The ArrowDown/ArrowUp/Enter/Tab/Escape handling is near-identical in both hooks.
    Architecturally justified (Approach A vs B have different data flows) but the
    keyboard navigation itself could be extracted to a shared utility.
  - User impact: None — maintenance concern only.

- **[SEV: Low]** Double-parse in `useTriageForm.handleTitleEdit`
  - File: `frontend/src/hooks/use-triage-form.ts:152-156`
  - Calls `parseTaskInput` directly in addition to `setInput` which triggers a parse
    inside `useSmartInput`. Same input parsed twice per keystroke.
  - User impact: None visible — minor inefficiency.

---

## 6. Mobile Responsiveness

**Rule 8 (iOS viewport) is fully respected.** No violations found.

- No `overflow: hidden` on `html`/`body` (properly overridden in standalone mode)
- No `position: fixed` on page containers (only on overlays/modals)
- No `100dvh` usage anywhere
- `--app-height` properly implemented with `screen.height` for standalone
- Safe area insets comprehensively handled with double-declaration pattern
- Keyboard avoidance CSS-driven via `--keyboard-height`

### Findings

- **[SEV: Low]** Some touch targets below 44px iOS minimum
  - File: `frontend/src/components/task/field-pickers.tsx:279` — `h-8` (32px)
  - File: `frontend/src/components/batch/floating-action-bar.tsx:270` — `px-2 py-1.5` (~36px)
  - These are below Apple's 44px minimum recommended touch target.
  - User impact: Slightly harder to tap on small phones, but functional.

---

## 7. Zustand Store Hygiene

Three stores: `useUIStore`, `useSelectionStore`, `useCryptoStore`. All are well-structured.
No subscription leaks found — all store consumption is via React hooks (auto-cleanup).
No `.subscribe()` calls on Zustand stores anywhere in the codebase.

### Findings

- **[SEV: Medium]** No `version` or `migrate` in `useUIStore` persist config
  - File: `frontend/src/stores/ui-store.ts:206-244`
  - The persist config has no `version` field. If the persisted state shape changes
    (new fields, type changes), the store silently uses stale defaults or breaks.
    The store has already evolved to include `hideCompletedSubtasks`, `planStrategy`,
    and `showSecondaryTimezone`.
  - User impact: No active breakage today. Risk of hydration bugs on future schema changes.

- **[SEV: Low]** `selectedTaskId` / `selectedDomainId` can reference deleted entities
  - File: `frontend/src/stores/ui-store.ts:19-20`
  - These hold IDs of tasks/domains that may be deleted server-side. Not persisted
    (excluded from `partialize`), so risk is limited to a single session. Consumer
    components appear to guard against missing data.
  - User impact: Minimal — transient stale reference within a session.

- **[SEV: Low]** `showSecondaryTimezone` toggle is client-side only
  - File: `frontend/src/stores/ui-store.ts` (persisted via Zustand)
  - The secondary timezone *value* persists server-side, but the *show/hide toggle*
    is in the Zustand store with localStorage persistence.
  - User impact: Toggle state doesn't sync across devices. If a user enables the
    secondary timezone on their phone, it won't show on their desktop.

---

## 8. Context Menu & Interactions

Context menus use standard Radix UI patterns. All event listeners are properly cleaned
up in `useEffect` return functions. One module-level listener in `selection-store.ts:170`
(global Escape handler) is never removed — intentional for app-lifetime singleton.

### Findings

No issues found. The batch context menu dismiss workaround
(`batch-context-menu.tsx:27-32`) uses a synthetic Escape event to close the Radix
menu after date picker selection — well-documented and correct.

No interaction dead zones found. All `pointer-events-none` usages are on overlay/gradient
elements that correctly let taps pass through.

---

## 9. Timezone Display

Clean single-source-of-truth architecture: `timezone.ts` (core), `use-timezone.ts`
(hook), `timezone-picker.tsx` (UI). Secondary timezone persisted server-side.

### Findings

- **[SEV: Medium]** `formatDayHeader` is not timezone-aware
  - File: `frontend/src/lib/calendar-utils.ts:52-69`
  - Uses `new Date()` with `setHours(0,0,0,0)` (browser-local time) to determine
    "Today" / "Tomorrow" / "Yesterday" labels. If the user's configured timezone
    differs from the browser's timezone, these labels can be wrong near midnight.
  - The actual date determination (`todayString(timezone)`) is timezone-aware — only
    the header labeling is the weak spot.
  - User impact: Near midnight, "Today"/"Tomorrow" labels may be wrong for users
    whose configured timezone differs from their browser timezone.

- **[SEV: Low]** DST edge case in secondary timezone offset
  - File: `frontend/src/lib/calendar-utils.ts:198-201`
  - Offset computed once using the center date as reference. Adjacent-day hours
    (2 prev-evening + 5 next-morning) may be off by 1h on ~2 days/year during DST
    transitions. Documented in code comments as an accepted trade-off.
  - User impact: Secondary timezone labels off by 1 hour for dimmed adjacent-day
    slots on DST transition days.

---

## Summary

| # | SEV | Area | Finding |
|---|-----|------|---------|
| 1 | Medium | Lazy Routes | No `pendingComponent` — zero loading feedback during navigation |
| 2 | Medium | Optimistic | Timezone optimistic update has no error rollback |
| 3 | Medium | Toasts | 5 mutations missing `onError` toast (settings + thoughts) |
| 4 | Medium | Smart Input | `smartCallbacks` not memoized in `TaskFieldsBody` |
| 5 | Medium | Zustand | No `version`/`migrate` in `useUIStore` persist config |
| 6 | Medium | Timezone | `formatDayHeader` not timezone-aware ("Today" label can be wrong) |
| 7 | Low | Lazy Routes | No route-level `errorComponent` for chunk load failures |
| 8 | Low | Optimistic | No global mutation error handler (4xx errors can be silent) |
| 9 | Low | Optimistic | Undo mutations sometimes lack `onError` |
| 10 | Low | Toasts | Hardcoded `duration: 2000` in `dashboard.lazy.tsx` |
| 11 | Low | Smart Input | Duplicated keyboard nav logic across two hooks |
| 12 | Low | Mobile | Some touch targets below 44px iOS minimum |
| 13 | Low | Zustand | `showSecondaryTimezone` toggle doesn't sync across devices |
| 14 | Low | Timezone | DST edge case in secondary tz offset (documented, accepted) |

**No Critical issues found.**

**Architecture highlights:**
- Optimistic update pattern across task/calendar is excellent and consistent
- Batch mutations library is best-in-class with `Promise.allSettled` partial failure
- Rule 8 (iOS viewport) is fully respected — no violations
- Rule 10 (smart input) is well-enforced — no duplication outside canonical hooks
- Offline architecture is solid for both web and Tauri
- Event listener cleanup is thorough throughout
