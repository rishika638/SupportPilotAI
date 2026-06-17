import { UserRole } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ErrorCodes } from "../errors/error-codes";
import { AuthenticationError, ForbiddenError } from "../errors/auth.errors";

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.membership || !req.context.auth) {
      next(new AuthenticationError("Authentication required", ErrorCodes.UNAUTHORIZED));
      return;
    }

    if (!allowedRoles.includes(req.membership.role)) {
      next(new ForbiddenError("Insufficient permissions", ErrorCodes.INSUFFICIENT_ROLE));
      return;
    }

    next();
  };
}
