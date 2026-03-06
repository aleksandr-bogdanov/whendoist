import type { AxiosRequestConfig } from "axios";
import Axios from "axios";
import { toast } from "sonner";
import { isTauri } from "@/hooks/use-device";
import {
  AuthError,
  CSRFError,
  NetworkError,
  NotFoundError,
  OfflineQueuedError,
  RateLimitError,
  ServerError,
  ValidationError,
} from "./errors";

// Tauri production: absolute URL + bearer auth (direct to server)
// Tauri dev: relative URL (Vite proxy forwards to server — iOS WKWebView can't reach external HTTPS)
// Web: relative URL (Vite proxy or same-origin in production)
export const axios = Axios.create({
  baseURL: isTauri && !import.meta.env.DEV ? "https://whendoist.com" : "",
  withCredentials: !isTauri, // Cookies for web, bearer for Tauri
  timeout: 15_000, // 15s — prevents hanging forever when server is unreachable
});

// CSRF token cache — fetched once per session, sent on every mutation
let csrfToken: string | null = null;
let csrfFetchPromise: Promise<string> | null = null;

const CSRF_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (csrfFetchPromise) return csrfFetchPromise;
  csrfFetchPromise = Axios.get<{ csrf_token: string }>("/api/v1/csrf", {
    withCredentials: true,
  })
    .then((res) => {
      csrfToken = res.data.csrf_token;
      csrfFetchPromise = null;
      return csrfToken;
    })
    .catch((err) => {
      csrfFetchPromise = null;
      throw err;
    });
  return csrfFetchPromise;
}

const WRITE_METHODS = new Set(["post", "put", "delete", "patch"]);

// Tauri iOS dev: WKWebView strips POST/PUT/PATCH bodies. Encode the body in a
// custom header so the Vite proxy middleware can restore it before forwarding.
if (isTauri && import.meta.env.DEV) {
  axios.interceptors.request.use((config) => {
    if (config.data !== undefined && config.data !== null) {
      const json = typeof config.data === "string" ? config.data : JSON.stringify(config.data);
      config.headers.set("X-Tauri-Body", btoa(json));
    }
    return config;
  });
}

// Reject requests immediately when offline (Tauri: queue write mutations instead)
axios.interceptors.request.use(async (config) => {
  if (!navigator.onLine) {
    // Tauri: queue offline mutations for later replay
    if (isTauri && WRITE_METHODS.has((config.method ?? "").toLowerCase())) {
      const { addToWriteQueue } = await import("./tauri-cache");
      await addToWriteQueue(config.method!, config.url!, config.data);
      toast.info("Saved offline — will sync when connected.", {
        id: "offline-queued",
      });
      throw new OfflineQueuedError("Mutation queued offline");
    }
    toast.error("No internet connection. Changes will fail while offline.", {
      id: "offline-guard",
    });
    throw new NetworkError("Browser is offline");
  }
  return config;
});

// Tauri: attach Authorization: Bearer header on every request
// Web: inject X-CSRF-Token header on state-changing requests
// CSRF is a cookie-only vulnerability — bearer tokens don't need CSRF protection
axios.interceptors.request.use(async (config) => {
  if (isTauri) {
    const { getAccessToken, loadDeviceToken, isTokenExpired, saveDeviceToken } = await import(
      "./tauri-token-store"
    );
    let accessToken = await getAccessToken();

    // Try refresh if expired
    if (!accessToken) {
      const tokenData = await loadDeviceToken();
      if (tokenData?.refresh_token && isTokenExpired(tokenData)) {
        try {
          const refreshResp = await Axios.post(`${config.baseURL || ""}/api/v1/device/refresh`, {
            refresh_token: tokenData.refresh_token,
          });
          await saveDeviceToken(refreshResp.data);
          accessToken = refreshResp.data.access_token;
        } catch {
          // Refresh failed — will get 401, handled by response interceptor
        }
      }
    }

    if (accessToken) {
      config.headers.set("Authorization", `Bearer ${accessToken}`);
    }
  } else {
    const method = (config.method ?? "GET").toUpperCase();
    if (CSRF_METHODS.has(method)) {
      const token = await getCsrfToken();
      config.headers.set("X-CSRF-Token", token);
    }
  }
  return config;
});

// Guard against multiple simultaneous 401 redirects (e.g. when session expires
// and tasks/domains/preferences queries all fail at once)
let isRedirecting = false;

/** Show a countdown toast for rate limiting */
let rateLimitIntervalId: ReturnType<typeof setInterval> | null = null;
function showRateLimitCountdown(seconds: number) {
  if (rateLimitIntervalId) clearInterval(rateLimitIntervalId);
  let remaining = seconds;
  toast.error(`Too many requests. Try again in ${remaining}s.`, {
    id: "rate-limit",
    duration: seconds * 1000 + 500,
  });
  rateLimitIntervalId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(rateLimitIntervalId!);
      rateLimitIntervalId = null;
      toast.dismiss("rate-limit");
      return;
    }
    toast.error(`Too many requests. Try again in ${remaining}s.`, {
      id: "rate-limit",
      duration: remaining * 1000 + 500,
    });
  }, 1000);
}

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Offline queued mutations — already handled, pass through silently
    if (error instanceof OfflineQueuedError) {
      return Promise.reject(error);
    }

    // Network errors (no response received)
    if (!error.response) {
      const networkError = new NetworkError(error.message || "Network request failed");
      return Promise.reject(networkError);
    }

    const status = error.response.status;

    if (status === 401 && !isRedirecting) {
      isRedirecting = true;
      if (isTauri) {
        import("./tauri-token-store").then(({ clearDeviceToken }) => clearDeviceToken());
        import("./tauri-cache").then(({ clearAllCache }) => clearAllCache());
      }
      window.location.href = "/login";
      return Promise.reject(new AuthError("Session expired"));
    }

    if (status === 403 && !error.config?._csrfRetried) {
      // Clear CSRF cache, fetch a new token, and retry once
      csrfToken = null;
      csrfFetchPromise = null;
      error.config._csrfRetried = true;
      const newToken = await getCsrfToken();
      error.config.headers.set("X-CSRF-Token", newToken);
      return axios(error.config);
    }
    if (status === 403) {
      return Promise.reject(new CSRFError("CSRF token rejected"));
    }

    if (status === 400) {
      const msg = error.response.data?.detail || "Invalid request. Check your input.";
      return Promise.reject(new ValidationError(msg));
    }

    if (status === 404) {
      return Promise.reject(new NotFoundError("Resource not found"));
    }

    if (status === 429) {
      const retryAfter = Number.parseInt(error.response.headers?.["retry-after"] ?? "", 10) || 30;
      showRateLimitCountdown(retryAfter);
      return Promise.reject(new RateLimitError("Rate limited", retryAfter));
    }

    if (status >= 500) {
      toast.error("Something went wrong. Please try again.", {
        id: "server-error",
      });
      return Promise.reject(new ServerError(error.message || "Server error"));
    }

    return Promise.reject(error);
  },
);

export const apiClient = <T>(config: AxiosRequestConfig): Promise<T> => {
  return axios(config).then((response) => response.data);
};
