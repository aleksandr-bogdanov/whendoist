---
version:
pr:
created: 2026-03-01
---

# Auto-Convert Pasted URLs to Markdown Links

## Context

When pasting a URL into a task description, it stays as raw text. In Todoist, pasting a
URL auto-converts it to `[Page Title](url)` — which makes the markdown format discoverable
because you see the brackets when editing. We want the same behavior in description fields.

**Scope:** Description textareas only (not titles).

## Backend: URL Title Endpoint

### New file: `app/routers/url_utils.py`

A single POST endpoint that fetches a URL's `<title>` tag:

```
POST /api/v1/url/title
Body: { "url": "https://example.com" }
Response: { "title": "Example Domain", "url": "https://example.com" }
```

Implementation:
- Use `httpx.AsyncClient` (already a dependency) with a short timeout (~5s)
- Set a browser-like `User-Agent` header (many sites block bare requests)
- Parse `<title>` from the first ~16KB of HTML (don't download the whole page)
- Fall back to `<meta property="og:title">` if no `<title>`
- If fetch fails or no title found, return the hostname as title
- Require authentication (`Depends(require_user)`) to prevent abuse
- No database access needed

### Register in `app/routers/v1/__init__.py`

Add `url_utils` to imports and `router.include_router(url_utils.router)`.

## Frontend: Paste Handler

### Shared hook: `frontend/src/hooks/use-paste-url.ts`

A small hook that encapsulates the paste-to-markdown logic, reusable across all three
description textareas:

```ts
export function usePasteUrl(opts: {
  getValue: () => string;
  setValue: (v: string) => void;
  ref: React.RefObject<HTMLTextAreaElement>;
})
```

- Returns `{ onPaste: (e: ClipboardEvent) => void, isPending: boolean }`
- On paste: check if clipboard text is a bare URL (starts with `http://` or `https://`,
  single line, no spaces)
- If not a URL, do nothing (let default paste happen)
- If URL: `preventDefault()`, immediately insert `[...](url)` as placeholder with `...`
  as the link text, call the backend, then replace `...` with the actual title
- The placeholder approach gives instant feedback — the user sees the markdown format
  immediately, title fills in async
- Use cursor position (`selectionStart`/`selectionEnd`) to insert at the right spot,
  not just append

### Wire into 3 components

Add `onPaste={pasteUrl.onPaste}` to the description `<textarea>` in:
1. `task-fields-body.tsx` line 374
2. `task-inspector.tsx` line 228
3. `thought-triage-drawer.tsx` line 258

### Regenerate API types

After backend endpoint is created:
```bash
cd frontend && npx orval
```

This generates the mutation hook automatically. The `usePasteUrl` hook will call
the raw API function directly (not via a mutation hook) since it's a fire-and-forget
operation that doesn't need cache invalidation.

## Files to Create/Modify

| File | Action |
|------|--------|
| `app/routers/url_utils.py` | **Create** — POST endpoint |
| `app/routers/v1/__init__.py` | **Modify** — register router |
| `frontend/src/hooks/use-paste-url.ts` | **Create** — shared paste hook |
| `frontend/src/components/task/task-fields-body.tsx` | **Modify** — add onPaste |
| `frontend/src/components/task/task-inspector.tsx` | **Modify** — add onPaste |
| `frontend/src/components/task/thought-triage-drawer.tsx` | **Modify** — add onPaste |

## Verification

```bash
# Backend
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test

# Frontend (after orval regen)
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```

Manual test:
- Paste `https://www.otto.de/p/hauss-spole-kinderkleiderschrank...` into description
- Should immediately show `[...](https://www.otto.de/p/hauss-spole...)` then update
  to `[HAUSS SPOLE Kinderkleiderschrank...](https://www.otto.de/p/hauss-spole...)`
- Paste plain text → no change (normal paste)
- Paste URL when server is unreachable → falls back to hostname as title
