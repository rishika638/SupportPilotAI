import { Request, Response } from "express";
import { successResponse } from "../../shared/responses/response.builder";
import {
  LoginInput,
  LogoutInput,
  RefreshTokenInput,
  RegisterInput,
} from "./auth.schemas";
import { authService } from "./auth.service";

function getRequestContext(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get("user-agent") ?? undefined,
  };
}

function buildMeta(req: Request, extra: Record<string, unknown> = {}) {
  return {
    requestId: req.context.requestId,
    ...extra,
  };
}

export class AuthController {
  register = async (req: Request, res: Response): Promise<void> => {
    const input = req.body as RegisterInput;
    const result = await authService.register(input, getRequestContext(req));

    res.status(201).json(successResponse(result, buildMeta(req)));
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const input = req.body as LoginInput;
    const result = await authService.login(input, getRequestContext(req));

    res.status(200).json(successResponse(result, buildMeta(req)));
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const input = req.body as RefreshTokenInput;
    const result = await authService.refresh(input, getRequestContext(req));

    res.status(200).json(successResponse(result, buildMeta(req)));
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    const input = req.body as LogoutInput;
    const result = await authService.logout(input);

    res.status(200).json(successResponse(result, buildMeta(req)));
  };

  me = async (req: Request, res: Response): Promise<void> => {
    const result = await authService.getMe(req.user!, req.organization!, req.membership!);

    res.status(200).json(successResponse(result, buildMeta(req)));
  };
}

export const authController = new AuthController();
