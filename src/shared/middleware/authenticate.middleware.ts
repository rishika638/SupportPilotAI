import { NextFunction, Request, Response } from "express";
import { authContextService } from "../../modules/auth/auth-context.service";
import { ErrorCodes } from "../errors/error-codes";
import { AuthenticationError } from "../errors/auth.errors";

const BEARER_PREFIX = "Bearer ";

function extractBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader || !authorizationHeader.startsWith(BEARER_PREFIX)) {
    throw new AuthenticationError(
      "Missing or invalid authorization header",
      ErrorCodes.MISSING_TOKEN,
    );
  }

  const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();

  if (!token) {
    throw new AuthenticationError(
      "Missing or invalid authorization header",
      ErrorCodes.MISSING_TOKEN,
    );
  }

  return token;
}

export async function authenticateMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(req.header("authorization"));
    const resolved = await authContextService.resolveFromBearerToken(token);

    req.user = resolved.user;
    req.organization = resolved.organization;
    req.membership = resolved.membership;
    req.context.auth = resolved.auth;

    next();
  } catch (error) {
    next(error);
  }
}

export const authenticate = authenticateMiddleware;
