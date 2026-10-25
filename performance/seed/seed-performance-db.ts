import { PrismaClient, Prisma } from "@prisma/client";
import * as bcrypt from "bcrypt";

const PERFORMANCE_DB = "supportpilot_performance";
const PERFORMANCE_ORG_SLUG = "perf-test-org";
const PERFORMANCE_ORG_NAME = "Performance Test Organization";
const PERFORMANCE_USER_EMAIL = "perf-test@example.com";
const PERFORMANCE_TEAM_NAME = "Performance Test Team";
const BATCH_SIZE = 500;

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function validatePerformanceEnvironment(): void {
  if (process.env.NODE_ENV !== "performance") {
    fail('NODE_ENV must be exactly "performance".');
  }
  if (process.env.ALLOW_PERFORMANCE_DB_MUTATIONS !== "true") {
    fail('Set ALLOW_PERFORMANCE_DB_MUTATIONS=true to explicitly authorize performance DB writes.');
  }

  const raw = process.env.DATABASE_URL;
  if (!raw) fail("DATABASE_URL is not set.");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail("DATABASE_URL is not a valid URL.");
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    fail("DATABASE_URL must use PostgreSQL.");
  }
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname.toLowerCase())) {
    fail("Performance seeding is restricted to a local PostgreSQL host.");
  }

  const dbName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (dbName !== PERFORMANCE_DB) {
    fail(`Refusing to seed database "${dbName}". Expected "${PERFORMANCE_DB}".`);
  }

  const requestedTarget = Number.parseInt(process.env.TICKET_COUNT ?? "10000", 10);
  if (!Number.isInteger(requestedTarget) || requestedTarget < 1 || requestedTarget > 100000) {
    fail("TICKET_COUNT must be an integer between 1 and 100000 (target total ticket count).");
  }
}

validatePerformanceEnvironment();
const targetTicketCount = Number.parseInt(process.env.TICKET_COUNT ?? "10000", 10);
const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Re-check the connected database using PostgreSQL itself before writes.
  const databaseRows = await prisma.$queryRaw<Array<{ current_database: string }>>(
    Prisma.sql`SELECT current_database()`
  );
  if (databaseRows[0]?.current_database !== PERFORMANCE_DB) {
    fail(`Connected database is not ${PERFORMANCE_DB}; no seed writes were made.`);
  }

  const passwordHash = await bcrypt.hash("perf-test-password", 12);

  // Reuse the dedicated performance fixtures if present. Do not duplicate the
  // organization/user/team on reruns, and never delete existing records.
  const organization = await prisma.organization.upsert({
    where: { slug: PERFORMANCE_ORG_SLUG },
    create: {
      name: PERFORMANCE_ORG_NAME,
      slug: PERFORMANCE_ORG_SLUG,
      status: "ACTIVE",
      plan: "PRO",
    },
    update: {},
  });

  if (organization.name !== PERFORMANCE_ORG_NAME) {
    fail("The performance organization slug exists with an unexpected name; refusing to write.");
  }

  const user = await prisma.user.upsert({
    where: { email: PERFORMANCE_USER_EMAIL },
    create: {
      email: PERFORMANCE_USER_EMAIL,
      passwordHash,
      firstName: "Performance",
      lastName: "Test",
    },
    update: {},
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: "ADMIN",
      status: "ACTIVE",
      joinedAt: new Date(),
    },
    update: {},
  });

  const team = await prisma.team.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: PERFORMANCE_TEAM_NAME,
      },
    },
    create: {
      organizationId: organization.id,
      name: PERFORMANCE_TEAM_NAME,
      isDefault: true,
    },
    update: {},
  });

  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId: user.id } },
    create: { teamId: team.id, userId: user.id, isLead: true },
    update: {},
  });

  const existingCount = await prisma.ticket.count({
    where: { organizationId: organization.id },
  });
  if (existingCount >= targetTicketCount) {
    console.log(
      `No seeding needed: performance organization already has ${existingCount} tickets (target ${targetTicketCount}).`
    );
    return;
  }

  const maxNumber = await prisma.ticket.aggregate({
    where: { organizationId: organization.id },
    _max: { ticketNumber: true },
  });
  let nextTicketNumber = (maxNumber._max.ticketNumber ?? 999) + 1;
  const remaining = targetTicketCount - existingCount;
  console.log(
    `Seeding ${remaining} tickets in ${PERFORMANCE_DB} to reach ${targetTicketCount} total (currently ${existingCount}); batch size ${BATCH_SIZE}.`
  );

  const statuses = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER", "ESCALATED", "RESOLVED", "CLOSED"] as const;
  const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
  const channels = ["EMAIL", "CHAT", "PHONE", "WEB", "API"] as const;

  for (let offset = 0; offset < remaining; offset += BATCH_SIZE) {
    const batchLength = Math.min(BATCH_SIZE, remaining - offset);
    const tickets: Prisma.TicketCreateManyInput[] = [];

    for (let j = 0; j < batchLength; j++) {
      const index = offset + j;
      const ticketNumber = nextTicketNumber++;
      tickets.push({
        organizationId: organization.id,
        ticketNumber,
        subject: `Performance Test Ticket ${ticketNumber}`,
        description: `Synthetic performance dataset ticket ${ticketNumber}. No customer data.`,
        status: statuses[index % statuses.length],
        priority: priorities[index % priorities.length],
        channel: channels[index % channels.length],
        customerEmail: `customer${ticketNumber}@example.invalid`,
        customerName: `Synthetic Customer ${ticketNumber}`,
        teamId: team.id,
        assigneeId: user.id,
        createdById: user.id,
        metadata: {
          tags: ["performance-test", `batch-${Math.floor(index / 100)}`],
          synthetic: true,
        },
        createdAt: new Date(Date.now() - index * 60_000),
      });
    }

    await prisma.ticket.createMany({ data: tickets });
    console.log(`Inserted ${Math.min(offset + batchLength, remaining)}/${remaining} additional tickets.`);
  }

  const finalCount = await prisma.ticket.count({
    where: { organizationId: organization.id },
  });
  console.log(`Seed complete. Performance organization ticket count: ${finalCount}.`);
}

main()
  .catch((error: unknown) => {
    console.error("Performance seeding failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
