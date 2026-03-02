import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import Fuse, { type IFuseOptions } from "fuse.js";
import {
  ArrowLeft,
  Calendar,
  CalendarPlus,
  Check,
  FolderInput,
  Pencil,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { DomainResponse, TaskResponse } from "@/api/model";
import {
  useDeleteTaskApiV1TasksTaskIdDelete,
  useRestoreTaskApiV1TasksTaskIdRestorePost,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { dashboardTasksKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TaskAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  destructive?: boolean;
  handler: () => void;
}

interface PaletteTaskActionsProps {
  task: TaskResponse;
  domain: DomainResponse | null;
  domains: DomainResponse[];
  onBack: () => void;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Shortcut badge (matches search-palette.tsx style)                  */
/* ------------------------------------------------------------------ */

function ShortcutBadge({ shortcut }: { shortcut: string }) {
  return (
    <kbd className="ml-auto shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground">
      {shortcut}
    </kbd>
  );
}

/* ------------------------------------------------------------------ */
/*  Domain badge (matches search-palette.tsx style)                    */
/* ------------------------------------------------------------------ */

function DomainBadge({ domain }: { domain: DomainResponse }) {
  return (
    <span className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground">
      {domain.icon ? (
        <span className="text-xs">{domain.icon}</span>
      ) : (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: domain.color ?? "#6D5EF6" }}
        />
      )}
      <span className="truncate max-w-[100px]">{domain.name}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Domain fuzzy search options                                        */
/* ------------------------------------------------------------------ */

const domainFuseOptions: IFuseOptions<DomainResponse> = {
  keys: [{ name: "name", weight: 1 }],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 1,
};

/* ------------------------------------------------------------------ */
/*  PaletteTaskActions                                                 */
/* ------------------------------------------------------------------ */

export function PaletteTaskActions({
  task,
  domain,
  domains,
  onBack,
  onClose,
}: PaletteTaskActionsProps) {
  const [subView, setSubView] = useState<"actions" | "domains">("actions");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [domainQuery, setDomainQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const domainInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const selectTask = useUIStore((s) => s.selectTask);

  /* ---- Mutations ---- */
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();
  const restoreTask = useRestoreTaskApiV1TasksTaskIdRestorePost();

  const isCompleted = task.status === "completed" || !!task.completed_at;

  /* ---- Helpers ---- */
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
  }, [queryClient]);

  const closePalette = useCallback(() => {
    onClose();
  }, [onClose]);

  /* ---- Action handlers ---- */
  const handleToggleComplete = useCallback(() => {
    const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());
    queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) =>
      old?.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: isCompleted ? ("pending" as const) : ("completed" as const),
              completed_at: isCompleted ? null : new Date().toISOString(),
            }
          : t,
      ),
    );
    closePalette();
    toggleComplete.mutate(
      { taskId: task.id, data: null },
      {
        onSuccess: () => {
          invalidateAll();
          toast.success(isCompleted ? `Reopened "${task.title}"` : `Completed "${task.title}"`, {
            id: `complete-${task.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                toggleComplete.mutate(
                  { taskId: task.id, data: null },
                  { onSuccess: () => invalidateAll() },
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
  }, [task, isCompleted, queryClient, toggleComplete, closePalette, invalidateAll]);

  const handleScheduleToday = useCallback(() => {
    const today = new Date().toISOString().split("T")[0];
    const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());
    queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) =>
      old?.map((t) => (t.id === task.id ? { ...t, scheduled_date: today } : t)),
    );
    closePalette();
    updateTask.mutate(
      { taskId: task.id, data: { scheduled_date: today } },
      {
        onSuccess: () => {
          invalidateAll();
          toast.success(`Scheduled "${task.title}" for today`, {
            id: `schedule-${task.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                updateTask.mutate(
                  { taskId: task.id, data: { scheduled_date: task.scheduled_date ?? null } },
                  { onSuccess: () => invalidateAll() },
                );
              },
            },
          });
        },
        onError: () => {
          queryClient.setQueryData(dashboardTasksKey(), previousTasks);
          toast.error("Failed to schedule task", { id: `schedule-err-${task.id}` });
        },
      },
    );
  }, [task, queryClient, updateTask, closePalette, invalidateAll]);

  const handleScheduleTomorrow = useCallback(() => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());
    queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) =>
      old?.map((t) => (t.id === task.id ? { ...t, scheduled_date: tomorrow } : t)),
    );
    closePalette();
    updateTask.mutate(
      { taskId: task.id, data: { scheduled_date: tomorrow } },
      {
        onSuccess: () => {
          invalidateAll();
          toast.success(`Scheduled "${task.title}" for tomorrow`, {
            id: `schedule-${task.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                updateTask.mutate(
                  { taskId: task.id, data: { scheduled_date: task.scheduled_date ?? null } },
                  { onSuccess: () => invalidateAll() },
                );
              },
            },
          });
        },
        onError: () => {
          queryClient.setQueryData(dashboardTasksKey(), previousTasks);
          toast.error("Failed to schedule task", { id: `schedule-err-${task.id}` });
        },
      },
    );
  }, [task, queryClient, updateTask, closePalette, invalidateAll]);

  const handleMoveToDomain = useCallback(() => {
    setSubView("domains");
    setSelectedIndex(0);
    setDomainQuery("");
  }, []);

  const handleEdit = useCallback(() => {
    closePalette();
    selectTask(task.id);
    navigate({ to: "/dashboard" });
    setTimeout(() => {
      document
        .querySelector(`[data-task-id="${task.id}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 150);
  }, [task.id, closePalette, selectTask, navigate]);

  const handleDelete = useCallback(() => {
    closePalette();
    deleteTask.mutate(
      { taskId: task.id },
      {
        onSuccess: () => {
          invalidateAll();
          toast.success(`Deleted "${task.title}"`, {
            id: `delete-${task.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                restoreTask.mutate(
                  { taskId: task.id },
                  {
                    onSuccess: () => {
                      invalidateAll();
                      toast.success("Task restored", { id: `restore-${task.id}` });
                    },
                    onError: () =>
                      toast.error("Failed to restore task", { id: `restore-err-${task.id}` }),
                  },
                );
              },
            },
          });
        },
        onError: () => {
          toast.error("Failed to delete task", { id: `delete-err-${task.id}` });
        },
      },
    );
  }, [task, deleteTask, restoreTask, closePalette, invalidateAll]);

  /* ---- Domain picker: move task to domain ---- */
  const handleSelectDomain = useCallback(
    (targetDomain: DomainResponse | null) => {
      const newDomainId = targetDomain?.id ?? null;
      if (newDomainId === task.domain_id) {
        closePalette();
        return;
      }
      const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());
      queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) =>
        old?.map((t) => (t.id === task.id ? { ...t, domain_id: newDomainId } : t)),
      );
      closePalette();
      updateTask.mutate(
        { taskId: task.id, data: { domain_id: newDomainId } },
        {
          onSuccess: () => {
            invalidateAll();
            toast.success(`Moved "${task.title}" to ${targetDomain?.name ?? "no domain"}`, {
              id: `move-${task.id}`,
              action: {
                label: "Undo",
                onClick: () => {
                  updateTask.mutate(
                    { taskId: task.id, data: { domain_id: task.domain_id ?? null } },
                    { onSuccess: () => invalidateAll() },
                  );
                },
              },
            });
          },
          onError: () => {
            queryClient.setQueryData(dashboardTasksKey(), previousTasks);
            toast.error("Failed to move task", { id: `move-err-${task.id}` });
          },
        },
      );
    },
    [task, queryClient, updateTask, closePalette, invalidateAll],
  );

  /* ---- Build action list ---- */
  const actions: TaskAction[] = useMemo(
    () => [
      {
        id: "toggle-complete",
        label: isCompleted ? "Uncomplete" : "Complete",
        icon: isCompleted ? Undo2 : Check,
        shortcut: "C",
        handler: handleToggleComplete,
      },
      {
        id: "schedule-today",
        label: "Schedule for today",
        icon: Calendar,
        handler: handleScheduleToday,
      },
      {
        id: "schedule-tomorrow",
        label: "Schedule for tomorrow",
        icon: CalendarPlus,
        handler: handleScheduleTomorrow,
      },
      {
        id: "move-domain",
        label: "Move to domain...",
        icon: FolderInput,
        handler: handleMoveToDomain,
      },
      {
        id: "edit",
        label: "Edit",
        icon: Pencil,
        shortcut: "E",
        handler: handleEdit,
      },
      {
        id: "delete",
        label: "Delete",
        icon: Trash2,
        shortcut: "X",
        destructive: true,
        handler: handleDelete,
      },
    ],
    [
      isCompleted,
      handleToggleComplete,
      handleScheduleToday,
      handleScheduleTomorrow,
      handleMoveToDomain,
      handleEdit,
      handleDelete,
    ],
  );

  /* ---- Domain picker list ---- */
  const activeDomains = useMemo(() => domains.filter((d) => !d.is_archived), [domains]);

  const domainFuse = useMemo(() => new Fuse(activeDomains, domainFuseOptions), [activeDomains]);

  const filteredDomains = useMemo(() => {
    if (!domainQuery.trim()) return activeDomains;
    return domainFuse.search(domainQuery.trim(), { limit: 15 }).map((r) => r.item);
  }, [domainQuery, activeDomains, domainFuse]);

  /* ---- Reset selection when switching views ---- */
  // biome-ignore lint/correctness/useExhaustiveDependencies: subView change intentionally resets selection
  useEffect(() => {
    setSelectedIndex(0);
  }, [subView]);

  /* ---- Focus domain input when entering domain picker ---- */
  useEffect(() => {
    if (subView === "domains") {
      // Small delay to ensure the input is rendered
      requestAnimationFrame(() => domainInputRef.current?.focus());
    }
  }, [subView]);

  /* ---- Scroll selected item into view ---- */
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-action-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  /* ---- Keyboard handler (called from parent) ---- */
  const itemCount = subView === "actions" ? actions.length : filteredDomains.length;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, itemCount - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (subView === "actions" && actions[selectedIndex]) {
          actions[selectedIndex].handler();
        } else if (subView === "domains" && filteredDomains[selectedIndex]) {
          handleSelectDomain(filteredDomains[selectedIndex]);
        }
      } else if (e.key === "ArrowLeft" || (e.key === "Escape" && subView === "domains")) {
        e.preventDefault();
        e.stopPropagation();
        if (subView === "domains") {
          setSubView("actions");
        } else {
          onBack();
        }
      } else if (e.key === "Escape" && subView === "actions") {
        // Let Dialog handle close via its own Escape handler
        // by not preventing or stopping propagation
        onBack();
      }
    },
    [subView, actions, filteredDomains, selectedIndex, itemCount, onBack, handleSelectDomain],
  );

  /* ---- Auto-focus the action list for keyboard capture ---- */
  const actionsContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (subView === "actions") {
      requestAnimationFrame(() => actionsContainerRef.current?.focus());
    }
  }, [subView]);

  /* ---- Render: actions view ---- */
  if (subView === "actions") {
    return (
      <div
        ref={actionsContainerRef}
        role="menu"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="outline-none"
      >
        {/* Breadcrumb header */}
        <button
          type="button"
          onClick={onBack}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 transition-colors border-b cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="truncate font-medium text-foreground">{task.title}</span>
          {domain && <DomainBadge domain={domain} />}
        </button>

        {/* Action list */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {actions.map((action, idx) => {
            const Icon = action.icon;
            return (
              <button
                type="button"
                key={action.id}
                data-action-index={idx}
                className={cn(
                  "w-full px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2 text-left",
                  "hover:bg-accent/50",
                  idx === selectedIndex && "bg-accent",
                  action.destructive && "text-destructive",
                )}
                onClick={() => action.handler()}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 min-w-0 truncate">{action.label}</span>
                {action.shortcut && <ShortcutBadge shortcut={action.shortcut} />}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground flex items-center gap-3">
          <span>
            <kbd className="font-mono">&uarr;&darr;</kbd> navigate
          </span>
          <span>
            <kbd className="font-mono">&crarr;</kbd> run
          </span>
          <span>
            <kbd className="font-mono">&larr;</kbd> back
          </span>
          <span>
            <kbd className="font-mono">esc</kbd> close
          </span>
        </div>
      </div>
    );
  }

  /* ---- Render: domain picker view ---- */
  return (
    <div>
      {/* Breadcrumb header */}
      <button
        type="button"
        onClick={() => setSubView("actions")}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 transition-colors border-b cursor-pointer"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span className="truncate font-medium text-foreground">Move to domain</span>
      </button>

      {/* Domain search input */}
      <div className="flex items-center gap-2 px-3 border-b">
        <FolderInput className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={domainInputRef}
          value={domainQuery}
          onChange={(e) => {
            setDomainQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search domains..."
          className="flex-1 h-9 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
        />
      </div>

      {/* Domain list */}
      <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
        {filteredDomains.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No domains found</div>
        ) : (
          filteredDomains.map((d, idx) => (
            <button
              type="button"
              key={d.id}
              data-action-index={idx}
              className={cn(
                "w-full px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2 text-left",
                "hover:bg-accent/50",
                idx === selectedIndex && "bg-accent",
                d.id === task.domain_id && "text-muted-foreground",
              )}
              onClick={() => handleSelectDomain(d)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              {d.icon ? (
                <span className="text-sm">{d.icon}</span>
              ) : (
                <span
                  className="inline-block h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: d.color ?? "#6D5EF6" }}
                />
              )}
              <span className="flex-1 min-w-0 truncate">{d.name}</span>
              {d.id === task.domain_id && (
                <span className="text-xs text-muted-foreground">current</span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground flex items-center gap-3">
        <span>
          <kbd className="font-mono">&uarr;&darr;</kbd> navigate
        </span>
        <span>
          <kbd className="font-mono">&crarr;</kbd> move
        </span>
        <span>
          <kbd className="font-mono">&larr;</kbd> back
        </span>
        <span>
          <kbd className="font-mono">esc</kbd> close
        </span>
      </div>
    </div>
  );
}
