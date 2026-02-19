import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

export function FilterBar() {
  const { showScheduled, showCompleted, toggleShowScheduled, toggleShowCompleted } = useUIStore();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={cn(
          "text-[0.6875rem] font-semibold tracking-[0.06em] transition-colors uppercase",
          showScheduled ? "text-foreground" : "text-foreground/38 hover:text-foreground",
        )}
        onClick={toggleShowScheduled}
      >
        SCHEDULED
      </button>
      <button
        type="button"
        className={cn(
          "text-[0.6875rem] font-semibold tracking-[0.06em] transition-colors uppercase",
          showCompleted ? "text-foreground" : "text-foreground/38 hover:text-foreground",
        )}
        onClick={toggleShowCompleted}
      >
        COMPLETED
      </button>
    </div>
  );
}
