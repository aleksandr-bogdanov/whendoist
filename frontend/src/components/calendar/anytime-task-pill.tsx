import { useDraggable } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Check, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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

  // Gate drag to left-click only — right-click must reach Radix ContextMenu
  const dragListeners = {
    ...listeners,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      listeners?.onPointerDown?.(e as any);
    },
  };

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
          toast.success(t("toast.taskUnscheduled", { title: task.title }), {
            id: `unschedule-${task.id}`,
            action: {
              label: t("toast.undo"),
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
          toast.error(t("toast.failedToUnscheduleTask"), { id: `unschedule-err-${task.id}` });
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
          toast.success(
            isCompleted
              ? t("toast.taskReopened", { title: task.title })
              : t("toast.taskCompleted", { title: task.title }),
            {
              id: `complete-${task.id}`,
              action: {
                label: t("toast.undo"),
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
            },
          );
        },
        onError: () => {
          queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
          toast.error(t("toast.failedToUpdateTask"), { id: `complete-err-${task.id}` });
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
          toast.success(t("toast.taskDeleted", { title: task.title }), {
            id: `delete-${task.id}`,
            action: {
              label: t("toast.undo"),
              onClick: () => {
                restoreTask.mutate(
                  { taskId: task.id },
                  {
                    onSuccess: () =>
                      queryClient.invalidateQueries({
                        queryKey: dashboardTasksKey(),
                      }),
                    onError: () => toast.error(t("toast.undoFailed")),
                  },
                );
              },
            },
          });
        },
        onError: () => toast.error(t("toast.failedToDeleteTask"), { id: `delete-err-${task.id}` }),
      },
    );
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex-shrink-0 max-w-[180px]">
          <button
            ref={setNodeRef}
            type="button"
            className={`text-[11px] truncate rounded-full px-2 py-0.5 hover:bg-[rgba(109,94,246,0.04)] cursor-grab active:cursor-grabbing w-full ${isDragging ? "opacity-30" : ""} ${isCompleted ? "opacity-50" : ""} ${isMultiSelected ? "ring-2 ring-primary" : ""}`}
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
            {...dragListeners}
            {...attributes}
          >
            <span className={isCompleted ? "line-through decoration-1" : ""}>
              {isMultiSelected && <Check className="inline h-2.5 w-2.5 mr-0.5 text-primary" />}
              {task.title}
            </span>
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[160px]">
        {isMultiSelected ? (
          <BatchContextMenuItems />
        ) : (
          <>
            <ContextMenuItem onSelect={() => onClick?.()}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              {t("task.action.edit")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleUnschedule}>
              <CalendarOff className="h-3.5 w-3.5 mr-2" />
              {t("task.action.unschedule")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleComplete}>
              <Check className="h-3.5 w-3.5 mr-2" />
              {isCompleted ? t("task.action.reopen") : t("task.action.complete")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              {t("task.action.delete")}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
