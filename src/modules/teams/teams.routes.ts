import { UserRole } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../../shared/middleware/async-handler.middleware";
import { authenticate } from "../../shared/middleware/authenticate.middleware";
import { requireRole } from "../../shared/middleware/require-role.middleware";
import { validateBody } from "../../shared/middleware/validate.middleware";
import { validateParams } from "../../shared/middleware/validate-params.middleware";
import { teamsController } from "./teams.controller";
import {
  addTeamMemberSchema,
  createTeamSchema,
  teamIdParamsSchema,
  teamMemberParamsSchema,
  updateTeamSchema,
} from "./teams.schemas";

const teamsRouter = Router();

const managerOrAdmin = requireRole(UserRole.ADMIN, UserRole.MANAGER);

teamsRouter.use(asyncHandler(authenticate));

teamsRouter.post(
  "/",
  managerOrAdmin,
  validateBody(createTeamSchema),
  asyncHandler(teamsController.create),
);

teamsRouter.get("/", asyncHandler(teamsController.list));

teamsRouter.get(
  "/:id",
  validateParams(teamIdParamsSchema),
  asyncHandler(teamsController.getById),
);

teamsRouter.patch(
  "/:id",
  managerOrAdmin,
  validateParams(teamIdParamsSchema),
  validateBody(updateTeamSchema),
  asyncHandler(teamsController.update),
);

teamsRouter.delete(
  "/:id",
  managerOrAdmin,
  validateParams(teamIdParamsSchema),
  asyncHandler(teamsController.remove),
);

teamsRouter.post(
  "/:id/members",
  managerOrAdmin,
  validateParams(teamIdParamsSchema),
  validateBody(addTeamMemberSchema),
  asyncHandler(teamsController.addMember),
);

teamsRouter.get(
  "/:id/members",
  validateParams(teamIdParamsSchema),
  asyncHandler(teamsController.listMembers),
);

teamsRouter.delete(
  "/:id/members/:memberId",
  managerOrAdmin,
  validateParams(teamMemberParamsSchema),
  asyncHandler(teamsController.removeMember),
);

export { teamsRouter };
