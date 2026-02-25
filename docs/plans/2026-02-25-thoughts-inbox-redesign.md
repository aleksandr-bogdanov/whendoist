---
version: v0.55.27
pr: 522
created: 2026-02-25
---

# Thoughts Page Redesign: Chat Bubbles → Inbox Card List

## Context

The Thoughts page uses a chat-bubble layout (right-aligned bubbles, click for tiny domain pills). This has three problems:
1. **Wasted space** — bubbles are `max-w-[80%]` right-aligned, leaving 70%+ empty on desktop
2. **No real triage** — "promote" only sets domain_id; no priority, date, or description
3. **Wrong metaphor** — thoughts aren't messages, they're inbox items waiting to be processed

The redesign replaces chat bubbles with a full-width card list + inline triage panel, matching the Todoist Inbox pattern: frictionless capture, structured triage.

## Changes

**Single file modified:** `frontend/src/routes/_authenticated/thoughts.lazy.tsx`

### 1. Replace `ThoughtBubble` with `ThoughtCard`

Full-width row for each thought:
- Left: small dot indicator (`h-1.5 w-1.5 rounded-full bg-muted-foreground/40`)
- Center: title text, left-aligned, `text-sm`, single-line truncate
- Right: relative timestamp ("2h ago"), edit/delete icons (hover-visible on desktop, always on mobile)
- Click row → toggle triage panel expansion
- Editing: row switches to inline Input (same Enter/Escape pattern as current)

### 2. Add `TriagePanel` (inline expansion below expanded card)

When a thought is clicked, a panel expands below it with:

**a) Domain selector** (required for conversion)
- Horizontal row of domain pills (colored buttons with icon + name)
- Click to select/deselect (toggle). Selected state: solid domain color, white text, ring
- Unselected: `bg-secondary text-foreground`

**b) Priority selector**
- 4 buttons in a row: P1 High, P2 Mid, P3 Low, P4 Min
- Uses `IMPACT_OPTIONS` and `IMPACT_COLORS` from `task-utils.ts`
- Default: P4 Min (pre-selected). Click to change. One always active.

**c) Schedule quick picks**
- [Today] [Tomorrow] buttons + native `<input type="date">`
- Optional — not required for conversion
- [Clear] link appears when date is set

**d) Notes** (optional)
- "+ Add notes" link → expands to `<Textarea>` (2 rows, auto-focus)

**e) Action buttons**
- Left: Delete (ghost destructive)
- Right: "Convert to Task →" (primary, disabled until domain selected)

### 3. Replace `handlePromote` with `handleConvert`

Current: `updateTask({ domain_id })` → toast "Promoted to task"

New: `updateTask({ domain_id, impact?, scheduled_date?, description? })` → toast "Moved to [Domain Name]" with Undo action. Undo sets `domain_id: null`.

Description is encrypted via `encryptTaskFields` before sending.

### 4. Layout changes

- Remove `max-w-xl` from list area → use `max-w-2xl` (wider cards)
- Remove `groupByDate` and date dividers → flat list sorted newest-first
- Remove auto-scroll-to-bottom → no longer a chat paradigm
- Keep date grouping headers but simplify — or remove entirely since `formatTimeAgo` on each card handles context
- Keep input bar as-is (bottom, "What's on your mind?", Enter to send)
- Update header subtitle: "Capture ideas, then triage them into tasks"

### 5. Add `formatTimeAgo` utility

Replaces `formatDateLabel`. Returns: "just now", "5m ago", "2h ago", "Yesterday", "3d ago", "Feb 15".

### 6. State changes

Remove: `scrollRef`, auto-scroll effect, `groupByDate` memo, `showActions` (was in ThoughtBubble)
Add: `expandedId: number | null` — only one card expanded at a time
Keep: `editingId`/`editText`, `input`, all mutation hooks, encryption logic, domain decryption

## Imports

Add: `ArrowRight` (lucide), `Textarea` (ui), `IMPACT_OPTIONS`, `IMPACT_COLORS` (task-utils), `cn` (utils)
Remove: `X` (lucide)

## Key reusable patterns from codebase

| Pattern | Source file | Usage |
|---------|------------|-------|
| Impact colors & options | `frontend/src/lib/task-utils.ts:10-56` | Priority button styling |
| Impact button UI | `frontend/src/components/task/task-editor.tsx` (4-button row) | Priority selector layout |
| Date "Today"/"Clear" buttons | `frontend/src/components/task/task-editor.tsx` | Schedule quick picks |
| Toast + undo | `frontend/src/components/task/task-item.tsx` | Convert/delete toasts |
| Encryption before save | Current `handleSend`/`handleSaveEdit` | `handleConvert` for description |
| Domain pill colors | Current `ThoughtBubble` domain pills | Domain selector pills |

## Mobile considerations

- Domain pills: `flex flex-wrap gap-1.5` wraps naturally on narrow screens
- Impact buttons: `flex gap-1.5` with `flex-1` stays equal-width
- Action icons: `opacity-0 group-hover:opacity-100 max-sm:opacity-100` — always visible on touch
- Input bar: unchanged, already uses `pb-nav-safe`
- No `position: fixed` or `overflow: hidden` (PWA viewport rule)

## Verification

1. `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — type check
2. `cd frontend && npx biome check .` — lint
3. `cd frontend && npm run build` — build
4. Manual: open /thoughts, add a thought, expand it, select domain + priority + date, convert, verify undo, verify thought disappears and appears in dashboard under the domain
