import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { useDevice } from "@/hooks/use-device";
import { useGlobalKeyHandler } from "@/hooks/use-shortcuts";
import { useViewport } from "@/hooks/use-viewport";
import { TOAST_DURATION } from "@/lib/toast";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  // Apply device CSS classes and manage viewport height globally
  const { isMobileViewport } = useDevice();
  useViewport();

  // Global keyboard shortcut dispatcher
  useGlobalKeyHandler();

  return (
    <ThemeProvider>
      <RootErrorBoundary>
        <Outlet />
      </RootErrorBoundary>
      <Toaster
        richColors
        position={isMobileViewport ? "top-center" : "top-right"}
        toastOptions={{ duration: TOAST_DURATION }}
      />
    </ThemeProvider>
  );
}

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Root error boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[var(--app-height,100vh)] items-center justify-center p-8">
          <div className="text-center space-y-4 max-w-sm">
            <img
              src="/illustrations/error-generic.svg"
              alt=""
              aria-hidden="true"
              className="mx-auto h-20 w-20"
            />
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
