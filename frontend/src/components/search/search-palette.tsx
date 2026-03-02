import { useNavigate } from "@tanstack/react-router";
import Fuse, { type FuseResultMatch, type IFuseOptions } from "fuse.js";
import { AlertTriangle, CalendarCheck, Lightbulb, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { useListDomainsApiV1DomainsGet } from "@/api/queries/domains/domains";
import { useListTasksApiV1TasksGet } from "@/api/queries/tasks/tasks";
import { PaletteTaskActions } from "@/components/search/palette-task-actions";
import { MetadataPill } from "@/components/task/task-quick-add";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useCrypto } from "@/hooks/use-crypto";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useTaskCreate } from "@/hooks/use-task-create";
import { type SearchResult, useTaskSearch } from "@/hooks/use-task-search";
import {
  COMMAND_CATEGORIES,
  type PaletteCommand,
  usePaletteCommands,
} from "@/lib/palette-commands";
import { DASHBOARD_TASKS_PARAMS } from "@/lib/query-keys";
import { parseTaskInput } from "@/lib/task-parser";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CommandSearchResult {
  command: PaletteCommand;
  matches: readonly FuseResultMatch[] | undefined;
}

type PaletteItem =
  | { type: "task"; result: SearchResult }
  | { type: "command"; result: CommandSearchResult }
  | { type: "create-task" }
  | { type: "create-thought" }
  | {
      type: "stat";
      label: string;
      count: number;
      to: string;
      icon: React.ComponentType<{ className?: string }>;
    };

/* ------------------------------------------------------------------ */
/*  Command Fuse options                                               */
/* ------------------------------------------------------------------ */

const commandFuseOptions: IFuseOptions<PaletteCommand> = {
  keys: [
    { name: "label", weight: 0.7 },
    { name: "keywords", weight: 0.3 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  includeMatches: true,
  minMatchCharLength: 1,
};

/* ------------------------------------------------------------------ */
/*  Highlight helper — wraps matched chars in <mark>                   */
/* ------------------------------------------------------------------ */

function HighlightedText({
  text,
  indices,
}: {
  text: string;
  indices?: ReadonlyArray<readonly [number, number]>;
}) {
  if (!indices?.length) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  for (const [start, end] of indices) {
    if (start > lastEnd) {
      parts.push(text.slice(lastEnd, start));
    }
    parts.push(
      <mark key={start} className="bg-yellow-200/40 dark:bg-yellow-500/30 text-inherit rounded-sm">
        {text.slice(start, end + 1)}
      </mark>,
    );
    lastEnd = end + 1;
  }
  if (lastEnd < text.length) {
    parts.push(text.slice(lastEnd));
  }
  return <>{parts}</>;
}

/* ------------------------------------------------------------------ */
/*  Domain badge — emoji or color dot + name                           */
/* ------------------------------------------------------------------ */

function DomainBadge({ domain }: { domain: DomainResponse }) {
  return (
    <span className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground">
      {domain.icon ? (
        <span className="text-xs">{domain.icon}</span>
      ) : (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: domain.color ?? "#6D5EF6" }}
        />
      )}
      <span className="truncate max-w-[100px]">{domain.name}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Shortcut badge (Superhuman training pattern)                       */
/* ------------------------------------------------------------------ */

function ShortcutBadge({ shortcut }: { shortcut: string }) {
  return (
    <kbd className="ml-auto shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground">
      {shortcut}
    </kbd>
  );
}

/* ------------------------------------------------------------------ */
/*  SearchPalette                                                      */
/* ------------------------------------------------------------------ */

export function SearchPalette() {
  const searchOpen = useUIStore((s) => s.searchOpen);
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);
  const selectTask = useUIStore((s) => s.selectTask);
  const setSearchNavigateId = useUIStore((s) => s.setSearchNavigateId);
  const pushPaletteRecent = useUIStore((s) => s.pushPaletteRecent);
  const paletteRecents = useUIStore((s) => s.paletteRecents);
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [drilldownResult, setDrilldownResult] = useState<SearchResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /* ---- Detect command mode ---- */
  const isCommandMode = query.startsWith(">");
  const searchQuery = isCommandMode ? query.slice(1).trimStart() : query.trim();

  /* ---- Commands ---- */
  const commands = usePaletteCommands();
  const commandFuse = useMemo(() => new Fuse(commands, commandFuseOptions), [commands]);

  const commandResults: CommandSearchResult[] = useMemo(() => {
    if (!searchQuery) {
      // In command mode with empty query after ">", show all commands
      if (isCommandMode) {
        return commands.map((c) => ({ command: c, matches: undefined }));
      }
      return [];
    }
    return commandFuse.search(searchQuery, { limit: 15 }).map((r) => ({
      command: r.item,
      matches: r.matches ?? undefined,
    }));
  }, [searchQuery, isCommandMode, commandFuse, commands]);

  /* ---- Data: piggyback on dashboard TQ cache ---- */
  const { data: rawTasks } = useListTasksApiV1TasksGet(DASHBOARD_TASKS_PARAMS);
  const { data: rawDomains } = useListDomainsApiV1DomainsGet();
  const { decryptTasks, decryptDomains } = useCrypto();

  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [domains, setDomains] = useState<DomainResponse[]>([]);

  // Decrypt tasks
  const tasksFingerprint = useMemo(
    () => (rawTasks ?? []).map((t) => `${t.id}:${t.title?.slice(0, 8)}`).join(","),
    [rawTasks],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: fingerprint tracks changes
  useEffect(() => {
    let cancelled = false;
    decryptTasks(rawTasks ?? []).then((result) => {
      if (!cancelled) setTasks(result);
    });
    return () => {
      cancelled = true;
    };
  }, [tasksFingerprint, decryptTasks]);

  // Decrypt domains
  const domainsFingerprint = useMemo(
    () => (rawDomains ?? []).map((d) => `${d.id}:${d.name?.slice(0, 8)}`).join(","),
    [rawDomains],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: fingerprint tracks changes
  useEffect(() => {
    let cancelled = false;
    decryptDomains(rawDomains ?? []).then((result) => {
      if (!cancelled) setDomains(result);
    });
    return () => {
      cancelled = true;
    };
  }, [domainsFingerprint, decryptDomains]);

  /* ---- Task creation ---- */
  const { create, isPending: isCreating } = useTaskCreate();

  /* ---- Fuzzy task search ---- */
  const { search } = useTaskSearch(tasks, domains);
  const taskResults = useMemo(
    () => (searchQuery && !isCommandMode ? search(searchQuery) : []),
    [searchQuery, isCommandMode, search],
  );

  /* ---- Parse query for creation fallthrough ---- */
  const parsed = useMemo(
    () => (searchQuery && !isCommandMode ? parseTaskInput(searchQuery, domains) : null),
    [searchQuery, isCommandMode, domains],
  );
  const showCreate = !!parsed?.title.trim();

  /* ---- Empty-state data: recents + "Right Now" ---- */
  const domainMap = useMemo(() => new Map(domains.map((d) => [d.id, d])), [domains]);

  const recentResults: SearchResult[] = useMemo(() => {
    if (searchQuery || isCommandMode) return [];
    return paletteRecents
      .map((id) => {
        const task = tasks.find((t) => t.id === id);
        if (!task) return null;
        const domain = task.domain_id ? domainMap.get(task.domain_id) : undefined;
        return {
          task,
          domain: domain ?? undefined,
          isThought: task.domain_id === null,
          matches: undefined,
        } as SearchResult;
      })
      .filter((r): r is SearchResult => r !== null);
  }, [searchQuery, isCommandMode, paletteRecents, tasks, domainMap]);

  const rightNowStats = useMemo(() => {
    if (searchQuery || isCommandMode) return [];
    const today = new Date().toISOString().split("T")[0];
    const todayCount = tasks.filter(
      (t) => t.scheduled_date === today && t.status !== "completed",
    ).length;
    const overdueCount = tasks.filter(
      (t) => t.status !== "completed" && t.scheduled_date !== null && t.scheduled_date < today,
    ).length;
    const thoughtCount = tasks.filter(
      (t) => t.domain_id === null && t.parent_id === null && t.status !== "completed",
    ).length;

    const stats: PaletteItem[] = [];
    if (todayCount > 0)
      stats.push({
        type: "stat",
        label: `${todayCount} task${todayCount === 1 ? "" : "s"} today`,
        count: todayCount,
        to: "/dashboard",
        icon: CalendarCheck,
      });
    if (overdueCount > 0)
      stats.push({
        type: "stat",
        label: `${overdueCount} overdue`,
        count: overdueCount,
        to: "/dashboard",
        icon: AlertTriangle,
      });
    if (thoughtCount > 0)
      stats.push({
        type: "stat",
        label: `${thoughtCount} thought${thoughtCount === 1 ? "" : "s"}`,
        count: thoughtCount,
        to: "/thoughts",
        icon: Lightbulb,
      });
    return stats;
  }, [searchQuery, isCommandMode, tasks]);

  // Group task results: Tasks (pending/scheduled), Thoughts, Completed
  const grouped = useMemo(() => {
    const taskGroup: SearchResult[] = [];
    const thoughtGroup: SearchResult[] = [];
    const completedGroup: SearchResult[] = [];

    for (const r of taskResults) {
      if (r.task.status === "completed") {
        completedGroup.push(r);
      } else if (r.isThought) {
        thoughtGroup.push(r);
      } else {
        taskGroup.push(r);
      }
    }
    return { taskGroup, thoughtGroup, completedGroup };
  }, [taskResults]);

  /* ---- Build flat item list for keyboard navigation ---- */
  const isEmptyState = !searchQuery && !isCommandMode;

  const flatItems: PaletteItem[] = useMemo(() => {
    if (isCommandMode) {
      // Command mode: only commands, grouped by category
      const items: PaletteItem[] = [];
      for (const cat of COMMAND_CATEGORIES) {
        for (const r of commandResults) {
          if (r.command.category === cat) {
            items.push({ type: "command", result: r });
          }
        }
      }
      return items;
    }

    if (isEmptyState) {
      // Empty state: recents + right now stats
      const items: PaletteItem[] = [];
      for (const r of recentResults) items.push({ type: "task", result: r });
      for (const s of rightNowStats) items.push(s);
      return items;
    }

    // Search mode: tasks first, then commands as "Actions", then create
    const items: PaletteItem[] = [];
    for (const r of grouped.taskGroup) items.push({ type: "task", result: r });
    for (const r of grouped.thoughtGroup) items.push({ type: "task", result: r });
    for (const r of grouped.completedGroup) items.push({ type: "task", result: r });
    for (const r of commandResults) items.push({ type: "command", result: r });
    if (showCreate) {
      items.push({ type: "create-task" });
      items.push({ type: "create-thought" });
    }
    return items;
  }, [
    isCommandMode,
    isEmptyState,
    commandResults,
    grouped,
    showCreate,
    recentResults,
    rightNowStats,
  ]);

  /* ---- Reset on open/close ---- */
  useEffect(() => {
    if (searchOpen) {
      setQuery("");
      setSelectedIndex(0);
      setDrilldownResult(null);
    }
  }, [searchOpen]);

  /* ---- Keyboard shortcuts (Cmd+K + /) ---- */
  const searchOpenRef = useRef(searchOpen);
  searchOpenRef.current = searchOpen;

  useShortcuts(
    useMemo(
      () => [
        {
          key: "k",
          meta: true,
          displayKey: "\u2318K",
          description: "Search / commands",
          category: "Navigation",
          excludeInputs: false,
          handler: () => setSearchOpen(!searchOpenRef.current),
        },
        {
          key: "/",
          description: "Search tasks",
          category: "Navigation",
          excludeInputs: true,
          showInHelp: false,
          handler: () => setSearchOpen(true),
        },
      ],
      [setSearchOpen],
    ),
  );

  /* ---- Select a task ---- */
  const handleSelectTask = useCallback(
    (result: SearchResult) => {
      pushPaletteRecent(result.task.id);
      setSearchOpen(false);
      setQuery("");

      if (result.isThought) {
        setSearchNavigateId(result.task.id);
        navigate({ to: "/thoughts" });
      } else {
        selectTask(result.task.id);
        navigate({ to: "/dashboard" });
        setTimeout(() => {
          document
            .querySelector(`[data-task-id="${result.task.id}"]`)
            ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }, 150);
      }
    },
    [setSearchOpen, selectTask, setSearchNavigateId, pushPaletteRecent, navigate],
  );

  /* ---- Execute a command ---- */
  const handleSelectCommand = useCallback(
    (cmd: PaletteCommand) => {
      setSearchOpen(false);
      setQuery("");
      cmd.handler();
    },
    [setSearchOpen],
  );

  /* ---- Create task / thought from palette ---- */
  const handleCreate = useCallback(
    (asThought: boolean) => {
      if (!parsed?.title.trim() || isCreating) return;
      setSearchOpen(false);
      setQuery("");
      create({
        title: parsed.title.trim(),
        description: parsed.description,
        domain_id: asThought ? null : parsed.domainId,
        impact: parsed.impact ?? undefined,
        clarity: parsed.clarity ?? undefined,
        duration_minutes: parsed.durationMinutes,
        scheduled_date: asThought ? null : parsed.scheduledDate,
        scheduled_time: asThought ? null : parsed.scheduledTime,
      });
    },
    [parsed, isCreating, setSearchOpen, create],
  );

  /* ---- Navigate to a stat route ---- */
  const handleSelectStat = useCallback(
    (to: string) => {
      setSearchOpen(false);
      setQuery("");
      navigate({ to });
    },
    [setSearchOpen, navigate],
  );

  /* ---- Unified select ---- */
  const handleSelectItem = useCallback(
    (item: PaletteItem) => {
      if (item.type === "task") {
        handleSelectTask(item.result);
      } else if (item.type === "command") {
        handleSelectCommand(item.result.command);
      } else if (item.type === "create-task") {
        handleCreate(false);
      } else if (item.type === "create-thought") {
        handleCreate(true);
      } else if (item.type === "stat") {
        handleSelectStat(item.to);
      }
    },
    [handleSelectTask, handleSelectCommand, handleCreate, handleSelectStat],
  );

  /* ---- Drilldown: enter task actions ---- */
  const handleDrilldownEnter = useCallback(
    (result: SearchResult) => {
      pushPaletteRecent(result.task.id);
      setDrilldownResult(result);
    },
    [pushPaletteRecent],
  );

  const handleDrilldownBack = useCallback(() => {
    setDrilldownResult(null);
    // Refocus the search input after returning
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleDrilldownClose = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
    setDrilldownResult(null);
  }, [setSearchOpen]);

  /* ---- Keyboard navigation inside palette ---- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (
        (e.key === "ArrowRight" || e.key === "Tab") &&
        flatItems[selectedIndex]?.type === "task"
      ) {
        // → or Tab on a task item = open action drilldown
        e.preventDefault();
        handleDrilldownEnter(
          (flatItems[selectedIndex] as { type: "task"; result: SearchResult }).result,
        );
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && showCreate) {
        // Cmd+Enter = capture thought (global shortcut within palette)
        e.preventDefault();
        handleCreate(true);
      } else if (e.key === "Enter" && flatItems[selectedIndex]) {
        e.preventDefault();
        handleSelectItem(flatItems[selectedIndex]);
      }
    },
    [flatItems, selectedIndex, handleSelectItem, handleDrilldownEnter, showCreate, handleCreate],
  );

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-search-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Reset selection when query changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: query drives reset intentionally
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  /* ---- Render helpers ---- */
  let flatIndex = -1;

  function renderTaskSection(label: string, items: SearchResult[]) {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="px-3 pt-3 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </div>
        {items.map((result) => {
          flatIndex++;
          const idx = flatIndex;
          const titleMatch = result.matches?.find((m) => m.key === "title");
          return (
            <button
              type="button"
              key={result.task.id}
              data-search-index={idx}
              className={cn(
                "w-full px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2 text-left",
                "hover:bg-accent/50",
                idx === selectedIndex && "bg-accent",
              )}
              onClick={() => handleSelectTask(result)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <span className="flex-1 min-w-0 truncate">
                <HighlightedText
                  text={result.task.title}
                  indices={titleMatch?.indices as [number, number][] | undefined}
                />
              </span>
              {result.domain && <DomainBadge domain={result.domain} />}
            </button>
          );
        })}
      </div>
    );
  }

  function renderCommandSection(label: string, items: CommandSearchResult[]) {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="px-3 pt-3 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </div>
        {items.map((r) => {
          flatIndex++;
          const idx = flatIndex;
          const labelMatch = r.matches?.find((m) => m.key === "label");
          const Icon = r.command.icon;
          return (
            <button
              type="button"
              key={r.command.id}
              data-search-index={idx}
              className={cn(
                "w-full px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2 text-left",
                "hover:bg-accent/50",
                idx === selectedIndex && "bg-accent",
              )}
              onClick={() => handleSelectCommand(r.command)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="flex-1 min-w-0 truncate">
                <HighlightedText
                  text={r.command.label}
                  indices={labelMatch?.indices as [number, number][] | undefined}
                />
              </span>
              {r.command.shortcut && <ShortcutBadge shortcut={r.command.shortcut} />}
            </button>
          );
        })}
      </div>
    );
  }

  function renderStatSection(label: string, items: PaletteItem[]) {
    const stats = items.filter(
      (i): i is Extract<PaletteItem, { type: "stat" }> => i.type === "stat",
    );
    if (stats.length === 0) return null;
    return (
      <div>
        <div className="px-3 pt-3 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </div>
        {stats.map((stat) => {
          flatIndex++;
          const idx = flatIndex;
          const Icon = stat.icon;
          return (
            <button
              type="button"
              key={stat.label}
              data-search-index={idx}
              className={cn(
                "w-full px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2 text-left",
                "hover:bg-accent/50",
                idx === selectedIndex && "bg-accent",
              )}
              onClick={() => handleSelectStat(stat.to)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 min-w-0 truncate">{stat.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  /* ---- Group commands by category ---- */
  function renderCommandsByCategory(results: CommandSearchResult[]) {
    return COMMAND_CATEGORIES.map((cat) => {
      const items = results.filter((r) => r.command.category === cat);
      return <span key={cat}>{renderCommandSection(cat, items)}</span>;
    });
  }

  /* ---- Render create section ---- */
  function renderCreateSection() {
    if (!showCreate || !parsed) return null;
    const mac = navigator.platform?.includes("Mac");
    const createTaskIdx = flatItems.findIndex((i) => i.type === "create-task");
    const createThoughtIdx = flatItems.findIndex((i) => i.type === "create-thought");
    return (
      <div>
        <div className="px-3 pt-3 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Create
        </div>
        {/* Create task */}
        <button
          type="button"
          data-search-index={createTaskIdx}
          className={cn(
            "w-full px-3 py-2 text-sm cursor-pointer transition-colors text-left",
            "hover:bg-accent/50",
            createTaskIdx === selectedIndex && "bg-accent",
          )}
          onClick={() => handleCreate(false)}
          onMouseEnter={() => setSelectedIndex(createTaskIdx)}
        >
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 min-w-0 truncate">
              Create task &ldquo;{parsed.title.trim()}&rdquo;
            </span>
            <kbd className="ml-auto shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground">
              &crarr;
            </kbd>
          </div>
          {parsed.tokens.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5 ml-6">
              {parsed.tokens.map((token) => (
                <MetadataPill key={token.type} token={token} />
              ))}
            </div>
          )}
        </button>
        {/* Capture thought */}
        <button
          type="button"
          data-search-index={createThoughtIdx}
          className={cn(
            "w-full px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2 text-left",
            "hover:bg-accent/50",
            createThoughtIdx === selectedIndex && "bg-accent",
          )}
          onClick={() => handleCreate(true)}
          onMouseEnter={() => setSelectedIndex(createThoughtIdx)}
        >
          <Lightbulb className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 min-w-0 truncate">
            Capture thought &ldquo;{parsed.title.trim()}&rdquo;
          </span>
          <kbd className="ml-auto shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground">
            {mac ? "\u2318" : "Ctrl+"}↵
          </kbd>
        </button>
      </div>
    );
  }

  /* ---- Determine empty state ---- */
  const hasCommandResults = commandResults.length > 0;
  const hasAnyResults = flatItems.length > 0;
  const showNoResults = !!searchQuery && !hasAnyResults;

  /* ---- Check if any task items exist in flatItems (for footer hint) ---- */
  const hasTaskItems = flatItems.some((i) => i.type === "task");

  return (
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[15%] translate-y-0 p-0 gap-0 sm:max-w-lg"
        aria-label="Search tasks and commands"
      >
        {drilldownResult ? (
          /* ---- Task action drilldown ---- */
          <PaletteTaskActions
            task={drilldownResult.task}
            domain={drilldownResult.domain}
            domains={domains}
            onBack={handleDrilldownBack}
            onClose={handleDrilldownClose}
          />
        ) : (
          <>
            {/* Search input */}
            <div className="flex items-center gap-2 px-3 border-b">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search or type > for commands..."
                className="flex-1 h-11 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                autoFocus
              />
              <kbd className="hidden sm:inline-flex items-center justify-center h-5 px-1.5 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground">
                {navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl+"}K
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
              {showNoResults ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {isCommandMode ? "No commands found" : "No results found"}
                </div>
              ) : isEmptyState ? (
                /* Empty state: recents + right now */
                hasAnyResults ? (
                  <>
                    {renderTaskSection("Recent", recentResults)}
                    {renderStatSection("Right now", rightNowStats)}
                  </>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Type to search tasks or <kbd className="font-mono">&gt;</kbd> for commands
                  </div>
                )
              ) : isCommandMode ? (
                /* Command mode: commands grouped by category */
                renderCommandsByCategory(commandResults)
              ) : (
                /* Search mode: tasks + commands + create fallthrough */
                <>
                  {renderTaskSection("Tasks", grouped.taskGroup)}
                  {renderTaskSection("Thoughts", grouped.thoughtGroup)}
                  {renderTaskSection("Completed", grouped.completedGroup)}
                  {hasCommandResults &&
                    searchQuery &&
                    renderCommandSection("Actions", commandResults)}
                  {renderCreateSection()}
                </>
              )}
            </div>

            {/* Footer hint */}
            {hasAnyResults && (
              <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground flex items-center gap-3">
                <span>
                  <kbd className="font-mono">&uarr;&darr;</kbd> navigate
                </span>
                <span>
                  <kbd className="font-mono">&crarr;</kbd> {isCommandMode ? "run" : "open"}
                </span>
                {hasTaskItems && !isCommandMode && (
                  <span>
                    <kbd className="font-mono">tab</kbd> actions
                  </span>
                )}
                {showCreate && !isCommandMode && !isEmptyState && (
                  <span>
                    <kbd className="font-mono">
                      {navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl+"}↵
                    </kbd>{" "}
                    thought
                  </span>
                )}
                <span>
                  <kbd className="font-mono">esc</kbd> close
                </span>
                {!isCommandMode && (
                  <span className="ml-auto">
                    <kbd className="font-mono">&gt;</kbd> commands
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
