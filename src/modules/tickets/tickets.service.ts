import {
  AssignmentType,
  CommentVisibility,
  Organization,
  OrganizationMember,
  Prisma,
  TicketStatus,
  User,
  UserRole,
} from "@prisma/client";
import { Request } from "express";
import { prisma } from "../../infrastructure/database/prisma.client";
import { ErrorCodes } from "../../shared/errors/error-codes";
import { NotFoundError } from "../../shared/errors/app.error";
import { ForbiddenError } from "../../shared/errors/auth.errors";
import { auditService } from "../audit/audit.service";
import { organizationMemberRepository } from "../auth/repositories/organization-member.repository";
import { teamMemberRepository } from "../teams/repositories/team-member.repository";
import { teamRepository } from "../teams/repositories/team.repository";
import { ticketStateMachine } from "./ticket-state-machine";
import {
  TicketAssignResponseDto,
  TicketCommentDto,
  TicketCommentListResponseDto,
  TicketDto,
  TicketListResponseDto,
  TicketStatusChangeResponseDto,
  TicketUserSummaryDto,
} from "./tickets.dto";
import {
  AssignTicketInput,
  ChangeTicketStatusInput,
  CreateTicketCommentInput,
  CreateTicketInput,
  ListTicketsQuery,
  UpdateTicketInput,
} from "./tickets.schemas";
import { aiAnalysisService } from "../ai/ai-analysis.service";
import { notificationService } from "../notifications/notifications.service";
import { ticketAssignmentRepository, TicketAssignmentWithRelations } from "./repositories/ticket-assignment.repository";
import { ticketCommentRepository, TicketCommentWithAuthor } from "./repositories/ticket-comment.repository";
import { ticketRepository, TicketWithRelations } from "./repositories/ticket.repository";

const TICKET_NUMBER_PREFIX = "SP-";

export class TicketsService {
  async createTicket(
    req: Request,
    organization: Organization,
    user: User,
    input: CreateTicketInput,
  ): Promise<TicketDto> {
    if (input.teamId) {
      await this.validateTeamExists(organization.id, input.teamId);
    }

    const metadata = this.buildMetadata(input.tags);

    const ticket = await ticketRepository.createWithNextNumber(organization.id, {
      subject: input.title,
      description: input.description,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      priority: input.priority,
      channel: input.channel,
      metadata,
      createdBy: { connect: { id: user.id } },
      ...(input.teamId ? { team: { connect: { id: input.teamId } } } : {}),
    });

    await auditService.logTicketCreated(
      req,
      this.serializeTicket(ticket) as Prisma.InputJsonValue,
    );

    aiAnalysisService
      .enqueue(ticket.id, organization.id, ticket.subject, ticket.description)
      .catch((err) => {
        // Non-blocking: log but don't fail ticket creation
        console.error({ err, ticketId: ticket.id }, "Failed to enqueue AI analysis");
      });

    return this.toTicketDto(ticket);
  }

  async listTickets(
    organizationId: string,
    membership: OrganizationMember,
    query: ListTicketsQuery,
  ): Promise<TicketListResponseDto> {
    const filters = await this.applyRoleFilters(organizationId, membership, query);
    const { tickets, total } = await ticketRepository.findMany(filters);

    return {
      tickets: tickets.map((ticket) => this.toTicketDto(ticket)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 0,
      },
    };
  }

  async getTicket(
    organizationId: string,
    membership: OrganizationMember,
    ticketId: string,
  ): Promise<TicketDto> {
    const ticket = await this.getTicketOrThrow(organizationId, ticketId);
    await this.assertTicketAccess(organizationId, membership, ticket);

    return this.toTicketDto(ticket);
  }

  async updateTicket(
    req: Request,
    organizationId: string,
    membership: OrganizationMember,
    ticketId: string,
    input: UpdateTicketInput,
  ): Promise<TicketDto> {
    const existing = await this.getTicketOrThrow(organizationId, ticketId);
    await this.assertTicketAccess(organizationId, membership, existing);

    if (input.teamId) {
      await this.validateTeamExists(organizationId, input.teamId);
    }

    const beforeState = this.serializeTicket(existing);
    const metadata = this.mergeMetadata(existing.metadata, input.tags);

    const ticket = await ticketRepository.updateFields(organizationId, ticketId, {
      ...(input.title !== undefined ? { subject: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.customerName !== undefined ? { customerName: input.customerName } : {}),
      ...(input.customerEmail !== undefined ? { customerEmail: input.customerEmail } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      ...(input.teamId !== undefined
        ? input.teamId === null
          ? { team: { disconnect: true } }
          : { team: { connect: { id: input.teamId } } }
        : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    });

    await auditService.logTicketUpdated(
      req,
      ticket.id,
      beforeState as Prisma.InputJsonValue,
      this.serializeTicket(ticket) as Prisma.InputJsonValue,
    );

    return this.toTicketDto(ticket);
  }

  async changeStatus(
    req: Request,
    organizationId: string,
    membership: OrganizationMember,
    ticketId: string,
    input: ChangeTicketStatusInput,
  ): Promise<TicketStatusChangeResponseDto> {
    const existing = await this.getTicketOrThrow(organizationId, ticketId);
    await this.assertTicketAccess(organizationId, membership, existing);

    const previousStatus = existing.status;
    ticketStateMachine.assertTransition(previousStatus, input.status);

    const beforeState = this.serializeTicket(existing);
    const now = new Date();
    const timestamps = this.buildStatusTimestamps(existing, input.status, now);

    const ticket = await prisma.$transaction(async (tx) => {
      const updated = await ticketRepository.updateStatus(
        tx,
        organizationId,
        ticketId,
        input.status,
        timestamps,
      );

      await auditService.logTicketStatusChanged(
        req,
        ticketId,
        beforeState as Prisma.InputJsonValue,
        this.serializeTicket(updated) as Prisma.InputJsonValue,
        tx,
      );

      return updated;
    });

    if (input.status === TicketStatus.RESOLVED && ticket.assigneeId) {
      notificationService
        .notifyTicketResolved(organizationId, ticket.assigneeId, ticketId, this.formatTicketNumber(ticket.ticketNumber))
        .catch(() => {});
    }

    return {
      ticket: this.toTicketDto(ticket),
      previousStatus,
      newStatus: input.status,
    };
  }

  async assignTicket(
    req: Request,
    organization: Organization,
    membership: OrganizationMember,
    ticketId: string,
    input: AssignTicketInput,
  ): Promise<TicketAssignResponseDto> {
    this.assertAssignmentAuthority(membership);

    const existing = await this.getTicketOrThrow(organization.id, ticketId);
    const beforeState = this.serializeTicket(existing);

    if (input.assigneeId) {
      await this.validateAssignee(organization.id, input.assigneeId);
    }

    if (input.teamId) {
      await this.validateTeamExists(organization.id, input.teamId);
    }

    const assignmentType = this.resolveAssignmentType(existing, input);
    const isEscalation = assignmentType === AssignmentType.ESCALATION;
    const isReassign = assignmentType === AssignmentType.REASSIGN;

    const result = await prisma.$transaction(async (tx) => {
      const updatedTicket = await ticketRepository.updateAssignment(
        tx,
        organization.id,
        ticketId,
        {
          ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
          ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        },
      );

      const assignment = await ticketAssignmentRepository.create(tx, {
        organization: { connect: { id: organization.id } },
        ticket: { connect: { id: ticketId } },
        assignmentType,
        reason: input.reason,
        assignedBy: { connect: { id: req.user!.id } },
        ...(input.assigneeId
          ? { assignee: { connect: { id: input.assigneeId } } }
          : {}),
        ...(input.teamId ? { team: { connect: { id: input.teamId } } } : {}),
      });

      const afterState = this.serializeTicket(updatedTicket) as Prisma.InputJsonValue;

      if (isEscalation) {
        await auditService.logTicketEscalated(
          req,
          ticketId,
          beforeState as Prisma.InputJsonValue,
          afterState,
          tx,
        );
      } else if (isReassign) {
        await auditService.logTicketReassigned(
          req,
          ticketId,
          beforeState as Prisma.InputJsonValue,
          afterState,
          tx,
        );
      } else {
        await auditService.logTicketAssigned(
          req,
          ticketId,
          beforeState as Prisma.InputJsonValue,
          afterState,
          tx,
        );
      }

      return { updatedTicket, assignment };
    });

    // Fire-and-forget notifications
    const ticketNum = this.formatTicketNumber(result.updatedTicket.ticketNumber);
    const notifyUserId = result.updatedTicket.assigneeId;

    if (notifyUserId) {
      if (assignmentType === AssignmentType.ESCALATION) {
        notificationService.notifyTicketEscalated(organization.id, notifyUserId, ticketId, ticketNum).catch(() => {});
      } else {
        notificationService.notifyTicketAssigned(organization.id, notifyUserId, ticketId, ticketNum, isReassign).catch(() => {});
      }
    } else if (result.updatedTicket.teamId) {
      // Team-only assignment: notify the actor (manager/admin who made the assignment)
      notificationService.notifyTicketAssigned(organization.id, req.user!.id, ticketId, ticketNum, isReassign).catch(() => {});
    }

    return {
      ticket: this.toTicketDto(result.updatedTicket),
      assignment: this.toAssignmentDto(result.assignment),
    };
  }

  async addComment(
    req: Request,
    organizationId: string,
    membership: OrganizationMember,
    user: User,
    ticketId: string,
    input: CreateTicketCommentInput,
  ): Promise<TicketCommentDto> {
    const ticket = await this.getTicketOrThrow(organizationId, ticketId);
    await this.assertTicketAccess(organizationId, membership, ticket);

    const isStaff = this.isStaffRole(membership.role);
    if (input.visibility === CommentVisibility.INTERNAL && !isStaff) {
      throw new ForbiddenError(
        "Only staff members can create internal comments",
        ErrorCodes.FORBIDDEN,
      );
    }

    const hasFirstResponse = await ticketCommentRepository.hasFirstResponse(ticketId);
    const isFirstResponse = !hasFirstResponse && isStaff;

    const comment = await prisma.$transaction(async (tx) => {
      const created = await ticketCommentRepository.create(tx, {
        organization: { connect: { id: organizationId } },
        ticket: { connect: { id: ticketId } },
        author: { connect: { id: user.id } },
        body: input.body,
        visibility: input.visibility,
        isFirstResponse,
      });

      if (isFirstResponse && !ticket.firstResponseAt) {
        await tx.ticket.updateMany({
          where: { id: ticketId, organizationId, deletedAt: null },
          data: { firstResponseAt: new Date() },
        });
      }

      await auditService.logCommentAdded(
        req,
        this.serializeComment(created) as Prisma.InputJsonValue,
        tx,
      );

      return created;
    });

    return this.toCommentDto(comment);
  }

  async listComments(
    organizationId: string,
    membership: OrganizationMember,
    ticketId: string,
  ): Promise<TicketCommentListResponseDto> {
    const ticket = await this.getTicketOrThrow(organizationId, ticketId);
    await this.assertTicketAccess(organizationId, membership, ticket);

    const comments = await ticketCommentRepository.findManyByTicket(
      organizationId,
      ticketId,
      { includeInternal: this.isStaffRole(membership.role) },
    );

    return {
      comments: comments.map((comment) => this.toCommentDto(comment)),
    };
  }

  private async applyRoleFilters(
    organizationId: string,
    membership: OrganizationMember,
    query: ListTicketsQuery,
  ) {
    const filters = {
      ...query,
      organizationId,
    };

    if (membership.role === UserRole.ADMIN) {
      return filters;
    }

    if (membership.role === UserRole.MANAGER) {
      const managerTeamIds = await teamMemberRepository.findTeamIdsByUserInOrganization(
        membership.userId,
        organizationId,
      );

      return {
        ...filters,
        managerTeamIds,
      };
    }

    return {
      ...filters,
      assigneeId: membership.userId,
    };
  }

  private async assertTicketAccess(
    organizationId: string,
    membership: OrganizationMember,
    ticket: TicketWithRelations,
  ): Promise<void> {
    if (membership.role === UserRole.ADMIN) {
      return;
    }

    if (membership.role === UserRole.MANAGER) {
      if (ticket.teamId === null) {
        return;
      }

      const managerTeamIds = await teamMemberRepository.findTeamIdsByUserInOrganization(
        membership.userId,
        organizationId,
      );

      if (managerTeamIds.includes(ticket.teamId)) {
        return;
      }

      throw new ForbiddenError(
        "You do not have access to this ticket",
        ErrorCodes.FORBIDDEN,
      );
    }

    if (ticket.assigneeId !== membership.userId) {
      throw new ForbiddenError(
        "You do not have access to this ticket",
        ErrorCodes.FORBIDDEN,
      );
    }
  }

  private assertAssignmentAuthority(membership: OrganizationMember): void {
    if (
      membership.role !== UserRole.ADMIN &&
      membership.role !== UserRole.MANAGER
    ) {
      throw new ForbiddenError(
        "Only managers and admins can assign tickets",
        ErrorCodes.INSUFFICIENT_ROLE,
      );
    }
  }

  private isStaffRole(role: UserRole): boolean {
    return (
      role === UserRole.ADMIN ||
      role === UserRole.MANAGER ||
      role === UserRole.AGENT
    );
  }

  private async getTicketOrThrow(
    organizationId: string,
    ticketId: string,
  ): Promise<TicketWithRelations> {
    const ticket = await ticketRepository.findById(organizationId, ticketId);

    if (!ticket) {
      throw new NotFoundError("Ticket not found", ErrorCodes.RESOURCE_NOT_FOUND);
    }

    return ticket;
  }

  private async validateTeamExists(
    organizationId: string,
    teamId: string,
  ): Promise<void> {
    const team = await teamRepository.findById(organizationId, teamId);

    if (!team) {
      throw new NotFoundError("Team not found", ErrorCodes.RESOURCE_NOT_FOUND);
    }
  }

  private async validateAssignee(
    organizationId: string,
    assigneeId: string,
  ): Promise<void> {
    const membership = await organizationMemberRepository.findActiveByUserAndOrganization(
      assigneeId,
      organizationId,
    );

    if (!membership) {
      throw new NotFoundError(
        "Assignee is not an active member of this organization",
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
    }
  }

  private resolveAssignmentType(
    ticket: TicketWithRelations,
    input: AssignTicketInput,
  ): AssignmentType {
    if (input.assignmentType) {
      return input.assignmentType;
    }

    const hasExistingAssignment = ticket.assigneeId !== null || ticket.teamId !== null;
    const isReassign =
      hasExistingAssignment &&
      ((input.assigneeId !== undefined && input.assigneeId !== ticket.assigneeId) ||
        (input.teamId !== undefined && input.teamId !== ticket.teamId));

    if (isReassign) {
      return AssignmentType.REASSIGN;
    }

    return AssignmentType.MANUAL;
  }

  private buildStatusTimestamps(
    ticket: TicketWithRelations,
    newStatus: TicketStatus,
    now: Date,
  ) {
    const timestamps: {
      firstResponseAt?: Date;
      resolvedAt?: Date;
      closedAt?: Date;
    } = {};

    if (newStatus === TicketStatus.RESOLVED && !ticket.resolvedAt) {
      timestamps.resolvedAt = now;
    }

    if (newStatus === TicketStatus.CLOSED && !ticket.closedAt) {
      timestamps.closedAt = now;
    }

    return timestamps;
  }

  private buildMetadata(tags?: string[]): Prisma.InputJsonValue {
    return { tags: tags ?? [] };
  }

  private mergeMetadata(
    existing: Prisma.JsonValue,
    tags?: string[],
  ): Prisma.InputJsonValue | undefined {
    if (tags === undefined) {
      return undefined;
    }

    const current =
      typeof existing === "object" && existing !== null && !Array.isArray(existing)
        ? (existing as Record<string, unknown>)
        : {};

    return {
      ...current,
      tags,
    };
  }

  private extractTags(metadata: Prisma.JsonValue): string[] {
    if (
      typeof metadata === "object" &&
      metadata !== null &&
      !Array.isArray(metadata) &&
      Array.isArray((metadata as Record<string, unknown>).tags)
    ) {
      return (metadata as { tags: string[] }).tags;
    }

    return [];
  }

  private formatTicketNumber(ticketNumber: number): string {
    return `${TICKET_NUMBER_PREFIX}${ticketNumber}`;
  }

  private toUserSummary(
    user: TicketWithRelations["assignee"],
  ): TicketUserSummaryDto | null {
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  private toTicketDto(ticket: TicketWithRelations): TicketDto {
    return {
      id: ticket.id,
      organizationId: ticket.organizationId,
      ticketNumber: this.formatTicketNumber(ticket.ticketNumber),
      title: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      channel: ticket.channel,
      customerName: ticket.customerName,
      customerEmail: ticket.customerEmail,
      tags: this.extractTags(ticket.metadata),
      assigneeId: ticket.assigneeId,
      assignee: this.toUserSummary(ticket.assignee),
      teamId: ticket.teamId,
      teamName: ticket.team?.name ?? null,
      createdById: ticket.createdById,
      createdBy: this.toUserSummary(ticket.createdBy),
      firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    };
  }

  private toCommentDto(comment: TicketCommentWithAuthor): TicketCommentDto {
    return {
      id: comment.id,
      ticketId: comment.ticketId,
      body: comment.body,
      visibility: comment.visibility,
      authorId: comment.authorId,
      author: this.toUserSummary(comment.author)!,
      isFirstResponse: comment.isFirstResponse,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }

  private toAssignmentDto(
    assignment: TicketAssignmentWithRelations,
  ) {
    return {
      id: assignment.id,
      ticketId: assignment.ticketId,
      assigneeId: assignment.assigneeId,
      assignee: this.toUserSummary(assignment.assignee),
      teamId: assignment.teamId,
      teamName: assignment.team?.name ?? null,
      assignedById: assignment.assignedById,
      assignmentType: assignment.assignmentType,
      reason: assignment.reason,
      createdAt: assignment.createdAt.toISOString(),
    };
  }

  private serializeTicket(ticket: TicketWithRelations): Record<string, unknown> {
    return {
      id: ticket.id,
      organizationId: ticket.organizationId,
      ticketNumber: this.formatTicketNumber(ticket.ticketNumber),
      title: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      channel: ticket.channel,
      customerName: ticket.customerName,
      customerEmail: ticket.customerEmail,
      tags: this.extractTags(ticket.metadata),
      assigneeId: ticket.assigneeId,
      teamId: ticket.teamId,
      createdById: ticket.createdById,
      firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
    };
  }

  private serializeComment(comment: TicketCommentWithAuthor): Record<string, unknown> {
    return {
      id: comment.id,
      ticketId: comment.ticketId,
      authorId: comment.authorId,
      body: comment.body,
      visibility: comment.visibility,
      isFirstResponse: comment.isFirstResponse,
      createdAt: comment.createdAt.toISOString(),
    };
  }
}

export const ticketsService = new TicketsService();
