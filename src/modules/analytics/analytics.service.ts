import { TicketPriority, TicketStatus } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import { slaService } from "../sla/sla.service";

export interface AnalyticsOverview {
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  escalatedTickets: number;
  avgResolutionTimeMs: number | null;
  slaComplianceRate: number | null;
}

export class AnalyticsService {
  async getOverview(organizationId: string): Promise<AnalyticsOverview> {
    const statusGroups = await prisma.ticket.groupBy({
      by: ["status"],
      where: { organizationId, deletedAt: null },
      _count: { _all: true },
    });

    const countByStatus = Object.fromEntries(
      statusGroups.map((g) => [g.status, g._count._all]),
    ) as Record<TicketStatus, number>;

    const totalTickets = Object.values(countByStatus).reduce((s, c) => s + c, 0);
    const openTickets =
      (countByStatus[TicketStatus.OPEN] ?? 0) +
      (countByStatus[TicketStatus.ASSIGNED] ?? 0) +
      (countByStatus[TicketStatus.IN_PROGRESS] ?? 0) +
      (countByStatus[TicketStatus.WAITING_CUSTOMER] ?? 0);
    const resolvedTickets =
      (countByStatus[TicketStatus.RESOLVED] ?? 0) +
      (countByStatus[TicketStatus.CLOSED] ?? 0);
    const escalatedTickets = countByStatus[TicketStatus.ESCALATED] ?? 0;

    const avgResolutionTimeMs = await this.calcAvgResolutionTime(organizationId);
    const slaComplianceRate = await this.calcSLACompliance(organizationId);

    return {
      totalTickets,
      openTickets,
      resolvedTickets,
      escalatedTickets,
      avgResolutionTimeMs,
      slaComplianceRate,
    };
  }

  private async calcAvgResolutionTime(organizationId: string): Promise<number | null> {
    const tickets = await prisma.ticket.findMany({
      where: {
        organizationId,
        deletedAt: null,
        resolvedAt: { not: null },
      },
      select: { createdAt: true, resolvedAt: true },
      take: 1000,
      orderBy: { resolvedAt: "desc" },
    });

    if (tickets.length === 0) return null;

    const totalMs = tickets.reduce((sum, t) => {
      return sum + (t.resolvedAt!.getTime() - t.createdAt.getTime());
    }, 0);

    return Math.round(totalMs / tickets.length);
  }

  private async calcSLACompliance(organizationId: string): Promise<number | null> {
    const tickets = await prisma.ticket.findMany({
      where: {
        organizationId,
        deletedAt: null,
        resolvedAt: { not: null },
      },
      select: { createdAt: true, resolvedAt: true, priority: true },
      take: 1000,
      orderBy: { resolvedAt: "desc" },
    });

    if (tickets.length === 0) return null;

    const compliant = tickets.filter((t) => {
      const deadline = slaService.getDeadline(t.priority as TicketPriority, t.createdAt);
      return t.resolvedAt! <= deadline;
    });

    return Math.round((compliant.length / tickets.length) * 10000) / 100; // percent with 2dp
  }
}

export const analyticsService = new AnalyticsService();
