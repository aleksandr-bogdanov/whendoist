import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { useListDomainsApiV1DomainsGet } from "@/api/queries/domains/domains";
import { useListTasksApiV1TasksGet } from "@/api/queries/tasks/tasks";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useCrypto } from "@/hooks/use-crypto";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { type SearchResult, useTaskSearch } from "@/hooks/use-task-search";
import { DASHBOARD_TASKS_PARAMS } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

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
/*  SearchPalette                                                      */
/* ------------------------------------------------------------------ */

export function SearchPalette() {
  const searchOpen = useUIStore((s) => s.searchOpen);
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);
  const selectTask = useUIStore((s) => s.selectTask);
  const setSearchNavigateId = useUIStore((s) => s.setSearchNavigateId);
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  /* ---- Fuzzy search ---- */
  const { search } = useTaskSearch(tasks, domains);
  const results = useMemo(() => (query.trim() ? search(query) : []), [query, search]);

  // Group results: Tasks (pending/scheduled with domain), Thoughts (no domain), Completed
  const grouped = useMemo(() => {
    const taskGroup: SearchResult[] = [];
    const thoughtGroup: SearchResult[] = [];
    const completedGroup: SearchResult[] = [];

    for (const r of results) {
      if (r.task.status === "completed") {
        completedGroup.push(r);
      } else if (r.isThought) {
        thoughtGroup.push(r);
      } else {
        taskGroup.push(r);
      }
    }
    return { taskGroup, thoughtGroup, completedGroup };
  }, [results]);

  // Flat list for keyboard navigation
  const flatResults = useMemo(
    () => [...grouped.taskGroup, ...grouped.thoughtGroup, ...grouped.completedGroup],
    [grouped],
  );

  /* ---- Reset on open/close ---- */
  useEffect(() => {
    if (searchOpen) {
      setQuery("");
      setSelectedIndex(0);
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
          description: "Search tasks",
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

  /* ---- Navigation: select result ---- */
  const handleSelect = useCallback(
    (result: SearchResult) => {
      setSearchOpen(false);
      setQuery("");

      if (result.isThought) {
        // Thought: navigate to thoughts page, bridge via store
        setSearchNavigateId(result.task.id);
        navigate({ to: "/thoughts" });
      } else {
        // Domain task: navigate to dashboard and select
        selectTask(result.task.id);
        navigate({ to: "/dashboard" });
        setTimeout(() => {
          document
            .querySelector(`[data-task-id="${result.task.id}"]`)
            ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }, 150);
      }
    },
    [setSearchOpen, selectTask, setSearchNavigateId, navigate],
  );

  /* ---- Keyboard navigation inside palette ---- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && flatResults[selectedIndex]) {
        e.preventDefault();
        handleSelect(flatResults[selectedIndex]);
      }
    },
    [flatResults, selectedIndex, handleSelect],
  );

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-search-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Reset selection when query changes (not just when results ref changes)
  // biome-ignore lint/correctness/useExhaustiveDependencies: query drives reset intentionally
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  /* ---- Render ---- */
  let flatIndex = -1;

  function renderSection(label: string, items: SearchResult[]) {
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
              onClick={() => handleSelect(result)}
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

  return (
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[15%] translate-y-0 p-0 gap-0 sm:max-w-lg"
        aria-label="Search tasks"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 border-b">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks..."
            className="flex-1 h-11 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex items-center justify-center h-5 px-1.5 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground">
            {navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl+"}K
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {query.trim() && flatResults.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No tasks found</div>
          ) : (
            <>
              {renderSection("Tasks", grouped.taskGroup)}
              {renderSection("Thoughts", grouped.thoughtGroup)}
              {renderSection("Completed", grouped.completedGroup)}
            </>
          )}
        </div>

        {/* Footer hint */}
        {flatResults.length > 0 && (
          <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground flex items-center gap-3">
            <span>
              <kbd className="font-mono">&uarr;&darr;</kbd> navigate
            </span>
            <span>
              <kbd className="font-mono">&crarr;</kbd> open
            </span>
            <span>
              <kbd className="font-mono">esc</kbd> close
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
