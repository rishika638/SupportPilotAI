import { Job, Worker } from "bullmq";
import { logger } from "../infrastructure/logger/pino.logger";
import { createWorker, QUEUE_NAMES } from "../infrastructure/queue/queue.factory";
import { aiAnalysisService, AIAnalysisJobPayload } from "../modules/ai/ai-analysis.service";
import { getAIProvider } from "../modules/ai/providers/provider.factory";
import { aiAnalysisSchema } from "../modules/ai/providers/ai.provider";

async function processAIAnalysis(job: Job<AIAnalysisJobPayload>): Promise<void> {
  const { analysisId, ticketId, organizationId, subject, description } = job.data;

  await aiAnalysisService.markProcessing(analysisId);

  const start = Date.now();
  const provider = getAIProvider();
  const rawResult = await provider.analyze(subject, description);
  const validated = aiAnalysisSchema.parse(rawResult);
  const latencyMs = Date.now() - start;

  await aiAnalysisService.markCompleted(
    analysisId,
    {
      ...validated,
      rawResponse: validated as object,
      latencyMs,
    },
    ticketId,
    organizationId,
  );

  logger.info({ analysisId, ticketId, latencyMs }, "AI analysis completed");
}

let _worker: Worker | null = null;

export function startAIAnalysisWorker(): Worker {
  if (_worker) return _worker;

  getAIProvider();

  const worker = createWorker(QUEUE_NAMES.AI_ANALYSIS, async (job: Job<AIAnalysisJobPayload>) => {
    try {
      await processAIAnalysis(job);
    } catch (err) {
      logger.error({ err, analysisId: job.data.analysisId, attempt: job.attemptsMade }, "AI analysis job failed");
      await aiAnalysisService.markFailed(job.data.analysisId, (err as Error).message);
      throw err;
    }
  });

  worker.on("ready", () => {
    logger.info({ queue: QUEUE_NAMES.AI_ANALYSIS }, "AI analysis worker ready and consuming jobs");
  });

  logger.info(
  {
    queue: QUEUE_NAMES.AI_ANALYSIS,
  },
  "AI analysis worker started"
);


  worker.on("failed", (job, _err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 5)) {
      logger.error({ analysisId: job.data.analysisId }, "AI analysis job exhausted retries — dead letter");
    }
  });

  _worker = worker;
  return _worker;
}
