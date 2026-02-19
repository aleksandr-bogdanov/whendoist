import { useDraggable } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  EllipsisVertical,
  Pencil,
  Repeat,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse, SubtaskResponse } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  getTaskApiV1TasksTaskIdGet,
  useDeleteTaskApiV1TasksTaskIdDelete,
  useRestoreTaskApiV1TasksTaskIdRestorePost,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
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
}

export function TaskItem({ task, depth = 0, onSelect, onEdit, isDropTarget }: TaskItemProps) {
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
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();
  const restoreTask = useRestoreTaskApiV1TasksTaskIdRestorePost();
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
          toast.success(isCompleted ? "Task reopened" : "Task completed", {
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

  // Aggregated subtask durations for parent containers
  const subtaskDurations = useMemo(() => {
    if (!isParent || !task.subtasks) return null;
    let pending = 0;
    let total = 0;
    for (const st of task.subtasks) {
      const d = st.duration_minutes ?? 0;
      total += d;
      if (st.status !== "completed") pending += d;
    }
    return { pending, total };
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
      {!task.scheduled_date && (
        <ContextMenuItem onClick={handleMenuSchedule}>
          <CalendarPlus className="h-3.5 w-3.5 mr-2" />
          Schedule
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
                  "group relative flex items-center gap-[var(--col-gap)] py-1.5 transition-colors border-b border-border/40",
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
              >
                {/* Drag handle */}
                <div
                  className="absolute inset-0 cursor-grab active:cursor-grabbing"
                  {...attributes}
                  {...listeners}
                />

                {/* Checkbox — brand circle */}
                <button
                  type="button"
                  className="flex-shrink-0 cursor-pointer relative z-10 [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-[-8px] [@media(pointer:coarse)]:before:content-['']"
                  onClick={handleToggleComplete}
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
                          className="text-muted-foreground/40 group-hover/cb:text-[#6D5EF6]"
                        />
                        <polyline
                          points="8 12 10.5 14.5 16 9"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-muted-foreground/15 group-hover/cb:text-[#6D5EF6]/40"
                        />
                      </>
                    )}
                  </svg>
                </button>

                {/* Title */}
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
                      {/* Empty clarity slot */}
                      <span className="w-[var(--col-clarity)]" />
                      {/* Aggregated subtask duration: remaining / total */}
                      <span className="w-[var(--col-duration)] text-center text-[0.65rem] tabular-nums text-muted-foreground/60">
                        {subtaskDurations && subtaskDurations.total > 0 ? (
                          <span className="flex items-center justify-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            {formatDuration(subtaskDurations.pending)}
                            <span className="opacity-50">
                              /{formatDuration(subtaskDurations.total)}
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
                          <span className="flex items-center justify-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            {formatDuration(task.duration_minutes)}
                          </span>
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
                {!task.scheduled_date && (
                  <DropdownMenuItem onClick={handleMenuSchedule}>
                    <CalendarPlus className="h-3.5 w-3.5 mr-2" />
                    Schedule
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
        "group flex items-center gap-2 py-1 transition-colors border-b border-border/20",
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
                className="text-muted-foreground/30 group-hover/cb:text-[#6D5EF6]"
              />
              <polyline
                points="8 12 10.5 14.5 16 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground/15 group-hover/cb:text-[#6D5EF6]/40"
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

      <span className="hidden sm:flex items-center gap-[var(--col-gap)] flex-shrink-0">
        {subtask.duration_minutes && (
          <span className="text-[0.65rem] text-muted-foreground flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {formatDuration(subtask.duration_minutes)}
          </span>
        )}
        <span className="text-[0.65rem] font-semibold" style={{ color: impactColor }}>
          {IMPACT_LABELS[subtask.impact] ?? "Min"}
        </span>
      </span>
    </div>
  );
}
