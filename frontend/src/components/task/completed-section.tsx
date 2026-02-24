import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { toast } from "sonner";
import type { TaskResponse } from "@/api/model";
import {
  getGetPreferencesApiV1PreferencesGetQueryKey,
  useGetPreferencesApiV1PreferencesGet,
  useUpdatePreferencesApiV1PreferencesPut,
} from "@/api/queries/preferences/preferences";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { TaskItem } from "./task-item";

const RETENTION_OPTIONS = [
  { days: 1, label: "1d" },
  { days: 3, label: "3d" },
  { days: 7, label: "7d" },
];

interface CompletedSectionProps {
  tasks: TaskResponse[];
  onSelectTask?: (taskId: number) => void;
  onEditTask?: (task: TaskResponse) => void;
}

export function CompletedSection({ tasks, onSelectTask, onEditTask }: CompletedSectionProps) {
  const { showCompleted, toggleShowCompleted } = useUIStore();
  const { data: preferences } = useGetPreferencesApiV1PreferencesGet();
  const updatePrefs = useUpdatePreferencesApiV1PreferencesPut();
  const queryClient = useQueryClient();

  const retentionDays = preferences?.completed_retention_days ?? 7;

  // Sort by completed_at descending, then filter by retention window
  const filtered = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => {
      const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return bTime - aTime;
    });
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    return sorted.filter((t) => t.completed_at && new Date(t.completed_at) >= cutoff);
  }, [tasks, retentionDays]);

  // Hide only when there are no completed tasks at all — never hide just because
  // the retention filter is narrow, otherwise the user can't change the filter back
  if (tasks.length === 0) return null;

  return (
    <Collapsible open={showCompleted} onOpenChange={toggleShowCompleted}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-sm font-medium",
            "rounded-md hover:bg-[rgba(109,94,246,0.04)] transition-colors",
            "border-t border-border mt-2 pt-3",
          )}
        >
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-left">Completed</span>
          <span className="text-xs text-muted-foreground tabular-nums">{filtered.length}</span>

          {/* Retention selector — inline in header */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: event isolation only */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: event isolation only */}
          <span
            className="flex items-center gap-0.5"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {RETENTION_OPTIONS.map((opt) => (
              <Button
                key={opt.days}
                variant={retentionDays === opt.days ? "default" : "outline"}
                size="sm"
                className={cn("h-5 text-[10px] px-1.5 min-w-0")}
                onClick={(e) => {
                  e.stopPropagation();
                  updatePrefs.mutate(
                    { data: { completed_retention_days: opt.days } },
                    {
                      onSuccess: () => {
                        queryClient.invalidateQueries({
                          queryKey: getGetPreferencesApiV1PreferencesGetQueryKey(),
                        });
                      },
                      onError: () => toast.error("Failed to save preference"),
                    },
                  );
                }}
              >
                {opt.label}
              </Button>
            ))}
          </span>

          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              !showCompleted && "-rotate-90",
            )}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="pt-1">
          <AnimatePresence initial={false}>
            {filtered.map((task) => (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <TaskItem task={task} onSelect={onSelectTask} onEdit={onEditTask} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
