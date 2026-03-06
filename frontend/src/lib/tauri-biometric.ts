/**
 * TypeScript wrapper around Tauri biometric commands.
 *
 * Biometric auth gates access to the encryption key stored in the app's
 * secure store. Web Crypto API still does all encryption/decryption —
 * biometric only gates access to the stored derived key.
 */

import { isTauri } from "@/hooks/use-device";
import { TAURI_BIOMETRIC_TIMEOUT_MS, TAURI_IPC_TIMEOUT_MS } from "@/lib/tauri-constants";

export interface BiometricAvailability {
  available: boolean;
  /** "FaceID", "TouchID", or "None" */
  biometryType: string;
}

/** Race a promise against a timeout — rejects with TimeoutError if the promise doesn't settle in time */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Biometric IPC timeout")), ms)),
  ]);
}

/**
 * Check if biometric authentication is available on this device.
 * Returns { available: false } on web and desktop.
 */
export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  if (!isTauri) return { available: false, biometryType: "None" };
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await withTimeout(
      invoke<BiometricAvailability>("check_biometric_availability"),
      TAURI_IPC_TIMEOUT_MS,
    );
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
  await withTimeout(invoke("store_encryption_key", { keyData }), TAURI_BIOMETRIC_TIMEOUT_MS);
}

/**
 * Retrieve the encryption key after biometric authentication.
 * Triggers biometric prompt (Face ID / fingerprint) on mobile.
 * Uses a longer timeout (30s) to accommodate the biometric prompt.
 *
 * @returns Base64-encoded AES-256-GCM key, ready for Web Crypto importKey()
 */
export async function retrieveEncryptionKey(): Promise<string> {
  if (!isTauri) throw new Error("Biometric retrieval is only available in the native app");
  const { invoke } = await import("@tauri-apps/api/core");
  return await withTimeout(invoke<string>("retrieve_encryption_key"), TAURI_BIOMETRIC_TIMEOUT_MS);
}

/**
 * Check if a biometric encryption key has been enrolled (without biometric prompt).
 * Used on app startup to derive biometricEnabled state.
 */
export async function hasStoredKey(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await withTimeout(invoke<boolean>("has_stored_key"), TAURI_IPC_TIMEOUT_MS);
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
    await withTimeout(invoke("clear_encryption_key"), TAURI_IPC_TIMEOUT_MS);
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
