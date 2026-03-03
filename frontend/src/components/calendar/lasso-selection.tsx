import { useDndMonitor } from "@dnd-kit/core";
import { useCallback, useRef, useState } from "react";
import { useSelectionStore } from "@/stores/selection-store";

interface LassoRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Cached card position for hit-testing (avoids per-frame layout reflow) */
interface CachedCard {
  id: string;
  rect: DOMRect;
}

function rectsIntersect(ax1: number, ay1: number, ax2: number, ay2: number, b: DOMRect): boolean {
  return ax1 < b.right && ax2 > b.left && ay1 < b.bottom && ay2 > b.top;
}

/** Find the nearest scrollable ancestor of an element */
function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (style.overflowY === "auto" || style.overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

/** Edge distance (px) that triggers auto-scroll */
const AUTO_SCROLL_EDGE = 40;
/** Maximum auto-scroll speed (px per frame) */
const AUTO_SCROLL_MAX_SPEED = 12;

/**
 * Hook providing lasso (drag-select) functionality for a calendar day column.
 *
 * Returns pointer event handlers to wire to the column div, plus the current
 * lasso rectangle (or null) for rendering the visual indicator.
 */
export function useLasso(columnRef: React.RefObject<HTMLDivElement | null>, disabled: boolean) {
  const [lassoRect, setLassoRect] = useState<LassoRect | null>(null);
  const isLassoing = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const baselineRef = useRef<Set<string>>(new Set());
  const isDndActive = useRef(false);

  // #20: Cached card positions — populated once at lasso start
  const cardCacheRef = useRef<CachedCard[]>([]);
  // #20: rAF guard — at most one hit-test per animation frame
  const rafRef = useRef<number | null>(null);
  // #20: Previous hit set — skip selectAll if unchanged
  const prevHitRef = useRef<string>("");

  // #15: Auto-scroll refs
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const lastPointerYRef = useRef(0);
  // Flag: auto-scroll moved the container, cached card positions are stale
  const scrollDirtyRef = useRef(false);

  // Track dnd-kit drag state to disable lasso during drags
  useDndMonitor({
    onDragStart: () => {
      isDndActive.current = true;
    },
    onDragEnd: () => {
      isDndActive.current = false;
    },
    onDragCancel: () => {
      isDndActive.current = false;
    },
  });

  // #15: Auto-scroll loop — runs via rAF while lassoing near edges
  const autoScrollTick = useCallback(() => {
    if (!isLassoing.current) return;
    const container = scrollParentRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const pointerY = lastPointerYRef.current;
    const distFromTop = pointerY - containerRect.top;
    const distFromBottom = containerRect.bottom - pointerY;

    let scrollDelta = 0;
    if (distFromTop < AUTO_SCROLL_EDGE && distFromTop >= 0) {
      // Scroll up — faster closer to edge
      scrollDelta = -AUTO_SCROLL_MAX_SPEED * (1 - distFromTop / AUTO_SCROLL_EDGE);
    } else if (distFromBottom < AUTO_SCROLL_EDGE && distFromBottom >= 0) {
      // Scroll down — faster closer to edge
      scrollDelta = AUTO_SCROLL_MAX_SPEED * (1 - distFromBottom / AUTO_SCROLL_EDGE);
    }

    if (scrollDelta !== 0) {
      container.scrollTop += scrollDelta;
      // Mark card cache as stale — positions shifted due to scroll
      scrollDirtyRef.current = true;
    }

    autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || isDndActive.current) return;
      if (e.button !== 0) return; // Left click only
      // Only activate on empty space — not on a card/pill
      if ((e.target as HTMLElement).closest("[data-selection-id]")) return;
      // Don't interfere with plan-mode buttons or context menus
      if ((e.target as HTMLElement).closest("[data-plan-button]")) return;

      const column = columnRef.current;
      if (!column) return;

      const rect = column.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const additive = e.metaKey || e.ctrlKey;
      if (!additive) {
        useSelectionStore.getState().clear();
        baselineRef.current = new Set();
      } else {
        baselineRef.current = new Set(useSelectionStore.getState().selectedIds);
      }

      // #20: Cache all card positions at lasso start (single layout reflow)
      const cards = column.querySelectorAll("[data-selection-id]");
      const cached: CachedCard[] = [];
      for (const card of cards) {
        const id = card.getAttribute("data-selection-id");
        if (id) cached.push({ id, rect: card.getBoundingClientRect() });
      }
      cardCacheRef.current = cached;
      prevHitRef.current = "";

      // #15: Find scrollable parent for auto-scroll
      scrollParentRef.current = findScrollParent(column);
      lastPointerYRef.current = e.clientY;

      e.preventDefault();
      column.setPointerCapture(e.pointerId);
      isLassoing.current = true;
      startRef.current = { x, y };
      setLassoRect({ x1: x, y1: y, x2: x, y2: y });

      // #15: Start auto-scroll loop
      autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
    },
    [disabled, columnRef, autoScrollTick],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isLassoing.current) return;
      const column = columnRef.current;
      if (!column) return;

      // #15: Track pointer Y for auto-scroll
      lastPointerYRef.current = e.clientY;

      const rect = column.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const { x: sx, y: sy } = startRef.current;
      setLassoRect({ x1: sx, y1: sy, x2: x, y2: y });

      // #20: Throttle hit-testing to one per animation frame
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (!isLassoing.current) return;

        // Re-cache card positions if auto-scroll moved the container
        if (scrollDirtyRef.current) {
          scrollDirtyRef.current = false;
          const cards = column.querySelectorAll("[data-selection-id]");
          const cached: CachedCard[] = [];
          for (const card of cards) {
            const id = card.getAttribute("data-selection-id");
            if (id) cached.push({ id, rect: card.getBoundingClientRect() });
          }
          cardCacheRef.current = cached;
        }

        const colRect = column.getBoundingClientRect();
        const curX = e.clientX - colRect.left;
        const curY = e.clientY - colRect.top;
        const { x: startX, y: startY } = startRef.current;

        const minX = Math.min(startX, curX) + colRect.left;
        const minY = Math.min(startY, curY) + colRect.top;
        const maxX = Math.max(startX, curX) + colRect.left;
        const maxY = Math.max(startY, curY) + colRect.top;

        // #20: Use cached card positions — no querySelectorAll or getBoundingClientRect
        const hitIds = new Set(baselineRef.current);
        for (const { id, rect: cardRect } of cardCacheRef.current) {
          if (rectsIntersect(minX, minY, maxX, maxY, cardRect)) {
            hitIds.add(id);
          }
        }

        // #20: Only update store if hit set actually changed
        const hitKey = [...hitIds].sort().join(",");
        if (hitKey !== prevHitRef.current) {
          prevHitRef.current = hitKey;
          useSelectionStore.getState().selectAll([...hitIds]);
        }
      });
    },
    [columnRef],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isLassoing.current) return;
      isLassoing.current = false;
      columnRef.current?.releasePointerCapture(e.pointerId);
      setLassoRect(null);

      // Clean up rAF handles
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
      cardCacheRef.current = [];
    },
    [columnRef],
  );

  return { lassoRect, onPointerDown, onPointerMove, onPointerUp };
}

/** Visual lasso rectangle rendered inside the day column */
export function LassoRect({ rect }: { rect: LassoRect }) {
  const left = Math.min(rect.x1, rect.x2);
  const top = Math.min(rect.y1, rect.y2);
  const width = Math.abs(rect.x2 - rect.x1);
  const height = Math.abs(rect.y2 - rect.y1);

  // Don't render tiny rectangles (accidental clicks)
  if (width < 4 && height < 4) return null;

  return (
    <div
      className="absolute border border-dashed border-primary bg-primary/10 pointer-events-none z-[2] rounded-sm"
      style={{ left, top, width, height }}
    />
  );
}
