import { CalendarClock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

export function FilterBar() {
  const { showScheduled, showCompleted, toggleShowScheduled, toggleShowCompleted } = useUIStore();

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant={showScheduled ? "secondary" : "ghost"}
        size="sm"
        className={cn("h-6 text-[11px] px-2 gap-1")}
        onClick={toggleShowScheduled}
      >
        <CalendarClock className="h-3 w-3" />
        Scheduled
      </Button>
      <Button
        variant={showCompleted ? "secondary" : "ghost"}
        size="sm"
        className={cn("h-6 text-[11px] px-2 gap-1")}
        onClick={toggleShowCompleted}
      >
        <CheckCircle2 className="h-3 w-3" />
        Completed
      </Button>
    </div>
  );
}
