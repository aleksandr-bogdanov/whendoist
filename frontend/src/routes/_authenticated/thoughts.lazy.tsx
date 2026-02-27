import { useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { ChevronDown, Loader2, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { useListDomainsApiV1DomainsGet } from "@/api/queries/domains/domains";
import {
  getListTasksApiV1TasksGetQueryKey,
  useCreateTaskApiV1TasksPost,
  useDeleteTaskApiV1TasksTaskIdDelete,
  useListTasksApiV1TasksGet,
  useRestoreTaskApiV1TasksTaskIdRestorePost,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { TaskSwipeRow } from "@/components/task/task-swipe-row";
import { type ConvertData, ThoughtTriageDrawer } from "@/components/task/thought-triage-drawer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useCrypto } from "@/hooks/use-crypto";

export const Route = createLazyFileRoute("/_authenticated/thoughts")({
  component: ThoughtsPage,
});

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function ThoughtsPage() {
  const tasksQuery = useListTasksApiV1TasksGet();
  const createTask = useCreateTaskApiV1TasksPost();
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();
  const restoreTask = useRestoreTaskApiV1TasksTaskIdRestorePost();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();
  const domainsQuery = useListDomainsApiV1DomainsGet();
  const queryClient = useQueryClient();
  const { decryptTasks, encryptTaskFields, decryptDomains } = useCrypto();

  const [input, setInput] = useState("");
  const [decryptedTasks, setDecryptedTasks] = useState<TaskResponse[]>([]);
  const [selectedThought, setSelectedThought] = useState<TaskResponse | null>(null);

  const rawDomains = (domainsQuery.data ?? []).filter((d: DomainResponse) => !d.is_archived);
  const [domains, setDomains] = useState<DomainResponse[]>([]);

  // Decrypt domain names for triage panel
  const domainsFingerprint = useMemo(
    () => rawDomains.map((d) => `${d.id}:${d.name?.slice(0, 8)}`).join(","),
    [rawDomains],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: fingerprint tracks changes
  useEffect(() => {
    let cancelled = false;
    decryptDomains(rawDomains).then((result) => {
      if (!cancelled) setDomains(result);
    });
    return () => {
      cancelled = true;
    };
  }, [domainsFingerprint, decryptDomains]);

  // Filter for thoughts (tasks without a domain) and potential parent tasks
  const allTasks = tasksQuery.data ?? [];
  const thoughts = allTasks.filter((t) => t.domain_id === null && t.parent_id === null);
  const rawParentTasks = useMemo(
    () => allTasks.filter((t) => t.domain_id !== null && t.parent_id === null && !t.is_recurring),
    [allTasks],
  );

  // Decrypt thoughts
  const thoughtsKey = useMemo(
    () => thoughts.map((t) => `${t.id}:${t.title?.slice(0, 8)}`).join(","),
    [thoughts],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: thoughtsKey is a stable fingerprint
  useEffect(() => {
    let cancelled = false;
    decryptTasks(thoughts).then((result) => {
      if (!cancelled) setDecryptedTasks(result);
    });
    return () => {
      cancelled = true;
    };
  }, [thoughtsKey, decryptTasks]);

  // Decrypt parent tasks (for triage drawer parent selector)
  const [decryptedParentTasks, setDecryptedParentTasks] = useState<TaskResponse[]>([]);
  const parentTasksKey = useMemo(
    () => rawParentTasks.map((t) => `${t.id}:${t.title?.slice(0, 8)}`).join(","),
    [rawParentTasks],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: parentTasksKey is a stable fingerprint
  useEffect(() => {
    let cancelled = false;
    decryptTasks(rawParentTasks).then((result) => {
      if (!cancelled) setDecryptedParentTasks(result);
    });
    return () => {
      cancelled = true;
    };
  }, [parentTasksKey, decryptTasks]);

  // Sort newest first
  const sortedThoughts = useMemo(
    () =>
      [...decryptedTasks].sort((a, b) => {
        const aTime = a.created_at ?? "";
        const bTime = b.created_at ?? "";
        return bTime.localeCompare(aTime);
      }),
    [decryptedTasks],
  );

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const encrypted = await encryptTaskFields({ title: trimmed });
    setInput("");

    createTask.mutate(
      { data: { title: encrypted.title ?? trimmed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListTasksApiV1TasksGetQueryKey(),
          });
        },
        onError: () => {
          toast.error("Failed to save thought");
          setInput(trimmed);
        },
      },
    );
  };

  const handleDelete = useCallback(
    (thought: TaskResponse) => {
      setSelectedThought(null);
      deleteTask.mutate(
        { taskId: thought.id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getListTasksApiV1TasksGetQueryKey(),
            });
            toast.success(`Deleted "${thought.title}"`, {
              action: {
                label: "Undo",
                onClick: () => {
                  restoreTask.mutate(
                    { taskId: thought.id },
                    {
                      onSuccess: () => {
                        queryClient.invalidateQueries({
                          queryKey: getListTasksApiV1TasksGetQueryKey(),
                        });
                      },
                    },
                  );
                },
              },
            });
          },
          onError: () => toast.error("Failed to delete thought"),
        },
      );
    },
    [deleteTask, restoreTask, queryClient],
  );

  const handleConvert = useCallback(
    async (thought: TaskResponse, data: ConvertData) => {
      const encrypted = await encryptTaskFields({
        title: data.title,
        description: data.description?.trim() || null,
      });

      const updateData: Record<string, unknown> = {
        domain_id: data.domain_id,
        title: encrypted.title ?? data.title,
      };
      if (data.parent_id != null) updateData.parent_id = data.parent_id;
      if (data.impact !== undefined) updateData.impact = data.impact;
      if (data.clarity) updateData.clarity = data.clarity;
      if (data.duration_minutes) updateData.duration_minutes = data.duration_minutes;
      if (data.scheduled_date) updateData.scheduled_date = data.scheduled_date;
      if (data.scheduled_time) updateData.scheduled_time = data.scheduled_time;
      if (encrypted.description) updateData.description = encrypted.description;

      const domainName = domains.find((d) => d.id === data.domain_id)?.name ?? "domain";

      updateTask.mutate(
        { taskId: thought.id, data: updateData },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getListTasksApiV1TasksGetQueryKey(),
            });
            setSelectedThought(null);
            toast.success(`Moved to ${domainName}`, {
              action: {
                label: "Undo",
                onClick: () => {
                  updateTask.mutate(
                    {
                      taskId: thought.id,
                      data: { domain_id: null as unknown as number },
                    },
                    {
                      onSuccess: () => {
                        queryClient.invalidateQueries({
                          queryKey: getListTasksApiV1TasksGetQueryKey(),
                        });
                      },
                    },
                  );
                },
              },
            });
          },
          onError: () => toast.error("Failed to convert thought"),
        },
      );
    },
    [updateTask, queryClient, domains, encryptTaskFields],
  );

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Content area — relative container for floating input + fade */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        {/* Scrollable list — extends behind floating input on mobile */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Glassy sticky header — content scrolls behind it */}
          <div className="sticky top-0 z-20 px-4 py-3 backdrop-blur-3xl backdrop-saturate-200 bg-white/25 dark:bg-[rgba(30,41,59,0.20)] border-b border-white/15 dark:border-white/[0.06]">
            <h1 className="text-lg font-semibold">Thoughts</h1>
            <p className="text-xs text-muted-foreground">
              Capture ideas, then triage them into tasks
            </p>
          </div>
          <div className="mx-auto w-full max-w-2xl pb-52 md:pb-4">
            {tasksQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : sortedThoughts.length === 0 ? (
              <EmptyState
                illustration="/illustrations/empty-thoughts.svg"
                illustrationClassName="animate-[emptyStateEntrance_0.4s_ease-out,thoughtsGlow_3s_ease-in-out_0.4s_infinite]"
                title="No thoughts yet"
                description="Type below to capture your first thought"
              />
            ) : (
              sortedThoughts.map((thought) => (
                <TaskSwipeRow
                  key={thought.id}
                  onSwipeLeft={() => handleDelete(thought)}
                  leftIcon={Trash2}
                  leftColor="red"
                >
                  <div className="border-b border-border/50">
                    <ThoughtCard thought={thought} onTap={() => setSelectedThought(thought)} />
                  </div>
                </TaskSwipeRow>
              ))
            )}
          </div>
        </div>

        {/* Bottom fade — mimics infinite canvas, Apple glass style (mobile only) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-96 bg-gradient-to-t from-background/50 via-background/15 via-60% to-transparent md:hidden" />

        {/* Floating input — above bottom nav on mobile, static with border on desktop */}
        <div className="absolute z-10 inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+var(--nav-pill-mb)+var(--nav-pill-height)+0.5rem)] px-4 md:static md:bottom-auto md:z-auto md:border-t md:py-3">
          <div className="mx-auto flex max-w-2xl gap-2 rounded-2xl bg-background p-2 shadow-lg ring-1 ring-border/40 md:rounded-none md:bg-transparent md:p-0 md:shadow-none md:ring-0">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What's on your mind?"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={createTask.isPending}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || createTask.isPending}
            >
              {createTask.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Triage drawer */}
      <ThoughtTriageDrawer
        thought={selectedThought}
        domains={domains}
        parentTasks={decryptedParentTasks}
        onConvert={handleConvert}
        onDelete={handleDelete}
        onOpenChange={(open) => {
          if (!open) setSelectedThought(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ThoughtCard — a single row in the inbox list                       */
/* ------------------------------------------------------------------ */

function ThoughtCard({ thought, onTap }: { thought: TaskResponse; onTap: () => void }) {
  const timeAgo = thought.created_at ? formatTimeAgo(thought.created_at) : "";

  return (
    // biome-ignore lint/a11y/useSemanticElements: div contains nested buttons, can't use <button>
    <div
      className="group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-accent/50"
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === "Enter") onTap();
      }}
      role="button"
      tabIndex={0}
    >
      {/* Dot indicator */}
      <div className="h-1.5 w-1.5 rounded-full bg-primary/50 shrink-0" />

      {/* Title */}
      <p className="flex-1 min-w-0 text-sm truncate">{thought.title}</p>

      {/* Timestamp */}
      <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
        {timeAgo}
      </span>

      {/* Expand affordance */}
      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 transition-colors group-hover:text-muted-foreground" />
    </div>
  );
}
