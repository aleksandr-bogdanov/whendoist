import { useCallback, useEffect, useRef } from "react";

interface UseCarouselOptions {
  /** Called when the carousel settles on a new panel */
  onNavigate: (direction: "prev" | "next") => void;
  /** The carousel container element (overflow-x: auto) */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Disable carousel interactions (e.g. during dnd-kit drag) */
  disabled?: boolean;
}

const DRAG_THRESHOLD = 8;

/**
 * Native scroll-snap carousel with desktop pointer-drag support.
 *
 * Touch: 100% browser-native (scroll-snap-type: x mandatory). No JS touch handling.
 * Desktop: pointer-event drag manipulates scrollLeft directly (visual feedback during drag).
 * Trackpad: native horizontal scroll → snap handles it.
 *
 * After snapping to a new panel, calls onNavigate. The parent updates dates and
 * calls scrollToCenter() to recenter the carousel on the new middle panel.
 */
export function useCarousel({ onNavigate, containerRef, disabled }: UseCarouselOptions) {
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  // Guard to prevent scroll-event navigation detection during programmatic scrolls
  const isProgrammatic = useRef(false);
  // Track which panel index is "current" to detect changes
  const currentPanel = useRef(1); // 0=prev, 1=center, 2=next

  // ── Scroll to center panel (no animation). Call after date update. ────────
  const scrollToCenter = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isProgrammatic.current = true;
    const panelWidth = el.offsetWidth;
    el.style.scrollBehavior = "auto";
    el.scrollLeft = panelWidth; // panel 1 (center)
    currentPanel.current = 1;
    // Clear guard after the scroll event fires (next frame)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isProgrammatic.current = false;
        if (el) el.style.scrollBehavior = "";
      });
    });
  }, [containerRef]);

  // ── Detect when scroll settles on a new panel ─────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;

    const onScroll = () => {
      if (isProgrammatic.current) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (isProgrammatic.current) return;
        const panelWidth = el.offsetWidth;
        if (panelWidth === 0) return;
        const panelIndex = Math.round(el.scrollLeft / panelWidth);
        if (panelIndex !== currentPanel.current) {
          const dir = panelIndex > currentPanel.current ? "next" : "prev";
          currentPanel.current = panelIndex;
          onNavigateRef.current(dir);
        }
      }, 80); // Wait for scroll-snap to settle
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (debounce) clearTimeout(debounce);
    };
  }, [containerRef]);

  // ── Initialize scroll position to center panel ────────────────────────────
  useEffect(() => {
    // Run after first paint so the container has its layout
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
      if (e.pointerType === "touch") return; // Touch uses native scroll
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
        // Restore scroll-snap — browser will snap to nearest panel
        el.style.scrollBehavior = "";
        el.style.scrollSnapType = "";

        const dx = e.pageX - startX;
        const panelWidth = el.offsetWidth;
        if (Math.abs(dx) > panelWidth * 0.25) {
          // Navigate: scroll to the target panel with smooth behavior
          const targetPanel = dx > 0 ? 0 : 2; // drag right → prev (panel 0), drag left → next (panel 2)
          el.scrollTo({ left: targetPanel * panelWidth, behavior: "smooth" });
        } else {
          // Snap back to current panel
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
