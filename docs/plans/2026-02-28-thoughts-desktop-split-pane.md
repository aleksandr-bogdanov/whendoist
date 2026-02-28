---
version: v0.55.56
pr: 549
created: 2026-02-28
---

# Thoughts Page Desktop Redesign: Split-Pane with Inspector

## Context

The Thoughts page currently reuses mobile patterns on desktop: narrow centered column
(max-w-2xl in a 1200px shell), Vaul bottom-sheet for triage, no hover actions, no
keyboard navigation, and a glassmorphic sub-header unique to this page. The result
feels like a stripped mobile view, not a desktop app.

**Goal:** Redesign desktop layout as a master-detail split pane with a right-side
inspector panel for triaging thoughts, matching the dashboard's established pattern.
Mobile UX stays completely unchanged.

## Files

| Action | File | Purpose |
|--------|------|---------|
| **Create** | `frontend/src/components/task/task-inspector.tsx` | Desktop right-pane inspector (triage form + empty state) |
| **Modify** | `frontend/src/routes/_authenticated/thoughts.lazy.tsx` | Split-pane layout, selection state, keyboard nav, upgraded ThoughtCard |
| **Unchanged** | `frontend/src/components/task/thought-triage-drawer.tsx` | Stays as-is for mobile |
| **Unchanged** | `frontend/src/components/task/field-pickers.tsx` | Already shared, reused by inspector |

## Implementation Steps

### Step 1: Create `TaskInspector` component

New file: `frontend/src/components/task/task-inspector.tsx`

**Structure:**
```
TaskInspector
├── Empty state (when thought === null)
│   └── Centered icon + "Select a thought to triage" + keyboard hint
├── InspectorBody (when thought !== null, keyed by thought.id)
│   ├── useSmartInput (same as DrawerBody — title parsing, tokens)
│   ├── Title textarea (auto-resize, clean display title)
│   ├── Field rows (same visual as triage drawer):
│   │   ├── Domain → DomainChipRow (from field-pickers.tsx)
│   │   ├── Parent → button that opens Popover (not nested drawer)
│   │   ├── Impact → ImpactButtonRow (from field-pickers.tsx)
│   │   ├── When → ScheduleButtonRow + CalendarPopover
│   │   ├── Duration → custom duration buttons (same as drawer)
│   │   └── Clarity → custom clarity buttons (same as drawer)
│   └── Footer: Delete (ghost) + Convert to Task (primary)
├── ParentPickerPopover (Radix Popover with search + grouped task list)
└── CalendarPopover (Radix Popover with Calendar component)
```

**Props:**
```typescript
interface TaskInspectorProps {
  thought: TaskResponse | null;
  domains: DomainResponse[];
  parentTasks: TaskResponse[];
  onConvert: (thought: TaskResponse, data: ConvertData) => void;
  onDelete: (thought: TaskResponse) => void;
}
```

**Key patterns:**
- `InspectorBody` remounts per thought via `key={thought.id}` (same as DrawerBody)
- Uses `useSmartInput<HTMLTextAreaElement>` internally (same as DrawerBody)
- Field callbacks use `tapToken` / `clearTokenType` (identical to drawer)
- Parent picker: `<Popover>` with search input + grouped task list (same grouping
  logic as `ParentPickerDrawer` but in a popover, not nested drawer)
- Calendar picker: `<Popover>` wrapping `<Calendar mode="single">` (existing component)
- `ConvertData` type imported from `thought-triage-drawer.tsx` (already exported)
- FieldRow helper: simple `flex items-start gap-3` with label (w-16) + content

### Step 2: Refactor `thoughts.lazy.tsx` — layout and state

**Layout change (desktop):**
```tsx
// Current: single column
<div className="mx-auto w-full max-w-2xl flex-1">...</div>

// New: split pane at md: breakpoint
<div className="flex flex-1 min-h-0 md:gap-1">
  {/* Left pane: thought list */}
  <div className="flex flex-col flex-1 md:flex-[3] min-w-0 min-h-0">
    {/* page heading, scrollable list, input bar */}
  </div>
  {/* Right pane: inspector (desktop only) */}
  <div className="hidden md:flex md:flex-[2] flex-col min-w-0 min-h-0 border-l border-border">
    <TaskInspector ... />
  </div>
</div>
```

**Selection state — two states for two surfaces:**
```typescript
// Desktop inspector selection
const [selectedId, setSelectedId] = useState<number | null>(null);
const selectedThought = useMemo(
  () => selectedId ? sortedThoughts.find(t => t.id === selectedId) ?? null : null,
  [selectedId, sortedThoughts]
);

// Mobile drawer selection (existing, renamed)
const [drawerThought, setDrawerThought] = useState<TaskResponse | null>(null);
```

**Click handler — route to correct surface:**
```typescript
const handleThoughtTap = (thought: TaskResponse) => {
  if (window.matchMedia("(min-width: 768px)").matches) {
    setSelectedId(thought.id); // Desktop: populate inspector
  } else {
    setDrawerThought(thought); // Mobile: open drawer
  }
};
```

**Auto-advance after convert:**
```typescript
const handleConvert = async (thought, data) => {
  const idx = sortedThoughts.findIndex(t => t.id === thought.id);
  const nextId = sortedThoughts[idx + 1]?.id ?? sortedThoughts[idx - 1]?.id ?? null;
  // ... existing mutation logic ...
  onSuccess: () => {
    setSelectedId(nextId); // advance to next thought
    setDrawerThought(null); // close drawer if mobile
    // ... toast, invalidate, etc.
  }
};
```

**Sub-header change:**
- Mobile: keep glassmorphic sticky header (unchanged)
- Desktop: simple non-sticky heading in the left pane

```tsx
{/* Mobile: glassmorphic sticky header */}
<div className="sticky top-0 z-20 px-4 py-3 backdrop-blur-3xl ... md:hidden">
  <h1 className="text-xl font-bold">Thoughts</h1>
  <p className="text-xs text-muted-foreground">...</p>
</div>

{/* Desktop: simple heading */}
<div className="hidden md:block px-5 pt-4 pb-2">
  <h1 className="text-lg font-semibold">Thoughts</h1>
  <p className="text-xs text-muted-foreground mt-0.5">Capture now, organize later</p>
</div>
```

**Input bar desktop styling:**
- Mobile: existing sticky glassmorphic bar (unchanged)
- Desktop: clean border-top docked at bottom of left pane

The existing input div already has `md:` overrides that strip glass effects. Adjust to:
```
md:sticky md:bottom-0 md:border-t md:bg-background md:py-3
```
The glass div inside gets `md:rounded-xl md:bg-transparent md:p-0 md:shadow-none ...`
(already partially done, just needs cleanup to feel intentional with a proper border-top
container rather than invisible glass).

### Step 3: Upgrade `ThoughtCard`

**Selection state (both mobile + desktop):**
```tsx
<div
  data-thought-id={thought.id}
  data-selected={isSelected || undefined}
  className={cn(
    "group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
    "hover:bg-accent/50",
    isSelected && "bg-accent"
  )}
>
```

**Selection indicator bar (desktop):**
Replace the dot indicator with a vertical bar:
```tsx
<div className={cn(
  "hidden md:block w-0.5 h-5 rounded-full shrink-0 transition-colors",
  isSelected ? "bg-primary" : "bg-transparent"
)} />
```

**Hover-reveal actions (desktop):**
```tsx
{/* Hover actions — replace timestamp on hover */}
<div className="hidden md:flex items-center gap-0.5
                opacity-0 group-hover:opacity-100 transition-opacity">
  <button className="p-1 rounded-md hover:bg-accent" title="Delete">
    <Trash2 className="h-3.5 w-3.5 text-destructive/70" />
  </button>
</div>

{/* Timestamp — hide on desktop hover */}
<span className="text-[11px] text-muted-foreground/60 ... md:group-hover:hidden">
  {timeAgo}
</span>
```

**Remove the ChevronDown** — no longer needed (inspector replaces it as the affordance).

### Step 4: Add keyboard navigation

Use the existing `useShortcuts` hook (same pattern as dashboard):

```typescript
const stateRef = useRef({ selectedId, visibleIds, isInspectorFocused });
useEffect(() => {
  stateRef.current = { selectedId, visibleIds, isInspectorFocused };
});

useShortcuts(useMemo(() => [
  { key: "j", description: "Next thought", category: "Navigation",
    excludeInputs: true, handler: () => { /* advance selectedId */ } },
  { key: "k", description: "Previous thought", category: "Navigation",
    excludeInputs: true, handler: () => { /* retreat selectedId */ } },
  { key: "Escape", description: "Deselect", category: "Navigation",
    excludeInputs: false, handler: () => setSelectedId(null) },
  { key: "d", description: "Delete thought", category: "Actions",
    excludeInputs: true, handler: () => { /* delete selected */ } },
  { key: "Backspace", description: "Delete thought", category: "Actions",
    excludeInputs: true, showInHelp: false, handler: () => { /* same */ } },
], [/* deps */]));
```

**Auto-scroll into view (same pattern as dashboard):**
```typescript
useEffect(() => {
  if (!selectedId) return;
  document.querySelector(`[data-thought-id="${selectedId}"]`)
    ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}, [selectedId]);
```

### Step 5: Version bump, changelog, PR

- Bump version in `pyproject.toml`
- Run `uv lock`
- Update `CHANGELOG.md`
- PR title: `v{version}/feat: Desktop split-pane layout for Thoughts page`

## What stays unchanged

- `thought-triage-drawer.tsx` — mobile Vaul drawer, no changes
- `field-pickers.tsx` — shared components, already correct
- `task-editor.tsx` — dashboard Sheet editor, future migration
- `app-shell.tsx`, `header.tsx` — no changes
- All mobile behavior — gated behind `md:` breakpoints
- `TaskSwipeRow` — mobile swipe gestures unchanged

## Verification

1. **Desktop (≥ 768px):** Split pane visible. Click thought → inspector populates.
   j/k navigates. Escape deselects. Delete from hover icon or `d` key. Convert
   advances to next thought. No drawer opens.
2. **Mobile (< 768px):** Exactly same as before. Glassmorphic header, swipe rows,
   tap → bottom drawer, glassmorphic input bar. No inspector visible.
3. **Resize test:** Shrink window below 768px → inspector hides, drawer behavior
   resumes. Expand above 768px → split pane appears.
4. **Triage flow:** Select thought → pick domain → set fields → Convert → auto-advance
   to next thought. Toast shows undo action.
5. **Empty state:** No thoughts → left pane empty state + right pane "select a thought" state.
6. **Parent picker:** Desktop → Popover with search and grouped list. Mobile → nested drawer (unchanged).
7. **Calendar picker:** Desktop → Popover with Calendar. Mobile → nested drawer (unchanged).
8. **Frontend checks pass:** `cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build`
