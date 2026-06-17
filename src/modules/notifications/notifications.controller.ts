import { Request, Response } from "express";
import { asyncHandler } from "../../shared/middleware/async-handler.middleware";
import { successResponse } from "../../shared/responses/response.builder";
import { notificationService } from "./notifications.service";

export class NotificationsController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const unreadOnly = req.query["unread"] === "true";
    const limit = Math.min(Number(req.query["limit"] ?? 20), 100);
    const offset = Number(req.query["offset"] ?? 0);

    const result = await notificationService.listForUser(
      req.organization!.id,
      userId,
      { unreadOnly, limit, offset },
    );

    res.json(successResponse({ ...result, limit, offset }));
  });

  markRead = asyncHandler(async (req: Request, res: Response) => {
    const notificationId = req.params["notificationId"] as string;
    await notificationService.markRead(
      req.organization!.id,
      req.user!.id,
      notificationId,
    );
    res.json(successResponse({ success: true }));
  });

  markAllRead = asyncHandler(async (req: Request, res: Response) => {
    await notificationService.markAllRead(req.organization!.id, req.user!.id);
    res.json(successResponse({ success: true }));
  });
}

export const notificationsController = new NotificationsController();
