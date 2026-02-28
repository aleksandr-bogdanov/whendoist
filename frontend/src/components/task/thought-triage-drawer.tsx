import { ArrowRight, ChevronRight, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer } from "vaul";
import type { DomainResponse, TaskResponse } from "@/api/model";
import {
  ClarityChipRow,
  DomainChipRow,
  DurationPickerRow,
  ImpactButtonRow,
  RecurrencePresetRow,
  type RecurrencePresetValue,
  ScheduleButtonRow,
  TimePickerField,
} from "@/components/task/field-pickers";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { useSmartInput } from "@/hooks/use-smart-input";
import { parseTaskInput } from "@/lib/task-parser";
import { formatDurationLabel } from "@/lib/task-utils";
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
  is_recurring?: boolean;
  recurrence_rule?: Record<string, unknown> | null;
  recurrence_start?: string | null;
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
  const [domainFlash, setDomainFlash] = useState(false);
  const [description, setDescription] = useState("");
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrencePresetValue | null>(null);

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

  // Seed description from parsed //notes on first render
  // biome-ignore lint/correctness/useExhaustiveDependencies: only run on mount
  useEffect(() => {
    if (parsed.description) setDescription(parsed.description);
  }, []);

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
    const finalDescription = description.trim() || parsed.description || null;
    const isRecurring =
      recurrence !== null && recurrence.preset !== "none" && recurrence.rule !== null;
    onConvert(thought, {
      domain_id: parsed.domainId,
      title: parsed.title.trim(),
      parent_id: parentId,
      impact: parsed.impact ?? undefined,
      clarity: parsed.clarity ?? undefined,
      duration_minutes: parsed.durationMinutes ?? undefined,
      scheduled_date: parsed.scheduledDate,
      scheduled_time: parsed.scheduledTime,
      description: finalDescription,
      is_recurring: isRecurring || undefined,
      recurrence_rule: isRecurring ? (recurrence!.rule as Record<string, unknown>) : undefined,
      recurrence_start: isRecurring
        ? (parsed.scheduledDate ?? new Date().toISOString().split("T")[0])
        : undefined,
    });
  }, [canConvert, parsed, thought, onConvert, parentId, description, recurrence]);

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
          className="w-full text-base bg-transparent outline-none caret-primary placeholder:text-muted-foreground py-1.5 resize-none overflow-hidden border-b border-border/40 focus:border-primary transition-colors"
          rows={1}
        />

        {/* Domain — label + full-bleed scrollable chips */}
        <div
          className={cn(
            "relative pl-16 rounded-lg transition-all duration-300",
            domainFlash && "bg-primary/20",
          )}
        >
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
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
            <span className="text-xs text-muted-foreground shrink-0 w-14">Parent</span>
            <button
              type="button"
              className={cn(
                "flex-1 flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors active:scale-95",
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
                  (() => {
                    const p = parentTasks.find((t) => t.id === parentId);
                    const d = p?.domain_id ? domains.find((dm) => dm.id === p.domain_id) : null;
                    return (
                      <>
                        {d?.icon && <span className="shrink-0">{d.icon}</span>}
                        <span className="truncate">{p?.title ?? "Unknown"}</span>
                      </>
                    );
                  })()
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
          <span className="text-xs text-muted-foreground shrink-0 w-14">Impact</span>
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
          <span className="text-xs text-muted-foreground shrink-0 w-14">When</span>
          <div className="flex-1">
            <ScheduleButtonRow
              selectedDate={parsed.scheduledDate}
              onSelectDate={handleDateSelect}
              onClear={() => clearTokenType("date")}
              onCalendarOpen={() => setCalendarOpen(true)}
            />
          </div>
        </div>

        {/* Duration — inline label + chips + custom */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0 w-14">Duration</span>
          <div className="flex-1">
            <DurationPickerRow
              value={parsed.durationMinutes}
              showCustom
              onChange={(m) => {
                if (m === null || parsed.durationMinutes === m) {
                  clearTokenType("duration");
                } else {
                  const durToken = parsed.tokens.find((t) => t.type === "duration");
                  const durPattern = durToken
                    ? new RegExp(durToken.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
                    : /(?<![a-zA-Z])(\d+h\d+m|\d+h|\d+m)(?![a-zA-Z])/i;
                  tapToken("", formatDurationLabel(m), durPattern);
                }
              }}
            />
          </div>
        </div>

        {/* Time — visible when date is set */}
        {parsed.scheduledDate && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 w-14">Time</span>
            <div className="flex-1">
              <TimePickerField
                value={parsed.scheduledTime ?? ""}
                visible
                onChange={(time) => {
                  const timeToken = parsed.tokens.find((t) => t.type === "date");
                  if (timeToken && time) {
                    const datePattern = new RegExp(
                      timeToken.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                      "i",
                    );
                    tapToken("", `${timeToken.raw} ${time}`.trim(), datePattern);
                  } else if (time && parsed.scheduledDate) {
                    tapToken("", time, /(?<![a-zA-Z\d])\d{1,2}:\d{2}(?:[ap]m)?(?![a-zA-Z])/i);
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Recurrence — preset chips */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0 w-14">Repeat</span>
          <div className="flex-1">
            <RecurrencePresetRow value={recurrence} onChange={setRecurrence} />
          </div>
        </div>

        {/* Clarity — inline label + colored chips */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0 w-14">Clarity</span>
          <div className="flex-1">
            <ClarityChipRow
              value={parsed.clarity}
              onChange={(clarity) => {
                if (parsed.clarity === clarity) {
                  clearTokenType("clarity");
                } else {
                  tapToken("?", clarity, /\?(autopilot|normal|brainstorm)\b/i);
                }
              }}
            />
          </div>
        </div>

        {/* Notes / Description */}
        <div className="flex items-start gap-2 pt-1 border-t border-border/30">
          <span className="text-xs text-muted-foreground shrink-0 w-14 pt-2">Notes</span>
          <div className="flex-1">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onFocus={() => setDescriptionFocused(true)}
              onBlur={() => setDescriptionFocused(false)}
              placeholder="Add notes..."
              rows={descriptionFocused || description ? 3 : 1}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-[13px] outline-none resize-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring transition-all"
              data-vaul-no-drag
            />
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
                setDomainFlash(true);
                setTimeout(() => setDomainFlash(false), 800);
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
            <div className="flex-1 flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
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
                  className="p-1 text-muted-foreground active:text-foreground"
                >
                  <X className="h-4 w-4" />
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
