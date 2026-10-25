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

describe("tenant isolation and authorization over the real HTTP API", () => {
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

  it("requires authentication for protected ticket, team, analytics, and notification routes", async () => {
    const paths = [
      "/tickets",
      "/teams",
      "/analytics/overview",
      "/notifications",
      `/tickets/${fixtures.ticketB.id}`,
      `/tickets/${fixtures.ticketB.id}/comments`,
      `/tickets/${fixtures.ticketB.id}/ai-analysis`,
    ];
    for (const path of paths) {
      const response = await app.request(path);
      assertDenied(response, 401);
    }
  });

  it("denies cross-tenant ticket and AI-analysis reads without revealing B's sentinel", async () => {
    for (const path of [
      `/tickets/${fixtures.ticketB.id}`,
      `/tickets/${fixtures.ticketB.id}/ai-analysis`,
    ]) {
      const response = await app.request(path, { token: fixtures.adminA.token });
      assertDenied(response, 404);
      assert.equal(response.text.includes(fixtures.ticketB.subject), false);
      assert.equal(response.text.includes(fixtures.analysisB.summary), false);
    }
  });

  it("denies cross-tenant ticket mutations, comments, and foreign assignment IDs without changing B's data", async () => {
    const beforeTicket = await app.prisma.ticket.findUniqueOrThrow({
      where: { id: fixtures.ticketB.id },
    });
    const beforeOwnTicket = await app.prisma.ticket.findUniqueOrThrow({
      where: { id: fixtures.ticketA.id },
    });
    const beforeComments = await app.prisma.ticketComment.count({
      where: { ticketId: fixtures.ticketB.id },
    });
    const beforeAssignments = await app.prisma.ticketAssignment.count({
      where: { ticketId: fixtures.ticketB.id },
    });

    const attempts: Array<[string, string, unknown, number]> = [
      ["PATCH", `/tickets/${fixtures.ticketB.id}`, { title: "A attempted update" }, 404],
      ["DELETE", `/tickets/${fixtures.ticketB.id}`, undefined, 404],
      ["POST", `/tickets/${fixtures.ticketB.id}/status`, { status: "RESOLVED" }, 404],
      ["POST", `/tickets/${fixtures.ticketB.id}/comments`, { body: "A attempted comment" }, 404],
      ["GET", `/tickets/${fixtures.ticketB.id}/comments`, undefined, 404],
      ["POST", `/tickets/${fixtures.ticketB.id}/assign`, { teamId: fixtures.teamA.id }, 404],
      ["POST", `/tickets/${fixtures.ticketA.id}/assign`, { teamId: fixtures.teamB.id }, 404],
      ["POST", `/tickets/${fixtures.ticketA.id}/assign`, { assigneeId: fixtures.adminB.id }, 404],
      ["PATCH", `/tickets/${fixtures.ticketA.id}`, { teamId: fixtures.teamB.id }, 404],
    ];
    for (const [method, path, body, expectedStatus] of attempts) {
      const response = await app.request(path, {
        method,
        token: fixtures.adminA.token,
        ...(body === undefined ? {} : { body }),
      });
      assertDenied(response, expectedStatus);
      assert.equal(response.text.includes(fixtures.ticketB.subject), false);
      assert.equal(response.text.includes(fixtures.commentB.body), false);
    }

    const afterTicket = await app.prisma.ticket.findUniqueOrThrow({
      where: { id: fixtures.ticketB.id },
    });
    assert.equal(afterTicket.subject, beforeTicket.subject);
    assert.equal(afterTicket.description, beforeTicket.description);
    assert.equal(afterTicket.status, beforeTicket.status);
    assert.equal(afterTicket.teamId, beforeTicket.teamId);
    assert.equal(afterTicket.assigneeId, beforeTicket.assigneeId);
    assert.equal(afterTicket.deletedAt, null);
    const afterOwnTicket = await app.prisma.ticket.findUniqueOrThrow({
      where: { id: fixtures.ticketA.id },
    });
    assert.equal(afterOwnTicket.teamId, beforeOwnTicket.teamId);
    assert.equal(afterOwnTicket.assigneeId, beforeOwnTicket.assigneeId);
    assert.equal(afterOwnTicket.deletedAt, beforeOwnTicket.deletedAt);
    assert.equal(
      await app.prisma.ticketComment.count({ where: { ticketId: fixtures.ticketB.id } }),
      beforeComments,
    );
    assert.equal(
      await app.prisma.ticketAssignment.count({ where: { ticketId: fixtures.ticketB.id } }),
      beforeAssignments,
    );
  });

  it("scopes team and member reads and mutations to the authenticated organization", async () => {
    const beforeTeam = await app.prisma.team.findUniqueOrThrow({
      where: { id: fixtures.teamB.id },
    });
    const beforeMemberCount = await app.prisma.teamMember.count({
      where: { teamId: fixtures.teamB.id },
    });
    const attempts: Array<[string, string, unknown, number]> = [
      ["GET", `/teams/${fixtures.teamB.id}`, undefined, 404],
      ["GET", `/teams/${fixtures.teamB.id}/members`, undefined, 404],
      ["PATCH", `/teams/${fixtures.teamB.id}`, { name: "A attempted rename" }, 404],
      ["DELETE", `/teams/${fixtures.teamB.id}`, undefined, 404],
      ["POST", `/teams/${fixtures.teamB.id}/members`, { userId: fixtures.adminA.id }, 404],
      [
        "DELETE",
        `/teams/${fixtures.teamB.id}/members/${fixtures.teamBMemberId}`,
        undefined,
        404,
      ],
      [
        "POST",
        `/teams/${fixtures.teamA.id}/members`,
        { userId: fixtures.adminB.id },
        404,
      ],
    ];

    for (const [method, path, body, expectedStatus] of attempts) {
      const response = await app.request(path, {
        method,
        token: fixtures.adminA.token,
        ...(body === undefined ? {} : { body }),
      });
      assertDenied(response, expectedStatus);
      assert.equal(response.text.includes(fixtures.teamB.name), false);
    }

    const teamsResponse = await app.request("/teams", { token: fixtures.adminA.token });
    const teams = responseData<{ teams: Array<{ id: string; name: string }> }>(teamsResponse);
    assert.equal(teamsResponse.status, 200);
    assert.deepEqual(
      new Set(teams.teams.map((team) => team.id)),
      new Set([fixtures.teamA.id, fixtures.teamAOther.id]),
    );
    assert.equal(teamsResponse.text.includes(fixtures.teamB.name), false);

    const afterTeam = await app.prisma.team.findUniqueOrThrow({
      where: { id: fixtures.teamB.id },
    });
    assert.equal(afterTeam.name, beforeTeam.name);
    assert.equal(afterTeam.deletedAt, null);
    assert.equal(
      await app.prisma.teamMember.count({ where: { teamId: fixtures.teamB.id } }),
      beforeMemberCount,
    );
    assert.equal(
      await app.prisma.teamMember.count({
        where: { teamId: fixtures.teamA.id, userId: fixtures.adminB.id },
      }),
      0,
    );
  });

  it("scopes ticket search, filters, pagination totals, and page contents", async () => {
    const firstPageResponse = await app.request("/tickets?page=1&limit=2", {
      token: fixtures.adminA.token,
    });
    const firstPage = responseData<{
      tickets: Array<{ id: string; title: string }>;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(firstPageResponse);
    assert.equal(firstPageResponse.status, 200);
    assert.equal(firstPage.pagination.total, 4);
    assert.equal(firstPage.pagination.totalPages, 2);
    assert.equal(firstPage.pagination.page, 1);
    assert.equal(firstPage.pagination.limit, 2);
    assert.equal(firstPage.tickets.length, 2);
    assert.equal(firstPageResponse.text.includes(fixtures.ticketB.subject), false);

    const secondPageResponse = await app.request("/tickets?page=2&limit=2", {
      token: fixtures.adminA.token,
    });
    const secondPage = responseData<{
      tickets: Array<{ id: string; title: string }>;
      pagination: { page: number; total: number; totalPages: number };
    }>(secondPageResponse);
    assert.equal(secondPage.pagination.total, 4);
    assert.equal(secondPage.pagination.totalPages, 2);
    assert.equal(secondPage.pagination.page, 2);
    assert.equal(secondPage.tickets.length, 2);
    assert.equal(secondPageResponse.text.includes(fixtures.ticketB.subject), false);
    assert.deepEqual(
      new Set([
        ...firstPage.tickets.map((ticket) => ticket.id),
        ...secondPage.tickets.map((ticket) => ticket.id),
      ]),
      new Set([
        fixtures.ticketA.id,
        fixtures.ticketAOther.id,
        fixtures.ticketAResolved.id,
        fixtures.ticketAOtherTeam.id,
      ]),
    );

    const searchResponse = await app.request(
      `/tickets?search=${encodeURIComponent(fixtures.ticketB.subject)}`,
      { token: fixtures.adminA.token },
    );
    const searchResult = responseData<{
      tickets: unknown[];
      pagination: { total: number; totalPages: number };
    }>(searchResponse);
    assert.equal(searchResult.tickets.length, 0);
    assert.equal(searchResult.pagination.total, 0);
    assert.equal(searchResult.pagination.totalPages, 0);
    assert.equal(searchResponse.text.includes(fixtures.ticketB.subject), false);

    const resolvedResponse = await app.request("/tickets?status=RESOLVED", {
      token: fixtures.adminA.token,
    });
    const resolved = responseData<{
      tickets: Array<{ id: string }>;
      pagination: { total: number };
    }>(resolvedResponse);
    assert.equal(resolved.pagination.total, 1);
    assert.deepEqual(resolved.tickets.map((ticket) => ticket.id), [fixtures.ticketAResolved.id]);
  });

  it("returns analytics calculated only from Organization A tickets", async () => {
    const response = await app.request("/analytics/overview", {
      token: fixtures.adminA.token,
    });
    const analytics = responseData<{
      totalTickets: number;
      openTickets: number;
      resolvedTickets: number;
      escalatedTickets: number;
      avgResolutionTimeMs: number | null;
      slaComplianceRate: number | null;
    }>(response);
    assert.equal(response.status, 200);
    assert.deepEqual(analytics, {
      totalTickets: 4,
      openTickets: 3,
      resolvedTickets: 1,
      escalatedTickets: 0,
      avgResolutionTimeMs: 10 * 60 * 1000,
      slaComplianceRate: 100,
    });
    assert.equal(response.text.includes(fixtures.ticketB.subject), false);
  });

  it("keeps notifications isolated by authenticated user and organization", async () => {
    const listResponse = await app.request("/notifications?unread=true&limit=20&offset=0", {
      token: fixtures.adminA.token,
    });
    const result = responseData<{
      notifications: Array<{ id: string; title: string }>;
      total: number;
    }>(listResponse);
    assert.equal(listResponse.status, 200);
    assert.equal(result.total, 0);
    assert.deepEqual(result.notifications, []);
    assert.equal(listResponse.text.includes(fixtures.notificationB.title), false);

    const markReadResponse = await app.request(
      `/notifications/${fixtures.notificationB.id}/read`,
      { method: "PATCH", token: fixtures.adminA.token },
    );
    assert.equal(markReadResponse.status, 200);
    assert.equal(markReadResponse.text.includes(fixtures.notificationB.title), false);

    const markAllResponse = await app.request("/notifications/read-all", {
      method: "PATCH",
      token: fixtures.adminA.token,
    });
    assert.equal(markAllResponse.status, 200);
    const notification = await app.prisma.notification.findUniqueOrThrow({
      where: { id: fixtures.notificationB.id },
    });
    assert.equal(notification.readAt, null);
    assert.equal(notification.status, "SENT");
  });

  it("applies manager team scope and rejects agent-only role escalation", async () => {
    const managerListResponse = await app.request("/tickets", {
      token: fixtures.managerA.token,
    });
    const managerList = responseData<{ tickets: Array<{ id: string }> }>(managerListResponse);
    assert.equal(managerList.tickets.length, 3);
    assert.equal(
      managerList.tickets.some((ticket) => ticket.id === fixtures.ticketAOtherTeam.id),
      false,
    );
    assert.equal(
      (await app.request(`/tickets/${fixtures.ticketAOtherTeam.id}`, {
        token: fixtures.managerA.token,
      })).status,
      403,
    );
    assert.equal(
      (await app.request("/analytics/overview", { token: fixtures.managerA.token })).status,
      200,
    );

    const agentListResponse = await app.request("/tickets", {
      token: fixtures.agentA.token,
    });
    const agentList = responseData<{ tickets: Array<{ id: string }> }>(agentListResponse);
    assert.deepEqual(
      new Set(agentList.tickets.map((ticket) => ticket.id)),
      new Set([fixtures.ticketA.id, fixtures.ticketAResolved.id]),
    );
    assert.equal(
      (await app.request(`/tickets/${fixtures.ticketAOther.id}`, {
        token: fixtures.agentA.token,
      })).status,
      403,
    );

    const protectedAttempts: Array<[string, string, unknown]> = [
      ["GET", "/analytics/overview", undefined],
      ["GET", "/examples/admin", undefined],
      ["GET", "/examples/reports", undefined],
      ["POST", "/teams", { name: "Agent-created team" }],
      ["DELETE", `/tickets/${fixtures.ticketA.id}`, undefined],
      ["POST", `/tickets/${fixtures.ticketA.id}/assign`, { teamId: fixtures.teamA.id }],
      ["POST", `/teams/${fixtures.teamA.id}/members`, { userId: fixtures.adminA.id }],
    ];
    for (const [method, path, body] of protectedAttempts) {
      const response = await app.request(path, {
        method,
        token: fixtures.agentA.token,
        ...(body === undefined ? {} : { body }),
      });
      assertDenied(response, 403);
    }

    assert.equal(
      (await app.request("/examples/profile", { token: fixtures.agentA.token })).status,
      200,
    );
    assert.equal(
      (await app.request("/examples/reports", { token: fixtures.managerA.token })).status,
      200,
    );
    assert.equal(
      (await app.request("/examples/admin", { token: fixtures.managerA.token })).status,
      403,
    );

    const ticket = await app.prisma.ticket.findUniqueOrThrow({
      where: { id: fixtures.ticketA.id },
    });
    assert.equal(ticket.deletedAt, null);
    assert.equal(ticket.assigneeId, fixtures.ticketA.assigneeId);
    assert.equal(ticket.teamId, fixtures.ticketA.teamId);
    assert.equal(
      await app.prisma.team.count({
        where: { organizationId: fixtures.organizationA.id, name: "Agent-created team" },
      }),
      0,
    );
    assert.equal(
      await app.prisma.teamMember.count({
        where: { teamId: fixtures.teamA.id, userId: fixtures.adminA.id },
      }),
      0,
    );
  });
});
