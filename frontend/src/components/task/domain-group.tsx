import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse, DomainResponse, TaskCreate } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  useCreateTaskApiV1TasksPost,
  useDeleteTaskApiV1TasksTaskIdDelete,
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
}

export function DomainGroup({ domain, tasks, onSelectTask, onEditTask }: DomainGroupProps) {
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
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();
  const { encryptTaskFields } = useCrypto();

  const handleInlineAdd = useCallback(async () => {
    const trimmed = newTaskTitle.trim();
    if (!trimmed) return;
    const encrypted = await encryptTaskFields({ title: trimmed });
    const data: TaskCreate = {
      title: encrypted.title!,
      domain_id: domain?.id ?? null,
      impact: 4,
      clarity: "normal",
    };

    // Clear input immediately for fast UX
    setNewTaskTitle("");
    addInputRef.current?.focus();

    createTask.mutate(
      { data },
      {
        onSuccess: (created) => {
          // Append real task to cache — stable key, no flicker
          queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
            getListTasksApiV1TasksGetQueryKey(),
            (old) => (old ? [...old, created] : [created]),
          );
          toast.success(`Created "${trimmed}"`, {
            id: `create-${created.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                deleteTask.mutate(
                  { taskId: created.id },
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
            duration: 5000,
          });
        },
        onError: () => toast.error("Failed to create task"),
      },
    );
  }, [newTaskTitle, domain, createTask, deleteTask, queryClient, encryptTaskFields]);

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
              duration: 5000,
            });
          },
          onError: () => {
            queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
            toast.error("Failed to update task", { id: `complete-err-${task.id}` });
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
        data-domain-name={domain?.name ?? "Thoughts"}
        data-domain-count={String(tasks.length)}
        data-domain-color={domain?.color ?? ""}
        className="rounded-[12px] border border-l-2 border-l-[#6D5EF6]/20 bg-card overflow-hidden shadow-[var(--shadow-card)]"
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            data-domain-trigger
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-sm font-bold",
              "bg-muted/50 hover:bg-muted/70 transition-colors",
            )}
          >
            {/* Disclosure chevron */}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform flex-shrink-0",
                !isExpanded && "-rotate-90",
              )}
            />

            {/* Domain icon/name */}
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
                <span className="text-left truncate text-[0.95rem]">{domain.name}</span>
              </>
            ) : (
              <span className="text-left truncate text-[0.95rem] text-muted-foreground">
                Thoughts
              </span>
            )}

            {/* Task count pill — next to name, not pushed to edge */}
            <span className="text-[11px] text-muted-foreground tabular-nums bg-background/60 px-1.5 py-0.5 rounded-full mr-auto">
              {tasks.length}
            </span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
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
                      <TaskItem task={task} onSelect={onSelectTask} onEdit={onEditTask} />
                    </TaskSwipeRow>
                  </div>
                ) : (
                  <TaskItem task={task} onSelect={onSelectTask} onEdit={onEditTask} />
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Inline add task */}
          {addingTask ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5">
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <Plus className="h-3 w-3" />
              Add task
            </button>
          )}
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
