import { useEffect, useRef } from "react";
import type { AutocompleteSuggestion } from "@/lib/task-parser";

interface SmartInputAutocompleteProps {
  suggestions: AutocompleteSuggestion[];
  visible: boolean;
  selectedIndex: number;
  onSelect: (suggestion: AutocompleteSuggestion) => void;
  /** Render above the input instead of below. Use for inline-add rows near the bottom of lists. */
  position?: "above" | "below";
}

export function SmartInputAutocomplete({
  suggestions,
  visible,
  selectedIndex,
  onSelect,
  position = "below",
}: SmartInputAutocompleteProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedIndex drives scroll
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!visible || suggestions.length === 0) return null;

  return (
    <div
      className={`absolute left-0 right-0 z-50 max-h-60 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md py-1 ${position === "above" ? "bottom-full mb-1" : "top-full mt-1"}`}
    >
      {suggestions.map((s, i) => (
        <div key={`${s.type}-${s.value}`}>
          {/* Domain group header */}
          {s.groupLabel && (
            <>
              {i > 0 && <div className="h-px bg-border mx-2 my-1" />}
              <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {s.groupLabel}
              </div>
            </>
          )}
          <button
            ref={i === selectedIndex ? selectedRef : undefined}
            type="button"
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${
              i === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(s);
            }}
          >
            {s.icon && !s.groupLabel && <span className="shrink-0">{s.icon}</span>}
            <span className={s.colorClass ?? ""}>{s.label}</span>
            {s.secondaryLabel && (
              <span className="text-muted-foreground text-[11px]">· {s.secondaryLabel}</span>
            )}
            {s.badge && (
              <span className="shrink-0 text-[10px] text-muted-foreground ml-auto">{s.badge}</span>
            )}
            {i === selectedIndex && !s.badge && (
              <span className="ml-auto text-[10px] text-muted-foreground">Enter</span>
            )}
            {i === selectedIndex && s.badge && (
              <span className="text-[10px] text-muted-foreground ml-1">↵</span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
