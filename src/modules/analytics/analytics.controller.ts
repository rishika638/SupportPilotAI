import { Request, Response } from "express";
import { asyncHandler } from "../../shared/middleware/async-handler.middleware";
import { successResponse } from "../../shared/responses/response.builder";
import { analyticsService } from "./analytics.service";

export class AnalyticsController {
  overview = asyncHandler(async (req: Request, res: Response) => {
    const overview = await analyticsService.getOverview(req.organization!.id);
    res.json(successResponse(overview));
  });
}

export const analyticsController = new AnalyticsController();
