---
version:
pr: 273
created: 2026-02-16
---

# Fix Plan My Day scheduling algorithm + make it pluggable

## Context

The Plan My Day feature — the app's core selling point — has a critical scheduling bug.
When a GCal event sits in the middle of the selected time range, tasks only get scheduled
**before** the event, never after it, even when there's plenty of free time remaining.

**Root cause** (`static/js/plan-tasks.js:85-132`): The greedy bin-packing algorithm
tracks a single `slotIndex`/`currentPosition` pointer. When a task doesn't fit in the
remaining space of the current free slot, the algorithm **skips the task** but never
advances to the next slot. The `slotIndex` only advances inside the `if (taskDuration <=
remainingInSlot)` block (line 121), so it's impossible to reach subsequent slots via
the skip path.

**Example:** Selection 9am-5pm, GCal event 12pm-1pm, tasks = [30m, 60m, 120m, 15m]:
- Free slots: [9-12am (180m), 1-5pm (240m)]
- 30m → slot 0 at 9:00 (150m left)
- 60m → slot 0 at 9:30 (90m left)
- 120m → doesn't fit in slot 0's 90m remaining → **SKIPPED** (never tries slot 1's 240m!)
- 15m → slot 0 at 10:30 (75m left)
- Result: 1pm-5pm is completely empty. The 120m task was never scheduled.

The user also wants the scheduler to be **pluggable** for future features: configurable
gaps/buffers between tasks and around events, priority-weighted scheduling, etc.

## Plan

### Step 1: Rewrite `SmartStrategy.schedule()` with per-slot cursors

Replace the single `slotIndex`/`currentPosition` tracking with a slot-state array where
each free slot maintains its own cursor. For each task, scan all slots to find the first
one with enough remaining space.

```javascript
schedule(tasks, occupiedSlots, targetRange, config = {}) {
    const bufferBetween = config.bufferBetweenTasks || 0;
    const sortedTasks = this._sortTasks(tasks, config);
    const freeSlots = this._findFreeSlots(occupiedSlots, targetRange, config);

    const slotState = freeSlots.map(s => ({ ...s, cursor: s.startMins }));
    const scheduled = [];

    for (const task of sortedTasks) {
        const dur = task.duration || DEFAULT_TASK_DURATION;

        for (const slot of slotState) {
            const remaining = slot.endMins - slot.cursor;
            if (dur <= remaining) {
                scheduled.push({
                    task,
                    startMins: slot.cursor,
                    endMins: slot.cursor + dur,
                });
                slot.cursor = Math.min(slot.cursor + dur + bufferBetween, slot.endMins);
                break;
            }
        }
    }

    return scheduled;
}
```

Key changes:
- **Per-slot cursor**: Each slot tracks how full it is independently
- **First-fit across all slots**: When a task doesn't fit in slot 0, it tries slot 1, 2, etc.
- **Buffer support**: After placing a task, cursor advances by `duration + bufferBetweenTasks`

### Step 2: Add buffer support to `_findFreeSlots()`

Accept config for buffers around calendar events:

```javascript
_findFreeSlots(occupiedSlots, targetRange, config = {}) {
    const bufferBefore = config.bufferBeforeEvent || 0;
    const bufferAfter = config.bufferAfterEvent || 0;

    // Apply buffers to occupied slots
    const buffered = occupiedSlots.map(s => ({
        startMins: s.startMins - bufferBefore,
        endMins: s.endMins + bufferAfter,
    }));

    // ... rest of existing slot-gap logic using `buffered` instead of `occupiedSlots`
}
```

### Step 3: Extract `_sortTasks()` as a configurable method

Move sorting logic out of `schedule()` into its own method that respects config:

```javascript
_sortTasks(tasks, config = {}) {
    return [...tasks].sort((a, b) => {
        // 1. Tasks with matching due date first (always)
        if (a.hasMatchingDate && !b.hasMatchingDate) return -1;
        if (!a.hasMatchingDate && b.hasMatchingDate) return 1;

        // 2. Higher impact first (when priorityWeight is set)
        if (config.priorityWeight) {
            const pw = config.priorityWeight;
            const priDiff = (b.priority * pw) - (a.priority * pw);
            if (priDiff !== 0) return priDiff;
        }

        // 3. Smaller duration first (fit more tasks)
        if (a.duration !== b.duration) return a.duration - b.duration;

        // 4. Higher priority as tiebreaker
        return b.priority - a.priority;
    });
}
```

### Step 4: Add `SchedulerConfig` and wire it through `executePlan()`

Define a config object that strategies receive. For now, defaults are all zero/off
so behavior is identical to current (minus the bug). Config can be set via the public API
for future UI controls.

```javascript
const DEFAULT_CONFIG = {
    bufferBeforeEvent: 0,   // minutes before calendar events to keep free
    bufferAfterEvent: 0,    // minutes after calendar events to keep free
    bufferBetweenTasks: 0,  // minutes between consecutive scheduled tasks
    priorityWeight: 0,      // 0 = duration-first (default), >0 = priority matters more
};
```

In `executePlan()` (line 999), pass config to the strategy:

```javascript
const scheduled = currentStrategy.schedule(allTasks, occupiedSlots, targetRange, planConfig);
```

Add a public API method to update config:
```javascript
function setConfig(overrides) {
    Object.assign(planConfig, overrides);
}
```

### Step 5: Update strategy registry interface

The `registerStrategy()` contract now expects strategies to accept a 4th `config` param.
The existing `SmartStrategy` handles it. External strategies that don't use config still
work since JavaScript ignores extra arguments.

### Step 6: Update `test_js_module_contract.py`

Add contract tests verifying:
- `_sortTasks` method exists (extracted from schedule)
- Config-related exports exist (`setConfig`)
- Buffer-related code paths exist

## Files to modify

| File | Change |
|------|--------|
| `static/js/plan-tasks.js` | Rewrite scheduling algorithm, add config, extract sort |
| `tests/test_js_module_contract.py` | Add contract tests for new exports |

## Verification

1. **Manual test** — the core scenario:
   - Create a GCal event in the middle of the day (e.g., 12pm-1pm)
   - Have several unscheduled tasks with varying durations (including some > remaining slot space)
   - Click Plan, select 9am-5pm, click Plan Tasks
   - Verify tasks are scheduled both before AND after the event

2. **Manual test** — buffer behavior:
   - Open browser console
   - `PlanTasks.setConfig({ bufferBetweenTasks: 15 })`
   - Plan tasks → verify 15min gaps between each scheduled task

3. **Automated** — `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
