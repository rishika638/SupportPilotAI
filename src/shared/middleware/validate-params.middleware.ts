import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as Request["params"];
      next();
    } catch (err) {
      next(err);
    }
  };
}
