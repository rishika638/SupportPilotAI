import express, { Express, Request, Response } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import {
  checkDatabaseHealth,
  disconnectDatabase,
} from "./infrastructure/database/prisma.client";
import { logger } from "./infrastructure/logger/pino.logger";
import {
  checkRedisHealth,
  disconnectRedis,
} from "./infrastructure/redis/redis.client";
import { apiV1Router } from "./routes/api-v1.routes";
import {
  errorHandlerMiddleware,
  notFoundHandler,
} from "./shared/middleware/error-handler.middleware";
import { requestIdMiddleware } from "./shared/middleware/request-id.middleware";
import { successResponse } from "./shared/responses/response.builder";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.context.requestId,
      customProps: (req) => ({
        requestId: req.context.requestId,
      }),
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) {
          return "error";
        }

        if (res.statusCode >= 400) {
          return "warn";
        }

        return "info";
      },
    }),
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json(
      successResponse({
        status: "ok",
      }),
    );
  });

  app.get("/ready", async (_req: Request, res: Response) => {
    const [databaseHealthy, redisHealthy] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    const ready = databaseHealthy && redisHealthy;

    res.status(ready ? 200 : 503).json(
      successResponse({
        status: ready ? "ready" : "not_ready",
        checks: {
          database: databaseHealthy ? "up" : "down",
          redis: redisHealthy ? "up" : "down",
        },
      }),
    );
  });

  app.use("/api/v1", apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandlerMiddleware);

  return app;
}

export async function shutdownApp(): Promise<void> {
  await Promise.allSettled([disconnectDatabase(), disconnectRedis()]);
}
