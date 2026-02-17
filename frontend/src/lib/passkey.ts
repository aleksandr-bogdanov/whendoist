/**
 * WebAuthn passkey handling for Whendoist E2E encryption.
 *
 * Architecture:
 * - Master key: the actual encryption key (from PBKDF2 passphrase or first passkey)
 * - Wrapping key: PRF-derived key used to wrap/unwrap the master key
 * - Each passkey stores: wrapped_key = encrypt(wrapping_key, master_key)
 *
 * Registration: Get master key from session -> wrap with PRF key -> store wrapped_key
 * Authentication: Get wrapped_key from server -> unwrap with PRF key -> verify -> store
 */

import { axios } from "@/lib/api-client";
import {
  decrypt as cryptoDecrypt,
  getStoredKey,
  hasStoredKey,
  storeKey,
  TEST_VALUE,
} from "@/lib/crypto";

// ============================================================================
// Constants
// ============================================================================

const PRF_SALT_PREFIX = "whendoist-e2e-encryption-v1:";
const IV_SIZE = 12;

// ============================================================================
// Types
// ============================================================================

export interface PasskeyResult {
  success: boolean;
  error?: string;
}

interface CredentialJSON {
  id: string;
  rawId: string;
  type: string;
  response: Record<string, unknown>;
}

interface CreateCredentialResult {
  credential: CredentialJSON;
  prfOutput: ArrayBuffer | null;
}

interface GetCredentialResult {
  credential: CredentialJSON;
  prfOutput: ArrayBuffer | null;
  credentialId: string;
}

interface ServerCreationOptions {
  challenge: string;
  user: { id: string; [key: string]: unknown };
  excludeCredentials?: Array<{ id: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

interface ServerRequestOptions {
  challenge: string;
  allowCredentials?: Array<{ id: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

// ============================================================================
// Browser support detection
// ============================================================================

export function isSupported(): boolean {
  return window.PublicKeyCredential !== undefined;
}

export async function isConditionalUISupported(): Promise<boolean> {
  if (!isSupported()) return false;
  try {
    return (await PublicKeyCredential.isConditionalMediationAvailable?.()) ?? false;
  } catch {
    return false;
  }
}

export function isPrfLikelySupported(): boolean {
  return isSupported();
}

// ============================================================================
// Encoding utilities
// ============================================================================

function stringToArray(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlToArray(base64url: string): Uint8Array {
  const base64 = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function generateRandomBase64url(length: number = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return arrayBufferToBase64url(bytes.buffer);
}

// ============================================================================
// PRF key derivation
// ============================================================================

function encodePrfInput(salt: string): Uint8Array {
  return stringToArray(PRF_SALT_PREFIX + salt);
}

async function prfOutputToWrappingKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", prfOutput, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function getPrfOutput(credential: PublicKeyCredential): ArrayBuffer | null {
  const results = credential.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  const prfResults = results.prf?.results;
  if (prfResults?.first) {
    return prfResults.first;
  }
  return null;
}

// ============================================================================
// Key wrapping
// ============================================================================

/**
 * Wrap (encrypt) the master key with the PRF-derived wrapping key.
 */
export async function wrapMasterKey(wrappingKey: CryptoKey, masterKey: CryptoKey): Promise<string> {
  const masterKeyRaw = await crypto.subtle.exportKey("raw", masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    masterKeyRaw,
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return arrayBufferToBase64url(combined.buffer);
}

/**
 * Unwrap (decrypt) the master key from wrapped format.
 */
export async function unwrapMasterKey(
  wrappingKey: CryptoKey,
  wrappedKey: string,
): Promise<CryptoKey> {
  const combined = base64urlToArray(wrappedKey);
  const iv = combined.slice(0, IV_SIZE);
  const ciphertext = combined.slice(IV_SIZE);

  const masterKeyRaw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    ciphertext,
  );

  return await crypto.subtle.importKey(
    "raw",
    masterKeyRaw,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

// ============================================================================
// Credential serialization
// ============================================================================

function credentialToJSON(credential: PublicKeyCredential): CredentialJSON {
  const response = credential.response as AuthenticatorAttestationResponse &
    AuthenticatorAssertionResponse;

  const json: CredentialJSON = {
    id: credential.id,
    rawId: arrayBufferToBase64url(credential.rawId),
    type: credential.type,
    response: {},
  };

  // Registration response
  if (response.attestationObject) {
    json.response = {
      attestationObject: arrayBufferToBase64url(response.attestationObject),
      clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
      ...(response.getTransports ? { transports: response.getTransports() } : {}),
    };
  }

  // Authentication response
  if (response.authenticatorData) {
    json.response = {
      authenticatorData: arrayBufferToBase64url(response.authenticatorData),
      clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
      signature: arrayBufferToBase64url(response.signature),
      ...(response.userHandle ? { userHandle: arrayBufferToBase64url(response.userHandle) } : {}),
    };
  }

  return json;
}

function parseCreationOptions(options: ServerCreationOptions): PublicKeyCredentialCreationOptions {
  return {
    ...options,
    challenge: base64urlToArray(options.challenge),
    user: {
      ...options.user,
      id: base64urlToArray(options.user.id as string),
    },
    excludeCredentials: (options.excludeCredentials || []).map((cred) => ({
      ...cred,
      id: base64urlToArray(cred.id),
    })),
  } as PublicKeyCredentialCreationOptions;
}

function parseRequestOptions(options: ServerRequestOptions): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    challenge: base64urlToArray(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((cred) => ({
      ...cred,
      id: base64urlToArray(cred.id),
    })),
  } as PublicKeyCredentialRequestOptions;
}

// ============================================================================
// Registration flow
// ============================================================================

/**
 * Create a credential with PRF extension.
 */
export async function createCredential(
  serverOptions: ServerCreationOptions,
  prfSalt: string,
): Promise<CreateCredentialResult> {
  const publicKeyOptions = parseCreationOptions(serverOptions);

  const credentialOptions: CredentialCreationOptions = {
    publicKey: {
      ...publicKeyOptions,
      extensions: {
        prf: {
          eval: {
            first: encodePrfInput(prfSalt),
          },
        },
      } as AuthenticationExtensionsClientInputs,
    },
  };

  const credential = (await navigator.credentials.create(credentialOptions)) as PublicKeyCredential;
  const prfOutput = getPrfOutput(credential);

  return {
    credential: credentialToJSON(credential),
    prfOutput,
  };
}

/**
 * Register a new passkey for E2E encryption.
 * User must already be unlocked (have master key in session).
 */
export async function registerPasskey(name: string): Promise<PasskeyResult> {
  try {
    if (!hasStoredKey()) {
      throw new Error("You must unlock encryption first before adding a passkey");
    }

    const masterKey = await getStoredKey();
    if (!masterKey) {
      throw new Error("Failed to retrieve encryption key from session");
    }

    // Get registration options from server
    const optionsRes = await axios.post("/api/v1/passkeys/register/options");
    const { options } = optionsRes.data;

    // Generate PRF salt
    const prfSalt = generateRandomBase64url(32);

    // Create credential with PRF
    const { credential, prfOutput } = await createCredential(options, prfSalt);

    if (!prfOutput) {
      throw new Error(
        "Passkey does not support PRF extension. Please try a different authenticator.",
      );
    }

    // Derive wrapping key from PRF output
    const wrappingKey = await prfOutputToWrappingKey(prfOutput);

    // Wrap the master key
    const wrappedKey = await wrapMasterKey(wrappingKey, masterKey);

    // Send to server for verification
    await axios.post("/api/v1/passkeys/register/verify", {
      credential,
      name,
      prf_salt: prfSalt,
      wrapped_key: wrappedKey,
    });

    return { success: true };
  } catch (error) {
    console.error("Passkey registration failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Registration failed",
    };
  }
}

// ============================================================================
// Authentication flow
// ============================================================================

/**
 * Authenticate with an existing passkey using PRF extension.
 */
export async function getCredential(
  serverOptions: ServerRequestOptions,
  prfSalt: string,
): Promise<GetCredentialResult> {
  const publicKeyOptions = parseRequestOptions(serverOptions);

  const credentialOptions: CredentialRequestOptions = {
    publicKey: {
      ...publicKeyOptions,
      extensions: {
        prf: {
          eval: {
            first: encodePrfInput(prfSalt),
          },
        },
      } as AuthenticationExtensionsClientInputs,
    },
  };

  const credential = (await navigator.credentials.get(credentialOptions)) as PublicKeyCredential;
  const prfOutput = getPrfOutput(credential);

  return {
    credential: credentialToJSON(credential),
    prfOutput,
    credentialId: credential.id,
  };
}

/**
 * Unlock encryption using a passkey.
 */
export async function unlockWithPasskey(encryptionTestValue: string): Promise<PasskeyResult> {
  try {
    // Get authentication options from server
    const optionsRes = await axios.post("/api/v1/passkeys/authenticate/options");
    const { options, prf_salt, wrapped_key, has_passkeys } = optionsRes.data;

    if (!has_passkeys) {
      throw new Error("No passkeys registered");
    }

    // Authenticate with PRF
    let { credential, prfOutput, credentialId } = await getCredential(options, prf_salt);

    if (!prfOutput) {
      throw new Error("PRF extension not supported by this authenticator");
    }

    // Derive wrapping key from PRF output
    let wrappingKey = await prfOutputToWrappingKey(prfOutput);

    // Try to unwrap the master key
    let masterKey: CryptoKey;

    try {
      masterKey = await unwrapMasterKey(wrappingKey, wrapped_key);
    } catch {
      // Credential might be different than first passkey — look up correct data
      console.log("Initial unwrap failed, looking up credential-specific data...");

      const lookupRes = await axios.get(
        `/api/v1/passkeys/by-credential/${encodeURIComponent(credentialId)}`,
      );
      const lookupData = lookupRes.data;

      // Re-authenticate with the correct PRF salt
      const retry = await getCredential(options, lookupData.prf_salt);
      if (!retry.prfOutput) {
        throw new Error("PRF extension failed on retry");
      }

      credential = retry.credential;
      wrappingKey = await prfOutputToWrappingKey(retry.prfOutput);
      masterKey = await unwrapMasterKey(wrappingKey, lookupData.wrapped_key);
    }

    // Verify master key by decrypting the test value
    try {
      const decrypted = await cryptoDecrypt(masterKey, encryptionTestValue);
      if (decrypted !== TEST_VALUE) {
        throw new Error("Key verification failed - decrypted value mismatch");
      }
    } catch (verifyError) {
      console.error("Key verification failed:", verifyError);
      throw new Error("Invalid passkey - unable to decrypt data");
    }

    // Store master key in session
    await storeKey(masterKey);

    // Notify server of successful authentication (updates sign count)
    await axios.post("/api/v1/passkeys/authenticate/verify", {
      credential,
    });

    return { success: true };
  } catch (error) {
    console.error("Passkey authentication failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Authentication failed",
    };
  }
}
