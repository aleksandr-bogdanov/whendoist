import { useDraggable } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  CalendarOff,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  EllipsisVertical,
  Pencil,
  Repeat,
  SkipForward,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse, InstanceResponse, SubtaskResponse } from "@/api/model";
import {
  getListInstancesApiV1InstancesGetQueryKey,
  useSkipInstanceApiV1InstancesInstanceIdSkipPost,
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
  CLARITY_COLORS,
  CLARITY_LABELS,
  CLARITY_TINTS,
  formatDate,
  formatDuration,
  IMPACT_COLORS,
  IMPACT_LABELS,
  isOverdue,
} from "@/lib/task-utils";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

interface TaskItemProps {
  task: AppRoutersTasksTaskResponse;
  depth?: number;
  onSelect?: (taskId: number) => void;
  onEdit?: (task: AppRoutersTasksTaskResponse) => void;
  isDropTarget?: boolean;
  /** Overdue pending instance for recurring tasks — enables "Skip this one" menu item */
  pendingInstance?: InstanceResponse;
}

export function TaskItem({
  task,
  depth = 0,
  onSelect,
  onEdit,
  isDropTarget,
  pendingInstance,
}: TaskItemProps) {
  const {
    selectedTaskId,
    selectTask,
    expandedSubtasks,
    toggleExpandedSubtask,
    setMobileTab,
    justUpdatedId,
  } = useUIStore();
  const isJustUpdated = justUpdatedId === task.id;
  const queryClient = useQueryClient();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();
  const restoreTask = useRestoreTaskApiV1TasksTaskIdRestorePost();
  const skipInstance = useSkipInstanceApiV1InstancesInstanceIdSkipPost();
  const isSelected = selectedTaskId === task.id;
  const isCompleted = task.status === "completed" || !!task.completed_at;
  const hasSubtasks = (task.subtasks?.length ?? 0) > 0;
  const isExpanded = expandedSubtasks.has(task.id);

  const [menuOpen, setMenuOpen] = useState(false);

  // Make task draggable
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(task.id),
    data: { type: "task", task },
  });

  const handleTitleClick = () => {
    if (hasSubtasks) {
      toggleExpandedSubtask(task.id);
      return;
    }
    selectTask(task.id);
    onSelect?.(task.id);
    onEdit?.(task);
  };

  const handleToggleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Optimistic update
    const previousTasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
    );

    queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
      (old) => {
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
      },
    );

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
            duration: 5000,
          });
        },
        onError: () => {
          // Rollback
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
    const previousTasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
    );
    queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
      (old) =>
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
  }, [task.id, isCompleted, queryClient, toggleComplete]);

  const handleMenuSchedule = useCallback(() => {
    selectTask(task.id);
    setMobileTab("calendar");
    setMenuOpen(false);
  }, [task.id, selectTask, setMobileTab]);

  const handleMenuUnschedule = useCallback(() => {
    const prevDate = task.scheduled_date;
    const prevTime = task.scheduled_time ?? null;

    const previousTasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
    );
    queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
      (old) =>
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
                queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
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
            duration: 5000,
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
          announce("Instance skipped");
          toast.success(`Skipped instance of "${task.title}"`, {
            id: `skip-inst-${pendingInstance.id}`,
          });
        },
        onError: () => {
          queryClient.setQueryData(getListInstancesApiV1InstancesGetQueryKey(), previousInstances);
          toast.error("Failed to skip instance", { id: `skip-inst-err-${pendingInstance.id}` });
        },
      },
    );
    setMenuOpen(false);
  }, [task, pendingInstance, skipInstance, queryClient]);

  const handleMenuDelete = useCallback(() => {
    deleteTask.mutate(
      { taskId: task.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
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
                        queryKey: getListTasksApiV1TasksGetQueryKey(),
                      }),
                  },
                );
              },
            },
            duration: 5000,
          });
        },
        onError: () => toast.error("Failed to delete task", { id: `delete-err-${task.id}` }),
      },
    );
    setMenuOpen(false);
  }, [task, deleteTask, restoreTask, queryClient]);

  const dueDate = task.due_date;
  const overdue = isOverdue(dueDate) && !isCompleted;
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
        {isCompleted ? "Reopen" : "Complete"}
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
      {task.scheduled_date && (
        <ContextMenuItem onClick={handleMenuUnschedule}>
          <CalendarOff className="h-3.5 w-3.5 mr-2" />
          Unschedule
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
    <div ref={setNodeRef} data-task-id={task.id}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <div
                className={cn(
                  "group relative flex items-center gap-[var(--col-gap)] py-1.5 transition-colors border-b border-border/40 cursor-grab active:cursor-grabbing",
                  isSelected && "bg-accent",
                  isCompleted && "opacity-60",
                  isDragging && "opacity-30",
                  isDropTarget && "ring-2 ring-primary bg-primary/10",
                  isJustUpdated && "ring-2 ring-primary/30 animate-pulse",
                )}
                style={{
                  paddingLeft: `${depth * 24 + 8}px`,
                  borderLeftWidth: 2,
                  borderLeftColor: isParent ? "var(--border)" : impactColor,
                  borderLeftStyle: "solid",
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
                  title={isCompleted ? "Mark as pending" : "Mark as complete"}
                >
                  <svg
                    viewBox="0 0 24 24"
                    role="img"
                    aria-label={isCompleted ? "Completed" : "Not completed"}
                    className={cn(
                      "h-[18px] w-[18px] transition-colors",
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
                    className="flex-shrink-0 p-0.5 rounded hover:bg-accent relative z-10"
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

                {/* Recurring indicator */}
                {task.is_recurring && (
                  <Repeat className="hidden sm:block h-3 w-3 text-muted-foreground flex-shrink-0" />
                )}

                {/* Due date */}
                {dueDate && (
                  <span
                    className={cn(
                      "hidden sm:flex items-center gap-0.5 text-[11px] flex-shrink-0",
                      overdue ? "text-destructive font-medium" : "text-muted-foreground",
                    )}
                  >
                    <Calendar className="h-3 w-3" />
                    {formatDate(dueDate)}
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
                        {task.clarity && task.clarity !== "normal" ? (
                          <span
                            className="inline-block text-[0.65rem] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{
                              color: CLARITY_COLORS[task.clarity] ?? CLARITY_COLORS.normal,
                              backgroundColor: CLARITY_TINTS[task.clarity] ?? CLARITY_TINTS.normal,
                            }}
                          >
                            {CLARITY_LABELS[task.clarity] ?? task.clarity}
                          </span>
                        ) : null}
                      </span>

                      {/* Duration */}
                      <span className="w-[var(--col-duration)] text-center text-[0.65rem] font-medium tabular-nums text-muted-foreground">
                        {task.duration_minutes ? (
                          formatDuration(task.duration_minutes)
                        ) : (
                          <span className="opacity-30">&mdash;</span>
                        )}
                      </span>

                      {/* Impact — text label */}
                      <span
                        className="w-[var(--col-impact)] text-center text-[0.65rem] font-semibold"
                        style={{ color: impactColor }}
                      >
                        {IMPACT_LABELS[task.impact] ?? "Min"}
                      </span>
                    </>
                  )}
                </span>

                {/* Kebab menu button */}
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="hidden sm:flex flex-shrink-0 p-0.5 rounded hover:bg-accent relative z-10 opacity-0 group-hover:opacity-100 transition-opacity w-[var(--col-actions)] justify-center"
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
                  {isCompleted ? "Reopen" : "Complete"}
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
                {task.scheduled_date && (
                  <DropdownMenuItem onClick={handleMenuUnschedule}>
                    <CalendarOff className="h-3.5 w-3.5 mr-2" />
                    Unschedule
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

      {/* Expanded subtasks */}
      <AnimatePresence initial={false}>
        {hasSubtasks && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <SubtaskTree
              subtasks={task.subtasks!}
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
  depth: number;
  onSelect?: (taskId: number) => void;
  onEdit?: (task: AppRoutersTasksTaskResponse) => void;
}

function SubtaskTree({ subtasks, depth, onSelect, onEdit }: SubtaskTreeProps) {
  return (
    <div>
      {subtasks.map((st) => (
        <SubtaskItem key={st.id} subtask={st} depth={depth} onSelect={onSelect} onEdit={onEdit} />
      ))}
    </div>
  );
}

interface SubtaskItemProps {
  subtask: SubtaskResponse;
  depth: number;
  onSelect?: (taskId: number) => void;
  onEdit?: (task: AppRoutersTasksTaskResponse) => void;
}

function SubtaskItem({ subtask, depth, onSelect, onEdit }: SubtaskItemProps) {
  const { selectedTaskId, selectTask } = useUIStore();
  const queryClient = useQueryClient();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const isSelected = selectedTaskId === subtask.id;
  const isCompleted = subtask.status === "completed";
  const impactColor = IMPACT_COLORS[subtask.impact] ?? IMPACT_COLORS[4];

  const handleClick = async () => {
    selectTask(subtask.id);
    onSelect?.(subtask.id);
    try {
      const fullTask = await getTaskApiV1TasksTaskIdGet(subtask.id);
      onEdit?.(fullTask as AppRoutersTasksTaskResponse);
    } catch {
      onEdit?.(subtask as unknown as AppRoutersTasksTaskResponse);
    }
  };

  const handleToggleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();

    const previousTasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
    );

    queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
      (old) =>
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
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-[var(--col-gap)] py-1 transition-colors border-b border-border/20",
        "hover:bg-accent/50",
        isSelected && "bg-accent",
        isCompleted && "opacity-60",
      )}
      style={{
        paddingLeft: `${depth * 24 + 8}px`,
        borderLeftWidth: 2,
        borderLeftColor: impactColor,
        borderLeftStyle: "solid",
      }}
    >
      <button
        type="button"
        className="flex-shrink-0 cursor-pointer group/cb"
        onClick={handleToggleComplete}
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
          {subtask.clarity && subtask.clarity !== "normal" ? (
            <span
              className="inline-block text-[0.65rem] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                color: CLARITY_COLORS[subtask.clarity] ?? CLARITY_COLORS.normal,
                backgroundColor: CLARITY_TINTS[subtask.clarity] ?? CLARITY_TINTS.normal,
              }}
            >
              {CLARITY_LABELS[subtask.clarity] ?? subtask.clarity}
            </span>
          ) : null}
        </span>

        {/* Duration */}
        <span className="w-[var(--col-duration)] text-center text-[0.65rem] font-medium tabular-nums text-muted-foreground">
          {subtask.duration_minutes ? (
            formatDuration(subtask.duration_minutes)
          ) : (
            <span className="opacity-30">&mdash;</span>
          )}
        </span>

        {/* Impact */}
        <span
          className="w-[var(--col-impact)] text-center text-[0.65rem] font-semibold"
          style={{ color: impactColor }}
        >
          {IMPACT_LABELS[subtask.impact] ?? "Min"}
        </span>
      </span>

      {/* Actions spacer to match parent row */}
      <span className="hidden sm:block w-[var(--col-actions)] flex-shrink-0" />
    </div>
  );
}
