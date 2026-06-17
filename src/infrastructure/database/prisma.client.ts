import { PrismaClient } from "@prisma/client";
import { isDevelopment } from "../../config/env";
import { logger } from "../logger/pino.logger";

declare global {
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: isDevelopment
      ? [
          { emit: "event", level: "query" },
          { emit: "event", level: "error" },
          { emit: "event", level: "warn" },
        ]
      : [{ emit: "event", level: "error" }],
  });

  client.$on("error", (event) => {
    logger.error({ target: event.target, message: event.message }, "Prisma error");
  });

  client.$on("warn", (event) => {
    logger.warn({ target: event.target, message: event.message }, "Prisma warning");
  });

  if (isDevelopment) {
    client.$on("query", (event) => {
      logger.debug(
        {
          query: event.query,
          params: event.params,
          durationMs: event.duration,
        },
        "Prisma query",
      );
    });
  }

  return client;
}

export const prisma: PrismaClient =
  globalThis.__prisma ?? createPrismaClient();

if (isDevelopment) {
  globalThis.__prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info("Database connected");
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info("Database disconnected");
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ err: error }, "Database health check failed");
    return false;
  }
}
