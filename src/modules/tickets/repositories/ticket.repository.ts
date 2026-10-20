import { Prisma, Ticket, TicketStatus } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";
import { ListTicketsQuery } from "../tickets.schemas";

const TICKET_NUMBER_START = 1001;

export type TicketWithRelations = Ticket & {
  assignee: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  createdBy: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  team: {
    id: string;
    name: string;
  } | null;
};

export interface TicketListFilters extends ListTicketsQuery {
  organizationId: string;
  assigneeIds?: string[];
  teamIds?: string[];
  managerTeamIds?: string[];
}

const ticketInclude = {
  assignee: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  team: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.TicketInclude;

export class TicketRepository {
  async findById(
    organizationId: string,
    ticketId: string,
  ): Promise<TicketWithRelations | null> {
    return prisma.ticket.findFirst({
      where: {
        id: ticketId,
        organizationId,
        deletedAt: null,
      },
      include: ticketInclude,
    });
  }

  async findMany(filters: TicketListFilters): Promise<{
    tickets: TicketWithRelations[];
    total: number;
  }> {
    const where = this.buildWhereClause(filters);
    const orderBy = this.buildOrderBy(filters.sortBy, filters.sortOrder);

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: ticketInclude,
        orderBy,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.ticket.count({ where }),
    ]);

    return { tickets, total };
  }

  async createWithNextNumber(
    organizationId: string,
    data: Omit<
      Prisma.TicketCreateInput,
      "organization" | "ticketNumber" | "organizationId"
    >,
  ): Promise<TicketWithRelations> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        return await prisma.$transaction(async (tx) => {
          // Serialize ticket-number allocation per organization using row lock
          await tx.$executeRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;

          const latest = await tx.ticket.findFirst({
            where: { organizationId },
            orderBy: { ticketNumber: "desc" },
            select: { ticketNumber: true },
          });

          const ticketNumber = latest
            ? latest.ticketNumber + 1
            : TICKET_NUMBER_START;

          return await tx.ticket.create({
            data: {
              ...data,
              organization: { connect: { id: organizationId } },
              ticketNumber,
            },
            include: ticketInclude,
          });
        });
      } catch (err: unknown) {
        const isConflict =
          err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002";
        if (isConflict && attempt < maxRetries) {
          continue;
        }
        throw err;
      }
    }

    throw new Error("Failed to allocate unique ticket number after retries");
  }

  async updateFields(
    organizationId: string,
    ticketId: string,
    data: Prisma.TicketUpdateInput,
  ): Promise<TicketWithRelations> {
    const ticket = await prisma.ticket.updateMany({
      where: {
        id: ticketId,
        organizationId,
        deletedAt: null,
      },
      data,
    });

    if (ticket.count === 0) {
      throw new Error("Ticket not found");
    }

    const updated = await this.findById(organizationId, ticketId);

    if (!updated) {
      throw new Error("Ticket not found after update");
    }

    return updated;
  }

  async updateStatus(
    tx: Prisma.TransactionClient,
    organizationId: string,
    ticketId: string,
    status: TicketStatus,
    timestamps: {
      firstResponseAt?: Date;
      resolvedAt?: Date;
      closedAt?: Date;
    },
    expectedCurrentStatus?: TicketStatus,
  ): Promise<TicketWithRelations> {
    const result = await tx.ticket.updateMany({
      where: {
        id: ticketId,
        organizationId,
        deletedAt: null,
        ...(expectedCurrentStatus ? { status: expectedCurrentStatus } : {}),
      },
      data: {
        status,
        ...(timestamps.firstResponseAt !== undefined
          ? { firstResponseAt: timestamps.firstResponseAt }
          : {}),
        ...(timestamps.resolvedAt !== undefined
          ? { resolvedAt: timestamps.resolvedAt }
          : {}),
        ...(timestamps.closedAt !== undefined
          ? { closedAt: timestamps.closedAt }
          : {}),
      },
    });

    if (result.count === 0) {
      throw new Error("Ticket status update failed: status conflict or ticket not found");
    }

    const updated = await tx.ticket.findFirst({
      where: { id: ticketId, organizationId, deletedAt: null },
      include: ticketInclude,
    });

    if (!updated) {
      throw new Error("Ticket not found after status update");
    }

    return updated;
  }

  async softDelete(
    organizationId: string,
    ticketId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? prisma;
    const result = await client.ticket.updateMany({
      where: {
        id: ticketId,
        organizationId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return result.count > 0;
  }

  async updateAssignment(
    tx: Prisma.TransactionClient,
    organizationId: string,
    ticketId: string,
    data: {
      assigneeId?: string | null;
      teamId?: string | null;
    },
  ): Promise<TicketWithRelations> {
    const result = await tx.ticket.updateMany({
      where: {
        id: ticketId,
        organizationId,
        deletedAt: null,
      },
      data: {
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        ...(data.teamId !== undefined ? { teamId: data.teamId } : {}),
      },
    });

    if (result.count === 0) {
      throw new Error("Ticket not found");
    }

    const updated = await tx.ticket.findFirst({
      where: { id: ticketId, organizationId, deletedAt: null },
      include: ticketInclude,
    });

    if (!updated) {
      throw new Error("Ticket not found after assignment update");
    }

    return updated;
  }

  private buildWhereClause(filters: TicketListFilters): Prisma.TicketWhereInput {
    const where: Prisma.TicketWhereInput = {
      organizationId: filters.organizationId,
      deletedAt: null,
    };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.priority) {
      where.priority = filters.priority;
    }

    if (filters.assigneeId) {
      where.assigneeId = filters.assigneeId;
    } else if (filters.assigneeIds) {
      where.assigneeId = { in: filters.assigneeIds };
    }

    if (filters.teamId) {
      where.teamId = filters.teamId;
    } else if (filters.teamIds) {
      where.teamId = { in: filters.teamIds };
    }

    if (filters.createdById) {
      where.createdById = filters.createdById;
    }

    if (filters.createdFrom || filters.createdTo) {
      where.createdAt = {
        ...(filters.createdFrom ? { gte: new Date(filters.createdFrom) } : {}),
        ...(filters.createdTo ? { lte: new Date(filters.createdTo) } : {}),
      };
    }

    if (filters.search) {
      where.OR = [
        { subject: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
        { customerName: { contains: filters.search, mode: "insensitive" } },
        { customerEmail: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    if (filters.managerTeamIds) {
      if (filters.teamId) {
        if (!filters.managerTeamIds.includes(filters.teamId)) {
          where.id = "00000000-0000-0000-0000-000000000000";
        }
      } else {
        const teamScope: Prisma.TicketWhereInput = {
          OR: [
            { teamId: { in: filters.managerTeamIds } },
            { teamId: null },
          ],
        };

        const existingAnd = where.AND
          ? Array.isArray(where.AND)
            ? where.AND
            : [where.AND]
          : [];

        where.AND = [...existingAnd, teamScope];
      }
    }

    return where;
  }

  private buildOrderBy(
    sortBy: TicketListFilters["sortBy"],
    sortOrder: TicketListFilters["sortOrder"],
  ): Prisma.TicketOrderByWithRelationInput | Prisma.TicketOrderByWithRelationInput[] {
    const direction = sortOrder;

    switch (sortBy) {
      case "ticketNumber":
        return { ticketNumber: direction };
      case "priority":
        return { priority: direction };
      case "status":
        return { status: direction };
      case "updatedAt":
        return { updatedAt: direction };
      case "createdAt":
      default:
        return { createdAt: direction };
    }
  }
}

export const ticketRepository = new TicketRepository();
