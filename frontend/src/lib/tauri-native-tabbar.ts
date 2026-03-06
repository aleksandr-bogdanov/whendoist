/**
 * Native iOS UITabBar IPC wrapper.
 *
 * On iOS, a Swift plugin (NativeTabBarPlugin) replaces the CSS bottom nav
 * with a real UITabBar that gets Liquid Glass styling on iOS 26+.
 *
 * 5 navigation tabs (per Apple HIG — no action buttons in tab bar):
 *   Thoughts | Tasks | Calendar | Analytics | Settings
 *
 * Communication:
 *   Swift → JS: `evaluateJavaScript("window.__nativeTabBarEvent(...)")`
 *     - "ready"    — tab bar shown + measured, payload: { tabBarHeight, safeAreaBottom }
 *     - "navigate" — user tapped a tab, payload: { route, index }
 *
 *   JS → Swift: `window.webkit.messageHandlers.nativeTabBar.postMessage(...)`
 *     - {action: "hide"} — hide tab bar (wizard/modal overlay)
 *     - {action: "show"} — restore tab bar
 *
 *   Tab bar auto-hides on login/unauthenticated routes via URL observation (KVO).
 */

import { isTauri } from "@/hooks/use-device";
import { TAURI_IPC_TIMEOUT_MS } from "@/lib/tauri-constants";

/** Route-to-tab-index mapping — must match the Swift `tabs` array order exactly.
 * /calendar is a virtual route — in the actual app it's /dashboard with mobileTab="calendar".
 * setActiveTab handles this by checking the UI store's mobileTab state. */
const ROUTE_TO_INDEX: Record<string, number> = {
  "/thoughts": 0,
  "/dashboard": 1,
  "/calendar": 2,
  "/analytics": 3,
  "/settings": 4,
};

type CleanupFn = () => void;

export interface NativeTabBarCallbacks {
  onNavigate: (route: string) => void;
}

let _ready = false;

// Extend Window for the global event bridge + WKWebView message handlers
declare global {
  interface Window {
    __nativeTabBarEvent?: (event: string, data: Record<string, unknown>) => void;
    webkit?: {
      messageHandlers?: {
        nativeTabBar?: {
          postMessage: (body: Record<string, unknown>) => void;
        };
      };
    };
  }
}

/** Whether the native tab bar is available (Tauri iOS only) */
export function isNativeTabBarAvailable(): boolean {
  if (!isTauri) return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Whether the native tab bar has finished initializing */
export function isNativeTabBarReady(): boolean {
  return _ready;
}

/**
 * Initialize the native tab bar event handler.
 * Registers a global callback that Swift calls via evaluateJavaScript
 * when the tab bar is ready or when a tab is tapped.
 *
 * Tab bar visibility is managed by Swift via URL observation — no JS commands needed.
 */
export async function initNativeTabBar(callbacks: NativeTabBarCallbacks): Promise<CleanupFn> {
  if (!isNativeTabBarAvailable()) return () => {};

  // Register global event handler that Swift calls via evaluateJavaScript
  window.__nativeTabBarEvent = (event: string, data: Record<string, unknown>) => {
    if (event === "ready") {
      _ready = true;
      const tabBarHeight = data.tabBarHeight as number;
      const safeAreaBottom = data.safeAreaBottom as number;
      const root = document.documentElement;
      root.style.setProperty("--native-tabbar-height", `${tabBarHeight}px`);
      root.style.setProperty("--native-safe-area-bottom", `${safeAreaBottom}px`);
      document.body.classList.add("native-tabbar");
    } else if (event === "navigate") {
      callbacks.onNavigate(data.route as string);
    }
  };

  return () => {
    delete window.__nativeTabBarEvent;
    _ready = false;
    document.body.classList.remove("native-tabbar");
  };
}

/**
 * Hide the native tab bar (e.g. during wizard/modal overlays).
 * Uses WKScriptMessageHandler — direct WKWebView bridge, no Tauri IPC.
 */
export function hideNativeTabBar(): void {
  if (!isNativeTabBarAvailable()) return;
  try {
    window.webkit?.messageHandlers?.nativeTabBar?.postMessage({ action: "hide" });
  } catch {
    // Not available outside WKWebView
  }
}

/**
 * Show the native tab bar (e.g. after wizard/modal dismissal).
 */
export function showNativeTabBar(): void {
  if (!isNativeTabBarAvailable()) return;
  try {
    window.webkit?.messageHandlers?.nativeTabBar?.postMessage({ action: "show" });
  } catch {
    // Not available outside WKWebView
  }
}

/**
 * Sync the native tab bar indicator to match the current route.
 * Call this when JS-side navigation occurs (deep links, programmatic navigate).
 *
 * Note: invoke commands may not route through the Rust plugin shell reliably.
 * If set_active_tab doesn't work, the URL observer in Swift will still keep
 * the tab bar visible on the correct routes — only the selected indicator
 * might be out of sync, which is cosmetic.
 */
export async function setActiveTab(route: string, mobileTab?: string): Promise<void> {
  if (!_ready) return;

  const index = findTabIndex(route, mobileTab);
  if (index === -1) return;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await Promise.race([
      invoke("plugin:native_tabbar|set_active_tab", { index }),
      new Promise<void>((resolve) => setTimeout(resolve, TAURI_IPC_TIMEOUT_MS)),
    ]);
  } catch {
    // Invoke may fail if Rust doesn't route to Swift — cosmetic only
  }
}

/** Find tab index for a given pathname (prefix match).
 * For /dashboard, uses mobileTab to distinguish Tasks (index 1) vs Calendar (index 2). */
function findTabIndex(pathname: string, mobileTab?: string): number {
  if (pathname.startsWith("/dashboard")) {
    return mobileTab === "calendar" ? 2 : 1;
  }
  for (const [route, index] of Object.entries(ROUTE_TO_INDEX)) {
    if (pathname.startsWith(route)) return index;
  }
  return -1;
}
