import { AuthenticatedUserContext } from "./auth.types";

export interface SuccessResponseBody<T> {
  success: true;
  data: T;
  meta: Record<string, unknown>;
}

export interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
}

export interface RequestContext {
  requestId: string;
  auth?: AuthenticatedUserContext;
}
