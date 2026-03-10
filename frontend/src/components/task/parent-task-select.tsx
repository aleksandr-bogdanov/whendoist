/**
 * ParentTaskSelect — pure selection dropdown for choosing a parent task.
 *
 * Used in create mode where there's no existing task to reparent.
 * Shares UI pattern with ParentTaskPicker but has no API mutation logic.
 */

import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { groupParentTasks } from "@/lib/task-utils";
import { cn } from "@/lib/utils";

interface ParentTaskSelectProps {
  selectedId: number | null;
  parentTasks: TaskResponse[];
  domains: DomainResponse[];
  onChange: (parentId: number | null) => void;
}

export function ParentTaskSelect({
  selectedId,
  parentTasks,
  domains,
  onChange,
}: ParentTaskSelectProps) {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(
    () => parentTasks.find((t) => t.id === selectedId) ?? null,
    [parentTasks, selectedId],
  );

  const selectedDomain = useMemo(
    () => (selected?.domain_id ? domains.find((d) => d.id === selected.domain_id) : null),
    [selected, domains],
  );

  const taskGroups = useMemo(
    () => groupParentTasks(parentTasks, null, search, undefined, domains),
    [parentTasks, search, domains],
  );

  const totalFiltered = taskGroups.reduce((n, g) => n + g.tasks.length, 0);
  const showLabels = !search && taskGroups.length > 1;

  const handleSelect = (parentId: number | null) => {
    onChange(parentId);
    setOpen(false);
    setSearch("");
  };

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  // Auto-focus search when opening
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        className={cn(
          "flex items-center justify-between w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm",
          "hover:bg-accent/50 transition-colors cursor-pointer",
        )}
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-1.5 truncate min-w-0">
          {selected ? (
            <>
              {selectedDomain?.icon && <span className="shrink-0">{selectedDomain.icon}</span>}
              <span className="truncate">{selected.title}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{t("task.field.noneTopLevel")}</span>
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-2" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("task.searchTasks")}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Options list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {/* None (top-level) — always first */}
            <button
              type="button"
              className={cn(
                "w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors cursor-pointer",
                selectedId === null && "bg-accent font-medium",
              )}
              onClick={() => handleSelect(null)}
            >
              {t("task.field.noneTopLevel")}
            </button>

            {totalFiltered > 0 && <div className="h-px bg-border mx-2 my-1" />}

            {taskGroups.map((group, gi) => (
              <div key={group.label}>
                {gi > 0 && <div className="h-px bg-border mx-2 my-1" />}
                {showLabels && (
                  <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </div>
                )}
                {group.tasks.map((t) => {
                  const domain = t.domain_id ? domains.find((d) => d.id === t.domain_id) : null;
                  const subtaskCount = t.subtasks?.length ?? 0;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={cn(
                        "w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors cursor-pointer flex items-center gap-1.5",
                        selectedId === t.id && "bg-accent font-medium",
                      )}
                      onClick={() => handleSelect(t.id)}
                    >
                      {domain?.icon && <span className="shrink-0">{domain.icon}</span>}
                      <span className="truncate">{t.title}</span>
                      {subtaskCount > 0 && (
                        <span className="shrink-0 text-[10px] text-muted-foreground ml-auto">
                          ·{subtaskCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

            {totalFiltered === 0 && search && (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {t("task.noMatchingTasks")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
