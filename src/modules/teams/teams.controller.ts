import { Request, Response } from "express";
import { successResponse } from "../../shared/responses/response.builder";
import {
  AddTeamMemberInput,
  CreateTeamInput,
  TeamIdParams,
  TeamMemberParams,
  UpdateTeamInput,
} from "./teams.schemas";
import { teamsService } from "./teams.service";

function buildMeta(req: Request) {
  return {
    requestId: req.context.requestId,
  };
}

export class TeamsController {
  create = async (req: Request, res: Response): Promise<void> => {
    const input = req.body as CreateTeamInput;
    const team = await teamsService.createTeam(req, req.organization!, input);

    res.status(201).json(successResponse(team, buildMeta(req)));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const result = await teamsService.listTeams(req.organization!.id);

    res.status(200).json(successResponse(result, buildMeta(req)));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as TeamIdParams;
    const team = await teamsService.getTeam(req.organization!.id, id);

    res.status(200).json(successResponse(team, buildMeta(req)));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as TeamIdParams;
    const input = req.body as UpdateTeamInput;
    const team = await teamsService.updateTeam(req, req.organization!.id, id, input);

    res.status(200).json(successResponse(team, buildMeta(req)));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as TeamIdParams;
    const result = await teamsService.deleteTeam(req, req.organization!.id, id);

    res.status(200).json(successResponse(result, buildMeta(req)));
  };

  addMember = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as TeamIdParams;
    const input = req.body as AddTeamMemberInput;
    const member = await teamsService.addMember(req, req.organization!, id, input);

    res.status(201).json(successResponse(member, buildMeta(req)));
  };

  removeMember = async (req: Request, res: Response): Promise<void> => {
    const { id, memberId } = req.params as TeamMemberParams;
    const result = await teamsService.removeMember(
      req,
      req.organization!.id,
      id,
      memberId,
    );

    res.status(200).json(successResponse(result, buildMeta(req)));
  };

  listMembers = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as TeamIdParams;
    const result = await teamsService.listMembers(req.organization!.id, id);

    res.status(200).json(successResponse(result, buildMeta(req)));
  };
}

export const teamsController = new TeamsController();
