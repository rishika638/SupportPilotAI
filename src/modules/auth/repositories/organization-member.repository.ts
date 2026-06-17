import { OrganizationMember, Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";

export class OrganizationMemberRepository {
  async create(data: Prisma.OrganizationMemberCreateInput): Promise<OrganizationMember> {
    return prisma.organizationMember.create({ data });
  }

  async findActiveByUserAndOrganization(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMember | null> {
    return prisma.organizationMember.findFirst({
      where: {
        userId,
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
      },
    });
  }

  async findPrimaryMembership(userId: string): Promise<OrganizationMember | null> {
    return prisma.organizationMember.findFirst({
      where: {
        userId,
        deletedAt: null,
        status: "ACTIVE",
      },
      orderBy: {
        joinedAt: "asc",
      },
    });
  }

  createAdminMembershipInput(
    userId: string,
    organizationId: string,
  ): Prisma.OrganizationMemberCreateInput {
    const now = new Date();

    return {
      user: { connect: { id: userId } },
      organization: { connect: { id: organizationId } },
      role: UserRole.ADMIN,
      status: "ACTIVE",
      invitedAt: now,
      joinedAt: now,
    };
  }
}

export const organizationMemberRepository = new OrganizationMemberRepository();
