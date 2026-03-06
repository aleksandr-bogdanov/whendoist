import { Eye, EyeOff, Fingerprint, KeyRound, Loader2, ScanFace } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isTauri } from "@/hooks/use-device";
import { unlockEncryption } from "@/lib/crypto";
import { isSupported as isWebAuthnSupported, unlockWithPasskey } from "@/lib/passkey";
import { biometryLabel } from "@/lib/tauri-biometric";
import { useCryptoStore } from "@/stores/crypto-store";

interface EncryptionUnlockProps {
  open: boolean;
  salt: string;
  testValue: string;
}

export function EncryptionUnlock({ open, salt, testValue }: EncryptionUnlockProps) {
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restoreKey = useCryptoStore((s) => s.restoreKey);
  const biometricEnabled = useCryptoStore((s) => s.biometricEnabled);
  const biometricAvailable = useCryptoStore((s) => s.biometricAvailable);
  const biometryType = useCryptoStore((s) => s.biometryType);
  const unlockWithBiometric = useCryptoStore((s) => s.unlockWithBiometric);
  const checkBiometric = useCryptoStore((s) => s.checkBiometric);

  // Check biometric availability when the dialog opens on Tauri
  useEffect(() => {
    if (open && isTauri) {
      checkBiometric();
    }
  }, [open, checkBiometric]);

  const handlePassphraseUnlock = async () => {
    if (!passphrase.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const success = await unlockEncryption(passphrase, salt, testValue);
      if (success) {
        setPassphrase("");
        await restoreKey();
        toast.success(t("encryption.unlocked"));
      } else {
        setPassphrase("");
        setError(t("encryption.incorrectPassphrase"));
      }
    } catch {
      setPassphrase("");
      setError(t("encryption.unlockFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyUnlock = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await unlockWithPasskey(testValue);
      if (result.success) {
        setPassphrase("");
        await restoreKey();
        toast.success(t("encryption.unlockedWithPasskey"));
      } else {
        setPassphrase("");
        setError(result.error ?? t("encryption.passkeyFailed"));
      }
    } catch {
      setPassphrase("");
      setError(t("encryption.passkeyFailedFallback"));
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricUnlock = async () => {
    setLoading(true);
    setError(null);

    try {
      const success = await unlockWithBiometric();
      if (success) {
        setPassphrase("");
        toast.success(t("encryption.unlockedWithBiometric", { type: biometryLabel(biometryType) }));
      } else {
        setError(t("encryption.biometricFailed", { type: biometryLabel(biometryType) }));
      }
    } catch {
      setError(t("encryption.biometricFailed", { type: biometryLabel(biometryType) }));
    } finally {
      setLoading(false);
    }
  };

  const showBiometric = isTauri && biometricEnabled && biometricAvailable;
  const biometricLabel = biometryLabel(biometryType);
  const BiometricIcon = biometryType === "FaceID" ? ScanFace : Fingerprint;

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {t("encryption.unlockTitle")}
          </DialogTitle>
          <DialogDescription>{t("encryption.unlockDescription")}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handlePassphraseUnlock();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="passphrase">{t("encryption.passphrase")}</Label>
            <div className="relative">
              <Input
                id="passphrase"
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder={t("encryption.passphrasePlaceholder")}
                disabled={loading}
                autoFocus={!showBiometric}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassphrase(!showPassphrase)}
              >
                {showPassphrase ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-2">
            {showBiometric && (
              <Button type="button" onClick={handleBiometricUnlock} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <BiometricIcon className="mr-2 h-4 w-4" />
                )}
                {t("encryption.unlockWithBiometric", { type: biometricLabel })}
              </Button>
            )}

            <Button
              type="submit"
              variant={showBiometric ? "outline" : "default"}
              disabled={loading || !passphrase.trim()}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              {t("encryption.unlockWithPassphrase")}
            </Button>

            {isWebAuthnSupported() && (
              <Button
                type="button"
                variant="outline"
                onClick={handlePasskeyUnlock}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Fingerprint className="mr-2 h-4 w-4" />
                )}
                {t("encryption.unlockWithPasskey")}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
