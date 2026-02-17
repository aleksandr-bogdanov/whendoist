import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { useDevice } from "@/hooks/use-device";
import { useViewport } from "@/hooks/use-viewport";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  // Apply device CSS classes and manage viewport height globally
  useDevice();
  useViewport();

  return (
    <ThemeProvider>
      <Outlet />
    </ThemeProvider>
  );
}
