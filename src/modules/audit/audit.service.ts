import { AuditAction, Prisma } from "@prisma/client";
import { Request } from "express";
import {
  auditLogRepository,
  CreateAuditLogInput,
} from "./repositories/audit-log.repository";

export class AuditService {
  async log(
    input: CreateAuditLogInput,
    client?: Parameters<typeof auditLogRepository.create>[1],
  ): Promise<void> {
    await auditLogRepository.create(input, client);
  }

  async logFromRequest(
    req: Request,
    input: Omit<CreateAuditLogInput, "organizationId" | "actorId" | "ipAddress" | "userAgent" | "correlationId">,
    client?: Parameters<typeof auditLogRepository.create>[1],
  ): Promise<void> {
    await this.log(
      {
        ...input,
        organizationId: req.organization!.id,
        actorId: req.user!.id,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
        correlationId: req.context.requestId,
      },
      client,
    );
  }

  async logTeamCreated(req: Request, team: { id: string; name: string }) {
    await this.logFromRequest(req, {
      action: AuditAction.CREATE,
      resourceType: "Team",
      resourceId: team.id,
      afterState: team,
    });
  }

  async logTeamUpdated(
    req: Request,
    teamId: string,
    beforeState: Prisma.InputJsonValue,
    afterState: Prisma.InputJsonValue,
  ) {
    await this.logFromRequest(req, {
      action: AuditAction.UPDATE,
      resourceType: "Team",
      resourceId: teamId,
      beforeState,
      afterState,
    });
  }

  async logTeamDeleted(
    req: Request,
    teamId: string,
    beforeState: Prisma.InputJsonValue,
  ) {
    await this.logFromRequest(req, {
      action: AuditAction.DELETE,
      resourceType: "Team",
      resourceId: teamId,
      beforeState,
    });
  }

  async logTeamMemberAdded(
    req: Request,
    member: { id: string; teamId: string; userId: string; isLead: boolean },
  ) {
    await this.logFromRequest(req, {
      action: AuditAction.CREATE,
      resourceType: "TeamMember",
      resourceId: member.id,
      afterState: member,
    });
  }

  async logTeamMemberRemoved(
    req: Request,
    member: { id: string; teamId: string; userId: string; isLead: boolean },
  ) {
    await this.logFromRequest(req, {
      action: AuditAction.DELETE,
      resourceType: "TeamMember",
      resourceId: member.id,
      beforeState: member,
    });
  }

  async logTicketCreated(
    req: Request,
    ticket: Prisma.InputJsonValue,
    client?: Parameters<typeof auditLogRepository.create>[1],
  ) {
    const parsed = ticket as { id: string };
    await this.logFromRequest(
      req,
      {
        action: AuditAction.CREATE,
        resourceType: "Ticket",
        resourceId: parsed.id,
        afterState: ticket,
      },
      client,
    );
  }

  async logTicketDeleted(
    req: Request,
    ticketId: string,
    beforeState: Prisma.InputJsonValue,
    client?: Parameters<typeof auditLogRepository.create>[1],
  ) {
    await this.logFromRequest(
      req,
      {
        action: AuditAction.DELETE,
        resourceType: "Ticket",
        resourceId: ticketId,
        beforeState,
      },
      client,
    );
  }

  async logTicketUpdated(
    req: Request,
    ticketId: string,
    beforeState: Prisma.InputJsonValue,
    afterState: Prisma.InputJsonValue,
    client?: Parameters<typeof auditLogRepository.create>[1],
  ) {
    await this.logFromRequest(
      req,
      {
        action: AuditAction.UPDATE,
        resourceType: "Ticket",
        resourceId: ticketId,
        beforeState,
        afterState,
      },
      client,
    );
  }

  async logTicketAssigned(
    req: Request,
    ticketId: string,
    beforeState: Prisma.InputJsonValue,
    afterState: Prisma.InputJsonValue,
    client?: Parameters<typeof auditLogRepository.create>[1],
  ) {
    await this.logFromRequest(
      req,
      {
        action: AuditAction.ASSIGN,
        resourceType: "Ticket",
        resourceId: ticketId,
        beforeState,
        afterState,
        metadata: { event: "Ticket Assigned" },
      },
      client,
    );
  }

  async logTicketReassigned(
    req: Request,
    ticketId: string,
    beforeState: Prisma.InputJsonValue,
    afterState: Prisma.InputJsonValue,
    client?: Parameters<typeof auditLogRepository.create>[1],
  ) {
    await this.logFromRequest(
      req,
      {
        action: AuditAction.ASSIGN,
        resourceType: "Ticket",
        resourceId: ticketId,
        beforeState,
        afterState,
        metadata: { event: "Ticket Reassigned" },
      },
      client,
    );
  }

  async logTicketEscalated(
    req: Request,
    ticketId: string,
    beforeState: Prisma.InputJsonValue,
    afterState: Prisma.InputJsonValue,
    client?: Parameters<typeof auditLogRepository.create>[1],
  ) {
    await this.logFromRequest(
      req,
      {
        action: AuditAction.ESCALATE,
        resourceType: "Ticket",
        resourceId: ticketId,
        beforeState,
        afterState,
      },
      client,
    );
  }

  async logTicketStatusChanged(
    req: Request,
    ticketId: string,
    beforeState: Prisma.InputJsonValue,
    afterState: Prisma.InputJsonValue,
    client?: Parameters<typeof auditLogRepository.create>[1],
  ) {
    await this.logFromRequest(
      req,
      {
        action: AuditAction.UPDATE,
        resourceType: "Ticket",
        resourceId: ticketId,
        beforeState,
        afterState,
        metadata: { event: "Status Changed" },
      },
      client,
    );
  }

  async logCommentAdded(
    req: Request,
    comment: Prisma.InputJsonValue,
    client?: Parameters<typeof auditLogRepository.create>[1],
  ) {
    const parsed = comment as { id: string; ticketId: string };
    await this.logFromRequest(
      req,
      {
        action: AuditAction.CREATE,
        resourceType: "TicketComment",
        resourceId: parsed.id,
        afterState: comment,
        metadata: { ticketId: parsed.ticketId, event: "Comment Added" },
      },
      client,
    );
  }
}

export const auditService = new AuditService();
