import { CalendarDays, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { IMPACT_COLORS, IMPACT_LABELS } from "@/lib/task-utils";
import { cn } from "@/lib/utils";

const IMPACT_VALUES = [1, 2, 3, 4] as const;

/* ------------------------------------------------------------------ */
/*  DomainChipRow                                                      */
/* ------------------------------------------------------------------ */

interface DomainChipRowProps {
  domains: DomainResponse[];
  selectedId: number | null;
  onSelect: (id: number, name: string) => void;
}

export function DomainChipRow({ domains, selectedId, onSelect }: DomainChipRowProps) {
  if (domains.length === 0) return null;

  return (
    <div className="flex gap-1.5 w-max">
      {domains.map((d) => {
        const isActive = selectedId === d.id;
        const color = d.color ?? "#6B7385";
        return (
          <button
            key={d.id}
            type="button"
            className="rounded-lg shrink-0 px-2.5 py-1.5 text-[13px] font-medium transition-all active:scale-95"
            style={
              isActive
                ? {
                    backgroundColor: `${color}20`,
                    color,
                    boxShadow: `inset 0 0 0 1.5px ${color}50`,
                  }
                : { backgroundColor: `${color}10`, color: `${color}90` }
            }
            onClick={() => onSelect(d.id, d.name ?? "")}
          >
            {d.icon && <span>{d.icon}</span>} {d.name}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ImpactButtonRow                                                    */
/* ------------------------------------------------------------------ */

interface ImpactButtonRowProps {
  value: number | null;
  onChange: (impact: number) => void;
}

export function ImpactButtonRow({ value, onChange }: ImpactButtonRowProps) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {IMPACT_VALUES.map((v) => {
        const isActive = value === v || (value === null && v === 4);
        const color = IMPACT_COLORS[v];
        return (
          <button
            key={v}
            type="button"
            className="rounded-lg py-1.5 text-[13px] font-medium transition-all active:scale-95"
            style={
              isActive
                ? { backgroundColor: color, color: "#fff", boxShadow: `0 0 0 2px ${color}40` }
                : { backgroundColor: `${color}12`, color }
            }
            onClick={() => onChange(v)}
          >
            {IMPACT_LABELS[v]}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ScheduleButtonRow                                                  */
/* ------------------------------------------------------------------ */

interface ScheduleButtonRowProps {
  selectedDate: string | null;
  onSelectDate: (isoDate: string) => void;
  onClear: () => void;
  onCalendarOpen: () => void;
}

export function ScheduleButtonRow({
  selectedDate,
  onSelectDate,
  onClear,
  onCalendarOpen,
}: ScheduleButtonRowProps) {
  const todayStr = new Date().toISOString().split("T")[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const isCustomDate = selectedDate && selectedDate !== todayStr && selectedDate !== tomorrowStr;

  return (
    <div className="flex gap-1.5 items-center">
      <button
        type="button"
        className={cn(
          "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors active:scale-95",
          selectedDate === todayStr
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground active:bg-secondary/80",
        )}
        onClick={() => onSelectDate(todayStr)}
      >
        Today
      </button>
      <button
        type="button"
        className={cn(
          "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors active:scale-95",
          selectedDate === tomorrowStr
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground active:bg-secondary/80",
        )}
        onClick={() => onSelectDate(tomorrowStr)}
      >
        Tomorrow
      </button>
      <button
        type="button"
        className={cn(
          "rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors active:scale-95",
          isCustomDate
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground active:bg-secondary/80",
        )}
        onClick={onCalendarOpen}
      >
        <CalendarDays className="h-3.5 w-3.5 inline-block -mt-px" />
        {isCustomDate && <span className="ml-1">{formatShortDate(selectedDate)}</span>}
      </button>
      {selectedDate && (
        <button
          type="button"
          className="rounded-lg px-2 py-1.5 text-[13px] text-muted-foreground active:text-foreground"
          onClick={onClear}
        >
          Clear
        </button>
      )}
    </div>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------ */
/*  ParentTaskSelect — controlled dropdown for parent task assignment  */
/* ------------------------------------------------------------------ */

interface ParentTaskSelectProps {
  parentTasks: TaskResponse[];
  domains: DomainResponse[];
  selectedId: number | null;
  /** Domain of the task being triaged — used for smart grouping. */
  currentDomainId: number | null;
  onSelect: (id: number | null) => void;
}

export function ParentTaskSelect({
  parentTasks,
  domains,
  selectedId,
  currentDomainId,
  onSelect,
}: ParentTaskSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const selectedParent = useMemo(
    () => parentTasks.find((t) => t.id === selectedId) ?? null,
    [parentTasks, selectedId],
  );

  const selectedDomain = useMemo(
    () =>
      selectedParent?.domain_id ? domains.find((d) => d.id === selectedParent.domain_id) : null,
    [selectedParent, domains],
  );

  // Smart ordering: parents with subtasks first, then same-domain, then rest
  const taskGroups = useMemo(() => {
    const q = search.toLowerCase().trim();
    const eligible = parentTasks
      .filter((t) => t.domain_id != null)
      .filter((t) => !q || t.title.toLowerCase().includes(q));

    const parentsSameDomain: TaskResponse[] = [];
    const parentsOther: TaskResponse[] = [];
    const sameDomain: TaskResponse[] = [];
    const rest: TaskResponse[] = [];

    const isSameDomain = (t: TaskResponse) =>
      currentDomainId != null && t.domain_id === currentDomainId;

    for (const t of eligible) {
      const isParent = (t.subtasks?.length ?? 0) > 0;
      if (isParent && isSameDomain(t)) parentsSameDomain.push(t);
      else if (isParent) parentsOther.push(t);
      else if (isSameDomain(t)) sameDomain.push(t);
      else rest.push(t);
    }

    const groups: { label: string; tasks: TaskResponse[] }[] = [];
    if (parentsSameDomain.length > 0)
      groups.push({ label: "Parents · same domain", tasks: parentsSameDomain });
    if (parentsOther.length > 0) groups.push({ label: "Parents", tasks: parentsOther });
    if (sameDomain.length > 0) groups.push({ label: "Same domain", tasks: sameDomain });
    if (rest.length > 0) groups.push({ label: "Other", tasks: rest });
    return groups;
  }, [parentTasks, currentDomainId, search]);

  const totalFiltered = taskGroups.reduce((n, g) => n + g.tasks.length, 0);
  const showLabels = !search && taskGroups.length > 1;

  const handleSelect = (id: number | null) => {
    onSelect(id === selectedId ? null : id);
    setOpen(false);
    setSearch("");
  };

  // Position dropdown above the trigger (fixed, portaled to escape overflow)
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      bottom: window.innerHeight - rect.top + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
  }, [open]);

  // Close on click outside (check both trigger and portaled dropdown)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  // Auto-focus search when opening
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  return (
    <div ref={containerRef}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "flex items-center justify-between w-full rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors active:scale-95",
          selectedParent
            ? "bg-primary/10 text-primary"
            : "bg-secondary text-secondary-foreground active:bg-secondary/80",
        )}
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-1.5 truncate min-w-0">
          {selectedParent ? (
            <>
              {selectedDomain?.icon && <span className="shrink-0">{selectedDomain.icon}</span>}
              <span className="truncate">{selectedParent.title}</span>
            </>
          ) : (
            <span>None</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 opacity-50 shrink-0 ml-1.5 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Dropdown — portaled to escape overflow:auto clipping */}
      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="rounded-md border bg-popover text-popover-foreground shadow-md"
            style={dropdownStyle}
          >
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 border-b">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks..."
                className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
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

            {/* Options */}
            <div className="max-h-48 overflow-y-auto py-1">
              <button
                type="button"
                className={cn(
                  "w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors cursor-pointer",
                  selectedId === null && "bg-accent font-medium",
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
                          selectedId === t.id && "bg-accent font-medium",
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
          </div>,
          document.body,
        )}
    </div>
  );
}
