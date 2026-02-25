import { useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { ArrowRight, Loader2, Pencil, Send, Trash2, X } from "lucide-react";
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
import { SmartInputAutocomplete } from "@/components/task/smart-input-autocomplete";
import { Kbd, MetadataPill } from "@/components/task/task-quick-add";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCrypto } from "@/hooks/use-crypto";
import { useSmartInput } from "@/hooks/use-smart-input";
import { IMPACT_COLORS, IMPACT_OPTIONS } from "@/lib/task-utils";
import { cn } from "@/lib/utils";

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

function getTodayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function getTomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
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
  const [expandedId, setExpandedId] = useState<number | null>(null);

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

  // Filter for thoughts (tasks without a domain)
  const allTasks = tasksQuery.data ?? [];
  const thoughts = allTasks.filter((t) => t.domain_id === null && t.parent_id === null);

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
      setExpandedId(null);
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

  const handleStartEdit = useCallback((thought: TaskResponse) => {
    setEditingId(thought.id);
    setEditText(thought.title);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editText.trim()) return;
    const encrypted = await encryptTaskFields({ title: editText.trim() });
    updateTask.mutate(
      {
        taskId: editingId,
        data: { title: encrypted.title ?? editText.trim() },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListTasksApiV1TasksGetQueryKey(),
          });
          setEditingId(null);
          setEditText("");
        },
        onError: () => toast.error("Failed to update thought"),
      },
    );
  }, [editingId, editText, encryptTaskFields, updateTask, queryClient]);

  const handleConvert = useCallback(
    async (
      thought: TaskResponse,
      data: {
        domain_id: number;
        title: string;
        impact?: number;
        clarity?: string;
        duration_minutes?: number;
        scheduled_date?: string | null;
        scheduled_time?: string | null;
        description?: string | null;
      },
    ) => {
      const encrypted = await encryptTaskFields({
        title: data.title,
        description: data.description?.trim() || null,
      });

      const updateData: Record<string, unknown> = {
        domain_id: data.domain_id,
        title: encrypted.title ?? data.title,
      };
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
            setExpandedId(null);
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

  const handleToggleExpand = useCallback(
    (thoughtId: number) => {
      if (editingId) return;
      setExpandedId((prev) => (prev === thoughtId ? null : thoughtId));
    },
    [editingId],
  );

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Thoughts</h1>
        <p className="text-xs text-muted-foreground">Capture ideas, then triage them into tasks</p>
      </div>

      {/* Card list */}
      <ScrollArea className="flex-1">
        <div className="mx-auto w-full max-w-2xl">
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
              <div key={thought.id} className="border-b border-border/50 overflow-hidden">
                <ThoughtCard
                  thought={thought}
                  isExpanded={expandedId === thought.id}
                  isEditing={editingId === thought.id}
                  editText={editText}
                  onEditTextChange={setEditText}
                  onToggleExpand={() => handleToggleExpand(thought.id)}
                  onStartEdit={handleStartEdit}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={() => {
                    setEditingId(null);
                    setEditText("");
                  }}
                />
                {expandedId === thought.id && !editingId && (
                  <TriagePanel
                    thought={thought}
                    domains={domains}
                    onConvert={handleConvert}
                    onDelete={handleDelete}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t px-4 py-3 pb-nav-safe md:pb-3">
        <div className="mx-auto flex max-w-2xl gap-2">
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

/* ------------------------------------------------------------------ */
/*  ThoughtCard — a single row in the inbox list                      */
/* ------------------------------------------------------------------ */

function ThoughtCard({
  thought,
  isExpanded,
  isEditing,
  editText,
  onEditTextChange,
  onToggleExpand,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: {
  thought: TaskResponse;
  isExpanded: boolean;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (text: string) => void;
  onToggleExpand: () => void;
  onStartEdit: (thought: TaskResponse) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  const timeAgo = thought.created_at ? formatTimeAgo(thought.created_at) : "";

  if (isEditing) {
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
        <Input
          value={editText}
          onChange={(e) => onEditTextChange(e.target.value)}
          className="flex-1 h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveEdit();
            if (e.key === "Escape") onCancelEdit();
          }}
          autoFocus
        />
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancelEdit}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={onSaveEdit}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: div contains nested buttons, can't use <button>
    <div
      className={cn(
        "group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
        isExpanded ? "bg-accent/30" : "hover:bg-accent/50",
      )}
      onClick={onToggleExpand}
      onKeyDown={(e) => {
        if (e.key === "Enter") onToggleExpand();
      }}
      role="button"
      tabIndex={0}
    >
      {/* Dot indicator */}
      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />

      {/* Title */}
      <p className="flex-1 min-w-0 text-sm truncate">{thought.title}</p>

      {/* Right side: timestamp + action icons */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[11px] text-muted-foreground whitespace-nowrap mr-1">{timeAgo}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStartEdit(thought);
          }}
          className="p-2 -m-1 rounded-md hover:bg-accent text-muted-foreground opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity"
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TriagePanel — smart input for converting thought to task          */
/* ------------------------------------------------------------------ */

function TriagePanel({
  thought,
  domains,
  onConvert,
  onDelete,
}: {
  thought: TaskResponse;
  domains: DomainResponse[];
  onConvert: (
    thought: TaskResponse,
    data: {
      domain_id: number;
      title: string;
      impact?: number;
      clarity?: string;
      duration_minutes?: number;
      scheduled_date?: string | null;
      scheduled_time?: string | null;
      description?: string | null;
    },
  ) => void;
  onDelete: (thought: TaskResponse) => void;
}) {
  const {
    inputRef,
    rawInput,
    parsed,
    acVisible,
    acSuggestions,
    acSelectedIndex,
    handleInputChange,
    handleAcSelect,
    handleDismissToken,
    handleKeyDown: handleAcKeyDown,
    tapToken,
    setInput,
  } = useSmartInput({ initialInput: thought.title, domains });

  const panelRef = useRef<HTMLDivElement>(null);

  // Syntax hints (shared localStorage key with Quick Add)
  const [showHints, setShowHints] = useState(
    () => localStorage.getItem("qa-hints-dismissed") !== "1",
  );

  // Focus input and scroll panel into view on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const len = rawInput.length;
      inputRef.current?.setSelectionRange(len, len);
      panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, []);

  const canConvert = parsed.domainId !== null && parsed.title.trim().length > 0;

  const handleSubmit = useCallback(() => {
    if (!canConvert || !parsed.domainId) return;
    onConvert(thought, {
      domain_id: parsed.domainId,
      title: parsed.title.trim(),
      impact: parsed.impact ?? undefined,
      clarity: parsed.clarity ?? undefined,
      duration_minutes: parsed.durationMinutes ?? undefined,
      scheduled_date: parsed.scheduledDate,
      scheduled_time: parsed.scheduledTime,
      description: parsed.description,
    });
  }, [canConvert, parsed, thought, onConvert]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (handleAcKeyDown(e)) return;
      if (e.key === "Enter" && !e.shiftKey && canConvert) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleAcKeyDown, canConvert, handleSubmit],
  );

  return (
    <div
      ref={panelRef}
      className="border-t border-border/30 px-4 pb-4 pt-3 space-y-2.5 bg-accent/10 overflow-hidden"
    >
      {/* Smart input with autocomplete */}
      <div className="relative">
        <Input
          ref={inputRef}
          value={rawInput}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Add @domain !priority tomorrow..."
          className="text-sm"
        />
        <SmartInputAutocomplete
          suggestions={acSuggestions}
          visible={acVisible}
          selectedIndex={acSelectedIndex}
          onSelect={handleAcSelect}
        />
      </div>

      {/* Metadata pills */}
      {parsed.tokens.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {parsed.tokens.map((token) => (
            <MetadataPill
              key={token.type}
              token={token}
              onDismiss={() => handleDismissToken(token)}
            />
          ))}
        </div>
      )}

      {/* Mobile tappable selectors (hidden on desktop) */}
      <div className="space-y-3 md:hidden">
        {/* Domain pills */}
        {domains.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <button
                key={d.id}
                type="button"
                className={cn(
                  "rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors",
                  parsed.domainId === d.id
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/50"
                    : "bg-secondary text-secondary-foreground active:bg-secondary/80",
                )}
                onClick={() => tapToken("@", d.name ?? "", /@\S+/)}
              >
                {d.name}
              </button>
            ))}
          </div>
        )}

        {/* Priority buttons */}
        <div className="grid grid-cols-4 gap-2">
          {IMPACT_OPTIONS.map((opt) => {
            const isActive = parsed.impact === opt.value;
            const color = IMPACT_COLORS[opt.value];
            const keyword = opt.label.split(" ")[1].toLowerCase();
            return (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "rounded-lg py-2.5 text-[13px] font-medium transition-colors",
                  isActive
                    ? "ring-2 ring-current/20"
                    : "bg-secondary text-secondary-foreground active:bg-secondary/80",
                )}
                style={isActive ? { backgroundColor: `${color}18`, color } : undefined}
                onClick={() => tapToken("!", keyword, /!(high|mid|low|min|p[1-4])\b/i)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Schedule quick picks */}
        <div className="flex gap-2">
          <button
            type="button"
            className={cn(
              "rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors",
              parsed.scheduledDate === getTodayStr()
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground active:bg-secondary/80",
            )}
            onClick={() =>
              tapToken("", "today", /\b(today|tomorrow|mon|tue|wed|thu|fri|sat|sun)\b/i)
            }
          >
            Today
          </button>
          <button
            type="button"
            className={cn(
              "rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors",
              parsed.scheduledDate === getTomorrowStr()
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground active:bg-secondary/80",
            )}
            onClick={() =>
              tapToken("", "tomorrow", /\b(today|tomorrow|mon|tue|wed|thu|fri|sat|sun)\b/i)
            }
          >
            Tomorrow
          </button>
          {parsed.scheduledDate && (
            <button
              type="button"
              className="rounded-lg px-3 py-2.5 text-[13px] text-muted-foreground active:text-foreground"
              onClick={() => {
                const cleaned = rawInput
                  .replace(/\b(today|tomorrow|mon|tue|wed|thu|fri|sat|sun)\b/i, "")
                  .replace(/\s{2,}/g, " ")
                  .trim();
                setInput(cleaned);
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Syntax hints (desktop only) */}
      {showHints && (
        <div className="hidden md:flex items-start gap-1.5">
          <p className="flex-1 text-[11px] text-muted-foreground leading-relaxed">
            <Kbd>@</Kbd> domain &nbsp;
            <Kbd>!</Kbd> priority &nbsp;
            <Kbd>?</Kbd> mode &nbsp;
            <Kbd>30m</Kbd> duration &nbsp;
            <Kbd>tomorrow</Kbd> date &nbsp;
            <Kbd>{"//"}</Kbd> notes
          </p>
          <button
            type="button"
            onClick={() => {
              setShowHints(false);
              localStorage.setItem("qa-hints-dismissed", "1");
            }}
            className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 max-md:h-10 max-md:text-[13px]"
          onClick={() => onDelete(thought)}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Delete
        </Button>

        {!parsed.domainId && parsed.title.trim() && (
          <span className="hidden md:inline text-[11px] text-muted-foreground">
            Type <Kbd>@</Kbd> to assign a domain
          </span>
        )}

        <Button
          size="sm"
          className="text-xs shrink-0 max-md:h-10 max-md:px-4 max-md:text-[13px]"
          disabled={!canConvert}
          onClick={handleSubmit}
        >
          <span className="md:hidden">Convert</span>
          <span className="hidden md:inline">Convert to Task</span>
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
