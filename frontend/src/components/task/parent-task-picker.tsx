/**
 * ParentTaskPicker — parent task picker with immediate API mutations.
 *
 * Used in edit mode where selecting a parent immediately reparents the task
 * with optimistic cache updates and undo support.
 * Thin wrapper around ParentTaskDropdown for the UI.
 */

import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { DomainResponse, SubtaskResponse, TaskResponse } from "@/api/model";
import { useUpdateTaskApiV1TasksTaskIdPut } from "@/api/queries/tasks/tasks";
import { announce } from "@/components/live-announcer";
import { ParentTaskDropdown } from "@/components/task/parent-task-dropdown";
import { dashboardTasksKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

interface ParentTaskPickerProps {
  task: TaskResponse;
  parentTasks: TaskResponse[];
  domains: DomainResponse[];
  /** Called after a parent change is applied — provides the new parent's domain_id for auto-sync. */
  onParentChanged?: (parentDomainId: number | null) => void;
}

export function ParentTaskPicker({
  task,
  parentTasks,
  domains,
  onParentChanged,
}: ParentTaskPickerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();

  const [open, setOpen] = useState(false);
  // Track locally so UI updates immediately without waiting for prop refresh
  const [currentParentId, setCurrentParentId] = useState<number | null>(task.parent_id);

  // Sync if the task prop changes (e.g. after query invalidation)
  useEffect(() => {
    setCurrentParentId(task.parent_id);
  }, [task.parent_id]);

  const currentParent = useMemo(
    () => parentTasks.find((t) => t.id === currentParentId) ?? null,
    [parentTasks, currentParentId],
  );

  const currentParentDomain = useMemo(
    () => (currentParent?.domain_id ? domains.find((d) => d.id === currentParent.domain_id) : null),
    [currentParent, domains],
  );

  const handleSelect = (newParentId: number | null) => {
    if (newParentId === currentParentId) {
      setOpen(false);
      return;
    }

    const prevParentId = currentParentId;
    const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());

    // Update local state immediately
    setCurrentParentId(newParentId);
    setOpen(false);

    // Notify parent for domain auto-sync
    if (newParentId !== null) {
      const parent = parentTasks.find((t) => t.id === newParentId);
      onParentChanged?.(parent?.domain_id ?? null);
    } else {
      onParentChanged?.(null);
    }

    // Optimistic cache update
    if (newParentId !== null) {
      // Assigning to a parent
      const newSubtask: SubtaskResponse = {
        id: task.id,
        title: task.title,
        description: task.description ?? null,
        duration_minutes: task.duration_minutes ?? null,
        impact: task.impact,
        clarity: task.clarity ?? null,
        scheduled_date: task.scheduled_date ?? null,
        scheduled_time: task.scheduled_time ?? null,
        status: task.status ?? "pending",
        position: 9999,
      };

      queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) => {
        if (!old) return old;
        return old
          .filter((t) => t.id !== task.id) // Remove from top-level
          .map((t) => {
            // Remove from old parent's subtasks (if reparenting)
            if (prevParentId && t.id === prevParentId) {
              return {
                ...t,
                subtasks: t.subtasks?.filter((st) => st.id !== task.id),
              };
            }
            // Add to new parent's subtasks
            if (t.id === newParentId) {
              return {
                ...t,
                subtasks: [...(t.subtasks ?? []), newSubtask],
              };
            }
            return t;
          });
      });

      useUIStore.getState().expandSubtask(newParentId);
    } else {
      // Promoting to top-level
      const promoted: TaskResponse = {
        ...task,
        parent_id: null,
        subtasks: [],
      };

      queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) => {
        if (!old) return old;
        return [
          ...old.map((t) =>
            t.id === prevParentId
              ? {
                  ...t,
                  subtasks: t.subtasks?.filter((st) => st.id !== task.id),
                }
              : t,
          ),
          promoted,
        ];
      });
    }

    const parentTitle =
      newParentId !== null ? parentTasks.find((t) => t.id === newParentId)?.title : null;

    updateTask.mutate(
      { taskId: task.id, data: { parent_id: newParentId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: dashboardTasksKey(),
          });

          if (newParentId !== null) {
            announce(t("announce.taskNestedAsSubtask"));
            toast.success(t("toast.madeSubtaskOf", { title: task.title, parent: parentTitle }), {
              id: `reparent-${task.id}`,
              action: {
                label: t("toast.undo"),
                onClick: () => {
                  setCurrentParentId(prevParentId);
                  queryClient.setQueryData(dashboardTasksKey(), previousTasks);
                  updateTask.mutate(
                    {
                      taskId: task.id,
                      data: { parent_id: prevParentId },
                    },
                    {
                      onSuccess: () =>
                        queryClient.invalidateQueries({
                          queryKey: dashboardTasksKey(),
                        }),
                      onError: () => {
                        queryClient.invalidateQueries({
                          queryKey: dashboardTasksKey(),
                        });
                        toast.error(t("toast.undoFailed"));
                      },
                    },
                  );
                },
              },
            });
          } else {
            announce(t("announce.taskPromotedToTopLevel"));
            toast.success(t("toast.promotedToTopLevel", { title: task.title }), {
              id: `reparent-${task.id}`,
              action: {
                label: t("toast.undo"),
                onClick: () => {
                  setCurrentParentId(prevParentId);
                  queryClient.setQueryData(dashboardTasksKey(), previousTasks);
                  updateTask.mutate(
                    {
                      taskId: task.id,
                      data: { parent_id: prevParentId },
                    },
                    {
                      onSuccess: () =>
                        queryClient.invalidateQueries({
                          queryKey: dashboardTasksKey(),
                        }),
                      onError: () => {
                        queryClient.invalidateQueries({
                          queryKey: dashboardTasksKey(),
                        });
                        toast.error(t("toast.undoFailed"));
                      },
                    },
                  );
                },
              },
            });
          }
        },
        onError: () => {
          setCurrentParentId(prevParentId);
          queryClient.setQueryData(dashboardTasksKey(), previousTasks);
          toast.error(t("toast.failedToChangeParent"), {
            id: `reparent-err-${task.id}`,
          });
        },
      },
    );
  };

  // Close on click outside
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        className={cn(
          "flex items-center justify-between w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm",
          "hover:bg-accent/50 transition-colors cursor-pointer",
        )}
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-1.5 truncate min-w-0">
          {currentParent ? (
            <>
              {currentParentDomain?.icon && (
                <span className="shrink-0">{currentParentDomain.icon}</span>
              )}
              <span className="truncate">{currentParent.title}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{t("task.field.noneTopLevel")}</span>
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-2" />
      </button>

      {/* Dropdown — inline, no portal */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          <ParentTaskDropdown
            parentTasks={parentTasks}
            domains={domains}
            currentDomainId={task.domain_id}
            selectedId={currentParentId}
            excludeTaskId={task.id}
            onSelect={handleSelect}
            showSearch
          />
        </div>
      )}
    </div>
  );
}
