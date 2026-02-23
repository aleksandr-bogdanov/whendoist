import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  CalendarOff,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  CornerDownRight,
  EllipsisVertical,
  Pencil,
  Plus,
  Repeat,
  SkipForward,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { InstanceResponse, SubtaskResponse, TaskResponse } from "@/api/model";
import {
  getListInstancesApiV1InstancesGetQueryKey,
  getPendingPastCountApiV1InstancesPendingPastCountGetQueryKey,
  useCompleteInstanceApiV1InstancesInstanceIdCompletePost,
  useSkipInstanceApiV1InstancesInstanceIdSkipPost,
  useUncompleteInstanceApiV1InstancesInstanceIdUncompletePost,
  useUnskipInstanceApiV1InstancesInstanceIdUnskipPost,
} from "@/api/queries/instances/instances";
import {
  getListTasksApiV1TasksGetQueryKey,
  getTaskApiV1TasksTaskIdGet,
  useDeleteTaskApiV1TasksTaskIdDelete,
  useRestoreTaskApiV1TasksTaskIdRestorePost,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { announce } from "@/components/live-announcer";
import { ClarityPill, DurationPill, ImpactPill } from "@/components/task/attribute-pills";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatDate,
  formatDuration,
  IMPACT_COLORS,
  IMPACT_WASHES,
  isOverdue,
} from "@/lib/task-utils";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { SubtaskGhostRow } from "./subtask-ghost-row";
import { useDndState } from "./task-dnd-context";

interface TaskItemProps {
  task: TaskResponse;
  depth?: number;
  onSelect?: (taskId: number) => void;
  onEdit?: (task: TaskResponse) => void;
  /** Overdue pending instance for recurring tasks — enables "Skip this one" menu item */
  pendingInstance?: InstanceResponse;
}

export function TaskItem({ task, depth = 0, onSelect, onEdit, pendingInstance }: TaskItemProps) {
  const {
    selectedTaskId,
    selectTask,
    expandedSubtasks,
    toggleExpandedSubtask,
    requestSubtaskAdd,
    setMobileTab,
    justUpdatedId,
  } = useUIStore();
  const isJustUpdated = justUpdatedId === task.id;
  const queryClient = useQueryClient();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();
  const restoreTask = useRestoreTaskApiV1TasksTaskIdRestorePost();
  const completeInstance = useCompleteInstanceApiV1InstancesInstanceIdCompletePost();
  const uncompleteInstance = useUncompleteInstanceApiV1InstancesInstanceIdUncompletePost();
  const skipInstance = useSkipInstanceApiV1InstancesInstanceIdSkipPost();
  const unskipInstance = useUnskipInstanceApiV1InstancesInstanceIdUnskipPost();
  const isSelected = selectedTaskId === task.id;
  const isCompleted = task.status === "completed" || !!task.completed_at;
  const hasSubtasks = (task.subtasks?.length ?? 0) > 0;
  const isExpanded = expandedSubtasks.has(task.id);
  const canHaveSubtasks = !task.is_recurring && !isCompleted && task.parent_id == null;

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListInstancesApiV1InstancesGetQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getPendingPastCountApiV1InstancesPendingPastCountGetQueryKey(),
    });
  }, [queryClient]);

  const [menuOpen, setMenuOpen] = useState(false);

  // --- Drag-and-drop: draggable + droppable (for reparenting) ---
  const dndState = useDndState();
  const activeTaskData = dndState.activeTask;

  // Determine if this task can accept a dropped child
  const canReceiveChild = useMemo(() => {
    if (!dndState.activeId || !activeTaskData) return false;
    const activeNumId =
      typeof dndState.activeId === "string"
        ? Number.parseInt(dndState.activeId, 10)
        : Number(dndState.activeId);
    if (activeNumId === task.id) return false;
    if (task.parent_id != null) return false;
    if (task.is_recurring) return false;
    if ((activeTaskData.subtasks?.length ?? 0) > 0) return false;
    if (activeTaskData.subtasks?.some((st) => st.id === task.id)) return false;
    if (activeTaskData.parent_id === task.id) return false;
    return true;
  }, [dndState.activeId, activeTaskData, task]);

  // Make task draggable
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: String(task.id),
    data: { type: "task", task },
  });

  // Make task a drop target for reparenting
  const { setNodeRef: setDropRef, isOver: isDropOver } = useDroppable({
    id: `task-drop-${task.id}`,
    data: { type: "reparent", taskId: task.id },
    disabled: !canReceiveChild,
  });

  // Merge drag + drop refs
  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );

  const isReparentTarget = isDropOver && canReceiveChild;

  const handleTitleClick = () => {
    if (hasSubtasks) {
      toggleExpandedSubtask(task.id);
      return;
    }
    selectTask(task.id);
    onSelect?.(task.id);
    onEdit?.(task);
  };

  const isCompletePending =
    toggleComplete.isPending || completeInstance.isPending || uncompleteInstance.isPending;

  const handleToggleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCompletePending) return;

    // For recurring tasks with a pending instance, complete/uncomplete the instance (not the parent)
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
      completeInstance.mutate(
        { instanceId: pendingInstance.id },
        {
          onSuccess: () => {
            invalidateAll();
            announce("Instance completed");
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

    // Non-recurring task: toggle complete on the parent
    const previousTasks = queryClient.getQueryData<TaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
    );

    queryClient.setQueryData<TaskResponse[]>(getListTasksApiV1TasksGetQueryKey(), (old) => {
      if (!old) return old;
      return old.map((t) => {
        if (t.id === task.id) {
          return {
            ...t,
            status: isCompleted ? "pending" : "completed",
            completed_at: isCompleted ? null : new Date().toISOString(),
            subtasks: t.subtasks?.map((st) => ({
              ...st,
              status: isCompleted ? "pending" : "completed",
            })),
          };
        }
        return t;
      });
    });

    toggleComplete.mutate(
      { taskId: task.id, data: null },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
          announce(isCompleted ? "Task reopened" : "Task completed");
          toast.success(isCompleted ? `Reopened "${task.title}"` : `Completed "${task.title}"`, {
            id: `complete-${task.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                toggleComplete.mutate(
                  { taskId: task.id, data: null },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries({
                        queryKey: getListTasksApiV1TasksGetQueryKey(),
                      });
                    },
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

  const handleMenuEdit = useCallback(() => {
    onEdit?.(task);
    setMenuOpen(false);
  }, [task, onEdit]);

  const handleMenuComplete = useCallback(() => {
    if (isCompletePending) return;
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
      setMenuOpen(false);
      return;
    }

    const previousTasks = queryClient.getQueryData<TaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
    );
    queryClient.setQueryData<TaskResponse[]>(getListTasksApiV1TasksGetQueryKey(), (old) =>
      old?.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: isCompleted ? "pending" : "completed",
              completed_at: isCompleted ? null : new Date().toISOString(),
              subtasks: t.subtasks?.map((st) => ({
                ...st,
                status: isCompleted ? "pending" : "completed",
              })),
            }
          : t,
      ),
    );
    toggleComplete.mutate(
      { taskId: task.id, data: null },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
        },
        onError: () => {
          queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
          toast.error("Failed to update task", { id: `complete-err-${task.id}` });
        },
      },
    );
    setMenuOpen(false);
  }, [
    task,
    isCompleted,
    isCompletePending,
    pendingInstance,
    queryClient,
    toggleComplete,
    completeInstance,
    uncompleteInstance,
    invalidateAll,
  ]);

  const handleMenuSchedule = useCallback(() => {
    selectTask(task.id);
    setMobileTab("calendar");
    setMenuOpen(false);
  }, [task.id, selectTask, setMobileTab]);

  const handleMenuUnschedule = useCallback(() => {
    const prevDate = task.scheduled_date;
    const prevTime = task.scheduled_time ?? null;

    const previousTasks = queryClient.getQueryData<TaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
    );
    queryClient.setQueryData<TaskResponse[]>(getListTasksApiV1TasksGetQueryKey(), (old) =>
      old?.map((t) =>
        t.id === task.id ? { ...t, scheduled_date: null, scheduled_time: null } : t,
      ),
    );
    updateTask.mutate(
      { taskId: task.id, data: { scheduled_date: null, scheduled_time: null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
          announce("Task unscheduled");
          toast.success(`Unscheduled "${task.title}"`, {
            id: `unschedule-${task.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                queryClient.setQueryData<TaskResponse[]>(
                  getListTasksApiV1TasksGetQueryKey(),
                  (old) =>
                    old?.map((t) =>
                      t.id === task.id
                        ? { ...t, scheduled_date: prevDate, scheduled_time: prevTime }
                        : t,
                    ),
                );
                updateTask.mutate(
                  { taskId: task.id, data: { scheduled_date: prevDate, scheduled_time: prevTime } },
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
          toast.error("Failed to unschedule task", { id: `unschedule-err-${task.id}` });
        },
      },
    );
    setMenuOpen(false);
  }, [task, updateTask, queryClient]);

  const handleMenuSkip = useCallback(() => {
    if (!pendingInstance) return;
    const previousInstances = queryClient.getQueryData(getListInstancesApiV1InstancesGetQueryKey());
    queryClient.setQueryData(
      getListInstancesApiV1InstancesGetQueryKey(),
      (old: InstanceResponse[] | undefined) =>
        old?.map((i) => (i.id === pendingInstance.id ? { ...i, status: "skipped" as const } : i)),
    );
    skipInstance.mutate(
      { instanceId: pendingInstance.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListInstancesApiV1InstancesGetQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getPendingPastCountApiV1InstancesPendingPastCountGetQueryKey(),
          });
          announce("Instance skipped");
          const dateHint = new Date(`${pendingInstance.instance_date}T00:00:00`).toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric" },
          );
          toast.success(`Skipped "${task.title}" · ${dateHint}`, {
            id: `skip-inst-${pendingInstance.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                unskipInstance.mutate(
                  { instanceId: pendingInstance.id },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries({
                        queryKey: getListInstancesApiV1InstancesGetQueryKey(),
                      });
                      queryClient.invalidateQueries({
                        queryKey: getListTasksApiV1TasksGetQueryKey(),
                      });
                      queryClient.invalidateQueries({
                        queryKey: getPendingPastCountApiV1InstancesPendingPastCountGetQueryKey(),
                      });
                    },
                    onError: () => toast.error("Undo failed"),
                  },
                );
              },
            },
          });
        },
        onError: () => {
          queryClient.setQueryData(getListInstancesApiV1InstancesGetQueryKey(), previousInstances);
          toast.error("Failed to skip instance", { id: `skip-inst-err-${pendingInstance.id}` });
        },
      },
    );
    setMenuOpen(false);
  }, [task, pendingInstance, skipInstance, unskipInstance, queryClient]);

  const handleMenuDelete = useCallback(() => {
    deleteTask.mutate(
      { taskId: task.id },
      {
        onSuccess: () => {
          invalidateAll();
          announce("Task deleted");
          toast.success(`Deleted "${task.title}"`, {
            id: `delete-${task.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                restoreTask.mutate(
                  { taskId: task.id },
                  {
                    onSuccess: () => invalidateAll(),
                    onError: () => {
                      invalidateAll();
                      toast.error("Undo failed");
                    },
                  },
                );
              },
            },
          });
        },
        onError: () => toast.error("Failed to delete task", { id: `delete-err-${task.id}` }),
      },
    );
    setMenuOpen(false);
  }, [task, deleteTask, restoreTask, invalidateAll]);

  const scheduledDate = task.scheduled_date;
  // For recurring tasks with a pending instance, use instance date for overdue display
  const displayDate = pendingInstance?.instance_date ?? scheduledDate;
  const overdue = isOverdue(displayDate) && !isCompleted;
  const impactColor = IMPACT_COLORS[task.impact] ?? IMPACT_COLORS[4];
  const isParent = hasSubtasks;

  // Aggregated subtask stats for parent containers
  const subtaskStats = useMemo(() => {
    if (!isParent || !task.subtasks) return null;
    let pendingDuration = 0;
    let totalDuration = 0;
    let activeCount = 0;
    const totalCount = task.subtasks.length;
    for (const st of task.subtasks) {
      const d = st.duration_minutes ?? 0;
      totalDuration += d;
      if (st.status !== "completed") {
        pendingDuration += d;
        activeCount++;
      }
    }
    return { pendingDuration, totalDuration, activeCount, totalCount };
  }, [isParent, task.subtasks]);

  const contextMenuItems = (
    <>
      <ContextMenuItem onClick={handleMenuEdit}>
        <Pencil className="h-3.5 w-3.5 mr-2" />
        Edit
      </ContextMenuItem>
      <ContextMenuItem onClick={handleMenuComplete}>
        <Check className="h-3.5 w-3.5 mr-2" />
        {pendingInstance ? "Complete this one" : isCompleted ? "Reopen" : "Complete"}
      </ContextMenuItem>
      {pendingInstance && (
        <ContextMenuItem onClick={handleMenuSkip}>
          <SkipForward className="h-3.5 w-3.5 mr-2" />
          Skip this one
        </ContextMenuItem>
      )}
      {!task.scheduled_date && (
        <ContextMenuItem onClick={handleMenuSchedule}>
          <CalendarPlus className="h-3.5 w-3.5 mr-2" />
          Schedule
        </ContextMenuItem>
      )}
      {task.scheduled_date && !task.is_recurring && (
        <ContextMenuItem onClick={handleMenuUnschedule}>
          <CalendarOff className="h-3.5 w-3.5 mr-2" />
          Unschedule
        </ContextMenuItem>
      )}
      {canHaveSubtasks && (
        <ContextMenuItem onClick={() => requestSubtaskAdd(task.id)}>
          <Plus className="h-3.5 w-3.5 mr-2" />
          Add subtask
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={handleMenuDelete}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5 mr-2" />
        Delete
      </ContextMenuItem>
    </>
  );

  return (
    <div ref={mergedRef} data-task-id={task.id}>
      {/* Reparent indicator badge */}
      {isReparentTarget && (
        <div className="relative z-20 flex justify-center pointer-events-none">
          <span className="absolute -bottom-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#6D5EF6] text-white text-[10px] font-semibold shadow-lg whitespace-nowrap">
            <CornerDownRight className="h-3 w-3" />
            {dndState.activeTask?.parent_id != null ? "Change parent task" : "Make a subtask"}
          </span>
        </div>
      )}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <div
                className={cn(
                  "group relative flex items-center gap-[var(--col-gap)] py-1.5 sm:py-2 transition-all duration-150 border-b border-border/40 cursor-grab active:cursor-grabbing hover:bg-[rgba(109,94,246,0.04)] hover:shadow-[inset_0_0_0_1px_rgba(109,94,246,0.12)]",
                  isSelected && "bg-[rgba(109,94,246,0.08)]",
                  isCompleted && "opacity-60",
                  isDragging && "opacity-30",
                  isJustUpdated && "ring-2 ring-primary/30 animate-pulse",
                  isReparentTarget && "bg-[#6D5EF6]/8 shadow-[-4px_0_12px_rgba(109,94,246,0.15)]",
                )}
                style={{
                  paddingLeft: `${depth * 24 + 8}px`,
                  borderLeftWidth: 3,
                  borderLeftColor: isParent ? "var(--border)" : impactColor,
                  borderLeftStyle: "solid",
                  borderRadius: isParent ? undefined : "4px 0 0 4px",
                  backgroundColor: isParent
                    ? undefined
                    : (IMPACT_WASHES[task.impact] ?? IMPACT_WASHES[4]),
                }}
                {...attributes}
                {...listeners}
              >
                {/* Checkbox — brand circle */}
                <button
                  type="button"
                  className="flex-shrink-0 cursor-pointer relative z-10 [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-[-8px] [@media(pointer:coarse)]:before:content-['']"
                  onClick={handleToggleComplete}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={isCompletePending}
                  title={isCompleted ? "Mark as pending" : "Mark as complete"}
                >
                  <svg
                    viewBox="0 0 24 24"
                    role="img"
                    aria-label={isCompleted ? "Completed" : "Not completed"}
                    className={cn(
                      "h-[18px] w-[18px] transition-colors",
                      isCompleted && "animate-[completion-pulse_0.35s_ease-out]",
                      !isCompleted && "group/cb",
                    )}
                  >
                    {isCompleted ? (
                      <>
                        <circle cx="12" cy="12" r="10" fill="#6D5EF6" />
                        <polyline
                          points="8 12 10.5 14.5 16 9"
                          fill="none"
                          stroke="white"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </>
                    ) : (
                      <>
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className="text-muted-foreground/20 group-hover/cb:text-[#6D5EF6]/60"
                        />
                        <polyline
                          points="8 12 10.5 14.5 16 9"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-muted-foreground/0 group-hover/cb:text-[#6D5EF6]/30"
                        />
                      </>
                    )}
                  </svg>
                </button>

                {/* Title — no stopPropagation so drag works from title too */}
                <button
                  type="button"
                  data-task-title-btn
                  className="flex-1 min-w-0 text-left cursor-pointer hover:opacity-80 relative z-10"
                  onClick={handleTitleClick}
                >
                  <span
                    className={cn(
                      "text-sm line-clamp-2",
                      isCompleted && "line-through text-muted-foreground",
                    )}
                  >
                    {task.title}
                  </span>
                </button>

                {/* Subtask expand toggle */}
                {hasSubtasks && (
                  <button
                    type="button"
                    onClick={() => toggleExpandedSubtask(task.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="flex-shrink-0 p-0.5 rounded hover:bg-[rgba(109,94,246,0.06)] relative z-10"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                )}

                {/* Subtask count */}
                {hasSubtasks && !isExpanded && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {task.subtasks!.length}
                  </Badge>
                )}

                {/* Quick add subtask — hover only, desktop */}
                {canHaveSubtasks && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      requestSubtaskAdd(task.id);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={cn(
                      "flex-shrink-0 p-0.5 rounded hover:bg-[rgba(109,94,246,0.06)] relative z-10 transition-opacity",
                      "opacity-0 group-hover:opacity-100",
                      "hidden sm:flex",
                      !hasSubtasks && "group-hover:opacity-50 hover:!opacity-100",
                    )}
                    title="Add subtask"
                  >
                    <Plus className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}

                {/* Recurring indicator */}
                {task.is_recurring && (
                  <Repeat className="hidden sm:block h-3 w-3 text-muted-foreground flex-shrink-0" />
                )}

                {/* Scheduled date (use instance date for recurring overdue) */}
                {displayDate && (
                  <span
                    className={cn(
                      "hidden sm:flex items-center gap-0.5 text-[11px] flex-shrink-0",
                      overdue ? "text-destructive font-medium" : "text-muted-foreground",
                    )}
                  >
                    <Calendar className="h-3 w-3" />
                    {formatDate(displayDate)}
                  </span>
                )}

                {/* Metadata columns — grid-aligned */}
                <span className="hidden sm:flex items-center gap-[var(--col-gap)] flex-shrink-0">
                  {isParent ? (
                    <>
                      {/* Active / total subtask count */}
                      <span className="w-[var(--col-clarity)] text-center text-[0.65rem] tabular-nums text-muted-foreground/60">
                        {subtaskStats ? (
                          <span>
                            {subtaskStats.activeCount}
                            <span className="opacity-50">/{subtaskStats.totalCount}</span>
                          </span>
                        ) : null}
                      </span>
                      {/* Aggregated subtask duration: remaining / total */}
                      <span className="w-[var(--col-duration)] text-center text-[0.65rem] tabular-nums text-muted-foreground/60">
                        {subtaskStats && subtaskStats.totalDuration > 0 ? (
                          <span className="flex items-center justify-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            {formatDuration(subtaskStats.pendingDuration)}
                            <span className="opacity-50">
                              /{formatDuration(subtaskStats.totalDuration)}
                            </span>
                          </span>
                        ) : (
                          <span className="opacity-30">&mdash;</span>
                        )}
                      </span>
                      {/* Empty impact slot */}
                      <span className="w-[var(--col-impact)]" />
                    </>
                  ) : (
                    <>
                      {/* Clarity */}
                      <span className="w-[var(--col-clarity)] text-center">
                        <ClarityPill taskId={task.id} value={task.clarity} disabled={isCompleted} />
                      </span>

                      {/* Duration */}
                      <span className="w-[var(--col-duration)] text-center">
                        <DurationPill
                          taskId={task.id}
                          value={task.duration_minutes}
                          disabled={isCompleted}
                        />
                      </span>

                      {/* Impact */}
                      <span className="w-[var(--col-impact)] text-center">
                        <ImpactPill taskId={task.id} value={task.impact} disabled={isCompleted} />
                      </span>
                    </>
                  )}
                </span>

                {/* Kebab menu button */}
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="hidden sm:flex flex-shrink-0 p-0.5 rounded hover:bg-[rgba(109,94,246,0.06)] relative z-10 opacity-0 group-hover:opacity-100 transition-opacity w-[var(--col-actions)] justify-center"
                    title="Task actions"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <EllipsisVertical className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
              </div>
              <DropdownMenuContent align="start" className="min-w-[140px]">
                <DropdownMenuItem onClick={handleMenuEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMenuComplete}>
                  <Check className="h-3.5 w-3.5 mr-2" />
                  {pendingInstance ? "Complete this one" : isCompleted ? "Reopen" : "Complete"}
                </DropdownMenuItem>
                {pendingInstance && (
                  <DropdownMenuItem onClick={handleMenuSkip}>
                    <SkipForward className="h-3.5 w-3.5 mr-2" />
                    Skip this one
                  </DropdownMenuItem>
                )}
                {!task.scheduled_date && (
                  <DropdownMenuItem onClick={handleMenuSchedule}>
                    <CalendarPlus className="h-3.5 w-3.5 mr-2" />
                    Schedule
                  </DropdownMenuItem>
                )}
                {task.scheduled_date && !task.is_recurring && (
                  <DropdownMenuItem onClick={handleMenuUnschedule}>
                    <CalendarOff className="h-3.5 w-3.5 mr-2" />
                    Unschedule
                  </DropdownMenuItem>
                )}
                {canHaveSubtasks && (
                  <DropdownMenuItem
                    onClick={() => {
                      requestSubtaskAdd(task.id);
                      setMenuOpen(false);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-2" />
                    Add subtask
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleMenuDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-[140px]">{contextMenuItems}</ContextMenuContent>
      </ContextMenu>

      {/* Ghost placeholder — shows where the dragged task will land as a subtask */}
      {isReparentTarget && dndState.activeTask && (
        <div
          className="flex items-center gap-2 border-2 border-dashed border-[#6D5EF6]/30 rounded-lg bg-[#6D5EF6]/[0.03]"
          style={{ marginLeft: `${(depth + 1) * 24}px`, padding: "6px 10px" }}
        >
          <svg
            viewBox="0 0 24 24"
            role="img"
            aria-label="Placeholder"
            className="h-[15px] w-[15px] flex-shrink-0"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-[#6D5EF6]/25"
            />
          </svg>
          <span className="text-sm text-[#6D5EF6]/50 truncate">{dndState.activeTask.title}</span>
        </div>
      )}

      {/* Expanded subtasks */}
      <AnimatePresence initial={false}>
        {isExpanded && (hasSubtasks || canHaveSubtasks) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
            className="relative"
          >
            {/* Subtask connector line — centered under parent checkbox */}
            {hasSubtasks && (
              <div
                className="absolute top-0 bottom-4 border-l-2 border-border/40"
                style={{ left: `${depth * 24 + 19}px` }}
              />
            )}
            <SubtaskTree
              subtasks={task.subtasks ?? []}
              parentTask={task}
              depth={depth + 1}
              onSelect={onSelect}
              onEdit={onEdit}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SubtaskTreeProps {
  subtasks: SubtaskResponse[];
  parentTask: TaskResponse;
  depth: number;
  onSelect?: (taskId: number) => void;
  onEdit?: (task: TaskResponse) => void;
}

function SubtaskTree({ subtasks, parentTask, depth, onSelect, onEdit }: SubtaskTreeProps) {
  const canAdd =
    !parentTask.is_recurring && parentTask.status !== "completed" && !parentTask.completed_at;

  return (
    <div>
      {subtasks.map((st) => (
        <SubtaskItem
          key={st.id}
          subtask={st}
          parentId={parentTask.id}
          depth={depth}
          onSelect={onSelect}
          onEdit={onEdit}
        />
      ))}
      {canAdd && <SubtaskGhostRow parentTask={parentTask} depth={depth} />}
    </div>
  );
}

interface SubtaskItemProps {
  subtask: SubtaskResponse;
  parentId: number;
  depth: number;
  onSelect?: (taskId: number) => void;
  onEdit?: (task: TaskResponse) => void;
}

function SubtaskItem({ subtask, parentId, depth, onSelect, onEdit }: SubtaskItemProps) {
  const { selectedTaskId, selectTask } = useUIStore();
  const queryClient = useQueryClient();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();
  const restoreTask = useRestoreTaskApiV1TasksTaskIdRestorePost();
  const isSelected = selectedTaskId === subtask.id;
  const isCompleted = subtask.status === "completed";
  const impactColor = IMPACT_COLORS[subtask.impact] ?? IMPACT_COLORS[4];
  const [menuOpen, setMenuOpen] = useState(false);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(subtask.id),
    data: { type: "subtask", task: subtask, parentId },
  });

  const handleClick = async () => {
    selectTask(subtask.id);
    onSelect?.(subtask.id);
    try {
      const fullTask = await getTaskApiV1TasksTaskIdGet(subtask.id);
      onEdit?.(fullTask as TaskResponse);
    } catch {
      onEdit?.(subtask as unknown as TaskResponse);
    }
  };

  const doToggleComplete = useCallback(() => {
    const previousTasks = queryClient.getQueryData<TaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
    );

    queryClient.setQueryData<TaskResponse[]>(getListTasksApiV1TasksGetQueryKey(), (old) =>
      old?.map((t) => ({
        ...t,
        subtasks: t.subtasks?.map((st) =>
          st.id === subtask.id
            ? { ...st, status: isCompleted ? ("pending" as const) : ("completed" as const) }
            : st,
        ),
      })),
    );

    toggleComplete.mutate(
      { taskId: subtask.id, data: null },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
        },
        onError: () => {
          queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
          toast.error("Failed to update task", { id: `complete-err-${subtask.id}` });
        },
      },
    );
  }, [subtask.id, isCompleted, queryClient, toggleComplete]);

  const handleToggleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (toggleComplete.isPending) return;
    doToggleComplete();
  };

  const handleMenuEdit = useCallback(() => {
    setMenuOpen(false);
    selectTask(subtask.id);
    onSelect?.(subtask.id);
    getTaskApiV1TasksTaskIdGet(subtask.id)
      .then((fullTask) => onEdit?.(fullTask as TaskResponse))
      .catch(() => onEdit?.(subtask as unknown as TaskResponse));
  }, [subtask, onSelect, onEdit, selectTask]);

  const handleMenuComplete = useCallback(() => {
    setMenuOpen(false);
    doToggleComplete();
  }, [doToggleComplete]);

  const handleMenuDelete = useCallback(() => {
    setMenuOpen(false);

    // Optimistically remove the subtask from parent's subtasks array
    const previousTasks = queryClient.getQueryData<TaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
    );
    queryClient.setQueryData<TaskResponse[]>(getListTasksApiV1TasksGetQueryKey(), (old) =>
      old?.map((t) =>
        t.id === parentId
          ? { ...t, subtasks: t.subtasks?.filter((st) => st.id !== subtask.id) }
          : t,
      ),
    );

    deleteTask.mutate(
      { taskId: subtask.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
          announce("Subtask deleted");
          toast.success(`Deleted "${subtask.title}"`, {
            id: `delete-${subtask.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                restoreTask.mutate(
                  { taskId: subtask.id },
                  {
                    onSuccess: () =>
                      queryClient.invalidateQueries({
                        queryKey: getListTasksApiV1TasksGetQueryKey(),
                      }),
                    onError: () => toast.error("Undo failed"),
                  },
                );
              },
            },
          });
        },
        onError: () => {
          queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
          toast.error("Failed to delete subtask", { id: `delete-err-${subtask.id}` });
        },
      },
    );
  }, [subtask, parentId, deleteTask, restoreTask, queryClient]);

  const contextMenuItems = (
    <>
      <ContextMenuItem onClick={handleMenuEdit}>
        <Pencil className="h-3.5 w-3.5 mr-2" />
        Edit
      </ContextMenuItem>
      <ContextMenuItem onClick={handleMenuComplete}>
        <Check className="h-3.5 w-3.5 mr-2" />
        {isCompleted ? "Reopen" : "Complete"}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={handleMenuDelete}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5 mr-2" />
        Delete
      </ContextMenuItem>
    </>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <div
              ref={setNodeRef}
              className={cn(
                "group flex items-center gap-[var(--col-gap)] py-1 transition-colors border-b border-border/20 cursor-grab active:cursor-grabbing",
                "hover:bg-[rgba(109,94,246,0.04)] hover:shadow-[inset_0_0_0_1px_rgba(109,94,246,0.12)]",
                isSelected && "bg-[rgba(109,94,246,0.08)]",
                isCompleted && "opacity-60",
                isDragging && "opacity-50",
              )}
              style={{
                marginLeft: `${depth * 24}px`,
                paddingLeft: 8,
                borderLeftWidth: 3,
                borderLeftColor: impactColor,
                borderLeftStyle: "solid",
                borderRadius: "4px 0 0 4px",
                backgroundColor: IMPACT_WASHES[subtask.impact] ?? IMPACT_WASHES[4],
              }}
              {...listeners}
              {...attributes}
            >
              <button
                type="button"
                className="flex-shrink-0 cursor-pointer group/cb"
                onClick={handleToggleComplete}
                onPointerDown={(e) => e.stopPropagation()}
                title={isCompleted ? "Mark as pending" : "Mark as complete"}
              >
                <svg
                  viewBox="0 0 24 24"
                  role="img"
                  aria-label={isCompleted ? "Completed" : "Not completed"}
                  className="h-[15px] w-[15px] transition-colors"
                >
                  {isCompleted ? (
                    <>
                      <circle cx="12" cy="12" r="10" fill="#6D5EF6" />
                      <polyline
                        points="8 12 10.5 14.5 16 9"
                        fill="none"
                        stroke="white"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  ) : (
                    <>
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="text-muted-foreground/20 group-hover/cb:text-[#6D5EF6]/60"
                      />
                      <polyline
                        points="8 12 10.5 14.5 16 9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-muted-foreground/0 group-hover/cb:text-[#6D5EF6]/30"
                      />
                    </>
                  )}
                </svg>
              </button>

              <button
                type="button"
                className="flex-1 min-w-0 text-left cursor-pointer"
                onClick={handleClick}
              >
                <span
                  className={cn(
                    "text-sm line-clamp-2",
                    isCompleted && "line-through text-muted-foreground",
                  )}
                >
                  {subtask.title}
                </span>
              </button>

              {/* Metadata columns — grid-aligned with parent task */}
              <span className="hidden sm:flex items-center gap-[var(--col-gap)] flex-shrink-0">
                {/* Clarity */}
                <span className="w-[var(--col-clarity)] text-center">
                  <ClarityPill taskId={subtask.id} value={subtask.clarity} disabled={isCompleted} />
                </span>

                {/* Duration */}
                <span className="w-[var(--col-duration)] text-center">
                  <DurationPill
                    taskId={subtask.id}
                    value={subtask.duration_minutes}
                    disabled={isCompleted}
                  />
                </span>

                {/* Impact */}
                <span className="w-[var(--col-impact)] text-center">
                  <ImpactPill taskId={subtask.id} value={subtask.impact} disabled={isCompleted} />
                </span>
              </span>

              {/* Kebab menu button */}
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="hidden sm:flex flex-shrink-0 p-0.5 rounded hover:bg-[rgba(109,94,246,0.06)] relative z-10 opacity-0 group-hover:opacity-100 transition-opacity w-[var(--col-actions)] justify-center"
                  title="Subtask actions"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <EllipsisVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
            </div>
            <DropdownMenuContent align="start" className="min-w-[140px]">
              <DropdownMenuItem onClick={handleMenuEdit}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleMenuComplete}>
                <Check className="h-3.5 w-3.5 mr-2" />
                {isCompleted ? "Reopen" : "Complete"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleMenuDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[140px]">{contextMenuItems}</ContextMenuContent>
    </ContextMenu>
  );
}
