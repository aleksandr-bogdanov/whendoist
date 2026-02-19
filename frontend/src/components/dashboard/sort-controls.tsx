import { ArrowDown, ArrowUp } from "lucide-react";
import { announce } from "@/components/live-announcer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

const SORT_OPTIONS = [
  { field: "clarity" as const, label: "Clarity" },
  { field: "impact" as const, label: "Impact" },
  { field: "duration" as const, label: "Duration" },
];

export function SortControls() {
  const { sortField, sortDirection, toggleSort } = useUIStore();

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground mr-1 hidden sm:inline">Sort:</span>
      {SORT_OPTIONS.map((opt) => {
        const isActive = sortField === opt.field;
        const Icon = sortDirection === "asc" ? ArrowUp : ArrowDown;
        return (
          <Button
            key={opt.field}
            variant={isActive ? "secondary" : "ghost"}
            size="sm"
            className={cn("h-6 text-[11px] px-2 gap-0.5", isActive && "font-medium")}
            onClick={() => {
              toggleSort(opt.field);
              const dir =
                sortField === opt.field
                  ? sortDirection === "asc"
                    ? "descending"
                    : "ascending"
                  : "ascending";
              announce(`Sorted by ${opt.label} ${dir}`);
            }}
          >
            {opt.label}
            {isActive && <Icon className="h-3 w-3" />}
          </Button>
        );
      })}
    </div>
  );
}
