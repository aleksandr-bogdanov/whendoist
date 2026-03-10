import { useCallback, useRef, useState } from "react";
import type { DomainResponse } from "@/api/model";
import { handleAutocompleteKeyDown } from "@/hooks/use-autocomplete-nav";
import {
  type AutocompleteSuggestion,
  EMPTY_PARSED,
  getAutocompleteSuggestions,
  type ParentTaskOption,
  type ParsedTaskMetadata,
  type ParsedToken,
  parseTaskInput,
} from "@/lib/task-parser";

export interface UseSmartInputOptions {
  initialInput?: string;
  domains: DomainResponse[];
  parentTasks?: ParentTaskOption[];
}

export function useSmartInput<E extends HTMLInputElement | HTMLTextAreaElement = HTMLInputElement>({
  initialInput = "",
  domains,
  parentTasks,
}: UseSmartInputOptions) {
  const inputRef = useRef<E>(null);

  // Core state
  const [rawInput, setRawInput] = useState(initialInput);
  const [parsed, setParsed] = useState<ParsedTaskMetadata>(() =>
    initialInput
      ? parseTaskInput(initialInput, domains, undefined, parentTasks)
      : { ...EMPTY_PARSED },
  );
  const [dismissedTokens, setDismissedTokens] = useState<Map<string, string>>(new Map());

  // Autocomplete state
  const [acVisible, setAcVisible] = useState(false);
  const [acSuggestions, setAcSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [acSelectedIndex, setAcSelectedIndex] = useState(0);
  const [acTriggerInfo, setAcTriggerInfo] = useState<{
    start: number;
    end: number;
    type: string;
  } | null>(null);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setRawInput("");
    setParsed({ ...EMPTY_PARSED });
    setDismissedTokens(new Map());
    setAcVisible(false);
    setAcSuggestions([]);
    setAcSelectedIndex(0);
    setAcTriggerInfo(null);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<E>) => {
      const value = e.target.value;
      setRawInput(value);

      // Prune stale dismissals — keep only those whose raw text is still in the input
      const stillValid = new Map<string, string>();
      for (const [type, rawText] of dismissedTokens) {
        if (value.includes(rawText)) stillValid.set(type, rawText);
      }
      setDismissedTokens(stillValid);

      // Parse metadata
      const result = parseTaskInput(value, domains, new Set(stillValid.keys()), parentTasks);
      setParsed(result);

      // Check for autocomplete trigger
      const cursorPos = e.target.selectionStart ?? value.length;
      const acResult = getAutocompleteSuggestions(
        value,
        cursorPos,
        domains,
        parentTasks,
        result.domainId,
      );
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
    },
    [domains, dismissedTokens, parentTasks],
  );

  const handleAcSelect = useCallback(
    (suggestion: AutocompleteSuggestion) => {
      if (!acTriggerInfo) return;

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
      const before = rawInput.slice(0, acTriggerInfo.start);
      const after = rawInput.slice(acTriggerInfo.end);
      const newInput = `${before}${prefix}${insertText} ${after}`;

      setRawInput(newInput);
      setParsed(parseTaskInput(newInput, domains, undefined, parentTasks));
      setAcVisible(false);

      // Restore focus with cursor after inserted text
      requestAnimationFrame(() => {
        const cursorPos = acTriggerInfo.start + prefix.length + insertText.length + 1;
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(cursorPos, cursorPos);
      });
    },
    [acTriggerInfo, rawInput, domains, parentTasks],
  );

  const handleDismissToken = useCallback(
    (token: ParsedToken) => {
      // Remove the raw token text from input so it can't resurface
      const newInput = rawInput
        .replace(token.raw, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      setRawInput(newInput);
      setParsed(parseTaskInput(newInput, domains, undefined, parentTasks));
      setDismissedTokens(new Map());
    },
    [rawInput, domains, parentTasks],
  );

  /** Insert or replace a token in rawInput by prefix+value, matching existingPattern. */
  const tapToken = useCallback(
    (prefix: string, value: string, existingPattern: RegExp) => {
      const token = `${prefix}${value}`;
      let newInput: string;
      if (existingPattern.test(rawInput)) {
        newInput = rawInput.replace(existingPattern, token);
      } else {
        newInput = `${rawInput.trimEnd()} ${token} `;
      }
      setRawInput(newInput);
      setParsed(parseTaskInput(newInput, domains, undefined, parentTasks));
      setDismissedTokens(new Map());
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(newInput.length, newInput.length);
      });
    },
    [rawInput, domains, parentTasks],
  );

  /**
   * Keyboard handler for autocomplete navigation.
   * Returns `true` if the event was consumed (caller should not handle it further).
   * When autocomplete is not active, returns `false` so the caller can handle Enter/submit.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean =>
      handleAutocompleteKeyDown(
        e,
        acVisible,
        acSuggestions,
        acSelectedIndex,
        setAcSelectedIndex,
        setAcVisible,
        handleAcSelect,
      ),
    [acVisible, acSuggestions, acSelectedIndex, handleAcSelect],
  );

  /** Directly set rawInput and re-parse (for programmatic updates like clearing a date). */
  const setInput = useCallback(
    (value: string) => {
      setRawInput(value);
      setParsed(parseTaskInput(value, domains, undefined, parentTasks));
    },
    [domains, parentTasks],
  );

  // Compute the trigger prefix (text typed after the trigger character)
  const acTriggerPrefix = acTriggerInfo
    ? rawInput.slice(acTriggerInfo.start + 1, acTriggerInfo.end)
    : "";

  return {
    // Refs
    inputRef,
    // State
    rawInput,
    parsed,
    // Autocomplete
    acVisible,
    acSuggestions,
    acSelectedIndex,
    acTriggerType: acTriggerInfo?.type ?? null,
    acTriggerPrefix,
    // Handlers
    handleInputChange,
    handleAcSelect,
    handleDismissToken,
    handleKeyDown,
    tapToken,
    setInput,
    reset,
  };
}
