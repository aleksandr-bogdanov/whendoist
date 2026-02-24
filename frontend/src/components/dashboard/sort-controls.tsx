import { ArrowDown, ArrowUp } from "lucide-react";
import { announce } from "@/components/live-announcer";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

const SORT_OPTIONS = [
  { field: "clarity" as const, label: "Clarity", colVar: "--col-clarity" },
  { field: "duration" as const, label: "Duration", colVar: "--col-duration" },
  { field: "impact" as const, label: "Impact", colVar: "--col-impact" },
];

export function ColumnHeaders() {
  const { sortField, sortDirection, toggleSort } = useUIStore();

  return (
    <div className="hidden sm:flex items-center justify-end px-2 sm:px-4 lg:px-8 py-1 sticky top-0 z-10 bg-background/80 backdrop-blur-sm">
      {/* Spacer for task name area + rail + checkbox */}
      <div className="flex-1" />

      {/* Column headers aligned with task row metadata */}
      <div className="flex items-center gap-[var(--col-gap)] flex-shrink-0">
        {SORT_OPTIONS.map((opt) => {
          const isActive = sortField === opt.field;
          const Icon = sortDirection === "asc" ? ArrowUp : ArrowDown;
          return (
            <button
              key={opt.field}
              type="button"
              className={cn(
                "flex items-center justify-center gap-0.5 text-[0.625rem] font-medium tracking-[0.06em] uppercase transition-colors",
                isActive
                  ? "text-muted-foreground"
                  : "text-muted-foreground/40 hover:text-muted-foreground",
              )}
              style={{ width: `var(${opt.colVar})` }}
              onClick={() => {
                toggleSort(opt.field);
                const dir =
                  sortField === opt.field
                    ? sortDirection === "asc"
                      ? "descending"
                      : "ascending"
                    : "ascending";
                announce(`Sorted by ${opt.label.toLowerCase()} ${dir}`);
              }}
            >
              {opt.label}
              {isActive && <Icon className="h-2.5 w-2.5" />}
            </button>
          );
        })}
        {/* Spacer matching actions column (kebab menu) */}
        <span className="w-[var(--col-actions)]" />
      </div>
    </div>
  );
}
