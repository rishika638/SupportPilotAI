import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  createTenantFixtures,
  type TenantFixtures,
} from "./helpers/fixtures";
import {
  startTestApp,
  type HttpResponse,
  type TestApplication,
} from "./helpers/test-app";

function responseData<T>(response: HttpResponse): T {
  const envelope = response.body as { success: boolean; data: T };
  assert.equal(envelope.success, true, response.text);
  return envelope.data;
}

function assertDenied(response: HttpResponse, expectedStatus: number): void {
  assert.equal(response.status, expectedStatus, response.text);
  assert.equal((response.body as { success?: boolean }).success, false);
}

describe("concurrency and lifecycle invariants over the real HTTP API", () => {
  let app: TestApplication;
  let fixtures: TenantFixtures;

  before(async () => {
    app = await startTestApp();
    fixtures = await createTenantFixtures(app);
  });

  after(async () => {
    try {
      if (fixtures) await fixtures.cleanup();
    } finally {
      if (app) await app.close();
    }
  });

  it("concurrent ticket numbering produces unique numbers", async () => {
    const createTicket = async (suffix: string) => {
      return await app.request("/tickets", {
        method: "POST",
        token: fixtures.adminA.token,
        body: {
          title: `Concurrent ticket ${suffix}`,
          description: `Description ${suffix}`,
          priority: "MEDIUM",
          channel: "WEB",
          tags: [],
        },
      });
    };

    const results = await Promise.all([
      createTicket("a"),
      createTicket("b"),
      createTicket("c"),
    ]);

    const ticketNumbers = results.map((r) => {
      assert.equal(r.status, 201);
      return responseData<{ ticketNumber: number }>(r).ticketNumber;
    });

    const uniqueNumbers = new Set(ticketNumbers);
    assert.equal(uniqueNumbers.size, 3, "All ticket numbers must be unique");
  });

  it("duplicate idempotent requests replay cached response", async () => {
    const idempotencyKey = "test-duplicate-key-123";
    const payload = {
      title: "Idempotent ticket",
      description: "Test idempotency",
      priority: "MEDIUM" as const,
      channel: "WEB" as const,
      tags: [],
    };

    const firstResponse = await app.request("/tickets", {
      method: "POST",
      token: fixtures.adminA.token,
      headers: { "Idempotency-Key": idempotencyKey },
      body: payload,
    });
    assert.equal(firstResponse.status, 201);
    const firstTicket = responseData<{ id: string }>(firstResponse);

    const duplicateResponse = await app.request("/tickets", {
      method: "POST",
      token: fixtures.adminA.token,
      headers: { "Idempotency-Key": idempotencyKey },
      body: payload,
    });
    assert.equal(duplicateResponse.status, 201);
    assert.equal(duplicateResponse.headers["idempotent-replayed"], "true");
    const duplicateTicket = responseData<{ id: string }>(duplicateResponse);

    assert.equal(firstTicket.id, duplicateTicket.id, "Duplicate should return same ticket ID");

    // Verify only one ticket was created
    const tickets = await app.prisma.ticket.findMany({
      where: {
        subject: "Idempotent ticket",
      },
    });
    assert.equal(tickets.length, 1);
  });

  it("idempotency key mismatch rejects with 422", async () => {
    const idempotencyKey = "test-mismatch-key-456";
    const payload1 = {
      title: "Original ticket",
      description: "Original description",
      priority: "MEDIUM" as const,
      channel: "WEB" as const,
      tags: [],
    };
    const payload2 = {
      title: "Different ticket",
      description: "Different description",
      priority: "HIGH" as const,
      channel: "WEB" as const,
      tags: [],
    };

    const firstResponse = await app.request("/tickets", {
      method: "POST",
      token: fixtures.adminA.token,
      headers: { "Idempotency-Key": idempotencyKey },
      body: payload1,
    });
    assert.equal(firstResponse.status, 201);

    const mismatchResponse = await app.request("/tickets", {
      method: "POST",
      token: fixtures.adminA.token,
      headers: { "Idempotency-Key": idempotencyKey },
      body: payload2,
    });
    assert.equal(mismatchResponse.status, 422);
    assert.equal((mismatchResponse.body as any).error.code, "IDEMPOTENCY_KEY_MISMATCH");
  });

  it("status transitions respect state machine", async () => {
    const ticketId = fixtures.ticketA.id;

    // Start from OPEN
    const status1 = await app.request(`/tickets/${ticketId}/status`, {
      method: "POST",
      token: fixtures.adminA.token,
      body: { status: "ASSIGNED" },
    });
    assert.equal(status1.status, 200);

    // Transition to IN_PROGRESS
    const status2 = await app.request(`/tickets/${ticketId}/status`, {
      method: "POST",
      token: fixtures.adminA.token,
      body: { status: "IN_PROGRESS" },
    });
    assert.equal(status2.status, 200);

    // Final state should be IN_PROGRESS
    const finalTicket = await app.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });
    assert.equal(finalTicket.status, "IN_PROGRESS");
  });

  it("invalid state transition is rejected", async () => {
    const ticketId = fixtures.ticketA.id;

    // Try to transition OPEN directly to CLOSED (invalid)
    const response = await app.request(`/tickets/${ticketId}/status`, {
      method: "POST",
      token: fixtures.adminA.token,
      body: { status: "CLOSED" },
    });
    assert.equal(response.status, 400);
    assert.equal((response.body as any).error.code, "INVALID_STATE_TRANSITION");
  });

  it("assignment updates are atomic", async () => {
    const ticketId = fixtures.ticketA.id;

    const beforeTicket = await app.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });

    const assignResponse = await app.request(`/tickets/${ticketId}/assign`, {
      method: "POST",
      token: fixtures.adminA.token,
      body: { teamId: fixtures.teamA.id },
    });
    assert.equal(assignResponse.status, 200);

    const afterTicket = await app.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });

    assert.equal(afterTicket.teamId, fixtures.teamA.id);

    // Verify assignment history was recorded
    const assignments = await app.prisma.ticketAssignment.findMany({
      where: { ticketId },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(assignments.length > 0);
    assert.equal(assignments[0].teamId, fixtures.teamA.id);
  });

  it("cross-tenant idempotency keys are independent", async () => {
    const idempotencyKey = "cross-tenant-key-789";
    const payload = {
      title: "Cross-tenant test",
      description: "Test",
      priority: "MEDIUM" as const,
      channel: "WEB" as const,
      tags: [],
    };

    // Organization A creates a ticket
    const responseA = await app.request("/tickets", {
      method: "POST",
      token: fixtures.adminA.token,
      headers: { "Idempotency-Key": idempotencyKey },
      body: payload,
    });
    assert.equal(responseA.status, 201);

    // Organization B can use the same key (should be independent)
    const responseB = await app.request("/tickets", {
      method: "POST",
      token: fixtures.adminB.token,
      headers: { "Idempotency-Key": idempotencyKey },
      body: payload,
    });
    assert.equal(responseB.status, 201);

    // Verify two different tickets were created
    const ticketsA = await app.prisma.ticket.findMany({
      where: { organizationId: fixtures.organizationA.id, subject: "Cross-tenant test" },
    });
    const ticketsB = await app.prisma.ticket.findMany({
      where: { organizationId: fixtures.organizationB.id, subject: "Cross-tenant test" },
    });
    assert.equal(ticketsA.length, 1);
    assert.equal(ticketsB.length, 1);
    assert.notEqual(ticketsA[0].id, ticketsB[0].id);
  });

  it("comment creation respects visibility", async () => {
    const ticketId = fixtures.ticketA.id;

    const result1 = await app.request(`/tickets/${ticketId}/comments`, {
      method: "POST",
      token: fixtures.adminA.token,
      body: { body: "Public comment", visibility: "PUBLIC" },
    });
    assert.equal(result1.status, 201);

    const result2 = await app.request(`/tickets/${ticketId}/comments`, {
      method: "POST",
      token: fixtures.adminA.token,
      body: { body: "Internal comment", visibility: "INTERNAL" },
    });
    assert.equal(result2.status, 201);

    const comments = await app.prisma.ticketComment.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(comments.length, 2);
    assert.equal(comments[0].visibility, "PUBLIC");
    assert.equal(comments[1].visibility, "INTERNAL");
  });
});
