import { useQueryClient } from "@tanstack/react-query";
import { Calendar, Check, Pencil, SkipForward, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse, InstanceResponse } from "@/api/model";
import {
  getListInstancesApiV1InstancesGetQueryKey,
  getPendingPastCountApiV1InstancesPendingPastCountGetQueryKey,
  useCompleteInstanceApiV1InstancesInstanceIdCompletePost,
  useListInstancesApiV1InstancesGet,
  useSkipInstanceApiV1InstancesInstanceIdSkipPost,
  useUncompleteInstanceApiV1InstancesInstanceIdUncompletePost,
  useUnskipInstanceApiV1InstancesInstanceIdUnskipPost,
} from "@/api/queries/instances/instances";
import {
  getListTasksApiV1TasksGetQueryKey,
  useDeleteTaskApiV1TasksTaskIdDelete,
  useRestoreTaskApiV1TasksTaskIdRestorePost,
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
  /** Pending instance for recurring tasks — enables skip/complete actions on the correct instance */
  pendingInstance?: InstanceResponse;
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
  pendingInstance: pendingInstanceProp,
}: TaskActionSheetProps) {
  const queryClient = useQueryClient();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const completeInstance = useCompleteInstanceApiV1InstancesInstanceIdCompletePost();
  const uncompleteInstance = useUncompleteInstanceApiV1InstancesInstanceIdUncompletePost();
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();
  const restoreTask = useRestoreTaskApiV1TasksTaskIdRestorePost();
  const skipInstance = useSkipInstanceApiV1InstancesInstanceIdSkipPost();
  const unskipInstance = useUnskipInstanceApiV1InstancesInstanceIdUnskipPost();
  const { trigger: haptic } = useHaptics();

  // Fall back to today-only query when no pendingInstance prop is provided
  const today = new Date().toISOString().split("T")[0];
  const needsFallback = !!task?.is_recurring && !pendingInstanceProp && open;
  const instancesQuery = useListInstancesApiV1InstancesGet(
    { start_date: today, end_date: today },
    { query: { enabled: needsFallback } },
  );
  const fallbackInstance = needsFallback
    ? (instancesQuery.data ?? []).find(
        (inst) => inst.task_id === task.id && inst.status === "pending",
      )
    : undefined;
  const pendingInstance = pendingInstanceProp ?? fallbackInstance;

  if (!task) return null;

  const isCompleted = task.status === "completed" || !!task.completed_at;
  const hasSubtasks = (task.subtasks?.length ?? 0) > 0;

  const close = () => onOpenChange(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListInstancesApiV1InstancesGetQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getPendingPastCountApiV1InstancesPendingPastCountGetQueryKey(),
    });
  };

  const handleEdit = () => {
    close();
    onEdit?.(task);
  };

  const handleToggleComplete = () => {
    close();

    // For recurring tasks with a pending instance, complete the instance (not the parent)
    if (task.is_recurring && pendingInstance) {
      const previousInstances = queryClient.getQueryData(
        getListInstancesApiV1InstancesGetQueryKey(),
      );
      queryClient.setQueryData(
        getListInstancesApiV1InstancesGetQueryKey(),
        (old: InstanceResponse[] | undefined) =>
          old?.map((i) =>
            i.id === pendingInstance.id ? { ...i, status: "completed" as const } : i,
          ),
      );
      haptic("success");
      completeInstance.mutate(
        { instanceId: pendingInstance.id },
        {
          onSuccess: () => {
            invalidateAll();
            const dateHint = new Date(
              `${pendingInstance.instance_date}T00:00:00`,
            ).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            toast.success(`Completed "${task.title}" · ${dateHint}`, {
              id: `complete-inst-${pendingInstance.id}`,
              action: {
                label: "Undo",
                onClick: () => {
                  uncompleteInstance.mutate(
                    { instanceId: pendingInstance.id },
                    {
                      onSuccess: () => invalidateAll(),
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
            toast.error("Failed to complete instance", {
              id: `complete-inst-err-${pendingInstance.id}`,
            });
          },
        },
      );
      return;
    }

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
                subtasks: t.subtasks?.map((st) => ({
                  ...st,
                  status: isCompleted ? "pending" : "completed",
                })),
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
          toast.success(isCompleted ? `Reopened "${task.title}"` : `Completed "${task.title}"`, {
            id: `complete-${task.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                toggleComplete.mutate(
                  { taskId: task.id, data: null },
                  {
                    onSuccess: () =>
                      queryClient.invalidateQueries({
                        queryKey: getListTasksApiV1TasksGetQueryKey(),
                      }),
                  },
                );
              },
            },
          });
        },
        onError: () => {
          queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
          toast.error("Failed to update task", { id: `complete-err-${task.id}` });
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
          toast.success(`Deleted "${task.title}"`, {
            id: `delete-${task.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                restoreTask.mutate(
                  { taskId: task.id },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries({
                        queryKey: getListTasksApiV1TasksGetQueryKey(),
                      });
                      toast.success("Task restored", { id: `restore-${task.id}` });
                    },
                    onError: () =>
                      toast.error("Failed to restore task", { id: `restore-err-${task.id}` }),
                  },
                );
              },
            },
          });
        },
        onError: () => {
          toast.error("Failed to delete task", { id: `delete-err-${task.id}` });
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
          label={pendingInstance ? "Complete this one" : isCompleted ? "Uncomplete" : "Complete"}
          onClick={handleToggleComplete}
        />
        <ActionButton
          icon={<Calendar className="h-5 w-5" />}
          label="Schedule"
          onClick={handleSchedule}
        />
        {task.is_recurring && pendingInstance && (
          <ActionButton
            icon={<SkipForward className="h-5 w-5" />}
            label="Skip instance"
            onClick={() => {
              close();
              haptic("light");
              skipInstance.mutate(
                { instanceId: pendingInstance.id },
                {
                  onSuccess: () => {
                    invalidateAll();
                    const dateHint = new Date(
                      `${pendingInstance.instance_date}T00:00:00`,
                    ).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    toast.success(`Skipped "${task.title}" · ${dateHint}`, {
                      id: `skip-inst-${pendingInstance.id}`,
                      action: {
                        label: "Undo",
                        onClick: () => {
                          unskipInstance.mutate(
                            { instanceId: pendingInstance.id },
                            {
                              onSuccess: () => invalidateAll(),
                              onError: () => toast.error("Undo failed"),
                            },
                          );
                        },
                      },
                    });
                  },
                  onError: () =>
                    toast.error("Failed to skip instance", {
                      id: `skip-inst-err-${pendingInstance.id}`,
                    }),
                },
              );
            }}
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
