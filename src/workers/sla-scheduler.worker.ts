import { logger } from "../infrastructure/logger/pino.logger";
import { slaService } from "../modules/sla/sla.service";

const INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

let _timer: NodeJS.Timeout | null = null;

export function startSLAScheduler(): void {
  if (_timer) return;

  const run = async () => {
    try {
      await slaService.runBreachCheck();
    } catch (err) {
      logger.error({ err }, "SLA breach check failed");
    }
  };

  // Run immediately on start, then on interval
  run();
  _timer = setInterval(run, INTERVAL_MS);
  logger.info({ intervalMs: INTERVAL_MS }, "SLA scheduler started");
}

export function stopSLAScheduler(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
