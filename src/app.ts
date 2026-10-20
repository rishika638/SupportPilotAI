import express, { Express, Request, Response } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env, isProduction } from "./config/env";
import {
  checkDatabaseHealth,
  disconnectDatabase,
} from "./infrastructure/database/prisma.client";
import { logger } from "./infrastructure/logger/pino.logger";
import {
  checkRedisHealth,
  disconnectRedis,
} from "./infrastructure/redis/redis.client";
import {
  metricsMiddleware,
  metricsService,
} from "./infrastructure/metrics/metrics.service";
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
  app.set("trust proxy", env.TRUST_PROXY_HOPS ?? 0);
  app.use(helmet());

  const allowedOrigins = [
    ...(!isProduction ? ["http://localhost:5173", "http://localhost:4173"] : []),
    ...(env.FRONTEND_URL ? [env.FRONTEND_URL] : []),
  ];
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) res.vary("Origin");
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Idempotency-Key");
      res.setHeader("Access-Control-Expose-Headers", "X-Request-Id,Idempotent-Replayed");
    }
    if (req.method === "OPTIONS") { res.sendStatus(204); return; }
    next();
  });

  app.use(express.json({ limit: "1mb" }));
  app.use(requestIdMiddleware);
  app.use(metricsMiddleware);
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

  app.get("/metrics", async (req: Request, res: Response) => {
    const metricsToken = env.METRICS_TOKEN;

    if (!metricsToken && isProduction) {
      res.status(503).json({
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Metrics endpoint not configured" },
      });
      return;
    }

    if (metricsToken) {
      const authHeader = req.header("authorization") ?? "";
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

      if (bearer !== metricsToken) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Invalid or missing metrics token" },
        });
        return;
      }
    }

    const output = await metricsService.generatePrometheusOutput();
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.status(200).send(output);
  });

  app.use("/api/v1", apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandlerMiddleware);

  return app;
}

export async function shutdownApp(): Promise<void> {
  await Promise.allSettled([disconnectDatabase(), disconnectRedis()]);
}
