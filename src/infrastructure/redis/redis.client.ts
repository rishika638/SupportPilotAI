import Redis from "ioredis";
import { redisConfig } from "../../config/redis";
import { logger } from "../logger/pino.logger";

declare global {
  var __redis: Redis | undefined;
}

function createRedisClient(): Redis {
  const client = new Redis({
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password || undefined,
    db: redisConfig.db,
    tls: redisConfig.tls,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  client.on("connect", () => {
    logger.info(
      { host: redisConfig.host, port: redisConfig.port, db: redisConfig.db },
      "Redis connected",
    );
  });

  client.on("error", (error) => {
    logger.error({ err: error }, "Redis connection error");
  });

  client.on("close", () => {
    logger.warn("Redis connection closed");
  });

  return client;
}

export const redis: Redis = globalThis.__redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__redis = redis;
}

export async function connectRedis(): Promise<void> {
  if (redis.status === "ready" || redis.status === "connecting") {
    return;
  }

  await redis.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redis.status === "end") {
    return;
  }

  await redis.quit();
  logger.info("Redis disconnected");
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const response = await redis.ping();
    return response === "PONG";
  } catch (error) {
    logger.error({ err: error }, "Redis health check failed");
    return false;
  }
}
