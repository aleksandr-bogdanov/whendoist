import { Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { DemoPill } from "@/components/demo-pill";
import { LiveAnnouncer } from "@/components/live-announcer";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";
import { PwaDebugOverlay } from "./pwa-debug-overlay";

interface AppShellProps {
  userName?: string;
  userEmail?: string;
}

export function AppShell({ userName, userEmail }: AppShellProps) {
  const [debugActive, setDebugActive] = useState(() => sessionStorage.getItem("pwa-debug") === "1");

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
      {/* Desktop only — mobile version is in the header */}
      <div className="hidden md:block fixed bottom-4 right-4 z-50">
        <DemoPill />
      </div>
      <LiveAnnouncer />
      {debugActive && <PwaDebugOverlay onClose={() => toggleDebug()} />}
    </div>
  );
}
