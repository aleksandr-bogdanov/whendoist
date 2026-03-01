---
version:
pr:
created: 2026-03-01
---

# Rich Text Link Rendering in Task Titles & Notes

## Context

Tasks imported from Todoist contain markdown links `[text](url)` and bare URLs. Currently
the app renders all text as raw plaintext — URLs are ugly, long, and not clickable. This
feature adds a lightweight `<RichText>` component that renders links in task titles and
descriptions without adding any dependencies.

## Scope

- **Titles:** Render links in task list items (parent + subtask)
- **Descriptions/Notes:** Add read-mode with rendered links, switch to textarea on focus
- **No new dependencies** — regex-based parsing only

## New Files

### 1. `frontend/src/lib/rich-text-parser.ts` — Pure parsing logic

Types:
```ts
export type RichTextSegment =
  | { type: "text"; content: string }
  | { type: "link"; text: string; href: string }
  | { type: "bare-url"; href: string; display: string };
```

Combined regex (two alternatives):
```ts
const RICH_TEXT_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s<>"'\]]+)/g;
```

Key functions:
- `parseRichText(input: string): RichTextSegment[]` — main parser
- `hasLinks(input: string): boolean` — fast `String.includes()` check for short-circuit
- `truncateUrl(href, maxLen=35)` — shows `domain.com/path…` for bare URLs
- `cleanTrailing(url)` — strips trailing `.,:;!?` and unbalanced `)` from bare URLs

### 2. `frontend/src/components/ui/rich-text.tsx` — React component

```tsx
export function RichText({ children, className }: { children: string; className?: string })
```

- Uses `useMemo` + `hasLinks` fast-path — zero overhead when no links present
- Renders `<span>` wrapper with inline `<a>` elements (preserves `line-clamp-2`)
- Links: `text-primary underline decoration-primary/30 hover:decoration-primary`
- `onClick`: `e.stopPropagation()` + `e.preventDefault()` + `window.open()` — prevents parent button handlers (edit panel, drag) from firing
- `onPointerDown`: `e.stopPropagation()` — prevents dnd-kit drag initiation
- `title={seg.href}` on all links for full-URL tooltip on hover

## Modified Files

### 3. `frontend/src/components/task/task-item.tsx`

Two changes — wrap title text in `<RichText>`:

**Line 707** (parent task title):
```tsx
// Before: {task.title}
// After:
<RichText>{task.title}</RichText>
```

**Line 1231** (subtask title):
```tsx
// Before: {subtask.title}
// After:
<RichText>{subtask.title}</RichText>
```

`line-clamp-2` continues to work since `<RichText>` produces inline elements.
Link clicks stop propagation so parent `<button>` handlers don't fire.

### 4-6. Description read/edit toggle

Same pattern in three files:
- `task-fields-body.tsx` (lines 358-371)
- `task-inspector.tsx` (lines 212-221)
- `thought-triage-drawer.tsx` (lines 241-252)

**Pattern:** When not focused AND has content AND has links → show `<RichText>` in a
styled `<div>` that looks like the textarea. Click → set focused → `requestAnimationFrame`
→ focus the textarea.

```tsx
{!descFocused && desc && hasLinks(desc) ? (
  <div
    role="button"
    tabIndex={0}
    onClick={() => { setDescFocused(true); requestAnimationFrame(() => ref.current?.focus()); }}
    className="...same border/padding as textarea... whitespace-pre-wrap min-h-[4.5rem] cursor-text"
  >
    <RichText>{desc}</RichText>
  </div>
) : (
  <textarea ref={ref} ... />  // existing textarea, unchanged
)}
```

For `thought-triage-drawer.tsx`: add `data-vaul-no-drag` to the read-mode `<div>`.

Each file needs: add `useRef` import, add `descriptionRef`, add `hasLinks` + `RichText` imports.

## Edge Cases

| Input | Result |
|-------|--------|
| `[text](https://url)` | Clickable "text" |
| `https://example.com` | Clickable `example.com` |
| `https://example.com/very/long/path/here` | Truncated to ~35 chars with `…` |
| `See https://example.com.` | Trailing `.` stripped from URL |
| `https://en.wikipedia.org/wiki/Rust_(lang)` | Balanced parens kept |
| `javascript:alert(1)` | Not matched (requires `https?://`) |
| No links in text | Returns raw children — zero overhead |

## Verification

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```

Then manually test:
- Task with markdown link in title → link text clickable, rest is normal text
- Task with bare URL in title → truncated domain shown, clickable
- Description with links → rendered when unfocused, textarea on click
- Click link in list → opens URL, does NOT open edit panel
- Task without links → no visual change from current behavior
