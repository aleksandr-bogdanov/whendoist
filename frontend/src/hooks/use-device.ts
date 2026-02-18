import { useEffect, useSyncExternalStore } from "react";

interface DeviceCapabilities {
  prefersTouch: boolean;
  hasTouch: boolean;
  hasMouse: boolean;
  isHybrid: boolean;
  isMobileViewport: boolean;
  isPhoneViewport: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isPWA: boolean;
  prefersReducedMotion: boolean;
}

function getCapabilities(): DeviceCapabilities {
  if (typeof window === "undefined") {
    return {
      prefersTouch: false,
      hasTouch: false,
      hasMouse: true,
      isHybrid: false,
      isMobileViewport: false,
      isPhoneViewport: false,
      isIOS: false,
      isAndroid: false,
      isPWA: false,
      prefersReducedMotion: false,
    };
  }

  const prefersTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const hasMouse = window.matchMedia("(hover: hover)").matches;

  return {
    prefersTouch,
    hasTouch,
    hasMouse,
    isHybrid: hasTouch && hasMouse,
    isMobileViewport: window.matchMedia("(max-width: 900px)").matches,
    isPhoneViewport: window.matchMedia("(max-width: 580px)").matches,
    isIOS:
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    isAndroid: /Android/.test(navigator.userAgent),
    isPWA:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true,
    prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

// External store for capabilities — listeners re-fire on media query changes
let cachedCapabilities = getCapabilities();
const listeners = new Set<() => void>();

// Handler registered once at module scope to avoid O(n²) duplication
const handler = () => {
  cachedCapabilities = getCapabilities();
  for (const listener of listeners) listener();
};

// Register media query listeners once at module level
if (typeof window !== "undefined") {
  for (const query of [
    "(hover: none)",
    "(max-width: 900px)",
    "(max-width: 580px)",
    "(prefers-reduced-motion: reduce)",
    "(display-mode: standalone)",
  ]) {
    window.matchMedia(query).addEventListener("change", handler);
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): DeviceCapabilities {
  return cachedCapabilities;
}

function getServerSnapshot(): DeviceCapabilities {
  return getCapabilities();
}

/**
 * Hook that detects device capabilities (touch, mouse, iOS, PWA, etc.)
 * and applies CSS classes to document.body.
 */
export function useDevice(): DeviceCapabilities {
  const capabilities = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Apply CSS classes to body
  useEffect(() => {
    const body = document.body;
    body.classList.toggle("touch-device", capabilities.prefersTouch);
    body.classList.toggle("mouse-device", !capabilities.prefersTouch);
    body.classList.toggle("hybrid-device", capabilities.isHybrid);
    body.classList.toggle("mobile-viewport", capabilities.isMobileViewport);
    body.classList.toggle("phone-viewport", capabilities.isPhoneViewport);
    body.classList.toggle("pwa-mode", capabilities.isPWA);
    body.classList.toggle("ios-device", capabilities.isIOS);
    body.classList.toggle("android-device", capabilities.isAndroid);
    body.classList.toggle("reduced-motion", capabilities.prefersReducedMotion);
  }, [capabilities]);

  return capabilities;
}
