import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import type { TestApplication } from "./test-app";

interface AuthEnvelope {
  success: boolean;
  data: {
    user: { id: string; email: string };
    organization: { id: string; name: string };
    tokens: { accessToken: string };
  };
}

export interface TestActor {
  id: string;
  email: string;
  password: string;
  token: string;
  organizationId: string;
}

export interface TenantFixtures {
  organizationA: { id: string; name: string };
  organizationB: { id: string; name: string };
  adminA: TestActor;
  adminB: TestActor;
  managerA: TestActor;
  agentA: TestActor;
  teamA: { id: string; organizationId: string; name: string };
  teamAOther: { id: string; organizationId: string; name: string };
  teamB: { id: string; organizationId: string; name: string };
  teamBMemberId: string;
  ticketA: { id: string; subject: string; teamId: string; assigneeId: string };
  ticketAOther: { id: string; subject: string; teamId: string; assigneeId: string };
  ticketAResolved: { id: string; subject: string; teamId: string; assigneeId: string };
  ticketAOtherTeam: { id: string; subject: string; teamId: string; assigneeId: string };
  ticketB: { id: string; subject: string };
  ticketBResolved: { id: string; subject: string };
  commentB: { id: string; body: string };
  analysisB: { id: string; summary: string };
  notificationB: { id: string; title: string };
  cleanup(): Promise<void>;
}

function getAuthData(response: { status: number; body: unknown }): AuthEnvelope["data"] {
  assert.equal(response.status, 201);
  const envelope = response.body as AuthEnvelope;
  assert.equal(envelope.success, true);
  return envelope.data;
}

function getLoginData(response: { status: number; body: unknown }): AuthEnvelope["data"] {
  assert.equal(response.status, 200);
  const envelope = response.body as AuthEnvelope;
  assert.equal(envelope.success, true);
  return envelope.data;
}

async function registerActor(
  app: TestApplication,
  email: string,
  password: string,
  firstName: string,
  organizationName: string,
): Promise<TestActor & { organizationName: string }> {
  const response = await app.request("/auth/register", {
    method: "POST",
    body: {
      email,
      password,
      firstName,
      lastName: "Fixture",
      organizationName,
    },
  });
  const data = getAuthData(response);
  return {
    id: data.user.id,
    email: data.user.email,
    password,
    token: data.tokens.accessToken,
    organizationId: data.organization.id,
    organizationName,
  };
}

async function loginActor(
  app: TestApplication,
  actor: TestActor,
): Promise<TestActor> {
  const response = await app.request("/auth/login", {
    method: "POST",
    body: { email: actor.email, password: actor.password },
  });
  const data = getLoginData(response);
  assert.equal(data.user.id, actor.id);
  return { ...actor, token: data.tokens.accessToken };
}

function cleanupOrganizations(
  prisma: PrismaClient,
  organizationIds: string[],
  additionalUserIds: string[],
): Promise<void> {
  return (async () => {
    if (organizationIds.length) {
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }
    if (additionalUserIds.length) {
      await prisma.user.deleteMany({
        where: { id: { in: additionalUserIds } },
      });
    }
  })();
}

export async function createTenantFixtures(
  app: TestApplication,
): Promise<TenantFixtures> {
  const prisma = app.prisma;
  const suffix = randomUUID();
  const organizationIds: string[] = [];
  const additionalUserIds: string[] = [];
  let cleanupComplete = false;
  const cleanup = async () => {
    if (cleanupComplete) return;
    await cleanupOrganizations(prisma, organizationIds, additionalUserIds);
    cleanupComplete = true;
  };

  try {
    const adminA = await registerActor(
      app,
      `admin-a-${suffix}@example.test`,
      `Test-A-${suffix}-Password`,
      "AdminA",
      `Tenant A ${suffix}`,
    );
    organizationIds.push(adminA.organizationId);
    additionalUserIds.push(adminA.id);
    const adminB = await registerActor(
      app,
      `admin-b-${suffix}@example.test`,
      `Test-B-${suffix}-Password`,
      "AdminB",
      `Tenant B ${suffix}`,
    );
    organizationIds.push(adminB.organizationId);
    additionalUserIds.push(adminB.id);

    const organizationA = {
      id: adminA.organizationId,
      name: adminA.organizationName,
    };
    const organizationB = {
      id: adminB.organizationId,
      name: adminB.organizationName,
    };

    const { hashPassword } = await import("../../../src/infrastructure/auth/password.service");
    const managerEmail = `manager-a-${suffix}@example.test`;
    const agentEmail = `agent-a-${suffix}@example.test`;
    const managerPassword = `Manager-${suffix}-Password`;
    const agentPassword = `Agent-${suffix}-Password`;
    const [managerPasswordHash, agentPasswordHash] = await Promise.all([
      hashPassword(managerPassword),
      hashPassword(agentPassword),
    ]);
    const managerUser = await prisma.user.create({
      data: {
        email: managerEmail,
        passwordHash: managerPasswordHash,
        firstName: "ManagerA",
        lastName: "Fixture",
        memberships: {
          create: {
            organizationId: organizationA.id,
            role: "MANAGER",
            status: "ACTIVE",
            joinedAt: new Date(),
          },
        },
      },
    });
    additionalUserIds.push(managerUser.id);
    const agentUser = await prisma.user.create({
      data: {
        email: agentEmail,
        passwordHash: agentPasswordHash,
        firstName: "AgentA",
        lastName: "Fixture",
        memberships: {
          create: {
            organizationId: organizationA.id,
            role: "AGENT",
            status: "ACTIVE",
            joinedAt: new Date(),
          },
        },
      },
    });
    additionalUserIds.push(agentUser.id);

    const adminALoggedIn = await loginActor(app, adminA);
    const adminBLoggedIn = await loginActor(app, adminB);
    const managerA = await loginActor(app, {
      id: managerUser.id,
      email: managerEmail,
      password: managerPassword,
      token: "",
      organizationId: organizationA.id,
    });
    const agentA = await loginActor(app, {
      id: agentUser.id,
      email: agentEmail,
      password: agentPassword,
      token: "",
      organizationId: organizationA.id,
    });

    const [teamA, teamAOther, teamB] = await Promise.all([
      prisma.team.create({
        data: { organizationId: organizationA.id, name: `A team ${suffix}` },
      }),
      prisma.team.create({
        data: { organizationId: organizationA.id, name: `A private team ${suffix}` },
      }),
      prisma.team.create({
        data: { organizationId: organizationB.id, name: `B team ${suffix}` },
      }),
    ]);
    await prisma.teamMember.createMany({
      data: [
        { teamId: teamA.id, userId: managerUser.id },
        { teamId: teamA.id, userId: agentUser.id },
        { teamId: teamB.id, userId: adminB.id },
      ],
    });
    const teamBMember = await prisma.teamMember.findUniqueOrThrow({
      where: { teamId_userId: { teamId: teamB.id, userId: adminB.id } },
    });

    const now = Date.now();
    const aTicket = {
      id: randomUUID(),
      subject: `A ticket ${suffix}`,
      teamId: teamA.id,
      assigneeId: agentUser.id,
    };
    const aTicketOther = {
      id: randomUUID(),
      subject: `A second ticket ${suffix}`,
      teamId: teamA.id,
      assigneeId: managerUser.id,
    };
    const aTicketResolved = {
      id: randomUUID(),
      subject: `A resolved ticket ${suffix}`,
      teamId: teamA.id,
      assigneeId: agentUser.id,
    };
    const aTicketOtherTeam = {
      id: randomUUID(),
      subject: `A other-team ticket ${suffix}`,
      teamId: teamAOther.id,
      assigneeId: managerUser.id,
    };
    const ticketB = { id: randomUUID(), subject: `B_PRIVATE_SENTINEL_${suffix}` };
    const ticketBResolved = {
      id: randomUUID(),
      subject: `B_RESOLVED_SENTINEL_${suffix}`,
    };
    const resolvedCreatedAt = new Date(now - 60 * 60 * 1000);
    const resolvedAt = new Date(resolvedCreatedAt.getTime() + 10 * 60 * 1000);

    await prisma.ticket.createMany({
      data: [
        {
          id: aTicket.id,
          organizationId: organizationA.id,
          ticketNumber: 1101,
          subject: aTicket.subject,
          description: `Organization A ticket description ${suffix}`,
          status: "OPEN",
          priority: "MEDIUM",
          channel: "WEB",
          teamId: aTicket.teamId,
          assigneeId: aTicket.assigneeId,
          createdById: adminA.id,
          metadata: { tags: ["tenant-a"] },
        },
        {
          id: aTicketOther.id,
          organizationId: organizationA.id,
          ticketNumber: 1102,
          subject: aTicketOther.subject,
          description: `Organization A second ticket ${suffix}`,
          status: "OPEN",
          priority: "LOW",
          channel: "EMAIL",
          teamId: aTicketOther.teamId,
          assigneeId: aTicketOther.assigneeId,
          createdById: adminA.id,
          metadata: { tags: ["tenant-a"] },
        },
        {
          id: aTicketResolved.id,
          organizationId: organizationA.id,
          ticketNumber: 1103,
          subject: aTicketResolved.subject,
          description: `Organization A resolved ticket ${suffix}`,
          status: "RESOLVED",
          priority: "MEDIUM",
          channel: "WEB",
          teamId: aTicketResolved.teamId,
          assigneeId: aTicketResolved.assigneeId,
          createdById: adminA.id,
          createdAt: resolvedCreatedAt,
          resolvedAt,
          metadata: { tags: ["tenant-a"] },
        },
        {
          id: aTicketOtherTeam.id,
          organizationId: organizationA.id,
          ticketNumber: 1104,
          subject: aTicketOtherTeam.subject,
          description: `Organization A other-team ticket ${suffix}`,
          status: "OPEN",
          priority: "HIGH",
          channel: "CHAT",
          teamId: aTicketOtherTeam.teamId,
          assigneeId: aTicketOtherTeam.assigneeId,
          createdById: adminA.id,
          metadata: { tags: ["tenant-a"] },
        },
        {
          id: ticketB.id,
          organizationId: organizationB.id,
          ticketNumber: 2101,
          subject: ticketB.subject,
          description: `B_PRIVATE_DESCRIPTION_${suffix}`,
          status: "OPEN",
          priority: "URGENT",
          channel: "API",
          teamId: teamB.id,
          assigneeId: adminB.id,
          createdById: adminB.id,
          metadata: { tags: ["b-private"] },
        },
        {
          id: ticketBResolved.id,
          organizationId: organizationB.id,
          ticketNumber: 2102,
          subject: ticketBResolved.subject,
          description: `B resolved description ${suffix}`,
          status: "RESOLVED",
          priority: "URGENT",
          channel: "API",
          teamId: teamB.id,
          assigneeId: adminB.id,
          createdById: adminB.id,
          createdAt: resolvedCreatedAt,
          resolvedAt: new Date(resolvedCreatedAt.getTime() + 3 * 60 * 60 * 1000),
          metadata: { tags: ["b-private"] },
        },
      ],
    });

    const commentB = await prisma.ticketComment.create({
      data: {
        organizationId: organizationB.id,
        ticketId: ticketB.id,
        authorId: adminB.id,
        body: `B_COMMENT_SENTINEL_${suffix}`,
        visibility: "PUBLIC",
      },
    });
    const analysisB = await prisma.aIAnalysis.create({
      data: {
        organizationId: organizationB.id,
        ticketId: ticketB.id,
        status: "COMPLETED",
        summary: `B_ANALYSIS_SENTINEL_${suffix}`,
      },
    });
    const notificationB = await prisma.notification.create({
      data: {
        organizationId: organizationB.id,
        userId: adminB.id,
        ticketId: ticketB.id,
        type: "SYSTEM",
        channel: "IN_APP",
        status: "SENT",
        title: `B_NOTIFICATION_SENTINEL_${suffix}`,
        body: `B notification body ${suffix}`,
        sentAt: new Date(),
      },
    });

    return {
      organizationA,
      organizationB,
      adminA: adminALoggedIn,
      adminB: adminBLoggedIn,
      managerA,
      agentA,
      teamA: { id: teamA.id, organizationId: teamA.organizationId, name: teamA.name },
      teamAOther: {
        id: teamAOther.id,
        organizationId: teamAOther.organizationId,
        name: teamAOther.name,
      },
      teamB: { id: teamB.id, organizationId: teamB.organizationId, name: teamB.name },
      teamBMemberId: teamBMember.id,
      ticketA: aTicket,
      ticketAOther: aTicketOther,
      ticketAResolved: aTicketResolved,
      ticketAOtherTeam: aTicketOtherTeam,
      ticketB,
      ticketBResolved,
      commentB: { id: commentB.id, body: commentB.body },
      analysisB: { id: analysisB.id, summary: analysisB.summary! },
      notificationB: { id: notificationB.id, title: notificationB.title },
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
