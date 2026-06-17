import { UserRole } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../../shared/middleware/async-handler.middleware";
import { authenticate } from "../../shared/middleware/authenticate.middleware";
import { requireRole } from "../../shared/middleware/require-role.middleware";
import { examplesController } from "./examples.controller";

const examplesRouter = Router();

examplesRouter.get(
  "/profile",
  asyncHandler(authenticate),
  asyncHandler(examplesController.profile),
);

examplesRouter.get(
  "/admin",
  asyncHandler(authenticate),
  requireRole(UserRole.ADMIN),
  asyncHandler(examplesController.admin),
);

examplesRouter.get(
  "/reports",
  asyncHandler(authenticate),
  requireRole(UserRole.ADMIN, UserRole.MANAGER),
  asyncHandler(examplesController.reports),
);

export { examplesRouter };
