import { UserRole } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../../shared/middleware/async-handler.middleware";
import { authenticate } from "../../shared/middleware/authenticate.middleware";
import { requireRole } from "../../shared/middleware/require-role.middleware";
import { validateBody } from "../../shared/middleware/validate.middleware";
import { validateParams } from "../../shared/middleware/validate-params.middleware";
import { validateQuery } from "../../shared/middleware/validate-query.middleware";
import { ticketsController } from "./tickets.controller";
import {
  assignTicketSchema,
  changeTicketStatusSchema,
  createTicketCommentSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  ticketIdParamsSchema,
  updateTicketSchema,
} from "./tickets.schemas";

const ticketsRouter = Router();

const managerOrAdmin = requireRole(UserRole.ADMIN, UserRole.MANAGER);

ticketsRouter.use(asyncHandler(authenticate));

ticketsRouter.post(
  "/",
  validateBody(createTicketSchema),
  asyncHandler(ticketsController.create),
);

ticketsRouter.get(
  "/",
  validateQuery(listTicketsQuerySchema),
  asyncHandler(ticketsController.list),
);

ticketsRouter.get(
  "/:id",
  validateParams(ticketIdParamsSchema),
  asyncHandler(ticketsController.getById),
);

ticketsRouter.get(
  "/:id/ai-analysis",
  validateParams(ticketIdParamsSchema),
  asyncHandler(ticketsController.getAIAnalysis),
);

ticketsRouter.patch(
  "/:id",
  validateParams(ticketIdParamsSchema),
  validateBody(updateTicketSchema),
  asyncHandler(ticketsController.update),
);

ticketsRouter.delete(
  "/:id",
  managerOrAdmin,
  validateParams(ticketIdParamsSchema),
  asyncHandler(ticketsController.delete),
);

ticketsRouter.post(
  "/:id/status",
  validateParams(ticketIdParamsSchema),
  validateBody(changeTicketStatusSchema),
  asyncHandler(ticketsController.changeStatus),
);

ticketsRouter.post(
  "/:id/assign",
  managerOrAdmin,
  validateParams(ticketIdParamsSchema),
  validateBody(assignTicketSchema),
  asyncHandler(ticketsController.assign),
);

ticketsRouter.post(
  "/:id/comments",
  validateParams(ticketIdParamsSchema),
  validateBody(createTicketCommentSchema),
  asyncHandler(ticketsController.addComment),
);

ticketsRouter.get(
  "/:id/comments",
  validateParams(ticketIdParamsSchema),
  asyncHandler(ticketsController.listComments),
);

export { ticketsRouter };
