import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="text-center space-y-3">
        <LayoutDashboard className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground max-w-md">
          The task dashboard is being built in the next phase. Check out{" "}
          <a href="/settings" className="text-primary hover:underline">
            Settings
          </a>{" "}
          and{" "}
          <a href="/thoughts" className="text-primary hover:underline">
            Thoughts
          </a>{" "}
          in the meantime.
        </p>
      </div>
    </div>
  );
}
