import { spawnSync } from "node:child_process";
import { URL } from "node:url";

function getTestDatabaseUrl(): string {
  const databaseUrl = process.env.TENANT_TEST_DATABASE_URL;
  if (!databaseUrl || process.env.NODE_ENV !== "test") {
    throw new Error(
      "Integration tests require NODE_ENV=test and TENANT_TEST_DATABASE_URL to be explicitly set.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("TENANT_TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("TENANT_TEST_DATABASE_URL must use PostgreSQL.");
  }

  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname)) {
    throw new Error(
      "Integration tests only run against a local PostgreSQL database; remote hosts are refused.",
    );
  }

  const databaseName = decodeURIComponent(parsed.pathname.slice(1)).toLowerCase();
  if (
    !/(?:^|[_-])test(?:$|[_-])/.test(databaseName) ||
    /prod|production|render|live/.test(databaseName)
  ) {
    throw new Error(
      "The database name must be explicitly test-only (for example, supportpilot_tenant_test).",
    );
  }

  return databaseUrl;
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): number {
  const result = spawnSync(process.execPath, [command, ...args], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Unable to start ${command}.`);
    return 1;
  }

  return result.status ?? 1;
}

function main(): void {
  let databaseUrl: string;
  try {
    databaseUrl = getTestDatabaseUrl();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unsafe integration-test configuration.");
    process.exitCode = 1;
    return;
  }

  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: "tenant-isolation-test-access-secret-only",
    JWT_REFRESH_SECRET: "tenant-isolation-test-refresh-secret-only",
    REDIS_HOST: process.env.REDIS_HOST || "127.0.0.1",
    REDIS_PORT: process.env.REDIS_PORT || "6380",
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || "",
    REDIS_DB: process.env.REDIS_DB || "14",
    REDIS_TLS: process.env.REDIS_TLS || "false",
  };

  const migrateStatus = run(
    "node_modules/prisma/build/index.js",
    ["migrate", "deploy"],
    env,
  );
  if (migrateStatus !== 0) {
    process.exitCode = migrateStatus;
    return;
  }

  const testFile = process.env.INTEGRATION_TEST_FILE || "tests/integration/*.test.ts";
  process.exitCode = run(
    "node_modules/tsx/dist/cli.mjs",
    ["--test", testFile],
    env,
  );
}

main();
