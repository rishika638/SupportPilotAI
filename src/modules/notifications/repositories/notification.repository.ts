import { NotificationChannel, NotificationStatus, NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";

export interface CreateNotificationInput {
  organizationId: string;
  userId: string;
  ticketId?: string;
  type: NotificationType;
  channel?: NotificationChannel;
  title: string;
  body: string;
  payload?: Prisma.InputJsonValue;
}

type NotificationClient = Pick<typeof prisma, "notification">;

export class NotificationRepository {
  async create(input: CreateNotificationInput, client: NotificationClient = prisma) {
    return client.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        ticketId: input.ticketId,
        type: input.type,
        channel: input.channel ?? NotificationChannel.IN_APP,
        status: NotificationStatus.SENT,
        title: input.title,
        body: input.body,
        payload: input.payload ?? {},
        sentAt: new Date(),
      },
    });
  }

  async findManyByUser(
    organizationId: string,
    userId: string,
    opts: { unreadOnly?: boolean; limit?: number; offset?: number },
  ) {
    const where: Prisma.NotificationWhereInput = {
      organizationId,
      userId,
      ...(opts.unreadOnly ? { readAt: null, status: NotificationStatus.SENT } : {}),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: opts.limit ?? 20,
        skip: opts.offset ?? 0,
      }),
      prisma.notification.count({ where }),
    ]);

    return { notifications, total };
  }

  async markRead(organizationId: string, userId: string, notificationId: string) {
    return prisma.notification.updateMany({
      where: { id: notificationId, organizationId, userId, readAt: null },
      data: { readAt: new Date(), status: NotificationStatus.READ },
    });
  }

  async markAllRead(organizationId: string, userId: string) {
    return prisma.notification.updateMany({
      where: { organizationId, userId, readAt: null },
      data: { readAt: new Date(), status: NotificationStatus.READ },
    });
  }
}

export const notificationRepository = new NotificationRepository();
