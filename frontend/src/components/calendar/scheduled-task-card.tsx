import { useDraggable } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Check, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  useDeleteTaskApiV1TasksTaskIdDelete,
  useRestoreTaskApiV1TasksTaskIdRestorePost,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { announce } from "@/components/live-announcer";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { PositionedItem } from "@/lib/calendar-utils";
import { IMPACT_COLORS } from "@/lib/task-utils";

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
}: ScheduledTaskCardProps) {
  const queryClient = useQueryClient();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();
  const restoreTask = useRestoreTaskApiV1TasksTaskIdRestorePost();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(taskId),
    data: { type: "scheduled-task", taskId },
  });

  const width = `${100 / item.totalColumns}%`;
  const left = `${(item.column / item.totalColumns) * 100}%`;
  const impactColor = IMPACT_COLORS[impact] ?? IMPACT_COLORS[4];

  const handleUnschedule = () => {
    const tasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
    );
    const prev = tasks?.find((t) => t.id === taskId);
    const prevDate = prev?.scheduled_date ?? null;
    const prevTime = prev?.scheduled_time ?? null;

    updateTask.mutate(
      { taskId, data: { scheduled_date: null, scheduled_time: null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
          announce("Task unscheduled");
          toast.success("Task unscheduled", {
            id: `unschedule-${taskId}`,
            action: {
              label: "Undo",
              onClick: () => {
                updateTask.mutate(
                  { taskId, data: { scheduled_date: prevDate, scheduled_time: prevTime } },
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
        onError: () => toast.error("Failed to unschedule task", { id: `unschedule-err-${taskId}` }),
      },
    );
  };

  const handleComplete = () => {
    const previousTasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
    );

    queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
      (old) => {
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
      },
    );

    toggleComplete.mutate(
      { taskId, data: null },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
          announce(isCompleted ? "Task reopened" : "Task completed");
          toast.success(isCompleted ? "Task reopened" : "Task completed", {
            id: `complete-${taskId}`,
          });
        },
        onError: () => {
          queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
          toast.error("Failed to complete task", { id: `complete-err-${taskId}` });
        },
      },
    );
  };

  const handleDelete = () => {
    deleteTask.mutate(
      { taskId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
          announce("Task deleted");
          toast.success(`Deleted "${title}"`, {
            id: `delete-${taskId}`,
            action: {
              label: "Undo",
              onClick: () => {
                restoreTask.mutate(
                  { taskId },
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
        onError: () => toast.error("Failed to delete task", { id: `delete-err-${taskId}` }),
      },
    );
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          ref={setNodeRef}
          type="button"
          className={`absolute rounded-[10px] overflow-hidden text-xs text-left cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-primary/50 transition-shadow border border-border/40 bg-card ${isDragging ? "opacity-50 ring-1 ring-primary" : ""} ${dimmed ? "opacity-60" : ""}`}
          style={{
            top: `${item.top}px`,
            height: `${Math.max(item.height, 18)}px`,
            width,
            left,
            borderLeft: `2px solid ${impactColor}`,
          }}
          title={`${title}\n${timeLabel}${durationMinutes ? ` (${durationMinutes}m)` : ""}`}
          onClick={() => onClick?.()}
        >
          {/* Drag handle — covers entire card, receives pointer events for dnd-kit */}
          <div className="absolute inset-0" {...listeners} {...attributes} />
          {/* Content — pointer-events-none so clicks/drags pass through to drag handle */}
          <div className="relative pointer-events-none px-1.5 py-0.5">
            <div className="flex items-center gap-1 truncate">
              <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-primary" />
              <span className="truncate font-medium">{title}</span>
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
        <ContextMenuItem onClick={() => onClick?.()}>
          <Pencil className="h-3.5 w-3.5 mr-2" />
          Edit
        </ContextMenuItem>
        <ContextMenuItem onClick={handleUnschedule}>
          <CalendarOff className="h-3.5 w-3.5 mr-2" />
          Unschedule
        </ContextMenuItem>
        <ContextMenuItem onClick={handleComplete}>
          <Check className="h-3.5 w-3.5 mr-2" />
          {isCompleted ? "Reopen" : "Complete"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-3.5 w-3.5 mr-2" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
