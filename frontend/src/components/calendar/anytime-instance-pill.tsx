import { useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, SkipForward, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse, InstanceResponse } from "@/api/model";
import {
  getListInstancesApiV1InstancesGetQueryKey,
  useCompleteInstanceApiV1InstancesInstanceIdCompletePost,
  useSkipInstanceApiV1InstancesInstanceIdSkipPost,
  useUncompleteInstanceApiV1InstancesInstanceIdUncompletePost,
  useUnskipInstanceApiV1InstancesInstanceIdUnskipPost,
} from "@/api/queries/instances/instances";
import { announce } from "@/components/live-announcer";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { IMPACT_COLORS } from "@/lib/task-utils";

interface AnytimeInstancePillProps {
  instance: InstanceResponse;
  parentTask?: AppRoutersTasksTaskResponse;
  onTaskClick?: (task: AppRoutersTasksTaskResponse) => void;
}

export function AnytimeInstancePill({
  instance,
  parentTask,
  onTaskClick,
}: AnytimeInstancePillProps) {
  const isCompleted = instance.status === "completed";
  const isSkipped = instance.status === "skipped";
  const isDone = isCompleted || isSkipped;
  const queryClient = useQueryClient();
  const completeInstance = useCompleteInstanceApiV1InstancesInstanceIdCompletePost();
  const uncompleteInstance = useUncompleteInstanceApiV1InstancesInstanceIdUncompletePost();
  const skipInstance = useSkipInstanceApiV1InstancesInstanceIdSkipPost();
  const unskipInstance = useUnskipInstanceApiV1InstancesInstanceIdUnskipPost();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListInstancesApiV1InstancesGetQueryKey() });

  const handleComplete = () => {
    if (isCompleted) {
      uncompleteInstance.mutate(
        { instanceId: instance.id },
        {
          onSuccess: () => {
            invalidate();
            announce("Instance reopened");
            toast.success(`Reopened "${instance.task_title}"`, {
              id: `inst-uncomplete-${instance.id}`,
            });
          },
          onError: () => toast.error("Failed to reopen instance"),
        },
      );
    } else {
      completeInstance.mutate(
        { instanceId: instance.id },
        {
          onSuccess: () => {
            invalidate();
            announce("Instance completed");
            toast.success(`Completed "${instance.task_title}"`, {
              id: `inst-complete-${instance.id}`,
            });
          },
          onError: () => toast.error("Failed to complete instance"),
        },
      );
    }
  };

  const handleSkip = () => {
    if (isSkipped) {
      unskipInstance.mutate(
        { instanceId: instance.id },
        {
          onSuccess: () => {
            invalidate();
            announce("Instance unskipped");
            toast.success(`Unskipped "${instance.task_title}"`, {
              id: `inst-unskip-${instance.id}`,
            });
          },
          onError: () => toast.error("Failed to unskip instance"),
        },
      );
    } else {
      skipInstance.mutate(
        { instanceId: instance.id },
        {
          onSuccess: () => {
            invalidate();
            announce("Instance skipped");
            toast.success(`Skipped "${instance.task_title}"`, { id: `inst-skip-${instance.id}` });
          },
          onError: () => toast.error("Failed to skip instance"),
        },
      );
    }
  };

  const impactColor = IMPACT_COLORS[instance.impact] ?? IMPACT_COLORS[4];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          className={`text-[11px] truncate rounded-full px-2 py-0.5 hover:bg-[rgba(109,94,246,0.04)] cursor-pointer max-w-[180px] flex-shrink-0 ${isDone ? "opacity-50" : ""}`}
          style={{
            borderLeft: `3px solid ${impactColor}`,
            backgroundColor: `${impactColor}1A`,
          }}
          onClick={() => parentTask && onTaskClick?.(parentTask)}
          title={instance.task_title}
        >
          <span className={isDone ? "line-through decoration-1" : ""}>↻ {instance.task_title}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[160px]">
        {parentTask && (
          <ContextMenuItem onClick={() => onTaskClick?.(parentTask)}>
            <Pencil className="h-3.5 w-3.5 mr-2" />
            Edit Series
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={handleComplete}>
          <Check className="h-3.5 w-3.5 mr-2" />
          {isCompleted ? "Uncomplete" : "Complete"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleSkip}>
          {isSkipped ? (
            <Undo2 className="h-3.5 w-3.5 mr-2" />
          ) : (
            <SkipForward className="h-3.5 w-3.5 mr-2" />
          )}
          {isSkipped ? "Unskip" : "Skip"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
