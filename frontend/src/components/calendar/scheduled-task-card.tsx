import { useDraggable } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Check, CheckCircle2, Pencil, Trash2 } from "lucide-react";
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
import type { PositionedItem } from "@/lib/calendar-utils";
import { dashboardTasksKey } from "@/lib/query-keys";
import { IMPACT_COLORS } from "@/lib/task-utils";
import { taskSelectionId, useSelectionStore } from "@/stores/selection-store";

interface ScheduledTaskCardProps {
  item: PositionedItem;
  taskId: number;
  title: string;
  impact: number;
  durationMinutes: number | null;
  isCompleted?: boolean;
  timeLabel: string;
  onClick?: () => void;
  dimmed?: boolean;
  /** Ordered selection IDs for Shift+Click range selection */
  orderedIds?: string[];
}

export function ScheduledTaskCard({
  item,
  taskId,
  title,
  impact,
  durationMinutes,
  isCompleted,
  timeLabel,
  onClick,
  dimmed,
  orderedIds,
}: ScheduledTaskCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();
  const restoreTask = useRestoreTaskApiV1TasksTaskIdRestorePost();

  const selectionId = taskSelectionId(taskId);
  const isMultiSelected = useSelectionStore((s) => s.selectedIds.has(selectionId));

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `scheduled-task-${taskId}`,
    data: { type: "scheduled-task", taskId },
  });

  // Gate drag to left-click only — right-click must reach Radix ContextMenu
  const dragListeners = {
    ...listeners,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      listeners?.onPointerDown?.(e as any);
    },
  };

  const width = `${100 / item.totalColumns}%`;
  const left = `${(item.column / item.totalColumns) * 100}%`;
  const impactColor = IMPACT_COLORS[impact] ?? IMPACT_COLORS[4];

  const handleUnschedule = () => {
    const tasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());
    const prev = tasks?.find((t) => t.id === taskId);
    const prevDate = prev?.scheduled_date ?? null;
    const prevTime = prev?.scheduled_time ?? null;

    // Optimistic update — immediately remove from calendar
    const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());
    queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) =>
      old?.map((t) => (t.id === taskId ? { ...t, scheduled_date: null, scheduled_time: null } : t)),
    );

    updateTask.mutate(
      { taskId, data: { scheduled_date: null, scheduled_time: null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
          announce("Task unscheduled");
          toast.success(t("toast.taskUnscheduled", { title }), {
            id: `unschedule-${taskId}`,
            action: {
              label: t("toast.undo"),
              onClick: () => {
                // Optimistic undo — immediately restore on calendar
                queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) =>
                  old?.map((t) =>
                    t.id === taskId
                      ? { ...t, scheduled_date: prevDate, scheduled_time: prevTime }
                      : t,
                  ),
                );
                updateTask.mutate(
                  { taskId, data: { scheduled_date: prevDate, scheduled_time: prevTime } },
                  {
                    onSuccess: () =>
                      queryClient.invalidateQueries({
                        queryKey: dashboardTasksKey(),
                      }),
                    onError: () => {
                      toast.error(t("toast.failedToUndoRefresh"));
                      queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
                    },
                  },
                );
              },
            },
          });
        },
        onError: () => {
          queryClient.setQueryData(dashboardTasksKey(), previousTasks);
          toast.error(t("toast.failedToUnscheduleTask"), { id: `unschedule-err-${taskId}` });
        },
      },
    );
  };

  const handleComplete = () => {
    const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());

    queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) => {
      if (!old) return old;
      return old.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: isCompleted ? ("pending" as const) : ("completed" as const),
              completed_at: isCompleted ? null : new Date().toISOString(),
            }
          : t,
      );
    });

    toggleComplete.mutate(
      { taskId, data: null },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
          announce(isCompleted ? "Task reopened" : "Task completed");
          toast.success(
            isCompleted ? t("toast.taskReopened", { title }) : t("toast.taskCompleted", { title }),
            {
              id: `complete-${taskId}`,
              action: {
                label: t("toast.undo"),
                onClick: () => {
                  queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) =>
                    old?.map((t) =>
                      t.id === taskId
                        ? {
                            ...t,
                            status: isCompleted ? ("completed" as const) : ("pending" as const),
                            completed_at: isCompleted ? new Date().toISOString() : null,
                          }
                        : t,
                    ),
                  );
                  toggleComplete.mutate(
                    { taskId, data: null },
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
          queryClient.setQueryData(dashboardTasksKey(), previousTasks);
          toast.error(t("toast.failedToUpdateTask"), { id: `complete-err-${taskId}` });
        },
      },
    );
  };

  const handleDelete = () => {
    deleteTask.mutate(
      { taskId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
          announce("Task deleted");
          toast.success(t("toast.taskDeleted", { title }), {
            id: `delete-${taskId}`,
            action: {
              label: t("toast.undo"),
              onClick: () => {
                restoreTask.mutate(
                  { taskId },
                  {
                    onSuccess: () =>
                      queryClient.invalidateQueries({
                        queryKey: dashboardTasksKey(),
                      }),
                    onError: () => {
                      queryClient.invalidateQueries({
                        queryKey: dashboardTasksKey(),
                      });
                      toast.error(t("toast.undoFailed"));
                    },
                  },
                );
              },
            },
          });
        },
        onError: () => toast.error(t("toast.failedToDeleteTask"), { id: `delete-err-${taskId}` }),
      },
    );
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          ref={setNodeRef}
          type="button"
          className={`absolute rounded-[6px] overflow-hidden text-xs text-left cursor-grab active:cursor-grabbing shadow-sm hover:ring-1 hover:ring-primary/50 transition-shadow ${isCompleted ? "opacity-50" : ""} ${isDragging ? "opacity-50 ring-1 ring-primary" : ""} ${dimmed ? "opacity-60" : ""} ${isMultiSelected ? "ring-inset ring-2 ring-primary z-[2]" : ""}`}
          style={{
            top: `${item.top}px`,
            height: `${Math.max(item.height, 18)}px`,
            width,
            left,
            borderLeft: `3px solid ${impactColor}`,
            backgroundColor: `${impactColor}2A`,
          }}
          title={`${title}\n${timeLabel}${durationMinutes ? ` (${durationMinutes}m)` : ""}`}
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
        >
          {/* Selection overlay + badge */}
          {isMultiSelected && (
            <>
              <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
              <div className="absolute top-1/2 -translate-y-1/2 left-1 z-10 flex items-center justify-center h-3.5 w-3.5 rounded-full bg-primary text-primary-foreground pointer-events-none">
                <Check className="h-2 w-2" strokeWidth={3} />
              </div>
            </>
          )}
          {/* Drag handle — covers entire card, receives pointer events for dnd-kit */}
          <div className="absolute inset-0" {...dragListeners} {...attributes} />
          {/* Content — pointer-events-none so clicks/drags pass through to drag handle */}
          <div className="relative pointer-events-none px-1.5 py-0.5">
            <div className="flex items-center gap-1 truncate">
              <CheckCircle2 className="h-2.5 w-2.5 flex-shrink-0 text-primary" />
              <span
                className={`truncate font-medium ${isCompleted ? "line-through decoration-1" : ""}`}
                style={{ color: impactColor }}
              >
                {title}
              </span>
            </div>
            {item.height > 30 && (
              <div className="truncate opacity-70 text-[10px]">
                {timeLabel}
                {durationMinutes ? ` - ${durationMinutes}m` : ""}
              </div>
            )}
          </div>
        </button>
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
