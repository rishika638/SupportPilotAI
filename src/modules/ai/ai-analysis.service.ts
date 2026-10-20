import { AIAnalysisStatus, Prisma, TicketPriority } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import { getQueue, QUEUE_NAMES } from "../../infrastructure/queue/queue.factory";
import type { AIAnalysisDto } from "./ai-analysis.dto";

export interface AIAnalysisJobPayload {
  analysisId: string;
  ticketId: string;
  organizationId: string;
  subject: string;
  description: string;
}

type QueueFactory = typeof getQueue;

export class AIAnalysisService {
  constructor(
    private readonly database: PrismaClient = prisma,
    private readonly queueFactory: QueueFactory = getQueue,
  ) {}

  async enqueue(
    ticketId: string,
    organizationId: string,
    subject: string,
    description: string,
  ): Promise<void> {
    const analysis = await this.database.aIAnalysis.create({
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

    try {
      await this.queueFactory(QUEUE_NAMES.AI_ANALYSIS).add(
        "analyze-ticket",
        payload,
        { jobId: `ai-${analysis.id}` },
      );
    } catch (error) {
      await this.markFailed(
        analysis.id,
        error instanceof Error ? error.message : "AI analysis job enqueue failed",
      );
      throw error;
    }
  }

  async markProcessing(analysisId: string): Promise<void> {
    await this.database.aIAnalysis.update({
      where: { id: analysisId },
      data: { status: AIAnalysisStatus.PROCESSING, errorMessage: null },
    });
  }

  async getLatestForTicket(
    organizationId: string,
    ticketId: string,
  ): Promise<AIAnalysisDto | null> {
    const analysis = await this.database.aIAnalysis.findFirst({
      where: { organizationId, ticketId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        ticketId: true,
        status: true,
        summary: true,
        category: true,
        subcategory: true,
        sentiment: true,
        suggestedPriority: true,
        confidence: true,
        tags: true,
        modelVersion: true,
        completedAt: true,
        createdAt: true,
      },
    });

    if (!analysis) return null;

    return {
      ...analysis,
      confidence: analysis.confidence === null ? null : Number(analysis.confidence),
      completedAt: analysis.completedAt?.toISOString() ?? null,
      createdAt: analysis.createdAt.toISOString(),
    };
  }

  async markCompleted(
    analysisId: string,
    result: {
      summary: string;
      category: string;
      subcategory?: string;
      sentiment: string;
      suggestedPriority: string;
      suggestedResponse: string;
      tags: string[];
      confidence: number;
      modelVersion: string;
      tokenCount?: number;
      rawResponse: Prisma.InputJsonValue;
      latencyMs: number;
    },
    ticketId?: string,
    organizationId?: string,
  ): Promise<void> {
    const rawResponse = {
      ...(typeof result.rawResponse === "object" && result.rawResponse !== null
        ? (result.rawResponse as Record<string, unknown>)
        : {}),
      suggestedResponse: result.suggestedResponse,
    };

    await this.database.$transaction(async (tx) => {
      await tx.aIAnalysis.update({
        where: { id: analysisId },
        data: {
          status: AIAnalysisStatus.COMPLETED,
          errorMessage: null,
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
          rawResponse: rawResponse as Prisma.InputJsonValue,
          latencyMs: result.latencyMs,
          completedAt: new Date(),
        },
      });

      if (ticketId && organizationId) {
        const ticket = await tx.ticket.findFirst({
          where: { id: ticketId, organizationId, deletedAt: null },
          select: { metadata: true },
        });

        if (ticket) {
          const existingMeta =
            typeof ticket.metadata === "object" && ticket.metadata !== null
              ? (ticket.metadata as Record<string, unknown>)
              : {};

          await tx.ticket.updateMany({
            where: { id: ticketId, organizationId, deletedAt: null },
            data: {
              metadata: {
                ...existingMeta,
                suggestedResponse: result.suggestedResponse,
                aiCategory: result.category,
                aiSentiment: result.sentiment,
              },
            },
          });
        }
      }
    });
  }

  async markFailed(analysisId: string, errorMessage: string): Promise<void> {
    await this.database.aIAnalysis.updateMany({
      where: { id: analysisId, status: { not: AIAnalysisStatus.COMPLETED } },
      data: { status: AIAnalysisStatus.FAILED, errorMessage },
    });
  }
}

export const aiAnalysisService = new AIAnalysisService();
