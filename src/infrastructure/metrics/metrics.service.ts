import { Request, Response, NextFunction } from "express";
import { getQueue, QUEUE_NAMES } from "../queue/queue.factory";
import { logger } from "../logger/pino.logger";

const HISTOGRAM_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const HTTP_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "TRACE",
  "CONNECT",
]);

export function normalizeMetricRoute(routePath: unknown): string {
  return typeof routePath === "string" ? routePath : "unmatched";
}

export function normalizeMetricMethod(method: string): string {
  const normalized = method.toUpperCase();
  return HTTP_METHODS.has(normalized) ? normalized : "OTHER";
}

class MetricsService {
  private httpRequestsTotal = new Map<string, number>();
  private httpDurationSum = new Map<string, number>();
  private httpDurationCount = new Map<string, number>();
  private httpDurationBuckets = new Map<string, Map<number, number>>();
  private slaBreachesTotal = new Map<string, number>();

  recordHttpRequest(method: string, route: string, status: number, durationMs: number): void {
    const statusCategory = `${status}`;
    const metricKey = `method="${method}",route="${route}",status="${statusCategory}"`;

    // 1. Counter: http_requests_total
    this.httpRequestsTotal.set(metricKey, (this.httpRequestsTotal.get(metricKey) ?? 0) + 1);

    // 2. Histogram: http_request_duration_ms
    const baseKey = `method="${method}",route="${route}"`;
    this.httpDurationSum.set(baseKey, (this.httpDurationSum.get(baseKey) ?? 0) + durationMs);
    this.httpDurationCount.set(baseKey, (this.httpDurationCount.get(baseKey) ?? 0) + 1);

    if (!this.httpDurationBuckets.has(baseKey)) {
      this.httpDurationBuckets.set(baseKey, new Map<number, number>());
    }
    const buckets = this.httpDurationBuckets.get(baseKey)!;
    for (const b of HISTOGRAM_BUCKETS) {
      if (durationMs <= b) {
        buckets.set(b, (buckets.get(b) ?? 0) + 1);
      }
    }
  }

  recordSlaBreach(priority: string): void {
    const key = `priority="${priority}"`;
    this.slaBreachesTotal.set(key, (this.slaBreachesTotal.get(key) ?? 0) + 1);
  }

  async getQueueMetrics(): Promise<Array<{ queue: string; waiting: number; active: number; failed: number; delayed: number }>> {
    const metrics: Array<{ queue: string; waiting: number; active: number; failed: number; delayed: number }> = [];

    for (const queueName of Object.values(QUEUE_NAMES)) {
      try {
        const queue = getQueue(queueName);
        const counts = await queue.getJobCounts("waiting", "active", "failed", "delayed");
        metrics.push({
          queue: queueName,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        });
      } catch (err) {
        logger.warn({ err, queueName }, "Failed to collect BullMQ queue counts for metrics");
      }
    }

    return metrics;
  }

  async generatePrometheusOutput(): Promise<string> {
    const lines: string[] = [];

    // HTTP Requests Total
    lines.push("# HELP http_requests_total Total number of HTTP requests");
    lines.push("# TYPE http_requests_total counter");
    for (const [labels, count] of this.httpRequestsTotal.entries()) {
      lines.push(`http_requests_total{${labels}} ${count}`);
    }

    // HTTP Request Duration Histogram
    lines.push("# HELP http_request_duration_ms HTTP request duration in milliseconds");
    lines.push("# TYPE http_request_duration_ms histogram");
    for (const [baseKey, count] of this.httpDurationCount.entries()) {
      const sum = this.httpDurationSum.get(baseKey) ?? 0;
      const buckets = this.httpDurationBuckets.get(baseKey) ?? new Map<number, number>();

      for (const b of HISTOGRAM_BUCKETS) {
        const bCount = buckets.get(b) ?? 0;
        lines.push(`http_request_duration_ms_bucket{${baseKey},le="${b}"} ${bCount}`);
      }
      lines.push(`http_request_duration_ms_bucket{${baseKey},le="+Inf"} ${count}`);
      lines.push(`http_request_duration_ms_sum{${baseKey}} ${sum.toFixed(2)}`);
      lines.push(`http_request_duration_ms_count{${baseKey}} ${count}`);
    }

    // BullMQ Queue Metrics
    const queueMetrics = await this.getQueueMetrics();
    lines.push("# HELP bullmq_queue_depth Current depth of BullMQ queue (waiting + active + delayed)");
    lines.push("# TYPE bullmq_queue_depth gauge");
    for (const q of queueMetrics) {
      lines.push(`bullmq_queue_depth{queue="${q.queue}"} ${q.waiting + q.active + q.delayed}`);
    }

    lines.push("# HELP bullmq_failed_jobs_total Number of failed jobs in BullMQ queue");
    lines.push("# TYPE bullmq_failed_jobs_total gauge");
    for (const q of queueMetrics) {
      lines.push(`bullmq_failed_jobs_total{queue="${q.queue}"} ${q.failed}`);
    }

    // SLA Breaches Counter
    lines.push("# HELP sla_breaches_total Total number of SLA breaches processed");
    lines.push("# TYPE sla_breaches_total counter");
    for (const [labels, count] of this.slaBreachesTotal.entries()) {
      lines.push(`sla_breaches_total{${labels}} ${count}`);
    }

    return lines.join("\n") + "\n";
  }
}

export const metricsService = new MetricsService();

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;

    const routePath = req.route?.path;
    metricsService.recordHttpRequest(
      normalizeMetricMethod(req.method),
      normalizeMetricRoute(routePath),
      res.statusCode,
      durationMs,
    );
  });

  next();
}
