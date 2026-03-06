import { useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { Loader2, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { TaskInspector } from "@/components/task/task-inspector";
import { TaskSwipeRow } from "@/components/task/task-swipe-row";
import { ThoughtTriageDrawer } from "@/components/task/thought-triage-drawer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useCrypto } from "@/hooks/use-crypto";
import { useShortcuts } from "@/hooks/use-shortcuts";
import type { ConvertData } from "@/hooks/use-triage-form";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

export const Route = createLazyFileRoute("/_authenticated/thoughts")({
  component: ThoughtsPage,
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

/** Matches Tailwind md: breakpoint for JS-level desktop checks. */
const MD_QUERY = "(min-width: 768px)";

/* ------------------------------------------------------------------ */
/*  ThoughtsPage                                                       */
/* ------------------------------------------------------------------ */

function ThoughtsPage() {
  const { t } = useTranslation();
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

  // Desktop: inspector selection (selectedId drives right-pane content)
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Mobile: drawer selection (drawerThought drives Vaul bottom sheet)
  const [drawerThought, setDrawerThought] = useState<TaskResponse | null>(null);

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

  // Decrypt parent tasks (for triage drawer/inspector parent selector)
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

  // Visible IDs for keyboard navigation
  const visibleIds = useMemo(() => sortedThoughts.map((t) => t.id), [sortedThoughts]);

  // Derive the selected thought object for the inspector
  const selectedThought = useMemo(
    () => (selectedId ? (sortedThoughts.find((t) => t.id === selectedId) ?? null) : null),
    [selectedId, sortedThoughts],
  );

  // Clear selection if the selected thought disappears (e.g. converted)
  useEffect(() => {
    if (selectedId && !sortedThoughts.some((t) => t.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, sortedThoughts]);

  /* ---------------------------------------------------------------- */
  /*  Handlers                                                         */
  /* ---------------------------------------------------------------- */

  const pushPaletteRecent = useUIStore((s) => s.pushPaletteRecent);

  const handleThoughtTap = useCallback(
    (thought: TaskResponse) => {
      pushPaletteRecent(thought.id);
      if (window.matchMedia(MD_QUERY).matches) {
        // Desktop: populate inspector
        setSelectedId(thought.id);
      } else {
        // Mobile: open drawer
        setDrawerThought(thought);
      }
    },
    [pushPaletteRecent],
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
          toast.error(t("thoughts.failedToSave"));
          setInput(trimmed);
        },
      },
    );
  };

  const handleDelete = useCallback(
    (thought: TaskResponse) => {
      // Advance selection to next thought before deleting
      const idx = visibleIds.indexOf(thought.id);
      const nextId = visibleIds[idx + 1] ?? visibleIds[idx - 1] ?? null;

      setSelectedId((prev) => (prev === thought.id ? nextId : prev));
      setDrawerThought(null);

      deleteTask.mutate(
        { taskId: thought.id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getListTasksApiV1TasksGetQueryKey(),
            });
            toast.success(t("thoughts.deleted", { title: thought.title }), {
              action: {
                label: t("toast.undo"),
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
          onError: () => toast.error(t("thoughts.failedToDelete")),
        },
      );
    },
    [deleteTask, restoreTask, queryClient, visibleIds, t],
  );

  const handleConvert = useCallback(
    async (thought: TaskResponse, data: ConvertData) => {
      // Auto-advance to next thought after converting
      const idx = visibleIds.indexOf(thought.id);
      const nextId = visibleIds[idx + 1] ?? visibleIds[idx - 1] ?? null;

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
      if (data.clarity !== undefined) updateData.clarity = data.clarity;
      if (data.duration_minutes) updateData.duration_minutes = data.duration_minutes;
      if (data.scheduled_date) updateData.scheduled_date = data.scheduled_date;
      if (data.scheduled_time) updateData.scheduled_time = data.scheduled_time;
      if (encrypted.description) updateData.description = encrypted.description;
      if (data.is_recurring) updateData.is_recurring = data.is_recurring;
      if (data.recurrence_rule) updateData.recurrence_rule = data.recurrence_rule;
      if (data.recurrence_start) updateData.recurrence_start = data.recurrence_start;

      const domainName = domains.find((d) => d.id === data.domain_id)?.name ?? "domain";

      updateTask.mutate(
        { taskId: thought.id, data: updateData },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getListTasksApiV1TasksGetQueryKey(),
            });
            setSelectedId(nextId);
            setDrawerThought(null);
            toast.success(t("thoughts.movedToDomain", { domain: domainName }), {
              action: {
                label: t("toast.undo"),
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
          onError: () => toast.error(t("thoughts.failedToConvert")),
        },
      );
    },
    [updateTask, queryClient, domains, encryptTaskFields, visibleIds, t],
  );

  /* ---------------------------------------------------------------- */
  /*  Keyboard navigation                                              */
  /* ---------------------------------------------------------------- */

  const stateRef = useRef({ selectedId, visibleIds, sortedThoughts });
  useEffect(() => {
    stateRef.current = { selectedId, visibleIds, sortedThoughts };
  });

  useShortcuts(
    useMemo(
      () => [
        {
          key: "j",
          description: t("thoughts.shortcut.next"),
          category: "Navigation",
          excludeInputs: true,
          handler: () => {
            const { visibleIds: ids, selectedId: sel } = stateRef.current;
            if (ids.length === 0) return;
            if (sel === null) {
              setSelectedId(ids[0]);
              return;
            }
            const idx = ids.indexOf(sel);
            if (idx < ids.length - 1) setSelectedId(ids[idx + 1]);
          },
        },
        {
          key: "k",
          description: t("thoughts.shortcut.prev"),
          category: "Navigation",
          excludeInputs: true,
          handler: () => {
            const { visibleIds: ids, selectedId: sel } = stateRef.current;
            if (ids.length === 0) return;
            if (sel === null) {
              setSelectedId(ids[ids.length - 1]);
              return;
            }
            const idx = ids.indexOf(sel);
            if (idx > 0) setSelectedId(ids[idx - 1]);
          },
        },
        {
          key: "Escape",
          description: t("thoughts.shortcut.deselect"),
          category: "Navigation",
          excludeInputs: false,
          handler: () => setSelectedId(null),
        },
        {
          key: "d",
          description: t("thoughts.shortcut.delete"),
          category: "Actions",
          excludeInputs: true,
          handler: () => {
            const { selectedId: sel, sortedThoughts: thoughts } = stateRef.current;
            if (sel === null) return;
            const thought = thoughts.find((t) => t.id === sel);
            if (thought) handleDelete(thought);
          },
        },
        {
          key: "Backspace",
          description: t("thoughts.shortcut.delete"),
          category: "Actions",
          excludeInputs: true,
          showInHelp: false,
          handler: () => {
            const { selectedId: sel, sortedThoughts: thoughts } = stateRef.current;
            if (sel === null) return;
            const thought = thoughts.find((t) => t.id === sel);
            if (thought) handleDelete(thought);
          },
        },
      ],
      [handleDelete, t],
    ),
  );

  // Auto-scroll selected thought into view
  useEffect(() => {
    if (!selectedId) return;
    document
      .querySelector(`[data-thought-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  // Bridge: search palette navigates here with a one-shot ID
  const searchNavigateId = useUIStore((s) => s.searchNavigateId);
  const clearSearchNavigateId = useUIStore((s) => s.setSearchNavigateId);
  useEffect(() => {
    if (searchNavigateId) {
      setSelectedId(searchNavigateId);
      clearSearchNavigateId(null);
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-thought-id="${searchNavigateId}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
  }, [searchNavigateId, clearSearchNavigateId]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Split pane: list (left) + inspector (right on desktop) */}
      <div className="flex flex-1 min-h-0 md:gap-0">
        {/* Left pane — thought list + capture input */}
        <div className="flex flex-col flex-1 md:flex-[3] min-w-0 min-h-0">
          {/* Content area — relative container for floating input + fade */}
          <div className="relative flex-1 min-h-0 flex flex-col">
            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 flex flex-col">
              {/* Mobile: Glassy sticky header */}
              <div className="sticky top-0 z-20 px-4 py-3 backdrop-blur-3xl backdrop-saturate-200 bg-white/25 dark:bg-[rgba(30,41,59,0.20)] border-b border-white/15 dark:border-white/[0.06] md:hidden">
                <h1 className="text-xl font-bold">{t("thoughts.title")}</h1>
                <p className="text-xs text-muted-foreground">{t("thoughts.subtitle")}</p>
              </div>

              {/* Desktop: Simple heading */}
              <div className="hidden md:block px-5 pt-4 pb-2">
                <h1 className="text-lg font-semibold">{t("thoughts.title")}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("thoughts.subtitleDesktop")}
                </p>
              </div>

              {/* List wrapper */}
              <div className="mx-auto w-full max-w-2xl md:max-w-none flex-1">
                {tasksQuery.isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : sortedThoughts.length === 0 ? (
                  <EmptyState
                    illustration="/illustrations/empty-thoughts.svg"
                    illustrationClassName="h-28 w-28 animate-[emptyStateEntrance_0.4s_ease-out,thoughtsGlow_3s_ease-in-out_0.4s_infinite]"
                    className="py-16"
                    title={t("thoughts.noThoughts")}
                    description={t("thoughts.noThoughtsDesc")}
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
                        <ThoughtCard
                          thought={thought}
                          isSelected={selectedId === thought.id}
                          onTap={() => handleThoughtTap(thought)}
                          onDelete={() => handleDelete(thought)}
                        />
                      </div>
                    </TaskSwipeRow>
                  ))
                )}
              </div>

              {/* Sticky input — iOS-native inspired: subtle background, thin border, no heavy glass */}
              <div className="keyboard-avoid-bottom sticky bottom-[calc(env(safe-area-inset-bottom,0px)+var(--nav-pill-mb)+var(--nav-pill-height)+0.5rem)] z-10 px-4 shrink-0 md:bottom-0 md:border-t md:bg-background md:py-3 md:px-5">
                <div className="mx-auto flex max-w-2xl md:max-w-none items-center gap-1.5 rounded-xl bg-secondary/80 dark:bg-secondary/60 backdrop-blur-md p-1.5 ring-1 ring-border/50 dark:ring-border/30 md:rounded-lg md:bg-transparent md:p-0 md:ring-0 md:backdrop-blur-none">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={t("thoughts.placeholder")}
                    className="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:border-0 h-10 text-[15px]"
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
                    variant="ghost"
                    className="shrink-0 h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
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

              {/* Scroll clearance (mobile only) */}
              <div className="keyboard-avoid-clearance h-[calc(env(safe-area-inset-bottom,0px)+var(--nav-pill-mb)+var(--nav-pill-height)+1rem)] shrink-0 md:hidden" />
            </div>

            {/* Bottom fade (mobile only) */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background/50 via-background/15 via-60% to-transparent md:hidden" />
          </div>
        </div>

        {/* Right pane — inspector (desktop only) */}
        <div className="hidden md:flex md:flex-[2] flex-col min-w-0 min-h-0 border-l border-border">
          <TaskInspector
            thought={selectedThought}
            domains={domains}
            parentTasks={decryptedParentTasks}
            onConvert={handleConvert}
            onDelete={handleDelete}
            onClose={() => setSelectedId(null)}
          />
        </div>
      </div>

      {/* Mobile triage drawer */}
      <ThoughtTriageDrawer
        thought={drawerThought}
        domains={domains}
        parentTasks={decryptedParentTasks}
        onConvert={handleConvert}
        onDelete={handleDelete}
        onOpenChange={(open) => {
          if (!open) setDrawerThought(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ThoughtCard — a single row in the inbox list                       */
/* ------------------------------------------------------------------ */

function ThoughtCard({
  thought,
  isSelected,
  onTap,
  onDelete,
}: {
  thought: TaskResponse;
  isSelected: boolean;
  onTap: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const timeAgo = thought.created_at ? formatTimeAgo(thought.created_at) : "";

  return (
    // biome-ignore lint/a11y/useSemanticElements: div wraps interactive children
    <div
      data-thought-id={thought.id}
      data-selected={isSelected || undefined}
      className={cn(
        "group flex items-center gap-3 px-4 md:px-5 py-3 cursor-pointer transition-colors",
        "hover:bg-accent/50",
        isSelected && "bg-accent",
      )}
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === "Enter") onTap();
      }}
      role="button"
      tabIndex={0}
    >
      {/* Selection indicator bar — desktop only */}
      <div
        className={cn(
          "hidden md:block w-0.5 h-5 rounded-full shrink-0 transition-colors",
          isSelected ? "bg-primary" : "bg-transparent",
        )}
      />

      {/* Title */}
      <p className="flex-1 min-w-0 text-sm truncate">{thought.title}</p>

      {/* Timestamp + hover trash — both use opacity to avoid layout shift */}
      <div className="relative flex items-center shrink-0">
        <span className="text-[11px] text-muted-foreground/60 whitespace-nowrap transition-opacity md:group-hover:opacity-0">
          {timeAgo}
        </span>
        <div className="hidden md:flex items-center absolute inset-0 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            className="p-1 rounded-md hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
            title={t("common.delete")}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
