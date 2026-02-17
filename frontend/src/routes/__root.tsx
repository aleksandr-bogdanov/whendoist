import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { useDevice } from "@/hooks/use-device";
import { useGlobalKeyHandler } from "@/hooks/use-shortcuts";
import { useViewport } from "@/hooks/use-viewport";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  // Apply device CSS classes and manage viewport height globally
  useDevice();
  useViewport();

  // Global keyboard shortcut dispatcher
  useGlobalKeyHandler();

  return (
    <ThemeProvider>
      <Outlet />
    </ThemeProvider>
  );
}
