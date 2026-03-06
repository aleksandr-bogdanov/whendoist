import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FloatingActionBar } from "@/components/batch/floating-action-bar";
import { DemoPill } from "@/components/demo-pill";
import { LiveAnnouncer } from "@/components/live-announcer";
import { SearchPalette } from "@/components/search/search-palette";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { initKeyboardBridge } from "@/lib/tauri-keyboard";
import { initNativeTabBar, isNativeTabBarAvailable, setActiveTab } from "@/lib/tauri-native-tabbar";
import { useUIStore } from "@/stores/ui-store";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";
import { PwaDebugOverlay } from "./pwa-debug-overlay";

interface AppShellProps {
  userName?: string;
  userEmail?: string;
}

export function AppShell({ userName, userEmail }: AppShellProps) {
  const shortcutsHelpOpen = useUIStore((s) => s.shortcutsHelpOpen);
  const setShortcutsHelpOpen = useUIStore((s) => s.setShortcutsHelpOpen);
  const [debugActive, setDebugActive] = useState(() => sessionStorage.getItem("pwa-debug") === "1");

  // Native UITabBar (iOS Tauri only) — listen for tab taps and sync indicator on route changes
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!isNativeTabBarAvailable()) return;

    let cleanup: (() => void) | undefined;
    const cleanupKeyboard = initKeyboardBridge();

    const setMobileTab = useUIStore.getState().setMobileTab;

    initNativeTabBar({
      onNavigate: (route) => {
        if (route === "/calendar") {
          // Calendar is a sub-view of /dashboard, not a real route.
          // Navigate to dashboard and switch the mobile tab.
          setMobileTab("calendar");
          navigate({ to: "/dashboard" });
        } else {
          // If switching away from calendar tab to tasks tab, reset mobile tab
          if (route === "/dashboard") {
            setMobileTab("tasks");
          }
          navigate({ to: route });
        }
      },
    }).then((fn) => {
      cleanup = fn;
    });

    return () => {
      cleanup?.();
      cleanupKeyboard();
    };
  }, [navigate]);

  // Sync native tab indicator when route or mobileTab changes.
  // mobileTab matters because Tasks and Calendar share /dashboard —
  // setActiveTab reads it from the store to pick the right tab index.
  const mobileTab = useUIStore((s) => s.mobileTab);
  useEffect(() => {
    // Pass mobileTab context so setActiveTab can distinguish Tasks vs Calendar on /dashboard
    setActiveTab(pathname, mobileTab);
  }, [pathname, mobileTab]);

  function toggleDebug() {
    setDebugActive((prev) => {
      const next = !prev;
      if (next) {
        sessionStorage.setItem("pwa-debug", "1");
      } else {
        sessionStorage.removeItem("pwa-debug");
      }
      return next;
    });
  }

  return (
    <div className="flex h-[var(--app-height,100vh)] flex-col mx-auto w-full max-w-[1200px]">
      <Header userName={userName} userEmail={userEmail} onDebugToggle={toggleDebug} />
      <main className="flex flex-col flex-1 overflow-hidden md:pb-0 min-h-0">
        <Outlet />
      </main>
      <MobileNav />
      <FloatingActionBar />
      {/* Desktop only — mobile version is in the header */}
      <div className="hidden md:block fixed bottom-4 right-4 z-50">
        <DemoPill />
      </div>
      <LiveAnnouncer />
      <SearchPalette />
      <ShortcutsHelp open={shortcutsHelpOpen} onOpenChange={setShortcutsHelpOpen} />
      {debugActive && <PwaDebugOverlay onClose={() => toggleDebug()} />}
    </div>
  );
}
