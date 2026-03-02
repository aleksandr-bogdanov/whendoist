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
import { toast } from "sonner";
import type { DomainResponse } from "@/api/model";
import { Calendar } from "@/components/ui/calendar";
import { dashboardTasksKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

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
  const [isPending, setIsPending] = useState(false);
  const domainInputRef = useRef<HTMLInputElement>(null);

  // Focus domain input when picker opens
  useEffect(() => {
    if (subView === "domain-picker") {
      requestAnimationFrame(() => domainInputRef.current?.focus());
    }
  }, [subView]);

  const count = taskIds.size;

  const activeDomains = useMemo(() => domains.filter((d) => !d.is_archived), [domains]);
  const domainFuse = useMemo(() => new Fuse(activeDomains, domainFuseOptions), [activeDomains]);
  const filteredDomains = useMemo(() => {
    if (!domainQuery.trim()) return activeDomains;
    return domainFuse.search(domainQuery.trim(), { limit: 10 }).map((r) => r.item);
  }, [domainQuery, activeDomains, domainFuse]);

  const runBatchAction = useCallback(
    async (action: string, extra?: Record<string, unknown>) => {
      if (isPending) return;
      setIsPending(true);
      try {
        const res = await fetch("/api/v1/tasks/batch-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task_ids: [...taskIds],
            action,
            ...extra,
          }),
        });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
        toast.success(`${data.affected_count} task${data.affected_count === 1 ? "" : "s"} updated`);
        onDone();
      } catch {
        toast.error("Batch action failed");
      } finally {
        setIsPending(false);
      }
    },
    [taskIds, isPending, queryClient, onDone],
  );

  const todayStr = new Date().toISOString().split("T")[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split("T")[0];

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
              onClick={() => runBatchAction("move", { domain_id: d.id })}
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
            runBatchAction("schedule", { scheduled_date: `${yyyy}-${mm}-${dd}` });
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
      <BatchButton
        icon={CheckCheck}
        label="Complete"
        onClick={() => runBatchAction("complete")}
        disabled={isPending}
      />
      <BatchButton
        icon={CalendarCheck}
        label="Today"
        onClick={() => runBatchAction("schedule", { scheduled_date: todayStr })}
        disabled={isPending}
      />
      <BatchButton
        icon={CalendarPlus}
        label="Tomorrow"
        onClick={() => runBatchAction("schedule", { scheduled_date: tomorrowStr })}
        disabled={isPending}
      />
      <BatchButton
        icon={CalendarDays}
        label="Reschedule"
        onClick={() => setSubView("date-picker")}
        disabled={isPending}
      />
      <BatchButton
        icon={CalendarX2}
        label="Unschedule"
        onClick={() => runBatchAction("unschedule")}
        disabled={isPending}
      />
      <BatchButton
        icon={Pencil}
        label="Edit"
        onClick={() => {
          window.dispatchEvent(new Event("open-batch-edit"));
          onDone();
        }}
        disabled={isPending}
      />
      <BatchButton
        icon={FolderInput}
        label="Move"
        onClick={() => {
          setSubView("domain-picker");
          setDomainQuery("");
        }}
        disabled={isPending}
      />
      <BatchButton
        icon={Trash2}
        label="Delete"
        onClick={() => runBatchAction("delete")}
        disabled={isPending}
        destructive
      />
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
  disabled,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded transition-colors",
        "hover:bg-accent/50 disabled:opacity-50",
        destructive && "text-destructive hover:bg-destructive/10",
      )}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </button>
  );
}
