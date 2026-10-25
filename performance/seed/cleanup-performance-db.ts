import { PrismaClient } from '@prisma/client';

// Fail-closed safety guard: validate environment before any database operations
function validatePerformanceEnvironment(): void {
  const nodeEnv = process.env.NODE_ENV;
  const allowMutations = process.env.ALLOW_PERFORMANCE_DB_MUTATIONS;
  const databaseUrl = process.env.DATABASE_URL;

  if (nodeEnv !== 'performance') {
    console.error('ERROR: NODE_ENV must be set to "performance" to run performance database cleanup.');
    console.error('This script only operates on a dedicated performance database.');
    process.exit(1);
  }

  if (allowMutations !== 'true') {
    console.error('ERROR: ALLOW_PERFORMANCE_DB_MUTATIONS must be set to "true" to run performance database cleanup.');
    console.error('This is an explicit opt-in guard to prevent accidental mutations.');
    process.exit(1);
  }

  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  try {
    const url = new URL(databaseUrl);

    // Validate protocol
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
      console.error('ERROR: DATABASE_URL must use postgresql:// or postgres:// protocol.');
      process.exit(1);
    }

    // Validate hostname is local only
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      console.error('ERROR: DATABASE_URL hostname must be localhost or 127.0.0.1 for performance testing.');
      console.error('Remote databases are not permitted for performance tooling.');
      process.exit(1);
    }

    // Validate database name is exactly supportpilot_performance
    const pathname = url.pathname;
    const dbName = pathname.startsWith('/') ? pathname.slice(1) : pathname;
    if (dbName !== 'supportpilot_performance') {
      console.error(`ERROR: DATABASE_URL database name must be exactly "supportpilot_performance".`);
      console.error(`Current database name: "${dbName}"`);
      console.error('This script only operates on a dedicated performance database.');
      process.exit(1);
    }
  } catch (err) {
    console.error('ERROR: Failed to parse DATABASE_URL:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// Run safety guard before creating Prisma client
validatePerformanceEnvironment();

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up performance test data (supportpilot_performance)...');

  // Find and verify the performance test organization
  const org = await prisma.organization.findUnique({
    where: { slug: 'perf-test-org' },
  });

  if (!org) {
    console.log('No performance test organization found (slug: perf-test-org)');
    return;
  }

  // Verify this is the expected performance organization before deletion
  if (org.name !== 'Performance Test Organization') {
    console.error('ERROR: Organization with slug "perf-test-org" has unexpected name.');
    console.error(`Expected: "Performance Test Organization"`);
    console.error(`Actual: "${org.name}"`);
    console.error('Deletion aborted to prevent accidental data loss.');
    process.exit(1);
  }

  // Find the performance test user and verify membership
  const user = await prisma.user.findUnique({
    where: { email: 'perf-test@example.com' },
  });

  if (!user) {
    console.log('No performance test user found (email: perf-test@example.com)');
    console.log('Proceeding to delete organization only...');
  } else {
    // Verify the user belongs to the performance organization
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: user.id,
        },
      },
    });

    if (!membership) {
      console.error('ERROR: User with email "perf-test@example.com" is not a member of the performance organization.');
      console.error('Deletion aborted to prevent accidental user deletion.');
      process.exit(1);
    }

    // Delete the organization (cascades to all related data)
    await prisma.organization.delete({
      where: { id: org.id },
    });
    console.log(`Deleted organization: ${org.id} (cascades to tickets, teams, memberships, etc.)`);

    // Delete the user only after confirming membership was verified
    await prisma.user.delete({
      where: { id: user.id },
    });
    console.log(`Deleted user: ${user.id}`);
  }

  console.log('Cleanup complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
