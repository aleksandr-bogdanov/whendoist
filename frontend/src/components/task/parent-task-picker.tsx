import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse, DomainResponse, SubtaskResponse } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { announce } from "@/components/live-announcer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

interface ParentTaskPickerProps {
  task: AppRoutersTasksTaskResponse;
  parentTasks: AppRoutersTasksTaskResponse[];
  domains: DomainResponse[];
}

export function ParentTaskPicker({ task, parentTasks, domains }: ParentTaskPickerProps) {
  const queryClient = useQueryClient();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();
  const searchRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
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

  // Smart ordering: parents first, then same-domain, then rest
  const taskGroups = useMemo(() => {
    const q = search.toLowerCase().trim();
    const eligible = parentTasks
      .filter((t) => t.id !== task.id)
      .filter((t) => !q || t.title.toLowerCase().includes(q));

    const parents: AppRoutersTasksTaskResponse[] = [];
    const sameDomain: AppRoutersTasksTaskResponse[] = [];
    const rest: AppRoutersTasksTaskResponse[] = [];

    for (const t of eligible) {
      if ((t.subtasks?.length ?? 0) > 0) {
        parents.push(t);
      } else if (task.domain_id && t.domain_id === task.domain_id) {
        sameDomain.push(t);
      } else {
        rest.push(t);
      }
    }

    const groups: { label: string; tasks: AppRoutersTasksTaskResponse[] }[] = [];
    if (parents.length > 0) groups.push({ label: "Parents", tasks: parents });
    if (sameDomain.length > 0) groups.push({ label: "Same domain", tasks: sameDomain });
    if (rest.length > 0) groups.push({ label: "Other", tasks: rest });
    return groups;
  }, [parentTasks, task.id, task.domain_id, search]);

  const totalFiltered = taskGroups.reduce((n, g) => n + g.tasks.length, 0);
  const showLabels = !search && taskGroups.length > 1;

  const handleSelect = (newParentId: number | null) => {
    if (newParentId === currentParentId) {
      setOpen(false);
      setSearch("");
      return;
    }

    const prevParentId = currentParentId;
    const previousTasks = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
      getListTasksApiV1TasksGetQueryKey(),
    );

    // Update local state immediately
    setCurrentParentId(newParentId);
    setOpen(false);
    setSearch("");

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
        status: task.status ?? "pending",
        position: 9999,
      };

      queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
        getListTasksApiV1TasksGetQueryKey(),
        (old) => {
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
        },
      );

      useUIStore.getState().expandSubtask(newParentId);
    } else {
      // Promoting to top-level
      const promoted: AppRoutersTasksTaskResponse = {
        ...task,
        parent_id: null,
        subtasks: [],
      };

      queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
        getListTasksApiV1TasksGetQueryKey(),
        (old) => {
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
        },
      );
    }

    const parentTitle =
      newParentId !== null ? parentTasks.find((t) => t.id === newParentId)?.title : null;

    updateTask.mutate(
      { taskId: task.id, data: { parent_id: newParentId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListTasksApiV1TasksGetQueryKey(),
          });

          if (newParentId !== null) {
            announce("Task nested as subtask");
            toast.success(`Made "${task.title}" a subtask of "${parentTitle}"`, {
              id: `reparent-${task.id}`,
              action: {
                label: "Undo",
                onClick: () => {
                  setCurrentParentId(prevParentId);
                  queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
                  updateTask.mutate(
                    {
                      taskId: task.id,
                      data: { parent_id: prevParentId },
                    },
                    {
                      onSuccess: () =>
                        queryClient.invalidateQueries({
                          queryKey: getListTasksApiV1TasksGetQueryKey(),
                        }),
                      onError: () => {
                        queryClient.invalidateQueries({
                          queryKey: getListTasksApiV1TasksGetQueryKey(),
                        });
                        toast.error("Undo failed");
                      },
                    },
                  );
                },
              },
            });
          } else {
            announce("Task promoted to top-level");
            toast.success(`Promoted "${task.title}" to top-level`, {
              id: `reparent-${task.id}`,
              action: {
                label: "Undo",
                onClick: () => {
                  setCurrentParentId(prevParentId);
                  queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
                  updateTask.mutate(
                    {
                      taskId: task.id,
                      data: { parent_id: prevParentId },
                    },
                    {
                      onSuccess: () =>
                        queryClient.invalidateQueries({
                          queryKey: getListTasksApiV1TasksGetQueryKey(),
                        }),
                      onError: () => {
                        queryClient.invalidateQueries({
                          queryKey: getListTasksApiV1TasksGetQueryKey(),
                        });
                        toast.error("Undo failed");
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
          queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previousTasks);
          toast.error("Failed to change parent task", {
            id: `reparent-err-${task.id}`,
          });
        },
      },
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center justify-between w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm",
            "hover:bg-accent/50 transition-colors cursor-pointer",
          )}
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
              <span className="text-muted-foreground">None (top-level)</span>
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          searchRef.current?.focus();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Options list */}
        <div className="max-h-60 overflow-y-auto py-1">
          {/* None (top-level) — always first */}
          <button
            type="button"
            className={cn(
              "w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors cursor-pointer",
              currentParentId === null && "bg-accent font-medium",
            )}
            onClick={() => handleSelect(null)}
          >
            None (top-level)
          </button>

          {totalFiltered > 0 && <div className="h-px bg-border mx-2 my-1" />}

          {taskGroups.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && <div className="h-px bg-border mx-2 my-1" />}
              {showLabels && (
                <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </div>
              )}
              {group.tasks.map((t) => {
                const domain = t.domain_id ? domains.find((d) => d.id === t.domain_id) : null;
                const subtaskCount = t.subtasks?.length ?? 0;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors cursor-pointer flex items-center gap-1.5",
                      currentParentId === t.id && "bg-accent font-medium",
                    )}
                    onClick={() => handleSelect(t.id)}
                  >
                    {domain?.icon && <span className="shrink-0">{domain.icon}</span>}
                    <span className="truncate">{t.title}</span>
                    {subtaskCount > 0 && (
                      <span className="shrink-0 text-[10px] text-muted-foreground ml-auto">
                        ·{subtaskCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {totalFiltered === 0 && search && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No matching tasks</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
