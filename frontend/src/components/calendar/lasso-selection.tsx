import { useDndMonitor } from "@dnd-kit/core";
import { useCallback, useRef, useState } from "react";
import { useSelectionStore } from "@/stores/selection-store";

interface LassoRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function rectsIntersect(ax1: number, ay1: number, ax2: number, ay2: number, b: DOMRect): boolean {
  return ax1 < b.right && ax2 > b.left && ay1 < b.bottom && ay2 > b.top;
}

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

      e.preventDefault();
      column.setPointerCapture(e.pointerId);
      isLassoing.current = true;
      startRef.current = { x, y };
      setLassoRect({ x1: x, y1: y, x2: x, y2: y });
    },
    [disabled, columnRef],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isLassoing.current) return;
      const column = columnRef.current;
      if (!column) return;

      const rect = column.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const { x: sx, y: sy } = startRef.current;
      setLassoRect({ x1: sx, y1: sy, x2: x, y2: y });

      // Hit-test all cards in the column
      const cards = column.querySelectorAll("[data-selection-id]");
      const minX = Math.min(sx, x) + rect.left;
      const minY = Math.min(sy, y) + rect.top;
      const maxX = Math.max(sx, x) + rect.left;
      const maxY = Math.max(sy, y) + rect.top;

      const hitIds = new Set(baselineRef.current);
      for (const card of cards) {
        const cardRect = card.getBoundingClientRect();
        const id = card.getAttribute("data-selection-id");
        if (id && rectsIntersect(minX, minY, maxX, maxY, cardRect)) {
          hitIds.add(id);
        }
      }
      useSelectionStore.getState().selectAll([...hitIds]);
    },
    [columnRef],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isLassoing.current) return;
      isLassoing.current = false;
      columnRef.current?.releasePointerCapture(e.pointerId);
      setLassoRect(null);
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
