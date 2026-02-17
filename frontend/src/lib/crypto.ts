/**
 * Client-side E2E encryption for Whendoist.
 *
 * Uses Web Crypto API for:
 * - PBKDF2 key derivation from passphrase
 * - AES-256-GCM encryption/decryption
 *
 * Encrypted data format: base64(IV || ciphertext || authTag)
 * IV is 12 bytes, authTag is implicit in AES-GCM.
 *
 * This module is a pure utility — no global state or stores.
 * State management lives in crypto-store.ts.
 */

// ============================================================================
// Constants
// ============================================================================

export const PBKDF2_ITERATIONS = 600_000; // OWASP 2024 recommendation
const IV_LENGTH = 12; // 96 bits for AES-GCM
export const TEST_VALUE = "WHENDOIST_ENCRYPTION_TEST";
const KEY_STORAGE_KEY = "whendoist_encryption_key";

// ============================================================================
// Types
// ============================================================================

export interface EncryptionSetupResult {
  salt: string;
  testValue: string;
}

export interface TaskContentData {
  id: number;
  title: string;
  description: string | null;
}

export interface DomainContentData {
  id: number;
  name: string;
}

export interface BatchEncryptResult {
  tasks: TaskContentData[];
  domains: DomainContentData[];
}

// ============================================================================
// Encoding utilities
// ============================================================================

export function arrayToBase64(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array));
}

export function base64ToArray(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ============================================================================
// Low-level crypto utilities
// ============================================================================

/**
 * Derive an AES-256-GCM key from a passphrase using PBKDF2.
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true, // extractable for storage
    ["encrypt", "decrypt"],
  );
}

/**
 * Generate a random 32-byte salt for key derivation.
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns base64-encoded IV || ciphertext.
 */
export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return arrayToBase64(combined);
}

/**
 * Decrypt ciphertext using AES-256-GCM.
 * Expects base64-encoded IV || ciphertext.
 */
export async function decrypt(key: CryptoKey, ciphertext: string): Promise<string> {
  const combined = base64ToArray(ciphertext);
  const iv = combined.slice(0, IV_LENGTH);
  const data = combined.slice(IV_LENGTH);

  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);

  return new TextDecoder().decode(plaintext);
}

// ============================================================================
// Key export/import (for sessionStorage persistence across page refresh)
// ============================================================================

/**
 * Export a CryptoKey to base64 string for storage.
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return arrayToBase64(new Uint8Array(raw));
}

/**
 * Import a key from base64 string.
 */
export async function importKey(keyData: string): Promise<CryptoKey> {
  const raw = base64ToArray(keyData);
  return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

// ============================================================================
// Key storage (sessionStorage — cleared on tab close)
// ============================================================================

let cachedKey: CryptoKey | null = null;

/**
 * Store derived key in sessionStorage and memory cache.
 */
export async function storeKey(key: CryptoKey): Promise<void> {
  cachedKey = key;
  const keyData = await exportKey(key);
  sessionStorage.setItem(KEY_STORAGE_KEY, keyData);
}

/**
 * Retrieve stored key from memory cache or sessionStorage.
 */
export async function getStoredKey(): Promise<CryptoKey | null> {
  if (cachedKey) return cachedKey;

  const keyData = sessionStorage.getItem(KEY_STORAGE_KEY);
  if (!keyData) return null;

  cachedKey = await importKey(keyData);
  return cachedKey;
}

/**
 * Clear stored encryption key.
 */
export function clearStoredKey(): void {
  cachedKey = null;
  sessionStorage.removeItem(KEY_STORAGE_KEY);
}

/**
 * Check if encryption key is currently available.
 */
export function hasStoredKey(): boolean {
  return cachedKey !== null || sessionStorage.getItem(KEY_STORAGE_KEY) !== null;
}

// ============================================================================
// Setup & unlock flows
// ============================================================================

/**
 * Setup encryption with a new passphrase.
 * Generates salt, derives key, creates test value.
 */
export async function setupEncryption(passphrase: string): Promise<EncryptionSetupResult> {
  const salt = generateSalt();
  const key = await deriveKey(passphrase, salt);
  const testValue = await encrypt(key, TEST_VALUE);
  await storeKey(key);

  return {
    salt: arrayToBase64(salt),
    testValue,
  };
}

/**
 * Unlock encryption with existing passphrase.
 * Verifies against stored test value before storing key.
 */
export async function unlockEncryption(
  passphrase: string,
  saltBase64: string,
  testCiphertext: string,
): Promise<boolean> {
  const salt = base64ToArray(saltBase64);
  const key = await deriveKey(passphrase, salt);

  try {
    const decrypted = await decrypt(key, testCiphertext);
    if (decrypted !== TEST_VALUE) {
      return false;
    }
  } catch {
    return false;
  }

  await storeKey(key);
  return true;
}

/**
 * Test if a passphrase is correct without storing the key.
 */
export async function verifyPassphrase(
  passphrase: string,
  saltBase64: string,
  testCiphertext: string,
): Promise<boolean> {
  try {
    const salt = base64ToArray(saltBase64);
    const key = await deriveKey(passphrase, salt);
    const decrypted = await decrypt(key, testCiphertext);
    return decrypted === TEST_VALUE;
  } catch {
    return false;
  }
}

// ============================================================================
// Field encryption/decryption
// ============================================================================

/**
 * Check if a value looks like encrypted data (base64 with min length).
 * AES-256-GCM: 12 bytes IV + ciphertext + 16 bytes tag = min 28 bytes = ~38 base64 chars
 */
export function looksEncrypted(value: string | null | undefined): boolean {
  if (!value || value.length < 38) return false;
  return /^[A-Za-z0-9+/]+=*$/.test(value);
}

/**
 * Encrypt a field value if a key is provided.
 */
export async function encryptField(value: string | null, key: CryptoKey): Promise<string | null> {
  if (!value) return value;
  return await encrypt(key, value);
}

/**
 * Decrypt a field value if a key is provided.
 * Returns original value on decryption failure (graceful degradation).
 */
export async function decryptField(value: string | null, key: CryptoKey): Promise<string | null> {
  if (!value) return value;
  try {
    return await decrypt(key, value);
  } catch (e) {
    console.error("Decryption failed:", e);
    return value;
  }
}

// ============================================================================
// Batch operations (for enable/disable encryption)
// ============================================================================

/**
 * Encrypt all tasks and domains for enabling encryption.
 * Skips values that already look encrypted.
 */
export async function encryptAllData(
  key: CryptoKey,
  tasks: TaskContentData[],
  domains: DomainContentData[],
): Promise<BatchEncryptResult> {
  const encryptedTasks = await Promise.all(
    tasks.map(async (task) => ({
      id: task.id,
      title: looksEncrypted(task.title) ? task.title : await encrypt(key, task.title),
      description: task.description
        ? looksEncrypted(task.description)
          ? task.description
          : await encrypt(key, task.description)
        : null,
    })),
  );

  const encryptedDomains = await Promise.all(
    domains.map(async (domain) => ({
      id: domain.id,
      name: looksEncrypted(domain.name) ? domain.name : await encrypt(key, domain.name),
    })),
  );

  return { tasks: encryptedTasks, domains: encryptedDomains };
}

/**
 * Decrypt all tasks and domains for disabling encryption.
 * Returns original data on decryption failure.
 */
export async function decryptAllData(
  key: CryptoKey,
  tasks: TaskContentData[],
  domains: DomainContentData[],
): Promise<BatchEncryptResult> {
  const decryptedTasks = await Promise.all(
    tasks.map(async (task) => {
      try {
        return {
          id: task.id,
          title: await decrypt(key, task.title),
          description: task.description ? await decrypt(key, task.description) : null,
        };
      } catch (e) {
        console.error(`Failed to decrypt task ${task.id}:`, e);
        return task;
      }
    }),
  );

  const decryptedDomains = await Promise.all(
    domains.map(async (domain) => {
      try {
        return {
          id: domain.id,
          name: await decrypt(key, domain.name),
        };
      } catch (e) {
        console.error(`Failed to decrypt domain ${domain.id}:`, e);
        return domain;
      }
    }),
  );

  return { tasks: decryptedTasks, domains: decryptedDomains };
}
