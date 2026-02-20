import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
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
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { announce } from "@/components/live-announcer";
import { offsetToTime, PREV_DAY_START_HOUR } from "@/lib/calendar-utils";
import { formatScheduleTarget } from "@/lib/task-utils";
import { useUIStore } from "@/stores/ui-store";
import { TaskDragOverlay } from "./task-drag-overlay";

export interface DragState {
  activeId: UniqueIdentifier | null;
  activeTask: AppRoutersTasksTaskResponse | null;
  overId: UniqueIdentifier | null;
  overType: "task" | "calendar" | "task-list" | "anytime" | "date-group" | null;
}

interface TaskDndContextProps {
  tasks: AppRoutersTasksTaskResponse[];
  children: React.ReactNode;
}

/** Parse a draggable ID to extract the numeric task ID. Handles prefixed IDs like "anytime-task-123". */
function parseTaskId(id: UniqueIdentifier): number {
  const s = String(id);
  if (s.startsWith("anytime-task-")) {
    return Number.parseInt(s.replace("anytime-task-", ""), 10);
  }
  return typeof id === "string" ? Number.parseInt(id, 10) : Number(id);
}

/**
 * Custom collision detection that checks pointer position first (for calendar
 * drop zones) then falls back to closest-center (for sortable list).
 */
const customCollisionDetection: CollisionDetection = (args) => {
  // First, try pointer-within — great for the calendar grid where we want
  // precise position-based dropping.
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    // Priority order: date-group → anytime → calendar → task-list → other
    const dateGroupHit = pointerCollisions.find((c) => String(c.id).startsWith("date-group-"));
    if (dateGroupHit) return [dateGroupHit];
    const anytimeHit = pointerCollisions.find((c) => String(c.id).startsWith("anytime-drop-"));
    if (anytimeHit) return [anytimeHit];
    const calendarHit = pointerCollisions.find((c) => String(c.id).startsWith("calendar-"));
    if (calendarHit) return [calendarHit];
    const taskListHit = pointerCollisions.find((c) => String(c.id).startsWith("task-list-"));
    if (taskListHit) return [taskListHit];
    return pointerCollisions;
  }

  // Fall back to rect intersection — also check for calendar zones here
  const rectCollisions = rectIntersection(args);
  if (rectCollisions.length > 0) {
    const calendarHit = rectCollisions.find((c) => String(c.id).startsWith("calendar-"));
    if (calendarHit) return [calendarHit];
    return rectCollisions;
  }

  // Last resort: closest center
  return closestCenter(args);
};

export function TaskDndContext({ tasks, children }: TaskDndContextProps) {
  const queryClient = useQueryClient();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();
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
    (over: Over | null): "task" | "calendar" | "task-list" | "anytime" | "date-group" | null => {
      if (!over) return null;
      const id = String(over.id);
      if (id.startsWith("date-group-")) return "date-group";
      if (id.startsWith("anytime-drop-")) return "anytime";
      if (id.startsWith("calendar-")) return "calendar";
      if (id.startsWith("task-list-")) return "task-list";
      return "task";
    },
    [],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const task = findTask(event.active.id);
      setDragState({
        activeId: event.active.id,
        activeTask: task,
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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setDragState({ activeId: null, activeTask: null, overId: null, overType: null });

      if (!over || !active) return;

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
      if (overId.startsWith("calendar-")) {
        const isReschedule = active.data.current?.type === "scheduled-task";

        // Single full-column droppable carries all 3 dates + section boundaries
        const droppableData = over.data.current as {
          centerDate: string;
          prevDate: string;
          nextDate: string;
          boundaries: { prevEnd: number; currentStart: number; currentEnd: number };
          getColumnRect?: () => DOMRect | null;
        };

        // Use live column rect (getBoundingClientRect) to handle scroll offset correctly.
        // over.rect is a stale layout rect that doesn't update when the scroll container scrolls.
        const liveRect = droppableData.getColumnRect?.();
        const columnTop = liveRect?.top ?? over.rect.top;

        // Use tracked pointer position for accurate drops (immune to dnd-kit delta drift)
        const pointerY = lastPointerRef.current.y;
        const offsetY = pointerY - columnTop;

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

      // --- Drop onto task-list: unschedule if task was scheduled ---
      if (overId.startsWith("task-list-")) {
        const task = findTask(active.id);
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
      const overTaskId = Number.parseInt(overId, 10);
      if (!Number.isNaN(overTaskId) && overTaskId !== activeId) {
        const activeTask = findTask(active.id);
        const overTask = findTask(over.id);

        // Prevent circular: don't drop a parent onto its own subtask
        if (activeTask && overTask) {
          const isChildOfActive = activeTask.subtasks?.some((st) => st.id === overTaskId);
          if (isChildOfActive) {
            toast.error("Cannot make a parent into its own subtask");
            return;
          }
        }

        const previousTasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
          getListTasksApiV1TasksGetQueryKey(),
        );
        queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
          getListTasksApiV1TasksGetQueryKey(),
          (old) => {
            if (!old) return old;
            return old.map((t) => (t.id === activeId ? { ...t, parent_id: overTaskId } : t));
          },
        );

        updateTask.mutate(
          {
            taskId: activeId,
            data: { parent_id: overTaskId },
          },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
              toast.success(
                `Moved "${activeTask?.title ?? "Task"}" as subtask of "${overTask?.title ?? "Task"}"`,
                { id: `reparent-${activeId}` },
              );
            },
            onError: () => {
              queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
              toast.error("Failed to reparent task", { id: `reparent-err-${activeId}` });
            },
          },
        );
      }
    },
    [findTask, queryClient, updateTask, calendarHourHeight],
  );

  const handleDragCancel = useCallback(() => {
    setDragState({ activeId: null, activeTask: null, overId: null, overType: null });
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {dragState.activeTask ? <TaskDragOverlay task={dragState.activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

export type { DragState as TaskDragState };
