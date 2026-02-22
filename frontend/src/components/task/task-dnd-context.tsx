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
import type { AppRoutersTasksTaskResponse, InstanceResponse, SubtaskResponse } from "@/api/model";
import {
  getListInstancesApiV1InstancesGetQueryKey,
  useScheduleInstanceApiV1InstancesInstanceIdSchedulePut,
} from "@/api/queries/instances/instances";
import {
  getListTasksApiV1TasksGetQueryKey,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { announce } from "@/components/live-announcer";
import { offsetToTime, PREV_DAY_START_HOUR } from "@/lib/calendar-utils";
import { formatScheduleTarget } from "@/lib/task-utils";
import { useUIStore } from "@/stores/ui-store";
import { TaskDragOverlay } from "./task-drag-overlay";

// --- DnD state context (shared with TaskItem for drop-target validation) ---
interface DndStateContextValue {
  activeId: UniqueIdentifier | null;
  activeTask: AppRoutersTasksTaskResponse | null;
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
  activeTask: AppRoutersTasksTaskResponse | null;
  activeInstance: InstanceResponse | null;
  overId: UniqueIdentifier | null;
  overType: "task" | "calendar" | "task-list" | "anytime" | "date-group" | "reparent" | null;
}

interface TaskDndContextProps {
  tasks: AppRoutersTasksTaskResponse[];
  children: React.ReactNode;
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
    const taskDropHit = pointerCollisions.find((c) => String(c.id).startsWith("task-drop-"));
    if (taskDropHit) return [taskDropHit];
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
    (id: UniqueIdentifier): AppRoutersTasksTaskResponse | null => {
      const numId = parseTaskId(id);
      // Search top-level tasks and their subtasks
      for (const task of tasks) {
        if (task.id === numId) return task;
        if (task.subtasks) {
          for (const st of task.subtasks) {
            if (st.id === numId) {
              // Return subtask as a partial task response for drag purposes
              return { ...st, subtasks: [] } as unknown as AppRoutersTasksTaskResponse;
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
    ): "task" | "calendar" | "task-list" | "anytime" | "date-group" | "reparent" | null => {
      if (!over) return null;
      const id = String(over.id);
      if (id.startsWith("date-group-")) return "date-group";
      if (id.startsWith("anytime-drop-")) return "anytime";
      if (id.startsWith("calendar-overlay-")) return "calendar";
      if (id.startsWith("task-drop-")) return "reparent";
      if (id.startsWith("task-list-")) return "task-list";
      return "task";
    },
    [],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      grabRatioRef.current = null; // Reset so next modifier call captures fresh ratio
      const activeIdStr = String(event.active.id);
      const isInstance = activeIdStr.startsWith("instance-");
      const task = isInstance ? null : findTask(event.active.id);
      const instance = isInstance
        ? ((event.active.data.current?.instance as InstanceResponse | null) ?? null)
        : null;
      setDragState({
        activeId: event.active.id,
        activeTask: task,
        activeInstance: instance,
        overId: null,
        overType: null,
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
        queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
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
                      { onSuccess: () => invalidateInstances() },
                    );
                  },
                },
                duration: 5000,
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
                        { onSuccess: () => invalidateInstances() },
                      );
                    },
                  },
                  duration: 5000,
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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setDragState({
        activeId: null,
        activeTask: null,
        activeInstance: null,
        overId: null,
        overType: null,
      });

      if (!over || !active) return;

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

        const previousTasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
          getListTasksApiV1TasksGetQueryKey(),
        );
        queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
          getListTasksApiV1TasksGetQueryKey(),
          (old) => {
            if (!old) return old;
            return old.map((t) =>
              t.id === activeId ? { ...t, scheduled_date: dateStr, scheduled_time: null } : t,
            );
          },
        );

        updateTask.mutate(
          {
            taskId: activeId,
            data: { scheduled_date: dateStr, scheduled_time: null },
          },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
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
                            queryKey: getListTasksApiV1TasksGetQueryKey(),
                          }),
                        onError: () => {
                          queryClient.invalidateQueries({
                            queryKey: getListTasksApiV1TasksGetQueryKey(),
                          });
                          toast.error("Undo failed");
                        },
                      },
                    );
                  },
                },
                duration: 5000,
              });
            },
            onError: () => {
              queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
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

        const previousTasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
          getListTasksApiV1TasksGetQueryKey(),
        );
        queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
          getListTasksApiV1TasksGetQueryKey(),
          (old) =>
            old?.map((t) =>
              t.id === activeId ? { ...t, scheduled_date: dateStr, scheduled_time: null } : t,
            ),
        );

        const taskTitle = task?.title ?? "Task";
        updateTask.mutate(
          { taskId: activeId, data: { scheduled_date: dateStr, scheduled_time: null } },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
              announce("Task rescheduled");
              toast.success(`Rescheduled "${taskTitle}" to ${formatScheduleTarget(dateStr)}`, {
                id: `reschedule-${activeId}`,
                action: {
                  label: "Undo",
                  onClick: () => {
                    queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
                      getListTasksApiV1TasksGetQueryKey(),
                      (old) =>
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
                            queryKey: getListTasksApiV1TasksGetQueryKey(),
                          }),
                        onError: () => {
                          queryClient.invalidateQueries({
                            queryKey: getListTasksApiV1TasksGetQueryKey(),
                          });
                          toast.error("Undo failed");
                        },
                      },
                    );
                  },
                },
                duration: 5000,
              });
            },
            onError: () => {
              queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
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
        const previousTasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
          getListTasksApiV1TasksGetQueryKey(),
        );
        queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
          getListTasksApiV1TasksGetQueryKey(),
          (old) => {
            if (!old) return old;
            return old.map((t) =>
              t.id === activeId
                ? { ...t, scheduled_date: dateStr, scheduled_time: scheduledTime }
                : t,
            );
          },
        );

        updateTask.mutate(
          {
            taskId: activeId,
            data: { scheduled_date: dateStr, scheduled_time: scheduledTime },
          },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
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
                                queryKey: getListTasksApiV1TasksGetQueryKey(),
                              }),
                            onError: () => {
                              queryClient.invalidateQueries({
                                queryKey: getListTasksApiV1TasksGetQueryKey(),
                              });
                              toast.error("Undo failed");
                            },
                          },
                        );
                      },
                    },
                    duration: 5000,
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
                                queryKey: getListTasksApiV1TasksGetQueryKey(),
                              }),
                            onError: () => {
                              queryClient.invalidateQueries({
                                queryKey: getListTasksApiV1TasksGetQueryKey(),
                              });
                              toast.error("Undo failed");
                            },
                          },
                        );
                      },
                    },
                    duration: 5000,
                  },
                );
              }
            },
            onError: () => {
              queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
              toast.error("Failed to schedule task", { id: `schedule-err-${activeId}` });
            },
          },
        );
        return;
      }

      // --- Drop onto task-list: promote subtask OR unschedule ---
      if (overId.startsWith("task-list-")) {
        const task = findTask(active.id);

        // If a subtask is dropped on task-list, promote to standalone
        if (task?.parent_id != null) {
          const prevParentId = task.parent_id;
          const previousTasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
            getListTasksApiV1TasksGetQueryKey(),
          );

          // Optimistic: remove from parent's subtasks, add as top-level task
          queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
            getListTasksApiV1TasksGetQueryKey(),
            (old) => {
              if (!old) return old;
              const promoted: AppRoutersTasksTaskResponse = {
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
            },
          );

          updateTask.mutate(
            { taskId: activeId, data: { parent_id: null } },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
                announce("Subtask promoted to task");
                toast.success(`Promoted "${task.title}" to standalone task`, {
                  id: `promote-${activeId}`,
                  action: {
                    label: "Undo",
                    onClick: () => {
                      queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
                      updateTask.mutate(
                        { taskId: activeId, data: { parent_id: prevParentId } },
                        {
                          onSuccess: () =>
                            queryClient.invalidateQueries({
                              queryKey: getListTasksApiV1TasksGetQueryKey(),
                            }),
                          onError: () => {
                            queryClient.invalidateQueries({
                              queryKey: getListTasksApiV1TasksGetQueryKey(),
                            });
                            toast.error("Undo failed");
                          },
                        },
                      );
                    },
                  },
                  duration: 5000,
                });
              },
              onError: () => {
                queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
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

          const previousTasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
            getListTasksApiV1TasksGetQueryKey(),
          );
          queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
            getListTasksApiV1TasksGetQueryKey(),
            (old) => {
              if (!old) return old;
              return old.map((t) =>
                t.id === activeId ? { ...t, scheduled_date: null, scheduled_time: null } : t,
              );
            },
          );

          updateTask.mutate(
            {
              taskId: activeId,
              data: { scheduled_date: null, scheduled_time: null },
            },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
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
                              queryKey: getListTasksApiV1TasksGetQueryKey(),
                            }),
                          onError: () => {
                            queryClient.invalidateQueries({
                              queryKey: getListTasksApiV1TasksGetQueryKey(),
                            });
                            toast.error("Undo failed");
                          },
                        },
                      );
                    },
                  },
                  duration: 5000,
                });
              },
              onError: () => {
                queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
                toast.error("Failed to unschedule task", { id: `unschedule-err-${activeId}` });
              },
            },
          );
        }
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
        const previousTasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
          getListTasksApiV1TasksGetQueryKey(),
        );

        // Optimistic: move task into target's subtasks array
        const newSubtask: SubtaskResponse = {
          id: activeTask.id,
          title: activeTask.title,
          description: activeTask.description ?? null,
          duration_minutes: activeTask.duration_minutes ?? null,
          impact: activeTask.impact,
          clarity: activeTask.clarity ?? null,
          scheduled_date: activeTask.scheduled_date ?? null,
          status: activeTask.status ?? "pending",
          position: 9999,
        };

        queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
          getListTasksApiV1TasksGetQueryKey(),
          (old) => {
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
          },
        );

        // Auto-expand the target parent
        useUIStore.getState().expandSubtask(overTaskId);

        updateTask.mutate(
          { taskId: activeId, data: { parent_id: overTaskId } },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
              announce("Task nested as subtask");
              toast.success(`Made "${activeTask.title}" a subtask of "${overTask.title}"`, {
                id: `reparent-${activeId}`,
                action: {
                  label: "Undo",
                  onClick: () => {
                    queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
                    updateTask.mutate(
                      { taskId: activeId, data: { parent_id: prevParentId } },
                      {
                        onSuccess: () =>
                          queryClient.invalidateQueries({
                            queryKey: getListTasksApiV1TasksGetQueryKey(),
                          }),
                        onError: () => {
                          queryClient.invalidateQueries({
                            queryKey: getListTasksApiV1TasksGetQueryKey(),
                          });
                          toast.error("Undo failed");
                        },
                      },
                    );
                  },
                },
                duration: 5000,
              });
            },
            onError: () => {
              queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
              toast.error("Failed to reparent task", { id: `reparent-err-${activeId}` });
            },
          },
        );
      }
    },
    [findTask, queryClient, updateTask, calendarHourHeight, handleInstanceDrop],
  );

  const handleDragCancel = useCallback(() => {
    setDragState({
      activeId: null,
      activeTask: null,
      activeInstance: null,
      overId: null,
      overType: null,
    });
  }, []);

  // Modifier: preserve proportional grab offset, immune to scroll drift.
  // dnd-kit measures activeNodeRect from the draggable DOM node, but the DragOverlay
  // renders a compact card (TaskDragOverlay) inside a wrapper sized to the original
  // card. We measure the actual content width via overlayContentRef and use it for
  // proportional positioning. The activeNodeRect values cancel out algebraically
  // so scroll drift doesn't affect the visual position.
  const grabRatioRef = useRef<{ x: number; y: number } | null>(null);
  const overlayContentRef = useRef<HTMLDivElement>(null);
  const overlayModifiers = useMemo<Modifier[]>(
    () => [
      ({ transform, activatorEvent, activeNodeRect }) => {
        if (!activeNodeRect || !activatorEvent) return transform;
        const ev = activatorEvent as PointerEvent;
        // Capture grab position as ratio of original card (no scroll drift yet)
        if (!grabRatioRef.current) {
          grabRatioRef.current = {
            x: (ev.clientX - activeNodeRect.left) / (activeNodeRect.width || 1),
            y: (ev.clientY - activeNodeRect.top) / (activeNodeRect.height || 1),
          };
        }
        // Use actual content dimensions if available, otherwise fall back to original card
        const contentEl = overlayContentRef.current;
        const contentW = contentEl?.offsetWidth ?? activeNodeRect.width;
        const contentH = contentEl?.offsetHeight ?? activeNodeRect.height;
        const offsetX = grabRatioRef.current.x * contentW;
        const offsetY = grabRatioRef.current.y * contentH;
        const currentX = ev.clientX + transform.x;
        const currentY = ev.clientY + transform.y;
        // visual = activeNodeRect.left + result.x = currentX - offsetX
        // (activeNodeRect.left cancels out, so scroll drift doesn't matter)
        return {
          ...transform,
          x: currentX - activeNodeRect.left - offsetX,
          y: currentY - activeNodeRect.top - offsetY,
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
        {dragState.activeTask ? (
          <div ref={overlayContentRef}>
            <TaskDragOverlay
              task={dragState.activeTask}
              isReparenting={dragState.overType === "reparent"}
            />
          </div>
        ) : dragState.activeInstance ? (
          <div ref={overlayContentRef}>
            <TaskDragOverlay
              task={
                {
                  ...dragState.activeInstance,
                  title: dragState.activeInstance.task_title,
                } as unknown as AppRoutersTasksTaskResponse
              }
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export type { DragState as TaskDragState };
