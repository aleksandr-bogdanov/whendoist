import { useDraggable } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Check, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { TaskResponse } from "@/api/model";
import {
  useDeleteTaskApiV1TasksTaskIdDelete,
  useRestoreTaskApiV1TasksTaskIdRestorePost,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { BatchContextMenuItems } from "@/components/batch/batch-context-menu";
import { announce } from "@/components/live-announcer";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { dashboardTasksKey } from "@/lib/query-keys";
import { IMPACT_COLORS } from "@/lib/task-utils";
import { taskSelectionId, useSelectionStore } from "@/stores/selection-store";

interface AnytimeTaskPillProps {
  task: TaskResponse;
  onClick?: () => void;
  /** Ordered selection IDs for Shift+Click range selection */
  orderedIds?: string[];
}

export function AnytimeTaskPill({ task, onClick, orderedIds }: AnytimeTaskPillProps) {
  const selectionId = taskSelectionId(task.id);
  const isMultiSelected = useSelectionStore((s) => s.selectedIds.has(selectionId));

  const isCompleted = task.status === "completed";
  const queryClient = useQueryClient();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();
  const restoreTask = useRestoreTaskApiV1TasksTaskIdRestorePost();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `anytime-task-${task.id}`,
    data: { type: "anytime-task", taskId: task.id },
  });

  const handleUnschedule = () => {
    const prevDate = task.scheduled_date;
    queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) =>
      old?.map((t) =>
        t.id === task.id ? { ...t, scheduled_date: null, scheduled_time: null } : t,
      ),
    );
    updateTask.mutate(
      { taskId: task.id, data: { scheduled_date: null, scheduled_time: null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
          announce("Task unscheduled");
          toast.success(`Unscheduled "${task.title}"`, {
            id: `unschedule-${task.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                updateTask.mutate(
                  { taskId: task.id, data: { scheduled_date: prevDate, scheduled_time: null } },
                  {
                    onSuccess: () =>
                      queryClient.invalidateQueries({
                        queryKey: dashboardTasksKey(),
                      }),
                  },
                );
              },
            },
          });
        },
        onError: () => {
          queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
          toast.error("Failed to unschedule task", { id: `unschedule-err-${task.id}` });
        },
      },
    );
  };

  const handleComplete = () => {
    const isCompleted = task.status === "completed";
    queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) =>
      old?.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: isCompleted ? ("pending" as const) : ("completed" as const),
              completed_at: isCompleted ? null : new Date().toISOString(),
            }
          : t,
      ),
    );
    toggleComplete.mutate(
      { taskId: task.id, data: null },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
          announce(isCompleted ? "Task reopened" : "Task completed");
          toast.success(isCompleted ? `Reopened "${task.title}"` : `Completed "${task.title}"`, {
            id: `complete-${task.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) =>
                  old?.map((t) =>
                    t.id === task.id
                      ? {
                          ...t,
                          status: isCompleted ? ("completed" as const) : ("pending" as const),
                          completed_at: isCompleted ? new Date().toISOString() : null,
                        }
                      : t,
                  ),
                );
                toggleComplete.mutate(
                  { taskId: task.id, data: null },
                  {
                    onSuccess: () =>
                      queryClient.invalidateQueries({
                        queryKey: dashboardTasksKey(),
                      }),
                  },
                );
              },
            },
          });
        },
        onError: () => {
          queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
          toast.error("Failed to complete task", { id: `complete-err-${task.id}` });
        },
      },
    );
  };

  const handleDelete = () => {
    deleteTask.mutate(
      { taskId: task.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
          announce("Task deleted");
          toast.success(`Deleted "${task.title}"`, {
            id: `delete-${task.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                restoreTask.mutate(
                  { taskId: task.id },
                  {
                    onSuccess: () =>
                      queryClient.invalidateQueries({
                        queryKey: dashboardTasksKey(),
                      }),
                    onError: () => toast.error("Undo failed"),
                  },
                );
              },
            },
          });
        },
        onError: () => toast.error("Failed to delete task", { id: `delete-err-${task.id}` }),
      },
    );
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          ref={setNodeRef}
          type="button"
          className={`text-[11px] truncate rounded-full px-2 py-0.5 hover:bg-[rgba(109,94,246,0.04)] cursor-grab active:cursor-grabbing max-w-[180px] flex-shrink-0 ${isDragging ? "opacity-30" : ""} ${isCompleted ? "opacity-50" : ""} ${isMultiSelected ? "ring-2 ring-primary" : ""}`}
          style={{
            borderLeft: `3px solid ${IMPACT_COLORS[task.impact] ?? IMPACT_COLORS[4]}`,
            backgroundColor: `${IMPACT_COLORS[task.impact] ?? IMPACT_COLORS[4]}1A`,
          }}
          data-selection-id={selectionId}
          onClick={(e) => {
            if (e.shiftKey) {
              e.stopPropagation();
              const additive = e.metaKey || e.ctrlKey;
              useSelectionStore
                .getState()
                .selectRange(selectionId, orderedIds ?? [], additive, "calendar");
              return;
            }
            if (e.metaKey || e.ctrlKey) {
              e.stopPropagation();
              useSelectionStore.getState().toggle(selectionId, "calendar");
              return;
            }
            useSelectionStore.getState().clear();
            onClick?.();
          }}
          title={task.title}
          {...listeners}
          {...attributes}
        >
          <span className={isCompleted ? "line-through decoration-1" : ""}>
            {isMultiSelected && <Check className="inline h-2.5 w-2.5 mr-0.5 text-primary" />}
            {task.title}
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[160px]">
        {isMultiSelected ? (
          <BatchContextMenuItems />
        ) : (
          <>
            <ContextMenuItem onSelect={() => onClick?.()}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Edit
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleUnschedule}>
              <CalendarOff className="h-3.5 w-3.5 mr-2" />
              Unschedule
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleComplete}>
              <Check className="h-3.5 w-3.5 mr-2" />
              {isCompleted ? "Reopen" : "Complete"}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
