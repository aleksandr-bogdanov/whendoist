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
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { offsetToTime } from "@/lib/calendar-utils";
import { useUIStore } from "@/stores/ui-store";
import { TaskDragOverlay } from "./task-drag-overlay";

export interface DragState {
  activeId: UniqueIdentifier | null;
  activeTask: AppRoutersTasksTaskResponse | null;
  overId: UniqueIdentifier | null;
  overType: "task" | "calendar" | "task-list" | null;
}

interface TaskDndContextProps {
  tasks: AppRoutersTasksTaskResponse[];
  children: React.ReactNode;
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
    // Prefer calendar drops if the pointer is inside a calendar zone
    const calendarHit = pointerCollisions.find((c) => String(c.id).startsWith("calendar-"));
    if (calendarHit) return [calendarHit];
    return pointerCollisions;
  }

  // Fall back to rect intersection for sortable context
  const rectCollisions = rectIntersection(args);
  if (rectCollisions.length > 0) return rectCollisions;

  // Last resort: closest center
  return closestCenter(args);
};

export function TaskDndContext({ tasks, children }: TaskDndContextProps) {
  const queryClient = useQueryClient();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();
  const { calendarHourHeight } = useUIStore();

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
      const numId = typeof id === "string" ? Number.parseInt(id, 10) : Number(id);
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

  const getOverType = useCallback((over: Over | null): "task" | "calendar" | "task-list" | null => {
    if (!over) return null;
    const id = String(over.id);
    if (id.startsWith("calendar-")) return "calendar";
    if (id.startsWith("task-list-")) return "task-list";
    return "task";
  }, []);

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

      const activeId =
        typeof active.id === "string" ? Number.parseInt(active.id, 10) : Number(active.id);
      const overId = String(over.id);

      // --- Drop onto calendar: schedule the task ---
      if (overId.startsWith("calendar-")) {
        // calendar-YYYY-MM-DD format
        const dateStr = overId.replace("calendar-", "");
        const rect = over.rect;

        // Calculate time from pointer Y position relative to the droppable
        // The delta is the pointer's Y position within the calendar column
        const pointerY = (event.activatorEvent as PointerEvent).clientY + (event.delta?.y ?? 0);
        const columnTop = rect.top;
        const offsetY = pointerY - columnTop;

        const { hour, minutes } = offsetToTime(offsetY, calendarHourHeight);
        const scheduledTime = `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;

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
              toast.success("Task scheduled");
            },
            onError: () => {
              queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
              toast.error("Failed to schedule task");
            },
          },
        );
        return;
      }

      // --- Drop onto task-list: unschedule if task was scheduled ---
      if (overId.startsWith("task-list-")) {
        const task = findTask(active.id);
        if (task?.scheduled_date) {
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
                toast.success("Task unscheduled");
              },
              onError: () => {
                queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
                toast.error("Failed to unschedule task");
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
              toast.success("Task moved as subtask");
            },
            onError: () => {
              queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
              toast.error("Failed to reparent task");
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
