---
version: v0.55.70
pr: 563
created: 2026-03-01
---

# Smart Input Approach Analysis: Should We Unify?

## Why This Document Exists

During a consolidation effort, we identified that Whendoist has **two fundamentally different
smart input approaches** for task creation and editing. The question arose: should we unify
them into a single "Todoist-style" approach? Multiple attempts to reason about this in-session
produced contradictory conclusions. This document captures the full technical state so a
fresh analysis can be done from scratch.

---

## The Two Current Approaches

### Approach A — Token Consumption (`useSmartInputConsumer`)

**Used by:** TaskEditor (full-screen sheet), TaskDetailPanel (right-pane editor) — via
the shared `TaskFieldsBody` component.

**How it works:**

1. User types in a plain `<textarea>`. Example: `Fix login bug #Work !high`
2. On every keystroke, `processTitle(rawTitle)` is called
3. The parser detects tokens: domain=#Work, impact=!high
4. **Immediately:** tokens are stripped from the title, callbacks fire
   - Title becomes: `Fix login bug` (clean)
   - `onDomain(5, "Work")` is called → `setDomainId(5)`
   - `onImpact(1)` is called → `setImpact(1)`
   - A flash animation plays on the domain and impact fields
5. The field buttons/pickers show the current values (from independent useState)
6. User can also click buttons to change fields — this updates useState directly,
   title is unaffected

**On save:** Payload is assembled from the independent field states (domainId, impact,
clarity, etc.), not from parsing. The title is already clean.

**On edit (existing task):** Title is loaded clean from DB. Field values are loaded
into useState. If user types a new token in the title, it's consumed as usual.

**Key property:** Title is ALWAYS clean. Tokens are transient — they exist for a fraction
of a second while the user types, then vanish. Fields are the source of truth.

### Approach B — Raw Text as Source of Truth (`useSmartInput`)

**Used by:** TaskQuickAdd (modal dialog), ThoughtTriageDrawer (mobile triage),
TaskInspector (desktop triage) — triage surfaces use the shared `useTriageForm` hook.

**How it works:**

1. User types in a plain `<input>`. Example: `Fix login bug #Work !high`
2. On every keystroke, `parseTaskInput(rawInput)` is called
3. The parser extracts: `parsed.title = "Fix login bug"`, `parsed.domainId = 5`,
   `parsed.impact = 1`, etc.
4. **Tokens stay in the raw text.** The input still shows `Fix login bug #Work !high`
5. Pills appear below the input showing the detected metadata
6. User can dismiss a pill (X button) → the token is removed from raw text
7. User can click field buttons → `tapToken()` inserts/replaces a token IN the raw text
   - Example: clicking "low" impact calls `tapToken("!", "low", IMPACT_TOKEN_PATTERN)`
   - Raw text becomes `Fix login bug #Work !low`

**On save:** `parsed.title` (clean, tokens stripped) is used as the title. `parsed.domainId`,
`parsed.impact`, etc. are used for fields. The raw text with tokens is never saved.

**Key property:** Raw text is the single source of truth. Everything is derived from it.
Tokens are visible in the input at all times. No independent field state exists (except
for fields not representable as tokens, like recurrence and parent task).

### Surfaces With No Smart Input

**DomainGroup inline add** and **SubtaskGhostRow**: plain text input, title only, no
token parsing at all. Domain is inherited from the group context. Impact defaults to 4,
clarity to "normal".

---

## The Todoist Model (observed behavior)

Based on hands-on testing of Todoist's task creation:

### During creation (inline input):

1. User types `p1 something p2 something p3` in the task title field
2. Tokens are recognized in **real-time** and shown as **highlighted inline chips**
   inside the input (rich text rendering — not pills below)
3. Multiple tokens of the same type coexist visually
4. **Last one wins.** Pressing Backspace removes the latest token, previous becomes active

### On save (Enter):

1. The **winning token** for each field type is **consumed** — stripped from the title,
   applied to the field
2. **Losing tokens** (superseded ones) **remain in the title as plain text**
3. Example: typed `p1 stuff p2 stuff p3`, then Backspaced to remove p3.
   On save: p2 is consumed (stripped, applied as priority). Title becomes
   `p1 stuff stuff` — the leftover `p1` is now inert plain text.

### During editing (after save):

1. Title shows as plain text. Leftover tokens like `p1` are NOT actionable.
2. But if the user deletes `1` and retypes `1`, the fresh `p1` IS recognized
   as a new token.
3. Field values are shown as separate labeled buttons on the right side.
4. Clicking a field button changes the value directly.

### Key properties:

- **Deferred consumption**: tokens are visible during typing but consumed on save
- **Rich text input**: tokens render as colored chips inline in the text field
- **"Active typing" detection**: existing saved text is inert; only fresh keystrokes
  trigger parsing
- **Last wins, losers stay**: only the winning token is stripped; losers become
  plain title text

---

## How Our Approaches Compare to Todoist

| Behavior | Our Approach A | Our Approach B | Todoist |
|----------|---------------|---------------|---------|
| Tokens visible during typing | No (consumed instantly) | Yes (stay in raw text) | Yes (inline chips) |
| Tokens stripped on save | Already stripped | Stripped via `parsed.title` | Stripped (winners only) |
| Token visual feedback | Field flash animation (800ms) | Pills below input | Inline colored chips |
| Losing tokens (same type) | Never visible (consumed one at a time) | Parsed but only last extracted | Remain as plain text in title |
| Edit mode — existing text | Clean title, fields separate | Would need reconstruction (not used for editing) | Clean title, inert; fresh typing re-parsed |
| Input type | Plain `<textarea>` | Plain `<input>` | Rich text (contenteditable or similar) |
| Click field button | Updates useState directly | `tapToken()` inserts into raw text | Updates field directly |
| Surfaces | TaskEditor, TaskDetailPanel | QuickAdd, Triage | All surfaces (unified) |

---

## The Open Questions

1. **Can we unify to a single approach?** Todoist uses one model everywhere. We use two
   plus two surfaces with no smart input at all. Is a single model achievable?

2. **Is the rich text input essential?** Todoist shows inline chips. We could use pills
   below the input instead (we already do this in Quick Add). Is that sufficient, or does
   the inline highlighting provide critical UX value?

3. **How should edit mode work?** The core tension:
   - Opening an existing task with title "Fix 30m timeout bug" — if we parse on edit,
     `30m` could be falsely detected as a duration token
   - Todoist solves this with "active typing detection" — existing text is inert
   - Our Approach A solves this by consuming tokens immediately (so saved titles never
     contain tokens)
   - Our Approach B has never been used for editing — only for creation/triage

4. **Is deferred consumption (Todoist-style) better than immediate consumption
   (our Approach A)?** Deferred gives visual feedback during typing; immediate keeps
   the title always clean.

5. **What about the "losers stay" behavior?** In Todoist, if you type `p1 stuff p2`,
   only p2 is consumed; p1 remains in the title as inert text. Our parser always strips
   only the last match of each type from the clean title — earlier matches of the same
   type also remain. So we already have "losers stay" behavior in the parser.

6. **What would a unified approach look like concretely?** How many files change?
   What's the migration path? What breaks?

---

## Current File Map

### Hooks

| Hook | Approach | Used By |
|------|----------|---------|
| `use-smart-input.ts` | B (raw text SOT) | QuickAdd, useTriageForm |
| `use-smart-input-consumer.ts` | A (consume tokens) | TaskFieldsBody |
| `use-triage-form.ts` | B (wraps useSmartInput) | ThoughtTriageDrawer, TaskInspector |
| `use-task-form.ts` | A (field states) | TaskEditor, TaskDetailPanel |
| `use-task-create.ts` | N/A (mutation wrapper) | QuickAdd, DomainGroup, SubtaskGhostRow |

### Components

| Component | Smart Input | Create/Edit | Notes |
|-----------|------------|-------------|-------|
| task-quick-add.tsx | Approach B | Create only | Modal dialog, pills below input |
| task-editor.tsx | Approach A (via TaskFieldsBody) | Create + Edit | Full-screen sheet |
| task-detail-panel.tsx | Approach A (via TaskFieldsBody) | Create + Edit | Right-pane inline |
| task-fields-body.tsx | Approach A (owns the consumer) | Both (stateless) | Shared field layout |
| thought-triage-drawer.tsx | Approach B (via useTriageForm) | Create only | Mobile bottom drawer |
| task-inspector.tsx | Approach B (via useTriageForm) | Create only | Desktop right-pane |
| domain-group.tsx | None | Create only | Inline add, title only |
| subtask-ghost-row.tsx | None | Create only | Inline add, title only |

### Parser

| Module | Purpose |
|--------|---------|
| `task-parser.ts` | Pure parser: `parseTaskInput()`, token patterns, autocomplete suggestions |
| `task-utils.ts` | Utilities: `groupParentTasks()`, `formatDurationLabel()` |

---

## Constraints & Context

- **PWA on iOS**: must not break standalone mode (see PWA-VIEWPORT-FIX.md)
- **Encryption**: `useCrypto().encryptTaskFields()` must be called before any API mutation
- **Orval-generated API hooks**: mutation hooks are auto-generated, don't modify
- **Biome for lint/format**, not ESLint/Prettier
- **Tailwind v4**, shadcn/ui components
- The app is used as a PWA on mobile — triage drawer is a primary mobile surface
- The inline add (DomainGroup, SubtaskGhostRow) is used frequently for quick captures
