---
version: v0.55.11
pr:
created: 2026-02-25
---

# Smart Quick Add V2 — Critical Assessment

## Previous Assessment Accuracy

The previous review got **5 of 8 findings wrong or partially wrong**.

| Previous Finding | Verdict | Why |
|---|---|---|
| `\b(tom)\b` → tomorrow | **WRONG** | Pattern is `tmr\|tmrw`, not `tom`. chrono-node doesn't parse "tom". |
| `//` in URLs triggers separator | **WRONG** | Regex `(^|\s)\/\/` requires whitespace before `//`. `https://` has `:` before `//`. |
| Impact vocabulary mismatch | **WRONG** | Code uses `High/Mid/Low/Min` — matches app constants exactly. |
| `2m` USB cable → 2 min | **PARTIALLY WRONG** | `parseDuration` rejects < 5 min. `2m` → 2 → rejected. But `5m`+ still false-positive. |
| Email `#` triggers domain | **WRONG** | Parser skips `#` not preceded by whitespace. `john#work.com` won't match. |
| No ARIA on autocomplete | **CORRECT** | |
| `!` trigger not wired | **WRONG** | Lines 408-419 handle `!` trigger explicitly. |
| Dismissals reset on keystroke | **CORRECT** | But rated minor — should be major. |

## Real Findings

### CRITICAL — chrono-node false positives with person names and common words

`chrono.parse()` matches month names, day names, and ordinals in running text. Real task inputs that break:

- **"Email Jan about budget"** → chrono parses "Jan" as January 1, strips it, title becomes "Email about budget"
- **"Ask May for the report"** → "May" parsed as May 1
- **"Buy March Madness tickets"** → "March" parsed as March 1
- **"Review the 2nd draft"** → "2nd" parsed as the 2nd of current month
- **"Send August his files"** → "August" parsed as August 1

These aren't edge cases — they're common task titles. The result is **silent data corruption**: the matched word is stripped from the title and an incorrect date is set. The user might not notice until after saving.

The "last wins" logic makes it worse: **"Move tomorrow meeting to friday"** → only "friday" is removed from the title, leaving "Move tomorrow meeting to" as the title. Orphaned date words remain.

**Impact**: Users will create tasks with corrupted titles and incorrect scheduled dates. No undo for the title corruption.

### CRITICAL — Dismissals are useless against false positives

`handleInputChange` does `setDismissedTypes(new Set())` on every keystroke. If a user:

1. Types "Email Jan about budget"
2. Sees a false-positive date pill for "Jan"
3. Dismisses it (✕ button)
4. Types one more character

...the "Jan" date pill reappears immediately. The dismiss-and-retype cycle makes dismissal completely ineffective for the exact scenario where it's most needed: false positives from chrono-node.

The comment says "allows re-parsing" but the right behavior is to clear dismissals only when the trigger text actually changes, not on every keystroke.

### MAJOR — Duration false positives with measurements ≥ 5

The ≥ 5 minute floor blocks `2m` and `3m` but not:

- **"Buy 5m HDMI cable"** → 5 min duration
- **"Run 10m sprint"** → 10 min
- **"Install 15m antenna mast"** → 15 min
- **"Check 1h battery charge"** → 1 hour

The lookbehind/lookahead prevents matching inside words but not standalone measurements. There's no disambiguation between "5m" meaning 5 meters vs 5 minutes.

### MAJOR — No double-submit guard

`handleKeyDown` calls `handleSave()` on Enter without checking `createMutation.isPending`. The button is disabled during pending, but Enter-key submission bypasses that. Rapid Enter presses → multiple API calls → duplicate tasks.

### MAJOR — iOS keyboard dismissal after autocomplete selection

`handleAcSelect` uses `requestAnimationFrame` to restore focus:

```typescript
requestAnimationFrame(() => {
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(cursorPos, cursorPos);
});
```

iOS Safari restricts programmatic `.focus()` to the synchronous user-gesture call stack. `requestAnimationFrame` adds a frame delay, breaking the gesture chain. On iOS PWA, the keyboard will likely dismiss and not reopen after selecting an autocomplete suggestion, forcing the user to tap the input again.

### MAJOR — No ARIA attributes on autocomplete dropdown

`smart-input-autocomplete.tsx` has zero accessibility markup:

- No `role="listbox"` / `role="option"`
- No `aria-activedescendant` on the input
- No `aria-expanded` / `aria-controls`
- No `aria-label` on the dropdown

Screen readers cannot perceive or navigate the autocomplete. VoiceOver on iOS (a primary platform) would see only a text input with no indication that suggestions are available.

### MINOR — `autoFocus` unreliable on iOS PWA

`<Input ... autoFocus />` — iOS Safari in standalone PWA mode doesn't reliably honor `autoFocus` in dialogs. The keyboard won't appear until the user explicitly taps the input, adding one unnecessary tap to every Quick Add interaction on the primary platform.

### MINOR — Autocomplete dropdown may overflow on mobile

The dropdown is `absolute` positioned below the input (`top-full mt-1`, `max-h-48`). When the iOS keyboard is showing (~50% of screen), the dialog content shifts and the 192px dropdown can overflow below the visible area. No scroll boundary or repositioning logic.

### MINOR — Hints dismissal is permanent with no recovery

`localStorage.setItem("qa-hints-dismissed", "1")` permanently hides syntax hints. There's no settings UI or reset mechanism. A user who dismisses hints early and later forgets the `?auto` syntax has no way to see them again.

### MINOR — Radix Dialog body scroll lock on iOS PWA

Radix Dialog sets `overflow: hidden` on `<body>` by default when `modal={true}`. Per project rules (CLAUDE.md section 8), this triggers the 59px viewport shrink on iOS PWA standalone mode. However, this affects all dialogs app-wide, not just Quick Add — so it's either already mitigated or a pre-existing issue.

## What the previous review missed entirely

1. The chrono false positives with real names (Jan, May, August, March) — the single biggest usability risk
2. The double-submit on Enter
3. iOS keyboard dismissal from `requestAnimationFrame` focus
4. Mobile autocomplete overflow
5. The orphaned-date-words problem with multiple date references

## Verdict: **Iterate**

The parser infrastructure is sound — types, autocomplete flow, pill UX, and encryption integration are well-built. But chrono-node's aggressive matching creates a **false-positive problem that will erode user trust** in the core value proposition ("type naturally"). Users who encounter silent title corruption once will stop using Smart Quick Add entirely.

### Before shipping, fix these three things

1. **Guard chrono with a word-boundary whitelist or confirmation UX**: Either restrict chrono matches to tokens that are unambiguously dates (e.g. require a number alongside month names, or require day names to be preceded by "next"/"this"), or don't auto-strip date tokens from the title until the user confirms them.

2. **Make dismissals sticky until the trigger text changes**: Track which substring was dismissed, not just the type. Only re-parse that type when the relevant portion of the input changes.

3. **Add `isPending` guard** to `handleSave` (one line fix — do this regardless).

Everything else (ARIA, iOS focus, mobile overflow) can ship as fast-follows.
