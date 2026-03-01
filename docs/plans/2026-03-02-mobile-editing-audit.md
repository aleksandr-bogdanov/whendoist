---
version:
pr:
created: 2026-03-02
---

# Mobile Editing UX Audit

## 1. Surface Map — Every Mobile Create/Edit Surface

### 1A. ThoughtTriageDrawer (Thoughts page — mobile triage)

| Aspect | Detail |
|--------|--------|
| **File** | `components/task/thought-triage-drawer.tsx` |
| **Container** | Vaul `Drawer.Root` — bottom drawer |
| **Screen coverage** | Partial: `max-h-[85vh]`, auto-sized to content |
| **Dismiss pattern** | Swipe down (vaul native) + overlay tap |
| **Smart input** | Approach B (`useTriageForm` → `useSmartInput`) |
| **Fields shown** | Title, Domain, Parent, Impact, When, Duration, Time (conditional), Repeat, Clarity, Notes |
| **Field layout** | Horizontal rows: fixed-width left label (`w-14`) + field beside it, `space-y-2` |
| **Scroll** | `overflow-y-auto` on drawer body |
| **Footer** | Sticky bar: Delete (ghost) + Convert/CTA (primary), safe-area-bottom padding |
| **Nested pickers** | Calendar → nested drawer; Parent → nested drawer with search |
| **Chrome** | Minimal: drag handle + sr-only title, no visible header |

### 1B. TaskEditor (Dashboard — mobile task create/edit)

| Aspect | Detail |
|--------|--------|
| **File** | `components/task/task-editor.tsx` |
| **Container** | Radix `Sheet` (`SheetContent side="right"`) — full-screen slide-over |
| **Screen coverage** | Full: `w-full sm:max-w-md` |
| **Dismiss pattern** | X close button only (unsaved changes guard blocks overlay tap) |
| **Smart input** | Approach A (`useSmartInputConsumer` — tokens consumed immediately) |
| **Fields shown** | Title, Domain, Parent (edit only), Impact, Clarity, Duration, When, Time, Repeat + RecurrencePicker, Notes, Batch complete (recurring), Complete/Reopen, Timestamps, Save/Delete |
| **Field layout** | Vertical stacks: label above field (`EditorFieldRow`), `space-y-4` between rows |
| **Scroll** | `overflow-y-auto` on entire SheetContent |
| **Footer** | Not sticky — Save/Delete at bottom of scroll area, may be off-screen on open |
| **Nested pickers** | Calendar → Radix Popover (desktop-oriented), no nested drawers |
| **Chrome** | Full SheetHeader (title + description + X button) |

### 1C. TaskQuickAdd (Dashboard — ⌘Q / FAB)

| Aspect | Detail |
|--------|--------|
| **File** | `components/task/task-quick-add.tsx` |
| **Container** | Radix `Dialog` (centered overlay) |
| **Screen coverage** | Centered modal, `sm:max-w-lg` |
| **Dismiss pattern** | X button, overlay tap, Escape |
| **Smart input** | Approach B (`useSmartInput`) |
| **Fields shown** | Single input + metadata pills + syntax hints |
| **Field layout** | Minimal: input → pills → hints → footer |
| **Scroll** | None (content fits) |
| **Footer** | Keep-open checkbox + Create button |

### 1D. TaskActionSheet (Dashboard — long-press menu)

| Aspect | Detail |
|--------|--------|
| **File** | `components/mobile/task-action-sheet.tsx` |
| **Container** | Vaul `BottomSheet` |
| **Screen coverage** | Partial: `max-h-[85vh]` |
| **Dismiss** | Swipe down, overlay tap |
| **Fields** | None — action buttons only (Edit, Complete, Schedule, Skip, Add subtask, Delete) |
| **Not an editing surface** | Tapping "Edit" opens TaskEditor (Sheet) |

### 1E. DomainGroup inline-add (Dashboard — within domain sections)

| Aspect | Detail |
|--------|--------|
| **File** | `components/task/domain-group.tsx` |
| **Container** | Inline `<input>` within the page flow |
| **Screen coverage** | N/A — embedded in task list |
| **Dismiss** | Escape, blur |
| **Smart input** | Approach B (`useSmartInput`) |
| **Fields** | Input + autocomplete dropdown + metadata pills |

### 1F. SubtaskGhostRow (Dashboard — subtask creation)

| Aspect | Detail |
|--------|--------|
| **File** | `components/task/subtask-ghost-row.tsx` |
| **Container** | Inline `<input>` within task tree |
| **Screen coverage** | N/A — embedded, depth-indented |
| **Dismiss** | Escape, blur |
| **Smart input** | Approach B (`useSmartInput`, no domain tokens) |
| **Fields** | Input + autocomplete + pills (no domain) |

### 1G. TaskDetailPanel (Dashboard right pane — desktop only)

| Aspect | Detail |
|--------|--------|
| **File** | `components/task/task-detail-panel.tsx` |
| **Container** | Inline panel, right 40% of viewport |
| **Mobile?** | **Hidden** — `md:flex` only |
| **Smart input** | Approach A via `TaskFieldsBody` |

### 1H. TaskInspector (Thoughts right pane — desktop only)

| Aspect | Detail |
|--------|--------|
| **File** | `components/task/task-inspector.tsx` |
| **Container** | Inline panel, right 40% of viewport |
| **Mobile?** | **Hidden** — `md:flex` only |
| **Smart input** | Approach B via `useTriageForm` |

---

## 2. Inconsistency Analysis — Why Triage Feels Good and TaskEditor Feels Bad

### 2.1 Container: Drawer vs Full-Screen Sheet

The ThoughtTriageDrawer uses a vaul bottom drawer that covers ~60-70% of the screen. You
can see the page behind it. You swipe down to dismiss. It feels like a quick overlay —
"I'm adding metadata to this thought and moving on."

The TaskEditor uses a Radix Sheet that slides in from the right and takes over the
**entire viewport**. There's no page context visible. Dismissal requires finding the X
button or confirming unsaved changes. It feels like navigating to a separate screen —
"I've left the dashboard to go edit this task."

**Impact**: The drawer's partial coverage creates a sense of "lightweight interaction" that
matches the task of adding/tweaking a few fields. The full-screen sheet signals "complex
form" even when the user just wants to change the due date.

### 2.2 Field Layout: Inline Labels vs Stacked Labels

**Drawer** uses horizontal rows with a fixed-width label column (`w-14` = 56px):
```
Domain   [Work] [Health] [Fitness] ...
Impact   [!1] [!2] [!3] [!4]
When     [Today] [Tomorrow] [Next Mon] [📅]
```

**Editor** uses vertical stacking — label on top, field below, with `space-y-4` gaps:
```
Domain
[Work] [Health] [Fitness] ...

Impact
[!1] [!2] [!3] [!4]

When
[Today] [Tomorrow] [Next Mon] [📅]
```

**Impact**: The drawer shows 5-6 fields without scrolling. The editor shows 3-4 at most.
On a 932px iPhone viewport, this is the difference between "everything at a glance" and
"scroll to find the save button." The stacked layout is appropriate for desktop (where
vertical space is abundant) but wastes ~40% of available height on mobile.

### 2.3 Vertical Spacing: 8px vs 16px

Drawer uses `space-y-2` (8px) between field rows. Editor uses `space-y-4` (16px) between
`EditorFieldRow` wrappers, plus internal `space-y-1.5` (6px) for label-to-field gaps.
Combined, each editor field row consumes ~22px more vertical space than its drawer
counterpart.

### 2.4 Calendar Interaction: Nested Drawer vs Popover

The drawer opens date pickers as **nested vaul drawers** (`Drawer.NestedRoot`). These
slide up from the bottom, are touch-native, and dismiss with a swipe.

The editor uses a **Radix Popover** that floats above the field. On mobile, popovers can:
- Clip against the viewport edge
- Require precise tap targeting to dismiss
- Fight with the virtual keyboard for screen real estate

### 2.5 Save/CTA Accessibility

The drawer has a **sticky footer** with the primary action button always visible:
```tsx
<div className="border-t bg-background px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
```

The editor's Save button is at the **bottom of the scrollable content**. On first open,
it's below the fold. The user must scroll past all fields to find it. There's no sticky
footer.

### 2.6 Dismiss Friction

- **Drawer**: Swipe down from anywhere in the drag zone → instant dismiss (no confirm)
- **Editor**: X button → `window.confirm()` if dirty → blocks with a native dialog

The editor's dismiss guard is appropriate for edits with unsaved changes, but the friction
applies even when opening the editor to *read* a task (no changes made, `dirty=false`).
Even then, the only dismiss mechanism is the small X button — no swipe gesture.

### 2.7 Visual Chrome

- **Drawer**: 6px drag handle, sr-only title, no description → content starts immediately
- **Editor**: SheetHeader with "Edit Task" title, "Update the task details below"
  description, close button → ~60px of chrome before the first field

---

## 3. Proposal: Bring Tasks Mobile Editing to Triage-Drawer Quality

### 3.1 Replace Sheet with Bottom Drawer on Mobile

**What**: When `handleEditTask` is called on mobile (< md breakpoint), instead of opening
the Radix Sheet, open a vaul `Drawer.Root` similar to `ThoughtTriageDrawer`.

**Why**: The bottom drawer is the established mobile pattern in this app (action sheet,
triage drawer, nested pickers). Switching the task editor to a drawer creates consistency
and matches iOS native patterns.

**How**: Create a new `TaskEditDrawer` component (or make `TaskEditor` responsive) that:
- Uses `Drawer.Root` with `max-h-[90vh]` (slightly taller than triage's 85vh to fit more
  fields)
- Renders a compact version of the task fields (see 3.2)
- Has a sticky footer with Save + action buttons
- Uses nested drawers for calendar and parent picker

**Alternative considered**: Making `TaskEditor` detect mobile and switch its container. This
is simpler but mixing Sheet and Drawer logic in one component creates complexity. A
dedicated `TaskEditDrawer` is cleaner.

### 3.2 Compact Field Layout for Mobile

**What**: Create a `compact` layout variant for task fields — inline labels, tighter
spacing, no redundant chrome.

**Two approaches**:

#### Option A: Reuse `TaskFieldsBody` with a `compact` prop

Add a `compact?: boolean` prop to `TaskFieldsBody`. When true:
- `FieldRow` renders inline: `flex items-center gap-2` with `w-14` label
- Spacing drops from `space-y-4` to `space-y-2`
- Notes textarea starts at 1 row (not 3)
- Calendar opens nested drawer instead of popover

**Pro**: One component, two layouts. Changes to fields propagate to both.
**Con**: Conditional branching in one component can get messy. The drawer's label
layout (`flex items-center gap-2` with `w-14` span) is quite different from the
editor's `FieldRow` (`div.space-y-1.5` with `<Label>`).

#### Option B: Drawer builds its own field layout (like triage does today)

The `TaskEditDrawer` renders fields directly using the same field picker components
(`DomainChipRow`, `ImpactButtonRow`, etc.) with inline-label layout, identical to
how `ThoughtTriageDrawer` does it today.

**Pro**: Each layout is explicit and readable. The drawer can optimize for mobile
without affecting the desktop panel.
**Con**: Field additions require changes in two places (drawer + panel).

**Recommendation**: **Option B**. The triage drawer already demonstrates this pattern
successfully. The field picker components (`DomainChipRow`, `ImpactButtonRow`, etc.)
are already shared — it's only the *layout shell* that differs. Adding a field means
adding one `<div className="flex items-center gap-2">` row — trivial.

### 3.3 Quick Edit vs Full Edit

**Not recommended for now.** The triage drawer already shows that you can fit all fields
into a partial-height drawer without scrolling issues. A "quick edit" mode (title + domain
+ impact only) would add UI complexity (a "show more" toggle, two states to manage) for
minimal benefit.

If future fields are added and the drawer gets too tall, *then* consider progressive
disclosure (e.g., collapsible "Advanced" section for recurrence, clarity, duration).

### 3.4 Smart Input Approach

The new `TaskEditDrawer` should use **Approach A** (token consumption) for consistency
with the existing edit behavior:
- When editing an existing task, tokens in the title are consumed and pushed to field
  setters. This matches the desktop `TaskDetailPanel` behavior.
- Field buttons provide persistent visual feedback, so flash-and-consume is appropriate.
- Approach B is designed for creation-only surfaces where raw text is the source of truth.
  An edit surface needs independent field state.

For *create* mode on mobile (triggered by FAB → "New Task"), the drawer should still
use Approach A since field buttons are visible. Quick Add (Approach B) remains available
for speed-focused creation.

### 3.5 Inline-Add Surfaces (DomainGroup, SubtaskGhostRow)

These are **fine on mobile**. They use inline `<input>` elements within the page flow,
which is the right pattern for quick single-field creation. The smart input pills appear
below the input, and autocomplete drops down.

**One improvement**: On mobile, the inline-add input can get obscured by the virtual
keyboard. Consider adding `scrollIntoView({ block: "center" })` when the input focuses
to ensure it's visible above the keyboard.

### 3.6 Sticky Footer Pattern

The new drawer must have a sticky footer like the triage drawer:

```tsx
<div className="border-t bg-background px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]
               flex items-center gap-2">
  {/* Edit mode: Complete + Delete + Save */}
  {/* Create mode: Create Task button */}
</div>
```

This ensures the primary CTA is always reachable without scrolling.

### 3.7 Dismiss Pattern

- **Create mode**: Swipe down dismisses immediately (no unsaved changes guard for empty
  forms). If the user has typed a title, show a lightweight "Discard?" confirmation.
- **Edit mode**: Swipe down dismisses. If `dirty`, intercept `onOpenChange` and show
  confirm before closing (same as current editor, but triggered by swipe too).

---

## 4. iOS PWA Constraint Check

The proposal uses vaul `Drawer.Root` which renders with `position: fixed` on the
**overlay and drawer content** — not on page containers. This is safe:

| Rule | Status |
|------|--------|
| No `overflow: hidden` on html/body | **OK** — Vaul doesn't set overflow on root elements |
| No `position: fixed` on page containers | **OK** — The drawer is a portal overlay, not a page container. The dashboard page itself stays `position: static` |
| No `100dvh` for page heights | **OK** — Drawer uses `max-h-[90vh]` for its own sizing, not for the page. Could optionally use `var(--app-height)` × 0.9 for extra safety, but `vh` on overlays is fine since the overlay isn't the page container |
| `safe-area-inset-bottom` padding | **Required** — Footer must use `pb-[max(0.625rem,env(safe-area-inset-bottom))]` (already done in triage drawer) |

**Additional check**: vaul sets `body { pointer-events: none }` when open (to prevent
background interaction). Verify this doesn't trigger the iOS viewport shrink. The triage
drawer already uses vaul without issues, so this should be safe.

---

## 5. Implementation Sketch

### New component: `TaskEditDrawer`

```
frontend/src/components/task/task-edit-drawer.tsx
```

**Responsibilities**:
- Vaul `Drawer.Root` with `max-h-[90vh]`, `repositionInputs={false}`
- Drag handle + sr-only title
- Compact field layout (inline labels, `space-y-2`)
- Uses `useTaskForm` for all state + save/delete logic (same as current TaskEditor)
- Uses `useSmartInputConsumer` (Approach A) for title parsing
- Nested drawers for calendar + parent picker
- Sticky footer: Save + Complete/Delete (edit mode) or Create (create mode)
- Safe-area-bottom padding

### Dashboard integration change

In `dashboard.tsx`, change `handleEditTask` and `handleNewTask`:

```tsx
// Mobile: open drawer instead of sheet
const [drawerTask, setDrawerTask] = useState<TaskResponse | null>(null);
const [drawerOpen, setDrawerOpen] = useState(false);

const handleEditTask = useCallback((task: TaskResponse) => {
  if (window.matchMedia(MD_QUERY).matches) {
    selectTask(task.id);           // Desktop: inline panel
  } else {
    setDrawerTask(task);           // Mobile: bottom drawer
    setDrawerOpen(true);
  }
}, [selectTask]);
```

### What stays the same

- `TaskEditor` Sheet — still used as the desktop fallback and can be removed later
  if `TaskDetailPanel` fully replaces it
- `TaskFieldsBody` — still used by `TaskDetailPanel` (desktop)
- `TaskQuickAdd` — unchanged, serves a different purpose
- `TaskActionSheet` — unchanged, "Edit" action now opens drawer instead of sheet
- All field picker components — shared between all surfaces

### Migration path

1. Build `TaskEditDrawer` with same fields as current `TaskEditor`
2. Wire it into dashboard for mobile (< md)
3. Test on iPhone PWA: verify drawer works, fields fit, keyboard doesn't obscure
4. Remove `TaskEditor` Sheet usage on mobile (keep for any remaining desktop uses, or
   remove entirely if `TaskDetailPanel` covers all desktop edit flows)

---

## 6. Summary

| Surface | Current | Proposed | Change |
|---------|---------|----------|--------|
| **Task edit (mobile)** | Full-screen Sheet | Bottom drawer | **Replace** |
| **Task create (mobile)** | Full-screen Sheet | Bottom drawer | **Replace** |
| **Task quick add** | Dialog | Dialog | No change |
| **Thought triage (mobile)** | Bottom drawer | Bottom drawer | No change |
| **Task action sheet** | Bottom sheet | Bottom sheet | No change |
| **Inline-add (domain)** | Inline input | Inline input | No change |
| **Inline-add (subtask)** | Inline input | Inline input | No change |
| **Task edit (desktop)** | Right pane panel | Right pane panel | No change |

The core change is one new component (`TaskEditDrawer`) and one integration point
(dashboard mobile flow). Field picker components are already shared and require no changes.
