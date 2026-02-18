---
version: v0.48.12
pr: 342
created: 2026-02-18
---

# Post-Migration Bug Audit v2 — React SPA Issues

Second-pass analysis after the Jinja2 → React SPA migration (v0.47-v0.48).
First pass covered in `2026-02-18-fix-post-rework-frontend-bugs.md` (PR #337): route collision + settings crash.

---

## CRITICAL — Will cause visible user-facing bugs

### 1. Encrypted text flashes on screen before decryption

**Files:** `frontend/src/components/dashboard/task-panel.tsx:84-104`

TaskPanel decrypts tasks in a `useEffect` (async), which means on every render:
1. First render: component shows `tasks` raw (ciphertext)
2. useEffect fires, decrypts asynchronously
3. Second render: component shows plaintext

Users with encryption enabled see ~100-300ms of ciphertext gibberish every time
the task list loads or tasks change.

**Root cause:** Decryption runs in useEffect with useState, not at the query layer.
The `use-crypto.ts` hook exists and provides `decryptTasks()` but TaskPanel
re-implements its own `decryptTasksWithKey()` function (lines 28-57) and runs it
in a useEffect. Same for `decryptDomainsWithKey()` (lines 59-70).

**Fix:** Either:
- (A) Wrap the orval query with a custom hook that decrypts in the `select` option
  of `useQuery`, so the cache holds plaintext and components never see ciphertext
- (B) Show a loading skeleton while `decryptedTasks` is empty and `canDecrypt` is true
  (quick patch — minimum: add `decryptedTasks.length === 0 && canDecrypt` to loading state)

Option (A) is the architecture described in the migration plan (Phase 2). Option (B) is
a quick fix.

### 2. Thoughts page decryption skips edits — stale dependency

**File:** `frontend/src/routes/_authenticated/thoughts.tsx:36-45`

```typescript
// biome-ignore lint/correctness/useExhaustiveDependencies: ...
useEffect(() => {
  decryptTasks(thoughts).then((result) => { ... });
}, [thoughts.length, decryptTasks]);
```

Depends on `thoughts.length` only. If a thought's title is edited (encrypted text
changes but count stays the same), decryption doesn't re-run. The user sees the
old plaintext until they reload.

**Fix:** Use a stable fingerprint instead of just length. For example:
```typescript
const thoughtsKey = thoughts.map(t => `${t.id}:${t.title?.slice(0,8)}`).join(',');
```

### 3. Encryption enable flow can corrupt data — operation ordering

**File:** `frontend/src/routes/_authenticated/settings.tsx:522-555`

Current order:
1. Derive key from passphrase (client-side)
2. Encrypt all tasks/domains (client-side)
3. `batchTasks.mutateAsync` — sends encrypted data to server
4. `batchDomains.mutateAsync` — sends encrypted data to server
5. `setupMutation.mutateAsync` — tells server "encryption is now enabled"

If step 3 or 4 succeeds but step 5 fails, the server has encrypted data but
doesn't know encryption is enabled. `encryption_enabled = false` means the API
won't tell the client to decrypt, so the user sees ciphertext permanently.

**Fix:** Reverse the order — call `setupMutation` first (step 5 → step 1), then
encrypt and batch-update. If the batch fails, the server knows encryption is
enabled but data is plaintext — far safer (client can retry encryption).

### 4. Task item drag handle escapes its container

**File:** `frontend/src/components/task/task-item.tsx:112-128`

```tsx
<div className="group flex items-center gap-2 ...">        {/* NO position:relative */}
  <div className="absolute inset-0 cursor-grab ..." />     {/* absolute! */}
  <button className="... relative z-10" />                  {/* checkbox */}
  ...
</div>
```

The drag handle is `position: absolute` with `inset-0`, but the parent flex div
has no `position: relative`. The absolute div will anchor to the nearest positioned
ancestor (likely the scroll container or body), covering an incorrect area.

**Symptom:** Drag initiation area is wrong — either too large (covering multiple
rows) or misaligned with the task row.

**Fix:** Add `relative` to the parent div:
```tsx
<div className={cn("group relative flex items-center gap-2 ...")}>
```

---

## HIGH — Likely to cause bugs under specific conditions

### 5. 401 interceptor does full-page reload instead of SPA navigation

**File:** `frontend/src/lib/api-client.ts:46-48`

```typescript
if (error.response?.status === 401) {
  window.location.href = "/login";
}
```

`window.location.href` does a full browser navigation, destroying the entire SPA
state (Zustand stores, TanStack Query cache, in-memory encryption key). For session
expiry this is especially bad — the user loses their encryption key and must
re-enter their passphrase.

Additionally, the 401 fires for EVERY failed API call simultaneously (tasks, domains,
preferences, etc.), potentially triggering multiple rapid navigations.

**Fix:**
- Debounce/guard: set a flag after the first redirect to prevent duplicates
- Consider: use TanStack Router's `navigate("/login")` for SPA-internal redirect
  (preserves memory state). Or at minimum, keep the full reload but only trigger once.

### 6. `_authenticated.tsx` renders child pages before encryption is unlocked

**File:** `frontend/src/routes/_authenticated.tsx:60-81`

The layout renders:
1. `<AppShell>` (which contains `<Outlet />` → dashboard/settings/etc.)
2. `<EncryptionUnlock>` (overlay dialog)

When encryption is enabled but not unlocked, the child page (e.g., dashboard)
renders and fires its queries. The tasks API returns ciphertext. The dashboard
renders ciphertext behind the unlock dialog.

If the user dismisses the dialog (they can't — it prevents interaction) or if
there's a timing gap, they see encrypted text.

**Fix:** Don't render `<Outlet />` until encryption is resolved:
```tsx
const needsUnlock = encryptionStatus?.enabled && !isUnlocked;
return (
  <>
    {needsUnlock ? (
      <EncryptionUnlock ... />
    ) : (
      <AppShell ...>
        {/* Outlet rendered only when ready */}
      </AppShell>
    )}
  </>
);
```

### 7. Hardcoded query keys are fragile — 15 places bypass generated helpers

**Files:** 8 files across components/, routes/

15 occurrences of `queryKey: ["/api/v1/tasks"]` (hardcoded string) vs. 4 uses of
`getListTasksApiV1TasksGetQueryKey()` (generated helper).

Currently both resolve to the same key `["/api/v1/tasks"]` because no params are
passed. But if the tasks endpoint ever gains query params (e.g., filtering), the
generated key would become `["/api/v1/tasks", { status: "pending" }]`, and the
hardcoded invalidations would fail to match.

**Fix:** Replace all 15 hardcoded occurrences with the generated helper:
```typescript
import { getListTasksApiV1TasksGetQueryKey } from "@/api/queries/tasks/tasks";
queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
```

### 8. Missing response models make orval generate `unknown` types

**Files:** `app/routers/tasks.py`, `app/routers/instances.py`

These endpoints return raw dicts with no `response_model`:
- `POST /tasks/{id}/complete` → `{"status": "...", "task_id": ...}`
- `POST /tasks/{id}/uncomplete` → same
- `POST /tasks/{id}/toggle-complete` → `{"status": "...", "completed": bool, ...}`
- `POST /tasks/batch-update` → `{"updated_count": int, ...}`
- `POST /instances/{id}/complete|uncomplete|toggle-complete|skip`
- `POST /instances/batch-complete` → `{"completed_count": int}`
- `GET /instances/pending-past-count` → `{"pending_count": int}`
- `POST /instances/batch-past` → `{"affected_count": int}`

Orval generates `unknown` return types for these. Frontend code must use `as any`
or type assertions that won't catch schema changes.

**Fix:** Add Pydantic response models:
```python
class TaskCompleteResponse(BaseModel):
    status: str
    task_id: int
    completed: bool | None = None
```

### 9. OpenAPI spec is stale (v0.48.8 vs v0.48.11)

**File:** `frontend/openapi.json`

The generated types are 3 versions behind. Any fields or endpoints added in
v0.48.9-v0.48.11 are missing from the frontend types.

**Fix:** Regenerate:
```bash
# Start backend
uv run uvicorn app.main:app &
# Fetch spec and regenerate
curl -s http://localhost:8000/openapi.json > frontend/openapi.json
cd frontend && npx orval
```

---

## MEDIUM — Correctness issues, unlikely to crash

### 10. Optimistic subtask cascade doesn't handle uncomplete

**File:** `frontend/src/components/task/task-item.tsx:56-73`

When completing a parent, subtasks are optimistically set to "completed". Good.
When UNcompleting a parent (`isCompleted=true`, toggle to false), the subtask
status remains `st.status` (still "completed"). The server may uncomplete subtasks
too, but the optimistic UI doesn't reflect this — subtasks stay checked until
the refetch.

**Fix:** Set subtask status to "pending" when uncompleting parent:
```typescript
subtasks: t.subtasks?.map((st) => ({
  ...st,
  status: isCompleted ? "pending" : "completed",
})),
```

### 11. Todoist import passes `{ data: null }` to mutation

**File:** `frontend/src/routes/_authenticated/settings.tsx:448`

```typescript
importMutation.mutate({ data: null }, ...)
```

The import endpoint might not accept null body. Should verify if this is correct
or should be `{ data: {} }` or `undefined`.

### 12. `parentTasks` filter logic excludes valid parents

**File:** `frontend/src/routes/_authenticated/dashboard.tsx:46-52`

```typescript
const parentTasks = useMemo(
  () => tasks?.filter(
    (t) => t.parent_id === null && !t.is_recurring && (t.subtasks?.length ?? 0) === 0,
  ) ?? [],
  [tasks],
);
```

This excludes tasks that already have subtasks (`subtasks.length === 0`), meaning
you can't add another subtask to a task that already has some. You can only make
a task a subtask of a task with NO existing subtasks.

**Fix:** Remove the subtask count check:
```typescript
(t) => t.parent_id === null && !t.is_recurring
```

### 13. Duplicate decryption implementations

**Files:**
- `frontend/src/hooks/use-crypto.ts` (the canonical hook)
- `frontend/src/components/dashboard/task-panel.tsx:28-70` (duplicate)

TaskPanel has its own `decryptTasksWithKey` and `decryptDomainsWithKey` functions
that duplicate `use-crypto.ts`. Bug fixes to one won't propagate to the other.

**Fix:** Remove the duplicate functions from task-panel.tsx and use the `useCrypto()`
hook exclusively.

### 14. Keyboard shortcuts registered with module-level mutable array

**File:** `frontend/src/hooks/use-shortcuts.ts:16`

```typescript
const registeredShortcuts: ShortcutDef[] = [];
```

Module-level mutable state survives across component mounts/unmounts. If the
dashboard unmounts and remounts (e.g., navigation), the useEffect cleanup removes
old refs but the empty-dependency-array `useEffect` only registers once. If React
StrictMode double-fires effects, or if hot-reload occurs, duplicate shortcuts can
accumulate.

This is minor in production but can cause issues during development.

---

## LOW — Style/consistency issues

### 15. Inconsistent `as` type casts bypass orval's generated types

**Files:**
- `settings.tsx:255` — `calendarsQuery.data as CalendarResponse[] | undefined`
- `settings.tsx:509` — `passkeysQuery.data as { passkeys?: PasskeyInfo[] } ...`
- `settings.tsx:526-531` — `tasksQuery.data as Array<{...}>`
- `settings.tsx:969-971` — `snapshotsQuery.data as { snapshots?: ... }`

These casts suggest the orval-generated return types don't match what the API
actually returns. Each cast is a place where a backend schema change could silently
break the frontend.

**Fix:** Update backend `response_model` so orval generates correct types, then
remove the manual casts.

### 16. Privacy/Terms links use `<a href>` instead of router Link

**File:** `settings.tsx:1233-1238`

```tsx
<a href="/privacy" ...>Privacy Policy</a>
<a href="/terms" ...>Terms of Service</a>
```

These cause full-page navigations instead of SPA transitions.

**Fix:** Use `<Link from={Route.fullPath} to="/privacy">` from TanStack Router.

---

## Summary by Priority

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | CRITICAL | Encrypted text flashes before decryption | FIXED — loading guard in task-panel.tsx |
| 2 | CRITICAL | Thoughts decryption skips edits | FIXED — stable fingerprint key |
| 3 | CRITICAL | Encryption enable can corrupt data | FIXED — reordered: setupMutation first |
| 4 | CRITICAL | Drag handle position:absolute without relative parent | FIXED — added `relative` |
| 5 | HIGH | 401 does full reload, loses encryption key | FIXED — redirect guard flag |
| 6 | HIGH | Child routes render before encryption unlock | FIXED — conditional Outlet render |
| 7 | HIGH | 15 hardcoded query keys | FIXED — all use generated helper |
| 8 | HIGH | Missing response models → unknown types | FIXED — Pydantic models added |
| 9 | HIGH | Stale openapi.json | DEFERRED — requires running server, regen after deploy |
| 10 | MEDIUM | Optimistic uncomplete doesn't cascade to subtasks | FIXED — cascade to "pending" |
| 11 | MEDIUM | Todoist import passes null body | NOT A BUG — backend accepts None |
| 12 | MEDIUM | parentTasks filter excludes valid parents | FIXED — removed subtask count check |
| 13 | MEDIUM | Duplicate decryption code | FIXED — uses shared functions from use-crypto.ts |
| 14 | MEDIUM | Module-level mutable shortcut array | SKIPPED — works correctly in production |
| 15 | LOW | Type casts bypass generated types | DEFERRED — depends on #9 (regen) |
| 16 | LOW | Privacy/Terms links cause full reload | FIXED — RouterLink from TanStack Router |
