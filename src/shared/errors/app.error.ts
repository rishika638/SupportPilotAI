export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: unknown[];

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: string;
      details?: unknown[];
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.details = options.details ?? [];
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", code = "RESOURCE_NOT_FOUND") {
    super(message, { statusCode: 404, code });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists", code = "CONFLICT") {
    super(message, { statusCode: 409, code });
  }
}

export class BadRequestError extends AppError {
  constructor(
    message = "Bad request",
    code = "BAD_REQUEST",
    details: unknown[] = [],
  ) {
    super(message, { statusCode: 400, code, details });
  }
}
