---
version: v0.55.59
pr:
created: 2026-02-28
---

# Unified Task Editor: Smart Input + Structured Fields Convergence

## Problem

Three surfaces handle task metadata with divergent UX:

| Surface | Trigger | Container | Smart Input | Structured Fields | Mode |
|---|---|---|---|---|---|
| Task Quick Add | `Q` / FAB | Dialog (centered) | Yes | No | Create |
| Task Editor | `e` / pencil | Sheet (right slide) | No | Yes | Create + Edit |
| Thought Triage | click thought | Inspector (desktop) / Drawer (mobile) | Yes | Yes | Convert |

A user who triages a thought (smart input + field buttons) encounters a completely
different UX when they later edit the same task (form-only, different controls,
different field set). The triage inspector is missing editor fields (recurrence, time,
custom duration, description textarea). The editor is missing triage interactions
(smart input, toggle-off, domain auto-sync, chip-based pickers).

## Goal

Converge all three surfaces to share the same field set, controls, and interaction
patterns — rendered in containers appropriate to their context.

The triage inspector is the design target: it already combines smart input with
structured field pickers. The editor should adopt this pattern, and the triage
should gain the editor's missing fields.

---

## Design Decisions

### D1: Smart input in the editor uses "token consumer" model

The triage inspector treats raw text as the source of truth — all field state is
derived from parsing the text (**Approach B**). The editor cannot do this because
existing tasks have clean titles without tokens.

The editor uses **Approach A** ("token consumer"):

- Title field accepts smart input tokens as a secondary input method
- When a token is detected (e.g., user types `!high`), it:
  1. Updates the corresponding field `useState` value
  2. Strips the token from the title text
  3. Flashes the affected field button as visual confirmation
- Clicking field buttons directly updates state (no tokens injected into title)
- Title remains clean — tokens are transient accelerators, not persisted

This matches Todoist's behavior: natural language works in the title field, but the
title stays clean after parsing.

```
TRIAGE (Approach B — raw text is source of truth):
  rawInput = "Fix bug #work !high 30m"
  parsed.title = "Fix bug"          ← derived from raw
  parsed.domainId = 1               ← derived from raw
  Button click → tapToken() → modifies rawInput → reparse

EDITOR (Approach A — field state is source of truth):
  displayTitle = "Fix bug"          ← clean, tokens stripped on detection
  fieldState.domainId = 1           ← independent useState
  Token typed → detect → update fieldState + strip from title
  Button click → update fieldState directly
```

### D2: Quick Add stays separate

Quick Add is a fast-capture surface (keyboard shortcut, minimal UI, "keep open" mode
for batch entry). The editor is a full-refinement surface. They serve different
workflow moments:

- **Quick Add** = capture the thought fast, hit Enter, gone
- **Editor** = see all fields, adjust carefully, save

Quick Add keeps its current design. The editor gains smart input independently.

### D3: Shared field components are the convergence mechanism

Extract/reuse these components across all surfaces in `field-pickers.tsx`:

| Component | Status | Used By |
|---|---|---|
| `<DomainChipRow>` | Exists | Triage → also Editor |
| `<ImpactButtonRow>` | Exists | Triage → also Editor |
| `<ScheduleButtonRow>` | Exists | Triage → also Editor |
| `<ClarityChipRow>` | NEW (extract from inline code) | Both |
| `<DurationPickerRow>` | NEW (presets + custom input) | Both |
| `<TimePickerField>` | NEW (progressive disclosure) | Both |
| `<RecurrencePresetRow>` | NEW, Phase 3 (preset chips) | Triage |

### D4: Editor surface evolves from Sheet to inline panel (Phase 4)

Currently the editor is a Sheet (slides from right, overlay). The triage inspector is
an inline panel in a split layout. For full unification, the dashboard should adopt a
split layout matching the thoughts page, with the editor as an inline right panel.

This is a layout-level change independent of field/control convergence — Phase 4.

### D5: Triage gains editor fields via progressive disclosure

New fields in triage use progressive disclosure to avoid slowing down the core flow:

- **Description**: collapsible textarea, 1-row placeholder, expands on focus
- **Time**: appears only when a scheduled date is set
- **Recurrence presets**: compact chip row, no custom builder (Phase 3)
- **Custom duration**: small number input after preset chips

---

## Field Convergence Table

| Field | Editor (current) | Triage (current) | Unified Target | Direction |
|---|---|---|---|---|
| Title | `<Input>` plain | `<textarea>` smart input | Smart input both (Approach A in editor, B in triage) | Triage → Editor |
| Description | `<Textarea>` 3 rows | `//notes` token only | Explicit textarea + `//` shortcut | Editor → Triage |
| Domain | `<Select>` dropdown | `<DomainChipRow>` chips | `<DomainChipRow>` everywhere | Triage → Editor |
| Parent | Dropdown, immediate-apply | Popover/drawer, search, smart grouping | Smart grouping everywhere | Triage → Editor |
| Impact | Inline `<Button>` row | `<ImpactButtonRow>` shared | `<ImpactButtonRow>` everywhere | Triage → Editor |
| Clarity | Inline buttons (label: "Mode") | Colored chips (label: "Clarity") | NEW `<ClarityChipRow>`, label: "Clarity" | Both adopt shared |
| Duration | Presets + custom input | Presets only | NEW `<DurationPickerRow>` (presets + custom) | Editor → Triage |
| Schedule | `<Input type="date">` + "Today" | `<ScheduleButtonRow>` | `<ScheduleButtonRow>` everywhere | Triage → Editor |
| Time | `<Input type="time">` | Not available | NEW `<TimePickerField>` (when date set) | Editor → Triage |
| Recurrence | Toggle + full `<RecurrencePicker>` | Not available | Editor: full picker. Triage: preset chips (Phase 3) | Editor → Triage |
| Complete/Reopen | `<Button>` | N/A | Editor-only | No change |

---

## Interaction Parity

| Pattern | Direction | Phase |
|---|---|---|
| Smart input in title (Approach A) | Triage → Editor | 1 |
| Toggle-off (click active to deselect) | Triage → Editor | 1 |
| Domain auto-sync + flash on parent change | Triage → Editor | 2 |
| `<ScheduleButtonRow>` replacing date input | Triage → Editor | 1 |
| `<DomainChipRow>` replacing Select | Triage → Editor | 1 |
| Description textarea | Editor → Triage | 1 |
| Custom duration input | Editor → Triage | 1 |
| Time picker (progressive) | Editor → Triage | 1 |
| Recurrence presets | Editor → Triage | 3 |

---

## Layouts

### Desktop Inspector (Triage) — Unified

```
┌───────────────────────────────────────────┐
│                                           │
│  ┌───────────────────────────────────────┐│
│  │ Call dentist about crown              ││  smart input textarea
│  └───────────────────────────────────────┘│
│                                           │
│  Domain   [💼 Work] [🏠 Life] [❤️ Health] │
│  Parent   [ None (top-level)          ▾ ] │
│  Impact   [ High ][ Mid  ][ Low  ][ Min ] │
│  Clarity  [Autopilot] [Normal] [Brainstorm]│
│  Duration [15m][30m][ 1h][ 2h][ 4h] [__]m │
│  When     [Today] [Tomorrow] [📅 Mar 3]   │
│  Time     [ ── : ── ]   ← when date is set│
│                                           │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│  Notes                                    │
│  ┌───────────────────────────────────────┐│
│  │ Add notes...                          ││  collapsible
│  └───────────────────────────────────────┘│
│                                           │
├───────────────────────────────────────────┤
│  [🗑 Delete]            [Convert to Task] │
└───────────────────────────────────────────┘
```

### Mobile Drawer (Triage) — Unified

```
╭───────────────────────────────────╮
│            ━━━━━━━━━━             │  drag handle
│                                   │
│  ┌───────────────────────────────┐│
│  │ Call dentist #health !mid 30m ││  smart input
│  └───────────────────────────────┘│
│                                   │
│  Domain [💼 Work][🏠 Life][❤️ H → │  horizontal scroll
│  Parent [ None (top-level)     ▾] │  nested drawer
│  Impact [  High ][  Mid ][ Low ]… │
│  Clarity [Auto] [Normal] [Brain]  │
│  Duration [15m][30m][1h][2h][4h]  │
│           [___]m                  │  custom input
│  When   [Today][Tmrw][📅]         │  calendar nested drawer
│  Time   [ ── : ── ]              │  when date is set
│                                   │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│  Notes                            │
│  ┌───────────────────────────────┐│
│  │ Add notes...                  ││  collapsible
│  └───────────────────────────────┘│
│                                   │
├───────────────────────────────────┤
│  [🗑 Delete]     [Convert to Task]│  safe-area bottom
╰───────────────────────────────────╯
```

### Task Editor Sheet — After Convergence (Phase 1)

```
┌───────────────────────────────────┐
│  Edit Task                    [×] │
├───────────────────────────────────┤
│                                   │
│  ┌───────────────────────────────┐│
│  │ Call dentist about crown      ││  smart input (Approach A)
│  └───────────────────────────────┘│  tokens consumed, title stays clean
│                                   │
│  Domain  [💼 Work][🏠 Life][❤️ H] │  was <Select>
│  Parent  [ Daily routines     ▾ ] │
│  Impact  [ High ][ Mid ][ Low ]…  │  ImpactButtonRow
│  Clarity [Auto][Normal][Brainstor]│  ClarityChipRow (was "Mode")
│  Duration [15m][30m][1h][2h][4h]  │
│           [___]m                  │
│  When    [Today][Tmrw][📅 Mar 3]  │  was <input type="date">
│  Time    [ 14 : 00 ]             │
│                                   │
│  ── Repeat ────────────────────── │
│  [toggle] → RecurrencePicker      │
│                                   │
│  Notes                            │
│  ┌───────────────────────────────┐│
│  │ Dr. Smith, 555-1234           ││
│  │ mention insurance             ││
│  └───────────────────────────────┘│
│                                   │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│  Created: Feb 28 · Completed: —  │
│  [✓ Complete]        [Save] [🗑]  │
└───────────────────────────────────┘
```

### Dashboard — Future State (Phase 4: Split Layout)

```
┌──────────────────────────────────────────────────────────────────┐
│  Dashboard                                            [Q]  [?]  │
│ ┌──────────────────────────┬─────────────────────────────────────┐
│ │                          │                                     │
│ │  ☐ Call dentist          │  ┌─────────────────────────────────┐│
│ │  ☐ Fix login timeout  ←  │  │ Fix login timeout              ││
│ │  ☐ Water the plants     │  └─────────────────────────────────┘│
│ │  ☐ Weekly planning       │                                     │
│ │                          │  Domain  [💼 Work] [🏠 Life]        │
│ │                          │  Parent  [ Backend tasks      ▾ ]   │
│ │                          │  Impact  [High][Mid][Low][Min]      │
│ │                          │  Clarity [Auto][Normal][Brain]      │
│ │                          │  Duration [15m][30m][1h][2h] [__]m  │
│ │                          │  When    [Today][Tmrw][📅]          │
│ │                          │  Time    [ 14:00 ]                  │
│ │                          │  Repeat  [toggle → picker]          │
│ │                          │                                     │
│ │                          │  Notes                              │
│ │                          │  ┌─────────────────────────────────┐│
│ │                          │  │ Check JWT expiration logic      ││
│ │                          │  └─────────────────────────────────┘│
│ │                          │                                     │
│ │                          │  [✓ Complete]        [Save]  [🗑]   │
│ └──────────────────────────┴─────────────────────────────────────┘
└──────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Smart Input + Missing Fields (Core Unification)

The highest-impact changes: bring smart input to the editor, bring missing fields
to triage, and converge on shared field components.

**1.1 — Extract shared field components**

New components in `field-pickers.tsx`:

- `<ClarityChipRow>` — extract from inspector/drawer inline code
  - 3 colored chips (Autopilot/Normal/Brainstorm)
  - Dashed-border default hint, toggle-off, responsive sizing
- `<DurationPickerRow>` — extract + extend
  - Preset chips (15m/30m/1h/2h/4h) + optional custom `<Input type="number">`
  - Toggle-off, custom value 1–1440, responsive sizing
- `<TimePickerField>` — new component
  - `<Input type="time">`, renders only when `scheduledDate` is set
  - Progressive disclosure: hidden when no date, visible when date selected

Prerequisite for subsequent steps — no user-facing UX change yet.

**1.2 — Add missing fields to triage (inspector + drawer)**

- **Description textarea**:
  - Collapsible `<textarea>`, 1-row default with "Add notes..." placeholder
  - Expands to 3 rows on focus
  - Pre-populated from `parsed.description` (the `//notes` token)
  - Independently editable — direct typing updates description state
  - `//notes` shortcut continues working in smart input title
- **Custom duration**: use `<DurationPickerRow>` from 1.1
- **Time picker**: use `<TimePickerField>` from 1.1
  - Desktop: inline row below schedule
  - Mobile: full-width row, native time picker
- **Update `ConvertData`**: ensure `scheduled_time` and `description` flow through
  (the type already has these fields — verify the UI passes them)

**1.3 — Add smart input to task editor (Approach A)**

- Replace title `<Input>` with `<textarea>` (auto-resize, matching inspector)
- Create `useSmartInputConsumer` hook (new file: `use-smart-input-consumer.ts`):
  - Runs `parseTaskInput()` on every keystroke
  - Compares current parse against previous parse
  - When NEW token detected: calls field-specific setter, strips token from title,
    returns flash target for visual confirmation
  - Does NOT keep tokens in the raw text — they're consumed immediately
  - Returns `{ titleRef, handleTitleChange, flashTarget }`
  - Field state remains in editor's own `useState` calls
- Wire `<SmartInputAutocomplete>` to the editor title field
- Show syntax hint below title (dismissible, same as Quick Add) — helps users
  discover that smart input works here too

**1.4 — Adopt shared components in editor**

- Domain: `<Select>` → `<DomainChipRow>`
- Impact: inline buttons → `<ImpactButtonRow>`
- Clarity: inline buttons → `<ClarityChipRow>` (rename label "Mode" → "Clarity")
- Schedule: `<Input type="date">` → `<ScheduleButtonRow>`
- Duration: inline presets → `<DurationPickerRow>`
- All pickers: add toggle-off (click active value to deselect)

### Phase 2: Interaction Polish

**2.1 — Domain auto-sync in editor**
- Parent picker selects parent from different domain → auto-switch domain + flash
- Backport flash animation from inspector

**2.2 — Parent picker improvements**
- Smart grouping (same-domain parents first) in editor's `<ParentTaskPicker>`
- Add search to editor's parent picker

**2.3 — Toggle-off audit**
- Verify every field picker in both surfaces supports click-to-deselect
- Impact, clarity, duration presets, schedule buttons, domain chips

### Phase 3: Recurrence in Triage

**3.1 — Create `<RecurrencePresetRow>` shared component**
- Chip buttons: None / Daily / Weekdays / Weekly / Monthly / Custom
- "Custom" opens full `<RecurrencePicker>` in popover (desktop) / nested drawer (mobile)
- Selecting a preset generates the corresponding `RecurrenceRule`

**3.2 — Add to triage inspector + drawer**
- New field row between Time and Notes
- Extend `ConvertData` with `is_recurring`, `recurrence_rule`, `recurrence_start`

### Phase 4: Surface Unification (Dashboard Split Layout)

**4.1 — Dashboard split layout (desktop)**
- Two-pane layout matching the thoughts page structure
- Left: task list (scrollable)
- Right: task detail panel (inline, always visible when task selected)
- Clicking a task opens detail in right panel (replaces Sheet)
- `e` / Enter focuses the right panel
- Empty state: "Select a task to view details"

**4.2 — Extract shared `<TaskFieldsBody>` component**
- Contains all field rows, smart input, notes, and field pickers
- Props: field values, onChange handlers, mode (`"edit" | "create" | "convert"`)
- Mode controls visibility:
  - `"edit"`: all fields + Save/Complete/Delete + recurrence full picker
  - `"create"`: all fields + Create + recurrence full picker
  - `"convert"`: all fields + Convert to Task + recurrence presets only
- Each surface wraps `<TaskFieldsBody>` in its container (panel, sheet, drawer)

**4.3 — Mobile editor surface**
- Dashboard task editing on mobile: Vaul bottom drawer (matching triage mobile)
- Uses same `<TaskFieldsBody>` component

---

## Files Impacted

### Phase 1

| File | Change |
|---|---|
| `frontend/src/components/task/field-pickers.tsx` | Add `ClarityChipRow`, `DurationPickerRow`, `TimePickerField` |
| `frontend/src/hooks/use-smart-input-consumer.ts` | NEW — Approach A hook for editor |
| `frontend/src/components/task/task-editor.tsx` | Major refactor: smart input + shared components |
| `frontend/src/components/task/task-inspector.tsx` | Add description textarea, custom duration, time |
| `frontend/src/components/task/thought-triage-drawer.tsx` | Add description textarea, custom duration, time |
| `frontend/src/components/task/smart-input-autocomplete.tsx` | May need minor adjustments for editor context |

### Phase 4

| File | Change |
|---|---|
| `frontend/src/routes/_authenticated/dashboard.tsx` | Split layout |
| `frontend/src/components/task/task-fields-body.tsx` | NEW — shared field layout component |
| `frontend/src/components/task/task-editor.tsx` | Refactor to use `TaskFieldsBody` |
| `frontend/src/components/task/task-inspector.tsx` | Refactor to use `TaskFieldsBody` |
| `frontend/src/components/task/thought-triage-drawer.tsx` | Refactor to use `TaskFieldsBody` |

---

## Out of Scope

- Quick Add redesign — stays as-is (separate fast-capture surface)
- Complete/Reopen in triage — N/A (thoughts aren't tasks yet)
- Batch complete past instances in triage — N/A (no recurring thoughts)
- Full custom recurrence builder in triage — Phase 3 covers presets only
- Metadata timestamps in triage — informational, not useful during conversion
