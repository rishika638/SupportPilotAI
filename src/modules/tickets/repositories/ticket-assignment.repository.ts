import { Prisma, TicketAssignment } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";

export type TicketAssignmentWithRelations = TicketAssignment & {
  assignee: {
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

const assignmentInclude = {
  assignee: {
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
} satisfies Prisma.TicketAssignmentInclude;

export class TicketAssignmentRepository {
  async create(
    tx: Prisma.TransactionClient,
    data: Prisma.TicketAssignmentCreateInput,
  ): Promise<TicketAssignmentWithRelations> {
    return tx.ticketAssignment.create({
      data,
      include: assignmentInclude,
    });
  }

  async findLatestByTicket(
    organizationId: string,
    ticketId: string,
  ): Promise<TicketAssignment | null> {
    return prisma.ticketAssignment.findFirst({
      where: {
        organizationId,
        ticketId,
      },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const ticketAssignmentRepository = new TicketAssignmentRepository();
