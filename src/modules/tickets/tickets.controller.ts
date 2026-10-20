import { Request, Response } from "express";
import { successResponse } from "../../shared/responses/response.builder";
import {
  AssignTicketInput,
  ChangeTicketStatusInput,
  CreateTicketCommentInput,
  CreateTicketInput,
  ListTicketsQuery,
  TicketIdParams,
  UpdateTicketInput,
} from "./tickets.schemas";
import { ticketsService } from "./tickets.service";

function buildMeta(req: Request) {
  return {
    requestId: req.context.requestId,
  };
}

export class TicketsController {
  constructor(
    private readonly analysisService: Pick<typeof ticketsService, "getAIAnalysis"> =
      ticketsService,
  ) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const input = req.body as CreateTicketInput;
    const ticket = await ticketsService.createTicket(
      req,
      req.organization!,
      req.user!,
      input,
    );

    res.status(201).json(successResponse(ticket, buildMeta(req)));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const query = (req as any).validatedQuery as ListTicketsQuery;
    const result = await ticketsService.listTickets(
      req.organization!.id,
      req.membership!,
      query,
    );

    res.status(200).json(successResponse(result, buildMeta(req)));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as TicketIdParams;
    const ticket = await ticketsService.getTicket(
      req.organization!.id,
      req.membership!,
      id,
    );

    res.status(200).json(successResponse(ticket, buildMeta(req)));
  };

  getAIAnalysis = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as TicketIdParams;
    const analysis = await this.analysisService.getAIAnalysis(
      req.organization!.id,
      req.membership!,
      id,
    );

    res.status(200).json(successResponse(analysis, buildMeta(req)));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as TicketIdParams;
    const input = req.body as UpdateTicketInput;
    const ticket = await ticketsService.updateTicket(
      req,
      req.organization!.id,
      req.membership!,
      id,
      input,
    );

    res.status(200).json(successResponse(ticket, buildMeta(req)));
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as TicketIdParams;
    const result = await ticketsService.deleteTicket(
      req,
      req.organization!.id,
      req.membership!,
      id,
    );

    res.status(200).json(successResponse(result, buildMeta(req)));
  };

  changeStatus = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as TicketIdParams;
    const input = req.body as ChangeTicketStatusInput;
    const result = await ticketsService.changeStatus(
      req,
      req.organization!.id,
      req.membership!,
      id,
      input,
    );

    res.status(200).json(successResponse(result, buildMeta(req)));
  };

  assign = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as TicketIdParams;
    const input = req.body as AssignTicketInput;
    const result = await ticketsService.assignTicket(
      req,
      req.organization!,
      req.membership!,
      id,
      input,
    );

    res.status(200).json(successResponse(result, buildMeta(req)));
  };

  addComment = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as TicketIdParams;
    const input = req.body as CreateTicketCommentInput;
    const comment = await ticketsService.addComment(
      req,
      req.organization!.id,
      req.membership!,
      req.user!,
      id,
      input,
    );

    res.status(201).json(successResponse(comment, buildMeta(req)));
  };

  listComments = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as TicketIdParams;
    const result = await ticketsService.listComments(
      req.organization!.id,
      req.membership!,
      id,
    );

    res.status(200).json(successResponse(result, buildMeta(req)));
  };
}

export const ticketsController = new TicketsController();
