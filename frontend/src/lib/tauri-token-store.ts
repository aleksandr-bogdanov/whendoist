/**
 * Manages JWT device tokens for Tauri native app authentication.
 *
 * In the browser, authentication uses session cookies. In Tauri, the WebView
 * runs on a different origin (tauri://localhost), so cookies can't be sent to
 * the backend. Instead, we exchange the session cookie for a JWT during the
 * initial web-based login flow, then use bearer tokens for all subsequent requests.
 */

import { isTauri } from "@/hooks/use-device";
import { TAURI_CIRCUIT_BREAKER_COOLDOWN_MS, TAURI_IPC_TIMEOUT_MS } from "@/lib/tauri-constants";

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp (seconds)
}

const STORE_KEY = "device_token";

// In-memory cache to avoid async store reads on every request
let cachedToken: TokenData | null = null;

// Circuit breaker with cooldown for retry
let storeAvailable = true;
let storeBrokeAt = 0;

// Singleton store instance + dedup promise to avoid multiple concurrent IPC calls
let storeInstance: Awaited<ReturnType<typeof createStore>> | null = null;
let storeLoadPromise: Promise<Awaited<ReturnType<typeof createStore>> | null> | null = null;

async function createStore() {
  const { LazyStore } = await import("@tauri-apps/plugin-store");
  return new LazyStore("credentials.json");
}

async function getStore() {
  if (storeInstance) return storeInstance;
  if (!storeAvailable) {
    // Half-open: retry after cooldown
    if (Date.now() - storeBrokeAt < TAURI_CIRCUIT_BREAKER_COOLDOWN_MS) return null;
    storeAvailable = true;
  }
  if (storeLoadPromise) return storeLoadPromise;
  storeLoadPromise = withTimeout(createStore(), TAURI_IPC_TIMEOUT_MS, null)
    .then((s) => {
      if (!s) {
        storeAvailable = false;
        storeBrokeAt = Date.now();
      }
      storeInstance = s;
      return s;
    })
    .catch(() => {
      storeAvailable = false;
      storeBrokeAt = Date.now();
      return null;
    })
    .finally(() => {
      storeLoadPromise = null;
    });
  return storeLoadPromise;
}

/** Race a promise against a timeout — returns fallback if the promise doesn't settle in time */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Save device tokens after exchange or refresh */
export async function saveDeviceToken(data: TokenData): Promise<void> {
  cachedToken = data;
  if (isTauri && storeAvailable) {
    try {
      const store = await getStore();
      if (!store) return;
      await withTimeout(store.set(STORE_KEY, data), TAURI_IPC_TIMEOUT_MS, undefined);
      await withTimeout(store.save(), TAURI_IPC_TIMEOUT_MS, undefined);
    } catch {
      // Store save failed — token is still in memory for this session
    }
  }
}

/** Load device token from store (or in-memory cache) */
export async function loadDeviceToken(): Promise<TokenData | null> {
  if (cachedToken) return cachedToken;
  if (!isTauri || !storeAvailable) return null;
  try {
    const store = await getStore();
    if (!store) return null;
    const data = await withTimeout(store.get<TokenData>(STORE_KEY), TAURI_IPC_TIMEOUT_MS, null);
    if (data === null && !cachedToken) {
      // Timed out or no token — trip circuit breaker with cooldown
      storeAvailable = false;
      storeBrokeAt = Date.now();
    }
    if (data) cachedToken = data;
    return data ?? null;
  } catch {
    storeAvailable = false;
    storeBrokeAt = Date.now();
    return null;
  }
}

/** Clear stored token on logout or revocation */
export async function clearDeviceToken(): Promise<void> {
  cachedToken = null;
  if (isTauri && storeAvailable) {
    try {
      const store = await getStore();
      if (!store) return;
      await withTimeout(store.delete(STORE_KEY), TAURI_IPC_TIMEOUT_MS, undefined);
      await withTimeout(store.save(), TAURI_IPC_TIMEOUT_MS, undefined);
    } catch {
      // Store may not exist yet — that's fine
    }
  }
}

/** Check if the access token is expired (with 60s buffer) */
export function isTokenExpired(token: TokenData): boolean {
  return Date.now() / 1000 >= token.expires_at - 60;
}

/** Get the current access token, returning null if unavailable or expired */
export async function getAccessToken(): Promise<string | null> {
  const token = await loadDeviceToken();
  if (!token) return null;
  if (isTokenExpired(token)) return null; // Caller should refresh
  return token.access_token;
}
