import { Job, Worker } from "bullmq";
import { logger } from "../infrastructure/logger/pino.logger";
import { createWorker, QUEUE_NAMES } from "../infrastructure/queue/queue.factory";
import { notificationRepository } from "../modules/notifications/repositories/notification.repository";
import { NotificationJobPayload } from "../modules/notifications/notifications.service";

let _worker: Worker | null = null;

export function startNotificationWorker(): Worker {
  if (_worker) return _worker;

  const worker = createWorker(
    QUEUE_NAMES.NOTIFICATION_DISPATCH,
    async (job: Job<NotificationJobPayload>) => {
      const { organizationId, userId, ticketId, type, title, body, payload } = job.data;

      try {
        await notificationRepository.create({
          organizationId,
          userId,
          ticketId,
          type,
          title,
          body,
          payload: (payload ?? {}) as import("@prisma/client").Prisma.InputJsonValue,
        });

        logger.info({ userId, type, ticketId }, "Notification dispatched");
      } catch (err) {
        logger.error({ err, userId, type, ticketId, jobId: job.id }, "Notification create failed");
        throw err;
      }
    },
  );

  worker.on("ready", () => {
    logger.info({ queue: QUEUE_NAMES.NOTIFICATION_DISPATCH }, "Notification worker ready and consuming jobs");
  });

  logger.info(
  {
    queue: QUEUE_NAMES.NOTIFICATION_DISPATCH,
  },
  "Notification worker started"
);

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "Notification dispatch job failed");
  });

  _worker = worker;
  return _worker;
}
