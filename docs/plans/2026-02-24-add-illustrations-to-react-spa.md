---
version:
pr:
created: 2026-02-24
---

# Add SVG Illustrations to React SPA Empty States & Error Boundaries

## Context

21 hand-crafted SVG illustrations exist in `static/img/illustrations/` from the legacy Jinja2 frontend. The React SPA currently shows plain text for all empty states and error boundaries. This adds illustrations to the 5 highest-impact locations.

## Asset Strategy

Copy 4 SVGs to `frontend/public/illustrations/` (Vite serves these at `/illustrations/*` in both dev and prod, no proxy config needed):
- `empty-tasks.svg`, `empty-thoughts.svg`, `empty-analytics.svg`, `error-generic.svg`

## New Component

**`frontend/src/components/ui/empty-state.tsx`** — reusable EmptyState component:
- Props: `illustration?` (path), `title`, `description?`, `className?`, `children?`
- Pattern: follows existing shadcn/ui conventions (`cn()`, `data-slot`, `ComponentProps<"div">`)
- Default: `py-12`, centered, illustration at `h-20 w-20` (80px)
- Passes `...props` including `ref` (React 19 — no forwardRef needed)

## Changes (5 locations)

### 1. Task List Empty — `frontend/src/components/task/task-list.tsx:31-39`
Replace inline div with `<EmptyState illustration="/illustrations/empty-tasks.svg" title="No tasks to show" description="Tasks matching your filters will appear here" />`. Pass `ref={setNodeRef}` as prop (dnd-kit droppable).

### 2. Thoughts Empty — `frontend/src/routes/_authenticated/thoughts.lazy.tsx:230-234`
Replace inline div with `<EmptyState illustration="/illustrations/empty-thoughts.svg" title="No thoughts yet" description="Type below to capture your first thought" />`.

### 3. Analytics Error — `frontend/src/routes/_authenticated/analytics.lazy.tsx:108-113`
Replace inline div with `<EmptyState className="flex-1 p-8" illustration="/illustrations/empty-analytics.svg" title="Failed to load analytics" description="Try refreshing the page" />`.

### 4. Root Error Boundary — `frontend/src/routes/__root.tsx:50`
Add `<img src="/illustrations/error-generic.svg" alt="" aria-hidden="true" className="mx-auto h-20 w-20" />` above `<h1>`. Raw `<img>` (not EmptyState) — error boundaries are class components with custom layout, and fewer imports = more robust fallback.

### 5. App Error Boundary — `frontend/src/routes/_authenticated.tsx:114`
Same as #4 — add `<img>` above `<h2>`. Preserve existing RefreshCw icon in Reload button.

## Skipped Locations
- **Calendar anytime section** (`calendar-panel.tsx:644`) — 10px text in a tiny area, illustration would be out of place
- **Analytics "Recent Completions" card** (`analytics.lazy.tsx:311`) — small card within the page, text-only is appropriate
- **Parent task picker** — dropdown search, no room for illustration

## File Summary

| Action | File |
|--------|------|
| Create dir + 4 SVGs | `frontend/public/illustrations/` |
| Create | `frontend/src/components/ui/empty-state.tsx` |
| Modify | `frontend/src/components/task/task-list.tsx` |
| Modify | `frontend/src/routes/_authenticated/thoughts.lazy.tsx` |
| Modify | `frontend/src/routes/_authenticated/analytics.lazy.tsx` |
| Modify | `frontend/src/routes/__root.tsx` |
| Modify | `frontend/src/routes/_authenticated.tsx` |

## Verification

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```

Visual: check each location in dev server (empty task list, empty thoughts, analytics API failure, trigger error boundaries).
