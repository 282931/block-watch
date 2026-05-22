export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly cause?: Error;

  constructor(code: string, message: string, statusCode: number, cause?: Error) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', cause?: Error) {
    super('NOT_FOUND', message, 404, cause);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'Validation failed', cause?: Error) {
    super('VALIDATION_ERROR', message, 400, cause);
    this.name = 'ValidationError';
  }
}

export class AuthError extends ApiError {
  constructor(message = 'Authentication required', cause?: Error) {
    super('AUTH_ERROR', message, 401, cause);
    this.name = 'AuthError';
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Resource already exists', cause?: Error) {
    super('CONFLICT', message, 409, cause);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends ApiError {
  constructor(message = 'Rate limit exceeded', cause?: Error) {
    super('RATE_LIMIT', message, 429, cause);
    this.name = 'RateLimitError';
  }
}

export class ServerError extends ApiError {
  constructor(message = 'Internal server error', cause?: Error) {
    super('SERVER_ERROR', message, 500, cause);
    this.name = 'ServerError';
  }
}
