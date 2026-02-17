import { create } from "zustand";
import { clearStoredKey, getStoredKey, storeKey } from "@/lib/crypto";

interface CryptoState {
  /** Whether the user has encryption enabled */
  encryptionEnabled: boolean;
  /** The derived AES-256-GCM key (in-memory only) */
  derivedKey: CryptoKey | null;
  /** Whether the encryption has been unlocked this session */
  isUnlocked: boolean;
  /** Base64-encoded salt for key derivation */
  salt: string | null;
  /** Encrypted test value for passphrase verification */
  testValue: string | null;
}

interface CryptoActions {
  /** Store a derived key and mark as unlocked */
  setKey: (key: CryptoKey) => Promise<void>;
  /** Clear the key and lock encryption */
  clearKey: () => void;
  /** Update encryption enabled state from server preferences */
  setEnabled: (enabled: boolean, salt?: string | null, testValue?: string | null) => void;
  /** Restore key from sessionStorage on app load */
  restoreKey: () => Promise<void>;
}

export const useCryptoStore = create<CryptoState & CryptoActions>((set) => ({
  encryptionEnabled: false,
  derivedKey: null,
  isUnlocked: false,
  salt: null,
  testValue: null,

  setKey: async (key) => {
    await storeKey(key);
    set({ derivedKey: key, isUnlocked: true });
  },

  clearKey: () => {
    clearStoredKey();
    set({ derivedKey: null, isUnlocked: false });
  },

  setEnabled: (enabled, salt = null, testValue = null) => {
    set({ encryptionEnabled: enabled, salt, testValue });
  },

  restoreKey: async () => {
    const key = await getStoredKey();
    if (key) {
      set({ derivedKey: key, isUnlocked: true });
    }
  },
}));
