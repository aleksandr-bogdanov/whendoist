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
import {
  type AutocompleteSuggestion,
  getAutocompleteSuggestions,
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
  | null;

export interface SmartInputConsumerCallbacks {
  onDomain?: (domainId: number, domainName: string) => void;
  onImpact?: (impact: number) => void;
  onClarity?: (clarity: string) => void;
  onDuration?: (minutes: number) => void;
  onScheduledDate?: (date: string) => void;
  onScheduledTime?: (time: string) => void;
  onDescription?: (desc: string) => void;
}

export function useSmartInputConsumer(
  domains: DomainResponse[],
  callbacks: SmartInputConsumerCallbacks,
) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [flashTarget, setFlashTarget] = useState<FlashTarget>(null);
  const prevParseRef = useRef<ParsedTaskMetadata | null>(null);

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
    setTimeout(() => setFlashTarget(null), 800);
  }, []);

  /**
   * Process a title change: parse, detect new tokens, consume them.
   * Returns the cleaned title (tokens stripped).
   */
  const processTitle = useCallback(
    (rawTitle: string): string => {
      const parsed = parseTaskInput(rawTitle, domains);
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

      if (consumed) {
        // Use the parser's clean title (tokens stripped)
        cleanTitle = parsed.title;
      }

      // Update prev parse — but with a "clean" version so we don't re-trigger
      // on the same tokens
      prevParseRef.current = consumed ? parseTaskInput(cleanTitle, domains) : parsed;

      // Autocomplete detection
      const cursorPos = titleRef.current?.selectionStart ?? rawTitle.length;
      const acResult = getAutocompleteSuggestions(rawTitle, cursorPos, domains);
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
    [domains, callbacks, flash],
  );

  const handleAcSelect = useCallback(
    (suggestion: AutocompleteSuggestion, currentTitle: string): string => {
      if (!acTriggerInfo) return currentTitle;

      const prefix = suggestion.type === "domain" ? "#" : suggestion.type === "impact" ? "!" : "?";
      const insertText =
        suggestion.type === "domain" ? suggestion.label : suggestion.label.toLowerCase();
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
    (e: React.KeyboardEvent): boolean => {
      if (acVisible && acSuggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setAcSelectedIndex((i) => Math.min(i + 1, acSuggestions.length - 1));
          return true;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setAcSelectedIndex((i) => Math.max(i - 1, 0));
          return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          // Autocomplete selection handled by parent via handleAcSelect
          return true;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setAcVisible(false);
          return true;
        }
      }
      return false;
    },
    [acVisible, acSuggestions],
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
