import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incomingRequestId = req.header("x-request-id");
  const requestId =
    incomingRequestId && incomingRequestId.trim().length > 0
      ? incomingRequestId
      : randomUUID();

  req.context = { requestId };
  res.setHeader("X-Request-Id", requestId);
  next();
}
