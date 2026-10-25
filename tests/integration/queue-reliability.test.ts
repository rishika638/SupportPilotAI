import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { Queue, QueueEvents, Worker } from "bullmq";
import type { Processor, WorkerOptions } from "bullmq";
import { redisConfig } from "../../src/config/redis";

const connection = {
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password || undefined,
  db: redisConfig.db,
  tls: redisConfig.tls,
};

interface QueueHarness {
  queue: Queue;
  events: QueueEvents;
  startWorker(processor: Processor, options?: Partial<WorkerOptions>): Promise<Worker>;
}

async function withQueueHarness(
  scenario: (harness: QueueHarness) => Promise<void>,
): Promise<void> {
  const queueName = `supportpilot-integration-${randomUUID()}`;
  const queue = new Queue(queueName, {
    connection,
    defaultJobOptions: {
      removeOnComplete: false,
      removeOnFail: false,
    },
  });
  const events = new QueueEvents(queueName, { connection });
  const workers = new Set<Worker>();

  const harness: QueueHarness = {
    queue,
    events,
    async startWorker(processor, options = {}) {
      const worker = new Worker(queueName, processor, {
        connection,
        concurrency: 1,
        ...options,
      });
      workers.add(worker);
      await worker.waitUntilReady();
      return worker;
    },
  };

  try {
    await Promise.all([queue.waitUntilReady(), events.waitUntilReady()]);
    await scenario(harness);
  } finally {
    await Promise.allSettled([...workers].map((worker) => worker.close()));
    await events.close();
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
  }
}

describe("BullMQ reliability against the configured Redis test instance", () => {
  it("retries a transient processor failure and eventually completes", async () => {
    await withQueueHarness(async ({ queue, events, startWorker }) => {
      let processorCalls = 0;
      await startWorker(async () => {
        processorCalls += 1;
        if (processorCalls === 1) throw new Error("controlled transient failure");
        return { recovered: true };
      });

      const job = await queue.add(
        "transient-retry",
        { scenario: "transient-retry" },
        { attempts: 3, backoff: { type: "fixed", delay: 10 } },
      );
      const result = await job.waitUntilFinished(events, 10_000);

      assert.deepEqual(result, { recovered: true });
      assert.equal(processorCalls, 2, "The processor should retry once then succeed");
    });
  });

  it("retains a permanently failing job in the failed state after attempts are exhausted", async () => {
    await withQueueHarness(async ({ queue, events, startWorker }) => {
      let processorCalls = 0;
      await startWorker(async () => {
        processorCalls += 1;
        throw new Error("controlled permanent failure");
      });

      const job = await queue.add(
        "permanent-failure",
        { scenario: "permanent-failure" },
        { attempts: 2, backoff: { type: "fixed", delay: 10 } },
      );

      await assert.rejects(job.waitUntilFinished(events, 10_000));
      const persistedJob = await queue.getJob(job.id!);
      assert.ok(persistedJob, "The failed job should remain inspectable");
      assert.equal(await persistedJob.getState(), "failed");
      assert.equal(processorCalls, 2, "The processor should stop after two attempts");
    });
  });

  it("deduplicates equivalent jobs while the original job is retained", async () => {
    await withQueueHarness(async ({ queue, events, startWorker }) => {
      let processorCalls = 0;
      await startWorker(async () => {
        processorCalls += 1;
        return { processed: true };
      });

      const options = { jobId: "same-logical-operation", removeOnComplete: false };
      const first = await queue.add("deduplicate", { value: 1 }, options);
      const duplicate = await queue.add("deduplicate", { value: 1 }, options);
      assert.equal(duplicate.id, first.id);

      await first.waitUntilFinished(events, 10_000);
      assert.equal(processorCalls, 1, "A retained job ID should not be processed twice");
    });
  });

  it("processes queued work after a worker is restarted", async () => {
    await withQueueHarness(async ({ queue, events, startWorker }) => {
      const firstWorker = await startWorker(async () => ({ worker: "first" }));
      await firstWorker.close();

      const job = await queue.add("pending-during-restart", { scenario: "restart" });
      await startWorker(async () => ({ worker: "restarted" }));
      const result = await job.waitUntilFinished(events, 10_000);

      assert.deepEqual(result, { worker: "restarted" });
    });
  });
});
