# Smart Input: Architecture & Design Decisions

Whendoist's smart input system lets users type metadata tokens inline with the task
title — `Fix login #Work !high 30m tomorrow` — and have them parsed into structured
fields. This document explains the two-hook architecture, why it exists, and why
unification was considered and rejected.

---

## The Mental Model

Tokens are **typing shortcuts**, not data representation. The user's intent when
typing `!high` is "set impact to high" — a faster alternative to clicking the impact
button. Once the intent is captured, the token has no reason to exist in the saved
title. Titles are always stored clean; tokens are always transient.

### Token Types

| Token | Prefix | Example | Ambiguity |
|-------|--------|---------|-----------|
| Domain | `#` | `#Work`, `#Health` | None — `#` never appears accidentally in titles |
| Impact | `!` | `!high`, `!low`, `!p1` | None — `!` prefix is unambiguous |
| Clarity | `?` | `?auto`, `?brain` | None — `?` prefix is unambiguous |
| Duration | *(none)* | `30m`, `1h`, `2h30m` | **High** — `30m` in "Fix 30m timeout bug" |
| Date/time | *(none)* | `tomorrow`, `jan 15 3pm` | **High** — "tomorrow" in "Plan tomorrow's party" |
| Description | `//` | `// some notes` | Low — `//` rarely appears in titles |

**Key insight:** Prefixed tokens (`#`, `!`, `?`) are safe for parsing in any context.
Unprefixed tokens (`30m`, `tomorrow`) are inherently ambiguous and require care in
edit mode.

---

## Two Hooks, Two Jobs

The smart input system uses **two hooks** that share a **single parser**. This is
intentional — they serve different interaction patterns.

### Approach A — Token Consumption (`useSmartInputConsumer`)

**Purpose:** Edit-capable surfaces where field buttons are visible.

**Used by:** `TaskFieldsBody` (shared by TaskEditor sheet + TaskDetailPanel)

**How it works:**
1. User types `Fix login #Work !high` in a plain `<textarea>`
2. Parser detects tokens on every keystroke
3. New tokens are **immediately consumed**: stripped from the title, value pushed to
   the corresponding field setter, 800ms flash animation on the field button
4. Title is always clean — tokens exist for a fraction of a second
5. Field values live in independent `useState` calls managed by `useTaskForm`
6. Clicking a field button updates state directly — title is unaffected

**On save:** Payload assembled from independent field states. Title is already clean.

**On edit (existing task):** Clean title loaded from DB. Fields loaded into state.
New tokens typed by the user are consumed as usual.

**Why this pattern:** Edit surfaces already show field buttons (domain picker, impact
selector, etc.) on screen. The buttons provide persistent visual feedback about
current field values. Flash-and-consume is the right UX here because the user can
see *where the value landed* immediately.

### Approach B — Raw Text as Source of Truth (`useSmartInput`)

**Purpose:** Creation-only surfaces optimized for speed and reversibility.

**Used by:** `TaskQuickAdd`, `useTriageForm` (ThoughtTriageDrawer, TaskInspector)

**How it works:**
1. User types `Fix login #Work !high` in a plain `<input>`
2. Parser runs on every keystroke, extracts metadata
3. **Tokens stay in the raw text** — the input still shows `Fix login #Work !high`
4. Dismissible pills below the input show detected metadata
5. Clicking a pill's X removes the token from raw text
6. `tapToken()` inserts or replaces tokens programmatically (for mobile field pickers)
7. Everything derives from the raw text — no independent field state

**On save:** `parsed.title` (clean, tokens stripped) saved as title. `parsed.impact`
etc. saved as field values. The raw text is never persisted.

**Why this pattern:** Creation surfaces prioritize speed and reversibility. Tokens
stay visible so the user can see exactly what they typed and what the system detected.
Dismissing a false positive is one click on a pill — no need to re-type anything.

### The Shared Parser (`task-parser.ts`)

Both hooks call the same `parseTaskInput()` function. The parser:

- Extracts all token types (domain, impact, clarity, duration, date/time, description)
- Returns `ParsedTaskMetadata` with `title` (clean), field values, and `tokens[]` with
  start/end indices
- Uses **last-wins** semantics: `!high stuff !low` → impact = low, `!high` stays in title
- Handles autocomplete via `getAutocompleteSuggestions()`
- Uses chrono-node for natural language date parsing with false-positive filtering

The parser is the single source of truth for token grammar. Adding a new token type
means changing one file.

---

## Why Two Hooks Instead of One

### The Unification Analysis (March 2026)

We evaluated five options: keep both, unify to A, unify to B, Todoist-style (rich text
inline chips), and B-hybrid (B for creation, A for editing). Three independent LLM
analyses were commissioned. All three agreed on rejecting rich text and the
reconstruction fallacy. Two recommended B-hybrid; one recommended unifying to A.

**The conclusion: keep both hooks.** Here's why:

1. **Edit-mode behavior converges.** Both B-hybrid and "unify to A" propose the same
   edit-mode behavior: clean title from DB, field buttons, baseline-aware parsing,
   immediate consumption of new tokens. The migration would be a complex refactor to
   arrive at identical edit-mode behavior.

2. **The only user-visible change would be marginal.** Migrating editors from A → B
   would make tokens visible during creation in the editor sheet. But the editor is
   primarily an editing surface. Quick Add (the primary creation surface) already uses
   B-style pills. The UX improvement on a secondary creation path doesn't justify the
   risk.

3. **Two-hook coordination is harder than two separate hooks.** A unified hook would
   need to manage both raw-text-as-SOT (creation) and independent field state (editing),
   requiring a mode parameter and branching logic throughout. The `useTaskForm` hook
   manages non-token fields (recurrence, parent task, dirty tracking, save mutations)
   that `useSmartInput` doesn't handle. Bridging them creates the same callback wiring
   that already exists — just in a different shape.

4. **Total complexity doesn't decrease.** Going from two focused hooks to one dual-mode
   hook moves complexity rather than removing it. Each hook currently does one thing
   well. The parser is already shared. Adding a new token type requires changes in one
   parser file, one callback in the consumer, and one pill in Quick Add — not "shipping
   every improvement twice."

5. **The status quo is clean.** After the v0.55.67 consolidation, the architecture is
   well-factored: shared parser, shared autocomplete, shared pill components. The two
   hooks are focused, stable, and well-understood. The maintenance burden is low.

### The Todoist Reference (Why We Don't Do Rich Text)

Todoist uses `contenteditable` with inline colored chips and "active typing detection"
(existing text is inert; fresh keystrokes trigger parsing). This provides elegant UX
but requires:

- A rich text editor framework (ProseMirror, Tiptap, or Slate)
- Complex AST serialization and cursor management
- Cross-browser clipboard handling
- Significant bundle size increase

Our app uses plain `<input>` and `<textarea>` elements. The engineering cost of rich
text is disproportionate to the benefit. Pills below the input provide sufficient
visual feedback for token detection.

---

## Edit-Mode Safety: The Baseline Problem

### The Problem

When editing a task titled `Fix 30m timeout bug` (where `30m` is part of the title,
not a duration token), the parser would detect `30m` as a 30-minute duration and
consume it — silently changing the title to `Fix timeout bug` and setting duration=30.

### How Each Approach Handles It

**Approach A (current):** `prevParseRef` starts as `null`. The parser only runs on
`onChange` events (user typing), not on mount. So the initial title loaded from DB is
never parsed. The first keystroke triggers `processTitle`, which compares against
`prevParseRef` to detect "new" tokens. However, since `prevParseRef` is `null` on the
first call, any token-like text in the existing title would be treated as new.

**In practice this works** because titles are stored clean (tokens were stripped during
creation). But it's fragile — tasks created through inline-add (no smart input),
imported from external sources, or containing coincidental token-like text could
trigger false positives on the first edit.

**The fix: baseline seeding.** Parse the initial title on mount and seed `prevParseRef`
with the result. Any token that was already present in the initial title is treated as
"previously seen" and won't be consumed. This makes the protection intentional rather
than accidental.

```typescript
// Seed prevParseRef with baseline so existing tokens aren't consumed
if (initialTitle) {
  prevParseRef.current = parseTaskInput(initialTitle, domains);
}
```

**Approach B:** Never used for editing. If it were, the same baseline approach would
apply — parse the initial title, mark detected tokens as inert, only show pills for
newly typed tokens.

### False Positive Risk by Token Type

| Token type | Risk in edit mode | Mitigation |
|------------|-------------------|------------|
| `#domain` | None | `#` prefix never appears accidentally |
| `!impact` | None | `!` prefix never appears accidentally |
| `?clarity` | None | `?` prefix never appears accidentally |
| `30m` duration | **Real** | Baseline seeding — if `30m` was in the initial title, it's inert |
| `tomorrow` date | **Real** | Baseline seeding — if `tomorrow` was in the initial title, it's inert |
| `// description` | Low | `//` rarely appears in titles; URL-safe (requires preceding whitespace) |

---

## File Map

### Hooks

| File | Approach | Used By |
|------|----------|---------|
| `hooks/use-smart-input.ts` | B (raw text SOT) | TaskQuickAdd, useTriageForm |
| `hooks/use-smart-input-consumer.ts` | A (token consumption) | TaskFieldsBody |
| `hooks/use-triage-form.ts` | B (wraps useSmartInput) | ThoughtTriageDrawer, TaskInspector |
| `hooks/use-task-form.ts` | A (field state + save logic) | TaskEditor, TaskDetailPanel |
| `hooks/use-task-create.ts` | N/A (mutation wrapper) | QuickAdd, DomainGroup, SubtaskGhostRow |

### Components

| Component | Smart Input | Create/Edit |
|-----------|------------|-------------|
| `task-quick-add.tsx` | Approach B | Create only |
| `task-editor.tsx` | Approach A (via TaskFieldsBody) | Create + Edit |
| `task-detail-panel.tsx` | Approach A (via TaskFieldsBody) | Edit only |
| `task-fields-body.tsx` | Approach A (owns the consumer) | Both (stateless) |
| `thought-triage-drawer.tsx` | Approach B (via useTriageForm) | Create only |
| `task-inspector.tsx` | Approach B (via useTriageForm) | Create only |
| `domain-group.tsx` | Approach B | Create only |
| `subtask-ghost-row.tsx` | Approach B | Create only |

### Parser

| File | Purpose |
|------|---------|
| `lib/task-parser.ts` | Pure parser: `parseTaskInput()`, token patterns, autocomplete |

---

## Adding a New Token Type

1. **`task-parser.ts`** — Add the regex pattern, extraction logic in `parseTaskInput()`,
   and extend `ParsedTaskMetadata` with the new field

2. **`use-smart-input-consumer.ts`** — Add a callback in `SmartInputConsumerCallbacks`
   and a detection/consumption block in `processTitle()`

3. **Approach B surfaces** — The pills render automatically from `parsed.tokens[]`.
   Add a `tapToken()` pattern export if mobile field pickers need to insert the token

4. **`use-task-form.ts`** — Add a `useState` for the new field, include it in
   `TaskFieldValues` and `TaskFieldHandlers`

5. **`task-fields-body.tsx`** — Add a field button/picker for the new field, wire the
   smart callback, add a flash target

---

## Design Decisions Log

| Decision | Chosen | Rejected | Why |
|----------|--------|----------|-----|
| Rich text vs plain input | Plain `<input>`/`<textarea>` | contenteditable + ProseMirror | Engineering cost disproportionate to benefit |
| One hook vs two | Two focused hooks | Single dual-mode hook | Each serves a different interaction pattern; unification adds complexity without reducing it |
| Token visibility in creation | Visible (B) in Quick Add/triage; consumed (A) in editor | Uniform visibility | Editor has field buttons for feedback; Quick Add doesn't |
| Token visibility in editing | Consumed immediately (A) | Deferred consumption (B) | Field buttons already show current values; deferred adds a confusing "pending" state |
| Edit-mode safety | Baseline seeding | Full diff-based index masking | Baseline covers 99% of cases; character-level diffing is over-engineered for short task titles |
| Reconstruction on edit | Never reconstruct | Inject tokens back into title | Clean title + field buttons is better UX; reconstruction creates sync issues |
| Losing tokens (same type) | Last wins; earlier matches stay in title | Strip all matches | Matches Todoist behavior; preserves user's text |
