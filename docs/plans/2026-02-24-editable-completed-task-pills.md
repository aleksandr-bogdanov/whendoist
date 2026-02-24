---
version:
pr:
created: 2026-02-24
---

# Allow editing finished tasks via metadata pills

## Context

Currently, when a task is completed, the metadata pills (Impact, Clarity, Duration) render as read-only spans — users can't click them to change values. This forces users to reopen a task just to fix a metadata value. The change removes this restriction so pills remain interactive on completed tasks.

## Changes

**Single file:** `frontend/src/components/task/task-item.tsx`

Remove `disabled={isCompleted}` from all 6 pill instances:

1. **Main task pills** (lines 813, 818-821, 827):
   - `<ClarityPill>` — remove `disabled={isCompleted}`
   - `<DurationPill>` — remove `disabled={isCompleted}`
   - `<ImpactPill>` — remove `disabled={isCompleted}`

2. **Subtask pills** (lines 1235, 1240-1243, 1249):
   - `<ClarityPill>` — remove `disabled={isCompleted}`
   - `<DurationPill>` — remove `disabled={isCompleted}`
   - `<ImpactPill>` — remove `disabled={isCompleted}`

No backend changes needed — the `PUT /tasks/{task_id}` endpoint accepts updates regardless of task status.

## Verification

1. `cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build`
2. Manual: complete a task, verify pills are still clickable and can change impact/clarity/duration
