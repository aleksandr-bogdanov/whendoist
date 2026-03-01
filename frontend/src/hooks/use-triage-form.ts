/**
 * useTriageForm — shared form logic for thought → task triage.
 *
 * Extracts ALL state, parsing, and field-change handlers that were duplicated
 * between ThoughtTriageDrawer (mobile) and TaskInspector (desktop).
 * Both components are now thin layout shells that call this hook.
 *
 * Uses Approach B (raw text = source of truth via useSmartInput).
 */

import { useCallback, useEffect, useState } from "react";
import type { DomainResponse, TaskResponse } from "@/api/model";
import type { RecurrencePresetValue } from "@/components/task/field-pickers";
import { useSmartInput } from "@/hooks/use-smart-input";
import {
  CLARITY_TOKEN_PATTERN,
  DURATION_TOKEN_PATTERN,
  IMPACT_KEYWORDS,
  IMPACT_TOKEN_PATTERN,
  parseTaskInput,
  SCHEDULE_DATE_PATTERN,
  TIME_TOKEN_PATTERN,
} from "@/lib/task-parser";
import { formatDurationLabel } from "@/lib/task-utils";

/* ------------------------------------------------------------------ */
/*  ConvertData — the output of a triage operation                     */
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

/* ------------------------------------------------------------------ */
/*  Hook options & return type                                         */
/* ------------------------------------------------------------------ */

export interface UseTriageFormOptions {
  thought: TaskResponse;
  domains: DomainResponse[];
  parentTasks: TaskResponse[];
  onConvert: (thought: TaskResponse, data: ConvertData) => void;
}

export interface UseTriageFormReturn {
  // Refs
  inputRef: React.RefObject<HTMLTextAreaElement | null>;

  // Parsed state (from useSmartInput)
  parsed: ReturnType<typeof useSmartInput<HTMLTextAreaElement>>["parsed"];

  // Display state
  displayTitle: string;
  description: string;
  setDescription: (v: string) => void;
  descriptionFocused: boolean;
  setDescriptionFocused: (v: boolean) => void;
  recurrence: RecurrencePresetValue | null;
  setRecurrence: (v: RecurrencePresetValue | null) => void;
  parentId: number | null;
  setParentId: (v: number | null) => void;
  domainFlash: boolean;
  calendarOpen: boolean;
  setCalendarOpen: (v: boolean) => void;
  canConvert: boolean;

  // Handlers
  handleTitleEdit: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleDateSelect: (iso: string) => void;
  handleSubmit: () => void;
  clearTokenType: (type: string) => void;

  // Field change handlers (for wiring to picker components)
  handleDomainSelect: (id: number, name: string) => void;
  handleImpactChange: (impact: number) => void;
  handleClarityChange: (clarity: string) => void;
  handleDurationChange: (m: number | null) => void;
  handleTimeChange: (time: string) => void;
  handleParentSelect: (id: number | null) => void;

  // Direct access to tapToken (for edge cases in containers)
  tapToken: (prefix: string, value: string, existingPattern: RegExp) => void;
}

/* ------------------------------------------------------------------ */
/*  Hook implementation                                                */
/* ------------------------------------------------------------------ */

export function useTriageForm({
  thought,
  domains,
  parentTasks,
  onConvert,
}: UseTriageFormOptions): UseTriageFormReturn {
  // ─── Local state ────────────────────────────────────────────────────────
  const [parentId, setParentId] = useState<number | null>(null);
  const [domainFlash, setDomainFlash] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrencePresetValue | null>(null);

  // ─── Smart input (Approach B) ───────────────────────────────────────────
  const {
    inputRef,
    parsed,
    handleDismissToken,
    handleKeyDown: handleAcKeyDown,
    tapToken,
    setInput,
  } = useSmartInput<HTMLTextAreaElement>({ initialInput: thought.title, domains });

  // Display title — preserves trailing whitespace the parser's .trim() would eat
  const [displayTitle, setDisplayTitle] = useState(parsed.title);

  // Seed description from parsed //notes on first render
  // biome-ignore lint/correctness/useExhaustiveDependencies: only run on mount
  useEffect(() => {
    if (parsed.description) setDescription(parsed.description);
  }, []);

  // Auto-resize textarea whenever displayed title changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: displayTitle triggers resize on content change
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.style.height = "0";
      el.style.height = `${el.scrollHeight}px`;
    });
  }, [displayTitle, inputRef]);

  // ─── Title editing ──────────────────────────────────────────────────────

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

  // ─── Token helpers ──────────────────────────────────────────────────────

  const clearTokenType = useCallback(
    (type: string) => {
      const token = parsed.tokens.find((t) => t.type === type);
      if (token) handleDismissToken(token);
    },
    [parsed.tokens, handleDismissToken],
  );

  const canConvert = parsed.domainId !== null && parsed.title.trim().length > 0;

  // ─── Submit ─────────────────────────────────────────────────────────────

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

  // ─── Keyboard ───────────────────────────────────────────────────────────

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

  // ─── Date selection ─────────────────────────────────────────────────────

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

  // ─── Field change handlers ──────────────────────────────────────────────

  const handleDomainSelect = useCallback(
    (id: number, name: string) => {
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
    },
    [parsed.domainId, parsed.domainName, clearTokenType, tapToken, parentId, parentTasks],
  );

  const handleImpactChange = useCallback(
    (impact: number) => {
      if (parsed.impact === impact) {
        clearTokenType("impact");
      } else {
        tapToken("!", IMPACT_KEYWORDS[impact], IMPACT_TOKEN_PATTERN);
      }
    },
    [parsed.impact, clearTokenType, tapToken],
  );

  const handleClarityChange = useCallback(
    (clarity: string) => {
      if (parsed.clarity === clarity) {
        clearTokenType("clarity");
      } else {
        tapToken("?", clarity, CLARITY_TOKEN_PATTERN);
      }
    },
    [parsed.clarity, clearTokenType, tapToken],
  );

  const handleDurationChange = useCallback(
    (m: number | null) => {
      if (m === null || parsed.durationMinutes === m) {
        clearTokenType("duration");
      } else {
        const durToken = parsed.tokens.find((t) => t.type === "duration");
        const durPattern = durToken
          ? new RegExp(durToken.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
          : DURATION_TOKEN_PATTERN;
        tapToken("", formatDurationLabel(m), durPattern);
      }
    },
    [parsed.durationMinutes, parsed.tokens, clearTokenType, tapToken],
  );

  const handleTimeChange = useCallback(
    (time: string) => {
      const timeToken = parsed.tokens.find((t) => t.type === "date");
      if (timeToken && time) {
        const datePattern = new RegExp(timeToken.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        tapToken("", `${timeToken.raw} ${time}`.trim(), datePattern);
      } else if (time && parsed.scheduledDate) {
        tapToken("", time, TIME_TOKEN_PATTERN);
      }
    },
    [parsed.tokens, parsed.scheduledDate, tapToken],
  );

  const handleParentSelect = useCallback(
    (id: number | null) => {
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
    },
    [parentTasks, parsed.domainId, parsed.domainName, domains, tapToken],
  );

  return {
    inputRef,
    parsed,
    displayTitle,
    description,
    setDescription,
    descriptionFocused,
    setDescriptionFocused,
    recurrence,
    setRecurrence,
    parentId,
    setParentId,
    domainFlash,
    calendarOpen,
    setCalendarOpen,
    canConvert,
    handleTitleEdit,
    handleKeyDown,
    handleDateSelect,
    handleSubmit,
    clearTokenType,
    handleDomainSelect,
    handleImpactChange,
    handleClarityChange,
    handleDurationChange,
    handleTimeChange,
    handleParentSelect,
    tapToken,
  };
}
