---
version:
pr:
created: 2026-02-27
---

# Remove domain-switch toast from triage drawer

## Context

When selecting a parent task from a different domain in the triage drawer, the domain auto-switches and fires a `toast.info()`. This toast renders at the global `bottom-right` position (via Sonner at document root level), covering the drawer's footer buttons (Delete + Convert to Task). The user can't dismiss the toast without closing the drawer.

The domain row already flashes with the new domain's color for 600ms — this provides sufficient in-context feedback. The toast is redundant and harmful.

## Change

Remove the `toast.info(...)` call in `thought-triage-drawer.tsx` (around line 471). Keep the flash animation — it's the right feedback mechanism.

## File

- `frontend/src/components/task/thought-triage-drawer.tsx` — remove the `toast.info(...)` call inside the parent picker `onSelect` callback

## Verification

1. Open triage drawer, select a parent task from a different domain
2. Domain row should flash with new domain color
3. No toast should appear
4. Footer buttons (Delete + Convert) should remain fully accessible
