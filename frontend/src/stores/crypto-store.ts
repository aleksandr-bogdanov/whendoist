import { create } from "zustand";
import { clearStoredKey, exportKey, getStoredKey, importKey, storeKey } from "@/lib/crypto";
import {
  type BiometricAvailability,
  checkBiometricAvailability,
  clearEncryptionKey,
  hasStoredKey as hasStoredBiometricKey,
  retrieveEncryptionKey,
  storeEncryptionKey,
} from "@/lib/tauri-biometric";

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
  /** Count of fields that failed decryption since last unlock */
  decryptionFailures: number;
  /** Whether biometric unlock is enrolled for this device */
  biometricEnabled: boolean;
  /** Whether the device supports biometric authentication */
  biometricAvailable: boolean;
  /** The type of biometric available (FaceID, TouchID, None) */
  biometryType: string;
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
  /** Increment decryption failure counter */
  incrementDecryptionFailures: () => void;
  /** Reset decryption failure counter */
  resetDecryptionFailures: () => void;
  /** Check biometric availability and update state */
  checkBiometric: () => Promise<BiometricAvailability>;
  /** Enroll biometric unlock — exports current key and stores via biometric */
  enrollBiometric: () => Promise<void>;
  /** Unlock encryption using biometric — retrieves key from secure store */
  unlockWithBiometric: () => Promise<boolean>;
  /** Disable biometric unlock — clears stored key */
  disableBiometric: () => Promise<void>;
  /** Update biometricEnabled state (e.g. from persisted preference) */
  setBiometricEnabled: (enabled: boolean) => void;
}

export const useCryptoStore = create<CryptoState & CryptoActions>((set, get) => ({
  encryptionEnabled: false,
  derivedKey: null,
  isUnlocked: false,
  salt: null,
  testValue: null,
  decryptionFailures: 0,
  biometricEnabled: false,
  biometricAvailable: false,
  biometryType: "None",

  setKey: async (key) => {
    await storeKey(key);
    set({ derivedKey: key, isUnlocked: true, decryptionFailures: 0 });
  },

  clearKey: () => {
    clearStoredKey();
    set({ derivedKey: null, isUnlocked: false });
  },

  setEnabled: (enabled, salt = null, testValue = null) => {
    set({ encryptionEnabled: enabled, salt, testValue });
  },

  incrementDecryptionFailures: () => {
    set((state) => ({ decryptionFailures: state.decryptionFailures + 1 }));
  },

  resetDecryptionFailures: () => {
    set({ decryptionFailures: 0 });
  },

  restoreKey: async () => {
    const key = await getStoredKey();
    if (key) {
      set({ derivedKey: key, isUnlocked: true, decryptionFailures: 0 });
    }
  },

  checkBiometric: async () => {
    const result = await checkBiometricAvailability();
    // Probe whether a key is already enrolled (persisted in store).
    // This survives app restarts — no biometric prompt triggered.
    const enrolled = await hasStoredBiometricKey();
    set({
      biometricAvailable: result.available,
      biometryType: result.biometryType,
      biometricEnabled: enrolled,
    });
    return result;
  },

  enrollBiometric: async () => {
    const { derivedKey } = get();
    if (!derivedKey) {
      throw new Error("Encryption must be unlocked before enrolling biometric");
    }

    // Export the CryptoKey to base64 for storage
    const keyData = await exportKey(derivedKey);

    // Store in secure store (triggers biometric prompt on mobile)
    await storeEncryptionKey(keyData);

    set({ biometricEnabled: true });
  },

  unlockWithBiometric: async () => {
    try {
      // Retrieve key from secure store (triggers biometric prompt)
      const keyData = await retrieveEncryptionKey();

      // Import back to CryptoKey
      const key = await importKey(keyData);

      // Store in session and update state
      await storeKey(key);
      set({ derivedKey: key, isUnlocked: true, decryptionFailures: 0 });
      return true;
    } catch (e) {
      console.error("Biometric unlock failed:", e);
      return false;
    }
  },

  disableBiometric: async () => {
    await clearEncryptionKey();
    set({ biometricEnabled: false });
  },

  setBiometricEnabled: (enabled) => {
    set({ biometricEnabled: enabled });
  },
}));
