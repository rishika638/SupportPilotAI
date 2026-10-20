import { Prisma, RefreshToken } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";

export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

export class RefreshTokenRepository {
  async create(
    input: CreateRefreshTokenInput,
    tx?: Prisma.TransactionClient,
  ): Promise<RefreshToken> {
    const client = tx ?? prisma;
    const data: Prisma.RefreshTokenCreateInput = {
      user: { connect: { id: input.userId } },
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    };

    return client.refreshToken.create({ data });
  }

  async findValidByHash(
    tokenHash: string,
    tx?: Prisma.TransactionClient,
  ): Promise<RefreshToken | null> {
    const client = tx ?? prisma;
    return client.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
  }

  async revokeByHash(
    tokenHash: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? prisma;
    const result = await client.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return result.count > 0;
  }

  async revokeAllForUser(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? prisma;
    const result = await client.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return result.count;
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
