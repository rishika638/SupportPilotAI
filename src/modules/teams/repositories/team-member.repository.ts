import { Prisma, TeamMember, User } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";

export type TeamMemberWithUser = TeamMember & {
  user: Pick<User, "id" | "email" | "firstName" | "lastName">;
};

export class TeamMemberRepository {
  async findById(teamId: string, memberId: string): Promise<TeamMember | null> {
    return prisma.teamMember.findFirst({
      where: {
        id: memberId,
        teamId,
      },
    });
  }

  async findByTeamAndUser(teamId: string, userId: string): Promise<TeamMember | null> {
    return prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId,
        },
      },
    });
  }

  async findManyByTeam(teamId: string): Promise<TeamMemberWithUser[]> {
    return prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ isLead: "desc" }, { createdAt: "asc" }],
    });
  }

  async create(data: Prisma.TeamMemberCreateInput): Promise<TeamMember> {
    return prisma.teamMember.create({ data });
  }

  async delete(memberId: string): Promise<TeamMember> {
    return prisma.teamMember.delete({
      where: { id: memberId },
    });
  }

  async findTeamIdsByUserInOrganization(
    userId: string,
    organizationId: string,
  ): Promise<string[]> {
    const memberships = await prisma.teamMember.findMany({
      where: {
        userId,
        team: {
          organizationId,
          deletedAt: null,
        },
      },
      select: { teamId: true },
    });

    return memberships.map((membership) => membership.teamId);
  }
}

export const teamMemberRepository = new TeamMemberRepository();
