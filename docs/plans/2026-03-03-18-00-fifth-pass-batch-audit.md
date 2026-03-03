---
version: v0.56.16
pr: 624
created: 2026-03-03
---

# Fifth-Pass Batch Operations Audit Fix

## Context

Fifth and final UX audit of multi-select & batch operations found 1 new issue. Prior 4 audits fixed 35 issues. All 35 prior fixes verified as correctly implemented. 13 audit angles examined across 30+ files.

## Fix

### Fix 1: Context menu Complete/Reopen label uses raw `selectedIds.size` instead of resolved count (Minor)

**File:** `frontend/src/components/batch/batch-context-menu.tsx` — line 52

**Problem:** The FAB was fixed in audit #1 finding #11 to display `tasks.length + instances.length` (resolved count) instead of `selectedIds.size` (raw store size). The context menu was overlooked — it still uses `selectedIds.size` for the Complete/Reopen label. Within the same menu, Skip and Delete already use resolved counts (`instances.length`, `tasks.length`).

**Change:** Replace `const count = selectedIds.size` with `const count = tasks.length + instances.length`.

## Verification

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```
