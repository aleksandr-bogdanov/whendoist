import { useDroppable } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useCallback, useState } from "react";
import { toast } from "sonner";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost } from "@/api/queries/tasks/tasks";
import { TaskActionSheet } from "@/components/mobile/task-action-sheet";
import { TaskSwipeRow } from "@/components/task/task-swipe-row";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useDevice } from "@/hooks/use-device";
import { useHaptics } from "@/hooks/use-haptics";
import { useSmartInput } from "@/hooks/use-smart-input";
import { useTaskCreate } from "@/hooks/use-task-create";
import { dashboardTasksKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { SmartInputAutocomplete } from "./smart-input-autocomplete";
import { useDndState } from "./task-dnd-context";
import { TaskItem } from "./task-item";
import { MetadataPill } from "./task-quick-add";

function TaskInsertionZone({ id, isActive }: { id: string; isActive: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "task-gap" },
    disabled: !isActive,
  });

  if (!isActive) return null;

  return (
    <div
      ref={setNodeRef}
      className="relative -my-3 z-10 transition-all duration-150"
      style={{ height: isOver ? 32 : 28 }}
    >
      {isOver && (
        <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-[#6D5EF6] shadow-[0_0_4px_rgba(109,94,246,0.5)]" />
          <div className="flex-1 h-0.5 rounded-full bg-[#6D5EF6]" />
        </div>
      )}
    </div>
  );
}

interface DomainGroupProps {
  domain: DomainResponse | null;
  tasks: TaskResponse[];
  allDomains: DomainResponse[];
  onSelectTask?: (taskId: number) => void;
  onEditTask?: (task: TaskResponse) => void;
  /** Ordered selection IDs for Shift+Click range selection */
  orderedIds?: string[];
}

export function DomainGroup({
  domain,
  tasks,
  allDomains,
  onSelectTask,
  onEditTask,
  orderedIds,
}: DomainGroupProps) {
  const { collapsedDomains, toggleCollapsedDomain, setMobileTab, selectTask, requestSubtaskAdd } =
    useUIStore();
  const { prefersTouch, hasTouch } = useDevice();
  const dndState = useDndState();
  const isSubtaskDrag = dndState.activeId != null && dndState.activeTask?.parent_id != null;
  const queryClient = useQueryClient();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const { trigger: haptic } = useHaptics();
  const isTouchDevice = prefersTouch || hasTouch;

  // Inline add-task state
  const [addingTask, setAddingTask] = useState(false);
  const {
    inputRef: addInputRef,
    rawInput,
    parsed,
    acVisible,
    acSuggestions,
    acSelectedIndex,
    handleInputChange,
    handleAcSelect,
    handleDismissToken,
    handleKeyDown: handleAcKeyDown,
    reset: resetSmartInput,
  } = useSmartInput({ domains: allDomains });
  const { create: createTask, isPending: createPending } = useTaskCreate();

  // biome-ignore lint/correctness/useExhaustiveDependencies: inputRef is a stable ref
  const handleInlineAdd = useCallback(async () => {
    if (!parsed.title.trim()) return;

    // Clear input immediately for fast UX
    resetSmartInput();
    requestAnimationFrame(() => addInputRef.current?.focus());

    await createTask(
      {
        title: parsed.title.trim(),
        description: parsed.description,
        domain_id: parsed.domainId ?? domain?.id ?? null,
        impact: parsed.impact ?? undefined,
        clarity: parsed.clarity ?? undefined,
        duration_minutes: parsed.durationMinutes,
        scheduled_date: parsed.scheduledDate,
        scheduled_time: parsed.scheduledTime,
      },
      {
        onSuccess: (created) => {
          // Append real task to cache — stable key, no flicker
          queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) =>
            old ? [...old, created] : [created],
          );
        },
      },
    );
  }, [parsed, domain, createTask, queryClient, resetSmartInput]);

  // Action sheet state
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [actionSheetTask, setActionSheetTask] = useState<TaskResponse | null>(null);

  const domainKey = domain?.id ?? 0;
  const isExpanded = !collapsedDomains.has(domainKey);

  const handleToggle = () => {
    toggleCollapsedDomain(domainKey);
  };

  const handleSwipeComplete = useCallback(
    (task: TaskResponse) => {
      const isCompleted = task.status === "completed" || !!task.completed_at;
      const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());

      queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) => {
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
      });

      toggleComplete.mutate(
        { taskId: task.id, data: null },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
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
                          queryKey: dashboardTasksKey(),
                        }),
                    },
                  );
                },
              },
            });
          },
          onError: () => {
            queryClient.setQueryData(dashboardTasksKey(), previousTasks);
            toast.error("Failed to update task", { id: `complete-err-${task.id}` });
          },
        },
      );
    },
    [queryClient, toggleComplete],
  );

  const handleSwipeSchedule = useCallback(
    (task: TaskResponse) => {
      haptic("light");
      selectTask(task.id);
      setMobileTab("calendar");
    },
    [haptic, selectTask, setMobileTab],
  );

  const handleLongPress = useCallback((task: TaskResponse) => {
    setActionSheetTask(task);
    setActionSheetOpen(true);
  }, []);

  const handleScheduleFromSheet = useCallback(
    (task: TaskResponse) => {
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
            {tasks.map((task, i) => (
              <Fragment key={task.id}>
                {i === 0 && (
                  <TaskInsertionZone
                    id={`task-gap-${domain?.id ?? "thoughts"}-0`}
                    isActive={isSubtaskDrag}
                  />
                )}
                <motion.div
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
                          orderedIds={orderedIds}
                        />
                      </TaskSwipeRow>
                    </div>
                  ) : (
                    <TaskItem
                      task={task}
                      onSelect={onSelectTask}
                      onEdit={onEditTask}
                      orderedIds={orderedIds}
                    />
                  )}
                </motion.div>
                <TaskInsertionZone
                  id={`task-gap-${domain?.id ?? "thoughts"}-${i + 1}`}
                  isActive={isSubtaskDrag}
                />
              </Fragment>
            ))}
          </AnimatePresence>

          {/* Inline add task */}
          {addingTask ? (
            <div className="px-3 py-1.5 space-y-1">
              <div className="relative">
                <input
                  ref={(el) => {
                    (addInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
                    el?.focus();
                  }}
                  type="text"
                  value={rawInput}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (handleAcKeyDown(e)) return;
                    if (e.key === "Enter" && parsed.title.trim()) {
                      e.preventDefault();
                      handleInlineAdd();
                    }
                    if (e.key === "Escape") {
                      setAddingTask(false);
                      resetSmartInput();
                    }
                  }}
                  onBlur={() => {
                    if (!rawInput.trim()) {
                      setAddingTask(false);
                      resetSmartInput();
                    }
                  }}
                  placeholder="Task title... (#domain !high 30m)"
                  className="w-full h-7 text-sm bg-transparent border-b border-border outline-none focus:border-primary px-1"
                  disabled={createPending}
                />
                <SmartInputAutocomplete
                  suggestions={acSuggestions}
                  visible={acVisible}
                  selectedIndex={acSelectedIndex}
                  onSelect={handleAcSelect}
                />
              </div>
              {parsed.tokens.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {parsed.tokens.map((token) => (
                    <MetadataPill
                      key={token.type}
                      token={token}
                      onDismiss={() => handleDismissToken(token)}
                    />
                  ))}
                </div>
              )}
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
        onAddSubtask={(t) => requestSubtaskAdd(t.id)}
      />
    </>
  );
}
