import { Request, Response } from "express";
import { successResponse } from "../../shared/responses/response.builder";
import { examplesService } from "./examples.service";

function buildMeta(req: Request) {
  return {
    requestId: req.context.requestId,
  };
}

export class ExamplesController {
  profile = async (req: Request, res: Response): Promise<void> => {
    const result = examplesService.getProfile(req.context.auth!);

    res.status(200).json(successResponse(result, buildMeta(req)));
  };

  admin = async (req: Request, res: Response): Promise<void> => {
    const result = examplesService.getAdminDashboard(req.context.auth!);

    res.status(200).json(successResponse(result, buildMeta(req)));
  };

  reports = async (req: Request, res: Response): Promise<void> => {
    const result = examplesService.getReports(req.context.auth!);

    res.status(200).json(successResponse(result, buildMeta(req)));
  };
}

export const examplesController = new ExamplesController();
