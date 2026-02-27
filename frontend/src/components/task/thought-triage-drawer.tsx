import { ArrowRight, ChevronRight, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Drawer } from "vaul";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { DomainChipRow, ImpactButtonRow, ScheduleButtonRow } from "@/components/task/field-pickers";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ConvertData {
  domain_id: number;
  title: string;
  parent_id?: number | null;
  impact?: number;
  clarity?: string;
  duration_minutes?: number;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  description?: string | null;
}

interface ThoughtTriageDrawerProps {
  thought: TaskResponse | null;
  domains: DomainResponse[];
  parentTasks: TaskResponse[];
  onConvert: (thought: TaskResponse, data: ConvertData) => void;
  onDelete: (thought: TaskResponse) => void;
  onOpenChange: (open: boolean) => void;
}

/* ------------------------------------------------------------------ */
/*  Drawer                                                             */
/* ------------------------------------------------------------------ */

export function ThoughtTriageDrawer({
  thought,
  domains,
  parentTasks,
  onConvert,
  onDelete,
  onOpenChange,
}: ThoughtTriageDrawerProps) {
  return (
    <Drawer.Root open={!!thought} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Drawer.Content
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl",
            "bg-background border-t border-border",
            "max-h-[85vh] max-w-lg mx-auto",
          )}
        >
          <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
          <Drawer.Title className="sr-only">Triage thought</Drawer.Title>

          {thought && (
            <DrawerBody
              key={thought.id}
              thought={thought}
              domains={domains}
              parentTasks={parentTasks}
              onConvert={onConvert}
              onDelete={onDelete}
            />
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ------------------------------------------------------------------ */
/*  Inner body — remounts per thought via key={thought.id}             */
/* ------------------------------------------------------------------ */

const SCHEDULE_DATE_PATTERN =
  /\b(today|tod|tomorrow|tom|tmrw?|yes|yest|(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2})\b/i;
const IMPACT_PATTERN = /!(high|mid|low|min|p[1-4])\b/i;
const IMPACT_KEYWORDS: Record<number, string> = { 1: "high", 2: "mid", 3: "low", 4: "min" };

function DrawerBody({
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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [parentId, setParentId] = useState<number | null>(null);
  const [parentSearch, setParentSearch] = useState("");
  const domainRowRef = useRef<HTMLDivElement>(null);

  const {
    inputRef,
    parsed,
    handleDismissToken,
    handleKeyDown: handleAcKeyDown,
    tapToken,
    setInput,
  } = useSmartInput<HTMLTextAreaElement>({ initialInput: thought.title, domains });

  // Local display state — preserves trailing whitespace that the parser's .trim() would eat
  const [displayTitle, setDisplayTitle] = useState(parsed.title);

  // Auto-resize textarea whenever displayed title changes (initial, typing, tapToken, toggle)
  // biome-ignore lint/correctness/useExhaustiveDependencies: displayTitle triggers resize on content change
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.style.height = "0";
      el.style.height = `${el.scrollHeight}px`;
    });
  }, [displayTitle, inputRef]);

  /** Clean-display: user edits the clean title, we reconstruct rawInput with tokens prepended. */
  const handleTitleEdit = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newTitle = e.target.value;
      const tokenStr = parsed.tokens.map((t) => t.raw).join(" ");
      const rebuilt = tokenStr ? `${tokenStr} ${newTitle}` : newTitle;
      setInput(rebuilt);

      // Check if a token was extracted (title changed beyond whitespace normalization)
      const result = parseTaskInput(rebuilt, domains);
      const normalized = newTitle.replace(/\s{2,}/g, " ").trim();
      // If only whitespace differs, preserve user's exact input (trailing spaces)
      // If a token was extracted, show the clean result
      setDisplayTitle(normalized === result.title ? newTitle : result.title);
    },
    [parsed.tokens, setInput, domains],
  );

  /** Toggle-off helper: find token by type and dismiss it. */
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
      // Toggle-off: tap active date to clear
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
    <>
      {/* Scrollable body */}
      <div className="overflow-y-auto px-4 pb-2 space-y-2">
        {/* Clean title input — tokens are extracted, only human-readable title shown */}
        <textarea
          ref={inputRef}
          value={displayTitle}
          onChange={handleTitleEdit}
          onKeyDown={handleKeyDown}
          placeholder="What's the task?"
          className="w-full text-base bg-transparent outline-none caret-primary placeholder:text-muted-foreground py-1.5 resize-none overflow-hidden"
          rows={1}
        />

        {/* Domain — label + full-bleed scrollable chips */}
        <div ref={domainRowRef} className="relative pl-[58px] transition-all duration-300">
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
            Domain
          </span>
          <div className="-mr-4 pr-4 overflow-x-auto scrollbar-hide touch-pan-x">
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
                  // Clear parent if it's in a different domain
                  if (parentId !== null) {
                    const parent = parentTasks.find((t) => t.id === parentId);
                    if (parent && parent.domain_id !== id) setParentId(null);
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Parent task — inline label + trigger for nested drawer */}
        {parentTasks.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground shrink-0 w-[50px]">Parent</span>
            <button
              type="button"
              className={cn(
                "flex-1 flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors active:scale-95",
                parentId !== null
                  ? "bg-primary/10 text-primary"
                  : "bg-secondary text-secondary-foreground active:bg-secondary/80",
              )}
              onClick={() => {
                setParentSearch("");
                setParentPickerOpen(true);
              }}
            >
              <span className="flex items-center gap-1.5 truncate min-w-0">
                {parentId !== null ? (
                  <>
                    {(() => {
                      const p = parentTasks.find((t) => t.id === parentId);
                      const d = p?.domain_id ? domains.find((dm) => dm.id === p.domain_id) : null;
                      return (
                        <>
                          {d?.icon && <span className="shrink-0">{d.icon}</span>}
                          <span className="truncate">{p?.title ?? "Unknown"}</span>
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <span>None</span>
                )}
              </span>
              <ChevronRight className="h-3 w-3 opacity-50 shrink-0 ml-1.5" />
            </button>
          </div>
        )}

        {/* Impact — inline label + buttons */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground shrink-0 w-[50px]">Impact</span>
          <div className="flex-1">
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
          </div>
        </div>

        {/* Schedule — inline label + buttons */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground shrink-0 w-[50px]">When</span>
          <div className="flex-1">
            <ScheduleButtonRow
              selectedDate={parsed.scheduledDate}
              onSelectDate={handleDateSelect}
              onClear={() => clearTokenType("date")}
              onCalendarOpen={() => setCalendarOpen(true)}
            />
          </div>
        </div>

        {/* Duration — inline label + chips */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground shrink-0 w-[50px]">Duration</span>
          <div className="flex-1 flex gap-1.5">
            {DURATION_PRESETS.map((m) => {
              const isActive = parsed.durationMinutes === m;
              return (
                <button
                  key={m}
                  type="button"
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors active:scale-95",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground active:bg-secondary/80",
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
        </div>

        {/* Clarity — inline label + colored chips */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground shrink-0 w-[50px]">Clarity</span>
          <div className="flex-1 flex gap-1.5">
            {CLARITY_OPTIONS.map((opt) => {
              const isActive = parsed.clarity === opt.value;
              const isDefaultHint = parsed.clarity === null && opt.value === "normal";
              const color = CLARITY_COLORS[opt.value];
              return (
                <button
                  key={opt.value}
                  type="button"
                  className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all active:scale-95"
                  style={
                    isActive
                      ? { backgroundColor: color, color: "#fff", boxShadow: `0 0 0 2px ${color}40` }
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
        </div>
      </div>

      {/* Footer */}
      <div className="border-t bg-background px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 h-10 text-[13px]"
          onClick={() => onDelete(thought)}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Delete
        </Button>

        <Button
          className="flex-1 h-10 text-[13px] font-semibold transition-colors duration-200"
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

      {/* Nested parent-task picker drawer */}
      <ParentPickerDrawer
        open={parentPickerOpen}
        onOpenChange={setParentPickerOpen}
        parentTasks={parentTasks}
        domains={domains}
        selectedId={parentId}
        currentDomainId={parsed.domainId}
        search={parentSearch}
        onSearchChange={setParentSearch}
        onSelect={(id) => {
          setParentId(id);
          setParentPickerOpen(false);
          // Auto-sync domain to match parent task's domain
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
                // Flash the domain row to draw attention
                const el = domainRowRef.current;
                if (el) {
                  el.style.backgroundColor = `${parentDomain.color ?? "#6B7385"}15`;
                  el.style.borderRadius = "8px";
                  setTimeout(() => {
                    el.style.backgroundColor = "";
                    el.style.borderRadius = "";
                  }, 600);
                }
                toast.info(
                  `Domain switched to ${parentDomain.icon ?? ""} ${parentDomain.name} to match parent task`,
                );
              }
            }
          }
        }}
      />

      {/* Nested calendar drawer */}
      <Drawer.NestedRoot open={calendarOpen} onOpenChange={setCalendarOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content
            className={cn(
              "fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl",
              "bg-background border-t border-border",
              "max-w-lg mx-auto",
            )}
          >
            <div className="mx-auto mt-3 mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
            <Drawer.Title className="sr-only">Pick a date</Drawer.Title>
            <div className="px-2 pb-8">
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
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.NestedRoot>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  ParentPickerDrawer — nested drawer for parent task selection       */
/* ------------------------------------------------------------------ */

function ParentPickerDrawer({
  open,
  onOpenChange,
  parentTasks,
  domains,
  selectedId,
  currentDomainId,
  search,
  onSearchChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentTasks: TaskResponse[];
  domains: DomainResponse[];
  selectedId: number | null;
  currentDomainId: number | null;
  search: string;
  onSearchChange: (s: string) => void;
  onSelect: (id: number | null) => void;
}) {
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

  return (
    <Drawer.NestedRoot open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Drawer.Content
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl",
            "bg-background border-t border-border",
            "max-w-lg mx-auto max-h-[70vh] flex flex-col",
          )}
        >
          <div className="mx-auto mt-3 mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
          <Drawer.Title className="px-4 text-sm font-semibold mb-2">
            Select parent task
          </Drawer.Title>

          {/* Search */}
          <div className="flex items-center gap-2 px-4 pb-2">
            <div className="flex-1 flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search tasks..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className="text-muted-foreground active:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Task list */}
          <div className="overflow-y-auto px-2 pb-8 space-y-0.5">
            <button
              type="button"
              className={cn(
                "w-full px-3 py-2.5 text-left text-sm rounded-lg transition-colors",
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
                  <div className="px-3 pt-2 pb-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
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
                        "w-full px-3 py-2.5 text-left text-sm rounded-lg flex items-center gap-2 transition-colors",
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
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.NestedRoot>
  );
}
