import { AIAnalysisStatus, Prisma, TicketPriority } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import { getQueue, QUEUE_NAMES } from "../../infrastructure/queue/queue.factory";

export interface AIAnalysisJobPayload {
  analysisId: string;
  ticketId: string;
  organizationId: string;
  subject: string;
  description: string;
}

export class AIAnalysisService {
  async enqueue(
    ticketId: string,
    organizationId: string,
    subject: string,
    description: string,
  ): Promise<void> {
    const analysis = await prisma.aIAnalysis.create({
      data: {
        ticketId,
        organizationId,
        status: AIAnalysisStatus.PENDING,
      },
    });

    const payload: AIAnalysisJobPayload = {
      analysisId: analysis.id,
      ticketId,
      organizationId,
      subject,
      description,
    };

    await getQueue(QUEUE_NAMES.AI_ANALYSIS).add(
      "analyze-ticket",
      payload,
      { jobId: `ai-${analysis.id}` },
    );
  }

  async markProcessing(analysisId: string): Promise<void> {
    await prisma.aIAnalysis.update({
      where: { id: analysisId },
      data: { status: AIAnalysisStatus.PROCESSING },
    });
  }

  async markCompleted(
    analysisId: string,
    result: {
      summary: string;
      category: string;
      subcategory?: string;
      sentiment: string;
      suggestedPriority: string;
      tags: string[];
      confidence: number;
      modelVersion: string;
      tokenCount?: number;
      rawResponse: Prisma.InputJsonValue;
      latencyMs: number;
    },
  ): Promise<void> {
    await prisma.aIAnalysis.update({
      where: { id: analysisId },
      data: {
        status: AIAnalysisStatus.COMPLETED,
        summary: result.summary,
        category: result.category,
        subcategory: result.subcategory,
        sentiment: result.sentiment,
        suggestedPriority: result.suggestedPriority as TicketPriority,
        tags: result.tags,
        confidence: result.confidence,
        modelVersion: result.modelVersion,
        promptVersion: "v1",
        tokenCount: result.tokenCount,
        rawResponse: result.rawResponse,
        latencyMs: result.latencyMs,
        completedAt: new Date(),
      },
    });
  }

  async markFailed(analysisId: string, errorMessage: string): Promise<void> {
    await prisma.aIAnalysis.update({
      where: { id: analysisId },
      data: { status: AIAnalysisStatus.FAILED, errorMessage },
    });
  }
}

export const aiAnalysisService = new AIAnalysisService();
