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
  async create(input: CreateRefreshTokenInput): Promise<RefreshToken> {
    const data: Prisma.RefreshTokenCreateInput = {
      user: { connect: { id: input.userId } },
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    };

    return prisma.refreshToken.create({ data });
  }

  async findValidByHash(tokenHash: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
  }

  async revokeByHash(tokenHash: string): Promise<boolean> {
    const result = await prisma.refreshToken.updateMany({
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

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await prisma.refreshToken.updateMany({
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
