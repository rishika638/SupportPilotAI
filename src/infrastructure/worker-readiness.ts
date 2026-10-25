export interface QueueWorkerReadiness {
  running: boolean;
  paused: boolean;
  redisStatus: string;
}

export function areQueueWorkersReady(
  workers: readonly QueueWorkerReadiness[],
): boolean {
  return workers.length > 0 && workers.every(
    (worker) =>
      worker.running &&
      !worker.paused &&
      worker.redisStatus === "ready",
  );
}
