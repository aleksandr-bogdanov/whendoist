/**
 * Smart Input Consumer (Approach A) — for the task editor.
 *
 * Unlike the triage's Approach B (raw text is source of truth), the editor
 * keeps field state in independent useState calls. Tokens typed in the title
 * field are *consumed*: detected, stripped from the title, and their values
 * pushed into the corresponding field setters.
 *
 * The title stays clean — tokens are transient accelerators, not persisted.
 */

import { useCallback, useRef, useState } from "react";
import type { DomainResponse } from "@/api/model";
import { handleAutocompleteKeyDown } from "@/hooks/use-autocomplete-nav";
import {
  type AutocompleteSuggestion,
  getAutocompleteSuggestions,
  type ParentTaskOption,
  type ParsedTaskMetadata,
  parseTaskInput,
} from "@/lib/task-parser";

export type FlashTarget =
  | "domain"
  | "impact"
  | "clarity"
  | "duration"
  | "schedule"
  | "description"
  | "parent"
  | null;

export interface SmartInputConsumerCallbacks {
  onDomain?: (domainId: number, domainName: string) => void;
  onImpact?: (impact: number) => void;
  onClarity?: (clarity: string) => void;
  onDuration?: (minutes: number) => void;
  onScheduledDate?: (date: string) => void;
  onScheduledTime?: (time: string) => void;
  onDescription?: (desc: string) => void;
  onParent?: (parentId: number, parentName: string) => void;
}

export function useSmartInputConsumer(
  domains: DomainResponse[],
  callbacks: SmartInputConsumerCallbacks,
  initialTitle?: string,
  parentTasks?: ParentTaskOption[],
) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [flashTarget, setFlashTarget] = useState<FlashTarget>(null);
  const prevParseRef = useRef<ParsedTaskMetadata | null>(null);

  // Baseline seeding: parse the initial title on mount so that any token-like
  // text already in the title (e.g. "30m" in "Fix 30m timeout bug") is treated
  // as "previously seen" and won't be consumed on the first edit keystroke.
  const baselineSeeded = useRef(false);
  if (initialTitle && !baselineSeeded.current) {
    prevParseRef.current = parseTaskInput(initialTitle, domains, undefined, parentTasks);
    baselineSeeded.current = true;
  }

  // Autocomplete state
  const [acVisible, setAcVisible] = useState(false);
  const [acSuggestions, setAcSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [acSelectedIndex, setAcSelectedIndex] = useState(0);
  const [acTriggerInfo, setAcTriggerInfo] = useState<{
    start: number;
    end: number;
    type: string;
  } | null>(null);

  const flash = useCallback((target: FlashTarget) => {
    setFlashTarget(target);
    setTimeout(() => setFlashTarget(null), 650);
  }, []);

  /**
   * Process a title change: parse, detect new tokens, consume them.
   * Returns the cleaned title (tokens stripped).
   */
  const processTitle = useCallback(
    (rawTitle: string): string => {
      const parsed = parseTaskInput(rawTitle, domains, undefined, parentTasks);
      const prev = prevParseRef.current;

      let cleanTitle = rawTitle;
      let consumed = false;

      // Check each token type: if newly appeared (wasn't in prev), consume it
      if (parsed.domainId !== null && parsed.domainId !== prev?.domainId) {
        callbacks.onDomain?.(parsed.domainId, parsed.domainName ?? "");
        flash("domain");
        consumed = true;
      }
      if (parsed.impact !== null && parsed.impact !== prev?.impact) {
        callbacks.onImpact?.(parsed.impact);
        flash("impact");
        consumed = true;
      }
      if (parsed.clarity !== null && parsed.clarity !== prev?.clarity) {
        callbacks.onClarity?.(parsed.clarity);
        flash("clarity");
        consumed = true;
      }
      if (parsed.durationMinutes !== null && parsed.durationMinutes !== prev?.durationMinutes) {
        callbacks.onDuration?.(parsed.durationMinutes);
        flash("duration");
        consumed = true;
      }
      if (parsed.scheduledDate !== null && parsed.scheduledDate !== prev?.scheduledDate) {
        callbacks.onScheduledDate?.(parsed.scheduledDate);
        flash("schedule");
        consumed = true;
      }
      if (
        parsed.scheduledTime !== null &&
        parsed.scheduledTime !== prev?.scheduledTime &&
        parsed.scheduledDate !== null
      ) {
        callbacks.onScheduledTime?.(parsed.scheduledTime);
        consumed = true;
      }
      if (parsed.description !== null && parsed.description !== prev?.description) {
        callbacks.onDescription?.(parsed.description);
        flash("description");
        consumed = true;
      }
      if (parsed.parentId !== null && parsed.parentId !== prev?.parentId) {
        callbacks.onParent?.(parsed.parentId, parsed.parentName ?? "");
        flash("parent");
        consumed = true;
      }

      if (consumed) {
        // Use the parser's clean title (tokens stripped)
        cleanTitle = parsed.title;
      }

      // Update prev parse — but with a "clean" version so we don't re-trigger
      // on the same tokens
      prevParseRef.current = consumed
        ? parseTaskInput(cleanTitle, domains, undefined, parentTasks)
        : parsed;

      // Autocomplete detection
      const cursorPos = titleRef.current?.selectionStart ?? rawTitle.length;
      const acResult = getAutocompleteSuggestions(rawTitle, cursorPos, domains, parentTasks);
      if (acResult && acResult.suggestions.length > 0) {
        setAcSuggestions(acResult.suggestions);
        setAcTriggerInfo({
          start: acResult.triggerStart,
          end: acResult.triggerEnd,
          type: acResult.type,
        });
        setAcVisible(true);
        setAcSelectedIndex(0);
      } else {
        setAcVisible(false);
      }

      return consumed ? cleanTitle : rawTitle;
    },
    [domains, callbacks, flash, parentTasks],
  );

  const handleAcSelect = useCallback(
    (suggestion: AutocompleteSuggestion, currentTitle: string): string => {
      if (!acTriggerInfo) return currentTitle;

      const prefix =
        suggestion.type === "domain"
          ? "#"
          : suggestion.type === "impact"
            ? "!"
            : suggestion.type === "parent"
              ? "^"
              : "?";
      const insertText =
        suggestion.type === "domain" || suggestion.type === "parent"
          ? suggestion.label
          : suggestion.label.toLowerCase();
      const before = currentTitle.slice(0, acTriggerInfo.start);
      const after = currentTitle.slice(acTriggerInfo.end);
      const newTitle = `${before}${prefix}${insertText} ${after}`;

      setAcVisible(false);

      // Process the title with the inserted token (will consume it)
      return processTitle(newTitle);
    },
    [acTriggerInfo, processTitle],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean =>
      handleAutocompleteKeyDown(
        e,
        acVisible,
        acSuggestions,
        acSelectedIndex,
        setAcSelectedIndex,
        setAcVisible,
        null, // Selection handled by parent via handleAcSelect
      ),
    [acVisible, acSuggestions, acSelectedIndex],
  );

  return {
    titleRef,
    flashTarget,
    processTitle,
    // Autocomplete
    acVisible,
    acSuggestions,
    acSelectedIndex,
    handleAcSelect,
    handleKeyDown,
  };
}
