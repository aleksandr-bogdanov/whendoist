import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Inbox } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse, DomainResponse } from "@/api/model";
import { useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost } from "@/api/queries/tasks/tasks";
import { TaskActionSheet } from "@/components/mobile/task-action-sheet";
import { TaskSwipeRow } from "@/components/task/task-swipe-row";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const { expandedDomains, toggleExpandedDomain, setMobileTab } = useUIStore();
  const { prefersTouch, hasTouch } = useDevice();
  const queryClient = useQueryClient();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const { trigger: haptic } = useHaptics();
  const isTouchDevice = prefersTouch || hasTouch;

  // Action sheet state
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [actionSheetTask, setActionSheetTask] = useState<AppRoutersTasksTaskResponse | null>(null);

  // Default to expanded if not in the set (first load)
  const domainKey = domain?.id ?? 0;
  const isExpanded = expandedDomains.size === 0 || expandedDomains.has(domainKey);

  const handleToggle = () => {
    toggleExpandedDomain(domainKey);
  };

  const handleSwipeComplete = useCallback(
    (task: AppRoutersTasksTaskResponse) => {
      const isCompleted = task.status === "completed" || !!task.completed_at;
      const previousTasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>([
        "/api/v1/tasks",
      ]);

      queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(["/api/v1/tasks"], (old) => {
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
      });

      toggleComplete.mutate(
        { taskId: task.id, data: null },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/v1/tasks"] });
            if (!isCompleted) {
              toast.success("Task completed", {
                action: {
                  label: "Undo",
                  onClick: () => {
                    toggleComplete.mutate(
                      { taskId: task.id, data: null },
                      {
                        onSuccess: () =>
                          queryClient.invalidateQueries({ queryKey: ["/api/v1/tasks"] }),
                      },
                    );
                  },
                },
                duration: 5000,
              });
            }
          },
          onError: () => {
            queryClient.setQueryData(["/api/v1/tasks"], previousTasks);
            toast.error("Failed to update task");
          },
        },
      );
    },
    [queryClient, toggleComplete],
  );

  const handleSwipeSchedule = useCallback(() => {
    haptic("light");
    setMobileTab("calendar");
  }, [haptic, setMobileTab]);

  const handleLongPress = useCallback((task: AppRoutersTasksTaskResponse) => {
    setActionSheetTask(task);
    setActionSheetOpen(true);
  }, []);

  const handleScheduleFromSheet = useCallback(
    (_task: AppRoutersTasksTaskResponse) => {
      setMobileTab("calendar");
    },
    [setMobileTab],
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
                        onSwipeLeft={handleSwipeSchedule}
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
