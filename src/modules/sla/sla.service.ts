import { AuditAction, TicketPriority, TicketStatus } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import { logger } from "../../infrastructure/logger/pino.logger";
import { auditLogRepository } from "../audit/repositories/audit-log.repository";
import { notificationService } from "../notifications/notifications.service";
import { metricsService } from "../../infrastructure/metrics/metrics.service";

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
    const BATCH_SIZE = 200;

    // Compute the earliest possible deadline: URGENT tickets breach after 30 min.
    // Any ticket created before (now - 30min) could be breached; fetch only those.
    const urgentSlaMs = 30 * 60_000;
    const oldestRelevantCreatedAt = new Date(now.getTime() - urgentSlaMs);

    let cursor: string | undefined;
    let totalProcessed = 0;

    for (;;) {
      const batch = await prisma.ticket.findMany({
        where: {
          status: { in: [TicketStatus.OPEN, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS] },
          deletedAt: null,
          createdAt: { lte: oldestRelevantCreatedAt },
          ...(cursor ? { id: { gt: cursor } } : {}),
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
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
      });

      if (batch.length === 0) break;

      const breached = batch.filter((t) => {
        const deadline = this.getDeadline(t.priority, t.createdAt);
        return now >= deadline;
      });

      if (breached.length > 0) {
        logger.info({ count: breached.length, cursor }, "SLA breach check: found breached tickets in batch");
        const results = await Promise.allSettled(breached.map((ticket) => this.handleBreach(ticket, now)));
        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.length - succeeded;
        if (failed > 0) {
          logger.error({ failed, cursor }, "SLA breach check: some escalations failed");
        }
        totalProcessed += succeeded;
      }

      if (batch.length < BATCH_SIZE) break;
      cursor = batch[batch.length - 1].id;
    }

    if (totalProcessed > 0) {
      logger.info({ totalProcessed }, "SLA breach check complete");
    }
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

    const escalated = await prisma.$transaction(async (tx) => {
      // 1. Lock the ticket row
      await tx.$executeRaw`SELECT id FROM tickets WHERE id = ${ticket.id}::uuid FOR UPDATE`;

      // 2. Fetch fresh ticket state
      const currentTicket = await tx.ticket.findFirst({
        where: { id: ticket.id, organizationId: ticket.organizationId, deletedAt: null },
      });

      if (!currentTicket) {
        return false;
      }

      // 3. Validate ticket is still in an open/escalatable state
      const escalatableStatuses: TicketStatus[] = [
        TicketStatus.OPEN,
        TicketStatus.ASSIGNED,
        TicketStatus.IN_PROGRESS,
      ];

      if (!escalatableStatuses.includes(currentTicket.status)) {
        // Ticket resolved, closed, or waiting customer — skip escalation
        return false;
      }

      // 4. Check if SLA breach was already recorded for this ticket
      const existingBreach = await tx.auditLog.findFirst({
        where: {
          resourceId: ticket.id,
          action: AuditAction.SLA_BREACH,
        },
        select: { id: true },
      });

      if (existingBreach) {
        // Already recorded breach, skip duplicate escalation
        return false;
      }

      // 5. Apply escalation status atomically
      const updateResult = await tx.ticket.updateMany({
        where: {
          id: ticket.id,
          organizationId: ticket.organizationId,
          status: currentTicket.status,
          deletedAt: null,
        },
        data: { status: TicketStatus.ESCALATED },
      });

      if (updateResult.count === 0) {
        return false;
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
            priority: currentTicket.priority,
            breachedAt: now.toISOString(),
          },
          metadata: {
            event: "SLA Breach",
            previousStatus: currentTicket.status,
            autoEscalated: true,
          },
        },
        tx,
      );

      return true;
    });

    if (!escalated) {
      return;
    }

    metricsService.recordSlaBreach(ticket.priority);

    if (ticket.assigneeId) {
      await notificationService
        .notifySLABreach(ticket.organizationId, ticket.assigneeId, ticket.id, ticketNumber)
        .catch((err) => logger.error({ err, ticketId: ticket.id }, "Failed to dispatch SLA breach notification"));
    }

    logger.warn({ ticketId: ticket.id, ticketNumber, priority: ticket.priority }, "SLA breach processed");
  }
}

export const slaService = new SLAService();
