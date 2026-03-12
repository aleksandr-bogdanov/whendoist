/**
 * ParentTaskDropdown — unified two-level parent task picker.
 *
 * Used by all surfaces that need parent task selection:
 * - Desktop dropdown (ParentTaskSelect / ParentTaskPicker)
 * - Mobile drawer (ParentPickerDrawer / CreateParentPickerDrawer)
 * - Smart input ^ autocomplete
 *
 * Level 1: Domain chips (horizontal, scrollable)
 * Level 2: Task list filtered to selected domain
 */

import { Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { cn } from "@/lib/utils";

export interface ParentTaskDropdownProps {
  parentTasks: TaskResponse[];
  domains: DomainResponse[];
  /** Pre-select this domain tab (e.g. the task's current domain). */
  currentDomainId?: number | null;
  /** External search string (for ^ inline mode). When provided, the built-in search input is hidden. */
  externalSearch?: string;
  /** Currently selected parent task ID (for highlight). */
  selectedId: number | null;
  /** Task ID to exclude from the list (can't be its own parent). */
  excludeTaskId?: number;
  onSelect: (taskId: number | null) => void;
  /** Whether to show the built-in search input (true for dropdown mode, false for inline ^ mode). */
  showSearch?: boolean;
  /** Additional class name for the container. */
  className?: string;
}

export function ParentTaskDropdown({
  parentTasks,
  domains,
  currentDomainId,
  externalSearch,
  selectedId,
  excludeTaskId,
  onSelect,
  showSearch = true,
  className,
}: ParentTaskDropdownProps) {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);

  // Internal search (used in dropdown mode)
  const [internalSearch, setInternalSearch] = useState("");
  const search = externalSearch ?? internalSearch;

  // Domain tab state — default to currentDomainId, or first domain with tasks
  const [selectedDomainId, setSelectedDomainId] = useState<number | "all" | null>(() => {
    if (currentDomainId != null) return currentDomainId;
    return "all";
  });

  // Sync domain selection when currentDomainId changes externally
  useEffect(() => {
    if (currentDomainId != null) setSelectedDomainId(currentDomainId);
  }, [currentDomainId]);

  // Active (non-archived) domains sorted by position
  const activeDomains = useMemo(
    () => [...domains].filter((d) => !d.is_archived).sort((a, b) => a.position - b.position),
    [domains],
  );

  // Eligible tasks: exclude self, apply text search
  const eligible = useMemo(() => {
    const q = search.toLowerCase().trim();
    return parentTasks
      .filter((t) => (excludeTaskId != null ? t.id !== excludeTaskId : true))
      .filter((t) => !q || t.title.toLowerCase().includes(q));
  }, [parentTasks, excludeTaskId, search]);

  // Count tasks per domain (for showing counts on chips)
  const countByDomain = useMemo(() => {
    const counts = new Map<number | null, number>();
    for (const t of eligible) {
      const did = t.domain_id ?? null;
      counts.set(did, (counts.get(did) ?? 0) + 1);
    }
    return counts;
  }, [eligible]);

  // Domains that actually have tasks
  const domainsWithTasks = useMemo(
    () => activeDomains.filter((d) => (countByDomain.get(d.id) ?? 0) > 0),
    [activeDomains, countByDomain],
  );

  // If selected domain has no tasks, fall back to "all"
  const effectiveDomainId = useMemo(() => {
    if (selectedDomainId === "all") return "all";
    if (selectedDomainId != null && (countByDomain.get(selectedDomainId) ?? 0) > 0)
      return selectedDomainId;
    return "all";
  }, [selectedDomainId, countByDomain]);

  // Filtered tasks for the selected domain
  const filteredTasks = useMemo(() => {
    let tasks =
      effectiveDomainId === "all"
        ? eligible
        : eligible.filter((t) => t.domain_id === effectiveDomainId);

    // Sort: parents (tasks with subtasks) first, then alphabetical
    tasks = [...tasks].sort((a, b) => {
      const aParent = (a.subtasks?.length ?? 0) > 0;
      const bParent = (b.subtasks?.length ?? 0) > 0;
      if (aParent !== bParent) return aParent ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

    return tasks;
  }, [eligible, effectiveDomainId]);

  // Auto-focus search when the component mounts (dropdown mode)
  useEffect(() => {
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 0);
  }, [showSearch]);

  // Show domain chips only when there are multiple domains with tasks AND no active search
  const showDomainChips = domainsWithTasks.length > 1 && !search;

  // Keyboard navigation: activeIndex tracks the focused item
  // -1 = "None (top-level)", 0..N = filtered tasks
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // Reset activeIndex when filtered list changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on list/domain/search change, not on setActiveIndex
  useEffect(() => {
    setActiveIndex(-1);
  }, [filteredTasks, effectiveDomainId, search]);

  // Build flat list: [null (top-level), ...filteredTask ids]
  const flatItems = useMemo(() => {
    const items: Array<number | null> = [null];
    for (const t of filteredTasks) items.push(t.id);
    return items;
  }, [filteredTasks]);

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < flatItems.length) {
          onSelect(flatItems[activeIndex]);
        }
      }
    },
    [activeIndex, flatItems, onSelect],
  );

  // Scroll active item into view
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const activeEl = listRef.current.querySelector("[data-active='true']");
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: fieldset adds unwanted border styling
    <div role="group" className={cn("flex flex-col", className)} onKeyDown={handleListKeyDown}>
      {/* Domain chips */}
      {showDomainChips && (
        <div
          className="flex gap-1 px-3 py-2 overflow-x-auto scrollbar-hide border-b"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={effectiveDomainId === "all"}
            className={cn(
              "shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              effectiveDomainId === "all"
                ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/30"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setSelectedDomainId("all")}
          >
            {t("task.allDomains")}
          </button>
          {domainsWithTasks.map((d) => (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={effectiveDomainId === d.id}
              className={cn(
                "shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                effectiveDomainId === d.id
                  ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/30"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setSelectedDomainId(d.id)}
            >
              {d.icon && <span>{d.icon}</span>} {d.name}
            </button>
          ))}
        </div>
      )}

      {/* Search input (dropdown mode only) */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={searchRef}
            value={internalSearch}
            onChange={(e) => setInternalSearch(e.target.value)}
            placeholder={t("task.searchTasks")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {internalSearch && (
            <button
              type="button"
              onClick={() => setInternalSearch("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Task list */}
      <div ref={listRef} className="max-h-60 overflow-y-auto py-1" role="listbox">
        {/* None (top-level) */}
        <button
          type="button"
          role="option"
          aria-selected={selectedId === null}
          data-active={activeIndex === 0}
          className={cn(
            "w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors cursor-pointer",
            selectedId === null && "bg-accent font-medium",
            activeIndex === 0 && "ring-2 ring-inset ring-primary/50",
          )}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(null)}
        >
          {t("task.field.noneTopLevel")}
        </button>

        {filteredTasks.length > 0 && <div className="h-px bg-border mx-2 my-1" />}

        {/* Show domain group headers when viewing "all" and not searching */}
        {effectiveDomainId === "all" && !search
          ? renderGrouped(filteredTasks, domains, selectedId, onSelect, activeIndex, flatItems)
          : filteredTasks.map((task) => {
              const itemIdx = flatItems.indexOf(task.id);
              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  domains={domains}
                  isSelected={selectedId === task.id}
                  isActive={activeIndex === itemIdx}
                  showDomainIcon={effectiveDomainId === "all"}
                  onSelect={onSelect}
                />
              );
            })}

        {filteredTasks.length === 0 && search && (
          <div className="px-3 py-2 text-sm text-muted-foreground">{t("task.noMatchingTasks")}</div>
        )}
      </div>
    </div>
  );
}

/** Render tasks grouped by domain with headers (for "all" tab without search). */
function renderGrouped(
  tasks: TaskResponse[],
  domains: DomainResponse[],
  selectedId: number | null,
  onSelect: (taskId: number | null) => void,
  activeIndex: number,
  flatItems: Array<number | null>,
) {
  const domainMap = new Map(domains.map((d) => [d.id, d]));
  const groups = new Map<number | null, TaskResponse[]>();
  for (const t of tasks) {
    const did = t.domain_id ?? null;
    const arr = groups.get(did);
    if (arr) arr.push(t);
    else groups.set(did, [t]);
  }

  // Sort groups by domain position
  const sortedEntries = [...groups.entries()].sort(([aId], [bId]) => {
    const aPos = (aId != null ? domainMap.get(aId)?.position : null) ?? 999;
    const bPos = (bId != null ? domainMap.get(bId)?.position : null) ?? 999;
    return aPos - bPos;
  });

  return sortedEntries.map(([domainId, groupTasks], gi) => {
    const domain = domainId != null ? domainMap.get(domainId) : null;
    const label = domain ? `${domain.icon ?? ""} ${domain.name}`.trim() : "Uncategorized";
    return (
      <div key={domainId ?? "none"}>
        {gi > 0 && <div className="h-px bg-border mx-2 my-1" />}
        <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </div>
        {groupTasks.map((task) => {
          const itemIdx = flatItems.indexOf(task.id);
          return (
            <TaskRow
              key={task.id}
              task={task}
              domains={domains}
              isSelected={selectedId === task.id}
              isActive={activeIndex === itemIdx}
              showDomainIcon={false}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    );
  });
}

function TaskRow({
  task,
  domains,
  isSelected,
  isActive,
  showDomainIcon,
  onSelect,
}: {
  task: TaskResponse;
  domains: DomainResponse[];
  isSelected: boolean;
  isActive: boolean;
  showDomainIcon: boolean;
  onSelect: (taskId: number) => void;
}) {
  const domain = task.domain_id ? domains.find((d) => d.id === task.domain_id) : null;
  const subtaskCount = task.subtasks?.length ?? 0;
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      data-active={isActive || undefined}
      className={cn(
        "w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors cursor-pointer flex items-center gap-1.5",
        isSelected && "bg-accent font-medium",
        isActive && "ring-2 ring-inset ring-primary/50",
      )}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onSelect(task.id)}
    >
      {showDomainIcon && domain?.icon && <span className="shrink-0">{domain.icon}</span>}
      <span className="truncate">{task.title}</span>
      {subtaskCount > 0 && (
        <span className="shrink-0 text-[10px] text-muted-foreground ml-auto">·{subtaskCount}</span>
      )}
    </button>
  );
}
