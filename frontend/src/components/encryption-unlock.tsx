import { Eye, EyeOff, Fingerprint, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
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
import { unlockEncryption } from "@/lib/crypto";
import { isSupported as isWebAuthnSupported, unlockWithPasskey } from "@/lib/passkey";
import { useCryptoStore } from "@/stores/crypto-store";

interface EncryptionUnlockProps {
  open: boolean;
  salt: string;
  testValue: string;
}

export function EncryptionUnlock({ open, salt, testValue }: EncryptionUnlockProps) {
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restoreKey = useCryptoStore((s) => s.restoreKey);

  const handlePassphraseUnlock = async () => {
    if (!passphrase.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const success = await unlockEncryption(passphrase, salt, testValue);
      if (success) {
        setPassphrase("");
        await restoreKey();
        toast.success("Encryption unlocked");
      } else {
        setPassphrase("");
        setError("Incorrect passphrase. Please try again.");
      }
    } catch {
      setPassphrase("");
      setError("Failed to unlock encryption. Please try again.");
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
        toast.success("Encryption unlocked with passkey");
      } else {
        setPassphrase("");
        setError(result.error ?? "Passkey authentication failed");
      }
    } catch {
      setPassphrase("");
      setError("Passkey unlock failed. Try your passphrase instead.");
    } finally {
      setLoading(false);
    }
  };

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
            Unlock Encryption
          </DialogTitle>
          <DialogDescription>Enter your passphrase to decrypt your data.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handlePassphraseUnlock();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="passphrase">Passphrase</Label>
            <div className="relative">
              <Input
                id="passphrase"
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter your encryption passphrase"
                disabled={loading}
                autoFocus
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
            <Button type="submit" disabled={loading || !passphrase.trim()}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              Unlock
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
                Unlock with Passkey
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
