---
version:
pr:
created: 2026-02-26
---

# Fix: Thoughts triage — inline smart input, remove title duplication

## Context

When a thought is expanded for triage on mobile, the title appears twice: once in the static card row, and again in the TriagePanel's smart input (initialized with `thought.title`). The user sees "Birthday gift ideas for Mom" in the card AND in the input below. Additionally, the separate editing mode (`editingId`/`editText`/`handleSaveEdit`) is now dead code — the pencil edit button was removed, so `editingId` is always null.

## Changes

**File:** `frontend/src/routes/_authenticated/thoughts.lazy.tsx`

### 1. Remove dead editing state

Delete from `ThoughtsPage`:
- `editingId`, `editText` state
- `handleSaveEdit` callback
- All `editingId`/`editText` prop threading to ThoughtCard

Simplify `ThoughtCard` — remove `isEditing`/`editText`/`onEditTextChange`/`onSaveEdit`/`onCancelEdit` props and the `if (isEditing)` branch. It becomes a simple display-only component:

```tsx
function ThoughtCard({ thought, onToggleExpand }: {
  thought: TaskResponse;
  onToggleExpand: () => void;
})
```

Simplify `handleToggleExpand` — remove the `editingId` guard.

### 2. Create `ThoughtTriageCard` component

New function component in the same file. Replaces the separate `ThoughtCard` + `TriagePanel` when expanded. Owns the `useSmartInput()` call, renders inline smart input in the card header row.

**Header row** (replaces static card row):
```
[ChevronUp button] [smart-input ————————————————]
```
- ChevronUp button calls `onCollapse` — replaces the dot indicator
- Smart input is the same `useSmartInput()` input, rendered where the title was
- No timestamp shown (redundant while triaging)
- Autocomplete dropdown renders below the input

**Body** (same as current TriagePanel minus the `<Input>`):
- Metadata pills
- Domain pill buttons (mobile)
- Priority buttons (mobile)
- Schedule quick picks (mobile)
- Syntax hints (desktop)
- Delete + Convert action buttons

Props:
```tsx
interface ThoughtTriageCardProps {
  thought: TaskResponse;
  domains: DomainResponse[];
  onConvert: (thought: TaskResponse, data: { ... }) => void;
  onDelete: (thought: TaskResponse) => void;
  onCollapse: () => void;
}
```

### 3. Update main render loop

```tsx
sortedThoughts.map((thought) => (
  <TaskSwipeRow
    key={thought.id}
    onSwipeLeft={() => handleDelete(thought)}
    leftIcon={Trash2}
    leftColor="red"
    disabled={expandedId === thought.id}
  >
    <div className="border-b border-border/50 overflow-hidden">
      {expandedId === thought.id ? (
        <ThoughtTriageCard
          thought={thought}
          domains={domains}
          onConvert={handleConvert}
          onDelete={handleDelete}
          onCollapse={() => setExpandedId(null)}
        />
      ) : (
        <ThoughtCard
          thought={thought}
          onToggleExpand={() => handleToggleExpand(thought.id)}
        />
      )}
    </div>
  </TaskSwipeRow>
))
```

### 4. Delete `TriagePanel` component

No longer needed — its logic is absorbed into `ThoughtTriageCard`.

## What NOT to change

- `useSmartInput` hook — reuse as-is
- `handleConvert` / `handleDelete` callbacks in ThoughtsPage — unchanged
- Desktop behavior of the triage panel — same selectors/hints, just input position changes
- `SmartInputAutocomplete`, `MetadataPill`, `Kbd` — reuse existing components

## Verification

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```

Manual test at 375px:
1. Tap a thought → triage opens with inline smart input (no title duplication)
2. ChevronUp collapses the panel
3. Type `#Work !high tomorrow` in input → domain/priority/schedule pills appear
4. Tap mobile domain/priority/schedule buttons → tokens inserted
5. "Convert" works when domain is assigned
6. Swipe-to-delete still works on collapsed cards
