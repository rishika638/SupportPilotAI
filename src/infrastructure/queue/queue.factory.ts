import { Queue, Worker } from "bullmq";
import type { Processor, WorkerOptions } from "bullmq";
import { redisConfig } from "../../config/redis";

const connection = {
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password || undefined,
  db: redisConfig.db,
};

export const QUEUE_NAMES = {
  AI_ANALYSIS: "ai-analysis",
  NOTIFICATION_DISPATCH: "notification-dispatch",
} as const;

const queues = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: "exponential", delay: 2_000 },
          removeOnComplete: { count: 500 },
          removeOnFail: { count: 200 },
        },
      }),
    );
  }
  return queues.get(name)!;
}

export function createWorker(
  name: string,
  processor: Processor,
  opts?: Partial<WorkerOptions>,
): Worker {
  return new Worker(name, processor, {
    connection,
    concurrency: 5,
    ...opts,
  });
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
}
