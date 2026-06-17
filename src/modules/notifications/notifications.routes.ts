import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.middleware";
import { notificationsController } from "./notifications.controller";

const notificationsRouter = Router();

notificationsRouter.use(authenticate);

notificationsRouter.get("/", notificationsController.list);
notificationsRouter.patch("/read-all", notificationsController.markAllRead);
notificationsRouter.patch("/:notificationId/read", notificationsController.markRead);

export { notificationsRouter };
