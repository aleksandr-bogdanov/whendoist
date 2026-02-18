import { useCallback, useEffect, useRef } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

/**
 * Custom pull-to-refresh gesture handler for touch devices.
 * Attaches to a scrollable container and triggers onRefresh when
 * the user pulls down past the threshold while at scroll top.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  disabled = false,
}: UsePullToRefreshOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);
  const indicatorRef = useRef<HTMLDivElement | null>(null);

  const createIndicator = useCallback(() => {
    if (indicatorRef.current) return indicatorRef.current;
    const el = document.createElement("div");
    el.className =
      "pull-refresh-indicator fixed left-1/2 -translate-x-1/2 top-0 z-50 flex items-center justify-center rounded-full bg-primary text-primary-foreground h-8 w-8 text-xs shadow-lg transition-transform duration-200 pointer-events-none";
    el.textContent = "↓";
    el.style.transform = "translate(-50%, -40px)";
    document.body.appendChild(el);
    indicatorRef.current = el;
    return el;
  }, []);

  const removeIndicator = useCallback(() => {
    if (indicatorRef.current) {
      indicatorRef.current.remove();
      indicatorRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (disabled) return;
    const container = containerRef.current;
    if (!container) return;

    // Find the actual scrollable element (ScrollArea uses a viewport div)
    const scrollEl = container.querySelector("[data-radix-scroll-area-viewport]") ?? container;

    const handleTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (scrollEl.scrollTop <= 0) {
        startYRef.current = e.touches[0].clientY;
        pullingRef.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || refreshingRef.current) return;
      if (scrollEl.scrollTop > 0) {
        pullingRef.current = false;
        removeIndicator();
        return;
      }

      const deltaY = e.touches[0].clientY - startYRef.current;
      if (deltaY > 10) {
        const indicator = createIndicator();
        const progress = Math.min(deltaY / threshold, 1);
        const translateY = Math.min(deltaY * 0.5, threshold);
        indicator.style.transform = `translate(-50%, ${translateY - 40}px)`;
        indicator.style.opacity = String(progress);
        indicator.textContent = progress >= 1 ? "↻" : "↓";
      }
    };

    const handleTouchEnd = async () => {
      if (!pullingRef.current || refreshingRef.current) return;
      pullingRef.current = false;

      const indicator = indicatorRef.current;
      if (!indicator) return;

      const finalY =
        Number.parseFloat(indicator.style.transform.match(/translateY\(([\d.]+)px\)/)?.[1] ?? "0") +
        40;

      if (finalY >= threshold * 0.5) {
        refreshingRef.current = true;
        indicator.textContent = "↻";
        indicator.style.transform = "translate(-50%, 10px)";
        indicator.classList.add("animate-spin");
        try {
          await onRefresh();
        } finally {
          refreshingRef.current = false;
          indicator.classList.remove("animate-spin");
          removeIndicator();
        }
      } else {
        removeIndicator();
      }
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      removeIndicator();
    };
  }, [disabled, onRefresh, threshold, createIndicator, removeIndicator]);

  return containerRef;
}
