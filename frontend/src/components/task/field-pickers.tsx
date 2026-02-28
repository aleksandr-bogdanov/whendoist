import { CalendarDays, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DomainResponse, TaskResponse } from "@/api/model";
import {
  CLARITY_COLORS,
  CLARITY_OPTIONS,
  DURATION_PRESETS,
  formatDurationLabel,
  IMPACT_COLORS,
  IMPACT_LABELS,
} from "@/lib/task-utils";
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
    <div className="flex gap-1.5 w-max md:w-auto md:flex-wrap md:gap-1">
      {domains.map((d) => {
        const isActive = selectedId === d.id;
        return (
          <button
            key={d.id}
            type="button"
            className={cn(
              "rounded-lg shrink-0 px-2.5 py-2 text-[13px] font-medium transition-all active:scale-95",
              "md:rounded-md md:px-2 md:py-1 md:active:scale-100",
              isActive
                ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/30"
                : "bg-secondary text-secondary-foreground active:bg-secondary/80",
            )}
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
    <div className="grid grid-cols-4 gap-1.5 md:gap-1">
      {IMPACT_VALUES.map((v) => {
        const isActive = value === v || (value === null && v === 4);
        const color = IMPACT_COLORS[v];
        return (
          <button
            key={v}
            type="button"
            className="rounded-lg py-2 text-[13px] font-medium transition-all active:scale-95 md:rounded-md md:py-1 md:active:scale-100 md:hover:brightness-110"
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
    <div className="flex gap-1.5 items-center md:gap-1">
      <button
        type="button"
        className={cn(
          "rounded-lg px-3 py-2 text-[13px] font-medium transition-colors active:scale-95",
          "md:rounded-md md:px-2.5 md:py-1 md:active:scale-100",
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
          "rounded-lg px-3 py-2 text-[13px] font-medium transition-colors active:scale-95",
          "md:rounded-md md:px-2.5 md:py-1 md:active:scale-100",
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
          "rounded-lg px-2 py-2 text-[13px] font-medium transition-colors active:scale-95",
          "md:rounded-md md:py-1 md:active:scale-100 md:hover:bg-secondary/80",
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
          className="rounded-lg px-2 py-2 text-[13px] text-muted-foreground active:text-foreground md:py-1 md:hover:text-foreground"
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
/*  ClarityChipRow                                                     */
/* ------------------------------------------------------------------ */

interface ClarityChipRowProps {
  value: string | null;
  onChange: (clarity: string) => void;
}

export function ClarityChipRow({ value, onChange }: ClarityChipRowProps) {
  return (
    <div className="flex gap-1.5 md:gap-1">
      {CLARITY_OPTIONS.map((opt) => {
        const isActive = value === opt.value;
        const isDefaultHint = value === null && opt.value === "normal";
        const color = CLARITY_COLORS[opt.value];
        return (
          <button
            key={opt.value}
            type="button"
            className="rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all md:rounded-md md:px-2 md:py-1 md:hover:brightness-110"
            style={
              isActive
                ? {
                    backgroundColor: color,
                    color: "#fff",
                    boxShadow: `0 0 0 2px ${color}40`,
                  }
                : isDefaultHint
                  ? {
                      backgroundColor: `${color}12`,
                      color,
                      border: `1.5px dashed ${color}60`,
                    }
                  : { backgroundColor: `${color}12`, color }
            }
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DurationPickerRow                                                  */
/* ------------------------------------------------------------------ */

interface DurationPickerRowProps {
  value: number | null;
  onChange: (minutes: number | null) => void;
  /** Show custom number input after presets. Default: false. */
  showCustom?: boolean;
}

export function DurationPickerRow({ value, onChange, showCustom }: DurationPickerRowProps) {
  const [customInput, setCustomInput] = useState(
    value && !DURATION_PRESETS.includes(value as (typeof DURATION_PRESETS)[number])
      ? String(value)
      : "",
  );

  const handlePreset = (m: number) => {
    onChange(value === m ? null : m);
    setCustomInput("");
  };

  const handleCustom = (val: string) => {
    setCustomInput(val);
    const n = Number(val);
    onChange(n > 0 && n <= 1440 ? n : null);
  };

  return (
    <div className="flex gap-1.5 items-center md:gap-1">
      {DURATION_PRESETS.map((m) => {
        const isActive = value === m;
        return (
          <button
            key={m}
            type="button"
            className={cn(
              "rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
              "md:rounded-md md:px-2 md:py-1",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
            onClick={() => handlePreset(m)}
          >
            {formatDurationLabel(m)}
          </button>
        );
      })}
      {showCustom && (
        <input
          type="number"
          min={1}
          max={1440}
          value={customInput}
          onChange={(e) => handleCustom(e.target.value)}
          placeholder="min"
          className="h-8 w-14 rounded-md border border-input bg-transparent px-2 text-[13px] outline-none focus:ring-1 focus:ring-ring md:h-7 md:w-12 md:text-xs"
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TimePickerField                                                    */
/* ------------------------------------------------------------------ */

interface TimePickerFieldProps {
  value: string;
  onChange: (time: string) => void;
  /** Only renders when true (progressive disclosure — show when date is set). */
  visible: boolean;
}

export function TimePickerField({ value, onChange, visible }: TimePickerFieldProps) {
  if (!visible) return null;

  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-28 rounded-md border border-input bg-transparent px-2 text-[13px] outline-none focus:ring-1 focus:ring-ring md:h-7 md:text-xs"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  RecurrencePresetRow                                                */
/* ------------------------------------------------------------------ */

export interface RecurrencePresetValue {
  preset: string;
  rule: { freq: string; interval: number; days_of_week?: string[] } | null;
}

const RECURRENCE_PRESETS: { key: string; label: string }[] = [
  { key: "none", label: "None" },
  { key: "daily", label: "Daily" },
  { key: "weekdays", label: "Weekdays" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

const WEEKDAY_KEYS = ["MO", "TU", "WE", "TH", "FR"];

function presetToRecurrenceRule(preset: string): RecurrencePresetValue["rule"] {
  switch (preset) {
    case "daily":
      return { freq: "daily", interval: 1 };
    case "weekdays":
      return { freq: "weekly", interval: 1, days_of_week: [...WEEKDAY_KEYS] };
    case "weekly":
      return { freq: "weekly", interval: 1 };
    case "monthly":
      return { freq: "monthly", interval: 1 };
    default:
      return null;
  }
}

interface RecurrencePresetRowProps {
  value: RecurrencePresetValue | null;
  onChange: (value: RecurrencePresetValue) => void;
}

export function RecurrencePresetRow({ value, onChange }: RecurrencePresetRowProps) {
  const activePreset = value?.preset ?? "none";

  return (
    <div className="flex gap-1.5 flex-wrap md:gap-1">
      {RECURRENCE_PRESETS.map((p) => {
        const isActive = activePreset === p.key;
        return (
          <button
            key={p.key}
            type="button"
            className={cn(
              "rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
              "md:rounded-md md:px-2 md:py-1",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
            onClick={() =>
              onChange({
                preset: isActive && p.key !== "none" ? "none" : p.key,
                rule: isActive && p.key !== "none" ? null : presetToRecurrenceRule(p.key),
              })
            }
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
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
  /** Portal target inside Drawer.Content — prevents vaul from closing on dropdown tap. */
  portalContainer?: HTMLElement | null;
}

export function ParentTaskSelect({
  parentTasks,
  domains,
  selectedId,
  currentDomainId,
  onSelect,
  portalContainer,
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

  // Position dropdown below the trigger (fixed, portaled to escape overflow)
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewH = vv?.height ?? window.innerHeight;
    const spaceBelow = viewH - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const maxDropH = 192;

    if (spaceBelow >= maxDropH || spaceBelow >= spaceAbove) {
      // Position below trigger — no maxHeight on outer; inner max-h constrains the list
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    } else {
      // Position above trigger (more room above)
      setDropdownStyle({
        position: "fixed",
        bottom: viewH - rect.top + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
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

  return (
    <div ref={containerRef}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "flex items-center justify-between w-full rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors active:scale-95",
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

      {/* Dropdown — portaled to portalContainer (inside Drawer.Content) so vaul/Radix
          doesn't treat taps on options as "outside" clicks that dismiss the drawer */}
      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            data-vaul-no-drag
            className="rounded-md border bg-popover text-popover-foreground shadow-md overflow-hidden"
            style={dropdownStyle}
            onTouchMove={(e) => e.stopPropagation()}
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

            {/* Options — touch-action/overscroll for iOS scroll containment */}
            <div
              className="max-h-48 overflow-y-auto py-1"
              style={{
                touchAction: "pan-y",
                overscrollBehaviorY: "contain",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <button
                type="button"
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors cursor-pointer",
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
          portalContainer ?? document.body,
        )}
    </div>
  );
}
