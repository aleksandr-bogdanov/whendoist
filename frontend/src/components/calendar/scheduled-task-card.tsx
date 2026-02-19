import { useDraggable } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Check, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { announce } from "@/components/live-announcer";
import type { PositionedItem } from "@/lib/calendar-utils";
import { IMPACT_COLORS } from "@/lib/task-utils";

interface ScheduledTaskCardProps {
  item: PositionedItem;
  taskId: number;
  title: string;
  impact: number;
  durationMinutes: number | null;
  timeLabel: string;
  onClick?: () => void;
}

export function ScheduledTaskCard({
  item,
  taskId,
  title,
  impact,
  durationMinutes,
  timeLabel,
  onClick,
}: ScheduledTaskCardProps) {
  const queryClient = useQueryClient();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const [showActions, setShowActions] = useState(false);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(taskId),
    data: { type: "scheduled-task", taskId },
  });

  const width = `${100 / item.totalColumns}%`;
  const left = `${(item.column / item.totalColumns) * 100}%`;
  const impactColor = IMPACT_COLORS[impact] ?? IMPACT_COLORS[4];

  const handleUnschedule = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Capture previous schedule for undo
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
          setShowActions(false);
        },
        onError: () => toast.error("Failed to unschedule task", { id: `unschedule-err-${taskId}` }),
      },
    );
  };

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Optimistic update
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
                status: "completed" as const,
                completed_at: new Date().toISOString(),
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
          announce("Task completed");
          toast.success("Task completed", { id: `complete-${taskId}` });
        },
        onError: () => {
          queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
          toast.error("Failed to complete task", { id: `complete-err-${taskId}` });
        },
      },
    );
    setShowActions(false);
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`absolute rounded-[10px] px-1.5 py-0.5 overflow-hidden text-xs text-left cursor-pointer hover:ring-1 hover:ring-primary/50 transition-shadow border border-border/40 bg-card ${isDragging ? "opacity-50 ring-1 ring-primary" : ""}`}
      style={{
        top: `${item.top}px`,
        height: `${Math.max(item.height, 18)}px`,
        width,
        left,
        borderLeft: `2px solid ${impactColor}`,
      }}
      onClick={() => {
        if (showActions) {
          setShowActions(false);
        } else {
          onClick?.();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowActions((v) => !v);
      }}
      title={`${title}\n${timeLabel}${durationMinutes ? ` (${durationMinutes}m)` : ""}`}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-center gap-1 truncate">
        <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-primary" />
        <span className="truncate font-medium">{title}</span>
      </div>
      {item.height > 30 && !showActions && (
        <div className="truncate opacity-70 text-[10px]">
          {timeLabel}
          {durationMinutes ? ` - ${durationMinutes}m` : ""}
        </div>
      )}
      {showActions && (
        <div className="flex gap-1 mt-0.5">
          <button
            type="button"
            className="flex items-center gap-0.5 rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400 hover:bg-green-500/30 disabled:opacity-50"
            onClick={handleComplete}
            disabled={updateTask.isPending || toggleComplete.isPending}
          >
            <Check className="h-2.5 w-2.5" /> Done
          </button>
          <button
            type="button"
            className="flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/80 disabled:opacity-50"
            onClick={handleUnschedule}
            disabled={updateTask.isPending || toggleComplete.isPending}
          >
            <CalendarOff className="h-2.5 w-2.5" /> Unsched
          </button>
        </div>
      )}
    </button>
  );
}
