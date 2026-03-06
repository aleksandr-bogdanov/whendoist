import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDevice } from "@/hooks/use-device";

const HINT_SHOWN_KEY = "gesture-hint-shown";
const LONGPRESS_HINT_KEY = "longpress-hint-shown";
const CMDK_HINT_KEY = "cmdk-hint-shown";
const HINT_DELAY_MS = 1500;

/**
 * Progressive disclosure of gestures (mobile) and keyboard shortcuts (desktop).
 *
 * (a) Animated swipe hint on first task row on first visit (mobile)
 * (b) Long-press tooltip toast shown once after first task interaction (mobile)
 * (c) Cmd+K palette hint shown once on first desktop visit
 */
export function GestureDiscovery() {
  const { t } = useTranslation();
  const { prefersTouch, hasTouch, hasMouse } = useDevice();
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
  const longPressTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isTouchDevice) return;
    if (localStorage.getItem(LONGPRESS_HINT_KEY)) return;

    // Listen for any task editor sheet closing (user interacted with a task)
    const handler = () => {
      if (localStorage.getItem(LONGPRESS_HINT_KEY)) return;
      localStorage.setItem(LONGPRESS_HINT_KEY, "1");

      longPressTimerRef.current = window.setTimeout(() => {
        toast.info(t("gesture.longPressHint"));
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
    return () => {
      document.removeEventListener("click", clickHandler);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, [isTouchDevice, t]);

  // (c) Cmd+K hint: show once on desktop after a short delay
  useEffect(() => {
    if (!hasMouse || prefersTouch) return;
    if (localStorage.getItem(CMDK_HINT_KEY)) return;

    const timer = setTimeout(() => {
      localStorage.setItem(CMDK_HINT_KEY, "1");
      const shortcut = navigator.platform?.includes("Mac") ? "⌘K" : "Ctrl+K";
      toast.info(t("gesture.commandPaletteHint", { shortcut }));
    }, 3000);

    return () => clearTimeout(timer);
  }, [hasMouse, prefersTouch, t]);

  return (
    <AnimatePresence>
      {showHint && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+var(--nav-pill-mb)+var(--nav-pill-height)+0.75rem)] left-4 right-4 z-50 rounded-xl bg-foreground/90 px-4 py-3 text-center text-sm text-background shadow-lg backdrop-blur-sm"
          onClick={() => setShowHint(false)}
        >
          {t("gesture.swipeHint")}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
