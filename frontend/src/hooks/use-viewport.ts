import { useEffect, useRef } from "react";

/**
 * Manages the --app-height CSS property for iOS PWA viewport fix
 * and detects virtual keyboard open/close.
 *
 * In PWA standalone mode, innerHeight underreports on iOS by safe-area-inset-top.
 * screen.height is always correct. See docs/PWA-VIEWPORT-FIX.md.
 */
export function useViewport() {
  const initialHeightRef = useRef<number>(typeof window !== "undefined" ? window.innerHeight : 0);

  useEffect(() => {
    function updateViewportHeight() {
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone;
      const h = isStandalone ? screen.height : window.innerHeight;
      const vh = h * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
      document.documentElement.style.setProperty("--app-height", `${h}px`);
    }

    // Initial update
    updateViewportHeight();

    // Debounced resize handler
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateViewportHeight, 100);
    };

    // Keyboard detection
    const handleKeyboardResize = () => {
      const currentHeight = window.innerHeight;
      const heightDiff = initialHeightRef.current - currentHeight;
      document.body.classList.toggle("keyboard-open", heightDiff > 150);
    };

    // Input focus tracking
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches("input, textarea, select")) {
        document.body.classList.add("has-input-focus");
      }
    };

    const handleFocusOut = () => {
      document.body.classList.remove("has-input-focus");
    };

    const handleOrientationChange = () => {
      setTimeout(updateViewportHeight, 100);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("resize", handleKeyboardResize);
    window.addEventListener("orientationchange", handleOrientationChange);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("resize", handleKeyboardResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);
}
