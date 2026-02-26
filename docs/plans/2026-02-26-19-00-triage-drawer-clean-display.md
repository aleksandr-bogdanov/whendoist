---
version:
pr:
created: 2026-02-26
---

# Triage Drawer: Clean Display + Toggle-Off Selectors

## Context

The triage drawer shows metadata in **three redundant places**: raw tokens in the textarea,
dismissable pills, and selector active states. This clutters the mobile bottom sheet.

**Goal**: Eliminate redundancy by removing pills and showing a clean title in the textarea.
Selectors become the single metadata display. Add toggle-off behavior (tap active selector
to deactivate). Desktop/quick-add is unchanged — this is mobile triage drawer only.

## Approach

All changes are in `thought-triage-drawer.tsx`. No changes to `useSmartInput` hook or
field-picker components. The parser already returns `parsed.title` with tokens stripped.

## Changes

### 1. Clean textarea — show `parsed.title` instead of `rawInput`

**File**: `frontend/src/components/task/thought-triage-drawer.tsx`

Replace `rawInput` binding on textarea with `parsed.title`. Add a local `handleTitleEdit`
that reconstructs `rawInput` from the new title + existing token strings.

```tsx
// New handler in DrawerBody:
const handleTitleEdit = useCallback(
  (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newTitle = e.target.value;
    // Prepend existing tokens so parser preserves metadata
    const tokenStr = parsed.tokens.map((t) => t.raw).join(" ");
    const rebuilt = tokenStr ? `${tokenStr} ${newTitle}` : newTitle;
    setInput(rebuilt);
  },
  [parsed.tokens, setInput],
);
```

Textarea changes:
- `value={rawInput}` → `value={parsed.title}`
- `onChange={handleInputChange}` → `onChange={handleTitleEdit}`
- Auto-resize effect: change dependency from `rawInput` to `parsed.title`

Autocomplete: The `SmartInputAutocomplete` dropdown won't fire (since `handleInputChange`
is no longer called on the textarea). Remove it from render. Domain selection is done via
the chip row. If needed, autocomplete support in clean-display mode can be added later by
exposing a `checkAutocomplete(text, cursorPos)` method on the hook.

### 2. Remove metadata pills section

Delete the pills block (lines 209–220 approx):
```tsx
{/* DELETE — Metadata pills */}
{parsed.tokens.length > 0 && (
  <div className="flex flex-wrap gap-1.5">
    {parsed.tokens.map((token) => (...))}
  </div>
)}
```

Remove unused imports: `MetadataPill` from `task-quick-add`.

### 3. Toggle-off selectors — tap active value to deactivate

Helper to find and dismiss a token by type:

```tsx
const clearTokenType = useCallback(
  (type: string) => {
    const token = parsed.tokens.find((t) => t.type === type);
    if (token) handleDismissToken(token);
  },
  [parsed.tokens, handleDismissToken],
);
```

**Domain** (selector `onSelect`):
```tsx
onSelect={(id, name) => {
  if (id === parsed.domainId) {
    clearTokenType("domain");
  } else {
    const cur = parsed.domainName;
    const pattern = cur
      ? new RegExp(`#${cur.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "i")
      : /#\S+/;
    tapToken("#", name, pattern);
  }
}}
```

**Impact** (selector `onChange`):
```tsx
onChange={(impact) => {
  if (parsed.impact === impact) {
    clearTokenType("impact");
  } else {
    tapToken("!", IMPACT_KEYWORDS[impact], IMPACT_PATTERN);
  }
}}
```

**Schedule** (modify existing `handleDateSelect`):
Add toggle check at the top — if selected date matches current date, clear instead:
```tsx
if (iso === parsed.scheduledDate) {
  handleDateClear();
  return;
}
```
Keep the existing "Clear" button in `ScheduleButtonRow` for custom calendar dates.

**Duration** (inline buttons):
```tsx
onClick={() => {
  if (parsed.durationMinutes === m) {
    clearTokenType("duration");
  } else {
    tapToken("", formatDurationLabel(m), /\b\d+[hm]\b/i);
  }
}}
```

**Clarity** (inline buttons):
```tsx
onClick={() => {
  if (parsed.clarity === opt.value) {
    clearTokenType("clarity");
  } else {
    tapToken("?", opt.value, /\?(autopilot|normal|brainstorm)\b/i);
  }
}}
```

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/components/task/thought-triage-drawer.tsx` | Clean display, remove pills, toggle-off |

No changes to:
- `frontend/src/hooks/use-smart-input.ts` (hook stays as-is)
- `frontend/src/components/task/field-pickers.tsx` (pickers stay as-is)
- `frontend/src/lib/task-parser.ts` (parser already returns clean title)

## Known Behaviors

1. **Token extraction cursor jump**: When a power user types a token (e.g. `!high`) in the
   clean textarea, the token is extracted and the title changes. The cursor may briefly jump.
   This is acceptable for the power-user path. Can be mitigated later with manual
   `setSelectionRange` after extraction.

2. **Impact/Clarity default hints**: Impact defaults to Min (visually active when null),
   Clarity hints at Normal (dashed border when null). Tapping the default-hint button
   explicitly sets the value; tapping again clears to null. Both states look similar but
   differ in data (`null` vs explicit value). This is consistent with the user's instruction:
   "if you click on the active selector it is disengaged."

3. **Autocomplete disabled in triage drawer**: Domain autocomplete dropdown won't appear
   while typing in the clean textarea. Users select domains via the chip row. Autocomplete
   can be restored later by adding a `checkAutocomplete()` method to the hook.

## Verification

1. Open a thought with tokens (e.g. `#Health & Fitness !high tomorrow 2h Birthday ideas`)
2. Verify textarea shows only `Birthday ideas` (clean, no tokens)
3. Verify no pills row between textarea and selectors
4. Verify selectors show correct active states for domain/impact/schedule/duration
5. Tap active domain chip → domain clears, selector goes inactive
6. Tap active impact button → impact clears
7. Tap Today when Today is active → schedule clears
8. Tap active duration → clears
9. Tap active clarity → clears
10. Edit the title text → selectors stay unchanged, title updates correctly
11. Type a token in title (e.g. `!low`) → token extracts, impact selector updates
12. Convert to task → verify all metadata is passed correctly
13. Run `cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build`
