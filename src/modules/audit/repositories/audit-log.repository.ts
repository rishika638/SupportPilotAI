import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";

export interface CreateAuditLogInput {
  organizationId: string;
  actorId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  beforeState?: Prisma.InputJsonValue;
  afterState?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  metadata?: Prisma.InputJsonValue;
}

type AuditClient = Pick<typeof prisma, "auditLog">;

export class AuditLogRepository {
  async create(
    input: CreateAuditLogInput,
    client: AuditClient = prisma,
  ) {
    return client.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        beforeState: input.beforeState,
        afterState: input.afterState,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata: input.metadata ?? {},
      },
    });
  }
}

export const auditLogRepository = new AuditLogRepository();
