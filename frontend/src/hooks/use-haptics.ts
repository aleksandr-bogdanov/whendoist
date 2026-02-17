import { useCallback, useMemo } from "react";
import { useDevice } from "./use-device";

type HapticPattern =
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "warning"
  | "error"
  | "longPress"
  | "double"
  | "dragStart"
  | "drop";

const PATTERNS: Record<HapticPattern, number[]> = {
  light: [10],
  medium: [20],
  heavy: [40],
  success: [10, 50, 30],
  warning: [30, 30, 30],
  error: [50, 50, 50, 50],
  longPress: [15],
  double: [15, 50, 15],
  dragStart: [10],
  drop: [20, 30, 40],
};

const isSupported = typeof navigator !== "undefined" && "vibrate" in navigator;

/**
 * Hook for triggering haptic feedback on mobile devices.
 * Respects prefers-reduced-motion and checks navigator.vibrate support.
 */
export function useHaptics() {
  const { prefersReducedMotion } = useDevice();

  const enabled = useMemo(() => {
    if (!isSupported || prefersReducedMotion) return false;
    const pref = localStorage.getItem("haptics_enabled");
    return pref !== "false";
  }, [prefersReducedMotion]);

  const trigger = useCallback(
    (pattern: HapticPattern): boolean => {
      if (!enabled) return false;
      const vibration = PATTERNS[pattern];
      if (!vibration) return false;
      try {
        navigator.vibrate(vibration);
        return true;
      } catch {
        return false;
      }
    },
    [enabled],
  );

  const stop = useCallback(() => {
    if (isSupported) navigator.vibrate(0);
  }, []);

  return { trigger, stop, isSupported: enabled };
}
