import { Outlet } from "@tanstack/react-router";
import { DemoPill } from "@/components/demo-pill";
import { LiveAnnouncer } from "@/components/live-announcer";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";

interface AppShellProps {
  userName?: string;
  userEmail?: string;
}

export function AppShell({ userName, userEmail }: AppShellProps) {
  return (
    <div className="flex h-[var(--app-height,100vh)] flex-col">
      <Header userName={userName} userEmail={userEmail} />
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <Outlet />
      </main>
      <MobileNav />
      <DemoPill />
      <LiveAnnouncer />
    </div>
  );
}
