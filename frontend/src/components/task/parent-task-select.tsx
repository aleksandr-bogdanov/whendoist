/**
 * ParentTaskSelect — pure selection dropdown for choosing a parent task.
 *
 * Used in create mode where there's no existing task to reparent.
 * Thin wrapper around ParentTaskDropdown that manages open/close state
 * and renders a trigger button.
 */

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { ParentTaskDropdown } from "@/components/task/parent-task-dropdown";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => parentTasks.find((t) => t.id === selectedId) ?? null,
    [parentTasks, selectedId],
  );

  const selectedDomain = useMemo(
    () => (selected?.domain_id ? domains.find((d) => d.id === selected.domain_id) : null),
    [selected, domains],
  );

  const handleSelect = (parentId: number | null) => {
    onChange(parentId);
    setOpen(false);
  };

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
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
          <ParentTaskDropdown
            parentTasks={parentTasks}
            domains={domains}
            currentDomainId={selected?.domain_id}
            selectedId={selectedId}
            onSelect={handleSelect}
            showSearch
          />
        </div>
      )}
    </div>
  );
}
