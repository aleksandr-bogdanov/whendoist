import i18n from "@/lib/i18n";

/** Base class for all API errors with user-facing messages */
abstract class AppError extends Error {
  abstract get userMessage(): string;
  abstract readonly recoverable: boolean;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NetworkError extends AppError {
  get userMessage() {
    return i18n.t("errors.networkOffline");
  }
  readonly recoverable = true;
}

export class AuthError extends AppError {
  get userMessage() {
    return i18n.t("errors.sessionExpired");
  }
  readonly recoverable = false;
}

export class CSRFError extends AppError {
  get userMessage() {
    return i18n.t("errors.csrfExpired");
  }
  readonly recoverable = true;
}

export class ValidationError extends AppError {
  get userMessage() {
    return i18n.t("errors.invalidRequest");
  }
  readonly recoverable = false;
}

export class NotFoundError extends AppError {
  get userMessage() {
    return i18n.t("errors.notFound");
  }
  readonly recoverable = false;
}

export class RateLimitError extends AppError {
  readonly recoverable = true;
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfter: number) {
    super(message);
    this.retryAfterSeconds = retryAfter;
  }

  get userMessage() {
    return i18n.t("errors.rateLimited", { seconds: this.retryAfterSeconds });
  }
}

export class ServerError extends AppError {
  get userMessage() {
    return i18n.t("errors.serverError");
  }
  readonly recoverable = false;
}

/** Thrown when an offline mutation is queued for later replay (Tauri only). */
export class OfflineQueuedError extends AppError {
  get userMessage() {
    return i18n.t("errors.offlineQueued");
  }
  readonly recoverable = true;
}
