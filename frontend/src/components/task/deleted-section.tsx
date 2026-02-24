import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, RotateCcw, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import type { TaskResponse } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  useRestoreTaskApiV1TasksTaskIdRestorePost,
} from "@/api/queries/tasks/tasks";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { axios } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const DELETED_LIMIT = 15;

async function fetchArchivedWithCount(limit?: number) {
  const params: Record<string, unknown> = { status: "archived" };
  if (limit) params.limit = limit;
  const response = await axios.get<TaskResponse[]>("/api/v1/tasks", { params });
  return {
    tasks: response.data,
    totalCount: Number(response.headers["x-total-count"]) || response.data.length,
  };
}

export function DeletedSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const restoreTask = useRestoreTaskApiV1TasksTaskIdRestorePost();
  const queryClient = useQueryClient();

  const limit = showAll ? undefined : DELETED_LIMIT;
  const { data } = useQuery({
    queryKey: ["/api/v1/tasks", { status: "archived", limit }],
    queryFn: () => fetchArchivedWithCount(limit),
    enabled: isOpen,
  });

  const tasks = data?.tasks ?? [];
  const totalCount = data?.totalCount ?? 0;
  const hasMore = totalCount > tasks.length;

  const handleRestore = (taskId: number, title: string) => {
    restoreTask.mutate(
      { taskId },
      {
        onSuccess: () => {
          // Broad invalidation: refresh dashboard + archived queries
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
          // Also invalidate our custom archived query
          queryClient.invalidateQueries({ queryKey: ["/api/v1/tasks", { status: "archived" }] });
          toast.success(`Restored "${title}"`, { id: `restore-${taskId}` });
        },
        onError: () => toast.error("Failed to restore task", { id: `restore-err-${taskId}` }),
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
            "rounded-md hover:bg-[rgba(109,94,246,0.04)] transition-colors",
            "border-t border-border mt-2 pt-3",
          )}
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-left">Deleted</span>
          {isOpen && totalCount > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {hasMore ? `${tasks.length} of ${totalCount}` : totalCount}
            </span>
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
            <>
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
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-[rgba(109,94,246,0.03)]">
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
              {hasMore && (
                <button
                  type="button"
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2 transition-colors"
                  onClick={() => setShowAll(true)}
                >
                  Show all {totalCount} deleted &rarr;
                </button>
              )}
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
