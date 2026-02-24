import { useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { Loader2, Pencil, Send, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCrypto } from "@/hooks/use-crypto";

export const Route = createLazyFileRoute("/_authenticated/thoughts")({
  component: ThoughtsPage,
});

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function groupByDate(
  tasks: TaskResponse[],
): Array<{ date: string; label: string; thoughts: TaskResponse[] }> {
  const groups = new Map<string, TaskResponse[]>();
  for (const t of tasks) {
    const dateKey = t.created_at ? t.created_at.split("T")[0] : "unknown";
    const group = groups.get(dateKey);
    if (group) {
      group.push(t);
    } else {
      groups.set(dateKey, [t]);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, thoughts]) => ({ date, label: formatDateLabel(date), thoughts }));
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const rawDomains = (domainsQuery.data ?? []).filter((d: DomainResponse) => !d.is_archived);
  const [domains, setDomains] = useState<DomainResponse[]>([]);

  // Decrypt domain names for promote-to-task pills
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

  // Filter for thoughts (tasks without a domain)
  const allTasks = tasksQuery.data ?? [];
  const thoughts = allTasks.filter((t) => t.domain_id === null && t.parent_id === null);

  // Decrypt thoughts — depend on a stable fingerprint to avoid infinite re-decrypt loops
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

  // Group thoughts by date
  const dateGroups = useMemo(() => groupByDate(decryptedTasks), [decryptedTasks]);

  // Auto-scroll to bottom when new thought added
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on count change only
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [decryptedTasks.length]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const encrypted = await encryptTaskFields({ title: trimmed });
    setInput("");

    createTask.mutate(
      { data: { title: encrypted.title ?? trimmed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
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
      deleteTask.mutate(
        { taskId: thought.id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
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

  const handleStartEdit = useCallback((thought: TaskResponse) => {
    setEditingId(thought.id);
    setEditText(thought.title);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editText.trim()) return;
    const encrypted = await encryptTaskFields({ title: editText.trim() });
    updateTask.mutate(
      { taskId: editingId, data: { title: encrypted.title ?? editText.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
          setEditingId(null);
          setEditText("");
        },
        onError: () => toast.error("Failed to update thought"),
      },
    );
  }, [editingId, editText, encryptTaskFields, updateTask, queryClient]);

  const handlePromote = useCallback(
    async (thought: TaskResponse, domainId: number) => {
      updateTask.mutate(
        { taskId: thought.id, data: { domain_id: domainId } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
            toast.success("Promoted to task");
          },
          onError: () => toast.error("Failed to promote thought"),
        },
      );
    },
    [updateTask, queryClient],
  );

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Thoughts</h1>
        <p className="text-xs text-muted-foreground">Quick capture — tasks without a domain</p>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="mx-auto max-w-xl space-y-4">
          {tasksQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : decryptedTasks.length === 0 ? (
            <EmptyState
              illustration="/illustrations/empty-thoughts.svg"
              illustrationClassName="animate-[emptyStateEntrance_0.4s_ease-out,thoughtsGlow_3s_ease-in-out_0.4s_infinite]"
              title="No thoughts yet"
              description="Type below to capture your first thought"
            />
          ) : (
            dateGroups.map((group) => (
              <div key={group.date}>
                <div className="flex items-center gap-2 py-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] font-medium text-muted-foreground px-2">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-3">
                  {group.thoughts.map((thought) => (
                    <ThoughtBubble
                      key={thought.id}
                      thought={thought}
                      isEditing={editingId === thought.id}
                      editText={editText}
                      onEditTextChange={setEditText}
                      onStartEdit={handleStartEdit}
                      onSaveEdit={handleSaveEdit}
                      onCancelEdit={() => {
                        setEditingId(null);
                        setEditText("");
                      }}
                      onDelete={handleDelete}
                      onPromote={handlePromote}
                      domains={domains}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t px-4 py-3 pb-nav-safe md:pb-3">
        <div className="mx-auto flex max-w-xl gap-2">
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
          <Button size="icon" onClick={handleSend} disabled={!input.trim() || createTask.isPending}>
            {createTask.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ThoughtBubble({
  thought,
  isEditing,
  editText,
  onEditTextChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onPromote,
  domains,
}: {
  thought: TaskResponse;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (text: string) => void;
  onStartEdit: (thought: TaskResponse) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (thought: TaskResponse) => void;
  onPromote: (thought: TaskResponse, domainId: number) => void;
  domains: DomainResponse[];
}) {
  const [showActions, setShowActions] = useState(false);
  const timestamp = thought.created_at
    ? new Date(thought.created_at).toLocaleString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  if (isEditing) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary/80 px-4 py-2 space-y-2">
          <Input
            value={editText}
            onChange={(e) => onEditTextChange(e.target.value)}
            className="bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            autoFocus
          />
          <div className="flex gap-1 justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs text-primary-foreground/70"
              onClick={onCancelEdit}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs text-primary-foreground font-medium"
              onClick={onSaveEdit}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end group">
      <div className="max-w-[80%] space-y-1">
        <button
          type="button"
          className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-primary-foreground cursor-pointer text-left w-full"
          onClick={() => setShowActions((s) => !s)}
        >
          <p className="text-sm">{thought.title}</p>
          {timestamp && <p className="mt-1 text-[10px] opacity-60">{timestamp}</p>}
        </button>

        {/* Action buttons — shown on click */}
        {showActions && (
          <div className="flex items-center gap-1 justify-end px-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartEdit(thought);
                setShowActions(false);
              }}
              className="p-1 rounded hover:bg-accent text-muted-foreground"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(thought);
                setShowActions(false);
              }}
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            {/* Promote to task — domain pills */}
            {domains.length > 0 && (
              <div className="flex items-center gap-0.5 ml-1 border-l pl-1">
                {domains.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPromote(thought, d.id);
                      setShowActions(false);
                    }}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 text-white"
                    style={{ backgroundColor: d.color ?? "#6D5EF6" }}
                    title={`Move to ${d.name}`}
                  >
                    {d.icon || d.name.slice(0, 3)}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowActions(false);
              }}
              className="p-1 rounded hover:bg-accent text-muted-foreground ml-1"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
