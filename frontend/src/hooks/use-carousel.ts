import { useCallback, useEffect, useRef } from "react";

interface UseCarouselOptions {
  /** Called when the carousel settles on a new panel. Offset is relative to center (e.g. -2, -1, +1, +2). */
  onNavigate: (offset: number) => void;
  /** Called immediately when the most-visible panel changes during scroll (0-based index). */
  onVisiblePanelChange?: (panel: number) => void;
  /** The carousel container element (overflow-x: auto) */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Disable carousel interactions (e.g. during dnd-kit drag) */
  disabled?: boolean;
}

const DRAG_THRESHOLD = 8;
const CENTER_INDEX = 2; // 5 panels: 0, 1, [2], 3, 4

/**
 * Native scroll-snap carousel (5 panels) with desktop pointer-drag support.
 *
 * 5 panels allow 2 consecutive swipes before a recenter cycle, so fast
 * day-by-day swiping feels immediate.
 *
 * Touch: 100% browser-native (scroll-snap-type: x mandatory).
 * Desktop: pointer-event drag manipulates scrollLeft directly.
 * Trackpad: native horizontal scroll → snap handles it.
 */
export function useCarousel({
  onNavigate,
  onVisiblePanelChange,
  containerRef,
  disabled,
}: UseCarouselOptions) {
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const onVisiblePanelChangeRef = useRef(onVisiblePanelChange);
  onVisiblePanelChangeRef.current = onVisiblePanelChange;

  // Guard to prevent scroll-event navigation detection during programmatic scrolls
  const isProgrammatic = useRef(false);
  // Track which panel index is "current" to detect changes
  const currentPanel = useRef(CENTER_INDEX);

  // ── Scroll to center panel (no animation). Call after date update. ────────
  const scrollToCenter = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isProgrammatic.current = true;
    const panelWidth = el.offsetWidth;
    el.style.scrollBehavior = "auto";
    el.scrollLeft = CENTER_INDEX * panelWidth;
    el.style.scrollBehavior = ""; // Restore immediately so next swipe isn't blocked
    currentPanel.current = CENTER_INDEX;
    onVisiblePanelChangeRef.current?.(CENTER_INDEX);
    requestAnimationFrame(() => {
      isProgrammatic.current = false;
    });
  }, [containerRef]);

  // ── Detect when scroll settles on a new panel ─────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    let lastReportedPanel = currentPanel.current;

    const commitIfNeeded = () => {
      if (isProgrammatic.current) return;
      const panelWidth = el.offsetWidth;
      if (panelWidth === 0) return;
      const panelIndex = Math.round(el.scrollLeft / panelWidth);
      const offset = panelIndex - CENTER_INDEX;
      if (offset !== 0) {
        currentPanel.current = panelIndex;
        onNavigateRef.current(offset);
      }
    };

    const onScroll = () => {
      if (isProgrammatic.current) return;

      // Report visible panel immediately (no debounce) for live header updates
      const panelWidth = el.offsetWidth;
      if (panelWidth > 0) {
        const panelIndex = Math.round(el.scrollLeft / panelWidth);
        if (panelIndex !== lastReportedPanel) {
          lastReportedPanel = panelIndex;
          onVisiblePanelChangeRef.current?.(panelIndex);
        }
      }

      // Debounced fallback for browsers without scrollend support
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(commitIfNeeded, 150);
    };

    // scrollend fires the instant scroll-snap settles — faster than debounce
    const onScrollEnd = () => {
      if (debounce) {
        clearTimeout(debounce);
        debounce = null;
      }
      commitIfNeeded();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", onScrollEnd, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onScrollEnd);
      if (debounce) clearTimeout(debounce);
    };
  }, [containerRef]);

  // ── Initialize scroll position to center panel ────────────────────────────
  useEffect(() => {
    requestAnimationFrame(() => {
      scrollToCenter();
    });
  }, [scrollToCenter]);

  // ── Desktop pointer-drag (mouse/pen only — matches legacy exactly) ────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let isDown = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let scrollStart = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (disabledRef.current) return;
      if (e.pointerType === "touch") return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, select, [draggable='true']")) return;

      isDown = true;
      isDragging = false;
      startX = e.pageX;
      startY = e.pageY;
      scrollStart = el.scrollLeft;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDown || e.pointerType === "touch" || disabledRef.current) return;

      const dx = e.pageX - startX;
      const dy = e.pageY - startY;

      if (!isDragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          isDown = false;
          return;
        }
        isDragging = true;
        el.style.scrollBehavior = "auto";
        el.style.scrollSnapType = "none";
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }

      e.preventDefault();
      el.scrollLeft = scrollStart - dx;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDown || e.pointerType === "touch") return;
      const wasDragging = isDragging;
      isDown = false;
      isDragging = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      if (wasDragging) {
        el.style.scrollBehavior = "";
        el.style.scrollSnapType = "";

        const dx = e.pageX - startX;
        const panelWidth = el.offsetWidth;
        if (Math.abs(dx) > panelWidth * 0.25) {
          const direction = dx > 0 ? -1 : 1;
          const targetPanel = Math.max(0, Math.min(4, currentPanel.current + direction));
          el.scrollTo({ left: targetPanel * panelWidth, behavior: "smooth" });
        } else {
          el.scrollTo({ left: currentPanel.current * panelWidth, behavior: "smooth" });
        }
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [containerRef]);

  return { scrollToCenter };
}
