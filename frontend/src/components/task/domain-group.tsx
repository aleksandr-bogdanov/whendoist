import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Inbox, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse, DomainResponse, TaskCreate } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  useCreateTaskApiV1TasksPost,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
} from "@/api/queries/tasks/tasks";
import { TaskActionSheet } from "@/components/mobile/task-action-sheet";
import { TaskSwipeRow } from "@/components/task/task-swipe-row";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCrypto } from "@/hooks/use-crypto";
import { useDevice } from "@/hooks/use-device";
import { useHaptics } from "@/hooks/use-haptics";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { TaskItem } from "./task-item";

interface DomainGroupProps {
  domain: DomainResponse | null;
  tasks: AppRoutersTasksTaskResponse[];
  onSelectTask?: (taskId: number) => void;
  onEditTask?: (task: AppRoutersTasksTaskResponse) => void;
  dragOverTaskId?: string | null;
}

export function DomainGroup({
  domain,
  tasks,
  onSelectTask,
  onEditTask,
  dragOverTaskId,
}: DomainGroupProps) {
  const { collapsedDomains, toggleCollapsedDomain, setMobileTab, selectTask } = useUIStore();
  const { prefersTouch, hasTouch } = useDevice();
  const queryClient = useQueryClient();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const { trigger: haptic } = useHaptics();
  const isTouchDevice = prefersTouch || hasTouch;

  // Inline add-task state
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const createTask = useCreateTaskApiV1TasksPost();
  const { encryptTaskFields } = useCrypto();

  const handleInlineAdd = useCallback(async () => {
    if (!newTaskTitle.trim()) return;
    const encrypted = await encryptTaskFields({ title: newTaskTitle.trim() });
    const data: TaskCreate = {
      title: encrypted.title!,
      domain_id: domain?.id ?? null,
      impact: 4,
      clarity: "normal",
    };
    createTask.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
          toast.success("Task created");
          setNewTaskTitle("");
          addInputRef.current?.focus();
        },
        onError: () => toast.error("Failed to create task"),
      },
    );
  }, [newTaskTitle, domain, createTask, queryClient, encryptTaskFields]);

  // Action sheet state
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [actionSheetTask, setActionSheetTask] = useState<AppRoutersTasksTaskResponse | null>(null);

  const domainKey = domain?.id ?? 0;
  const isExpanded = !collapsedDomains.has(domainKey);

  const handleToggle = () => {
    toggleCollapsedDomain(domainKey);
  };

  const handleSwipeComplete = useCallback(
    (task: AppRoutersTasksTaskResponse) => {
      const isCompleted = task.status === "completed" || !!task.completed_at;
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
            toast.error("Failed to update task");
          },
        },
      );
    },
    [queryClient, toggleComplete],
  );

  const handleSwipeSchedule = useCallback(
    (task: AppRoutersTasksTaskResponse) => {
      haptic("light");
      selectTask(task.id);
      setMobileTab("calendar");
    },
    [haptic, selectTask, setMobileTab],
  );

  const handleLongPress = useCallback((task: AppRoutersTasksTaskResponse) => {
    setActionSheetTask(task);
    setActionSheetOpen(true);
  }, []);

  const handleScheduleFromSheet = useCallback(
    (task: AppRoutersTasksTaskResponse) => {
      selectTask(task.id);
      setMobileTab("calendar");
    },
    [selectTask, setMobileTab],
  );

  return (
    <>
      <Collapsible
        open={isExpanded}
        onOpenChange={handleToggle}
        data-domain-group
        data-domain-icon={domain?.icon ?? ""}
        data-domain-name={domain?.name ?? "Inbox"}
        data-domain-count={String(tasks.length)}
        data-domain-color={domain?.color ?? ""}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            data-domain-trigger
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-sm font-medium",
              "rounded-md hover:bg-accent/50 transition-colors",
            )}
          >
            {/* Domain icon/color indicator */}
            {domain ? (
              <>
                {domain.icon ? (
                  <span className="text-base">{domain.icon}</span>
                ) : (
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: domain.color ?? "#6D5EF6" }}
                  />
                )}
                <span className="flex-1 text-left truncate">{domain.name}</span>
              </>
            ) : (
              <>
                <Inbox className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-left truncate">Inbox</span>
              </>
            )}

            {/* Task count */}
            <span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>

            {/* Chevron */}
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                !isExpanded && "-rotate-90",
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {/* Left border accent */}
          <div
            className="ml-3 border-l-2 pl-0"
            style={{ borderColor: domain?.color ?? "var(--border)" }}
          >
            <AnimatePresence initial={false}>
              {tasks.map((task) => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, x: 40, height: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  {isTouchDevice ? (
                    <div data-task-swipe-row>
                      <TaskSwipeRow
                        onSwipeRight={() => handleSwipeComplete(task)}
                        onSwipeLeft={() => handleSwipeSchedule(task)}
                        onLongPress={() => handleLongPress(task)}
                      >
                        <TaskItem
                          task={task}
                          onSelect={onSelectTask}
                          onEdit={onEditTask}
                          isDropTarget={dragOverTaskId === String(task.id)}
                        />
                      </TaskSwipeRow>
                    </div>
                  ) : (
                    <TaskItem
                      task={task}
                      onSelect={onSelectTask}
                      onEdit={onEditTask}
                      isDropTarget={dragOverTaskId === String(task.id)}
                    />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Inline add task */}
            {addingTask ? (
              <div className="flex items-center gap-1.5 px-2 py-1">
                <input
                  ref={(el) => {
                    (addInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
                    el?.focus();
                  }}
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTaskTitle.trim()) {
                      e.preventDefault();
                      handleInlineAdd();
                    }
                    if (e.key === "Escape") {
                      setAddingTask(false);
                      setNewTaskTitle("");
                    }
                  }}
                  onBlur={() => {
                    if (!newTaskTitle.trim()) {
                      setAddingTask(false);
                      setNewTaskTitle("");
                    }
                  }}
                  placeholder="Task title..."
                  className="flex-1 h-7 text-sm bg-transparent border-b border-border outline-none focus:border-primary px-1"
                  disabled={createTask.isPending}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingTask(true)}
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <Plus className="h-3 w-3" />
                Add task
              </button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Action sheet for long-press */}
      <TaskActionSheet
        open={actionSheetOpen}
        onOpenChange={setActionSheetOpen}
        task={actionSheetTask}
        onEdit={onEditTask}
        onSchedule={handleScheduleFromSheet}
      />
    </>
  );
}
