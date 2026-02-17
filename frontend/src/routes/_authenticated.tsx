import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useListDomainsApiV1DomainsGet } from "@/api/queries/domains/domains";
import { useGetMeApiV1MeGet } from "@/api/queries/me/me";
import { useGetEncryptionStatusApiV1PreferencesEncryptionGet } from "@/api/queries/preferences/preferences";
import { EncryptionUnlock } from "@/components/encryption-unlock";
import { AppShell } from "@/components/layout/app-shell";
import { useCryptoStore } from "@/stores/crypto-store";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const meQuery = useGetMeApiV1MeGet();
  const encryptionQuery = useGetEncryptionStatusApiV1PreferencesEncryptionGet();
  const domainsQuery = useListDomainsApiV1DomainsGet();

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

  // Loading state
  if (meQuery.isLoading) {
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

  return (
    <>
      <AppShell
        userName={me?.name ?? undefined}
        userEmail={me?.email}
        domains={domainsQuery.data}
      />
      {needsUnlock && encryptionStatus?.salt && encryptionStatus?.test_value && (
        <EncryptionUnlock
          open={true}
          salt={encryptionStatus.salt}
          testValue={encryptionStatus.test_value}
        />
      )}
    </>
  );
}
