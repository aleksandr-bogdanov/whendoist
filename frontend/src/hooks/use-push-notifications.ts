/**
 * usePushNotifications — register device push token with the backend.
 *
 * On mount (mobile Tauri only):
 * 1. Listens for "push-token-received" Tauri event from Rust
 * 2. Compares with locally stored token → if different, registers with backend
 * 3. Stores token locally for change detection on next launch
 *
 * On unmount (logout): unregisters from backend and clears stored token.
 *
 * No-op when not running in Tauri or on desktop.
 *
 * v0.61.0: Phase 2 — Push Notifications / Remote Reminders
 */

import { useEffect, useRef } from "react";
import { isTauri } from "@/hooks/use-device";
import {
  clearPushToken,
  getPushTokenFromRust,
  getStoredPushToken,
  registerPushTokenWithBackend,
  storePushToken,
  unregisterPushTokenFromBackend,
} from "@/lib/tauri-push";

/** Detect platform from user agent. */
function detectPlatform(): "ios" | "android" | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }
  if (/Android/.test(ua)) {
    return "android";
  }
  return null;
}

export function usePushNotifications() {
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isTauri) return;

    const platform = detectPlatform();
    if (!platform) return; // Desktop — push not applicable

    let unlisten: (() => void) | null = null;

    async function handleToken(token: string) {
      tokenRef.current = token;
      const stored = await getStoredPushToken();

      if (stored === token) {
        // Token unchanged — no need to re-register
        return;
      }

      try {
        await registerPushTokenWithBackend(token, platform!);
        await storePushToken(token);
      } catch (e) {
        console.warn("Failed to register push token with backend:", e);
      }
    }

    async function setup() {
      // Listen for token events from Rust (emitted during app setup)
      const { listen } = await import("@tauri-apps/api/event");
      const unlistenFn = await listen<string>("push-token-received", (event) => {
        handleToken(event.payload);
      });
      unlisten = unlistenFn;

      // Also check if Rust already has a token (race: token arrived before listener)
      const existingToken = await getPushTokenFromRust();
      if (existingToken) {
        handleToken(existingToken);
      }
    }

    setup();

    return () => {
      unlisten?.();

      // On unmount (logout/app close): unregister from backend
      if (tokenRef.current) {
        unregisterPushTokenFromBackend(tokenRef.current).catch(() => {
          // Best-effort — don't block logout
        });
        clearPushToken().catch(() => {});
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
