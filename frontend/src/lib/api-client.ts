import type { AxiosRequestConfig } from "axios";
import Axios from "axios";

export const axios = Axios.create({
  baseURL: "",
  withCredentials: true,
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

// Inject X-CSRF-Token header on state-changing requests
axios.interceptors.request.use(async (config) => {
  const method = (config.method ?? "GET").toUpperCase();
  if (CSRF_METHODS.has(method)) {
    const token = await getCsrfToken();
    config.headers.set("X-CSRF-Token", token);
  }
  return config;
});

// Guard against multiple simultaneous 401 redirects (e.g. when session expires
// and tasks/domains/preferences queries all fail at once)
let isRedirecting = false;

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isRedirecting) {
      isRedirecting = true;
      window.location.href = "/login";
    }
    // If CSRF token was rejected, clear cache so next request re-fetches
    if (error.response?.status === 403) {
      csrfToken = null;
    }
    return Promise.reject(error);
  },
);

export const apiClient = <T>(config: AxiosRequestConfig): Promise<T> => {
  return axios(config).then((response) => response.data);
};
