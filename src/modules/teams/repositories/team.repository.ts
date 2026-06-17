import { Prisma, Team } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";

export type TeamWithMemberCount = Team & {
  _count: {
    members: number;
  };
};

export class TeamRepository {
  async findById(organizationId: string, teamId: string): Promise<Team | null> {
    return prisma.team.findFirst({
      where: {
        id: teamId,
        organizationId,
        deletedAt: null,
      },
    });
  }

  async findMany(organizationId: string): Promise<TeamWithMemberCount[]> {
    return prisma.team.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  }

  async create(data: Prisma.TeamCreateInput): Promise<Team> {
    return prisma.team.create({ data });
  }

  async update(teamId: string, data: Prisma.TeamUpdateInput): Promise<Team> {
    return prisma.team.update({
      where: { id: teamId },
      data,
    });
  }

  async softDelete(teamId: string): Promise<Team> {
    return prisma.team.update({
      where: { id: teamId },
      data: { deletedAt: new Date() },
    });
  }

  async clearDefaultFlag(organizationId: string, excludeTeamId?: string): Promise<void> {
    await prisma.team.updateMany({
      where: {
        organizationId,
        deletedAt: null,
        isDefault: true,
        ...(excludeTeamId ? { id: { not: excludeTeamId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  async findByName(organizationId: string, name: string): Promise<Team | null> {
    return prisma.team.findFirst({
      where: {
        organizationId,
        name,
        deletedAt: null,
      },
    });
  }
}

export const teamRepository = new TeamRepository();
