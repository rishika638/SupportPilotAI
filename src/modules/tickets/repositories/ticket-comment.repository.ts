import { CommentVisibility, Prisma, TicketComment } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";

export type TicketCommentWithAuthor = TicketComment & {
  author: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
};

const commentInclude = {
  author: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
} satisfies Prisma.TicketCommentInclude;

export class TicketCommentRepository {
  async findManyByTicket(
    organizationId: string,
    ticketId: string,
    options: { includeInternal: boolean },
  ): Promise<TicketCommentWithAuthor[]> {
    return prisma.ticketComment.findMany({
      where: {
        organizationId,
        ticketId,
        deletedAt: null,
        ...(options.includeInternal
          ? {}
          : { visibility: CommentVisibility.PUBLIC }),
      },
      include: commentInclude,
      orderBy: { createdAt: "asc" },
    });
  }

  async create(
    tx: Prisma.TransactionClient,
    data: Prisma.TicketCommentCreateInput,
  ): Promise<TicketCommentWithAuthor> {
    return tx.ticketComment.create({
      data,
      include: commentInclude,
    });
  }

  async hasFirstResponse(ticketId: string): Promise<boolean> {
    const existing = await prisma.ticketComment.findFirst({
      where: {
        ticketId,
        isFirstResponse: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    return existing !== null;
  }
}

export const ticketCommentRepository = new TicketCommentRepository();
