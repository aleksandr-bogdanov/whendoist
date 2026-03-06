/**
 * Native iOS keyboard height bridge.
 *
 * Swift (NativeTabBarPlugin) sends keyboard events via evaluateJavaScript:
 *   window.__keyboardEvent(visible, {height, animationDuration})
 *
 * This module sets CSS variables and a body class so components can
 * reposition above the keyboard using pure CSS:
 *   --keyboard-height       (keyboard height minus safe area, in px)
 *   --keyboard-anim-duration (animation duration in seconds)
 *   body.keyboard-visible
 *
 * Mirrors the pattern of tauri-native-tabbar.ts.
 */

import { isTauri } from "@/hooks/use-device";

declare global {
  interface Window {
    __keyboardEvent?: (
      visible: boolean,
      data: { height: number; animationDuration: number },
    ) => void;
  }
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function initKeyboardBridge(): () => void {
  if (!isTauri || !isIOS()) return () => {};

  window.__keyboardEvent = (
    visible: boolean,
    data: { height: number; animationDuration: number },
  ) => {
    const root = document.documentElement;

    if (visible) {
      // The keyboard height from iOS includes the home indicator (safe area bottom).
      // CSS already accounts for safe area via env(safe-area-inset-bottom), so
      // subtract it to get the pure keyboard height above the content boundary.
      const safeBottom = Number.parseFloat(
        root.style.getPropertyValue("--native-safe-area-bottom") || "0",
      );
      const effectiveHeight = Math.max(0, data.height - safeBottom);

      root.style.setProperty("--keyboard-height", `${effectiveHeight}px`);
      root.style.setProperty("--keyboard-anim-duration", `${data.animationDuration}s`);
      document.body.classList.add("keyboard-visible");
    } else {
      root.style.setProperty("--keyboard-height", "0px");
      root.style.setProperty("--keyboard-anim-duration", `${data.animationDuration}s`);
      document.body.classList.remove("keyboard-visible");
    }
  };

  return () => {
    delete window.__keyboardEvent;
    document.body.classList.remove("keyboard-visible");
    document.documentElement.style.removeProperty("--keyboard-height");
    document.documentElement.style.removeProperty("--keyboard-anim-duration");
  };
}
