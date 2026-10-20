import { AIAnalysisStatus, TicketPriority, UserRole } from "@prisma/client";
import type { PrismaClient, OrganizationMember } from "@prisma/client";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AIAnalysisService } from "../src/modules/ai/ai-analysis.service";
import { validateAIProviderConfiguration } from "../src/modules/ai/providers/provider.factory";
import { TicketsController } from "../src/modules/tickets/tickets.controller";
import { TicketsService } from "../src/modules/tickets/tickets.service";
import type { TicketWithRelations } from "../src/modules/tickets/repositories/ticket.repository";
import type { AIAnalysisDto } from "../src/modules/ai/ai-analysis.dto";
import type { getQueue } from "../src/infrastructure/queue/queue.factory";
import type { Request, Response } from "express";

interface TestAnalysisState {
  id: string;
  ticketId: string;
  organizationId: string;
  status: AIAnalysisStatus;
  errorMessage: string | null;
  summary: string | null;
  category: string | null;
  metadata: Record<string, unknown>;
}

function makeAnalysisService(options: {
  queueAdd?: () => Promise<unknown>;
  metadataUpdate?: () => Promise<void>;
} = {}) {
  const state: TestAnalysisState = {
    id: "analysis-1",
    ticketId: "ticket-1",
    organizationId: "org-1",
    status: AIAnalysisStatus.PENDING,
    errorMessage: null,
    summary: null,
    category: null,
    metadata: {},
  };
  let queryScope: { organizationId: string; ticketId: string } | undefined;
  const databaseMock = {
    aIAnalysis: {
      create: async ({ data }: { data: { status: AIAnalysisStatus } }) => {
        state.status = data.status;
        return { id: state.id };
      },
      update: async ({ data }: { data: Partial<TestAnalysisState> }) => {
        Object.assign(state, data);
        return state;
      },
      updateMany: async ({ where, data }: {
        where: { id: string; status?: { not: AIAnalysisStatus } };
        data: Partial<TestAnalysisState>;
      }) => {
        if (
          where.id === state.id &&
          (!where.status || state.status !== where.status.not)
        ) {
          Object.assign(state, data);
          return { count: 1 };
        }
        return { count: 0 };
      },
      findFirst: async ({ where }: {
        where: { organizationId: string; ticketId: string };
      }) => {
        queryScope = where;
        if (
          where.organizationId !== state.organizationId ||
          where.ticketId !== state.ticketId
        ) return null;

        return {
          id: state.id,
          ticketId: state.ticketId,
          status: state.status,
          summary: state.summary,
          category: state.category,
          subcategory: null,
          sentiment: null,
          suggestedPriority: null,
          confidence: null,
          tags: [],
          modelVersion: null,
          completedAt: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        };
      },
    },
    ticket: {
      findFirst: async () => ({ metadata: state.metadata }),
      updateMany: async () => {
        await options.metadataUpdate?.();
        return { count: 1 };
      },
    },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = { ...state, metadata: { ...state.metadata } };
      try {
        return await callback(databaseMock);
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    },
  };
  const database = databaseMock as unknown as PrismaClient;
  const queueFactory = (() => ({
    add: options.queueAdd ?? (async () => ({})),
  })) as unknown as typeof getQueue;

  return {
    service: new AIAnalysisService(database, queueFactory),
    state,
    getQueryScope: () => queryScope,
  };
}

const validResult = {
  summary: "Customer needs help accessing the account.",
  category: "Account",
  sentiment: "neutral",
  suggestedPriority: TicketPriority.MEDIUM,
  suggestedResponse: "We can help with your account.",
  tags: ["account"],
  confidence: 0.9,
  modelVersion: "mock-model",
  rawResponse: { summary: "Customer needs help accessing the account." },
  latencyMs: 12,
};

describe("AI analysis configuration", () => {
  it("rejects a missing Gemini key with actionable configuration guidance", () => {
    assert.throws(
      () => validateAIProviderConfiguration({
        AI_PROVIDER: "gemini",
        GEMINI_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
        OLLAMA_BASE_URL: "http://localhost:11434/v1",
        OLLAMA_MODEL: "llama3",
        OLLAMA_API_KEY: "",
      }),
      /GEMINI_API_KEY is required.*worker environment/,
    );
  });

  it("preserves OpenAI and Ollama configuration choices", () => {
    assert.doesNotThrow(() => validateAIProviderConfiguration({
      AI_PROVIDER: "openai",
      GEMINI_API_KEY: undefined,
      OPENAI_API_KEY: "test-key",
      OLLAMA_BASE_URL: "http://localhost:11434/v1",
      OLLAMA_MODEL: "llama3",
      OLLAMA_API_KEY: "",
    }));
    assert.doesNotThrow(() => validateAIProviderConfiguration({
      AI_PROVIDER: "ollama",
      GEMINI_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
      OLLAMA_BASE_URL: "http://localhost:11434/v1",
      OLLAMA_MODEL: "llama3",
      OLLAMA_API_KEY: "",
    }));
  });
});

describe("AI analysis persistence", () => {
  it("clears a failed attempt's error when a retry succeeds", async () => {
    const { service, state } = makeAnalysisService();
    await service.markFailed(state.id, "temporary provider failure");
    assert.equal(state.status, AIAnalysisStatus.FAILED);

    await service.markProcessing(state.id);
    assert.equal(state.errorMessage, null);
    await service.markCompleted(state.id, validResult, state.ticketId, state.organizationId);

    assert.equal(state.status, AIAnalysisStatus.COMPLETED);
    assert.equal(state.summary, validResult.summary);
    assert.equal(state.errorMessage, null);
  });

  it("rolls back analysis completion when the separate ticket metadata write fails", async () => {
    const { service, state } = makeAnalysisService({
      metadataUpdate: async () => {
        throw new Error("metadata update failed");
      },
    });

    await assert.rejects(
      service.markCompleted(state.id, validResult, state.ticketId, state.organizationId),
      /metadata update failed/,
    );
    await service.markFailed(state.id, "metadata update failed");

    assert.equal(state.status, AIAnalysisStatus.FAILED);
    assert.equal(state.summary, null);
  });

  it("marks an analysis failed when queue insertion fails", async () => {
    const { service, state } = makeAnalysisService({
      queueAdd: async () => {
        throw new Error("queue unavailable");
      },
    });

    await assert.rejects(
      service.enqueue(state.ticketId, state.organizationId, "Subject", "Description"),
      /queue unavailable/,
    );
    assert.equal(state.status, AIAnalysisStatus.FAILED);
    assert.match(state.errorMessage ?? "", /queue unavailable/);
  });
});

describe("ticket AI analysis read access", () => {
  const ticket = {
    id: "ticket-1",
    teamId: null,
  } as unknown as TicketWithRelations;
  const membership = {
    id: "membership-1",
    organizationId: "org-1",
    userId: "user-1",
    role: UserRole.ADMIN,
  } as OrganizationMember;

  it("returns the latest analysis for an authorized ticket", async () => {
    const analysis: AIAnalysisDto = {
      id: "analysis-1",
      ticketId: "ticket-1",
      status: AIAnalysisStatus.COMPLETED,
      summary: "A safe summary.",
      category: "Account",
      subcategory: null,
      sentiment: "neutral",
      suggestedPriority: TicketPriority.MEDIUM,
      confidence: 0.9,
      tags: [],
      modelVersion: "mock-model",
      completedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const service = new TicketsService(
      { findById: async () => ticket },
      { getLatestForTicket: async () => analysis },
    );

    assert.deepEqual(await service.getAIAnalysis("org-1", membership, "ticket-1"), analysis);
  });

  it("returns a success envelope from the ticket analysis endpoint controller", async () => {
    const analysis: AIAnalysisDto = {
      id: "analysis-1",
      ticketId: "ticket-1",
      status: AIAnalysisStatus.COMPLETED,
      summary: "A safe summary.",
      category: "Account",
      subcategory: null,
      sentiment: "neutral",
      suggestedPriority: TicketPriority.MEDIUM,
      confidence: 0.9,
      tags: [],
      modelVersion: "mock-model",
      completedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const controller = new TicketsController({
      getAIAnalysis: async () => analysis,
    });
    const req = {
      params: { id: "ticket-1" },
      organization: { id: "org-1" },
      membership,
      context: { requestId: "request-1" },
    } as unknown as Request;
    let responseBody: unknown;
    let responseStatus = 0;
    const res = {
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(body: unknown) {
        responseBody = body;
        return this;
      },
    } as unknown as Response;

    await controller.getAIAnalysis(req, res);

    assert.equal(responseStatus, 200);
    assert.deepEqual(
      (responseBody as { success: boolean; data: AIAnalysisDto }).data,
      analysis,
    );
  });

  it("returns not found when an authorized ticket has no analysis", async () => {
    const service = new TicketsService(
      { findById: async () => ticket },
      { getLatestForTicket: async () => null },
    );

    await assert.rejects(
      service.getAIAnalysis("org-1", membership, "ticket-1"),
      { code: "RESOURCE_NOT_FOUND" },
    );
  });

  it("denies cross-tenant ticket access before querying its analysis", async () => {
    let analysisQueried = false;
    const service = new TicketsService(
      { findById: async (organizationId) => organizationId === "org-1" ? ticket : null },
      {
        getLatestForTicket: async () => {
          analysisQueried = true;
          return null;
        },
      },
    );

    await assert.rejects(
      service.getAIAnalysis("other-org", membership, "ticket-1"),
      { code: "RESOURCE_NOT_FOUND" },
    );
    assert.equal(analysisQueried, false);
  });

  it("denies an agent access to a ticket assigned to another agent", async () => {
    const unassignedToRequester = {
      ...ticket,
      assigneeId: "another-agent",
      teamId: null,
    } as unknown as TicketWithRelations;
    const agentMembership = {
      ...membership,
      role: UserRole.AGENT,
      userId: "requesting-agent",
    } as OrganizationMember;
    const service = new TicketsService(
      { findById: async () => unassignedToRequester },
      { getLatestForTicket: async () => null },
    );

    await assert.rejects(
      service.getAIAnalysis("org-1", agentMembership, "ticket-1"),
      { code: "FORBIDDEN" },
    );
  });

  it("scopes analysis lookup by organization and ticket", async () => {
    const { service, getQueryScope } = makeAnalysisService();
    await service.getLatestForTicket("org-1", "ticket-1");
    assert.deepEqual(getQueryScope(), {
      organizationId: "org-1",
      ticketId: "ticket-1",
    });
  });
});
