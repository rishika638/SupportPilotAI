import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  areQueueWorkersReady,
  type QueueWorkerReadiness,
} from "../src/infrastructure/worker-readiness";

describe("BullMQ worker readiness", () => {
  const readyWorkers: QueueWorkerReadiness[] = [
    { running: true, paused: false, redisStatus: "ready" },
    { running: true, paused: false, redisStatus: "ready" },
  ];

  it("requires every queue consumer to be running and connected", () => {
    assert.equal(areQueueWorkersReady(readyWorkers), true);
  });

  it("reports not ready if any consumer is stopped, paused, or disconnected", () => {
    for (const worker of [
      { running: false, paused: false, redisStatus: "ready" },
      { running: true, paused: true, redisStatus: "ready" },
      { running: true, paused: false, redisStatus: "reconnecting" },
    ]) {
      assert.equal(areQueueWorkersReady([readyWorkers[0], worker]), false);
    }
  });

  it("does not report ready before queue consumers are registered", () => {
    assert.equal(areQueueWorkersReady([]), false);
  });
});
