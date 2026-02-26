import { ArrowRight, ChevronRight, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";
import type { DomainResponse, TaskResponse } from "@/api/model";
import {
  DomainChipRow,
  ImpactButtonRow,
  ParentTaskSelect,
  ScheduleButtonRow,
} from "@/components/task/field-pickers";
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
  const contentRef = useRef<HTMLDivElement>(null);

  // Shift drawer above the iOS keyboard.
  // position:fixed + bottom:0 anchors to the LAYOUT viewport, which doesn't move for
  // the keyboard. We detect the keyboard via visualViewport / window.resize and shift
  // the drawer up by setting `bottom` + constraining `maxHeight`.
  // In PWA standalone mode, visualViewport.resize may not fire — listen to both.
  useEffect(() => {
    if (!thought) return;
    const vv = window.visualViewport;
    const update = () => {
      const el = contentRef.current;
      if (!el) return;
      // Use the smaller of visualViewport and innerHeight to detect keyboard
      const viewH = Math.min(vv?.height ?? window.innerHeight, window.innerHeight);
      const keyboardH = window.innerHeight - viewH;
      if (keyboardH > 100) {
        // Move the drawer above the keyboard and cap its height to visible area
        el.style.bottom = `${keyboardH}px`;
        el.style.maxHeight = `${viewH - 20}px`;
      } else {
        el.style.bottom = "";
        el.style.maxHeight = "";
      }
    };
    // Run immediately in case keyboard state is already known
    update();
    vv?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      // Clear stale inline styles so the next thought starts clean
      const el = contentRef.current;
      if (el) {
        el.style.bottom = "";
        el.style.maxHeight = "";
      }
    };
  }, [thought]);

  return (
    <Drawer.Root open={!!thought} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Drawer.Content
          ref={contentRef}
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
  const [parentId, setParentId] = useState<number | null>(null);
  const portalRef = useRef<HTMLDivElement>(null);

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

  const domainColor =
    parsed.domainId !== null
      ? (domains.find((d) => d.id === parsed.domainId)?.color ?? null)
      : null;

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
      {/* Scrollable body — no flex-1 so it sizes to content, not filling the drawer */}
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
        <div className="relative pl-[54px]">
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

        {/* Parent task — inline label + dropdown */}
        {parentTasks.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground shrink-0 w-[50px]">Parent</span>
            <div className="flex-1">
              <ParentTaskSelect
                parentTasks={parentTasks}
                domains={domains}
                selectedId={parentId}
                currentDomainId={parsed.domainId}
                portalContainer={portalRef.current}
                onSelect={(id) => {
                  setParentId(id);
                  // Auto-sync domain to match parent task's domain
                  if (id !== null) {
                    const parent = parentTasks.find((t) => t.id === id);
                    if (parent?.domain_id && parent.domain_id !== parsed.domainId) {
                      const parentDomain = domains.find((d) => d.id === parent.domain_id);
                      if (parentDomain) {
                        const cur = parsed.domainName;
                        const pattern = cur
                          ? new RegExp(
                              `#${cur.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`,
                              "i",
                            )
                          : /#\S+/;
                        tapToken("#", parentDomain.name ?? "", pattern);
                      }
                    }
                  }
                }}
              />
            </div>
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

      {/* Footer — pb-safe handles safe-area inset without a separate spacer */}
      <div className="border-t bg-background px-4 py-2.5 pb-safe flex items-center gap-3">
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
          style={domainColor ? { backgroundColor: domainColor, color: "#fff" } : undefined}
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

      {/* Portal target for ParentTaskSelect dropdown — must be inside Drawer.Content
          so vaul/Radix doesn't treat clicks on the dropdown as "outside" dismissals */}
      <div ref={portalRef} />

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
