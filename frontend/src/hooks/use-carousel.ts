import { useCallback, useEffect, useRef, useState } from "react";

interface UseCarouselOptions {
  onNavigate: (direction: "prev" | "next") => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  disabled?: boolean;
}

interface UseCarouselReturn {
  /** Offset in percent added to the base -33.333% translateX. 0 = center visible. */
  offsetPercent: number;
  /** Whether the user is actively dragging (suppress CSS transition) */
  isDragging: boolean;
  /** Whether the snap animation is playing */
  isAnimating: boolean;
  /** Bind to the carousel track element */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
  };
  /** Reset offset to 0 instantly (no transition). Call after navigation commit. */
  resetToCenter: () => void;
  /** Feed horizontal wheel deltaX for trackpad swipe with visual feedback */
  applyWheelDelta: (deltaX: number) => void;
}

const DRAG_THRESHOLD = 8;
const NAVIGATE_RATIO = 0.25;
const PANEL_PERCENT = 33.333;
const WHEEL_DEBOUNCE_MS = 200;
const ANIMATION_MS = 300;

/**
 * All mutable state lives in refs to avoid stale closures and re-render churn.
 * Only `offsetPercent` and `phase` are React state (they drive the DOM).
 */
export function useCarousel({
  onNavigate,
  containerRef,
  disabled,
}: UseCarouselOptions): UseCarouselReturn {
  const [offsetPercent, setOffsetPercent] = useState(0);
  const [phase, setPhase] = useState<"idle" | "dragging" | "animating">("idle");

  // Refs for values needed in document-level listeners (avoid stale closures)
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  const pendingNav = useRef<"prev" | "next" | null>(null);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Commit animation (called by timeout, not transitionend) ───────────────
  const commitAnimation = useCallback(() => {
    if (animTimer.current) {
      clearTimeout(animTimer.current);
      animTimer.current = null;
    }
    const dir = pendingNav.current;
    pendingNav.current = null;
    if (dir) {
      // Parent will call resetToCenter() in useLayoutEffect after re-render
      onNavigateRef.current(dir);
    } else {
      // Snap-back complete
      setPhase("idle");
    }
  }, []);

  /** Start the snap animation to a target offset, with a setTimeout to commit. */
  const startAnimation = useCallback(
    (targetOffset: number, direction: "prev" | "next" | null) => {
      pendingNav.current = direction;
      setOffsetPercent(targetOffset);
      setPhase("animating");
      // Timeout fallback — don't rely on transitionend
      if (animTimer.current) clearTimeout(animTimer.current);
      animTimer.current = setTimeout(commitAnimation, ANIMATION_MS + 50);
    },
    [commitAnimation],
  );

  // ── Pointer drag (desktop mouse/pen) ──────────────────────────────────────
  const ptrState = useRef({
    isDown: false,
    isDragging: false,
    startX: 0,
    startY: 0,
  });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabledRef.current) return;
    if (e.pointerType === "touch") return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, select, [draggable='true']")) return;

    ptrState.current = {
      isDown: true,
      isDragging: false,
      startX: e.pageX,
      startY: e.pageY,
    };
  }, []);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const ps = ptrState.current;
      if (!ps.isDown || e.pointerType === "touch" || disabledRef.current) return;

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
      setOffsetPercent(Math.max(-PANEL_PERCENT, Math.min(PANEL_PERCENT, pct)));
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
          const dir = dx > 0 ? "prev" : "next";
          startAnimation(dir === "prev" ? PANEL_PERCENT : -PANEL_PERCENT, dir);
        } else {
          startAnimation(0, null);
        }
      }
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [containerRef, startAnimation]);

  // ── Touch swipe (mobile) ──────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let active = false;
    let locked = false;
    let axis: "" | "x" | "y" = "";
    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (disabledRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      active = true;
      locked = false;
      axis = "";
      startX = t.pageX;
      startY = t.pageY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active || disabledRef.current) return;
      const t = e.touches[0];
      if (!t) return;

      const dx = t.pageX - startX;
      const dy = t.pageY - startY;

      if (!locked) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        locked = true;
        axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        if (axis === "x") setPhase("dragging");
      }

      if (axis !== "x") return;

      e.preventDefault();
      const containerWidth = el.offsetWidth || 400;
      const pct = (dx / containerWidth) * PANEL_PERCENT;
      setOffsetPercent(Math.max(-PANEL_PERCENT, Math.min(PANEL_PERCENT, pct)));
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      if (axis !== "x") return;

      const t = e.changedTouches[0];
      const dx = t ? t.pageX - startX : 0;
      const containerWidth = el.offsetWidth || 400;

      if (Math.abs(dx) > containerWidth * NAVIGATE_RATIO) {
        const dir = dx > 0 ? "prev" : "next";
        startAnimation(dir === "prev" ? PANEL_PERCENT : -PANEL_PERCENT, dir);
      } else {
        startAnimation(0, null);
      }
    };

    // Use { passive: false } so we can preventDefault on touchmove
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [containerRef, startAnimation]);

  // ── Trackpad horizontal wheel ─────────────────────────────────────────────
  const wheelAccum = useRef(0);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyWheelDelta = useCallback(
    (deltaX: number) => {
      if (disabledRef.current) return;
      // Allow wheel even during animating — interrupt and restart
      if (animTimer.current) {
        clearTimeout(animTimer.current);
        animTimer.current = null;
        pendingNav.current = null;
      }

      wheelAccum.current += deltaX;
      const containerWidth = containerRef.current?.offsetWidth ?? 400;
      const pct = (-wheelAccum.current / containerWidth) * PANEL_PERCENT;
      setOffsetPercent(Math.max(-PANEL_PERCENT, Math.min(PANEL_PERCENT, pct)));
      setPhase("dragging");

      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        const accum = wheelAccum.current;
        wheelAccum.current = 0;

        if (Math.abs(accum) > containerWidth * NAVIGATE_RATIO) {
          const dir = accum > 0 ? "next" : "prev";
          startAnimation(dir === "prev" ? PANEL_PERCENT : -PANEL_PERCENT, dir);
        } else {
          startAnimation(0, null);
        }
      }, WHEEL_DEBOUNCE_MS);
    },
    [containerRef, startAnimation],
  );

  // ── Reset (called by parent after calendarCenterDate changes) ─────────────
  const resetToCenter = useCallback(() => {
    if (animTimer.current) {
      clearTimeout(animTimer.current);
      animTimer.current = null;
    }
    pendingNav.current = null;
    // Batch these — React will apply both before paint
    setOffsetPercent(0);
    setPhase("idle");
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      if (animTimer.current) clearTimeout(animTimer.current);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  return {
    offsetPercent,
    isDragging: phase === "dragging",
    isAnimating: phase === "animating",
    handlers: {
      onPointerDown: handlePointerDown,
    },
    resetToCenter,
    applyWheelDelta,
  };
}
