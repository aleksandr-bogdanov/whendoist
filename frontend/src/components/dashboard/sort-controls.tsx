import { ArrowDown, ArrowUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { announce } from "@/components/live-announcer";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

const SORT_OPTIONS = [
  { field: "clarity" as const, label: "Clarity", colVar: "--col-clarity" },
  { field: "duration" as const, label: "Duration", colVar: "--col-duration" },
  { field: "impact" as const, label: "Impact", colVar: "--col-impact" },
];

interface StickyDomainInfo {
  icon: string;
  name: string;
  count: string;
  color: string;
}

export function ColumnHeaders() {
  const { sortField, sortDirection, toggleSort } = useUIStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const [domainInfo, setDomainInfo] = useState<StickyDomainInfo | null>(null);
  const [domainOpacity, setDomainOpacity] = useState(0);
  const rafRef = useRef<number | null>(null);

  const update = useCallback(() => {
    const header = headerRef.current;
    if (!header) return;

    const headerBottom = header.getBoundingClientRect().bottom;

    const container = header.closest("[data-task-scroll-area]");
    if (!container) return;

    const groups = container.querySelectorAll("[data-domain-group]");
    let activeGroup: Element | null = null;
    let activeIndex = -1;

    for (let i = 0; i < groups.length; i++) {
      const rect = groups[i].getBoundingClientRect();
      if (rect.top <= headerBottom && rect.bottom > headerBottom) {
        activeGroup = groups[i];
        activeIndex = i;
        break;
      }
    }

    if (activeGroup) {
      const el = activeGroup as HTMLElement;

      // Calculate enter progress — how far the domain trigger has scrolled behind the header
      const trigger = activeGroup.querySelector("[data-domain-trigger]");
      let enterProgress = 0;
      if (trigger) {
        const triggerRect = trigger.getBoundingClientRect();
        const distance = headerBottom - triggerRect.top;
        enterProgress = Math.max(0, Math.min(1, distance / triggerRect.height));
      }

      let progress = enterProgress;

      // Exit fade near next domain boundary
      const nextGroup = groups[activeIndex + 1];
      if (nextGroup) {
        const nextTrigger = nextGroup.querySelector("[data-domain-trigger]");
        if (nextTrigger) {
          const nextRect = nextTrigger.getBoundingClientRect();
          const gap = nextRect.top - headerBottom;
          if (gap >= 0 && gap < nextRect.height) {
            progress = Math.min(progress, gap / nextRect.height);
          }
        }
      }

      setDomainInfo({
        icon: el.dataset.domainIcon ?? "",
        name: el.dataset.domainName ?? "",
        count: el.dataset.domainCount ?? "",
        color: el.dataset.domainColor ?? "",
      });
      setDomainOpacity(0.85 * progress);
    } else {
      setDomainOpacity(0);
    }
  }, []);

  useEffect(() => {
    const container = headerRef.current?.closest("[data-task-scroll-area]");
    if (!container) return;

    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        rafRef.current = requestAnimationFrame(() => {
          update();
          ticking = false;
        });
        ticking = true;
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    requestAnimationFrame(update);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [update]);

  return (
    <div
      ref={headerRef}
      className="hidden sm:flex items-center justify-end pl-2 sm:pl-4 pr-[9px] sm:pr-[17px] py-1 sticky top-0 z-20 bg-background/90 backdrop-blur-lg"
    >
      {/* Sticky domain label — fades in when domain header scrolls behind */}
      <div
        className="flex items-center gap-1.5 min-w-0 overflow-hidden text-sm font-semibold text-foreground"
        style={{ opacity: domainOpacity, flexGrow: domainOpacity > 0 ? domainOpacity / 0.85 : 0 }}
      >
        {domainInfo && domainOpacity > 0 && (
          <>
            {domainInfo.icon ? (
              <span className="text-base flex-shrink-0">{domainInfo.icon}</span>
            ) : domainInfo.color ? (
              <div
                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: domainInfo.color }}
              />
            ) : null}
            <span className="truncate">{domainInfo.name}</span>
            {domainInfo.count && (
              <span className="text-[11px] text-muted-foreground tabular-nums bg-background/60 px-1.5 py-0.5 rounded-full flex-shrink-0">
                {domainInfo.count}
              </span>
            )}
          </>
        )}
      </div>

      {/* Column headers aligned with task row metadata */}
      <div className="flex items-center gap-[var(--col-gap)] flex-shrink-0">
        {SORT_OPTIONS.map((opt) => {
          const isActive = sortField === opt.field;
          const Icon = sortDirection === "asc" ? ArrowUp : ArrowDown;
          return (
            <button
              key={opt.field}
              type="button"
              className={cn(
                "flex items-center justify-center gap-0.5 text-[0.625rem] font-medium tracking-[0.06em] uppercase transition-colors",
                isActive
                  ? "text-muted-foreground"
                  : "text-muted-foreground/40 hover:text-muted-foreground",
              )}
              style={{ width: `var(${opt.colVar})` }}
              onClick={() => {
                toggleSort(opt.field);
                const dir =
                  sortField === opt.field
                    ? sortDirection === "asc"
                      ? "descending"
                      : "ascending"
                    : "ascending";
                announce(`Sorted by ${opt.label.toLowerCase()} ${dir}`);
              }}
            >
              {opt.label}
              {isActive && <Icon className="h-2.5 w-2.5" />}
            </button>
          );
        })}
        {/* Spacer matching actions column (kebab menu) */}
        <span className="w-[var(--col-actions)]" />
      </div>
    </div>
  );
}
