import { useDraggable } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, Check, ChevronDown, ChevronRight, Clock, Repeat } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse, SubtaskResponse } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
} from "@/api/queries/tasks/tasks";
import { Badge } from "@/components/ui/badge";
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
  const { selectedTaskId, selectTask, expandedSubtasks, toggleExpandedSubtask } = useUIStore();
  const queryClient = useQueryClient();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const isSelected = selectedTaskId === task.id;
  const isCompleted = task.status === "completed" || !!task.completed_at;
  const hasSubtasks = (task.subtasks?.length ?? 0) > 0;
  const isExpanded = expandedSubtasks.has(task.id);

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
          if (!isCompleted) {
            toast.success("Task completed", {
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
          }
        },
        onError: () => {
          // Rollback
          queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
          toast.error("Failed to update task");
        },
      },
    );
  };

  const dueDate = task.due_date;
  const overdue = isOverdue(dueDate) && !isCompleted;

  return (
    <div ref={setNodeRef} data-task-id={task.id}>
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
      </div>

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

  const handleClick = () => {
    selectTask(subtask.id);
    onSelect?.(subtask.id);
    onEdit?.(subtask as unknown as AppRoutersTasksTaskResponse);
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
