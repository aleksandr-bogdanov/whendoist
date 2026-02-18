import { createFileRoute } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { useListDomainsApiV1DomainsGet } from "@/api/queries/domains/domains";
import { useGetMeApiV1MeGet } from "@/api/queries/me/me";
import { useGetEncryptionStatusApiV1PreferencesEncryptionGet } from "@/api/queries/preferences/preferences";
import { useGetWizardStatusApiV1WizardStatusGet } from "@/api/queries/wizard/wizard";
import { EncryptionUnlock } from "@/components/encryption-unlock";
import { AppShell } from "@/components/layout/app-shell";
import { OnboardingWizard } from "@/components/wizard/onboarding-wizard";
import { useCryptoStore } from "@/stores/crypto-store";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const meQuery = useGetMeApiV1MeGet();
  const encryptionQuery = useGetEncryptionStatusApiV1PreferencesEncryptionGet();
  const domainsQuery = useListDomainsApiV1DomainsGet();
  const wizardQuery = useGetWizardStatusApiV1WizardStatusGet();
  const [wizardDismissed, setWizardDismissed] = useState(false);

  const isUnlocked = useCryptoStore((s) => s.isUnlocked);
  const setEnabled = useCryptoStore((s) => s.setEnabled);
  const restoreKey = useCryptoStore((s) => s.restoreKey);

  // Try to restore key from sessionStorage on mount
  useEffect(() => {
    restoreKey();
  }, [restoreKey]);

  // Sync encryption state from server
  const encryptionStatus = encryptionQuery.data;
  useEffect(() => {
    if (encryptionStatus) {
      setEnabled(
        encryptionStatus.enabled,
        encryptionStatus.salt ?? null,
        encryptionStatus.test_value ?? null,
      );
    }
  }, [encryptionStatus, setEnabled]);

  // Loading state — wait for both auth and encryption status
  // to avoid rendering child routes that would show ciphertext
  if (meQuery.isLoading || encryptionQuery.isLoading) {
    return (
      <div className="flex h-[var(--app-height,100vh)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  // Auth failed — redirect to login
  if (meQuery.isError) {
    window.location.href = "/login";
    return null;
  }

  const me = meQuery.data;

  const needsUnlock = encryptionStatus?.enabled && !isUnlocked;
  const showWizard = wizardQuery.data?.completed === false && !wizardDismissed;

  return (
    <AppErrorBoundary>
      {needsUnlock && encryptionStatus?.salt && encryptionStatus?.test_value ? (
        <EncryptionUnlock
          open={true}
          salt={encryptionStatus.salt}
          testValue={encryptionStatus.test_value}
        />
      ) : (
        <AppShell
          userName={me?.name ?? undefined}
          userEmail={me?.email}
          domains={domainsQuery.data}
        />
      )}
      {showWizard && <OnboardingWizard open={true} onComplete={() => setWizardDismissed(true)} />}
    </AppErrorBoundary>
  );
}

class AppErrorBoundary extends Component<
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
    console.error("App error boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[var(--app-height,100vh)] items-center justify-center p-8">
          <div className="text-center space-y-4 max-w-sm">
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <RefreshCw className="h-4 w-4" />
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
