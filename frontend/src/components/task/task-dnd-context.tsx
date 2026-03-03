import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  type Modifier,
  type Over,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import type { InstanceResponse, SubtaskResponse, TaskResponse } from "@/api/model";
import {
  getListInstancesApiV1InstancesGetQueryKey,
  scheduleInstanceApiV1InstancesInstanceIdSchedulePut,
  useScheduleInstanceApiV1InstancesInstanceIdSchedulePut,
} from "@/api/queries/instances/instances";
import {
  updateTaskApiV1TasksTaskIdPut,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { announce } from "@/components/live-announcer";
import { addDays, offsetToTime, PREV_DAY_START_HOUR, toDateString } from "@/lib/calendar-utils";
import { dashboardTasksKey } from "@/lib/query-keys";
import { formatScheduleTarget } from "@/lib/task-utils";
import { instanceSelectionId, taskSelectionId, useSelectionStore } from "@/stores/selection-store";
import { useUIStore } from "@/stores/ui-store";
import { BatchDragOverlay, TaskDragOverlay } from "./task-drag-overlay";

// --- DnD state context (shared with TaskItem for drop-target validation) ---
interface DndStateContextValue {
  activeId: UniqueIdentifier | null;
  activeTask: TaskResponse | null;
}

const DndStateCtx = createContext<DndStateContextValue>({
  activeId: null,
  activeTask: null,
});

export function useDndState() {
  return useContext(DndStateCtx);
}

export interface DragState {
  activeId: UniqueIdentifier | null;
  activeTask: TaskResponse | null;
  activeInstance: InstanceResponse | null;
  overId: UniqueIdentifier | null;
  overType:
    | "task"
    | "calendar"
    | "task-list"
    | "anytime"
    | "date-group"
    | "reparent"
    | "promote"
    | null;
  /** True when dragging a task that belongs to the multi-selection set */
  isBatchDrag: boolean;
  /** Number of OTHER selected items (excluding the anchor) */
  batchCount: number;
}

interface TaskDndContextProps {
  tasks: TaskResponse[];
  children: React.ReactNode;
}

/**
 * Update a task or subtask in the cache array.
 * For top-level tasks, updates directly. For subtasks, updates within the parent's subtasks array.
 */
function updateTaskOrSubtaskInCache(
  tasks: TaskResponse[],
  taskId: number,
  updates: Record<string, unknown>,
): TaskResponse[] {
  // Try top-level first
  const isTopLevel = tasks.some((t) => t.id === taskId);
  if (isTopLevel) {
    return tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t));
  }
  // Otherwise update inside parent's subtasks
  return tasks.map((t) => {
    if (!t.subtasks?.some((st) => st.id === taskId)) return t;
    return {
      ...t,
      subtasks: t.subtasks.map((st) => (st.id === taskId ? { ...st, ...updates } : st)),
    };
  });
}

/** Parse a draggable/droppable ID to extract the numeric task ID. Handles prefixed IDs. */
function parseTaskId(id: UniqueIdentifier): number {
  const s = String(id);
  if (s.startsWith("anytime-task-")) {
    return Number.parseInt(s.replace("anytime-task-", ""), 10);
  }
  if (s.startsWith("scheduled-task-")) {
    return Number.parseInt(s.replace("scheduled-task-", ""), 10);
  }
  if (s.startsWith("task-drop-")) {
    return Number.parseInt(s.replace("task-drop-", ""), 10);
  }
  return typeof id === "string" ? Number.parseInt(id, 10) : Number(id);
}

/** Convert "HH:MM:SS" time string to total minutes since midnight */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Convert total minutes since midnight to "HH:MM:SS" time string */
function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** Compute day difference between two YYYY-MM-DD date strings */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Describes a selected item participating in a batch drag — enough info
 * to compute the delta and fire the correct mutation.
 */
interface BatchItem {
  type: "task" | "instance";
  id: number;
  date: string | null;
  /** "HH:MM:SS" or null for anytime tasks */
  time: string | null;
  title: string;
}

/**
 * Apply a (daysDelta, minutesDelta) to a single BatchItem.
 * Returns the new { date, time } — handles wrap-past-midnight and clamp-negative-time.
 */
function applyDelta(
  item: BatchItem,
  daysDelta: number,
  minutesDelta: number,
): { date: string; time: string | null } {
  const baseDate = item.date ?? toDateString(new Date());
  // Anytime tasks: only shift days, stay anytime
  if (!item.time) {
    return { date: addDays(baseDate, daysDelta), time: null };
  }
  let newMinutes = timeToMinutes(item.time) + minutesDelta;
  let extraDays = 0;
  // Wrap past midnight: ≥1440 → next day
  while (newMinutes >= 1440) {
    newMinutes -= 1440;
    extraDays++;
  }
  // Clamp negative time: < 0 → 00:00 (don't go to previous day)
  if (newMinutes < 0) {
    newMinutes = 0;
  }
  return {
    date: addDays(baseDate, daysDelta + extraDays),
    time: minutesToTime(newMinutes),
  };
}

/**
 * Custom collision detection: pointer-within first, then rect intersection,
 * then closest-center. The calendar overlay droppable sits outside scroll
 * containers so dnd-kit's Rect measurement works correctly.
 */
const customCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);

  if (pointerCollisions.length > 0) {
    // Priority: date-group → anytime → calendar-overlay → task-drop (reparent) → task-list → other
    const dateGroupHit = pointerCollisions.find((c) => String(c.id).startsWith("date-group-"));
    if (dateGroupHit) return [dateGroupHit];
    const anytimeHit = pointerCollisions.find((c) => String(c.id).startsWith("anytime-drop-"));
    if (anytimeHit) return [anytimeHit];
    const calendarHit = pointerCollisions.find((c) => String(c.id).startsWith("calendar-overlay-"));
    if (calendarHit) return [calendarHit];
    const promoteHit = pointerCollisions.find(
      (c) => String(c.id) === "task-list-promote" || String(c.id).startsWith("task-gap-"),
    );
    if (promoteHit) return [promoteHit];
    const taskDropHit = pointerCollisions.find((c) => String(c.id).startsWith("task-drop-"));
    if (taskDropHit) return [taskDropHit];
    const taskGapHit = pointerCollisions.find((c) => String(c.id).startsWith("task-gap-"));
    if (taskGapHit) return [taskGapHit];
    const taskListHit = pointerCollisions.find((c) => String(c.id).startsWith("task-list-"));
    if (taskListHit) return [taskListHit];
    return pointerCollisions;
  }

  const rectCollisions = rectIntersection(args);
  if (rectCollisions.length > 0) {
    const calendarHit = rectCollisions.find((c) => String(c.id).startsWith("calendar-overlay-"));
    if (calendarHit) return [calendarHit];
    return rectCollisions;
  }

  return closestCenter(args);
};

export function TaskDndContext({ tasks, children }: TaskDndContextProps) {
  const queryClient = useQueryClient();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();
  const scheduleInstance = useScheduleInstanceApiV1InstancesInstanceIdSchedulePut();
  const { calendarHourHeight } = useUIStore();

  // Track real pointer position for accurate calendar drops (bypasses dnd-kit delta drift)
  const lastPointerRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("pointermove", handler);
    return () => document.removeEventListener("pointermove", handler);
  }, []);

  const [dragState, setDragState] = useState<DragState>({
    activeId: null,
    activeTask: null,
    activeInstance: null,
    overId: null,
    overType: null,
    isBatchDrag: false,
    batchCount: 0,
  });

  // Sensors: pointer for mouse, touch with delay to avoid conflicts with swipe
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  );

  const findTask = useCallback(
    (id: UniqueIdentifier): TaskResponse | null => {
      const numId = parseTaskId(id);
      // Search top-level tasks and their subtasks
      for (const task of tasks) {
        if (task.id === numId) return task;
        if (task.subtasks) {
          for (const st of task.subtasks) {
            if (st.id === numId) {
              // Return subtask as a partial task response for drag purposes
              return {
                ...st,
                parent_id: task.id,
                subtasks: [],
              } as unknown as TaskResponse;
            }
          }
        }
      }
      return null;
    },
    [tasks],
  );

  const getOverType = useCallback(
    (
      over: Over | null,
    ):
      | "task"
      | "calendar"
      | "task-list"
      | "anytime"
      | "date-group"
      | "reparent"
      | "promote"
      | null => {
      if (!over) return null;
      const id = String(over.id);
      if (id.startsWith("date-group-")) return "date-group";
      if (id.startsWith("anytime-drop-")) return "anytime";
      if (id.startsWith("calendar-overlay-")) return "calendar";
      if (id.startsWith("task-drop-")) return "reparent";
      if (id.startsWith("task-gap-")) return "promote";
      if (id === "task-list-promote") return "task-list";
      if (id.startsWith("task-gap-")) return "task-list";
      if (id.startsWith("task-list-")) return "task-list";
      return "task";
    },
    [],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      grabRatioRef.current = null; // Reset so next modifier call captures fresh ratio
      // Seed lastPointerRef so the first modifier frame has accurate position
      const ev = event.activatorEvent;
      if (ev instanceof TouchEvent && ev.touches[0]) {
        lastPointerRef.current = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      } else if (ev instanceof PointerEvent) {
        lastPointerRef.current = { x: ev.clientX, y: ev.clientY };
      }
      const activeIdStr = String(event.active.id);
      const isInstance = activeIdStr.startsWith("instance-");
      const task = isInstance ? null : findTask(event.active.id);
      const instance = isInstance
        ? ((event.active.data.current?.instance as InstanceResponse | null) ?? null)
        : null;

      // Detect batch drag: is the dragged item part of the multi-selection?
      const selectedIds = useSelectionStore.getState().selectedIds;
      let isBatch = false;
      let batchCount = 0;
      if (selectedIds.size > 1) {
        const selKey = isInstance
          ? instanceSelectionId(Number.parseInt(activeIdStr.replace("instance-", ""), 10))
          : taskSelectionId(parseTaskId(event.active.id));
        if (selectedIds.has(selKey)) {
          isBatch = true;
          batchCount = selectedIds.size - 1; // exclude the anchor
        }
      }

      setDragState({
        activeId: event.active.id,
        activeTask: task,
        activeInstance: instance,
        overId: null,
        overType: null,
        isBatchDrag: isBatch,
        batchCount,
      });
    },
    [findTask],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const overType = getOverType(event.over);
      setDragState((prev) => ({
        ...prev,
        overId: event.over?.id ?? null,
        overType,
      }));
    },
    [getOverType],
  );

  const handleInstanceDrop = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return false;

      const activeIdStr = String(active.id);
      if (!activeIdStr.startsWith("instance-")) return false;

      const instanceId = Number.parseInt(activeIdStr.replace("instance-", ""), 10);
      const instance = active.data.current?.instance as InstanceResponse | undefined;
      const overId = String(over.id);

      const invalidateInstances = () => {
        queryClient.invalidateQueries({ queryKey: getListInstancesApiV1InstancesGetQueryKey() });
        queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
      };

      // --- Instance drop onto anytime: unschedule (clear time) ---
      if (overId.startsWith("anytime-drop-")) {
        const prevDatetime = instance?.scheduled_datetime ?? null;
        if (!prevDatetime) return true; // Already unscheduled, no-op

        const previousInstances = queryClient.getQueryData(
          getListInstancesApiV1InstancesGetQueryKey(),
        );
        queryClient.setQueryData(
          getListInstancesApiV1InstancesGetQueryKey(),
          (old: InstanceResponse[] | undefined) =>
            old?.map((i) => (i.id === instanceId ? { ...i, scheduled_datetime: null } : i)),
        );

        scheduleInstance.mutate(
          { instanceId, data: { scheduled_datetime: null } },
          {
            onSuccess: () => {
              invalidateInstances();
              announce("Instance unscheduled");
              toast.success(`Unscheduled "${instance?.task_title ?? "Instance"}"`, {
                id: `unschedule-inst-${instanceId}`,
                action: {
                  label: "Undo",
                  onClick: () => {
                    queryClient.setQueryData(
                      getListInstancesApiV1InstancesGetQueryKey(),
                      (old: InstanceResponse[] | undefined) =>
                        old?.map((i) =>
                          i.id === instanceId ? { ...i, scheduled_datetime: prevDatetime } : i,
                        ),
                    );
                    scheduleInstance.mutate(
                      { instanceId, data: { scheduled_datetime: prevDatetime } },
                      {
                        onSuccess: () => invalidateInstances(),
                        onError: () => toast.error("Undo failed"),
                      },
                    );
                  },
                },
              });
            },
            onError: () => {
              queryClient.setQueryData(
                getListInstancesApiV1InstancesGetQueryKey(),
                previousInstances,
              );
              toast.error("Failed to unschedule instance", {
                id: `unschedule-inst-err-${instanceId}`,
              });
            },
          },
        );
        return true;
      }

      // --- Instance drop onto calendar: reschedule to specific time ---
      if (overId.startsWith("calendar-overlay-")) {
        const droppableData = over.data.current as {
          centerDate: string;
          prevDate: string;
          nextDate: string;
          boundaries: { prevEnd: number; currentStart: number; currentEnd: number };
          getScrollTop: () => number;
          getCalendarRect?: () => DOMRect | null;
        };

        const calRect = droppableData.getCalendarRect?.();
        const calTop = calRect?.top ?? over.rect.top;
        const scrollTop = droppableData.getScrollTop();
        const pointerY = lastPointerRef.current.y;
        const offsetY = pointerY - calTop + scrollTop;

        let dateStr: string;
        let startHour: number;
        if (offsetY < droppableData.boundaries.prevEnd) {
          dateStr = droppableData.prevDate;
          startHour = PREV_DAY_START_HOUR;
        } else if (offsetY < droppableData.boundaries.currentEnd) {
          dateStr = droppableData.centerDate;
          startHour = 0;
        } else {
          dateStr = droppableData.nextDate;
          startHour = 0;
        }

        const sectionTop =
          offsetY < droppableData.boundaries.prevEnd
            ? 0
            : offsetY < droppableData.boundaries.currentEnd
              ? droppableData.boundaries.currentStart
              : droppableData.boundaries.currentEnd;
        const sectionOffsetY = offsetY - sectionTop;

        const { hour, minutes } = offsetToTime(sectionOffsetY, calendarHourHeight, startHour);
        const scheduledTime = `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
        const scheduledDatetime = `${dateStr}T${scheduledTime}`;

        const prevDatetime = instance?.scheduled_datetime ?? null;

        // No-op if same datetime
        if (prevDatetime === scheduledDatetime) return true;

        const previousInstances = queryClient.getQueryData(
          getListInstancesApiV1InstancesGetQueryKey(),
        );
        queryClient.setQueryData(
          getListInstancesApiV1InstancesGetQueryKey(),
          (old: InstanceResponse[] | undefined) =>
            old?.map((i) =>
              i.id === instanceId ? { ...i, scheduled_datetime: scheduledDatetime } : i,
            ),
        );

        scheduleInstance.mutate(
          { instanceId, data: { scheduled_datetime: scheduledDatetime } },
          {
            onSuccess: () => {
              invalidateInstances();
              announce("Instance rescheduled");
              toast.success(
                `Rescheduled "${instance?.task_title ?? "Instance"}" to ${formatScheduleTarget(dateStr, scheduledTime)}`,
                {
                  id: `reschedule-inst-${instanceId}`,
                  action: {
                    label: "Undo",
                    onClick: () => {
                      queryClient.setQueryData(
                        getListInstancesApiV1InstancesGetQueryKey(),
                        (old: InstanceResponse[] | undefined) =>
                          old?.map((i) =>
                            i.id === instanceId ? { ...i, scheduled_datetime: prevDatetime } : i,
                          ),
                      );
                      scheduleInstance.mutate(
                        { instanceId, data: { scheduled_datetime: prevDatetime } },
                        {
                          onSuccess: () => invalidateInstances(),
                          onError: () => toast.error("Undo failed"),
                        },
                      );
                    },
                  },
                },
              );
            },
            onError: () => {
              queryClient.setQueryData(
                getListInstancesApiV1InstancesGetQueryKey(),
                previousInstances,
              );
              toast.error("Failed to reschedule instance", {
                id: `reschedule-inst-err-${instanceId}`,
              });
            },
          },
        );
        return true;
      }

      return false; // Instance dropped on unsupported zone
    },
    [queryClient, scheduleInstance, calendarHourHeight],
  );

  // ── Batch drag handler ─────────────────────────────────────────────────
  const handleBatchDrop = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || !active) return;

      const overId = String(over.id);
      const activeIdStr = String(active.id);
      const isAnchorInstance = activeIdStr.startsWith("instance-");

      // Resolve all selected items into BatchItems
      const selectedIds = useSelectionStore.getState().selectedIds;
      const cachedTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey()) ?? [];
      const cachedInstances =
        queryClient.getQueryData<InstanceResponse[]>(getListInstancesApiV1InstancesGetQueryKey()) ??
        [];

      const batchItems: BatchItem[] = [];
      let anchorItem: BatchItem | null = null;

      for (const selId of selectedIds) {
        if (selId.startsWith("task-")) {
          const numId = Number.parseInt(selId.replace("task-", ""), 10);
          const t = cachedTasks.find((x) => x.id === numId);
          if (!t) continue;
          const item: BatchItem = {
            type: "task",
            id: numId,
            date: t.scheduled_date,
            time: t.scheduled_time,
            title: t.title,
          };
          batchItems.push(item);
          // Match anchor: check all prefixed forms of draggable IDs
          if (
            !isAnchorInstance &&
            (activeIdStr === `anytime-task-${numId}` ||
              activeIdStr === `scheduled-task-${numId}` ||
              activeIdStr === String(numId))
          ) {
            anchorItem = item;
          }
        } else if (selId.startsWith("instance-")) {
          const numId = Number.parseInt(selId.replace("instance-", ""), 10);
          const inst = cachedInstances.find((x) => x.id === numId);
          if (!inst) continue;
          let instTime: string | null = null;
          if (inst.scheduled_datetime) {
            const dt = new Date(inst.scheduled_datetime);
            instTime = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:00`;
          }
          const item: BatchItem = {
            type: "instance",
            id: numId,
            date: inst.instance_date,
            time: instTime,
            title: inst.task_title,
          };
          batchItems.push(item);
          if (isAnchorInstance && activeIdStr === `instance-${numId}`) {
            anchorItem = item;
          }
        }
      }

      if (!anchorItem || batchItems.length === 0) return;

      // ── Compute drop target (date + time) based on drop zone ──
      let dropDate: string | null = null;
      let dropTime: string | null = null; // null = anytime drop or date-group drop
      let isAnytimeDrop = false;
      let isDateGroupDrop = false;

      if (overId.startsWith("calendar-overlay-")) {
        // Calendar time slot drop — full date + time
        const droppableData = over.data.current as {
          centerDate: string;
          prevDate: string;
          nextDate: string;
          boundaries: { prevEnd: number; currentStart: number; currentEnd: number };
          getScrollTop: () => number;
          getCalendarRect?: () => DOMRect | null;
        };
        const calRect = droppableData.getCalendarRect?.();
        const calTop = calRect?.top ?? over.rect.top;
        const scrollTop = droppableData.getScrollTop();
        const pointerY = lastPointerRef.current.y;
        const offsetY = pointerY - calTop + scrollTop;

        if (offsetY < droppableData.boundaries.prevEnd) {
          dropDate = droppableData.prevDate;
          const sectionOffsetY = offsetY;
          const { hour, minutes } = offsetToTime(
            sectionOffsetY,
            calendarHourHeight,
            PREV_DAY_START_HOUR,
          );
          dropTime = `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
        } else if (offsetY < droppableData.boundaries.currentEnd) {
          dropDate = droppableData.centerDate;
          const sectionOffsetY = offsetY - droppableData.boundaries.currentStart;
          const { hour, minutes } = offsetToTime(sectionOffsetY, calendarHourHeight, 0);
          dropTime = `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
        } else {
          dropDate = droppableData.nextDate;
          const sectionOffsetY = offsetY - droppableData.boundaries.currentEnd;
          const { hour, minutes } = offsetToTime(sectionOffsetY, calendarHourHeight, 0);
          dropTime = `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
        }
      } else if (overId.startsWith("anytime-drop-")) {
        dropDate = String(over.data.current?.dateStr ?? "");
        dropTime = null;
        isAnytimeDrop = true;
      } else if (overId.startsWith("date-group-")) {
        dropDate = String(over.data.current?.dateStr ?? "");
        dropTime = null;
        isDateGroupDrop = true;
      } else if (overId.startsWith("task-drop-")) {
        // Batch reparenting is blocked — only single-task reparent allowed (§7)
        toast.error("Batch reparenting is not supported — drop one task at a time");
        return;
      } else {
        // Unsupported drop zone for batch drag — do nothing
        return;
      }

      if (!dropDate) return;

      // ── Compute delta from anchor's old position to drop position ──
      const anchorDate = anchorItem.date ?? toDateString(new Date());
      const daysDelta = daysBetween(anchorDate, dropDate);
      let minutesDelta = 0;
      if (dropTime && anchorItem.time) {
        minutesDelta = timeToMinutes(dropTime) - timeToMinutes(anchorItem.time);
      }

      // Detect task-list-to-calendar batch: anchor has no time (unscheduled).
      // In this case, stack tasks with 5-min gaps starting at the drop time (§7).
      const isStackDrop = dropTime && !anchorItem.time && !isAnytimeDrop && !isDateGroupDrop;

      // ── Snapshot for undo ──
      const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());
      const previousInstances = queryClient.getQueryData<InstanceResponse[]>(
        getListInstancesApiV1InstancesGetQueryKey(),
      );

      // ── Build updates per item ──
      const taskUpdates: { id: number; date: string; time: string | null; title: string }[] = [];
      const instanceUpdates: { id: number; datetime: string | null; title: string }[] = [];

      // For stack drops, track the running time offset (5-min gaps per task duration)
      let stackMinutes = dropTime ? timeToMinutes(dropTime) : 0;
      const STACK_GAP_MINUTES = 5;

      for (const item of batchItems) {
        if (isAnytimeDrop) {
          // All become anytime; preserve relative day offsets from anchor
          const itemDayOffset = item.date ? daysBetween(anchorDate, item.date) : 0;
          const newDate = addDays(dropDate, itemDayOffset);
          if (item.type === "task") {
            taskUpdates.push({ id: item.id, date: newDate, time: null, title: item.title });
          } else {
            instanceUpdates.push({ id: item.id, datetime: null, title: item.title });
          }
        } else if (isDateGroupDrop) {
          // All move to the target date; times preserved; no day offsets
          if (item.type === "task") {
            taskUpdates.push({ id: item.id, date: dropDate, time: item.time, title: item.title });
          } else {
            const newDatetime = item.time ? `${dropDate}T${item.time}` : null;
            instanceUpdates.push({ id: item.id, datetime: newDatetime, title: item.title });
          }
        } else if (isStackDrop) {
          // Task-list-to-calendar: stack with 5-min gaps (like plan-my-day placement)
          const stackTime = minutesToTime(Math.min(stackMinutes, 1439));
          if (item.type === "task") {
            taskUpdates.push({ id: item.id, date: dropDate, time: stackTime, title: item.title });
          } else {
            instanceUpdates.push({
              id: item.id,
              datetime: `${dropDate}T${stackTime}`,
              title: item.title,
            });
          }
          // Advance by task duration (or default 30m) + 5-min gap
          const lookupTask = cachedTasks.find((t) => t.id === item.id);
          const dur = lookupTask?.duration_minutes ?? 30;
          stackMinutes += dur + STACK_GAP_MINUTES;
        } else {
          // Calendar time slot: apply time+day delta, preserving cross-day relative offsets
          const { date: newDate, time: newTime } = applyDelta(item, daysDelta, minutesDelta);
          if (item.type === "task") {
            taskUpdates.push({ id: item.id, date: newDate, time: newTime, title: item.title });
          } else {
            const newDatetime = newTime ? `${newDate}T${newTime}` : null;
            instanceUpdates.push({ id: item.id, datetime: newDatetime, title: item.title });
          }
        }
      }

      // ── Optimistic cache updates ──
      if (taskUpdates.length > 0) {
        queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) => {
          if (!old) return old;
          let updated = old;
          for (const u of taskUpdates) {
            updated = updateTaskOrSubtaskInCache(updated, u.id, {
              scheduled_date: u.date,
              scheduled_time: u.time,
            });
          }
          return updated;
        });
      }
      if (instanceUpdates.length > 0) {
        queryClient.setQueryData<InstanceResponse[]>(
          getListInstancesApiV1InstancesGetQueryKey(),
          (old) => {
            if (!old) return old;
            return old.map((inst) => {
              const u = instanceUpdates.find((x) => x.id === inst.id);
              if (!u) return inst;
              return { ...inst, scheduled_datetime: u.datetime };
            });
          },
        );
      }

      // ── Fire mutations (parallel via Promise.allSettled) ──
      const totalCount = taskUpdates.length + instanceUpdates.length;
      const mutations: Promise<unknown>[] = [];

      for (const u of taskUpdates) {
        mutations.push(
          updateTaskApiV1TasksTaskIdPut(u.id, {
            scheduled_date: u.date,
            scheduled_time: u.time,
          }),
        );
      }
      for (const u of instanceUpdates) {
        mutations.push(
          scheduleInstanceApiV1InstancesInstanceIdSchedulePut(u.id, {
            scheduled_datetime: u.datetime,
          }),
        );
      }

      Promise.allSettled(mutations).then((results) => {
        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        const failed = totalCount - succeeded;

        queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
        queryClient.invalidateQueries({ queryKey: getListInstancesApiV1InstancesGetQueryKey() });

        if (failed === 0) {
          announce(`Moved ${totalCount} ${totalCount === 1 ? "task" : "tasks"}`);
          toast.success(
            `Moved ${totalCount} ${totalCount === 1 ? "task" : "tasks"} to ${formatScheduleTarget(dropDate, dropTime)}`,
            {
              id: `batch-move-${Date.now()}`,
              action: {
                label: "Undo",
                onClick: () => {
                  // Restore full snapshots immediately for instant UI feedback
                  if (previousTasks) queryClient.setQueryData(dashboardTasksKey(), previousTasks);
                  if (previousInstances)
                    queryClient.setQueryData(
                      getListInstancesApiV1InstancesGetQueryKey(),
                      previousInstances,
                    );
                  // Fire reverse mutations via raw API calls (not useMutation hooks)
                  const undoMutations: Promise<unknown>[] = [];
                  for (const item of batchItems) {
                    if (item.type === "task") {
                      undoMutations.push(
                        updateTaskApiV1TasksTaskIdPut(item.id, {
                          scheduled_date: item.date,
                          scheduled_time: item.time,
                        }),
                      );
                    } else {
                      const origDatetime =
                        item.time && item.date ? `${item.date}T${item.time}` : null;
                      undoMutations.push(
                        scheduleInstanceApiV1InstancesInstanceIdSchedulePut(item.id, {
                          scheduled_datetime: origDatetime,
                        }),
                      );
                    }
                  }
                  Promise.allSettled(undoMutations).then((results) => {
                    queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
                    queryClient.invalidateQueries({
                      queryKey: getListInstancesApiV1InstancesGetQueryKey(),
                    });
                    if (results.some((r) => r.status === "rejected")) {
                      toast.error("Undo partially failed");
                    }
                  });
                },
              },
            },
          );
        } else if (succeeded > 0) {
          toast.warning(`Moved ${succeeded} of ${totalCount} tasks. ${failed} failed.`, {
            id: `batch-move-partial-${Date.now()}`,
          });
        } else {
          // All failed — restore snapshots
          if (previousTasks) queryClient.setQueryData(dashboardTasksKey(), previousTasks);
          if (previousInstances)
            queryClient.setQueryData(
              getListInstancesApiV1InstancesGetQueryKey(),
              previousInstances,
            );
          toast.error(`Failed to move ${totalCount} tasks`, {
            id: `batch-move-err-${Date.now()}`,
          });
        }

        // Clear selection after successful drop (§3: "selection cleared after drop")
        useSelectionStore.getState().clear();
      });
    },
    [queryClient, calendarHourHeight],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      // Capture batch state before clearing drag
      const wasBatchDrag = dragState.isBatchDrag;
      setDragState({
        activeId: null,
        activeTask: null,
        activeInstance: null,
        overId: null,
        overType: null,
        isBatchDrag: false,
        batchCount: 0,
      });

      if (!over || !active) return;

      // ── Batch drag: apply delta to all selected items ─────────────
      if (wasBatchDrag) {
        handleBatchDrop(event);
        return;
      }

      // Handle instance drops first
      if (handleInstanceDrop(event)) return;

      const activeId = parseTaskId(active.id);
      const overId = String(over.id);

      // --- Drop onto anytime section: schedule date-only ---
      if (overId.startsWith("anytime-drop-")) {
        const dateStr = String(over.data.current?.dateStr ?? "");

        // Capture previous state for undo
        const task = findTask(active.id);
        const prevDate = task?.scheduled_date ?? null;
        const prevTime = task?.scheduled_time ?? null;

        // No-op if already anytime on same date
        if (prevDate === dateStr && !prevTime) return;

        const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());
        queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) => {
          if (!old) return old;
          return updateTaskOrSubtaskInCache(old, activeId, {
            scheduled_date: dateStr,
            scheduled_time: null,
          });
        });

        updateTask.mutate(
          {
            taskId: activeId,
            data: { scheduled_date: dateStr, scheduled_time: null },
          },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
              const taskTitle = task?.title ?? "Task";
              announce("Task scheduled");
              toast.success(`Scheduled "${taskTitle}" for ${formatScheduleTarget(dateStr)}`, {
                id: `anytime-${activeId}`,
                action: {
                  label: "Undo",
                  onClick: () => {
                    updateTask.mutate(
                      {
                        taskId: activeId,
                        data: { scheduled_date: prevDate, scheduled_time: prevTime },
                      },
                      {
                        onSuccess: () =>
                          queryClient.invalidateQueries({
                            queryKey: dashboardTasksKey(),
                          }),
                        onError: () => {
                          queryClient.invalidateQueries({
                            queryKey: dashboardTasksKey(),
                          });
                          toast.error("Undo failed");
                        },
                      },
                    );
                  },
                },
              });
            },
            onError: () => {
              queryClient.setQueryData(dashboardTasksKey(), previousTasks);
              toast.error("Failed to schedule task", { id: `anytime-err-${activeId}` });
            },
          },
        );
        return;
      }

      // --- Drop onto a date-group header: reschedule to that date (date-only) ---
      if (overId.startsWith("date-group-")) {
        const dateStr = String(over.data.current?.dateStr ?? "");
        const task = findTask(active.id);
        const prevDate = task?.scheduled_date ?? null;
        const prevTime = task?.scheduled_time ?? null;

        if (prevDate === dateStr && !prevTime) return;

        const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());
        queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) => {
          if (!old) return old;
          return updateTaskOrSubtaskInCache(old, activeId, {
            scheduled_date: dateStr,
            scheduled_time: null,
          });
        });

        const taskTitle = task?.title ?? "Task";
        updateTask.mutate(
          { taskId: activeId, data: { scheduled_date: dateStr, scheduled_time: null } },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
              announce("Task rescheduled");
              toast.success(`Rescheduled "${taskTitle}" to ${formatScheduleTarget(dateStr)}`, {
                id: `reschedule-${activeId}`,
                action: {
                  label: "Undo",
                  onClick: () => {
                    queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) =>
                      old?.map((t) =>
                        t.id === activeId
                          ? { ...t, scheduled_date: prevDate, scheduled_time: prevTime }
                          : t,
                      ),
                    );
                    updateTask.mutate(
                      {
                        taskId: activeId,
                        data: { scheduled_date: prevDate, scheduled_time: prevTime },
                      },
                      {
                        onSuccess: () =>
                          queryClient.invalidateQueries({
                            queryKey: dashboardTasksKey(),
                          }),
                        onError: () => {
                          queryClient.invalidateQueries({
                            queryKey: dashboardTasksKey(),
                          });
                          toast.error("Undo failed");
                        },
                      },
                    );
                  },
                },
              });
            },
            onError: () => {
              queryClient.setQueryData(dashboardTasksKey(), previousTasks);
              toast.error("Failed to reschedule task", { id: `reschedule-err-${activeId}` });
            },
          },
        );
        return;
      }

      // --- Drop onto calendar: schedule the task ---
      if (overId.startsWith("calendar-overlay-")) {
        const isReschedule = active.data.current?.type === "scheduled-task";

        // Overlay droppable sits outside scroll containers with stable rect measurement
        const droppableData = over.data.current as {
          centerDate: string;
          prevDate: string;
          nextDate: string;
          boundaries: { prevEnd: number; currentStart: number; currentEnd: number };
          getScrollTop: () => number;
          getCalendarRect?: () => DOMRect | null;
        };

        // Compute absolute Y in the timeline: pointer relative to visible area + scroll offset
        const calRect = droppableData.getCalendarRect?.();
        const calTop = calRect?.top ?? over.rect.top;
        const scrollTop = droppableData.getScrollTop();
        const pointerY = lastPointerRef.current.y;
        const offsetY = pointerY - calTop + scrollTop;

        // Determine which date section the pointer is in based on Y offset
        let dateStr: string;
        let startHour: number;
        if (offsetY < droppableData.boundaries.prevEnd) {
          dateStr = droppableData.prevDate;
          startHour = PREV_DAY_START_HOUR;
        } else if (offsetY < droppableData.boundaries.currentEnd) {
          dateStr = droppableData.centerDate;
          startHour = 0;
        } else {
          dateStr = droppableData.nextDate;
          startHour = 0;
        }

        const sectionTop =
          offsetY < droppableData.boundaries.prevEnd
            ? 0
            : offsetY < droppableData.boundaries.currentEnd
              ? droppableData.boundaries.currentStart
              : droppableData.boundaries.currentEnd;
        const sectionOffsetY = offsetY - sectionTop;

        const { hour, minutes } = offsetToTime(sectionOffsetY, calendarHourHeight, startHour);
        const scheduledTime = `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;

        // Capture previous state for reschedule undo
        const task = findTask(active.id);
        const prevDate = task?.scheduled_date ?? null;
        const prevTime = task?.scheduled_time ?? null;

        // No-op if same time and date (reschedule to same spot)
        if (isReschedule && prevDate === dateStr && prevTime === scheduledTime) return;

        // Optimistic update
        const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());
        queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) => {
          if (!old) return old;
          return updateTaskOrSubtaskInCache(old, activeId, {
            scheduled_date: dateStr,
            scheduled_time: scheduledTime,
          });
        });

        updateTask.mutate(
          {
            taskId: activeId,
            data: { scheduled_date: dateStr, scheduled_time: scheduledTime },
          },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
              const taskTitle = task?.title ?? "Task";
              if (isReschedule) {
                announce("Task rescheduled");
                toast.success(
                  `Rescheduled "${taskTitle}" to ${formatScheduleTarget(dateStr, scheduledTime)}`,
                  {
                    id: `reschedule-${activeId}`,
                    action: {
                      label: "Undo",
                      onClick: () => {
                        updateTask.mutate(
                          {
                            taskId: activeId,
                            data: { scheduled_date: prevDate, scheduled_time: prevTime },
                          },
                          {
                            onSuccess: () =>
                              queryClient.invalidateQueries({
                                queryKey: dashboardTasksKey(),
                              }),
                            onError: () => {
                              queryClient.invalidateQueries({
                                queryKey: dashboardTasksKey(),
                              });
                              toast.error("Undo failed");
                            },
                          },
                        );
                      },
                    },
                  },
                );
              } else {
                announce("Task scheduled");
                toast.success(
                  `Scheduled "${taskTitle}" for ${formatScheduleTarget(dateStr, scheduledTime)}`,
                  {
                    id: `schedule-${activeId}`,
                    action: {
                      label: "Undo",
                      onClick: () => {
                        updateTask.mutate(
                          {
                            taskId: activeId,
                            data: { scheduled_date: prevDate, scheduled_time: prevTime },
                          },
                          {
                            onSuccess: () =>
                              queryClient.invalidateQueries({
                                queryKey: dashboardTasksKey(),
                              }),
                            onError: () => {
                              queryClient.invalidateQueries({
                                queryKey: dashboardTasksKey(),
                              });
                              toast.error("Undo failed");
                            },
                          },
                        );
                      },
                    },
                  },
                );
              }
            },
            onError: () => {
              queryClient.setQueryData(dashboardTasksKey(), previousTasks);
              toast.error("Failed to schedule task", { id: `schedule-err-${activeId}` });
            },
          },
        );
        return;
      }

      // --- Drop onto task-list or gap: promote subtask OR unschedule ---
      if (overId.startsWith("task-list-") || overId.startsWith("task-gap-")) {
        const task = findTask(active.id);

        // Promote subtask — only on explicit promote zones (bar/gaps), not the general container
        if (task?.parent_id != null && overId !== "task-list-drop") {
          const prevParentId = task.parent_id;
          const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());

          // Optimistic: remove from parent's subtasks, add as top-level task
          queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) => {
            if (!old) return old;
            const promoted: TaskResponse = {
              ...task,
              parent_id: null,
              subtasks: [],
            };
            return [
              ...old.map((t) =>
                t.id === prevParentId
                  ? { ...t, subtasks: t.subtasks?.filter((st) => st.id !== activeId) }
                  : t,
              ),
              promoted,
            ];
          });

          updateTask.mutate(
            { taskId: activeId, data: { parent_id: null } },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
                announce("Subtask promoted to task");
                toast.success(`Promoted "${task.title}" to standalone task`, {
                  id: `promote-${activeId}`,
                  action: {
                    label: "Undo",
                    onClick: () => {
                      queryClient.setQueryData(dashboardTasksKey(), previousTasks);
                      updateTask.mutate(
                        { taskId: activeId, data: { parent_id: prevParentId } },
                        {
                          onSuccess: () =>
                            queryClient.invalidateQueries({
                              queryKey: dashboardTasksKey(),
                            }),
                          onError: () => {
                            queryClient.invalidateQueries({
                              queryKey: dashboardTasksKey(),
                            });
                            toast.error("Undo failed");
                          },
                        },
                      );
                    },
                  },
                });
              },
              onError: () => {
                queryClient.setQueryData(dashboardTasksKey(), previousTasks);
                toast.error("Failed to promote task", { id: `promote-err-${activeId}` });
              },
            },
          );
          return;
        }

        // Otherwise unschedule if task was scheduled
        if (task?.scheduled_date) {
          const prevDate = task.scheduled_date;
          const prevTime = task.scheduled_time ?? null;

          const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());
          queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) => {
            if (!old) return old;
            return updateTaskOrSubtaskInCache(old, activeId, {
              scheduled_date: null,
              scheduled_time: null,
            });
          });

          updateTask.mutate(
            {
              taskId: activeId,
              data: { scheduled_date: null, scheduled_time: null },
            },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
                const taskTitle = task?.title ?? "Task";
                announce("Task unscheduled");
                toast.success(`Unscheduled "${taskTitle}"`, {
                  id: `unschedule-${activeId}`,
                  action: {
                    label: "Undo",
                    onClick: () => {
                      updateTask.mutate(
                        {
                          taskId: activeId,
                          data: { scheduled_date: prevDate, scheduled_time: prevTime },
                        },
                        {
                          onSuccess: () =>
                            queryClient.invalidateQueries({
                              queryKey: dashboardTasksKey(),
                            }),
                          onError: () => {
                            queryClient.invalidateQueries({
                              queryKey: dashboardTasksKey(),
                            });
                            toast.error("Undo failed");
                          },
                        },
                      );
                    },
                  },
                });
              },
              onError: () => {
                queryClient.setQueryData(dashboardTasksKey(), previousTasks);
                toast.error("Failed to unschedule task", { id: `unschedule-err-${activeId}` });
              },
            },
          );
        }
        return;
      }

      // --- Drop between tasks: promote subtask to standalone ---
      if (overId.startsWith("task-gap-")) {
        const task = findTask(active.id);
        if (!task || task.parent_id == null) return; // Only subtasks can be promoted

        const prevParentId = task.parent_id;
        const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());

        // Optimistic: remove from parent's subtasks, add as top-level task
        queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) => {
          if (!old) return old;
          const promoted: TaskResponse = {
            ...task,
            parent_id: null,
            subtasks: [],
          };
          return [
            ...old.map((t) =>
              t.id === prevParentId
                ? { ...t, subtasks: t.subtasks?.filter((st) => st.id !== activeId) }
                : t,
            ),
            promoted,
          ];
        });

        updateTask.mutate(
          { taskId: activeId, data: { parent_id: null } },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
              announce("Subtask promoted to task");
              toast.success(`Promoted "${task.title}" to standalone task`, {
                id: `promote-${activeId}`,
                action: {
                  label: "Undo",
                  onClick: () => {
                    queryClient.setQueryData(dashboardTasksKey(), previousTasks);
                    updateTask.mutate(
                      { taskId: activeId, data: { parent_id: prevParentId } },
                      {
                        onSuccess: () =>
                          queryClient.invalidateQueries({
                            queryKey: dashboardTasksKey(),
                          }),
                        onError: () => {
                          queryClient.invalidateQueries({
                            queryKey: dashboardTasksKey(),
                          });
                          toast.error("Undo failed");
                        },
                      },
                    );
                  },
                },
              });
            },
            onError: () => {
              queryClient.setQueryData(dashboardTasksKey(), previousTasks);
              toast.error("Failed to promote task", { id: `promote-err-${activeId}` });
            },
          },
        );
        return;
      }

      // --- Drop onto another task: reparent (make subtask) ---
      if (overId.startsWith("task-drop-")) {
        const overTaskId = Number.parseInt(overId.replace("task-drop-", ""), 10);
        if (Number.isNaN(overTaskId) || overTaskId === activeId) return;

        const activeTask = findTask(active.id);
        const overTask = findTask(over.id);
        if (!activeTask || !overTask) return;

        // Already a subtask of this parent — no-op
        if (activeTask.parent_id === overTaskId) return;

        // Client-side validations (droppable should be disabled but double-check)
        if (overTask.parent_id != null) return;
        if (overTask.is_recurring) return;
        if ((activeTask.subtasks?.length ?? 0) > 0) {
          toast.error("A task with subtasks cannot become a subtask");
          return;
        }

        // Prevent circular: don't drop parent onto its own child
        const isChildOfActive = activeTask.subtasks?.some((st) => st.id === overTaskId);
        if (isChildOfActive) {
          toast.error("Cannot make a parent into its own subtask");
          return;
        }

        const prevParentId = activeTask.parent_id;
        const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());

        // Optimistic: move task into target's subtasks array
        const newSubtask: SubtaskResponse = {
          id: activeTask.id,
          title: activeTask.title,
          description: activeTask.description ?? null,
          duration_minutes: activeTask.duration_minutes ?? null,
          impact: activeTask.impact,
          clarity: activeTask.clarity ?? null,
          scheduled_date: activeTask.scheduled_date ?? null,
          scheduled_time: activeTask.scheduled_time ?? null,
          status: activeTask.status ?? "pending",
          position: 9999,
        };

        queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) => {
          if (!old) return old;
          return old
            .filter((t) => t.id !== activeTask.id) // Remove from top-level
            .map((t) => {
              // Remove from old parent's subtasks (if reparenting between parents)
              if (prevParentId && t.id === prevParentId) {
                return {
                  ...t,
                  subtasks: t.subtasks?.filter((st) => st.id !== activeTask.id),
                };
              }
              // Add to new parent's subtasks
              if (t.id === overTaskId) {
                return {
                  ...t,
                  subtasks: [...(t.subtasks ?? []), newSubtask],
                };
              }
              return t;
            });
        });

        // Auto-expand the target parent
        useUIStore.getState().expandSubtask(overTaskId);

        updateTask.mutate(
          { taskId: activeId, data: { parent_id: overTaskId } },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
              announce("Task nested as subtask");
              toast.success(`Made "${activeTask.title}" a subtask of "${overTask.title}"`, {
                id: `reparent-${activeId}`,
                action: {
                  label: "Undo",
                  onClick: () => {
                    queryClient.setQueryData(dashboardTasksKey(), previousTasks);
                    updateTask.mutate(
                      { taskId: activeId, data: { parent_id: prevParentId } },
                      {
                        onSuccess: () =>
                          queryClient.invalidateQueries({
                            queryKey: dashboardTasksKey(),
                          }),
                        onError: () => {
                          queryClient.invalidateQueries({
                            queryKey: dashboardTasksKey(),
                          });
                          toast.error("Undo failed");
                        },
                      },
                    );
                  },
                },
              });
            },
            onError: () => {
              queryClient.setQueryData(dashboardTasksKey(), previousTasks);
              toast.error("Failed to reparent task", { id: `reparent-err-${activeId}` });
            },
          },
        );
      }
    },
    [
      findTask,
      queryClient,
      updateTask,
      calendarHourHeight,
      handleInstanceDrop,
      handleBatchDrop,
      dragState.isBatchDrag,
    ],
  );

  const handleDragCancel = useCallback(() => {
    setDragState({
      activeId: null,
      activeTask: null,
      activeInstance: null,
      overId: null,
      overType: null,
      isBatchDrag: false,
      batchCount: 0,
    });
  }, []);

  // Modifier: proportional grab offset mapped to the compact overlay pill.
  // The overlay pill (TaskDragOverlay) is much smaller than the original card.
  // We capture WHERE on the original card the user grabbed (as a 0–1 ratio),
  // then apply that ratio to the pill's actual rendered dimensions so the cursor
  // stays at the same proportional position (grab middle → cursor at pill middle).
  const grabRatioRef = useRef<{
    x: number;
    y: number;
    initialLeft: number;
    initialTop: number;
  } | null>(null);
  const overlayContentRef = useRef<HTMLDivElement>(null);
  const overlayModifiers = useMemo<Modifier[]>(
    () => [
      ({ transform, activatorEvent, activeNodeRect }) => {
        if (!activeNodeRect || !activatorEvent) return transform;
        // Capture grab position as 0–1 ratio AND freeze activeNodeRect position (once per drag).
        // activeNodeRect.left/top is LIVE — it shifts when the carousel scrolls during drag,
        // causing the overlay to jump by exactly one panel width per navigation.
        // Freezing it at drag start eliminates the jump.
        if (!grabRatioRef.current) {
          let clientX: number;
          let clientY: number;
          if (activatorEvent instanceof TouchEvent) {
            clientX = activatorEvent.touches[0]?.clientX ?? 0;
            clientY = activatorEvent.touches[0]?.clientY ?? 0;
          } else {
            clientX = (activatorEvent as PointerEvent).clientX;
            clientY = (activatorEvent as PointerEvent).clientY;
          }
          grabRatioRef.current = {
            x: (clientX - activeNodeRect.left) / (activeNodeRect.width || 1),
            y: (clientY - activeNodeRect.top) / (activeNodeRect.height || 1),
            initialLeft: activeNodeRect.left,
            initialTop: activeNodeRect.top,
          };
        }
        // Measure the actual compact pill via firstElementChild (the TaskDragOverlay root).
        // The overlayContentRef div itself fills the dnd-kit wrapper width, so we need
        // the inner element to get the real pill dimensions.
        const wrapper = overlayContentRef.current;
        const pill = wrapper?.firstElementChild as HTMLElement | null;
        const pillW = pill?.offsetWidth ?? activeNodeRect.width;
        const pillH = pill?.offsetHeight ?? activeNodeRect.height;
        const offsetX = grabRatioRef.current.x * pillW;
        const offsetY = grabRatioRef.current.y * pillH;
        // Use live pointer + frozen initial rect — immune to both scroll drift
        // and carousel navigation shifting the card's DOM position
        const pointerX = lastPointerRef.current.x;
        const pointerY = lastPointerRef.current.y;
        return {
          ...transform,
          x: pointerX - grabRatioRef.current.initialLeft - offsetX,
          y: pointerY - grabRatioRef.current.initialTop - offsetY,
        };
      },
    ],
    [],
  );

  const dndStateValue = useMemo<DndStateContextValue>(
    () => ({
      activeId: dragState.activeId,
      activeTask: dragState.activeTask,
    }),
    [dragState.activeId, dragState.activeTask],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      autoScroll={false}
    >
      <DndStateCtx.Provider value={dndStateValue}>{children}</DndStateCtx.Provider>
      <DragOverlay dropAnimation={null} modifiers={overlayModifiers}>
        {dragState.isBatchDrag && dragState.activeTask ? (
          <div ref={overlayContentRef} className="transition-all duration-150">
            <BatchDragOverlay
              anchorTask={dragState.activeTask}
              additionalCount={dragState.batchCount}
            />
          </div>
        ) : dragState.isBatchDrag && dragState.activeInstance ? (
          <div ref={overlayContentRef} className="transition-all duration-150">
            <BatchDragOverlay
              anchorTask={
                {
                  ...dragState.activeInstance,
                  title: dragState.activeInstance.task_title,
                } as unknown as TaskResponse
              }
              additionalCount={dragState.batchCount}
            />
          </div>
        ) : dragState.activeTask ? (
          <div
            ref={overlayContentRef}
            className={
              dragState.overType === "reparent"
                ? "opacity-40 scale-95 transition-all duration-150"
                : "transition-all duration-150"
            }
          >
            <TaskDragOverlay
              task={dragState.activeTask}
              isReparenting={dragState.overType === "reparent"}
            />
          </div>
        ) : dragState.activeInstance ? (
          <div ref={overlayContentRef} className="transition-all duration-150">
            <TaskDragOverlay
              task={
                {
                  ...dragState.activeInstance,
                  title: dragState.activeInstance.task_title,
                } as unknown as TaskResponse
              }
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export type { DragState as TaskDragState };
