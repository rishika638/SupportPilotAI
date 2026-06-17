import { prisma } from "../infrastructure/database/prisma.client";
import { logger } from "../infrastructure/logger/pino.logger";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let _timer: NodeJS.Timeout | null = null;

async function runCleanup(): Promise<void> {
  const now = new Date();

  const [deletedKeys] = await Promise.all([
    prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
  ]);

  logger.info(
    { deletedIdempotencyKeys: deletedKeys.count },
    "Cleanup job completed",
  );
}

export function startCleanupWorker(): void {
  if (_timer) return;

  runCleanup().catch((err) => logger.error({ err }, "Initial cleanup job failed"));
  _timer = setInterval(() => {
    runCleanup().catch((err) => logger.error({ err }, "Cleanup job failed"));
  }, INTERVAL_MS);

  logger.info({ intervalMs: INTERVAL_MS }, "Cleanup worker started");
}

export function stopCleanupWorker(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
