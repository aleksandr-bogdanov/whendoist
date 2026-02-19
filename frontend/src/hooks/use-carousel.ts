import { useCallback, useEffect, useRef, useState } from "react";

interface UseCarouselOptions {
  onNavigate: (direction: "prev" | "next") => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  disabled?: boolean;
}

interface UseCarouselReturn {
  /** Offset in percent added to the base -33.333% translateX. 0 = center visible. */
  offsetPercent: number;
  /** Whether the user is actively dragging */
  isDragging: boolean;
  /** Whether the snap animation is playing */
  isAnimating: boolean;
  /** Bind to carousel container */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
    onTransitionEnd: () => void;
  };
  /** Reset offset to 0 instantly (no transition). Call after navigation commit. */
  resetToCenter: () => void;
  /** Feed horizontal wheel deltaX for trackpad swipe with visual feedback */
  applyWheelDelta: (deltaX: number) => void;
}

const DRAG_THRESHOLD = 8;
const NAVIGATE_RATIO = 0.25; // 25% of container width triggers navigation
const PANEL_PERCENT = 33.333;
const WHEEL_DEBOUNCE_MS = 200;

type Phase = "idle" | "dragging" | "animating";

export function useCarousel({
  onNavigate,
  containerRef,
  disabled,
}: UseCarouselOptions): UseCarouselReturn {
  const [offsetPercent, setOffsetPercent] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const isResetting = useRef(false);

  // Navigation direction pending commit after animation
  const pendingNav = useRef<"prev" | "next" | null>(null);

  // ── Pointer drag (desktop mouse/pen) ──────────────────────────────────────
  const ptrState = useRef({
    isDown: false,
    isDragging: false,
    startX: 0,
    startY: 0,
    startOffset: 0,
  });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      if (e.pointerType === "touch") return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, select, [draggable='true']")) return;

      ptrState.current = {
        isDown: true,
        isDragging: false,
        startX: e.pageX,
        startY: e.pageY,
        startOffset: offsetPercent,
      };
    },
    [disabled, offsetPercent],
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const ps = ptrState.current;
      if (!ps.isDown || e.pointerType === "touch" || disabled) return;

      const dx = e.pageX - ps.startX;
      const dy = e.pageY - ps.startY;

      if (!ps.isDragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          ps.isDown = false;
          return;
        }
        ps.isDragging = true;
        setPhase("dragging");
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }

      e.preventDefault();
      const containerWidth = containerRef.current?.offsetWidth ?? 400;
      const pct = (dx / containerWidth) * PANEL_PERCENT;
      setOffsetPercent(Math.max(-PANEL_PERCENT, Math.min(PANEL_PERCENT, ps.startOffset + pct)));
    };

    const onPointerUp = (e: PointerEvent) => {
      const ps = ptrState.current;
      if (!ps.isDown || e.pointerType === "touch") return;
      const wasDragging = ps.isDragging;
      ps.isDown = false;
      ps.isDragging = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      if (wasDragging) {
        const dx = e.pageX - ps.startX;
        const containerWidth = containerRef.current?.offsetWidth ?? 400;
        if (Math.abs(dx) > containerWidth * NAVIGATE_RATIO) {
          // Navigate
          const dir = dx > 0 ? "prev" : "next";
          pendingNav.current = dir;
          setOffsetPercent(dir === "prev" ? PANEL_PERCENT : -PANEL_PERCENT);
          setPhase("animating");
        } else {
          // Snap back
          pendingNav.current = null;
          setOffsetPercent(0);
          setPhase("animating");
        }
      }
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [containerRef, disabled]);

  // ── Touch swipe (mobile) ──────────────────────────────────────────────────
  const touchState = useRef({
    active: false,
    locked: false,
    axis: "" as "" | "x" | "y",
    startX: 0,
    startY: 0,
    startOffset: 0,
  });

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || phase !== "idle") return;
      const t = e.touches[0];
      if (!t) return;
      touchState.current = {
        active: true,
        locked: false,
        axis: "",
        startX: t.pageX,
        startY: t.pageY,
        startOffset: offsetPercent,
      };
    },
    [disabled, phase, offsetPercent],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const ts = touchState.current;
      if (!ts.active || disabled) return;
      const t = e.touches[0];
      if (!t) return;

      const dx = t.pageX - ts.startX;
      const dy = t.pageY - ts.startY;

      if (!ts.locked) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        ts.locked = true;
        ts.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        if (ts.axis === "x") {
          setPhase("dragging");
        }
      }

      if (ts.axis !== "x") return;

      e.preventDefault();
      const containerWidth = containerRef.current?.offsetWidth ?? 400;
      const pct = (dx / containerWidth) * PANEL_PERCENT;
      setOffsetPercent(Math.max(-PANEL_PERCENT, Math.min(PANEL_PERCENT, ts.startOffset + pct)));
    },
    [containerRef, disabled],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const ts = touchState.current;
      if (!ts.active) return;
      ts.active = false;

      if (ts.axis !== "x") {
        setPhase("idle");
        return;
      }

      const t = e.changedTouches[0];
      if (!t) {
        setOffsetPercent(0);
        setPhase("animating");
        return;
      }

      const dx = t.pageX - ts.startX;
      const containerWidth = containerRef.current?.offsetWidth ?? 400;

      if (Math.abs(dx) > containerWidth * NAVIGATE_RATIO) {
        const dir = dx > 0 ? "prev" : "next";
        pendingNav.current = dir;
        setOffsetPercent(dir === "prev" ? PANEL_PERCENT : -PANEL_PERCENT);
        setPhase("animating");
      } else {
        pendingNav.current = null;
        setOffsetPercent(0);
        setPhase("animating");
      }
    },
    [containerRef],
  );

  // ── Trackpad horizontal wheel ─────────────────────────────────────────────
  const wheelAccum = useRef(0);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyWheelDelta = useCallback(
    (deltaX: number) => {
      if (disabled || phase === "animating") return;

      wheelAccum.current += deltaX;
      const containerWidth = containerRef.current?.offsetWidth ?? 400;
      const pct = (-wheelAccum.current / containerWidth) * PANEL_PERCENT;
      setOffsetPercent(Math.max(-PANEL_PERCENT, Math.min(PANEL_PERCENT, pct)));

      if (phase !== "dragging") setPhase("dragging");

      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        const accum = wheelAccum.current;
        wheelAccum.current = 0;

        if (Math.abs(accum) > containerWidth * NAVIGATE_RATIO) {
          const dir = accum > 0 ? "next" : "prev";
          pendingNav.current = dir;
          setOffsetPercent(dir === "prev" ? PANEL_PERCENT : -PANEL_PERCENT);
          setPhase("animating");
        } else {
          pendingNav.current = null;
          setOffsetPercent(0);
          setPhase("animating");
        }
      }, WHEEL_DEBOUNCE_MS);
    },
    [containerRef, disabled, phase],
  );

  // ── Transition end → commit navigation ────────────────────────────────────
  const handleTransitionEnd = useCallback(() => {
    if (phase !== "animating") return;
    if (pendingNav.current) {
      const dir = pendingNav.current;
      pendingNav.current = null;
      onNavigate(dir);
      // The parent will call resetToCenter() in useLayoutEffect after re-render
    } else {
      setPhase("idle");
    }
  }, [phase, onNavigate]);

  // ── Reset (called by parent after calendarCenterDate changes) ─────────────
  const resetToCenter = useCallback(() => {
    isResetting.current = true;
    setOffsetPercent(0);
    setPhase("idle");
    // Clear resetting flag after one frame so next render doesn't use transition
    requestAnimationFrame(() => {
      isResetting.current = false;
    });
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  return {
    offsetPercent,
    isDragging: phase === "dragging" || isResetting.current,
    isAnimating: phase === "animating",
    handlers: {
      onPointerDown: handlePointerDown,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTransitionEnd: handleTransitionEnd,
    },
    resetToCenter,
    applyWheelDelta,
  };
}
