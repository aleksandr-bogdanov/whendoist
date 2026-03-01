/**
 * useTaskCreate — shared encrypt → create → toast + undo → invalidate.
 *
 * Centralizes the boilerplate that was duplicated across TaskQuickAdd,
 * DomainGroup inline add, and SubtaskGhostRow.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import type { TaskCreate, TaskResponse } from "@/api/model";
import {
  useCreateTaskApiV1TasksPost,
  useDeleteTaskApiV1TasksTaskIdDelete,
} from "@/api/queries/tasks/tasks";
import { useCrypto } from "@/hooks/use-crypto";
import { dashboardTasksKey } from "@/lib/query-keys";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

/** Plaintext task data — title/description will be encrypted automatically. */
export interface CreateTaskInput {
  title: string;
  description?: string | null;
  domain_id?: number | null;
  parent_id?: number | null;
  impact?: number;
  clarity?: string;
  duration_minutes?: number | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  is_recurring?: boolean;
  recurrence_rule?: TaskCreate["recurrence_rule"];
  recurrence_start?: string | null;
  recurrence_end?: string | null;
}

/** Per-call options to customise toast / post-creation behavior. */
export interface CreateTaskCallOptions {
  /** Override toast success message (default: `Created "{title}"`) */
  toastMessage?: string;
  /** Called after successful creation */
  onSuccess?: (created: TaskResponse) => void;
  /** Called after creation fails */
  onError?: () => void;
  /** Custom error message (default: "Failed to create task") */
  errorMessage?: string;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useTaskCreate(): {
  create: (input: CreateTaskInput, options?: CreateTaskCallOptions) => Promise<void>;
  isPending: boolean;
} {
  const queryClient = useQueryClient();
  const { encryptTaskFields } = useCrypto();
  const createMutation = useCreateTaskApiV1TasksPost();
  const deleteMutation = useDeleteTaskApiV1TasksTaskIdDelete();

  const create = useCallback(
    async (input: CreateTaskInput, options?: CreateTaskCallOptions) => {
      const encrypted = await encryptTaskFields({
        title: input.title,
        description: input.description?.trim() || null,
      });

      const data: TaskCreate = {
        title: encrypted.title!,
        description: encrypted.description,
        domain_id: input.domain_id ?? null,
        parent_id: input.parent_id,
        impact: input.impact ?? 4,
        clarity: input.clarity ?? "normal",
        duration_minutes: input.duration_minutes,
        scheduled_date: input.scheduled_date,
        scheduled_time: input.scheduled_time,
        is_recurring: input.is_recurring,
        recurrence_rule: input.recurrence_rule,
        recurrence_start: input.recurrence_start,
        recurrence_end: input.recurrence_end,
      };

      createMutation.mutate(
        { data },
        {
          onSuccess: (created) => {
            queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });

            const label = options?.toastMessage ?? `Created "${input.title}"`;
            toast.success(label, {
              id: `create-${created.id}`,
              action: {
                label: "Undo",
                onClick: () => {
                  deleteMutation.mutate(
                    { taskId: created.id },
                    {
                      onSuccess: () =>
                        queryClient.invalidateQueries({ queryKey: dashboardTasksKey() }),
                      onError: () => toast.error("Undo failed"),
                    },
                  );
                },
              },
            });

            options?.onSuccess?.(created);
          },
          onError: () => {
            toast.error(options?.errorMessage ?? "Failed to create task");
            options?.onError?.();
          },
        },
      );
    },
    [createMutation, deleteMutation, queryClient, encryptTaskFields],
  );

  return { create, isPending: createMutation.isPending };
}
