import "dotenv/config";

import { connectDatabase, disconnectDatabase } from "./infrastructure/database/prisma.client";
import { logger } from "./infrastructure/logger/pino.logger";
import { connectRedis, disconnectRedis } from "./infrastructure/redis/redis.client";
import { closeQueues } from "./infrastructure/queue/queue.factory";
import { startAIAnalysisWorker } from "./workers/ai-analysis.worker";
import { startNotificationWorker } from "./workers/notification.worker";
import { startSLAScheduler, stopSLAScheduler } from "./workers/sla-scheduler.worker";
import { startCleanupWorker, stopCleanupWorker } from "./workers/cleanup.worker";

async function bootstrapWorker(): Promise<void> {
  await connectDatabase();
  await connectRedis();

  startAIAnalysisWorker();
  startNotificationWorker();
  startSLAScheduler();
  startCleanupWorker();

  logger.info("SupportPilot AI standalone worker process started");

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Worker shutdown signal received");

    stopSLAScheduler();
    stopCleanupWorker();
    await closeQueues();
    await Promise.allSettled([disconnectDatabase(), disconnectRedis()]);
    logger.info("Worker process shut down gracefully");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrapWorker().catch((error) => {
  logger.fatal({ err: error }, "Failed to start worker process");
  process.exit(1);
});
