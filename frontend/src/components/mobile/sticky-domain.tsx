import { useEffect, useRef, useState } from "react";
import { useDevice } from "@/hooks/use-device";
import { cn } from "@/lib/utils";

interface StickyDomainInfo {
  icon: string;
  name: string;
  count: string;
  color: string;
}

/**
 * On mobile, shows the current domain name as a floating label
 * at the top of the task list as the user scrolls through domain sections.
 * Crossfades between domains smoothly.
 */
export function StickyDomainHeader() {
  const { isMobileViewport } = useDevice();
  const [domainInfo, setDomainInfo] = useState<StickyDomainInfo | null>(null);
  const [opacity, setOpacity] = useState(0);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isMobileViewport) return;

    // Find scroll container after mount
    const container = document.querySelector("[data-task-scroll-area]");
    if (!container) return;
    scrollContainerRef.current = container as HTMLElement;

    function update() {
      const container = scrollContainerRef.current;
      if (!container) return;

      // Find the sticky header element to get its bottom edge
      const header = document.querySelector("[data-task-panel-header]");
      if (!header) return;
      const headerBottom = header.getBoundingClientRect().bottom;

      // Find all domain groups
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

        // Calculate enter progress
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
        setOpacity(0.85 * progress);
      } else {
        setOpacity(0);
      }
    }

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
    // Initial check
    requestAnimationFrame(update);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isMobileViewport]);

  if (!isMobileViewport || opacity <= 0 || !domainInfo) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute top-0 left-0 right-0 z-10 flex items-center gap-1.5 px-3 py-1",
        "text-sm font-medium text-foreground transition-opacity",
      )}
      style={{ opacity }}
    >
      {domainInfo.icon && <span className="text-base">{domainInfo.icon}</span>}
      {!domainInfo.icon && domainInfo.color && (
        <div
          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: domainInfo.color }}
        />
      )}
      <span className="truncate">{domainInfo.name}</span>
      {domainInfo.count && (
        <span className="text-xs text-muted-foreground ml-1">{domainInfo.count}</span>
      )}
    </div>
  );
}
