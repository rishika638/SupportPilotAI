import { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import { redis } from "../../infrastructure/redis/redis.client";
import { logger } from "../../infrastructure/logger/pino.logger";

const TTL_SECONDS = 86_400; // 24h
const IDEMPOTENCY_HEADER = "idempotency-key";

function hashRequest(method: string, path: string, body: unknown): string {
  return createHash("sha256")
    .update(`${method}:${path}:${JSON.stringify(body ?? {})}`)
    .digest("hex");
}

export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = req.header(IDEMPOTENCY_HEADER);
  if (!key || !["POST", "PUT", "PATCH"].includes(req.method)) {
    return next();
  }

  const organizationId = req.organization?.id;
  if (!organizationId) return next();

  const redisKey = `idempotency:${organizationId}:${key}`;
  const requestHash = hashRequest(req.method, req.path, req.body);

  try {
    const cached = await redis.get(redisKey);
    if (cached) {
      const stored = JSON.parse(cached) as { status: number; body: unknown; hash: string };
      if (stored.hash !== requestHash) {
        res.status(422).json({
          success: false,
          error: { code: "IDEMPOTENCY_KEY_MISMATCH", message: "Idempotency key reused with different request payload", details: [] },
        });
        return;
      }
      res.status(stored.status).json(stored.body);
      return;
    }

    // Mark in-flight
    await redis.set(redisKey, JSON.stringify({ status: 0, body: null, hash: requestHash, processing: true }), "EX", TTL_SECONDS);

    // Intercept response to cache it
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      const statusCode = res.statusCode;
      redis
        .set(redisKey, JSON.stringify({ status: statusCode, body, hash: requestHash }), "EX", TTL_SECONDS)
        .catch((err) => logger.error({ err }, "Failed to persist idempotency key to Redis"));
      return originalJson(body);
    };
  } catch (err) {
    logger.error({ err }, "Idempotency middleware Redis error — proceeding without idempotency");
  }

  next();
}
