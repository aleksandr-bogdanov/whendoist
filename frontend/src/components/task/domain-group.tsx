import { ChevronDown, Inbox } from "lucide-react";
import type { AppRoutersTasksTaskResponse, DomainResponse } from "@/api/model";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { TaskItem } from "./task-item";

interface DomainGroupProps {
  domain: DomainResponse | null;
  tasks: AppRoutersTasksTaskResponse[];
  onSelectTask?: (taskId: number) => void;
}

export function DomainGroup({ domain, tasks, onSelectTask }: DomainGroupProps) {
  const { expandedDomains, toggleExpandedDomain } = useUIStore();
  // Default to expanded if not in the set (first load)
  const domainKey = domain?.id ?? 0;
  const isExpanded = expandedDomains.size === 0 || expandedDomains.has(domainKey);

  const handleToggle = () => {
    toggleExpandedDomain(domainKey);
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={handleToggle}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-sm font-medium",
            "rounded-md hover:bg-accent/50 transition-colors",
          )}
        >
          {/* Domain icon/color indicator */}
          {domain ? (
            <>
              {domain.icon ? (
                <span className="text-base">{domain.icon}</span>
              ) : (
                <div
                  className="h-3 w-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: domain.color ?? "#6D5EF6" }}
                />
              )}
              <span className="flex-1 text-left truncate">{domain.name}</span>
            </>
          ) : (
            <>
              <Inbox className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left truncate">Inbox</span>
            </>
          )}

          {/* Task count */}
          <span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>

          {/* Chevron */}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              !isExpanded && "-rotate-90",
            )}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {/* Left border accent */}
        <div
          className="ml-3 border-l-2 pl-0"
          style={{ borderColor: domain?.color ?? "var(--border)" }}
        >
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} onSelect={onSelectTask} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
