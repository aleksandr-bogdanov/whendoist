import { useQueryClient } from "@tanstack/react-query";
import { Calendar, Check, Pencil, SkipForward, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  useDeleteTaskApiV1TasksTaskIdDelete,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
} from "@/api/queries/tasks/tasks";
import { useHaptics } from "@/hooks/use-haptics";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./bottom-sheet";

interface TaskActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: AppRoutersTasksTaskResponse | null;
  onEdit?: (task: AppRoutersTasksTaskResponse) => void;
  onSchedule?: (task: AppRoutersTasksTaskResponse) => void;
}

/**
 * Mobile action sheet triggered by long-press on a task.
 * Shows edit, complete, schedule, skip (recurring), and delete actions.
 */
export function TaskActionSheet({
  open,
  onOpenChange,
  task,
  onEdit,
  onSchedule,
}: TaskActionSheetProps) {
  const queryClient = useQueryClient();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();
  const { trigger: haptic } = useHaptics();

  if (!task) return null;

  const isCompleted = task.status === "completed" || !!task.completed_at;
  const hasSubtasks = (task.subtasks?.length ?? 0) > 0;

  const close = () => onOpenChange(false);

  const handleEdit = () => {
    close();
    onEdit?.(task);
  };

  const handleToggleComplete = () => {
    close();

    const previousTasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
    );

    queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
      (old) => {
        if (!old) return old;
        return old.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: isCompleted ? ("pending" as const) : ("completed" as const),
                completed_at: isCompleted ? null : new Date().toISOString(),
              }
            : t,
        );
      },
    );

    haptic(isCompleted ? "light" : "success");

    toggleComplete.mutate(
      { taskId: task.id, data: null },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
          toast.success(isCompleted ? "Task reopened" : "Task completed");
        },
        onError: () => {
          queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
          toast.error("Failed to update task");
        },
      },
    );
  };

  const handleSchedule = () => {
    close();
    onSchedule?.(task);
  };

  const handleDelete = () => {
    if (hasSubtasks) {
      const count = task.subtasks!.length;
      if (
        !window.confirm(
          `This task has ${count} subtask${count > 1 ? "s" : ""}. Deleting it will also delete all subtasks. Continue?`,
        )
      ) {
        return;
      }
    }

    haptic("warning");
    close();

    deleteTask.mutate(
      { taskId: task.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
          toast.info(`Deleted "${task.title}"`, { duration: 5000 });
        },
        onError: () => {
          toast.error("Failed to delete task");
        },
      },
    );
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={task.title}>
      <div className="flex flex-col gap-0.5 pb-4">
        <ActionButton icon={<Pencil className="h-5 w-5" />} label="Edit" onClick={handleEdit} />
        <ActionButton
          icon={isCompleted ? <Undo2 className="h-5 w-5" /> : <Check className="h-5 w-5" />}
          label={isCompleted ? "Uncomplete" : "Complete"}
          onClick={handleToggleComplete}
        />
        <ActionButton
          icon={<Calendar className="h-5 w-5" />}
          label="Schedule"
          onClick={handleSchedule}
        />
        {task.is_recurring && (
          <ActionButton
            icon={<SkipForward className="h-5 w-5" />}
            label="Skip instance"
            onClick={close}
          />
        )}
        <ActionButton
          icon={<Trash2 className="h-5 w-5" />}
          label="Delete"
          onClick={handleDelete}
          destructive
        />

        <button
          type="button"
          onClick={close}
          className="mt-2 w-full rounded-lg py-3 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
        >
          Cancel
        </button>
      </div>
    </BottomSheet>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full rounded-lg px-3 py-3 text-sm font-medium transition-colors",
        "hover:bg-accent",
        destructive && "text-destructive hover:bg-destructive/10",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
