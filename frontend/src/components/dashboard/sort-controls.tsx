import { ArrowDown, ArrowUp } from "lucide-react";
import { announce } from "@/components/live-announcer";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

const SORT_OPTIONS = [
  { field: "clarity" as const, label: "CLR", colVar: "--col-clarity" },
  { field: "duration" as const, label: "DUR", colVar: "--col-duration" },
  { field: "impact" as const, label: "IMP", colVar: "--col-impact" },
];

export function SortControls() {
  const { sortField, sortDirection, toggleSort } = useUIStore();

  return (
    <div className="hidden sm:flex items-center gap-[var(--col-gap)]">
      {SORT_OPTIONS.map((opt) => {
        const isActive = sortField === opt.field;
        const Icon = sortDirection === "asc" ? ArrowUp : ArrowDown;
        return (
          <button
            key={opt.field}
            type="button"
            className={cn(
              "flex items-center justify-center gap-0.5 text-[0.6875rem] font-semibold tracking-[0.06em] transition-colors",
              isActive ? "text-foreground" : "text-foreground/38 hover:text-foreground",
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
            {isActive && <Icon className="h-3 w-3" />}
          </button>
        );
      })}
      {/* Spacer matching actions column */}
      <span className="w-[var(--col-actions)]" />
    </div>
  );
}
