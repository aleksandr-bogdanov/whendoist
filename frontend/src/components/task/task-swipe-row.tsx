import { useDrag } from "@use-gesture/react";
import { CalendarDays, Check } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useHaptics } from "@/hooks/use-haptics";
import { cn } from "@/lib/utils";

const SWIPE_COLORS = {
  green: { bg: "bg-green-500", bgFaint: "bg-green-500/20", text: "text-green-600" },
  blue: { bg: "bg-blue-500", bgFaint: "bg-blue-500/20", text: "text-blue-600" },
  red: { bg: "bg-red-500", bgFaint: "bg-red-500/20", text: "text-red-600" },
} as const;

interface TaskSwipeRowProps {
  children: React.ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  rightIcon?: React.ComponentType<{ className?: string }>;
  rightColor?: keyof typeof SWIPE_COLORS;
  leftIcon?: React.ComponentType<{ className?: string }>;
  leftColor?: keyof typeof SWIPE_COLORS;
}

const THRESHOLD = 130;
const MAX_SWIPE = 150;
const VELOCITY_THRESHOLD = 0.4;
const LONG_PRESS_DURATION = 300;

/**
 * Wraps a task item with swipe-right-to-complete and swipe-left-to-schedule
 * gestures using @use-gesture/react. Handles conflict resolution with scroll
 * and dnd-kit's TouchSensor (which uses delay: 250ms).
 */
export function TaskSwipeRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  onLongPress,
  disabled,
  rightIcon: RightIcon = Check,
  rightColor = "green",
  leftIcon: LeftIcon = CalendarDays,
  leftColor = "blue",
}: TaskSwipeRowProps) {
  const [deltaX, setDeltaX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [phase, setPhase] = useState<"idle" | "peek" | "commit" | "trigger">("idle");
  const [direction, setDirection] = useState<"left" | "right" | null>(null);
  const isVerticalRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const { trigger: haptic } = useHaptics();
  const prevPhaseRef = useRef<"idle" | "peek" | "commit" | "trigger">("idle");

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const bind = useDrag(
    ({
      first,
      last,
      movement: [mx, my],
      velocity: [vx],
      direction: [dx],
      cancel,
      touches,
      event,
    }) => {
      if (disabled) return;

      // Cancel multi-touch (pinch-to-zoom)
      if (touches > 1) {
        cancel();
        clearLongPress();
        resetState();
        return;
      }

      // Check interactive elements
      if (first) {
        const target = event.target as HTMLElement;
        if (target.closest("button, input, select, a")) {
          cancel();
          return;
        }
      }

      if (first) {
        isVerticalRef.current = false;
        longPressFiredRef.current = false;
        // Start long-press timer
        clearLongPress();
        longPressTimerRef.current = setTimeout(() => {
          if (!isSwiping && Math.abs(mx) < 10) {
            longPressFiredRef.current = true;
            haptic("longPress");
            onLongPress?.();
            cancel();
            resetState();
          }
        }, LONG_PRESS_DURATION);
      }

      // Wait for enough movement data before deciding
      if (!isSwiping && Math.abs(mx) < 10 && first) {
        return; // Wait for more movement data
      }

      // Cancel long press on any significant movement
      if (Math.abs(mx) > 5) {
        clearLongPress();
      }

      // If vertical scroll detected early, cancel swipe
      if (first && Math.abs(my) > Math.abs(mx) * 1.5) {
        isVerticalRef.current = true;
      }
      if (isVerticalRef.current) {
        cancel();
        resetState();
        return;
      }

      // Significant horizontal movement — this is a swipe
      if (Math.abs(mx) > 10) {
        setIsSwiping(true);
        clearLongPress();
      }

      const clampedX = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, mx));
      const progress = Math.abs(clampedX) / THRESHOLD;

      // Determine current phase
      let currentPhase: "idle" | "peek" | "commit" | "trigger" = "idle";
      if (Math.abs(clampedX) > 40) currentPhase = "peek";
      if (Math.abs(clampedX) > 100) currentPhase = "commit";
      if (progress >= 1) currentPhase = "trigger";

      // Haptic on phase transitions
      if (currentPhase !== prevPhaseRef.current) {
        if (currentPhase === "peek") haptic("light");
        if (currentPhase === "trigger") haptic("medium");
        prevPhaseRef.current = currentPhase;
      }

      if (!last) {
        setDeltaX(clampedX);
        setPhase(currentPhase);
        setDirection(clampedX > 0 ? "right" : clampedX < 0 ? "left" : null);
      } else {
        clearLongPress();
        const triggered = Math.abs(mx) > THRESHOLD || vx > VELOCITY_THRESHOLD;

        if (triggered && dx > 0 && onSwipeRight) {
          haptic("success");
          onSwipeRight();
        } else if (triggered && dx < 0 && onSwipeLeft) {
          haptic("light");
          onSwipeLeft();
        }

        resetState();
      }
    },
    {
      axis: "x",
      filterTaps: true,
      pointer: { touch: true },
      // Don't interfere with dnd-kit which uses delay: 250ms
      // Swipe responds to immediate horizontal movement
    },
  );

  function resetState() {
    clearLongPress();
    setDeltaX(0);
    setIsSwiping(false);
    setPhase("idle");
    setDirection(null);
    prevPhaseRef.current = "idle";
  }

  const showCompleteIndicator = direction === "right" && phase !== "idle";
  const showScheduleIndicator = direction === "left" && phase !== "idle";

  return (
    <div className="relative overflow-hidden touch-pan-y">
      {/* Swipe-right indicator */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 flex items-center px-4 transition-opacity",
          showCompleteIndicator ? "opacity-100" : "opacity-0",
          phase === "trigger" && direction === "right"
            ? SWIPE_COLORS[rightColor].bg
            : SWIPE_COLORS[rightColor].bgFaint,
        )}
        style={{ width: Math.max(0, deltaX) }}
      >
        <RightIcon
          className={cn(
            "h-5 w-5 transition-transform",
            phase === "trigger" ? "text-white scale-125" : SWIPE_COLORS[rightColor].text,
          )}
        />
      </div>

      {/* Swipe-left indicator */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex items-center justify-end px-4 transition-opacity",
          showScheduleIndicator ? "opacity-100" : "opacity-0",
          phase === "trigger" && direction === "left"
            ? SWIPE_COLORS[leftColor].bg
            : SWIPE_COLORS[leftColor].bgFaint,
        )}
        style={{ width: Math.max(0, -deltaX) }}
      >
        <LeftIcon
          className={cn(
            "h-5 w-5 transition-transform",
            phase === "trigger" ? "text-white scale-125" : SWIPE_COLORS[leftColor].text,
          )}
        />
      </div>

      {/* Content */}
      <div
        {...bind()}
        className="relative"
        style={{
          transform: isSwiping ? `translateX(${deltaX}px)` : undefined,
          transition: isSwiping ? "none" : "transform 0.2s ease",
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}
