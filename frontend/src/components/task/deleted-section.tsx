import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, RotateCcw, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  useListTasksApiV1TasksGet,
  useRestoreTaskApiV1TasksTaskIdRestorePost,
} from "@/api/queries/tasks/tasks";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function DeletedSection() {
  const [isOpen, setIsOpen] = useState(false);
  const { data: archivedTasks } = useListTasksApiV1TasksGet(
    { status: "archived" },
    { query: { enabled: isOpen } },
  );
  const restoreTask = useRestoreTaskApiV1TasksTaskIdRestorePost();
  const queryClient = useQueryClient();

  const tasks = (archivedTasks ?? []) as AppRoutersTasksTaskResponse[];

  const handleRestore = (taskId: number, title: string) => {
    restoreTask.mutate(
      { taskId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
          toast.success(`Restored "${title}"`);
        },
        onError: () => toast.error("Failed to restore task"),
      },
    );
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-sm font-medium",
            "rounded-md hover:bg-accent/50 transition-colors",
            "border-t border-border mt-2 pt-3",
          )}
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-left">Deleted</span>
          {tasks.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              !isOpen && "-rotate-90",
            )}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="pt-1">
          {tasks.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No deleted tasks</p>
          ) : (
            <AnimatePresence initial={false}>
              {tasks.map((task) => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-accent/30">
                    <span className="text-sm text-muted-foreground line-through truncate flex-1">
                      {task.title}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs gap-1"
                      onClick={() => handleRestore(task.id, task.title)}
                      disabled={restoreTask.isPending}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
