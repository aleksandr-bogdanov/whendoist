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
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse, SubtaskResponse } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  getTaskApiV1TasksTaskIdGet,
  useDeleteTaskApiV1TasksTaskIdDelete,
  useRestoreTaskApiV1TasksTaskIdRestorePost,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
} from "@/api/queries/tasks/tasks";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CLARITY_LABELS,
  formatDate,
  formatDuration,
  IMPACT_COLORS,
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
  const { selectedTaskId, selectTask, expandedSubtasks, toggleExpandedSubtask, setMobileTab } =
    useUIStore();
  const queryClient = useQueryClient();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();
  const restoreTask = useRestoreTaskApiV1TasksTaskIdRestorePost();
  const isSelected = selectedTaskId === task.id;
  const isCompleted = task.status === "completed" || !!task.completed_at;
  const hasSubtasks = (task.subtasks?.length ?? 0) > 0;
  const isExpanded = expandedSubtasks.has(task.id);

  const [menuOpen, setMenuOpen] = useState(false);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null);

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
              // Cascade: mark subtasks completed/pending too
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
          toast.success(isCompleted ? "Task reopened" : "Task completed", {
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
          toast.error("Failed to update task");
        },
      },
    );
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextPos({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  }, []);

  const handleMenuEdit = useCallback(() => {
    onEdit?.(task);
    setMenuOpen(false);
  }, [task, onEdit]);

  const handleMenuComplete = useCallback(() => {
    // Inline the toggle complete logic to avoid dependency on handleToggleComplete
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
          toast.error("Failed to update task");
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
          toast.success(`Deleted "${task.title}"`, {
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
        onError: () => toast.error("Failed to delete task"),
      },
    );
    setMenuOpen(false);
  }, [task, deleteTask, restoreTask, queryClient]);

  const dueDate = task.due_date;
  const overdue = isOverdue(dueDate) && !isCompleted;

  const menuContent = (
    <DropdownMenuContent
      align="start"
      className="min-w-[140px]"
      {...(contextPos
        ? { style: { position: "fixed", left: contextPos.x, top: contextPos.y } }
        : {})}
    >
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
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: context menu on task row for right-click actions
    <div ref={setNodeRef} data-task-id={task.id} onContextMenu={handleContextMenu}>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(v) => {
          setMenuOpen(v);
          if (!v) setContextPos(null);
        }}
      >
        <div
          className={cn(
            "group relative flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
            isSelected && "bg-accent ring-1 ring-ring/20",
            isCompleted && "opacity-60",
            isDragging && "opacity-30",
            isDropTarget && "ring-2 ring-primary bg-primary/10",
          )}
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
        >
          {/* Drag handle — the whole row is draggable via this invisible overlay */}
          <div
            className="absolute inset-0 cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          />

          {/* Checkbox */}
          <button
            type="button"
            className="flex-shrink-0 cursor-pointer relative z-10"
            onClick={handleToggleComplete}
            title={isCompleted ? "Mark as pending" : "Mark as complete"}
          >
            <div
              className={cn(
                "flex items-center justify-center h-4 w-4 rounded-full border-2 transition-colors",
                isCompleted
                  ? "bg-primary border-primary"
                  : "border-muted-foreground/40 hover:border-primary hover:bg-primary/10",
              )}
            >
              {isCompleted && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
            </div>
          </button>

          {/* Title as clickable for editing */}
          <button
            type="button"
            data-task-title-btn
            className="flex-1 min-w-0 text-left cursor-pointer hover:opacity-80 relative z-10"
            onClick={handleTitleClick}
          >
            <span
              className={cn(
                "text-sm truncate block",
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

          {/* Metadata chips */}
          <span className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
            {task.is_recurring && <Repeat className="h-3 w-3 text-muted-foreground" />}

            {dueDate && (
              <span
                className={cn(
                  "text-[11px] flex items-center gap-0.5",
                  overdue ? "text-destructive font-medium" : "text-muted-foreground",
                )}
              >
                <Calendar className="h-3 w-3" />
                {formatDate(dueDate)}
              </span>
            )}

            {task.duration_minutes && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {formatDuration(task.duration_minutes)}
              </span>
            )}

            {task.clarity && task.clarity !== "normal" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {CLARITY_LABELS[task.clarity] ?? task.clarity}
              </Badge>
            )}

            <Badge
              className="text-[10px] px-1.5 py-0 text-white"
              style={{
                backgroundColor: IMPACT_COLORS[task.impact] ?? IMPACT_COLORS[4],
              }}
            >
              P{task.impact}
            </Badge>
          </span>

          {/* Kebab menu button (visible on hover, desktop only) */}
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hidden sm:flex flex-shrink-0 p-0.5 rounded hover:bg-accent relative z-10 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Task actions"
              onClick={(e) => {
                e.stopPropagation();
                setContextPos(null);
              }}
            >
              <EllipsisVertical className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
        </div>
        {menuOpen && menuContent}
      </DropdownMenu>

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

    // Optimistic update — find subtask within its parent's subtasks array
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
          toast.error("Failed to update task");
        },
      },
    );
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1 transition-colors",
        "hover:bg-accent/50",
        isSelected && "bg-accent ring-1 ring-ring/20",
        isCompleted && "opacity-60",
      )}
      style={{ paddingLeft: `${depth * 24 + 8}px` }}
    >
      <button
        type="button"
        className="flex-shrink-0 cursor-pointer"
        onClick={handleToggleComplete}
        title={isCompleted ? "Mark as pending" : "Mark as complete"}
      >
        <div
          className={cn(
            "flex items-center justify-center h-3.5 w-3.5 rounded-full border-2 transition-colors",
            isCompleted
              ? "bg-primary border-primary"
              : "border-muted-foreground/30 hover:border-primary hover:bg-primary/10",
          )}
        >
          {isCompleted && <Check className="h-2 w-2 text-primary-foreground" />}
        </div>
      </button>

      <button
        type="button"
        className="flex-1 min-w-0 text-left cursor-pointer"
        onClick={handleClick}
      >
        <span
          className={cn(
            "text-sm truncate block",
            isCompleted && "line-through text-muted-foreground",
          )}
        >
          {subtask.title}
        </span>
      </button>

      <span className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
        {subtask.duration_minutes && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {formatDuration(subtask.duration_minutes)}
          </span>
        )}
        <Badge
          className="text-[10px] px-1.5 py-0 text-white"
          style={{
            backgroundColor: IMPACT_COLORS[subtask.impact] ?? IMPACT_COLORS[4],
          }}
        >
          P{subtask.impact}
        </Badge>
      </span>
    </div>
  );
}
