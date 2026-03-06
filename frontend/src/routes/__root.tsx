import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { useDevice } from "@/hooks/use-device";
import { useGlobalKeyHandler } from "@/hooks/use-shortcuts";
import { useViewport } from "@/hooks/use-viewport";
import i18n from "@/lib/i18n";
import { isNativeTabBarAvailable } from "@/lib/tauri-native-tabbar";
import { TOAST_DURATION } from "@/lib/toast";

export const Route = createRootRoute({
  component: RootLayout,
});

/** Sync document.documentElement.lang with the current i18n language. */
function useDocumentLang() {
  const { i18n: i18nInstance } = useTranslation();
  const lang = i18nInstance.resolvedLanguage ?? "en";
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}

function RootLayout() {
  // Apply device CSS classes and manage viewport height globally
  const { isMobileViewport } = useDevice();
  useViewport();
  useDocumentLang();

  // Global keyboard shortcut dispatcher
  useGlobalKeyHandler();

  return (
    <ThemeProvider>
      <RootErrorBoundary>
        <Outlet />
      </RootErrorBoundary>
      <Toaster
        richColors
        position={isNativeTabBarAvailable() ? "top-center" : "bottom-center"}
        offset={
          isNativeTabBarAvailable()
            ? "calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 0.5rem)"
            : isMobileViewport
              ? "calc(env(safe-area-inset-bottom, 0px) + var(--nav-pill-mb) + var(--nav-pill-height) + 0.75rem)"
              : undefined
        }
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
            <h1 className="text-lg font-semibold">{i18n.t("app.somethingWentWrong")}</h1>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || i18n.t("app.unexpectedError")}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {i18n.t("app.reload")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
