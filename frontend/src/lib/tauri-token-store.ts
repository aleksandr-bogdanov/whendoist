/**
 * Manages JWT device tokens for Tauri native app authentication.
 *
 * In the browser, authentication uses session cookies. In Tauri, the WebView
 * runs on a different origin (tauri://localhost), so cookies can't be sent to
 * the backend. Instead, we exchange the session cookie for a JWT during the
 * initial web-based login flow, then use bearer tokens for all subsequent requests.
 */

import { isTauri } from "@/hooks/use-device";

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp (seconds)
}

const STORE_KEY = "device_token";

// In-memory cache to avoid async store reads on every request
let cachedToken: TokenData | null = null;

async function getStore() {
  const { LazyStore } = await import("@tauri-apps/plugin-store");
  return new LazyStore("credentials.json");
}

/** Save device tokens after exchange or refresh */
export async function saveDeviceToken(data: TokenData): Promise<void> {
  cachedToken = data;
  if (isTauri) {
    const store = await getStore();
    await store.set(STORE_KEY, data);
    await store.save();
  }
}

/** Load device token from store (or in-memory cache) */
export async function loadDeviceToken(): Promise<TokenData | null> {
  if (cachedToken) return cachedToken;
  if (!isTauri) return null;
  try {
    const store = await getStore();
    const data = await store.get<TokenData>(STORE_KEY);
    if (data) cachedToken = data;
    return data ?? null;
  } catch {
    return null;
  }
}

/** Clear stored token on logout or revocation */
export async function clearDeviceToken(): Promise<void> {
  cachedToken = null;
  if (isTauri) {
    try {
      const store = await getStore();
      await store.delete(STORE_KEY);
      await store.save();
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
