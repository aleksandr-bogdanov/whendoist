---
version: v0.55.70
pr: 563
created: 2026-03-01
---

# Smart Input Verdict: Three LLMs Weighed In — Here's What's Actually Right

## 1. Summary of Each Response

### ChatGPT — "B-hybrid: one grammar, two UI projections"
Recommends a **B-hybrid** architecture: creation surfaces keep raw text + pills (current
Approach B), edit surfaces show clean title + field buttons with delta-gated parsing
(similar to current Approach A but with explicit baseline tracking). Provides a concrete
`diffChange()` implementation for active typing detection. Proposes a single
`SmartInputController` hook with a `mode` parameter (`"create-raw"` | `"edit-consume"`).
Migration is surface-by-surface, starting with inline-add.

### Gemini — "B-hybrid, but make it a thesis"
Reaches the **same conclusion** as ChatGPT (B-hybrid with diff-based index masking) but
takes ~4,000 words to say it. Adds useful edge case analysis: bulk paste thresholds,
predictive keyboard debouncing, `isTrusted` event gating, and React 18 `startTransition`
for decoupling parse from render. Proposes a 4-phase rollout (inline-add → Quick Add →
task editor → cleanup). The core technical proposal is identical to ChatGPT's.

### Claude Web — "Unify to A with baseline seeding"
Recommends **unifying to Approach A** (immediate consumption everywhere). Argues that A
"already solves edit mode" and that B-hybrid is "literally what A does." Proposes adding
a `baselineTokens` parse-on-mount to fingerprint existing title text, then only consuming
tokens that weren't in the baseline. Migration: extract shared hook → convert Quick Add →
convert triage → add to inline-add → delete B code.

---

## 2. Where They Agree (consensus across all three)

All three responses converge on these points — treat them as settled:

1. **Reject "keep both A+B" long-term.** Two smart input architectures is technical debt.
   Every improvement ships twice; bugs diverge; user mental model fractures.

2. **Reject full rich-text (Todoist C).** The engineering cost of contenteditable /
   ProseMirror / Tiptap is disproportionate to the benefit. Plain `<input>` / `<textarea>`
   is the right call for this app.

3. **Reconstruction is a non-problem.** Nobody should ever inject `!mid` back into the
   title when opening an existing task. Show the clean title + field buttons. Done.

4. **Edit mode must be baseline-aware.** Whether you call it "delta gating," "baseline
   seeding," or "diff-based index masking," all three propose the same mechanism: record
   what the title looks like at mount, only parse/consume text that's new.

5. **Incremental migration.** No big bang. Surface-by-surface rollout. All three agree
   inline-add is the lowest-risk starting point.

6. **Single parser/grammar.** `task-parser.ts` (already shared) should remain the single
   canonical parser. No duplication.

---

## 3. Where They Disagree

The disagreement is narrower than it appears. There's really only **one genuine
architectural question** hiding behind three different labels:

### The real question: Should tokens be visible during creation?

| | Creation UX | Edit UX |
|---|---|---|
| **ChatGPT/Gemini (B-hybrid)** | Tokens visible in input, pills below | Clean title + field buttons, delta-gated parsing |
| **Claude Web (Unify to A)** | Tokens consumed instantly, flash on buttons | Clean title + field buttons, baseline-seeded parsing |

All three agree on edit mode behavior. The ONLY disagreement is whether, during
**creation**, the user should see `Fix login #Work !high` in the input (B-style) or
see `Fix login` with a flash on the Work and High buttons (A-style).

### Who has the stronger argument?

**ChatGPT/Gemini win on creation UX.** Tokens-visible is objectively more reversible:
- User sees exactly what they typed and what the system detected
- Dismissing a pill is one click; undoing A's consumption requires re-typing
- The pill serves as intent confirmation BEFORE save, not AFTER
- Quick Add already works this way and users haven't complained

**Claude Web wins on simplicity.** A-style has fewer moving parts:
- No pill layer needed (the flash IS the feedback)
- No "pending" state between typing and saving
- Title is always clean — what you see is what gets saved

**Net:** The B-style creation UX (tokens visible + pills) is worth the small extra
complexity. It provides better reversibility and visual confirmation. This aligns with
the industry direction (Todoist, Linear, Notion all show tokens during composition).

---

## 4. Reality Check Against the Actual Code

This is where things get interesting. Several claims from the responses don't hold up
against the actual implementation.

### Claim: "Approach A already solves edit mode" (Claude Web)

**Partially wrong.** Looking at the actual `useSmartInputConsumer` code:

```typescript
// use-smart-input-consumer.ts:46
const prevParseRef = useRef<ParsedTaskMetadata | null>(null);
```

`prevParseRef` starts as `null`. The first call to `processTitle` checks:

```typescript
if (parsed.durationMinutes !== null && parsed.durationMinutes !== prev?.durationMinutes) {
  callbacks.onDuration?.(parsed.durationMinutes);
  // ...consumed!
}
```

When `prev` is `null`, `prev?.durationMinutes` is `undefined`. So if the title contains
`30m`, the condition `30 !== undefined` is `true` — **it would consume on first edit.**

**Why it works in practice:** `processTitle` is only called from `handleTitleChange`
(the onChange handler), not on mount. The initial title is set via `useState(task?.title)`
directly. So the parser never sees the initial title — only deltas.

**But this is fragile, not "solved."** The protection is accidental (an implementation
detail of React controlled components), not intentional. If someone adds an `onMount`
parse, or if the user pastes over the entire title, `prevParseRef` starts null and the
full text gets parsed.

**Edge case that actually breaks today:** If a task was created through inline-add (no
smart input, so `30m` stays in the title), and the user later opens it in the full editor
and makes ANY edit — the first keystroke triggers `processTitle` with `prev === null`,
which parses the entire title and consumes the `30m`. The title silently changes from
"Fix 30m timeout bug" to "Fix timeout bug" with duration=30. This is a real bug, albeit
a rare one.

**Verdict:** Claude Web's "baseline seeding" addition would fix this, but the claim that
A "already" handles it is wrong. ChatGPT/Gemini's explicit delta tracking is more robust
because it's intentional rather than accidental.

### Claim: "B-hybrid is literally what A does" (Claude Web)

**Wrong.** B-hybrid keeps tokens visible during creation; A strips them immediately.
The edit-mode behavior converges, but the creation-mode UX is different. This matters
because Quick Add is the highest-frequency creation surface.

### Claim: Delta detection via `diffChange()` is needed (ChatGPT)

**Partially right, but over-engineered for our case.** The ChatGPT/Gemini delta diffing
algorithm is clever but complex. For our use case, a simpler approach works:

- **Prefixed tokens** (`#`, `!`, `?`) are essentially immune to false positives in titles.
  They're never accidental.
- **Unprefixed tokens** (`30m`, `tomorrow`) are the only false-positive risk.
- A simple **baseline fingerprint** (parse on mount, mark existing tokens as inert) covers
  99% of cases without character-level diffing.

Full diff-based index masking is only needed if you want to handle the exotic edge case
where a user edits the MIDDLE of "Fix 30m timeout bug" to create a new token that
overlaps with existing text. In practice, users append tokens to the end.

### Claim: `startTransition` for async parsing (Gemini)

**Unnecessary.** Our parser runs in <1ms on typical task titles (< 200 chars). The
`parseTaskInput` function is a series of regex matches + one chrono-node call. We're
not parsing documents. This is premature optimization that adds complexity for zero
real-world benefit.

### Claim: `isTrusted` event gating (Gemini)

**Sounds smart, breaks in practice.** React's synthetic events don't reliably expose
`isTrusted` in all scenarios. React 18's batching can also make this unreliable.
`prevParseRef` comparison (what A already does) is simpler and more robust for
distinguishing "new token" from "same text re-parsed."

### Claim: "Read-only pills" for A-style creation (Claude Web)

**This is just Approach B with extra steps.** If you show pills below the input AND
consume the tokens from the text, you now have two representations (pills + field
buttons) showing the same info while the title shows neither. That's more confusing,
not less. Either keep tokens visible (B) or flash the buttons (A). Don't do both.

---

## 5. Bad Reasoning Flagged

### Gemini: Verbose ≠ Rigorous
The response is 10x longer than ChatGPT's but contains the same core recommendations.
Academic language ("catastrophic engineering costs," "deterministic state machine,"
"exhaustive evaluation of the decision space") is used to dress up straightforward
engineering choices. The bulk paste threshold and IME debouncing points are genuinely
useful; the rest is padding. **Correctness: fine. Signal-to-noise: terrible.**

### Claude Web: Circular reasoning on B-hybrid
"B-hybrid is literally what A does" → therefore pick A. This is backwards. If B-hybrid
and A converge in edit mode, the question becomes "which creation-mode UX is better?"
Claude Web answers "A's, because B-hybrid is just A" — but that sidesteps the actual
UX question about token visibility during creation.

### Claude Web: "Flash animation provides better feedback than visible tokens"
**Asserted without evidence.** Flash is a 800ms transient signal. If the user blinks or
looks away, they miss it. Tokens-in-text + pills are persistent until dismissed. For
power users typing fast, persistent feedback > transient feedback. For slow/new users,
both work fine. Flash isn't "better" — it's "simpler."

### ChatGPT: The dual-mode controller adds complexity
The proposal for a `SmartInputController` with `mode: "create-raw" | "edit-consume"`
is essentially re-implementing both A and B behind a single API. It's a cleaner
interface, but it doesn't reduce the total logic. Worth doing for API unification, but
let's not pretend it eliminates complexity.

---

## 6. Verdict

### Recommendation: **B-hybrid** — but simpler than ChatGPT/Gemini describe

The answer is B-hybrid, but implemented as a **pragmatic evolution** rather than the
grand architecture either ChatGPT or Gemini describe:

**Creation surfaces** (Quick Add, triage, inline-add, new task in editor):
- Raw text with tokens visible (current Approach B behavior)
- Pills below input for visual confirmation
- Tokens stripped on save — title is always stored clean

**Edit surfaces** (editing an existing task in editor or detail panel):
- Clean title loaded from DB
- Field values shown as buttons (current Approach A behavior)
- **Baseline fingerprint on mount** — parse the initial title, record which token types
  were detected
- New tokens typed by user are parsed and consumed (A-style immediate consumption) OR
  shown as pills (B-style deferred) — either works, but A-style consumption is simpler
  here since the field buttons are already visible

**The key insight all three missed:** In edit mode, the choice between immediate
consumption and deferred consumption barely matters. The user is looking at field
buttons that already show the current values. Whether a typed `!high` vanishes
immediately (A) or sits there until save (B) is a minor UX preference, not an
architectural decision. Pick whichever is simpler to implement — which is A-style
consumption in edit mode, since the field buttons + flash already exist.

### Decision summary

| Aspect | Decision |
|--------|----------|
| **Approach** | B-hybrid (B for creation, A-consume for edit) |
| **Rich text** | No. Plain `<input>` / `<textarea>` + pills |
| **Parser** | Single `task-parser.ts` (already exists, no changes needed) |
| **Edit safety** | Baseline fingerprint on mount (simple version of ChatGPT's delta) |
| **Diff library** | No. Baseline fingerprint is sufficient |
| **React 18 tricks** | No `startTransition`. Parser is fast enough synchronously |
| **Token visibility** | Creation: visible (B). Edit: consumed immediately (A) |

### Concrete first step

**Step 1: Add baseline seeding to `useSmartInputConsumer`.**

This is a 15-line fix to the existing Approach A hook that makes edit mode genuinely
safe (fixing the accidental protection it has today):

```typescript
// In useSmartInputConsumer, add:
export function useSmartInputConsumer(
  domains: DomainResponse[],
  callbacks: SmartInputConsumerCallbacks,
  initialTitle?: string,  // NEW: pass the title loaded from DB
) {
  // ...existing code...

  // Seed prevParseRef with baseline so existing tokens aren't consumed
  const baselineSeeded = useRef(false);
  if (initialTitle && !baselineSeeded.current) {
    prevParseRef.current = parseTaskInput(initialTitle, domains);
    baselineSeeded.current = true;
  }
```

**This alone fixes the false-positive bug** described in Section 4 and costs nothing.
Ship it as a standalone bugfix PR.

**Step 2: Extend Approach B (`useSmartInput`) to support edit mode.**

Add an `initialTitle` parameter that establishes a baseline. Tokens present in the
baseline are not shown as pills and not stripped on save. This is the B-hybrid
enablement — once this works, any surface can use `useSmartInput` for both create
and edit.

**Step 3: Migrate surfaces one at a time.**

1. Inline-add surfaces → add `useSmartInput` (purely additive, lowest risk)
2. Quick Add → already using B, no change needed
3. Triage → already using B, no change needed
4. Task editor create mode → switch from A to B
5. Task editor edit mode → switch from A to B-with-baseline
6. Delete `useSmartInputConsumer` and `useTaskForm`'s A-specific wiring

Each step is a self-contained PR. Steps 4-5 are the only breaking changes; steps 1-3
are purely additive.

---

## Appendix: Scorecard

| Criterion | ChatGPT | Gemini | Claude Web |
|-----------|---------|--------|------------|
| Correct recommendation | Yes (B-hybrid) | Yes (B-hybrid) | No (Unify to A) |
| Edit mode solution | Solid (delta diffing) | Solid (index masking) | Fragile (baseline seeding, but asserts A "already" handles it) |
| Code-grounded | Moderate (pseudocode, not our code) | Low (generic architecture) | High (references our exact patterns) |
| False claims | Minor (delta diffing complexity worth it) | Minor (startTransition needed) | Major ("A already solves edit mode", "B-hybrid is literally A") |
| Practical migration path | Yes, clear | Yes, but verbose | Yes, clear |
| Signal-to-noise ratio | High | Very low | High |
| Novel insights | Delta diffing sketch, IME gating | Bulk paste threshold, isTrusted | "Read-only pills" idea (flawed but creative) |
| Overall grade | **A-** | **B** | **B+** |

ChatGPT gave the most balanced, actionable analysis. Claude Web was more concise and
code-aware but made claims that don't survive scrutiny against the actual hooks. Gemini
reached the right conclusion but buried it in unnecessary verbosity.
