import { AppError } from "./app.error";

export class AuthenticationError extends AppError {
  constructor(
    message = "Invalid credentials",
    code = "UNAUTHORIZED",
    details: unknown[] = [],
  ) {
    super(message, { statusCode: 401, code, details });
  }
}

export class ConflictError extends AppError {
  constructor(
    message = "Resource already exists",
    code = "CONFLICT",
    details: unknown[] = [],
  ) {
    super(message, { statusCode: 409, code, details });
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = "Forbidden",
    code = "FORBIDDEN",
    details: unknown[] = [],
  ) {
    super(message, { statusCode: 403, code, details });
  }
}
