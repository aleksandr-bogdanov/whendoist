---
version:
pr:
created: 2026-03-02
---

# Plan: Mobile Task Edit Drawer (Bottom Sheet)

## Context

On mobile (iPhone), the Tasks editing experience uses a full-screen Radix Sheet
(`TaskEditor`) that takes over the entire viewport — heavy, no swipe dismiss, stacked
labels waste vertical space, save button below the fold. The Thoughts triage experience
uses a compact vaul bottom drawer that feels native and efficient.

This plan replaces the Sheet with a vaul bottom drawer on mobile, matching the triage
drawer's UX quality. See `docs/plans/2026-03-02-mobile-editing-audit.md` for the full
audit.

## New File

### `frontend/src/components/task/task-edit-drawer.tsx` (~300 lines)

**Structure** (mirrors `thought-triage-drawer.tsx`):

```
TaskEditDrawer (Drawer.Root shell)
└── DrawerBody (form logic + compact field layout)
    ├── Title textarea (Approach A smart input)
    ├── Domain row (inline label + DomainChipRow, horizontal scroll)
    ├── Parent row (edit mode only — button → nested drawer, immediate-apply)
    ├── Impact row (inline label + ImpactButtonRow)
    ├── When row (inline label + ScheduleButtonRow)
    ├── Duration row (inline label + DurationPickerRow showCustom)
    ├── Time row (conditional — inline label + TimePickerField)
    ├── Repeat row (inline label + RecurrencePresetRow)
    ├── Clarity row (inline label + ClarityChipRow)
    ├── Notes row (textarea with rich-text link preview, data-vaul-no-drag)
    ├── Batch complete (edit, recurring, past instances pending)
    ├── Sticky footer: Delete + Save/Create + Complete/Reopen
    ├── Nested calendar drawer (Drawer.NestedRoot)
    └── Nested parent picker drawer (Drawer.NestedRoot, edit mode only)
        └── Search + grouped task list (reuses groupParentTasks)

DeleteConfirmDialog (same pattern as current TaskEditor)
```

**Hooks used**:
- `useTaskForm({ task, onDone })` — all form state, mutations, dirty tracking
- `useSmartInputConsumer(domains, callbacks, task?.title)` — Approach A token consumption
- `usePasteUrl(...)` — auto-convert pasted URLs in notes

**Key layout pattern** (each field row):
```tsx
<div className="flex items-center gap-2">
  <span className="text-xs text-muted-foreground shrink-0 w-14">Label</span>
  <div className="flex-1"><FieldComponent /></div>
</div>
```

**Drawer config**:
- `repositionInputs={false}` (prevent jump on iOS keyboard)
- `max-h-[90vh]` (slightly taller than triage's 85vh — more fields)
- `max-w-lg mx-auto` (center on tablets)

**Sticky footer**:
```tsx
<div className="border-t bg-background px-4 pt-2.5
     pb-[max(0.625rem,env(safe-area-inset-bottom))]
     flex items-center gap-2">
  {isEdit && <Delete button (ghost/destructive)>}
  {isEdit && <Complete/Reopen button (outline)>}
  <Save/Create button (primary, flex-1)>
</div>
```

**Dismiss behavior**: No dirty confirmation — instant dismiss on swipe/overlay tap.

**Parent picker (edit mode)**: Nested drawer with search, using `groupParentTasks()`.
On selection: immediate server mutation with optimistic cache update + undo toast
(same logic as `ParentTaskPicker.handleSelect`). Also triggers domain auto-sync flash.

**Recurrence**: `RecurrencePresetRow` for both create/edit. Maps existing
`recurrenceRule` to the closest preset; unmapped complex rules show as "Custom".
On change: maps preset back to `{freq, interval, days_of_week}` and calls
`form.handlers.onRecurrenceRuleChange` + `onRecurringChange`.

## Modified File

### `frontend/src/routes/_authenticated/dashboard.tsx`

Changes:
1. Import `TaskEditDrawer` instead of `TaskEditor`
2. Remove `TaskEditor` from JSX
3. Add `TaskEditDrawer` in its place — same props: `open`, `onOpenChange`, `task`, `domains`, `parentTasks`
4. The mobile detection logic in `handleEditTask`/`handleNewTask` stays identical — just the rendered component changes

```diff
-import { TaskEditor } from "@/components/task/task-editor";
+import { TaskEditDrawer } from "@/components/task/task-edit-drawer";

-<TaskEditor
+<TaskEditDrawer
   open={editorOpen}
   onOpenChange={setEditorOpen}
   task={editingTask}
   domains={safedomains}
   parentTasks={parentTasks}
 />
```

Note: `TaskEditor` (Sheet) is only used in `dashboard.tsx`. After this change it becomes
unused. We keep the file for now (no deletion) — it can serve as reference or be removed
in a cleanup PR.

## Reused Code (no changes needed)

| File | What's reused |
|------|---------------|
| `hooks/use-task-form.ts` | All form state, save/delete/complete mutations |
| `hooks/use-smart-input-consumer.ts` | Approach A token consumption |
| `hooks/use-paste-url.ts` | URL auto-linking in notes |
| `components/task/field-pickers.tsx` | All 7 field picker components |
| `components/task/smart-input-autocomplete.tsx` | Autocomplete dropdown |
| `components/ui/calendar.tsx` | Calendar in nested drawer |
| `lib/task-utils.ts` | `groupParentTasks()` for parent picker |
| `lib/rich-text-parser.ts` | `hasLinks()` for notes preview |
| `components/ui/rich-text.tsx` | `RichText` for notes link rendering |

## Implementation Notes

- **`data-vaul-no-drag`** on notes textarea + domain chip scroll container to prevent
  vaul intercepting scroll/touch as drawer dismiss
- **Title auto-resize**: Same `requestAnimationFrame` pattern from TaskFieldsBody
- **Title focus**: 300ms delay after drawer open (vaul animation needs to settle)
- **Autocomplete z-index**: `SmartInputAutocomplete` uses `absolute` positioning — works
  inside drawer since it's relative to the title container
- **Domain chip scroll**: Wrap in `overflow-x-auto scrollbar-hide touch-pan-x` like
  triage drawer
- **Domain flash**: Track `domainFlash` state; trigger on smart-input domain consumption
  and on parent-change domain auto-sync

## PWA Safety

All three iOS viewport shrink triggers are avoided:
- No `overflow: hidden` on html/body (vaul overlays only)
- No `position: fixed` on page containers (drawer is a portal)
- No `100dvh` for page heights (drawer uses `max-h-[90vh]`)
- Footer uses `env(safe-area-inset-bottom)` padding

## Version & PR

- Bump version in `pyproject.toml`: current → +1 patch
- `uv lock`
- Update `CHANGELOG.md`
- PR title: `v{version}/feat: Mobile task edit drawer (bottom sheet)`

## Verification

1. `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — no type errors
2. `cd frontend && npx biome check .` — lint passes
3. `cd frontend && npm run build` — production build succeeds
4. `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test` — backend still clean
5. Manual: open on mobile viewport (Chrome DevTools iPhone mode), verify:
   - Tap task → drawer slides up from bottom, ~70% height
   - Fields visible with inline labels, compact spacing
   - Swipe down dismisses
   - Save/Complete/Delete in sticky footer
   - Calendar opens as nested drawer
   - Smart input tokens consumed and fields flash
   - Create mode: tap "+" on mobile → drawer opens with empty form
