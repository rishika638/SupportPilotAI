import { Organization, Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";

export class OrganizationRepository {
  async findById(id: string): Promise<Organization | null> {
    return prisma.organization.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    return prisma.organization.findFirst({
      where: {
        slug,
        deletedAt: null,
      },
    });
  }

  async create(data: Prisma.OrganizationCreateInput): Promise<Organization> {
    return prisma.organization.create({ data });
  }
}

export const organizationRepository = new OrganizationRepository();
