import { useQueryClient } from "@tanstack/react-query";
import Fuse, { type IFuseOptions } from "fuse.js";
import {
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  CalendarX2,
  CheckCheck,
  FolderInput,
  Pencil,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DomainResponse } from "@/api/model";
import { Calendar } from "@/components/ui/calendar";
import {
  batchDelete,
  batchEdit,
  batchRescheduleAll,
  batchToggleCompleteAll,
  batchUnscheduleAll,
  findPendingInstancesForTasks,
} from "@/lib/batch-mutations";
import { cn } from "@/lib/utils";
import { resolveSelection, taskSelectionId, useSelectionStore } from "@/stores/selection-store";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PaletteBatchActionsProps {
  taskIds: Set<number>;
  domains: DomainResponse[];
  onDone: () => void;
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
/*  Sub-view types                                                     */
/* ------------------------------------------------------------------ */

type SubView = "actions" | "domain-picker" | "date-picker";

/* ------------------------------------------------------------------ */
/*  PaletteBatchActions                                                */
/* ------------------------------------------------------------------ */

export function PaletteBatchActions({ taskIds, domains, onDone }: PaletteBatchActionsProps) {
  const queryClient = useQueryClient();
  const [subView, setSubView] = useState<SubView>("actions");
  const [domainQuery, setDomainQuery] = useState("");
  const domainInputRef = useRef<HTMLInputElement>(null);

  // Focus domain input when picker opens
  useEffect(() => {
    if (subView === "domain-picker") {
      requestAnimationFrame(() => domainInputRef.current?.focus());
    }
  }, [subView]);

  /* ---- Resolve task IDs → TaskResponse[] from TQ cache ---- */
  const { tasks } = useMemo(() => {
    const stringIds = new Set(Array.from(taskIds, (id) => taskSelectionId(id)));
    return resolveSelection(queryClient, stringIds);
  }, [queryClient, taskIds]);

  const count = taskIds.size;

  /* ---- Domain fuzzy search ---- */
  const activeDomains = useMemo(() => domains.filter((d) => !d.is_archived), [domains]);
  const domainFuse = useMemo(() => new Fuse(activeDomains, domainFuseOptions), [activeDomains]);
  const filteredDomains = useMemo(() => {
    if (!domainQuery.trim()) return activeDomains;
    return domainFuse.search(domainQuery.trim(), { limit: 10 }).map((r) => r.item);
  }, [domainQuery, activeDomains, domainFuse]);

  /* ---- Split recurring / non-recurring for proper batch handling ---- */
  const nonRecurring = useMemo(() => tasks.filter((t) => !t.is_recurring), [tasks]);
  const recurring = useMemo(() => tasks.filter((t) => t.is_recurring), [tasks]);
  const pendingInstances = useMemo(
    () => findPendingInstancesForTasks(queryClient, recurring),
    [queryClient, recurring],
  );

  /* ---- Date helpers ---- */
  const todayStr = new Date().toISOString().split("T")[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  /* ---- Handlers (fire-and-forget: optimistic update + undo toast shown instantly) ---- */

  const handleComplete = useCallback(() => {
    const incomplete = nonRecurring.filter((t) => t.status !== "completed" && !t.completed_at);
    batchToggleCompleteAll(queryClient, incomplete, pendingInstances, true);
    onDone();
  }, [nonRecurring, pendingInstances, queryClient, onDone]);

  const handleDelete = useCallback(() => {
    const subtaskCount = tasks.reduce((sum, t) => sum + (t.subtasks?.length ?? 0), 0);
    if (subtaskCount > 0) {
      if (!window.confirm(`Delete ${tasks.length} tasks and ${subtaskCount} subtasks?`)) return;
    } else if (tasks.length > 3) {
      if (!window.confirm(`Delete ${tasks.length} tasks?`)) return;
    }
    batchDelete(queryClient, tasks);
    onDone();
  }, [tasks, queryClient, onDone]);

  const handleReschedule = useCallback(
    (dateStr: string) => {
      batchRescheduleAll(queryClient, nonRecurring, pendingInstances, dateStr);
      onDone();
    },
    [nonRecurring, pendingInstances, queryClient, onDone],
  );

  const handleUnschedule = useCallback(() => {
    const scheduledTasks = nonRecurring.filter((t) => t.scheduled_date != null);
    const scheduledInstances = pendingInstances.filter((i) => i.scheduled_datetime != null);
    batchUnscheduleAll(queryClient, scheduledTasks, scheduledInstances);
    onDone();
  }, [nonRecurring, pendingInstances, queryClient, onDone]);

  const handleMoveDomain = useCallback(
    (domainId: number) => {
      batchEdit(queryClient, tasks, { domain_id: domainId });
      onDone();
    },
    [tasks, queryClient, onDone],
  );

  const handleEdit = useCallback(() => {
    // Sync palette selection to global store so the FAB edit form resolves the right tasks
    useSelectionStore.getState().selectAll(Array.from(taskIds, (id) => taskSelectionId(id)));
    window.dispatchEvent(new Event("open-batch-edit"));
    onDone();
  }, [taskIds, onDone]);

  /* ---- Domain picker sub-view ---- */
  if (subView === "domain-picker") {
    return (
      <div className="border-t px-2 py-1.5">
        <div className="flex items-center gap-1 mb-1">
          <button
            type="button"
            onClick={() => setSubView("actions")}
            className="text-xs text-muted-foreground hover:text-foreground px-1"
          >
            ← Back
          </button>
          <input
            ref={domainInputRef}
            value={domainQuery}
            onChange={(e) => setDomainQuery(e.target.value)}
            placeholder="Search domains..."
            className="flex-1 h-7 bg-transparent outline-none text-xs placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-32 overflow-y-auto">
          {filteredDomains.map((d) => (
            <button
              type="button"
              key={d.id}
              className="w-full flex items-center gap-2 px-2 py-1 text-xs hover:bg-accent/50 rounded text-left"
              onClick={() => handleMoveDomain(d.id)}
            >
              {d.icon ? (
                <span className="text-xs">{d.icon}</span>
              ) : (
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: d.color ?? "#6D5EF6" }}
                />
              )}
              <span className="truncate">{d.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ---- Date picker sub-view ---- */
  if (subView === "date-picker") {
    return (
      <div className="border-t px-2 py-1.5">
        <div className="flex items-center gap-1 mb-1">
          <button
            type="button"
            onClick={() => setSubView("actions")}
            className="text-xs text-muted-foreground hover:text-foreground px-1"
          >
            ← Back
          </button>
          <span className="text-xs text-muted-foreground">Reschedule {count} tasks</span>
        </div>
        <Calendar
          mode="single"
          onSelect={(date) => {
            if (!date) return;
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, "0");
            const dd = String(date.getDate()).padStart(2, "0");
            handleReschedule(`${yyyy}-${mm}-${dd}`);
          }}
          defaultMonth={new Date()}
        />
      </div>
    );
  }

  /* ---- Main actions ---- */
  return (
    <div className="border-t px-2 py-1.5 flex items-center gap-1 text-xs flex-wrap">
      <span className="text-muted-foreground shrink-0 mr-1">{count} selected</span>
      <BatchButton icon={CheckCheck} label="Complete" onClick={handleComplete} />
      <BatchButton icon={CalendarCheck} label="Today" onClick={() => handleReschedule(todayStr)} />
      <BatchButton
        icon={CalendarPlus}
        label="Tomorrow"
        onClick={() => handleReschedule(tomorrowStr)}
      />
      <BatchButton
        icon={CalendarDays}
        label="Reschedule"
        onClick={() => setSubView("date-picker")}
      />
      <BatchButton icon={CalendarX2} label="Unschedule" onClick={handleUnschedule} />
      <BatchButton icon={Pencil} label="Edit" onClick={handleEdit} />
      <BatchButton
        icon={FolderInput}
        label="Move"
        onClick={() => {
          setSubView("domain-picker");
          setDomainQuery("");
        }}
      />
      <BatchButton icon={Trash2} label="Delete" onClick={handleDelete} destructive />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BatchButton                                                        */
/* ------------------------------------------------------------------ */

function BatchButton({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded transition-colors",
        "hover:bg-accent/50",
        destructive && "text-destructive hover:bg-destructive/10",
      )}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </button>
  );
}
