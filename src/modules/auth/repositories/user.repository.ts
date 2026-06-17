import { MembershipStatus, Organization, OrganizationMember, Prisma, User } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";

export type UserWithMemberships = User & {
  memberships: (OrganizationMember & { organization: Organization })[];
};

export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        deletedAt: null,
      },
    });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
        isActive: true,
      },
    });
  }

  async findByIdWithMemberships(id: string): Promise<UserWithMemberships | null> {
    return prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
        isActive: true,
      },
      include: {
        memberships: {
          where: {
            deletedAt: null,
            status: MembershipStatus.ACTIVE,
          },
          include: {
            organization: true,
          },
          orderBy: {
            joinedAt: "asc",
          },
        },
      },
    });
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data });
  }

  async updateLastLogin(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }
}

export const userRepository = new UserRepository();
