/** Base class for all API errors with user-facing messages */
abstract class AppError extends Error {
  abstract readonly userMessage: string;
  abstract readonly recoverable: boolean;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NetworkError extends AppError {
  readonly userMessage = "No internet connection";
  readonly recoverable = true;
}

export class AuthError extends AppError {
  readonly userMessage = "Session expired. Redirecting...";
  readonly recoverable = false;
}

export class CSRFError extends AppError {
  readonly userMessage = "Security token expired. Refreshing...";
  readonly recoverable = true;
}

export class ValidationError extends AppError {
  readonly userMessage = "Invalid request. Check your input.";
  readonly recoverable = false;
}

export class NotFoundError extends AppError {
  readonly userMessage = "Resource not found.";
  readonly recoverable = false;
}

export class RateLimitError extends AppError {
  readonly userMessage: string;
  readonly recoverable = true;
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfter: number) {
    super(message);
    this.retryAfterSeconds = retryAfter;
    this.userMessage = `Too many requests. Try again in ${retryAfter}s.`;
  }
}

export class ServerError extends AppError {
  readonly userMessage = "Something went wrong. Please try again.";
  readonly recoverable = false;
}
