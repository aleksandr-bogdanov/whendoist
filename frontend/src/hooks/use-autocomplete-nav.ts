/**
 * Shared autocomplete keyboard navigation logic.
 *
 * Extracted from use-smart-input.ts and use-smart-input-consumer.ts
 * to deduplicate ~90% identical ArrowDown/Up/Enter/Tab/Escape handling.
 */

import type React from "react";
import type { AutocompleteSuggestion } from "@/lib/task-parser";

/**
 * Handle autocomplete keyboard navigation.
 * Returns true if the event was consumed by autocomplete.
 *
 * @param onSelect - Called on Enter/Tab with the selected suggestion. If null, Enter/Tab is consumed but no action taken (caller handles selection externally).
 */
export function handleAutocompleteKeyDown(
  e: React.KeyboardEvent,
  acVisible: boolean,
  acSuggestions: AutocompleteSuggestion[],
  acSelectedIndex: number,
  setAcSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
  setAcVisible: React.Dispatch<React.SetStateAction<boolean>>,
  onSelect: ((suggestion: AutocompleteSuggestion) => void) | null,
): boolean {
  if (!acVisible || acSuggestions.length === 0) return false;

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
    onSelect?.(acSuggestions[acSelectedIndex]);
    return true;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    setAcVisible(false);
    return true;
  }
  return false;
}
