import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logger } from "../../infrastructure/logger/pino.logger";
import { AppError } from "../errors/app.error";
import { ErrorCodes } from "../errors/error-codes";
import { errorResponse } from "../responses/response.builder";

function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): {
  statusCode: number;
  code: string;
  message: string;
  details: unknown[];
} {
  switch (error.code) {
    case "P2002":
      return {
        statusCode: 409,
        code: ErrorCodes.CONFLICT,
        message: "A record with the provided unique fields already exists",
        details: [{ target: error.meta?.target }],
      };
    case "P2025":
      return {
        statusCode: 404,
        code: ErrorCodes.RESOURCE_NOT_FOUND,
        message: "The requested resource was not found",
        details: [],
      };
    default:
      return {
        statusCode: 500,
        code: ErrorCodes.DATABASE_ERROR,
        message: "A database error occurred",
        details: [],
      };
  }
}

export function errorHandlerMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.context?.requestId;

  if (error instanceof AppError) {
    logger.warn(
      {
        err: error,
        requestId,
        code: error.code,
        statusCode: error.statusCode,
      },
      error.message,
    );

    res.status(error.statusCode).json(
      errorResponse(error.code, error.message, error.details),
    );
    return;
  }

  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
      code: issue.code,
    }));

    logger.warn({ err: error, requestId, details }, "Validation error");

    res.status(400).json(
      errorResponse(ErrorCodes.VALIDATION_ERROR, "Request validation failed", details),
    );
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = handlePrismaError(error);

    logger.warn(
      {
        err: error,
        requestId,
        code: mapped.code,
        prismaCode: error.code,
      },
      mapped.message,
    );

    res.status(mapped.statusCode).json(
      errorResponse(mapped.code, mapped.message, mapped.details),
    );
    return;
  }

  logger.error({ err: error, requestId }, "Unhandled error");

  res.status(500).json(
    errorResponse(ErrorCodes.INTERNAL_ERROR, "An unexpected error occurred"),
  );
}

export function notFoundHandler(_req: Request, res: Response): void {
  res
    .status(404)
    .json(errorResponse(ErrorCodes.ROUTE_NOT_FOUND, "The requested route was not found"));
}
