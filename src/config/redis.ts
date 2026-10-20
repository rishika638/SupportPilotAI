import { env } from "./env";

export const redisConfig = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  db: env.REDIS_DB,
  tls: env.REDIS_TLS ? {} : undefined,
} as const;
