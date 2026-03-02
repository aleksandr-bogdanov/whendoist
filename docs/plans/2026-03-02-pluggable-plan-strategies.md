---
version: v0.55.85
pr: null
created: 2026-03-02
---

# Pluggable Plan My Day Strategies

Extract the current Plan My Day scheduling algorithm into a strategy interface so
new algorithms can be added later and made selectable in settings.

**Scope:** Refactor only — extract current behavior into the strategy pattern,
ship one strategy ("Compact"), no new algorithms or UI settings yet.

---

## Context

`planTasks()` in `calendar-utils.ts` currently hardcodes two decisions:
1. **Task sorting** — duration ASC, then impact ASC (pack more tasks)
2. **Slot selection** — first-fit (greedy, first available slot)

These are the two variability points. The rest (occupied range collection, free
slot finding, buffer logic) is infrastructure that all strategies share.

Future strategies might sort by priority-first, spread tasks out, or use
best-fit. This refactor makes those additions a matter of implementing two
functions instead of forking the entire planner.

---

## Plan

### 1. Define strategy interface (`calendar-utils.ts`)

```typescript
export type TaskSorter = (tasks: TaskResponse[]) => TaskResponse[];
export type SlotSelector = (
  task: TaskResponse,
  duration: number,
  slots: FreeSlot[],
) => number | null; // slot index, or null to skip

export interface PlanStrategy {
  id: string;
  label: string;
  description: string;
  sortTasks: TaskSorter;
  selectSlot: SlotSelector;
}
```

### 2. Extract current algorithm into `COMPACT_STRATEGY`

Move the existing sort + first-fit logic out of `planTasks()` into named functions:

- `compactSort` — current: `duration ASC → impact ASC`
- `firstFitSelect` — current: first slot with `remaining >= duration`

Register as:
```typescript
export const COMPACT_STRATEGY: PlanStrategy = {
  id: "compact",
  label: "Compact",
  description: "Pack as many tasks as possible into the time range",
  sortTasks: compactSort,
  selectSlot: firstFitSelect,
};

export const PLAN_STRATEGIES: Record<string, PlanStrategy> = {
  compact: COMPACT_STRATEGY,
};
```

### 3. Update `planTasks()` signature

Add optional `strategy` parameter (defaults to `COMPACT_STRATEGY`):

```typescript
export function planTasks(
  tasks: TaskResponse[],
  events: EventResponse[],
  dateStr: string,
  rangeStartMinutes: number,
  rangeEndMinutes: number,
  scheduledTasks?: TaskResponse[],
  instances?: InstanceResponse[],
  strategy?: PlanStrategy,         // ← new, defaults to COMPACT_STRATEGY
): PlannedTask[]
```

Inside the function, replace the hardcoded sort and slot loop:
- `strategy.sortTasks([...tasks])` instead of inline sort
- `strategy.selectSlot(task, duration, freeSlots)` instead of inline loop

### 4. Add `planStrategy` to UI store (`ui-store.ts`)

```typescript
planStrategy: string;           // default: "compact"
setPlanStrategy: (id: string) => void;
```

Persisted to localStorage via the existing Zustand `persist` middleware.

### 5. Wire through `handlePlanExecute` (`calendar-panel.tsx`)

Read strategy from store, look up in registry, pass to `planTasks()`:

```typescript
const { planStrategy: strategyId } = useUIStore();
// ...
const strategy = PLAN_STRATEGIES[strategyId] ?? COMPACT_STRATEGY;
const planned = planTasks(filtered, safeEvents, targetDate, startMinutes, endMinutes,
  safeAllStatusTasks, safeInstances, strategy);
```

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/lib/calendar-utils.ts` | Define `PlanStrategy` interface, extract `COMPACT_STRATEGY`, add `PLAN_STRATEGIES` registry, update `planTasks()` signature |
| `frontend/src/stores/ui-store.ts` | Add `planStrategy` + `setPlanStrategy` to store |
| `frontend/src/components/calendar/calendar-panel.tsx` | Read strategy from store, pass to `planTasks()` |

No backend changes. No new files. No UI additions.

---

## Verification

1. `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — no type errors
2. `cd frontend && npx biome check .` — no lint errors
3. `cd frontend && npm run build` — production build succeeds
4. Manual: Plan My Day with a 2-hour slot → same behavior as before (compact strategy is the default and only option)
