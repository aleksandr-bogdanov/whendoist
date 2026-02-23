import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse, TaskCreate } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  useCreateTaskApiV1TasksPost,
  useDeleteTaskApiV1TasksTaskIdDelete,
} from "@/api/queries/tasks/tasks";
import { useCrypto } from "@/hooks/use-crypto";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

interface SubtaskGhostRowProps {
  parentTask: AppRoutersTasksTaskResponse;
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
  const { subtaskAddFocusId, clearSubtaskAddFocus } = useUIStore();

  const shouldAutoFocus = subtaskAddFocusId === parentTask.id;

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
            queryKey: getListTasksApiV1TasksGetQueryKey(),
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
                        queryKey: getListTasksApiV1TasksGetQueryKey(),
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

  const handleCancel = () => {
    setIsEditing(false);
    setTitle("");
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {isEditing ? (
        <div
          className="flex items-center gap-2 py-1"
          style={{
            marginLeft: `${depth * 24}px`,
            paddingLeft: 8,
            borderLeftWidth: 3,
            borderLeftStyle: "dashed",
            borderLeftColor: "var(--border)",
          }}
        >
          <Plus className="h-[15px] w-[15px] flex-shrink-0 text-muted-foreground/40" />
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
            className="flex-1 h-7 text-sm bg-transparent border-none outline-none px-1"
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
          className={cn(
            "flex items-center gap-2 py-1 w-full transition-colors",
            "text-muted-foreground/40 hover:text-muted-foreground/60",
          )}
          style={{
            marginLeft: `${depth * 24}px`,
            paddingLeft: 8,
            borderLeftWidth: 3,
            borderLeftStyle: "dashed",
            borderLeftColor: "color-mix(in srgb, var(--border) 30%, transparent)",
          }}
        >
          <Plus className="h-[15px] w-[15px] flex-shrink-0" />
          <span className="text-sm">Add subtask...</span>
        </button>
      )}
    </motion.div>
  );
}
