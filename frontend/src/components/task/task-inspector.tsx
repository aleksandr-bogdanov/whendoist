import { ArrowRight, ChevronRight, MousePointerClick, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { DomainChipRow, ImpactButtonRow, ScheduleButtonRow } from "@/components/task/field-pickers";
import type { ConvertData } from "@/components/task/thought-triage-drawer";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSmartInput } from "@/hooks/use-smart-input";
import { parseTaskInput } from "@/lib/task-parser";
import {
  CLARITY_COLORS,
  CLARITY_OPTIONS,
  DURATION_PRESETS,
  formatDurationLabel,
} from "@/lib/task-utils";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Constants (shared with DrawerBody)                                 */
/* ------------------------------------------------------------------ */

const SCHEDULE_DATE_PATTERN =
  /\b(today|tod|tomorrow|tom|tmrw?|yes|yest|(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2})\b/i;
const IMPACT_PATTERN = /!(high|mid|low|min|p[1-4])\b/i;
const IMPACT_KEYWORDS: Record<number, string> = { 1: "high", 2: "mid", 3: "low", 4: "min" };

/* ------------------------------------------------------------------ */
/*  TaskInspector — desktop right-pane for triage                      */
/* ------------------------------------------------------------------ */

interface TaskInspectorProps {
  thought: TaskResponse | null;
  domains: DomainResponse[];
  parentTasks: TaskResponse[];
  onConvert: (thought: TaskResponse, data: ConvertData) => void;
  onDelete: (thought: TaskResponse) => void;
}

export function TaskInspector({
  thought,
  domains,
  parentTasks,
  onConvert,
  onDelete,
}: TaskInspectorProps) {
  if (!thought) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <MousePointerClick className="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">Select a thought to triage</p>
          <p className="text-xs text-muted-foreground/60">
            <kbd className="px-1 py-0.5 rounded border border-border text-[10px]">j</kbd>{" "}
            <kbd className="px-1 py-0.5 rounded border border-border text-[10px]">k</kbd> to
            navigate
          </p>
        </div>
      </div>
    );
  }

  return (
    <InspectorBody
      key={thought.id}
      thought={thought}
      domains={domains}
      parentTasks={parentTasks}
      onConvert={onConvert}
      onDelete={onDelete}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  InspectorBody — remounts per thought via key={thought.id}          */
/* ------------------------------------------------------------------ */

function InspectorBody({
  thought,
  domains,
  parentTasks,
  onConvert,
  onDelete,
}: {
  thought: TaskResponse;
  domains: DomainResponse[];
  parentTasks: TaskResponse[];
  onConvert: (thought: TaskResponse, data: ConvertData) => void;
  onDelete: (thought: TaskResponse) => void;
}) {
  const [parentId, setParentId] = useState<number | null>(null);
  const [domainFlash, setDomainFlash] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const {
    inputRef,
    parsed,
    handleDismissToken,
    handleKeyDown: handleAcKeyDown,
    tapToken,
    setInput,
  } = useSmartInput<HTMLTextAreaElement>({ initialInput: thought.title, domains });

  const [displayTitle, setDisplayTitle] = useState(parsed.title);

  // Auto-resize textarea
  // biome-ignore lint/correctness/useExhaustiveDependencies: displayTitle triggers resize
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.style.height = "0";
      el.style.height = `${el.scrollHeight}px`;
    });
  }, [displayTitle, inputRef]);

  const handleTitleEdit = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newTitle = e.target.value;
      const tokenStr = parsed.tokens.map((t) => t.raw).join(" ");
      const rebuilt = tokenStr ? `${tokenStr} ${newTitle}` : newTitle;
      setInput(rebuilt);

      const result = parseTaskInput(rebuilt, domains);
      const normalized = newTitle.replace(/\s{2,}/g, " ").trim();
      setDisplayTitle(normalized === result.title ? newTitle : result.title);
    },
    [parsed.tokens, setInput, domains],
  );

  const clearTokenType = useCallback(
    (type: string) => {
      const token = parsed.tokens.find((t) => t.type === type);
      if (token) handleDismissToken(token);
    },
    [parsed.tokens, handleDismissToken],
  );

  const canConvert = parsed.domainId !== null && parsed.title.trim().length > 0;

  const handleSubmit = useCallback(() => {
    if (!canConvert || !parsed.domainId) return;
    onConvert(thought, {
      domain_id: parsed.domainId,
      title: parsed.title.trim(),
      parent_id: parentId,
      impact: parsed.impact ?? undefined,
      clarity: parsed.clarity ?? undefined,
      duration_minutes: parsed.durationMinutes ?? undefined,
      scheduled_date: parsed.scheduledDate,
      scheduled_time: parsed.scheduledTime,
      description: parsed.description,
    });
  }, [canConvert, parsed, thought, onConvert, parentId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (handleAcKeyDown(e)) return;
      if (e.key === "Enter" && !e.shiftKey && canConvert) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleAcKeyDown, canConvert, handleSubmit],
  );

  const handleDateSelect = useCallback(
    (iso: string) => {
      if (iso === parsed.scheduledDate) {
        clearTokenType("date");
        return;
      }
      const d = new Date(`${iso}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tmr = new Date(today);
      tmr.setDate(tmr.getDate() + 1);
      let label: string;
      if (d.getTime() === today.getTime()) label = "today";
      else if (d.getTime() === tmr.getTime()) label = "tomorrow";
      else label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
      const dateToken = parsed.tokens.find((t) => t.type === "date");
      const datePattern = dateToken
        ? new RegExp(dateToken.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
        : SCHEDULE_DATE_PATTERN;
      tapToken("", label, datePattern);
    },
    [tapToken, parsed.scheduledDate, parsed.tokens, clearTokenType],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {/* Title */}
        <textarea
          ref={inputRef}
          value={displayTitle}
          onChange={handleTitleEdit}
          onKeyDown={handleKeyDown}
          placeholder="What's the task?"
          className="w-full text-base font-medium bg-transparent outline-none caret-primary placeholder:text-muted-foreground py-1.5 resize-none overflow-hidden border-b border-border/40 focus:border-primary transition-colors"
          rows={1}
        />

        {/* Domain */}
        <FieldRow label="Domain">
          <div
            className={cn("rounded-lg transition-all duration-300", domainFlash && "bg-primary/20")}
          >
            <DomainChipRow
              domains={domains}
              selectedId={parsed.domainId}
              onSelect={(id, name) => {
                if (id === parsed.domainId) {
                  clearTokenType("domain");
                } else {
                  const cur = parsed.domainName;
                  const pattern = cur
                    ? new RegExp(`#${cur.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "i")
                    : /#\S+/;
                  tapToken("#", name, pattern);
                  if (parentId !== null) {
                    const parent = parentTasks.find((t) => t.id === parentId);
                    if (parent && parent.domain_id !== id) setParentId(null);
                  }
                }
              }}
            />
          </div>
        </FieldRow>

        {/* Parent */}
        {parentTasks.length > 0 && (
          <FieldRow label="Parent">
            <ParentPickerPopover
              parentTasks={parentTasks}
              domains={domains}
              selectedId={parentId}
              currentDomainId={parsed.domainId}
              onSelect={(id) => {
                setParentId(id);
                if (id !== null) {
                  const parent = parentTasks.find((t) => t.id === id);
                  if (parent?.domain_id && parent.domain_id !== parsed.domainId) {
                    const parentDomain = domains.find((d) => d.id === parent.domain_id);
                    if (parentDomain) {
                      const cur = parsed.domainName;
                      const pattern = cur
                        ? new RegExp(`#${cur.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "i")
                        : /#\S+/;
                      tapToken("#", parentDomain.name ?? "", pattern);
                      setDomainFlash(true);
                      setTimeout(() => setDomainFlash(false), 800);
                    }
                  }
                }
              }}
            />
          </FieldRow>
        )}

        {/* Impact */}
        <FieldRow label="Impact">
          <ImpactButtonRow
            value={parsed.impact}
            onChange={(impact) => {
              if (parsed.impact === impact) {
                clearTokenType("impact");
              } else {
                tapToken("!", IMPACT_KEYWORDS[impact], IMPACT_PATTERN);
              }
            }}
          />
        </FieldRow>

        {/* When */}
        <FieldRow label="When">
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <div>
                <ScheduleButtonRow
                  selectedDate={parsed.scheduledDate}
                  onSelectDate={handleDateSelect}
                  onClear={() => clearTokenType("date")}
                  onCalendarOpen={() => setCalendarOpen(true)}
                />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
              <Calendar
                mode="single"
                selected={
                  parsed.scheduledDate ? new Date(`${parsed.scheduledDate}T00:00:00`) : undefined
                }
                onSelect={(date) => {
                  if (date) {
                    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                    handleDateSelect(iso);
                    setCalendarOpen(false);
                  }
                }}
                defaultMonth={
                  parsed.scheduledDate ? new Date(`${parsed.scheduledDate}T00:00:00`) : new Date()
                }
                className="mx-auto"
              />
            </PopoverContent>
          </Popover>
        </FieldRow>

        {/* Duration */}
        <FieldRow label="Duration">
          <div className="flex gap-1.5 md:gap-1">
            {DURATION_PRESETS.map((m) => {
              const isActive = parsed.durationMinutes === m;
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
                  onClick={() => {
                    if (parsed.durationMinutes === m) {
                      clearTokenType("duration");
                    } else {
                      const durToken = parsed.tokens.find((t) => t.type === "duration");
                      const durPattern = durToken
                        ? new RegExp(durToken.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
                        : /(?<![a-zA-Z])(\d+h\d+m|\d+h|\d+m)(?![a-zA-Z])/i;
                      tapToken("", formatDurationLabel(m), durPattern);
                    }
                  }}
                >
                  {formatDurationLabel(m)}
                </button>
              );
            })}
          </div>
        </FieldRow>

        {/* Clarity */}
        <FieldRow label="Clarity">
          <div className="flex gap-1.5 md:gap-1">
            {CLARITY_OPTIONS.map((opt) => {
              const isActive = parsed.clarity === opt.value;
              const isDefaultHint = parsed.clarity === null && opt.value === "normal";
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
                  onClick={() => {
                    if (parsed.clarity === opt.value) {
                      clearTokenType("clarity");
                    } else {
                      tapToken("?", opt.value, /\?(autopilot|normal|brainstorm)\b/i);
                    }
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </FieldRow>
      </div>

      {/* Footer */}
      <div className="border-t bg-background px-5 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 h-9 text-[13px]"
          onClick={() => onDelete(thought)}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Delete
        </Button>

        <Button
          className="flex-1 h-9 text-[13px] font-semibold transition-colors duration-200"
          disabled={!canConvert}
          onClick={handleSubmit}
        >
          {parsed.domainId === null ? (
            <>
              Pick a domain
              <ChevronRight className="h-3.5 w-3.5 ml-1 -rotate-90" />
            </>
          ) : (
            <>
              Convert to Task
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FieldRow — label + content layout helper                           */
/* ------------------------------------------------------------------ */

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-muted-foreground shrink-0 w-16 pt-2 md:pt-1">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ParentPickerPopover — desktop parent task picker in a popover      */
/* ------------------------------------------------------------------ */

function ParentPickerPopover({
  parentTasks,
  domains,
  selectedId,
  currentDomainId,
  onSelect,
}: {
  parentTasks: TaskResponse[];
  domains: DomainResponse[];
  selectedId: number | null;
  currentDomainId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [search, setSearch] = useState("");

  const selectedParent = useMemo(
    () => parentTasks.find((t) => t.id === selectedId) ?? null,
    [parentTasks, selectedId],
  );
  const selectedDomain = useMemo(
    () =>
      selectedParent?.domain_id ? domains.find((d) => d.id === selectedParent.domain_id) : null,
    [selectedParent, domains],
  );

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

  return (
    <Popover onOpenChange={() => setSearch("")}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center justify-between w-full rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
            "md:rounded-md md:px-2 md:py-1",
            selectedParent
              ? "bg-primary/10 text-primary"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
          )}
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
          <ChevronRight className="h-3 w-3 opacity-50 shrink-0 ml-1.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" sideOffset={8}>
        <div className="p-2 border-b">
          <div className="flex items-center gap-2 rounded-md bg-secondary px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
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
        </div>

        <div className="max-h-56 overflow-y-auto py-1">
          <button
            type="button"
            className={cn(
              "w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors",
              selectedId === null && "bg-accent font-medium",
            )}
            onClick={() => onSelect(null)}
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
                      "w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors flex items-center gap-1.5",
                      selectedId === t.id && "bg-accent font-medium",
                    )}
                    onClick={() => onSelect(t.id)}
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
