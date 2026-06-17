import { AuditAction, TicketPriority, TicketStatus } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import { logger } from "../../infrastructure/logger/pino.logger";
import { auditLogRepository } from "../audit/repositories/audit-log.repository";
import { notificationService } from "../notifications/notifications.service";

const DEFAULT_SLA_MINUTES: Record<TicketPriority, number> = {
  URGENT: 30,
  HIGH: 120,
  MEDIUM: 480,
  LOW: 1440,
};

const TICKET_NUMBER_PREFIX = "SP-";

export class SLAService {
  getDeadline(priority: TicketPriority, from: Date): Date {
    const minutes = DEFAULT_SLA_MINUTES[priority];
    return new Date(from.getTime() + minutes * 60_000);
  }

  async runBreachCheck(): Promise<void> {
    const now = new Date();

    // Find open/assigned/in-progress tickets whose SLA deadline has passed
    // Deadline = createdAt + SLA minutes for their priority
    // We compute inline using Prisma's raw-ish approach via JS filtering
    const tickets = await prisma.ticket.findMany({
      where: {
        status: { in: [TicketStatus.OPEN, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS] },
        deletedAt: null,
      },
      select: {
        id: true,
        organizationId: true,
        ticketNumber: true,
        priority: true,
        status: true,
        assigneeId: true,
        createdAt: true,
      },
    });

    const breached = tickets.filter((t) => {
      const deadline = this.getDeadline(t.priority, t.createdAt);
      return now >= deadline;
    });

    if (breached.length === 0) return;

    logger.info({ count: breached.length }, "SLA breach check: found breached tickets");

    await Promise.allSettled(
      breached.map((ticket) => this.handleBreach(ticket, now)),
    );
  }

  private async handleBreach(
    ticket: {
      id: string;
      organizationId: string;
      ticketNumber: number;
      priority: TicketPriority;
      status: TicketStatus;
      assigneeId: string | null;
    },
    now: Date,
  ): Promise<void> {
    const ticketNumber = `${TICKET_NUMBER_PREFIX}${ticket.ticketNumber}`;

    await prisma.$transaction(async (tx) => {
      // Escalate if not already escalated
      if (ticket.status !== TicketStatus.ESCALATED) {
        await tx.ticket.updateMany({
          where: { id: ticket.id, organizationId: ticket.organizationId, deletedAt: null },
          data: { status: TicketStatus.ESCALATED },
        });
      }

      await auditLogRepository.create(
        {
          organizationId: ticket.organizationId,
          action: AuditAction.SLA_BREACH,
          resourceType: "Ticket",
          resourceId: ticket.id,
          afterState: {
            ticketId: ticket.id,
            ticketNumber,
            priority: ticket.priority,
            breachedAt: now.toISOString(),
          },
          metadata: { event: "SLA Breach", autoEscalated: ticket.status !== TicketStatus.ESCALATED },
        },
        tx,
      );
    });

    if (ticket.assigneeId) {
      await notificationService
        .notifySLABreach(ticket.organizationId, ticket.assigneeId, ticket.id, ticketNumber)
        .catch((err) => logger.error({ err, ticketId: ticket.id }, "Failed to dispatch SLA breach notification"));
    }

    logger.warn({ ticketId: ticket.id, ticketNumber, priority: ticket.priority }, "SLA breach processed");
  }
}

export const slaService = new SLAService();
