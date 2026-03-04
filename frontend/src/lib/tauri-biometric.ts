/**
 * TypeScript wrapper around Tauri biometric commands.
 *
 * Biometric auth gates access to the encryption key stored in the app's
 * secure store. Web Crypto API still does all encryption/decryption —
 * biometric only gates access to the stored derived key.
 */

import { isTauri } from "@/hooks/use-device";

export interface BiometricAvailability {
  available: boolean;
  /** "FaceID", "TouchID", or "None" */
  biometryType: string;
}

/**
 * Check if biometric authentication is available on this device.
 * Returns { available: false } on web and desktop.
 */
export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  if (!isTauri) return { available: false, biometryType: "None" };
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<BiometricAvailability>("check_biometric_availability");
  } catch (e) {
    console.warn("Biometric availability check failed:", e);
    return { available: false, biometryType: "None" };
  }
}

/**
 * Store the encryption key with biometric protection.
 * Triggers biometric prompt on mobile before storing.
 *
 * @param keyData Base64-encoded AES-256-GCM key from Web Crypto exportKey()
 */
export async function storeEncryptionKey(keyData: string): Promise<void> {
  if (!isTauri) throw new Error("Biometric storage is only available in the native app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("store_encryption_key", { keyData });
}

/**
 * Retrieve the encryption key after biometric authentication.
 * Triggers biometric prompt (Face ID / fingerprint) on mobile.
 *
 * @returns Base64-encoded AES-256-GCM key, ready for Web Crypto importKey()
 */
export async function retrieveEncryptionKey(): Promise<string> {
  if (!isTauri) throw new Error("Biometric retrieval is only available in the native app");
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<string>("retrieve_encryption_key");
}

/**
 * Check if a biometric encryption key has been enrolled (without biometric prompt).
 * Used on app startup to derive biometricEnabled state.
 */
export async function hasStoredKey(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("has_stored_key");
  } catch {
    return false;
  }
}

/**
 * Clear the stored encryption key (when disabling biometric unlock).
 */
export async function clearEncryptionKey(): Promise<void> {
  if (!isTauri) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("clear_encryption_key");
  } catch (e) {
    console.warn("Failed to clear biometric encryption key:", e);
  }
}

/**
 * Human-readable label for the biometry type, suitable for button text.
 * e.g. "Face ID", "Touch ID", "Fingerprint", or "Biometric"
 */
export function biometryLabel(biometryType: string): string {
  switch (biometryType) {
    case "FaceID":
      return "Face ID";
    case "TouchID":
      return "Touch ID";
    default:
      return "Biometric";
  }
}
