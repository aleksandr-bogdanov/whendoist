import { Outlet } from "@tanstack/react-router";
import type { DomainResponse } from "@/api/model";
import { DemoPill } from "@/components/demo-pill";
import { LiveAnnouncer } from "@/components/live-announcer";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";

interface AppShellProps {
  userName?: string;
  userEmail?: string;
  domains?: DomainResponse[];
}

export function AppShell({ userName, userEmail, domains }: AppShellProps) {
  return (
    <div className="flex h-[var(--app-height,100vh)] flex-col">
      <Header userName={userName} userEmail={userEmail} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar domains={domains} />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <DemoPill />
      <LiveAnnouncer />
    </div>
  );
}
