import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req.query);
      (req as any).validatedQuery = parsed;
      next();
    } catch (err) {
      next(err);
    }
  };
}
