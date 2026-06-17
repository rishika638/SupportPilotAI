import { ErrorResponseBody, SuccessResponseBody } from "../types/response.types";

export function successResponse<T>(
  data: T,
  meta: Record<string, unknown> = {},
): SuccessResponseBody<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

export function errorResponse(
  code: string,
  message: string,
  details: unknown[] = [],
): ErrorResponseBody {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}
