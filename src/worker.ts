import "dotenv/config";

import { createServer } from "node:http";
import { connectDatabase, disconnectDatabase } from "./infrastructure/database/prisma.client";
import { logger } from "./infrastructure/logger/pino.logger";
import { connectRedis, disconnectRedis } from "./infrastructure/redis/redis.client";
import { closeQueues } from "./infrastructure/queue/queue.factory";
import { areQueueWorkersReady } from "./infrastructure/worker-readiness";
import { startAIAnalysisWorker } from "./workers/ai-analysis.worker";
import { startNotificationWorker } from "./workers/notification.worker";
import { startSLAScheduler, stopSLAScheduler } from "./workers/sla-scheduler.worker";
import { startCleanupWorker, stopCleanupWorker } from "./workers/cleanup.worker";

async function bootstrapWorker(): Promise<void> {
  await connectDatabase();
  await connectRedis();

  const queueWorkers = [
    startAIAnalysisWorker(),
    startNotificationWorker(),
  ];
  startSLAScheduler();
  startCleanupWorker();

  const isReady = async (): Promise<boolean> => {
    try {
      const states = await Promise.all(
        queueWorkers.map(async (worker) => ({
          running: worker.isRunning(),
          paused: worker.isPaused(),
          redisStatus: (await worker.client).status,
        })),
      );
      return areQueueWorkersReady(states);
    } catch (error) {
      logger.warn({ err: error }, "Failed to check BullMQ worker readiness");
      return false;
    }
  };

  const healthServer = createServer((request, response) => {
    if (request.url !== "/ready") {
      response.writeHead(404).end();
      return;
    }

    void isReady().then((ready) => {
      response.writeHead(ready ? 200 : 503, {
        "Content-Type": "application/json",
      });
      response.end(JSON.stringify({ status: ready ? "ready" : "not_ready" }));
    });
  });
  healthServer.listen(3001, "127.0.0.1");

  const reportReadiness = async (): Promise<void> => {
    const ready = await isReady();
    logger.info({ ready }, "Worker readiness heartbeat");
  };
  void reportReadiness();
  const heartbeat = setInterval(() => {
    void reportReadiness();
  }, 60_000);

  logger.info("SupportPilot AI standalone worker process started");

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Worker shutdown signal received");

    clearInterval(heartbeat);
    await new Promise<void>((resolve, reject) => {
      healthServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
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
