import { Router } from "express";
import { asyncHandler } from "../../shared/middleware/async-handler.middleware";
import { authenticate } from "../../shared/middleware/authenticate.middleware";
import { validateBody } from "../../shared/middleware/validate.middleware";
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
  validateBody(registerSchema),
  asyncHandler(authController.register),
);

authRouter.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(authController.login),
);

authRouter.post(
  "/refresh",
  validateBody(refreshTokenSchema),
  asyncHandler(authController.refresh),
);

authRouter.post(
  "/logout",
  validateBody(logoutSchema),
  asyncHandler(authController.logout),
);

authRouter.get(
  "/me",
  asyncHandler(authenticate),
  asyncHandler(authController.me),
);

export { authRouter };
