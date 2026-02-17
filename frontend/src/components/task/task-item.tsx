import { Calendar, ChevronDown, ChevronRight, Clock, Repeat } from "lucide-react";
import type { AppRoutersTasksTaskResponse, SubtaskResponse } from "@/api/model";
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
}

export function TaskItem({ task, depth = 0, onSelect }: TaskItemProps) {
  const { selectedTaskId, selectTask, expandedSubtasks, toggleExpandedSubtask } = useUIStore();
  const isSelected = selectedTaskId === task.id;
  const isCompleted = task.status === "completed" || !!task.completed_at;
  const hasSubtasks = (task.subtasks?.length ?? 0) > 0;
  const isExpanded = expandedSubtasks.has(task.id);

  const handleClick = () => {
    selectTask(task.id);
    onSelect?.(task.id);
  };

  const dueDate = task.due_date;
  const overdue = isOverdue(dueDate) && !isCompleted;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
          isSelected && "bg-accent ring-1 ring-ring/20",
          isCompleted && "opacity-60",
        )}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        {/* Checkbox + title area as a button */}
        <button
          type="button"
          className="flex flex-1 items-center gap-2 min-w-0 text-left cursor-pointer hover:opacity-80"
          onClick={handleClick}
        >
          {/* Checkbox indicator */}
          <div
            className={cn(
              "flex-shrink-0 h-4 w-4 rounded-full border-2 transition-colors",
              isCompleted
                ? "bg-primary border-primary"
                : "border-muted-foreground/40 hover:border-primary",
            )}
          />
          {/* Title */}
          <span
            className={cn(
              "flex-1 text-sm truncate",
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
            className="flex-shrink-0 p-0.5 rounded hover:bg-accent"
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
      {hasSubtasks && isExpanded && (
        <SubtaskTree subtasks={task.subtasks!} depth={depth + 1} onSelect={onSelect} />
      )}
    </div>
  );
}

interface SubtaskTreeProps {
  subtasks: SubtaskResponse[];
  depth: number;
  onSelect?: (taskId: number) => void;
}

function SubtaskTree({ subtasks, depth, onSelect }: SubtaskTreeProps) {
  return (
    <div>
      {subtasks.map((st) => (
        <SubtaskItem key={st.id} subtask={st} depth={depth} onSelect={onSelect} />
      ))}
    </div>
  );
}

interface SubtaskItemProps {
  subtask: SubtaskResponse;
  depth: number;
  onSelect?: (taskId: number) => void;
}

function SubtaskItem({ subtask, depth, onSelect }: SubtaskItemProps) {
  const { selectedTaskId, selectTask } = useUIStore();
  const isSelected = selectedTaskId === subtask.id;
  const isCompleted = subtask.status === "completed";

  const handleClick = () => {
    selectTask(subtask.id);
    onSelect?.(subtask.id);
  };

  return (
    <button
      type="button"
      className={cn(
        "group flex w-full items-center gap-2 rounded-md px-2 py-1 cursor-pointer transition-colors text-left",
        "hover:bg-accent/50",
        isSelected && "bg-accent ring-1 ring-ring/20",
        isCompleted && "opacity-60",
      )}
      style={{ paddingLeft: `${depth * 24 + 8}px` }}
      onClick={handleClick}
    >
      <div
        className={cn(
          "flex-shrink-0 h-3.5 w-3.5 rounded-full border-2 transition-colors",
          isCompleted
            ? "bg-primary border-primary"
            : "border-muted-foreground/30 hover:border-primary",
        )}
      />
      <span
        className={cn(
          "flex-1 text-sm truncate",
          isCompleted && "line-through text-muted-foreground",
        )}
      >
        {subtask.title}
      </span>

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
    </button>
  );
}
