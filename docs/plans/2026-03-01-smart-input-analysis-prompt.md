# Standalone Analysis Prompt: Smart Input Unification

Copy everything below the line into Claude Web, ChatGPT, Gemini, or any LLM.

---

You are a senior frontend architect. I need you to analyze a UX/architecture decision for
a task management app (React SPA, TypeScript). The app has a smart input system where users
can type metadata tokens inline with the task title (like `Fix login #Work !high 30m tomorrow`)
and the tokens are parsed into structured fields.

**The problem:** We currently have TWO different approaches for this smart input, used on
different screens. We want to decide whether to unify them into one, and if so, which model.

## Current State: Two Approaches

### Approach A — Immediate Token Consumption

**Used on:** Full task editor (create + edit mode), detail panel (create + edit mode)

How it works:
1. User types in a plain textarea: `Fix login #Work !high`
2. On every keystroke, a parser runs on the text
3. When a token is detected (new token not seen in previous parse):
   - Token is **immediately stripped** from the title text
   - A callback fires: `onDomain(5, "Work")`, `onImpact(1)`
   - A flash animation plays on the corresponding field button (800ms)
   - Title becomes: `Fix login` (always clean)
4. Field values live in independent `useState` calls (domainId, impact, clarity, etc.)
5. Clicking a field button changes the useState directly — title is unaffected

On save: payload assembled from field states. Title is already clean.

On edit (existing task): Clean title loaded from DB. Field states loaded into useState.
If user types a new token, it's consumed as usual. Existing title text is not re-parsed
at mount — only changes trigger consumption.

**Key property:** Title is ALWAYS clean. Tokens are transient (exist for a fraction of a
second while typing, then vanish). Field states are the source of truth after consumption.

### Approach B — Raw Text as Source of Truth

**Used on:** Quick Add dialog (create only), thought-to-task triage (create only)

How it works:
1. User types in a plain input: `Fix login #Work !high`
2. On every keystroke, a parser runs. Result: `{ title: "Fix login", domainId: 5, impact: 1, ... }`
3. **Tokens stay in the raw text.** Input still shows `Fix login #Work !high`
4. Small pills appear below the input showing detected metadata (domain: Work, impact: high)
5. User can dismiss a pill (X button) → token removed from raw text
6. User can click field buttons → `tapToken()` inserts/replaces token IN the raw text
   - Clicking "low" impact: raw text becomes `Fix login #Work !low`
7. Everything derives from the raw text. No independent field state.

On save: `parsed.title` (clean, tokens stripped) saved as title. `parsed.impact` etc. saved
as fields. The raw text with tokens is never persisted.

**Key property:** Raw text is the single source of truth. Tokens are always visible in the
input. Pills provide visual confirmation.

**This approach has NEVER been used for editing** — only for creating new tasks and
converting thoughts to tasks (one-shot operations where you start with a bare title).

### Surfaces With No Smart Input

Two inline-add surfaces (add task at bottom of a domain group, add subtask under a parent)
have a simple text input with no parsing at all. Just title, Enter to create.

## The Todoist Reference Model

I tested Todoist's task creation and observed a third model:

**During creation:**
- Rich text input — tokens render as **colored inline chips** inside the text field
- Multiple tokens of the same type can coexist (e.g., p1, p2, p3 all visible as chips)
- Last one wins. Backspace removes latest; previous becomes active.

**On save (Enter):**
- Winning token consumed (stripped from title, applied to field)
- Losing tokens (superseded same-type tokens) remain in the title as plain text
- Example: typed `p1 stuff p2 stuff p3`, backspaced p3. On save: p2 consumed.
  Title becomes `p1 stuff stuff` — the `p1` is now inert plain text.

**During editing (after save):**
- Title is plain text. Leftover tokens like `p1` are NOT actionable.
- BUT if user deletes `1` and retypes `1`, fresh `p1` IS recognized as token.
- Field values shown as labeled buttons on the side. Clicking changes field directly.

**Key properties:** Deferred consumption (visible during typing, consumed on save),
rich text inline chips, "active typing" detection (existing text inert, fresh typing parsed).

## The Decision Space

| Option | Description |
|--------|-------------|
| **Keep both A+B** | Status quo. Two approaches for different surfaces. Proven to work. |
| **Unify to A** (immediate consumption everywhere) | All surfaces use consume-on-detect. Tokens briefly flash then vanish. Works for both create and edit. |
| **Unify to B** (raw text SOT everywhere) | All surfaces use raw-text-as-SOT with pills. Problem: never been used for editing. How to handle edit mode? |
| **Unify to C** (Todoist-style deferred consumption) | Tokens visible during typing, consumed on save. Would need rich text input OR pills-below-input as substitute. Handles edit via "existing text inert" rule. |
| **Unify to B-hybrid** | Raw text SOT for creation, but in edit mode: show clean title + field buttons from DB. If user types new tokens, parse them. On save, strip new tokens. Don't try to reconstruct tokenized text. |

## Specific Concerns

1. **The edit-mode problem for Approach B:**
   An existing task has: title="Fix 30m timeout bug", duration=null, impact=2.
   If we parse the full title on edit, `30m` would be falsely detected as a duration token.
   - Approach A avoids this because tokens were already consumed during creation — saved titles are always clean.
   - Approach B has never faced this because it's never used for editing.
   - Todoist avoids this via "active typing detection" — only fresh keystrokes trigger parsing.
   - The "B-hybrid" option avoids this by not parsing the initial title at all — only parsing new typing.

2. **The "reconstruction" non-problem:**
   Initially we thought edit mode required reconstructing tokenized text from DB fields
   (e.g., turning impact=2 into `!mid` and inserting it back into the title). This is
   NOT necessary. You can just show the clean title + show field values as buttons.
   No reconstruction needed. Clicking a button changes the field. Typing a token is an
   optional power-user shortcut.

3. **False positives in existing titles:**
   Tokens with special prefixes (`#domain`, `!impact`, `?clarity`) are safe — unlikely in
   natural titles. But unprefixed tokens (`30m`, `tomorrow`, `today`) could appear in normal
   title text. This is an issue for ANY approach that parses during editing.

4. **Rich text input complexity:**
   Todoist uses inline chips (rich text). This requires contenteditable or a library like
   Tiptap/Slate/ProseMirror. Our current inputs are all plain `<input>` and `<textarea>`.
   Adding rich text is a significant investment. An alternative: keep plain inputs and show
   pills below (which we already do in Quick Add).

5. **The inline-add surfaces:**
   Currently have no smart input. Adding it would let users type `#Work !high 30m` in the
   inline add. This is purely additive — no conflict with any approach choice.

## What I Need From You

1. **Which option do you recommend and why?** Consider UX consistency, implementation
   complexity, edge cases, and maintainability.

2. **How should edit mode work specifically?** Walk through the exact user flow for
   opening an existing task, editing the title, changing a field via button, and saving.

3. **Is the Todoist "active typing detection" achievable without rich text?** If so, how
   would you implement it with a plain textarea?

4. **What are the risks of your recommended approach?** What could go wrong?

5. **Is there an incremental migration path?** Can we move surface-by-surface, or does
   it need to be a big bang?

Think step by step. Consider edge cases carefully. I've already received contradictory
advice on this, so I need a clear, consistent analysis that doesn't change its conclusion
halfway through.
