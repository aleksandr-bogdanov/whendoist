import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDevice } from "@/hooks/use-device";

const HINT_SHOWN_KEY = "gesture-hint-shown";
const LONGPRESS_HINT_KEY = "longpress-hint-shown";
const HINT_DELAY_MS = 1500;

/**
 * Progressive disclosure of swipe and long-press gestures on mobile.
 *
 * (a) Animated swipe hint on first task row on first visit
 * (b) Long-press tooltip toast shown once after first task interaction
 */
export function GestureDiscovery() {
  const { prefersTouch, hasTouch } = useDevice();
  const [showHint, setShowHint] = useState(false);
  const isTouchDevice = prefersTouch || hasTouch;

  // (a) Animated swipe hint on first visit
  useEffect(() => {
    if (!isTouchDevice) return;
    if (localStorage.getItem(HINT_SHOWN_KEY)) return;

    const timer = setTimeout(() => {
      const firstTask = document.querySelector("[data-task-swipe-row]");
      if (!firstTask) return;

      localStorage.setItem(HINT_SHOWN_KEY, "1");
      setShowHint(true);

      // Auto-dismiss after 4 seconds
      setTimeout(() => setShowHint(false), 4000);
    }, HINT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isTouchDevice]);

  // (b) Long-press hint: show once after first task editor close
  useEffect(() => {
    if (!isTouchDevice) return;
    if (localStorage.getItem(LONGPRESS_HINT_KEY)) return;

    // Listen for any task editor sheet closing (user interacted with a task)
    const handler = () => {
      if (localStorage.getItem(LONGPRESS_HINT_KEY)) return;
      localStorage.setItem(LONGPRESS_HINT_KEY, "1");

      setTimeout(() => {
        toast.info("Tip: long-press any task for quick actions", { duration: 4000 });
      }, 500);
    };

    // We'll trigger on the first click of a task title (task editing opens)
    const clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-task-title-btn]")) {
        handler();
        document.removeEventListener("click", clickHandler);
      }
    };

    document.addEventListener("click", clickHandler);
    return () => document.removeEventListener("click", clickHandler);
  }, [isTouchDevice]);

  return (
    <AnimatePresence>
      {showHint && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-20 left-4 right-4 z-50 rounded-xl bg-foreground/90 px-4 py-3 text-center text-sm text-background shadow-lg backdrop-blur-sm"
          onClick={() => setShowHint(false)}
        >
          Swipe right to complete, left to schedule. Long-press for more.
        </motion.div>
      )}
    </AnimatePresence>
  );
}
