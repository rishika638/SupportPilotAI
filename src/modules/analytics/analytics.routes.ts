import { Router } from "express";
import { UserRole } from "@prisma/client";
import { authenticate } from "../../shared/middleware/authenticate.middleware";
import { requireRole } from "../../shared/middleware/require-role.middleware";
import { analyticsController } from "./analytics.controller";

const analyticsRouter = Router();

analyticsRouter.use(authenticate);
analyticsRouter.use(requireRole(UserRole.ADMIN, UserRole.MANAGER));

analyticsRouter.get("/overview", analyticsController.overview);

export { analyticsRouter };
