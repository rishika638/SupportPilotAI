import { Router } from "express";
import { asyncHandler } from "../../shared/middleware/async-handler.middleware";
import { authenticate } from "../../shared/middleware/authenticate.middleware";
import { validateBody } from "../../shared/middleware/validate.middleware";
import { authRateLimiter } from "../../shared/middleware/rate-limit.middleware";
import { authController } from "./auth.controller";
import {
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
} from "./auth.schemas";

const authRouter = Router();

authRouter.post(
  "/register",
  authRateLimiter,
  validateBody(registerSchema),
  asyncHandler(authController.register),
);

authRouter.post(
  "/login",
  authRateLimiter,
  validateBody(loginSchema),
  asyncHandler(authController.login),
);

authRouter.post(
  "/refresh",
  authRateLimiter,
  validateBody(refreshTokenSchema),
  asyncHandler(authController.refresh),
);

authRouter.post(
  "/logout",
  authRateLimiter,
  validateBody(logoutSchema),
  asyncHandler(authController.logout),
);

authRouter.get(
  "/me",
  asyncHandler(authenticate),
  asyncHandler(authController.me),
);

export { authRouter };
