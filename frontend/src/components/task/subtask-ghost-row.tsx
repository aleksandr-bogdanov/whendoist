import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { TaskCreate, TaskResponse } from "@/api/model";
import {
  useCreateTaskApiV1TasksPost,
  useDeleteTaskApiV1TasksTaskIdDelete,
} from "@/api/queries/tasks/tasks";
import { useCrypto } from "@/hooks/use-crypto";
import { dashboardTasksKey } from "@/lib/query-keys";
import { useUIStore } from "@/stores/ui-store";

interface SubtaskGhostRowProps {
  parentTask: TaskResponse;
  depth: number;
}

export function SubtaskGhostRow({ parentTask, depth }: SubtaskGhostRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const createTask = useCreateTaskApiV1TasksPost();
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();
  const { encryptTaskFields } = useCrypto();
  const { subtaskAddFocusId, clearSubtaskAddFocus, toggleExpandedSubtask } = useUIStore();

  const shouldAutoFocus = subtaskAddFocusId === parentTask.id;
  const hasRealSubtasks = (parentTask.subtasks?.length ?? 0) > 0;

  useEffect(() => {
    if (shouldAutoFocus) {
      setIsEditing(true);
      // Delay to let the expansion animation render the input
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        clearSubtaskAddFocus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [shouldAutoFocus, clearSubtaskAddFocus]);

  const handleCreate = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    const encrypted = await encryptTaskFields({ title: trimmed });
    const data: TaskCreate = {
      title: encrypted.title!,
      parent_id: parentTask.id,
      domain_id: parentTask.domain_id,
      impact: 4,
      clarity: "normal",
    };

    setTitle("");
    inputRef.current?.focus();

    createTask.mutate(
      { data },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({
            queryKey: dashboardTasksKey(),
          });
          toast.success(`Created subtask "${trimmed}"`, {
            id: `create-subtask-${created.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                deleteTask.mutate(
                  { taskId: created.id },
                  {
                    onSuccess: () =>
                      queryClient.invalidateQueries({
                        queryKey: dashboardTasksKey(),
                      }),
                    onError: () => toast.error("Undo failed"),
                  },
                );
              },
            },
          });
        },
        onError: () => toast.error("Failed to create subtask"),
      },
    );
  }, [
    title,
    parentTask.id,
    parentTask.domain_id,
    createTask,
    deleteTask,
    queryClient,
    encryptTaskFields,
  ]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setTitle("");
    // Collapse the expansion if parent has no real subtasks (was a temporary expand)
    if (!hasRealSubtasks) {
      toggleExpandedSubtask(parentTask.id);
    }
  }, [hasRealSubtasks, parentTask.id, toggleExpandedSubtask]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {isEditing ? (
        <div
          className="flex items-center gap-1.5 py-1.5"
          style={{ marginLeft: `${depth * 24}px`, paddingLeft: 12 }}
        >
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim()) {
                e.preventDefault();
                handleCreate();
              }
              if (e.key === "Escape") {
                handleCancel();
              }
            }}
            onBlur={() => {
              if (!title.trim()) {
                handleCancel();
              }
            }}
            placeholder="Subtask title..."
            className="flex-1 h-7 text-sm bg-transparent border-b border-border outline-none focus:border-primary px-1"
            disabled={createTask.isPending}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setIsEditing(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="flex items-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          style={{ marginLeft: `${depth * 24}px`, paddingLeft: 12 }}
        >
          <Plus className="h-3 w-3" />
          Add subtask
        </button>
      )}
    </motion.div>
  );
}
