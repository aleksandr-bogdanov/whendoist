---
version:
pr:
created: 2026-03-01
---

# Response to Task Creation Audit — Action Plan

Review of findings from `2026-03-01-task-creation-audit.md`. All claims verified against
the actual codebase. Every finding is factually accurate — the question is what's worth doing.

## Verdict per Finding

### 1a. ParentTaskSelect duplicates groupParentTasks() — DO IT

**Genuine miss from the consolidation PR.** We extracted `groupParentTasks()` into
`task-utils.ts` and updated 3 consumers (parent-task-picker.tsx, task-inspector.tsx,
thought-triage-drawer.tsx) but missed `ParentTaskSelect` in `field-pickers.tsx:424-453`.
It has a verbatim copy of the same 4-bucket grouping algorithm.

**Fix:** One-liner swap — replace the 30-line `useMemo` with `groupParentTasks()`. ~2 minutes.

### 1b. TaskEditor ≈ TaskDetailPanel — DO IT (biggest remaining win)

The audit is right: both components manage ~12 identical `useState` calls, identical
`handleSave` with identical payload assembly for create AND update, identical toast patterns,
identical delete confirmation flow. The ONLY difference is rendering: TaskEditor renders
fields inline (with its own layout), TaskDetailPanel delegates to `<TaskFieldsBody>`.

We intentionally scoped this out of the first consolidation ("their lifecycle is complex
enough that a shared hook would add more abstraction than clarity"). Having now verified
how identical they actually are, that call was wrong. This is ~200 lines of pure
duplication — same magnitude as the useTriageForm extraction we already did.

**Fix:** Extract `useTaskForm` hook with all shared state + save/delete logic. Both
components become rendering shells, same pattern as the triage refactor. Keep
`useSmartInputConsumer` wiring in TaskEditor since TaskDetailPanel doesn't use it.

### 3a. TaskEditor/TaskDetailPanel skip useTaskCreate — SKIP (subsumed by 1b)

If we do 1b, the shared `useTaskForm` hook would naturally use `useTaskCreate` internally
for its create path. No need to address this separately.

The UX inconsistency (quick-add gets undo on create, editors don't) would get fixed for
free.

### 3b. Thought capture uses raw API — SKIP

This is **intentional and correct**. The quick capture input creates thoughts (not tasks)
— minimal records that the user triages later. Passing only `{ title }` is the right
call. Server defaults for impact/clarity are fine here; adding explicit client defaults
would be cargo-culting.

### 5a. Inline clarity regex in useTriageForm — DO IT

Same pattern as the IMPACT_TOKEN_PATTERN export we already did. The clarity regex is
hardcoded at `use-triage-form.ts:273` because nobody exported it from task-parser.ts.

**Fix:** Add `export const CLARITY_TOKEN_PATTERN = /\?(autopilot|normal|brainstorm)\b/i;`
to task-parser.ts, import in use-triage-form.ts. ~2 minutes.

Note: the canonical `CLARITY_PATTERN` in the parser uses abbreviated forms
(`auto(?:pilot)?`, `brain(?:storm)?`) for flexible user input. The token pattern for
`tapToken` replacement uses exact full words because it replaces programmatically-inserted
text (not freeform typing). These are intentionally different — don't try to merge them.

### 5b. Inline duration fallback regex — DO IT (alongside 5a)

The simplified pattern at `use-triage-form.ts:287` misses `hrs`/`mins`/`hr` abbreviations
that the canonical parser handles. In practice this fallback only fires when inserting a
NEW duration token (not replacing existing ones), so the impact is minimal. But it's a
consistency issue and trivial to fix.

**Fix:** Export `DURATION_TOKEN_PATTERN` from task-parser.ts, import in use-triage-form.ts.

### 6a. Triage conversion omits impact/clarity when unset — SKIP

The audit calls this "fragile" but it's actually **correct sparse-update semantics**.
When converting a thought to a task, the PATCH only sends fields the user explicitly set.
Omitting impact/clarity preserves the server's defaults. Sending explicit 4/"normal" would
be redundant and could mask future default changes.

Not fragile — intentional.

### 6b. Asymmetric falsy-vs-undefined checks — DO IT (tiny)

`impact !== undefined` vs `clarity` truthy check. The truthy check isn't currently
buggy (clarity values are always non-empty strings), but it's inconsistent with the
adjacent `impact` check. Takes 5 seconds to normalize.

**Fix:** Change `if (data.clarity)` to `if (data.clarity !== undefined)` in
thoughts.lazy.tsx:259.

---

## Implementation Plan

### Quick wins (one PR, ~30 min)

1. **1a** — Replace inline grouping in `ParentTaskSelect` (field-pickers.tsx) with
   `groupParentTasks()` call
2. **5a** — Export `CLARITY_TOKEN_PATTERN` from task-parser.ts, use in use-triage-form.ts
3. **5b** — Export `DURATION_TOKEN_PATTERN` from task-parser.ts, use in use-triage-form.ts
4. **6b** — Normalize `clarity` check to `!== undefined` in thoughts.lazy.tsx

### Larger refactor (separate PR, ~1-2 hours)

5. **1b** — Extract `useTaskForm` hook from TaskEditor + TaskDetailPanel. This is the
   biggest remaining deduplication opportunity (~200 lines). Same extraction pattern
   as useTriageForm. This naturally subsumes **3a** (editors would use useTaskCreate
   for creation).

### Skip

- **3b** (thought capture raw API) — Intentional, not duplication
- **6a** (triage omits unset fields) — Correct sparse-update behavior
