import { NextFunction, Request, Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { redis } from "../../infrastructure/redis/redis.client";
import { logger } from "../../infrastructure/logger/pino.logger";
import { ErrorCodes } from "../errors/error-codes";

const TTL_SECONDS = 86_400; // 24h
const IN_FLIGHT_LOCK_TTL_SECONDS = 60; // 60s lock for abandoned claim recovery
const LOCK_RENEW_INTERVAL_MS = 20_000;
const IDEMPOTENCY_HEADER = "idempotency-key";
const MAX_WAIT_MS = 2500;
const POLL_INTERVAL_MS = 200;
const RENEW_CLAIM_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("EXPIRE", KEYS[1], ARGV[2])
end
return 0
`;
const RELEASE_CLAIM_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;
const COMPLETE_CLAIM_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
  return 1
end
return 0
`;

function hashRequest(method: string, path: string, body: unknown): string {
  return createHash("sha256")
    .update(`${method}:${path}:${JSON.stringify(body ?? {})}`)
    .digest("hex");
}

interface StoredIdempotencyRecord {
  status: number;
  body: unknown;
  hash: string;
  claimId?: string;
  processing?: boolean;
  completed?: boolean;
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
  let renewalTimer: NodeJS.Timeout | undefined;
  const stopRenewal = () => {
    if (renewalTimer) {
      clearInterval(renewalTimer);
      renewalTimer = undefined;
    }
  };

  try {
    // 1. Try atomic claim with short lock TTL for recovery from abandoned claims
    const claimPayload: StoredIdempotencyRecord = {
      status: 0,
      body: null,
      hash: requestHash,
      processing: true,
      claimId: randomUUID(),
    };
    const claimValue = JSON.stringify(claimPayload);

    let acquired = await redis.set(
      redisKey,
      claimValue,
      "EX",
      IN_FLIGHT_LOCK_TTL_SECONDS,
      "NX",
    );

    // 2. If not acquired, either wait for in-flight or replay cached response
    if (!acquired) {
      const startTime = Date.now();
      let cachedRaw = await redis.get(redisKey);

      // If in-flight and not expired, poll briefly for completion
      while (cachedRaw && Date.now() - startTime < MAX_WAIT_MS) {
        const stored = JSON.parse(cachedRaw) as StoredIdempotencyRecord;

        // Hash mismatch check immediately
        if (stored.hash !== requestHash) {
          res.status(422).json({
            success: false,
            error: {
              code: ErrorCodes.IDEMPOTENCY_KEY_MISMATCH,
              message: "Idempotency key reused with different request payload",
              details: [],
            },
          });
          return;
        }

        // If completed, safe response replay
        if (stored.completed) {
          res.setHeader("Idempotent-Replayed", "true");
          res.status(stored.status).json(stored.body);
          return;
        }

        // Still processing: wait briefly
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        cachedRaw = await redis.get(redisKey);
      }

      // Check after wait
      if (cachedRaw) {
        const stored = JSON.parse(cachedRaw) as StoredIdempotencyRecord;
        if (stored.hash !== requestHash) {
          res.status(422).json({
            success: false,
            error: {
              code: ErrorCodes.IDEMPOTENCY_KEY_MISMATCH,
              message: "Idempotency key reused with different request payload",
              details: [],
            },
          });
          return;
        }

        if (stored.completed) {
          res.setHeader("Idempotent-Replayed", "true");
          res.status(stored.status).json(stored.body);
          return;
        }

        // Still in-flight after wait timeout: return 409 Conflict with Retry-After header
        res.setHeader("Retry-After", "1");
        res.status(409).json({
          success: false,
          error: {
            code: ErrorCodes.IDEMPOTENCY_CONFLICT,
            message: "Concurrent request in flight with this idempotency key. Please retry shortly.",
            details: [],
          },
        });
        return;
      }

      // If cachedRaw expired (abandoned claim), re-attempt atomic claim
      acquired = await redis.set(
        redisKey,
        claimValue,
        "EX",
        IN_FLIGHT_LOCK_TTL_SECONDS,
        "NX",
      );

      if (!acquired) {
        res.setHeader("Retry-After", "1");
        res.status(409).json({
          success: false,
          error: {
            code: ErrorCodes.IDEMPOTENCY_CONFLICT,
            message: "Concurrent request in flight with this idempotency key. Please retry shortly.",
            details: [],
          },
        });
        return;
      }
    }

    renewalTimer = setInterval(() => {
      redis
        .eval(
          RENEW_CLAIM_SCRIPT,
          1,
          redisKey,
          claimValue,
          IN_FLIGHT_LOCK_TTL_SECONDS,
        )
        .then((renewed) => {
          if (Number(renewed) !== 1) stopRenewal();
        })
        .catch((err) => {
          logger.error({ err }, "Failed to renew idempotency claim");
        });
    }, LOCK_RENEW_INTERVAL_MS);
    renewalTimer.unref();

    // 3. We acquired the claim: intercept response
    let responded = false;
    const originalJson = res.json.bind(res);

    res.json = (body: unknown) => {
      if (responded) return originalJson(body);
      responded = true;

      const statusCode = res.statusCode;
      if (statusCode >= 500) {
        redis
          .eval(RELEASE_CLAIM_SCRIPT, 1, redisKey, claimValue)
          .catch((err) => logger.error({ err }, "Failed to release idempotency claim on 5xx error"))
          .finally(stopRenewal);
      } else {
        const finalRecord: StoredIdempotencyRecord = {
          status: statusCode,
          body,
          hash: requestHash,
          completed: true,
        };
        redis
          .eval(
            COMPLETE_CLAIM_SCRIPT,
            1,
            redisKey,
            claimValue,
            JSON.stringify(finalRecord),
            TTL_SECONDS,
          )
          .then((completed) => {
            if (Number(completed) !== 1) {
              logger.error("Idempotency claim ownership lost before response caching");
            }
          })
          .catch((err) =>
            logger.error({ err }, "Failed to persist completed idempotency response to Redis"),
          )
          .finally(stopRenewal);
      }

      return originalJson(body);
    };

    // Recover if connection is aborted before response completes.
    // Check `responded` after a tick so the close handler sees the flag
    // set by res.json even if close fires synchronously during the call.
    res.on("close", () => {
      setImmediate(() => {
        if (!responded) {
          stopRenewal();
          redis
            .eval(RELEASE_CLAIM_SCRIPT, 1, redisKey, claimValue)
            .catch((err) =>
              logger.error({ err }, "Failed to release abandoned idempotency lock on aborted connection"),
            );
        }
      });
    });
  } catch (err) {
    logger.error({ err }, "Idempotency middleware Redis error — returning 503");
    res.status(503).json({
      success: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Service temporarily unavailable. Please retry your request.",
        details: [],
      },
    });
    return;
  }

  next();
}
