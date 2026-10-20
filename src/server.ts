import "dotenv/config";

import { createServer } from "node:http";
import { env } from "./config/env";
import { createApp, shutdownApp } from "./app";
import { connectDatabase } from "./infrastructure/database/prisma.client";
import { logger } from "./infrastructure/logger/pino.logger";
import { connectRedis } from "./infrastructure/redis/redis.client";
import { closeQueues } from "./infrastructure/queue/queue.factory";
import { startAIAnalysisWorker } from "./workers/ai-analysis.worker";
import { startNotificationWorker } from "./workers/notification.worker";
import { startSLAScheduler, stopSLAScheduler } from "./workers/sla-scheduler.worker";
import { startCleanupWorker, stopCleanupWorker } from "./workers/cleanup.worker";

async function bootstrap(): Promise<void> {
  await connectDatabase();
  await connectRedis();

  if (process.env.DISABLE_WORKERS !== "true") {
    startAIAnalysisWorker();
    startNotificationWorker();
    startSLAScheduler();
    startCleanupWorker();
  } else {
    logger.info("In-process background workers disabled (running in API-only mode)");
  }

  const app = createApp();
  const server = createServer(app);

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "Server started");
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Shutdown signal received");

    server.close(async () => {
      stopSLAScheduler();
      stopCleanupWorker();
      await closeQueues();
      await shutdownApp();
      logger.info("Server shut down gracefully");
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error) => {
  logger.fatal({ err: error }, "Failed to start server");
  process.exit(1);
});
