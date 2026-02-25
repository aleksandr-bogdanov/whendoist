import { useEffect, useRef } from "react";
import type { AutocompleteSuggestion } from "@/lib/task-parser";

interface SmartInputAutocompleteProps {
  suggestions: AutocompleteSuggestion[];
  visible: boolean;
  selectedIndex: number;
  onSelect: (suggestion: AutocompleteSuggestion) => void;
}

export function SmartInputAutocomplete({
  suggestions,
  visible,
  selectedIndex,
  onSelect,
}: SmartInputAutocompleteProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedIndex drives scroll
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!visible || suggestions.length === 0) return null;

  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md">
      {suggestions.map((s, i) => (
        <button
          key={`${s.type}-${s.value}`}
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
          {s.icon && <span className="shrink-0">{s.icon}</span>}
          <span className={s.colorClass ?? ""}>{s.label}</span>
          {i === selectedIndex && (
            <span className="ml-auto text-[10px] text-muted-foreground">Enter</span>
          )}
        </button>
      ))}
    </div>
  );
}
